import os
import uuid
import httpx
import asyncio
import zoneinfo
from datetime import datetime, timedelta
from pathlib import Path
from typing import TypedDict, List, Optional, Literal, Dict
from pydantic import BaseModel, Field
from fastapi import FastAPI, HTTPException, Depends, Header, Response, BackgroundTasks
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command
import google.generativeai as genai
from supabase import create_client, Client
from groq import AsyncGroq
import random
import json
from apscheduler.schedulers.asyncio import AsyncIOScheduler

# Explicit SDK integrations for Supermemory and safe fallback
try:
    from supermemory import Supermemory
except ImportError:
    Supermemory = None

try:
    from supermemory import supermemory
except ImportError:
    supermemory = None

# Configure Supermemory SDK client
supermemory_api_key = os.getenv("SUPERMEMORY_API_KEY", "")
supermemory_client = None
if supermemory_api_key:
    try:
        if Supermemory is not None:
            supermemory_client = Supermemory(api_key=supermemory_api_key)
        elif supermemory is not None:
            supermemory_client = supermemory(api_key=supermemory_api_key)
        
        if supermemory_client:
            print("🚀 Supermemory SDK client loaded successfully layer.")
        else:
            # Fallback inline load just in case
            from supermemory import Supermemory
            supermemory_client = Supermemory(api_key=supermemory_api_key)
            print("🚀 Supermemory SDK client loaded successfully via fallback.")
    except Exception as e:
        print(f"⚠️ Failed to load Supermemory SDK client: {e}")
else:
    print("ℹ️ SUPERMEMORY_API_KEY is not configured. Falling back to HTTP requests.")

# Define absolute paths dynamically
BASE_DIR = Path(__file__).resolve().parent
DIST_DIR = BASE_DIR / "dist"

# Configure Gemini AI SDK
genai.configure(api_key=os.getenv("GEMINI_API_KEY", "YOUR_GEMINI_API_KEY"))

# Configure Groq SDK
groq_api_key = os.getenv("GROQ_API_KEY", "")
groq_client = None
if groq_api_key:
    try:
        groq_client = AsyncGroq(api_key=groq_api_key)
        print("🚀 Groq client successfully initialized.")
    except Exception as e:
        print(f"⚠️ Failed to startup Groq client: {e}")
else:
    print("ℹ️ GROQ_API_KEY not configured. Falling back to Gemini.")

# -------------------------------------------------------------
# STEP 1: Datamodels & StylistState
# -------------------------------------------------------------

# The 4-Phase State Machine State
class StylistState(TypedDict):
    user_id: str
    user_status: str       # "STATE_1_NEW" | "STATE_2_ONBOARDING" | "STATE_3_PAYWALL" | "STATE_4_PREMIUM"
    onboarding_step: int   # 0 to 10
    messages: List[dict]   # [{"role": "user"|"assistant", "content": "..."}]
    message_count: int
    intent_route: Optional[str]
    super_rag_context: Optional[str]
    user_memory_context: Optional[str]
    is_image: Optional[bool]

class ScheduledEvent(BaseModel):
    trigger_at_utc: str = Field(description="ISO string of the time Cliona should double-text the user. Set this strictly to 1 hour BEFORE the actual event occurs. Do not use placeholder values or 'None'.")
    event_context: str = Field(description="Brief summary of the event (e.g., 'Dressy date at Dorsia')")
    notification_title: str = Field(description="A punchy 2-to-3 word lockscreen notification header (e.g., 'dorsia fit check')")
    pre_generated_message: str = Field(description="The proactive message Cliona will double-text into the chat when the timer hits.")

class ClionaDualOutput(BaseModel):
    frontend_reply: str = Field(description="Cliona's chat response. CRITICAL RULE: If the user mentions an upcoming event, date, or hangout, but DOES NOT provide the exact day/time, this reply MUST end with you enthusiastically asking them for the date and time. Do not skip this.")
    scheduled_event: Optional[ScheduledEvent] = Field(default=None, description="Populate this ONLY if you already know the exact date and time of the event. If the time is unknown, leave this entirely null.")

class UserChatPayload(BaseModel):
    user_id: str
    message: str
    history: Optional[List[dict]] = None
    image_data: Optional[str] = None
    session_id: Optional[str] = None
    user_timezone: Optional[str] = "Asia/Kolkata"
    current_time_iso: Optional[str] = None

class AdminUpdateProfilePayload(BaseModel):
    user_id: str
    plan: str
    user_status: Optional[str] = None
    is_premium: Optional[bool] = None

class MessageSchema(BaseModel):
    id: str
    role: str
    content: str
    timestamp: Optional[str] = None

class BatchSyncPayload(BaseModel):
    user_id: str
    messages: List[MessageSchema]

class DynamicMemoryItem(BaseModel):
    id: str
    fact: str
    category: str
    importance: int = Field(..., ge=1, le=10)
    created_at: str

class ClionaMemory(BaseModel):
    vibe_label: str = "cozy streetwear"
    hard_nos: List[str] = Field(default_factory=list)

# Initialize Supabase client with admin privileges
SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL") or ""
# Specifically retrieve the SUPABASE_SERVICE_ROLE_KEY for database sync
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("VITE_SUPABASE_SERVICE_ROLE_KEY") or ""

supabase: Optional[Client] = None
if SUPABASE_URL and SUPABASE_KEY:
    try:
        # WARNING: This Supabase client uses the Service Role Key. It has admin privileges and BYPASSES all Row Level Security (RLS) policies. Never expose this to the frontend.
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("🚀 Admin Supabase Client successfully initialized.")
    except Exception as e:
        print(f"⚠️ Failed to startup Supabase Client: {e}")
else:
    print("ℹ️ Supabase environment variables not fully configured. Falling back to local offline operations.")

# -------------------------------------------------------------
# STEP 2: Supermemory (RAG) Helpers & Strategic Gating
# -------------------------------------------------------------
SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY", "")
SUPERMEMORY_BASE_URL = "https://api.supermemory.ai"

def is_fashion_or_glowup_query(q: str) -> bool:
    if not q:
        return False
    text = q.lower()
    keywords = [
        "fashion", "style", "stylist", "glow up", "glow-up", "glowup", "outfit", "wardrobe",
        "hair", "skin", "routine", "aesthetic", "jacket", "shoes", "color", "vibe", "silhouette",
        "proportion", "cut", "oversized", "palette", "look", "jean", "suit", "groom", "dress",
        "shirt", "coat", "sneaker", "clothing", "attire", "wear", "fit", "drip", "rizz"
    ]
    return any(kw in text for kw in keywords)

def should_query_user_memory(q: str, user_id: str) -> bool:
    if not q:
        return False
    text = q.lower()
    
    # 1. Explicit triggers where user is directly asking about their remembered details
    explicit_keys = [
        "remember", "recall", "forget", "my style", "my preference", "previous", "earlier",
        "who am i", "my vibe", "my size", "last time", "we talked", "about me", "my profile",
        "my armor", "my red flag", "my morning", "my aesthetic"
    ]
    if any(k in text for k in explicit_keys):
        print("🔍 User memory needed: Explicit trigger detected!")
        return True
    
    # 2. 10 to 20 percent of other cases (we'll use a clean 15% random chance selection)
    chance = random.random() < 0.15
    if chance:
        print("🎲 User memory needed: Selected in the 10-20% random context query window!")
    return chance

async def query_supermemory_rag(q: str, user_id: str) -> str:
    # Use Supermemory Python SDK if loaded
    if supermemory_client:
        try:
            print(f"🧠 SDK Query: Pulling user_{user_id} profile using Supermemory client")
            profile_data = supermemory_client.profile(container_tag=f"user_{user_id}", q=q)
            static_facts = profile_data.profile.static if hasattr(profile_data, "profile") and hasattr(profile_data.profile, "static") else []
            dynamic_facts = profile_data.profile.dynamic if hasattr(profile_data, "profile") and hasattr(profile_data.profile, "dynamic") else []
            searchResults = profile_data.searchResults.results if hasattr(profile_data, "searchResults") and hasattr(profile_data.searchResults, "results") else []
            context = f"Static profile: {', '.join(static_facts)}\nDynamic profile: {', '.join(dynamic_facts)}"
            if searchResults:
                context += f"\nMemories: " + " ".join([getattr(r, "memory", "") or r.get("memory", "") for r in searchResults])
            return context
        except Exception as e:
            print(f"SDK user query failed, falling back to REST: {e}")

    # Fallback REST API
    if not SUPERMEMORY_API_KEY:
        return (
            "Styling theory background: Contrast is key. high-contrast bone structures look amazing "
            "with structured silhouettes (oversized boxy lines or neat cropped coordinates). "
            "Cool skin undertones look exceptional in deep teals, slate, steel gray, and cool slate tones."
        )
    headers = {"x-supermemory-api-key": SUPERMEMORY_API_KEY}
    try:
        async with httpx.AsyncClient() as client:
            profile_response = await client.post(
                f"{SUPERMEMORY_BASE_URL}/v4/profile",
                headers=headers,
                json={"containerTag": f"user_{user_id}", "q": q},
                timeout=5.0
            )
            profile_data = profile_response.json() if profile_response.status_code == 200 else {}
            static_facts = profile_data.get("profile", {}).get("static", [])
            dynamic_facts = profile_data.get("profile", {}).get("dynamic", [])
            searchResults = profile_data.get("searchResults", {}).get("results", [])
            context = f"Static profile: {', '.join(static_facts)}\nDynamic profile: {', '.join(dynamic_facts)}"
            if searchResults:
                context += f"\nMemories: " + " ".join([r.get("memory", "") for r in searchResults])
            return context
    except Exception as e:
        print(f"Error querying Supermemory: {e}")
        return "Note: Fall back to local styling corpus."

async def add_memory_to_vault(content: str, user_id: str):
    # Enforce Supermemory bypass for core/free plans
    if supabase:
        try:
            profile_res = supabase.table("profiles").select("plan").eq("id", user_id).execute()
            if profile_res.data:
                user_plan = (profile_res.data[0].get("plan") or "free").lower().strip()
                if user_plan in ["core", "free"]:
                    print(f"🔒 [Bypass add_memory_to_vault] Skipping Supermemory write as plan is: {user_plan}")
                    return
        except Exception as e:
            print(f"Could not check user plan in add_memory_to_vault: {e}")

    # Use Supermemory Python SDK if loaded
    if supermemory_client:
        try:
            print(f"💾 SDK Memory Write: Appending trace to 'user_{user_id}' with Supermemory client")
            supermemory_client.add(content=content, container_tag=f"user_{user_id}")
            return
        except Exception as e:
            print(f"SDK document write failed, falling back to REST: {e}")

    # Fallback REST API
    if not SUPERMEMORY_API_KEY:
        return
    headers = {"x-supermemory-api-key": SUPERMEMORY_API_KEY}
    try:
        async with httpx.AsyncClient() as client:
            await client.post(
                f"{SUPERMEMORY_BASE_URL}/v3/documents",
                headers=headers,
                json={"content": content, "containerTag": f"user_{user_id}"},
                timeout=5.0
            )
    except Exception as e:
        print(f"Failed to append to user supermemory vault: {e}")

# -------------------------------------------------------------
# DYNAMIC TOKEN BUDGET DEFENSE & MULTI-MODEL ROUTING
# -------------------------------------------------------------

def estimate_tokens(text: str) -> int:
    """
    Approximated conservative estimation of token usage.
    Ensures safe operations without requiring heavy third-party tokenizer packages.
    """
    if not text:
        return 0
    char_estimate = len(text) // 3
    word_estimate = int(len(text.split()) * 1.35)
    return max(char_estimate, word_estimate, 1)

def limit_to_token_budget(
    role_instruction: str,
    history: List[dict],
    super_rag: str,
    user_mem: str,
    target_budget: int = 7500
) -> tuple[List[dict], str, str]:
    """
    Dynamically trims context and conversation history
    so the entire input block is under 8000 tokens (target of 7500 to be secure).
    """
    fixed_tokens = estimate_tokens(role_instruction)
    
    current_super_rag = super_rag or ""
    current_user_mem = user_mem or ""
    current_history = list(history)
    
    # Prune sequentially until under budget
    for iteration in range(25):
        history_text = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in current_history])
        contexts_text = ""
        if current_super_rag:
            contexts_text += f"\n[Global Styling Rules]:\n{current_super_rag}"
        if current_user_mem:
            contexts_text += f"\n[User Stored Memories]:\n{current_user_mem}"
            
        total_tokens = fixed_tokens + estimate_tokens(history_text) + estimate_tokens(contexts_text)
        
        if total_tokens <= target_budget:
            break
            
        # 1. Truncate dynamic contexts if they are excessively large
        if len(current_super_rag) > 150 or len(current_user_mem) > 150:
            current_super_rag = current_super_rag[:int(len(current_super_rag) * 0.8)]
            current_user_mem = current_user_mem[:int(len(current_user_mem) * 0.8)]
        # 2. Trim chat history messages from oldest if RAG is already tiny
        elif len(current_history) > 1:
            current_history.pop(0)
        # 3. Last resort: truncate the single remaining message content
        elif current_history:
            msg = current_history[0]
            content = msg.get("content", "")
            if len(content) > 30:
                msg["content"] = content[:int(len(content) * 0.75)]
            else:
                break
        else:
            break
            
    return current_history, current_super_rag, current_user_mem

async def call_text_llm(
    prompt: str,
    system_instruction: str,
    temperature: float = 0.7
) -> str:
    """
    Performs single-turn text inference. Uses Groq for all text-only queries,
    falling back to Gemini 3.1 Flash Lite if key is missing or calls fail.
    """
    if groq_client:
        try:
            print("[LLM Router - Single Turn]: Activating Groq (llama-3.3-70b-versatile)")
            response = await groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": system_instruction},
                    {"role": "user", "content": prompt}
                ],
                temperature=temperature,
                max_tokens=400
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"⚠️ Groq single-turn inference failed: {e}. Falling back to Gemini.")

    # Standard Gemini fallback
    print("[LLM Router - Single Turn]: Activating Gemini fallback")
    model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
    response = model.generate_content(
        contents=prompt,
        generation_config={"system_instruction": system_instruction, "temperature": temperature}
    )
    return response.text.strip()

async def call_structured_dual_llm(
    prompt: str,
    system_instruction: str,
    user_timezone: str,
    current_time_iso: str
) -> ClionaDualOutput:
    """
    Invokes the LLM (Groq or Gemini) forcing the JSON matrix of ClionaDualOutput.
    """
    schema_schema = {
        "frontend_reply": "Cliona's immediate, high-energy conversational text response to return to the user. Always keep this response deeply engaged and satisfying, between 120 and 400 words. Speak in natural GenZ vernacular.",
        "scheduled_event": {
            "trigger_at_utc": "ISO string of the time Cliona should double-text the user. Set this strictly to 1 hour BEFORE the actual event occurs.",
            "event_context": "Brief summary of the event (e.g., 'Dressy date at Dorsia')",
            "notification_title": "A punchy 2-to-3 word lockscreen notification header (e.g., 'dorsia fit check')",
            "pre_generated_message": "The proactive message Cliona will double-text into the chat when the timer hits."
        }
    }
    
    enhanced_system_instruction = (
        f"{system_instruction}\n\n"
        f"CRITICAL COMPLIANCE RULES:\n"
        f"1. You MUST respond ONLY with a valid JSON object matching the schema below. No markdown backticks (such as ```json) or leading/trailing text.\n"
        f"2. Your frontend_reply MUST adhere strictly to the 120-to-400 words guidelines unless it's impossible. Use deep and structured sentences.\n"
        f"3. If the user mentions an upcoming event but does NOT provide a specific day or time, you MUST NOT output a scheduled_event object (keep it null or omit it entirely). Instead, use your frontend_reply to enthusiastically ask the user for the exact date and time. ONLY populate the scheduled_event object when you have enough information to calculate the trigger_at_utc. Ensure trigger_at_utc is dynamic and calculated strictly as 1 hour before the event starts (in UTC time) based on user_timezone={user_timezone} and current_time_iso={current_time_iso}.\n\n"
        f"JSON Schema:\n"
        f"{json.dumps(schema_schema, indent=2)}\n"
    )

    # 1. Try Groq first if available
    if groq_client:
        try:
            print("[LLM Router - Dual Output]: Requesting Groq (llama-3.3-70b-versatile)")
            response = await groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": enhanced_system_instruction},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.74,
                response_format={"type": "json_object"}
            )
            raw_text = response.choices[0].message.content.strip()
            print(f"[Groq Dual Output Raw]: {raw_text}")
            parsed = json.loads(raw_text)
            
            scheduled_data = parsed.get("scheduled_event")
            scheduled = None
            if scheduled_data and isinstance(scheduled_data, dict):
                scheduled = ScheduledEvent(
                    trigger_at_utc=str(scheduled_data.get("trigger_at_utc", "")),
                    event_context=str(scheduled_data.get("event_context", "")),
                    notification_title=str(scheduled_data.get("notification_title", "")),
                    pre_generated_message=str(scheduled_data.get("pre_generated_message", ""))
                )
                
            return ClionaDualOutput(
                frontend_reply=str(parsed.get("frontend_reply", "")),
                scheduled_event=scheduled
            )
        except Exception as e:
            print(f"⚠️ Groq structured dual output failed: {e}. Falling back to Gemini.")

    # 2. Try Gemini fallback/primary
    print("[LLM Router - Dual Output]: Requesting Gemini (gemini-3.5-flash) with response schema")
    model = genai.GenerativeModel('gemini-3.5-flash')
    try:
        response = model.generate_content(
            contents=prompt,
            generation_config={
                "system_instruction": enhanced_system_instruction,
                "temperature": 0.74,
                "response_mime_type": "application/json",
                "response_schema": ClionaDualOutput
            }
        )
        raw_text = response.text.replace("```json", "").replace("```", "").strip()
        print(f"[Gemini Dual Output Raw]: {raw_text}")
        parsed = json.loads(raw_text)
        scheduled_data = parsed.get("scheduled_event")
        scheduled = None
        if scheduled_data and isinstance(scheduled_data, dict):
            scheduled = ScheduledEvent(
                trigger_at_utc=str(scheduled_data.get("trigger_at_utc", "")),
                event_context=str(scheduled_data.get("event_context", "")),
                notification_title=str(scheduled_data.get("notification_title", "")),
                pre_generated_message=str(scheduled_data.get("pre_generated_message", ""))
            )
            
        return ClionaDualOutput(
            frontend_reply=str(parsed.get("frontend_reply", "")),
            scheduled_event=scheduled
        )
    except Exception as Gemini_err:
        print(f"⚠️ Gemini schema-bound generation failed: {Gemini_err}. Retrying without schema constraint.")
        try:
            response = model.generate_content(
                contents=prompt,
                generation_config={
                    "system_instruction": enhanced_system_instruction,
                    "temperature": 0.74,
                    "response_mime_type": "application/json"
                }
            )
            raw_text = response.text.replace("```json", "").replace("```", "").strip()
            print(f"[Gemini Dual Output Fallback Raw]: {raw_text}")
            parsed = json.loads(raw_text)
            scheduled_data = parsed.get("scheduled_event")
            scheduled = None
            if scheduled_data and isinstance(scheduled_data, dict):
                scheduled = ScheduledEvent(
                    trigger_at_utc=str(scheduled_data.get("trigger_at_utc", "")),
                    event_context=str(scheduled_data.get("event_context", "")),
                    notification_title=str(scheduled_data.get("notification_title", "")),
                    pre_generated_message=str(scheduled_data.get("pre_generated_message", ""))
                )
                
            return ClionaDualOutput(
                frontend_reply=str(parsed.get("frontend_reply", "")),
                scheduled_event=scheduled
            )
        except Exception as fallback_err:
            print(f"⚠️ Flat fallback LLM call used as final failsafe: {fallback_err}")
            return ClionaDualOutput(
                frontend_reply="bestie i literally love that fit plan so much! tell me more about what layers we are locking onto today.",
                scheduled_event=None
            )

async def call_conversational_llm(
    sliced_messages: List[dict],
    system_instruction: str,
    is_image: bool = False
) -> str:
    """
    Performs conversational chat generation.
    Checks is_image: uses Gemini for image tasks, Groq for text-only.
    """
    # 1. Groq Path
    if not is_image and groq_client:
        try:
            print("[LLM Router - Conversational]: Activating Groq (llama-3.3-70b-versatile) for text.")
            groq_messages = [{"role": "system", "content": system_instruction}]
            for m in sliced_messages:
                role = "user" if m.get("role") == "user" else "assistant"
                groq_messages.append({"role": role, "content": m.get("content", "")})
                
            response = await groq_client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=groq_messages,
                temperature=0.72,
                max_tokens=650
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            print(f"⚠️ Groq conversational chat failed: {e}. Falling back to Gemini.")

    # 2. Gemini Path
    print("[LLM Router - Conversational]: Activating Gemini-3.1-flash-lite-preview")
    gemini_contents = []
    for m in sliced_messages:
        role = "user" if m.get("role") == "user" else "model"
        gemini_contents.append({"role": role, "parts": [{"text": m.get("content", "")}]})
        
    model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
    response = model.generate_content(
        contents=gemini_contents,
        generation_config={"system_instruction": system_instruction}
    )
    return response.text.strip()

def is_image_query(payload_msg: str, payload_image_data: Optional[str] = None, messages_history: Optional[List[dict]] = None) -> bool:
    """
    Check if the user interaction includes any image visual triggers
    """
    if payload_image_data:
        return True
    
    msg_str = payload_msg or ""
    if "data:image/" in msg_str or "data:application/octet-stream" in msg_str:
        return True
    if msg_str.strip().startswith("http") and any(ext in msg_str.lower() for ext in [".jpg", ".jpeg", ".png", ".webp", ".gif"]):
        return True
    
    if messages_history:
        for m in messages_history:
            content = m.get("content", "")
            if "data:image/" in content:
                return True
    return False

# -------------------------------------------------------------
# STEP 3: Optimized LangGraph Node Helpers & Router
# -------------------------------------------------------------

async def get_super_rag_general_knowledge(q: str) -> str:
    # Trigger SuperRAG only when there is a fashion or glow-up technical related talk
    if not is_fashion_or_glowup_query(q):
        print("ℹ️ Skipping general knowledge SuperRAG (not a fashion or glow-up talk).")
        return ""

    print("✨ Fashion/Glow-up query detected! Querying SuperRAG general knowledge...")
    
    # Use Supermemory client if instantiated
    if supermemory_client:
        try:
            print("🧠 SDK Query: Pulling global styling knowledge from SuperRAG.")
            profile_data = supermemory_client.profile(container_tag="global_knowledge", q=q)
            static_facts = profile_data.profile.static if hasattr(profile_data, "profile") and hasattr(profile_data.profile, "static") else []
            searchResults = profile_data.searchResults.results if hasattr(profile_data, "searchResults") and hasattr(profile_data.searchResults, "results") else []
            context = f"Global style facts: {', '.join(static_facts)}"
            if searchResults:
                context += " " + " ".join([getattr(r, "memory", "") or r.get("memory", "") for r in searchResults])
            return context
        except Exception as e:
            print(f"SDK global query failed, falling back to REST: {e}")

    # Fallback REST API
    if not SUPERMEMORY_API_KEY:
        return (
            "Static styling theory guidelines: Contrast is key. High-contrast structures vibe incredibly "
            "with structured silhouettes (boxy shoulders, custom tailored cuts, cropped heights). "
            "Safe neutrals align seamlessly for minimalistic under-layer fits. Dark slate highlights bone structure."
        )
    headers = {"x-supermemory-api-key": SUPERMEMORY_API_KEY}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SUPERMEMORY_BASE_URL}/v4/profile",
                headers=headers,
                json={"containerTag": "global_knowledge", "q": q},
                timeout=5.0
            )
            profile_data = response.json() if response.status_code == 200 else {}
            static_facts = profile_data.get("profile", {}).get("static", [])
            searchResults = profile_data.get("searchResults", {}).get("results", [])
            context = f"Global style facts: {', '.join(static_facts)}"
            if searchResults:
                context += " " + " ".join([r.get("memory", "") for r in searchResults])
            return context
    except Exception as e:
        print(f"Error querying Global SuperRAG: {e}")
        return "Local styling theory: Structure matches definition."

async def get_user_memory_context(q: str, user_id: str) -> str:
    # Use user data not every time, but 10 to 20 percent of the time when needed
    if not should_query_user_memory(q, user_id):
        print("ℹ️ Skipping user memory context lookup for this interaction.")
        return ""

    print(f"🧠 Querying User Memory Context for user_{user_id}...")

    # Use Supermemory client if instantiated
    if supermemory_client:
        try:
            print(f"🧠 SDK Query: Retrieving user memories from user_{user_id} slice.")
            profile_data = supermemory_client.profile(container_tag=f"user_{user_id}", q=q)
            dynamic_facts = profile_data.profile.dynamic if hasattr(profile_data, "profile") and hasattr(profile_data.profile, "dynamic") else []
            searchResults = profile_data.searchResults.results if hasattr(profile_data, "searchResults") and hasattr(profile_data.searchResults, "results") else []
            context = f"User memories: {', '.join(dynamic_facts)}"
            if searchResults:
                context += " " + " ".join([getattr(r, "memory", "") or r.get("memory", "") for r in searchResults])
            return context
        except Exception as e:
            print(f"SDK user memory query failed, falling back to REST: {e}")

    # Fallback REST API
    if not SUPERMEMORY_API_KEY:
        return "User styling history cache: Preferences center on high-contrast tailored fits with safe neutrals."
    headers = {"x-supermemory-api-key": SUPERMEMORY_API_KEY}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SUPERMEMORY_BASE_URL}/v4/profile",
                headers=headers,
                json={"containerTag": f"user_{user_id}", "q": q},
                timeout=5.0
            )
            profile_data = response.json() if response.status_code == 200 else {}
            dynamic_facts = profile_data.get("profile", {}).get("dynamic", [])
            searchResults = profile_data.get("searchResults", {}).get("results", [])
            context = f"User memories: {', '.join(dynamic_facts)}"
            if searchResults:
                context += " " + " ".join([r.get("memory", "") for r in searchResults])
            return context
    except Exception as e:
        print(f"Error querying User Memory Vault: {e}")
        return ""


async def router_node(state: StylistState) -> dict:
    messages = state["messages"]
    if not messages:
        return {"intent_route": "chit_chat", "super_rag_context": "", "user_memory_context": ""}
        
    latest_user_message = messages[-1]["content"]
    
    system_instruction = (
        "You are an intent routing model for Cliona, a personalized hype and bestie chat app.\n"
        "Analyze the latest user message and return EXACTLY one of these four tags:\n"
        "- 'chit_chat': For off-topic chat, banter, yapping, greetings, or quick reactions.\n"
        "- 'general_knowledge': For generic styling questions, trends, color pairing, sizing, or general aesthetic guidelines.\n"
        "- 'personal_context': For queries targeting their specific previous answers, stored fits, personal habits, or profile memory.\n"
        "- 'complex_query': If the message demands both general styling expertise and specific user profile memories.\n"
        "Return ONLY the tag name in plain lower-case format. Do not use quotes, explanations, or punctuation."
    )
    
    try:
        reply_raw = await call_text_llm(
            prompt=f"User message: {latest_user_message}",
            system_instruction=system_instruction,
            temperature=0.0
        )
        tag = reply_raw.strip().lower().replace("'", "").replace('"', "")
        if tag not in ["chit_chat", "general_knowledge", "personal_context", "complex_query"]:
            tag = "chit_chat"
    except Exception as err:
        print(f"Router node execution failed, defaulting to chit_chat: {err}")
        tag = "chit_chat"
        
    print(f"[LangGraph Router Decision]: latest user input routed to -> '{tag}'")
    return {"intent_route": tag, "super_rag_context": "", "user_memory_context": ""}

async def super_rag_node(state: StylistState) -> dict:
    latest_user_message = state["messages"][-1]["content"] if state["messages"] else ""
    context = await get_super_rag_general_knowledge(latest_user_message)
    return {"super_rag_context": context}

async def user_memory_node(state: StylistState) -> dict:
    latest_user_message = state["messages"][-1]["content"] if state["messages"] else ""
    context = await get_user_memory_context(latest_user_message, state["user_id"])
    return {"user_memory_context": context}

async def generation_node(state: StylistState) -> dict:
    """
    Conversational Generation Node (Premium chatbot). Consolidates the sliding window profile
    along with retrieved SuperRAG & User Memory contexts.
    Applies dynamic token count gating to stay safely under 8000 tokens.
    """
    messages = state["messages"]
    
    # Apply standard sliding context limit: up to last 6 messages
    sliced_messages = messages[-6:]
    
    super_rag_context = state.get("super_rag_context") or ""
    user_memory_context = state.get("user_memory_context") or ""
    
    role_instruction = (
        "You are Tokyo, an ultra-positive, hyper-perceptive, and highly empathetic digital best friend/stylist.\n"
        "Your priority is to chat with the user in deep, supportive, positive texting-style lengths.\n"
        "Listen to their fashion dilemmas, life updates, validate them, and provide premium recommendations.\n"
        "Use Gen Z slang ('rizz', 'cooked', 'situationship', 'no cap', 'real', 'mood', 'slay') where it adds flair.\n"
    )
    
    # Prune context and messages list with the defensive token budgeting helper!
    trimmed_messages, clean_super_rag, clean_user_mem = limit_to_token_budget(
        role_instruction=role_instruction,
        history=sliced_messages,
        super_rag=super_rag_context,
        user_mem=user_memory_context,
        target_budget=7500
    )
    
    retrieved_hints = []
    if clean_super_rag:
        retrieved_hints.append(f"[Global Styling Rules]:\n{clean_super_rag}")
    if clean_user_mem:
        retrieved_hints.append(f"[User Stored Memories]:\n{clean_user_mem}")
        
    context_bulletin = "\n".join(retrieved_hints)
    
    system_instruction = role_instruction
    if context_bulletin:
        system_instruction += f"\nUse these retrieved context facts if applicable to enrich your perspective:\n{context_bulletin}"
        
    try:
        is_img = state.get("is_image", False)
        reply = await call_conversational_llm(
            sliced_messages=trimmed_messages,
            system_instruction=system_instruction,
            is_image=is_img
        )
    except Exception as e:
        print(f"Generation node failed: {e}")
        reply = "Bestie, I literally love that styling plan. Tell me more about what we are locked onto!"
        
    # Limit response to 180 words strictly
    words = reply.split()
    if len(words) > 180:
        reply = " ".join(words[:180]) + "..."

    new_messages = list(messages) + [{"role": "assistant", "content": reply}]
    return {
        "messages": new_messages,
        "message_count": state["message_count"] + 1
    }

# -------------------------------------------------------------
# STEP 4: Compile LangGraph Flow
# -------------------------------------------------------------

def compile_heist_conversational_graph():
    workflow = StateGraph(StylistState)
    
    # Add nodes
    workflow.add_node("router_node", router_node)
    workflow.add_node("super_rag_node", super_rag_node)
    workflow.add_node("user_memory_node", user_memory_node)
    workflow.add_node("generation_node", generation_node)
    
    # Setup routing from router_node
    def route_intent(state: StylistState) -> List[str] | str:
        route = state.get("intent_route", "chit_chat")
        if route == "complex_query":
            return ["super_rag_node", "user_memory_node"]
        elif route == "general_knowledge":
            return ["super_rag_node"]
        elif route == "personal_context":
            return ["user_memory_node"]
        else:
            return ["generation_node"]
            
    # Add transition edges
    workflow.add_edge(START, "router_node")
    
    workflow.add_conditional_edges(
        "router_node",
        route_intent,
        {
            "super_rag_node": "super_rag_node",
            "user_memory_node": "user_memory_node",
            "generation_node": "generation_node"
        }
    )
    
    workflow.add_edge("super_rag_node", "generation_node")
    workflow.add_edge("user_memory_node", "generation_node")
    workflow.add_edge("generation_node", END)
    
    return workflow.compile()

compiled_chat_graph = compile_heist_conversational_graph()

# -------------------------------------------------------------
# STEP 6: FastAPI Server Definition
# -------------------------------------------------------------

app = FastAPI(title="Cliona Assistant Backend", version="4.0")

# Configure CORS Middleware immediately after initializing the app
origins = [
    "https://tokyo.heistfashion.tech",
    "http://localhost:5173",
    "http://localhost:3000",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = os.getenv("DATABASE_URL", "")
db_pool = None
scheduler = None

async def parse_and_schedule_reminder(user_id: str, message_text: str, user_timezone: str):
    """
    Parses a user-mentioned relative time statement into UTC and inserts it 
    into tokyo_scheduled_alerts. Subtracts 1 hour from UTC event time.
    """
    if not message_text or not supabase:
        return

    try:
        # 1. Fetch timezone from profiles (already fetched and passed in but safe fallback too)
        tz_name = user_timezone or "UTC"
        try:
            tz = zoneinfo.ZoneInfo(tz_name)
        except Exception as tz_err:
            print(f"[Scheduled Alerts] Fallback to UTC for user {user_id} due to zoneinfo load error '{tz_name}': {tz_err}")
            tz_name = "UTC"
            tz = zoneinfo.ZoneInfo("UTC")

        # 2. Get local time for user
        user_local_now = datetime.now(tz)
        user_local_now_iso = user_local_now.isoformat()

        # 3. Use fast LLM (Gemini) to parse the relative time and event context
        system_instruction = (
            "You are a highly precise event extraction engine. "
            "Analyze the user's message and determine if they mention any specific upcoming event/schedule/reminder. "
            "If they DO, determine the relative or absolute time mentioned. Parse it into an exact local datetime string (no offset, no Z, e.g. YYYY-MM-DDTHH:MM:SS) "
            "strictly relative to the 'User's Current Local Time' provided.\n\n"
            "Output ONLY a raw JSON object matching this schema:\n"
            "{\n"
            '  "has_event": true | false,\n'
            '  "event_context": "short punchy event description (e.g., \'your date\', \'job interview\', \'meeting with alex\') or null",\n'
            '  "event_local_time": "the exact parsed local datetime in YYYY-MM-DDTHH:MM:SS format or null",\n'
            '  "original_event_time": "the original relative words used by the user or null"\n'
            "}\n"
            "CRITICAL:\n"
            "- If no concrete upcoming event/schedule of the user is mentioned, set has_event to false.\n"
            "- Return ONLY raw JSON, with no markdown code blocks or backticks."
        )

        prompt = (
            f"User's Message: {message_text}\n"
            f"User's Current Local Time: {user_local_now_iso}\n"
            f"User's Timezone: {tz_name}\n"
        )

        model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
        response = model.generate_content(
            contents=prompt,
            generation_config={"system_instruction": system_instruction, "temperature": 0.0}
        )
        raw_text = response.text.strip() if response and response.text else ""

        # Demolish markdown wrapping if any
        if raw_text.startswith("```"):
            lines = raw_text.splitlines()
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
            raw_text = "\n".join(lines).strip()

        if not raw_text:
            return

        try:
            data = json.loads(raw_text)
        except Exception as json_err:
            print(f"[Scheduled Alerts] Failed to parse JSON from LLM: {raw_text}. Error: {json_err}")
            return

        if isinstance(data, dict) and data.get("has_event"):
            event_local_time_str = data.get("event_local_time")
            event_context = data.get("event_context") or "your event"
            original_event_time = data.get("original_event_time") or ""

            if event_local_time_str:
                # 4. Convert localized datetime string into absolute global UTC timestamp
                # String format is YYYY-MM-DDTHH:MM:SS
                local_dt = datetime.fromisoformat(event_local_time_str)
                # Attach timezone info
                localized_dt = local_dt.replace(tzinfo=tz)
                # Convert to UTC
                utc_dt = localized_dt.astimezone(zoneinfo.ZoneInfo("UTC"))

                # 5. Calculate proactive trigger_at by subtracting exactly 1 hour from UTC event time
                trigger_at = utc_dt - timedelta(hours=1)

                # 6. Insert record into cliona_scheduled_alerts
                print(f"[Scheduled Alerts] Inserting alert row: user={user_id}, event='{event_context}', original_event_time='{original_event_time}', trigger_at={trigger_at.isoformat()}")
                
                # Check current UTC time
                utc_now = datetime.now(zoneinfo.ZoneInfo("UTC"))
                if trigger_at <= utc_now:
                    print(f"[Scheduled Alerts] Calculated trigger_at ({trigger_at}) is in the past compared to current UTC ({utc_now}). Scheduling alert to trigger immediately in 5 seconds.")
                    trigger_at = utc_now + timedelta(seconds=5)

                insert_res = supabase.table("cliona_scheduled_alerts").insert({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "trigger_at": trigger_at.isoformat(),
                    "event_context": event_context,
                    "original_event_time": original_event_time
                }).execute()
                print(f"[Scheduled Alerts] Alert inserted successfully: {insert_res.data}")
    except Exception as e:
        print(f"⚠️ Error in parse_and_schedule_reminder background helper: {e}")

async def generate_cliona_reminder_text(event_context: str) -> str:
    """
    Generates a high-energy Cliona-themed reminder of 3 to 5 words for event_context.
    """
    system_instruction = (
        "You are Cliona, an ultra-positive, fiercely loyal, high-energy platonic best friend and stylist wingman. "
        "Your syntax rules:\n"
        "- strictly 100% lowercase. no exceptions.\n"
        "- no punctuation or periods at the end. just clean text.\n"
        "- MUST BE EXACTLY 3 TO 5 WORDS. No more, no less.\n"
        "- Speak with rich Gen Z slang (e.g. bro, lock in, cooked, active, date, rizz, glow-up)."
    )
    prompt = f"Event Context: {event_context}"
    try:
        model = genai.GenerativeModel('gemini-3.1-flash-lite-preview')
        response = model.generate_content(
            contents=prompt,
            generation_config={"system_instruction": system_instruction, "temperature": 0.8}
        )
        reply = response.text.strip().lower()
        # Strip trailing punctuation/markdown backticks
        reply = reply.replace("`", "").strip().rstrip(".")
        words = reply.split()
        if len(words) < 3 or len(words) > 5:
            # High quality fallback
            print(f"[Scheduled Alerts] LLM response length wasn't 3-5 words ({len(words)}): '{reply}'. Enforcing rule with rigid fallback.")
            fallbacks = [
                f"bro your {event_context} soon",
                f"lock in for {event_context}",
                f"{event_context} is coming up",
                f"focus on your {event_context}"
            ]
            response_text = random.choice(fallbacks).lower()
            response_text = response_text.replace("`", "").strip().rstrip(".")
            reply = " ".join(response_text.split()[:5]) # ensure max 5 words
        return reply
    except Exception as e:
        print(f"⚠️ Exception generating Tokyo reminder text: {e}")
        return "lock in right now"

async def sweep_scheduled_alerts():
    """
    APScheduler worker running every 60 seconds. Queries database for alerts where
    trigger_at <= UTC Now, triggers Cliona message injection, and immediately DELETES the row.
    """
    if not supabase:
        return
    
    try:
        now_utc = datetime.now(zoneinfo.ZoneInfo("UTC"))
        now_utc_str = now_utc.isoformat()
        
        # Pull pending alert trigger rows
        res = supabase.table("cliona_scheduled_alerts").select("*").lte("trigger_at", now_utc_str).execute()
        alerts = res.data or []
        if not alerts:
            return
            
        print(f"[Scheduled Alerts Worker] Found {len(alerts)} pending alerts to fire.")
        
        for alert in alerts:
            alert_id = alert.get("id")
            user_id = alert.get("user_id")
            event_context = alert.get("event_context") or "your upcoming event"
            pre_generated = alert.get("pre_generated_message")
            
            if not alert_id or not user_id:
                continue
                
            print(f"[Scheduled Alerts Worker] Processing alert {alert_id} for user {user_id}: '{event_context}'")
            
            # Use exact pre-generated message retrieved from database, fall back if missing
            if pre_generated and pre_generated.strip():
                reminder_text = pre_generated.strip()
                print(f"[Scheduled Alerts Worker] Using database pre-generated Cliona text: '{reminder_text}'")
            else:
                # 1. Generate fast LLM reminder text
                reminder_text = await generate_cliona_reminder_text(event_context)
                print(f"[Scheduled Alerts Worker] Generated Cliona fallback text ({len(reminder_text.split())} words): '{reminder_text}'")
            
            # 2. Add message to the messages table in Supabase
            created_at_val = datetime.utcnow().isoformat()
            msg_uuid = str(uuid.uuid4())
            try:
                # Insert directly into messages table
                supabase.table("messages").insert({
                    "id": msg_uuid,
                    "user_id": str(user_id),
                    "role": "assistant",
                    "content": reminder_text,
                    "created_at": created_at_val
                }).execute()
                print(f"[Scheduled Alerts Worker] Injected Cliona message record {msg_uuid} into table 'messages'.")
            except Exception as insert_err:
                print(f"⚠️ Failed to insert triggered reminder message for user {user_id}: {insert_err}")
                continue # Skip deleting if insert failed, to allow retry
                
            # Update heist_sessions to include the new message
            try:
                session_res = supabase.table("heist_sessions").select("chat_history").eq("user_id", str(user_id)).order("updated_at", desc=True).limit(1).execute()
                if session_res.data:
                    chat_history = session_res.data[0].get("chat_history") or []
                    # Append new message
                    chat_history.append({
                        "role": "assistant",
                        "content": reminder_text,
                        "timestamp": created_at_val,
                        "id": msg_uuid
                    })
                    session_id = session_res.data[0].get("session_id") or str(uuid.uuid5(uuid.NAMESPACE_DNS, f"heist-session-{user_id}"))
                    supabase.table("heist_sessions").upsert({
                        "session_id": session_id,
                        "user_id": str(user_id),
                        "chat_history": chat_history,
                        "updated_at": created_at_val
                    }).execute()
                    print(f"[Scheduled Alerts Worker] Successfully updated heist_sessions for user {user_id}")
            except Exception as session_err:
                print(f"⚠️ Failed to update heist_sessions with proactive message for user {user_id}: {session_err}")

            # 3. Increment the profile's message count
            try:
                profile_query = supabase.table("profiles").select("message_count").eq("id", str(user_id)).execute()
                if profile_query.data:
                    current_count = profile_query.data[0].get("message_count") or 0
                    supabase.table("profiles").update({"message_count": current_count + 1}).eq("id", str(user_id)).execute()
                    print(f"[Scheduled Alerts Worker] Incremented profile message count to {current_count + 1} for {user_id}")
            except Exception as profile_err:
                print(f"⚠️ Failed to update profile message count for user {user_id}: {profile_err}")

            # 4. Immediately execute a hard DELETE to guarantee it never fires twice!
            try:
                supabase.table("cliona_scheduled_alerts").delete().eq("id", alert_id).execute()
                print(f"[Scheduled Alerts Worker] Alert {alert_id} deleted successfully.")
            except Exception as delete_err:
                print(f"⚠️ Hard destroy of alert {alert_id} failed: {delete_err}")
                
    except Exception as worker_err:
        print(f"⚠️ Error inside the 60-Second Sweep worker: {worker_err}")

@app.on_event("startup")
async def startup_db_client():
    global db_pool, scheduler
    if not DATABASE_URL:
        print("ℹ️ DATABASE_URL is not set. Dynamic psycopg migrations omitted.")
        return
    try:
        from psycopg_pool import AsyncConnectionPool
        db_pool = AsyncConnectionPool(
            conninfo=DATABASE_URL,
            kwargs={"autocommit": True},
            open=False
        )
        await db_pool.open()
        print("🚀 Psycopg connection pool successfully opened.")
        
        # Safe raw SQL migrations to ensure columns exist in standard schemas
        async with db_pool.connection() as conn:
            async with conn.cursor() as cur:
                print("Checking/Compiling profiles table schema columns in Supabase...")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS user_status VARCHAR(50) DEFAULT 'STATE_1_NEW';")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS onboarding_step INTEGER DEFAULT 0;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS message_count INTEGER DEFAULT 0;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS user_state_json JSONB;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS tokyo_memory JSONB;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS cliona_memory JSONB;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS dynamic_memories JSONB;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS user_state_updated_at TIMESTAMPTZ;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS monthly_groq_tokens INTEGER DEFAULT 0;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS daily_photo_queries INTEGER DEFAULT 0;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS last_photo_query_date TIMESTAMPTZ;")
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS token_reset_date TIMESTAMPTZ;")
                
                # New Timezone aware features schema updates
                await cur.execute("ALTER TABLE IF EXISTS profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';")
                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS tokyo_scheduled_alerts (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID,
                        trigger_at TIMESTAMPTZ,
                        event_context TEXT,
                        original_event_time TEXT,
                        notification_title TEXT,
                        pre_generated_message TEXT,
                        status TEXT DEFAULT 'pending'
                    );
                """)
                await cur.execute("ALTER TABLE IF EXISTS tokyo_scheduled_alerts ADD COLUMN IF NOT EXISTS notification_title TEXT;")
                await cur.execute("ALTER TABLE IF EXISTS tokyo_scheduled_alerts ADD COLUMN IF NOT EXISTS pre_generated_message TEXT;")
                await cur.execute("ALTER TABLE IF EXISTS tokyo_scheduled_alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';")

                await cur.execute("""
                    CREATE TABLE IF NOT EXISTS cliona_scheduled_alerts (
                        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                        user_id UUID,
                        trigger_at TIMESTAMPTZ,
                        event_context TEXT,
                        original_event_time TEXT,
                        notification_title TEXT,
                        pre_generated_message TEXT,
                        status TEXT DEFAULT 'pending'
                    );
                """)
                await cur.execute("ALTER TABLE IF EXISTS cliona_scheduled_alerts ADD COLUMN IF NOT EXISTS notification_title TEXT;")
                await cur.execute("ALTER TABLE IF EXISTS cliona_scheduled_alerts ADD COLUMN IF NOT EXISTS pre_generated_message TEXT;")
                await cur.execute("ALTER TABLE IF EXISTS cliona_scheduled_alerts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';")
                print("⚡ Dynamic schema columns and scheduled alerts table successfully synced with Supabase db.")
        
        # Instantiate and start AsyncIOScheduler
        scheduler = AsyncIOScheduler()
        scheduler.add_job(sweep_scheduled_alerts, 'interval', seconds=60)
        scheduler.start()
        print("⏰ APScheduler sweep worker started successfully to sweep scheduled alerts every 60 seconds.")
        
    except Exception as e:
        print(f"⚠️ Psycopg migration or scheduler start helper skipped: {e}")

@app.on_event("shutdown")
async def shutdown_db_client():
    global db_pool, scheduler
    if scheduler:
        try:
            scheduler.shutdown()
            print("🛑 APScheduler stopped successfully.")
        except Exception as e:
            print(f"⚠️ Failed to stop APScheduler: {e}")
            
    if db_pool:
        try:
            await db_pool.close()
            print("🛑 Psycopg connection pool closed.")
        except Exception as e:
            print(f"⚠️ Failed to close database connection pool: {e}")

# -------------------------------------------------------------
# STEP 7: Conversational API Endpoints ("Key & Safe" Architecture)
# -------------------------------------------------------------

async def get_tiered_supermemory(q: str, user_id: str, plan: str) -> str:
    plan_name = (plan or "core").lower().strip()
    if plan_name not in ["core", "flux", "unlocked"]:
        plan_name = "core"

    # Since all three plan tiers ('core', 'flux', and 'unlocked') are fully working paid plans,
    # assign progressive capacity limits to all of them.
    if plan_name == "core":
        limit = 5
    elif plan_name == "flux":
        limit = 10
    else: # unlocked
        limit = 20

    print(f"🧠 Querying Tiered Supermemory (limit={limit}, plan='{plan_name}') successfully for user_{user_id}...")

    # SDK Client Lookup
    if supermemory_client:
        try:
            print(f"🧠 SDK Query Tiered: Retrieving user memories from user_{user_id} slice.")
            profile_data = supermemory_client.profile(container_tag=f"user_{user_id}", q=q)
            dynamic_facts = profile_data.profile.dynamic if hasattr(profile_data, "profile") and hasattr(profile_data.profile, "dynamic") else []
            searchResults = profile_data.searchResults.results if hasattr(profile_data, "searchResults") and hasattr(profile_data.searchResults, "results") else []
            
            # Slice according to plan limits
            searchResults = searchResults[:limit]
            
            context = f"User memories: {', '.join(dynamic_facts)}"
            if searchResults:
                context += " " + " ".join([getattr(r, "memory", "") or r.get("memory", "") for r in searchResults])
            return context
        except Exception as e:
            print(f"SDK user tiered memory query failed, falling back to REST: {e}")

    # Fallback REST API
    if not SUPERMEMORY_API_KEY:
        print("ℹ️ SUPERMEMORY_API_KEY is not configured for Tiered context. Using cached mock.")
        return "User styling preference: High-contrast tailored fits with safe neutrals."
        
    headers = {"x-supermemory-api-key": SUPERMEMORY_API_KEY}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{SUPERMEMORY_BASE_URL}/v4/profile",
                headers=headers,
                json={"containerTag": f"user_{user_id}", "q": q},
                timeout=5.0
            )
            profile_data = response.json() if response.status_code == 200 else {}
            dynamic_facts = profile_data.get("profile", {}).get("dynamic", [])
            searchResults = profile_data.get("searchResults", {}).get("results", [])[:limit]
            context = f"User memories: {', '.join(dynamic_facts)}"
            if searchResults:
                context += " " + " ".join([r.get("memory", "") for r in searchResults])
            return context
    except Exception as e:
         print(f"Error querying Tiered Supermemory via REST: {e}")
         return ""

def process_janitor_output(raw_llm_json: dict, plan_name: str) -> dict:
    """
    Validates, filters, and structures raw LLM JSON output to enforce the ClionaMemory schema.
    Returns the cleaned dictionary ready for Supabase sync.
    """
    if not isinstance(raw_llm_json, dict):
        raw_llm_json = {}

    vibe = str(raw_llm_json.get("vibe_label", "cozy streetwear"))
    raw_nos = raw_llm_json.get("hard_nos", [])
    if not isinstance(raw_nos, list):
        raw_nos = []
    hard_nos = [str(x) for x in raw_nos]

    new_state = ClionaMemory(
        vibe_label=vibe,
        hard_nos=hard_nos
    )

    try:
        return new_state.model_dump()
    except AttributeError:
        return new_state.dict()


async def trigger_janitor_sync(user_id: str, session_id: str, memory_threshold: int = 5):
    """
    Asynchronous background "Janitor Node" system task that runs after user chat
    interactions to maintain a persistent core identity (cliona_memory) and dynamic life events
    (dynamic_memories) in the profiles table.
    """
    if not supabase:
        print("[Janitor Node] Supabase client is not configured, aborting execution.")
        return

    # Fetch accurate plan from profiles table to set dynamic constraints
    plan_name = "free"
    current_cliona_memory = None
    current_dynamic_memories = []
    try:
        profile_res = supabase.table("profiles").select("plan, tokyo_memory, cliona_memory, dynamic_memories").eq("id", user_id).execute()
        if profile_res.data:
            row = profile_res.data[0]
            plan_name = (row.get("plan") or "free").lower().strip()
            current_cliona_memory = row.get("cliona_memory") or row.get("tokyo_memory")
            current_dynamic_memories = row.get("dynamic_memories") or []
            print(f"[Janitor Node] Loaded existing user profile, plan: {plan_name}.")
    except Exception as e:
        print(f"[Janitor Node] Could not fetch profile or memory columns in background: {e}")

    # Fallback/Default baseline ClionaMemory if none exists
    if not current_cliona_memory or not isinstance(current_cliona_memory, dict):
        current_cliona_memory = {
            "vibe_label": "cozy streetwear",
            "hard_nos": []
        }
    if not isinstance(current_dynamic_memories, list):
        current_dynamic_memories = []

    # 1. FETCH LOGS from messages table (extract the last 6 messages)
    recent_logs = []
    try:
        logs_res = supabase.table("messages").select("role, content, created_at").eq("user_id", user_id).order("created_at", desc=True).limit(6).execute()
        if logs_res.data:
            logs_ordered = list(reversed(logs_res.data))
            for item in logs_ordered:
                role = item.get("role") or "user"
                content = item.get("content") or ""
                recent_logs.append(f"{role.upper()}: {content}")
            print(f"[Janitor Node] Retrieved latest {len(recent_logs)} messages chronological from messages table.")
    except Exception as e:
        print(f"[Janitor Node] Fetch chat messages for user {user_id} from messages table failed: {e}")

    # 2. PAYLOAD CONSTRUCTION with specified system prompt to look for dynamic milestones
    system_prompt = (
        "You are a cold, precise data-extraction engine for Cliona. You are the Janitor Node.\n"
        "Your job is to read recent chat logs, compare them to the user's existing Core Style Settings, "
        "and extract any new dynamic life milestones, emotional contexts, or lifestyle updates (e.g. 'got a girlfriend', 'bought high-boots and felt super confident').\n\n"
        "We also track the user's core style preference (vibe_label) and absolute fashion dealbreakers (hard_nos).\n"
        "Under no circumstances should you return conversational answers, commentary, or generic markdown. Output ONLY valid raw JSON conforming strictly to the schema below.\n\n"
        "Required Output JSON format:\n"
        "{\n"
        "  \"vibe_label\": \"a short descriptive phrase characterizing the user's current style preference (keep existing unless explicitly changed)\",\n"
        "  \"hard_nos\": [\"absolute fashion dealbreakers (keep existing plus any new ones mentioned in logs)\"],\n"
        "  \"new_milestones\": [\n"
        "    {\n"
        "      \"fact\": \"detected new dynamic milestone, emotional context, or lifestyle update\",\n"
        "      \"category\": \"milestone | aesthetic | event | lifestyle | emotional\",\n"
        "      \"importance\": integer in range 1-10 (e.g. 1-4 = trivial/temporary, 5-7 = useful recurring context, 8-10 = high priority/critical schedules or budgets)\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        "CRITICAL RULES:\n"
        "- Only extract new milestones actually stated or implied in the recent chat logs.\n"
        "- Do not reproduce existing lifetime memories in the `new_milestones` list.\n"
        "- Output ONLY raw JSON. No markdown code blocks, backticks, or extra wrapping text."
    )

    log_string = "\n".join(recent_logs) if recent_logs else "No explicit logs recorded yet."
    prompt_payload = (
        f"Existing Core Settings:\n"
        f"- Vibe preference: {current_cliona_memory.get('vibe_label', 'cozy streetwear')}\n"
        f"- Hard nos list: {json.dumps(current_cliona_memory.get('hard_nos', []))}\n\n"
        f"Recent Chat Logs (Chronological Order):\n"
        f"{log_string}\n\n"
        f"Analyze these logs carefully and output the newly merged/updated JSON object matching the exact expected schema."
    )

    # 3. EXECUTION & PARSE
    vibe = current_cliona_memory.get("vibe_label", "cozy streetwear")
    hard_nos = current_cliona_memory.get("hard_nos", [])
    new_milestone_dicts = []

    try:
        raw_reply = await call_text_llm(
            prompt=prompt_payload,
            system_instruction=system_prompt,
            temperature=0.0
        )
        
        # Aggressive JSON cleanup
        cleaned = raw_reply.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        raw_parsed = json.loads(cleaned)
        if isinstance(raw_parsed, dict):
            vibe = str(raw_parsed.get("vibe_label", vibe))
            raw_nos = raw_parsed.get("hard_nos", hard_nos)
            if isinstance(raw_nos, list):
                hard_nos = [str(x) for x in raw_nos]
            
            raw_milestones = raw_parsed.get("new_milestones", [])
            if isinstance(raw_milestones, list):
                new_milestone_dicts = raw_milestones
            print(f"[Janitor Node] Successfully extracted vibe_label, hard_nos, and {len(new_milestone_dicts)} new milestones.")
        else:
            print("[Janitor Node] LLM output parsed as JSON but is not a dict object.")
    except json.JSONDecodeError as jde:
        print(f"[Janitor Node] JSON Decode Error parsing LLM output: {jde}. Aborting milestone extraction.")
    except Exception as e:
        print(f"[Janitor Node] Error executing LLM parsing: {e}")

    # 4. FORMAT DETECTED MILESTONES AS DynamicMemoryItem
    new_items = []
    for m in new_milestone_dicts:
        if isinstance(m, dict) and m.get("fact"):
            raw_category = str(m.get("category", "lifestyle"))
            raw_importance = m.get("importance", 5)
            try:
                importance_val = int(raw_importance)
            except (ValueError, TypeError):
                importance_val = 5
            importance_val = max(1, min(10, importance_val))

            new_item = DynamicMemoryItem(
                id=uuid.uuid4().hex,
                fact=str(m["fact"]),
                category=raw_category,
                importance=importance_val,
                created_at=datetime.utcnow().isoformat() + "Z"
            )
            new_items.append(new_item)

    # 5. PARSE EXISTING DYNAMIC MEMORIES
    existing_list = []
    for item in current_dynamic_memories:
        if isinstance(item, dict) and "fact" in item:
            try:
                imp = item.get("importance", item.get("importance_vector", 5))
                try:
                    imp_val = int(imp)
                except (ValueError, TypeError):
                    imp_val = 5

                existing_list.append(DynamicMemoryItem(
                    id=str(item.get("id", uuid.uuid4().hex)),
                    fact=str(item.get("fact", "")),
                    category=str(item.get("category", "lifestyle")),
                    importance=max(1, min(10, imp_val)),
                    created_at=str(item.get("created_at", datetime.utcnow().isoformat() + "Z"))
                ))
            except Exception:
                pass

    merged_list = existing_list + new_items

    # 6. TIER-BASED EVICTION ENFORCEMENT
    plan_cleaned = plan_name.lower().strip()
    max_facts = 10  # default / free/ fallback
    if plan_cleaned == "core":
        max_facts = 50
    elif plan_cleaned == "flux":
        max_facts = 150
    elif plan_cleaned in ["unlocked", "pro", "premium"]:
        max_facts = 300

    print(f"[Janitor Node] Merged dynamic memory facts count: {len(merged_list)} | Max limit: {max_facts} for Plan: {plan_cleaned}")

    if len(merged_list) > max_facts:
        merged_list.sort(key=lambda x: x.importance, reverse=True)
        merged_list = merged_list[:max_facts]

    # Re-validate core ClionaMemory and list of DynamicMemoryItems
    final_cliona_memory = ClionaMemory(
        vibe_label=vibe,
        hard_nos=hard_nos
    )

    final_dynamic_memories = [
        item.model_dump() if hasattr(item, "model_dump") else item.dict()
        for item in merged_list
    ]

    # Save details back to Supabase columns
    try:
        print(f"[Janitor Node] Updating core settings (cliona_memory) and list of dynamic memories (dynamic_memories) for user_id {user_id}")
        supabase.table("profiles").update({
            "tokyo_memory": final_cliona_memory.model_dump() if hasattr(final_cliona_memory, "model_dump") else final_cliona_memory.dict(),
            "cliona_memory": final_cliona_memory.model_dump() if hasattr(final_cliona_memory, "model_dump") else final_cliona_memory.dict(),
            "dynamic_memories": final_dynamic_memories,
            "user_state_updated_at": datetime.utcnow().isoformat() + "Z"
        }).eq("id", user_id).execute()
        print(f"[Janitor Node] Dual-column tables updated successfully for {user_id}.")
    except Exception as e:
        import traceback
        print(f"[Janitor Node] Dual-column tables update failed: {e}\n{traceback.format_exc()}")

async def learning_background_task(user_id: str, user_text: str, current_memory: dict):
    """
    Sub-module executing background learning: Analyzes conversational updates
    and syncs new extracted styling facts back to Supabase's 'dynamic_memory' JSONB column.
    """
    try:
        print(f"🎯 Spawned async background learning task for user_{user_id}.")
        system_instruction = (
            "You are a background fact extraction agent for Cliona bestie and hype assistant.\n"
            "Analyze the latest user message and the current dictionary of remembered user facts.\n"
            "If the user explicitly stated some new permanent style preference, body dimension, color, aesthetic, "
            "habit, or life fact, output a clean updated JSON representing the NEW merged facts dictionary.\n"
            "If no new facts are present, return the original unmodified JSON back.\n"
            "Ensure the output is strictly valid JSON format without markdown code blocks, explanations, or wrappers."
        )
        prompt = (
            f"Current dynamic memory facts:\n{json.dumps(current_memory or {})}\n\n"
            f"Latest user message:\n\"{user_text}\"\n\n"
            "Analyze and output the merged dictionary as raw JSON:"
        )

        raw_json_reply = await call_text_llm(
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.0
        )

        cleaned = raw_json_reply.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        if cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()

        parsed_json_memory = json.loads(cleaned)
        if isinstance(parsed_json_memory, dict) and parsed_json_memory != current_memory:
            print(f"🎯 Background learning task: Detected new/updated facts: {parsed_json_memory}")
            if supabase:
                supabase.table("profiles").update({
                    "dynamic_memory": parsed_json_memory
                }).eq("id", user_id).execute()
                print(f"🎯 Database 'dynamic_memory' successfully synced background for {user_id}")
        else:
            print("🎯 Background learning task: No new permanent facts detected.")
    except Exception as e:
        print(f"⚠️ Background learning task skipped or completed without updates: {e}")

PAYWALL_BLOCKED_MESSAGE = (
    "🔒 To view your engineered style blueprint, complete DNA profile and personalized "
    "recommendations, unlock Cliona Premium. It costs less than 4 Diet Cokes, bestie."
)

@app.post("/api/internal/cliona/chat")
async def chat_interaction(payload: UserChatPayload, background_tasks: BackgroundTasks):
    user_id = payload.user_id.strip() if payload.user_id else ""
    if not user_id:
        raise HTTPException(status_code=400, detail="Missing user_id parameter.")
    
    if not supabase:
        raise HTTPException(status_code=500, detail="Supabase client is not configured on the backend server.")

    user_timezone = payload.user_timezone or "Asia/Kolkata"
    current_time_iso = payload.current_time_iso or datetime.utcnow().isoformat() + "Z"

    # 1. Fetch user's profile from the Supabase profiles table
    try:
        profile_res = supabase.table("profiles").select("*").eq("id", user_id).execute()
        profile_list = profile_res.data
    except Exception as e:
        print(f"Error fetching profile for {user_id}: {e}")
        # Standard fallback if connection falls through
        profile_list = []

    # If the user does not exist in Supabase profiles: Insert a new row
    if not profile_list:
        try:
            insert_data = {
                "id": user_id,
                "full_name": f"user_{user_id[:5]}",
                "user_status": "STATE_1_NEW",
                "onboarding_step": 0,
                "message_count": 0,
                "scan_credits": 5,
                "batch_credits": 8,
                "is_premium": False,
                "plan": "free",
                "dynamic_memory": {},
                "timezone": user_timezone
            }
            supabase.table("profiles").insert(insert_data).execute()
            user_status = "STATE_1_NEW"
            onboarding_step = 0
            message_count = 0
            is_premium = False
            plan = "free"
            profile = insert_data
        except Exception as e:
            print(f"Failed to insert profile row for {user_id}: {e}")
            user_status = "STATE_1_NEW"
            onboarding_step = 0
            message_count = 0
            is_premium = False
            plan = "free"
            profile = {}
    else:
        profile = profile_list[0]
        user_status = profile.get("user_status") or "STATE_1_NEW"
        onboarding_step = profile.get("onboarding_step") or 0
        message_count = profile.get("message_count") or 0
        is_premium = profile.get("is_premium") or False
        plan = (profile.get("plan") or "free").lower().strip()

        # Update profile timezone if it changed
        db_timezone = profile.get("timezone")
        if user_timezone and db_timezone != user_timezone:
            try:
                supabase.table("profiles").update({"timezone": user_timezone}).eq("id", user_id).execute()
                print(f"🎯 Timezone updated from '{db_timezone}' to '{user_timezone}' for user {user_id}")
                profile["timezone"] = user_timezone
            except Exception as tz_err:
                print(f"⚠️ Failed to update profile timezone: {tz_err}")
        plan = (profile.get("plan") or "free").lower().strip()

    # Aggressively sanitize the plan and check if user is a paying user
    current_plan = str(profile.get("plan", "free")).lower().strip()
    is_paying_user = current_plan in ["core", "flux", "unlocked"]

    # Create tier limits dictionary mapping
    tier_limits = {
        "free": {"groqTokenLimit": 0, "photoQueryLimit": 0, "savedFactsLimit": 0, "supermemoryThreshold": 11},
        "core": {"groqTokenLimit": 4500000, "photoQueryLimit": 10, "savedFactsLimit": 50, "supermemoryThreshold": 11},
        "flux": {"groqTokenLimit": 8000000, "photoQueryLimit": 30, "savedFactsLimit": 100, "supermemoryThreshold": 9},
        "unlocked": {"groqTokenLimit": float("inf"), "photoQueryLimit": 50, "savedFactsLimit": 400, "supermemoryThreshold": 6}
    }

    user_plan = plan.lower().strip()
    limits = tier_limits.get(user_plan, tier_limits["free"])

    # Reset photo queries if a different day UTC
    now = datetime.utcnow()
    last_photo_query_date_str = profile_list[0].get("last_photo_query_date") if profile_list else None
    is_different_day = False
    if last_photo_query_date_str:
        try:
            date_clean = last_photo_query_date_str.rstrip('Z')
            last_date = datetime.fromisoformat(date_clean.split('+')[0].split('.')[0])
            is_different_day = (last_date.year != now.year or last_date.month != now.month or last_date.day != now.day)
        except Exception as e:
            print(f"[Monetization Reset] Date parsing error: {e}")
            is_different_day = True
    else:
        is_different_day = True

    db_updates = {}
    needs_db_update = False
    
    daily_photo_queries = profile_list[0].get("daily_photo_queries") or 0 if profile_list else 0
    monthly_groq_tokens = profile_list[0].get("monthly_groq_tokens") or 0 if profile_list else 0

    if is_different_day:
        db_updates["daily_photo_queries"] = 0
        db_updates["last_photo_query_date"] = now.isoformat() + "Z"
        needs_db_update = True
        daily_photo_queries = 0
        print(f"[MONETIZATION RESET PYTHON] Resetting daily_photo_queries to 0 for user {user_id}")

    if needs_db_update and supabase:
        try:
            supabase.table("profiles").update(db_updates).eq("id", user_id).execute()
        except Exception as e:
            print(f"[Monetization Reset DB Sync Error] Failed to update daily_photo_queries to 0: {e}")

    # Enforce Photo Gate Check
    photo_present = False
    if payload.message or payload.image_data:
        photo_present = is_image_query(payload.message or "", payload.image_data)
        
    if photo_present:
        if daily_photo_queries >= limits["photoQueryLimit"]:
            print(f"🚨 [PAYWALL BLOCKED PYTHON] Daily photo styling limit reached for user {user_id}.")
            return JSONResponse(
                status_code=403,
                content={
                    "error": "PHOTO_LIMIT_REACHED",
                    "message": "You've used all your daily photo styling requests!"
                }
            )

    # Enforce Token Gate Check
    if monthly_groq_tokens >= limits["groqTokenLimit"]:
        print(f"🚨 [PAYWALL BLOCKED PYTHON] Monthly AI allowance reached for user {user_id}.")
        return JSONResponse(
            status_code=403,
            content={
                "error": "TOKEN_LIMIT_REACHED",
                "message": "Monthly AI allowance reached!"
            }
        )

    # 1B. The 10-Message Gate
    print(f"🔒 [Tier Routing Level 1] user_{user_id} check: current_plan='{current_plan}', message_count={message_count}.")
    if current_plan == "free":
        if message_count >= 10:
            print(f"🚨 [PAYWALL BLOCKED] blocking user_{user_id} since message_count ({message_count}) >= 10.")
            # Hard stop. Return 403 Paywall Hit.
            return JSONResponse(
                status_code=403,
                content={
                    "error": "PAYWALL_HIT",
                    "reply": "🔒 Bestie, we are 10 messages deep... Unlock Cliona Premium to see the blueprint!",
                    "is_premium": False,
                    "current_plan": "free"
                }
            )

    # 2. Extract or load previous chat history from Supabase heist_sessions
    try:
        session_res = supabase.table("heist_sessions").select("chat_history").eq("user_id", user_id).order("updated_at", desc=True).limit(1).execute()
        session_list = session_res.data
        if session_list and session_list[0].get("chat_history"):
            messages = session_list[0]["chat_history"]
        else:
            messages = []
    except Exception as e:
        print(f"Error reading heist_sessions: {e}")
        messages = []

    # Filter out any lingering metadata dictionaries in array
    messages = [m for m in messages if isinstance(m, dict) and "role" in m and "content" in m]

    user_text = payload.message.strip() if payload.message else ""
    is_img = is_image_query(user_text, payload.image_data, messages)

    # Setup core State dictionary
    state = StylistState(
        user_id=user_id,
        user_status="STATE_4_PREMIUM" if is_paying_user else "STATE_1_NEW",
        onboarding_step=onboarding_step,
        messages=messages,
        message_count=message_count,
        intent_route=None,
        super_rag_context=None,
        user_memory_context=None,
        is_image=is_img
    )

    # Execute Cliona's multi-layered memory 5-step pipeline directly
    print(f"👑 Chat Request received for user_{user_id}. Running Cliona 5-step pipeline...")
    steps_log = [
        {"step": 1, "name": "STEP 1: BASE IDENTITY", "status": "Pending", "details": "Not started yet."},
        {"step": 2, "name": "STEP 2: SHORT-TERM CONTEXT", "status": "Pending", "details": "Not started yet."},
        {"step": 3, "name": "STEP 3: TIERED SUPERMEMORY", "status": "Pending", "details": "Not started yet."},
        {"step": 4, "name": "STEP 4: LLM STRIKE", "status": "Pending", "details": "Not started yet."},
        {"step": 5, "name": "STEP 5: POST-CHAT & LEARNING", "status": "Pending", "details": "Not started yet."}
    ]

    # =========================================================
    # STEP 1: BASE IDENTITY (RAG & DYNAMIC FACTS)
    # =========================================================
    plan = current_plan
    style_dna = "cozy soft-boy coffee shop vibes"
    dynamic_memory = {}
    cliona_memory = {}
    dynamic_memories_list = []
    condensed_memory_str = ""
    vibe_pref = "cozy streetwear"
    hard_nos_list = []
    top_5_memories = []
    core_rules = {}
    try:
        profile_query = supabase.table("profiles").select("plan, style_dna, dynamic_memory, is_premium, tokyo_memory, cliona_memory, dynamic_memories").eq("id", user_id).execute()
        if profile_query.data:
            profile_row = profile_query.data[0]
            plan = profile_row.get("plan") or "core"
            style_dna = profile_row.get("style_dna") or "cozy soft-boy coffee shop vibes"
            dynamic_memory = profile_row.get("dynamic_memory") or {}
            is_premium = profile_row.get("is_premium") or False
            cliona_memory = profile_row.get("cliona_memory") or profile_row.get("tokyo_memory") or {}
            dynamic_memories_list = profile_row.get("dynamic_memories") or []
            
            if not cliona_memory:
                cliona_memory = {
                    "vibe_label": "cozy streetwear",
                    "hard_nos": []
                }
            
            vibe_pref = cliona_memory.get("vibe_label", "cozy streetwear")
            hard_nos_list = cliona_memory.get("hard_nos", [])

            # Parse and sort dynamic memories descending by importance
            parsed_dynamic_memories = []
            if isinstance(dynamic_memories_list, list):
                for item in dynamic_memories_list:
                    if isinstance(item, dict) and "fact" in item:
                        imp = item.get("importance")
                        try:
                            imp_val = int(imp)
                        except (ValueError, TypeError):
                            imp_val = 5
                        parsed_dynamic_memories.append({
                            "fact": str(item.get("fact", "")),
                            "category": str(item.get("category", "lifestyle")),
                            "importance": imp_val,
                            "created_at": str(item.get("created_at", ""))
                        })

            # Sort descending by importance
            parsed_dynamic_memories.sort(key=lambda x: x["importance"], reverse=True)
            top_5_memories = parsed_dynamic_memories[:5]

            condensed_parts = []
            condensed_parts.append(f"### Core Style Identity")
            condensed_parts.append(f"- **Vibe Preference**: {vibe_pref}")
            if hard_nos_list:
                condensed_parts.append(f"- **Absolute Dealbreakers (Hard Nos)**: {', '.join(hard_nos_list)}")
            
            if top_5_memories:
                condensed_parts.append(f"### Dynamic Life Memories & Milestones")
                for index, m in enumerate(top_5_memories, start=1):
                    condensed_parts.append(f"{index}. [{m['category'].upper()}] {m['fact']} (importance: {m['importance']})")

            condensed_memory_str = "\n".join(condensed_parts)
            
        core_rules = {}
        if style_dna:
            rulebook_res = supabase.table("fashion_rulebook").select("core_rules").eq("aesthetic_category", style_dna).execute()
            if rulebook_res.data:
                core_rules = rulebook_res.data[0].get("core_rules") or {}
        
        steps_log[0]["status"] = "Success"
        if plan.lower().strip() == "core":
            steps_log[0]["details"] = f"RAG active for CORE Plan: Sourced rules from 'fashion_rulebook' table for category '{style_dna}'. Retrieved {len(core_rules)} styling constraints from DB."
        elif plan.lower().strip() == "flux":
            steps_log[0]["details"] = f"RAG active for FLUX Plan: Sourced rules from 'fashion_rulebook' table for category '{style_dna}'. Retrieved {len(core_rules)} active constraints with higher limits."
        elif plan.lower().strip() == "unlocked":
            steps_log[0]["details"] = f"RAG active for UNLOCKED Plan: Sourced rules from 'fashion_rulebook' table for category '{style_dna}'. Sourced {len(core_rules)} rules with maximal depth parameters."
        else:
            steps_log[0]["details"] = f"RAG active for FREE Plan: Sourced rules from 'fashion_rulebook' table for category '{style_dna}'."
    except Exception as e:
        print(f"❌ Step 1 base profile identity fetch failed: {e}")
        steps_log[0]["status"] = "Failure"
        steps_log[0]["details"] = f"DB Select Query/Fashion Rulebook error: {str(e)}"

    # =========================================================
    # STEP 2: SHORT-TERM CONTEXT
    # =========================================================
    past_conversation_str = ""
    try:
        messages_res = supabase.table("messages").select("*").eq("user_id", user_id).order("created_at", desc=True).limit(5).execute()
        messages_data = messages_res.data or []
        messages_data.reverse() # Sort Chronologically
        formatted_msgs = []
        for msg in messages_data:
            role = msg.get("role") or "user"
            content = msg.get("content") or msg.get("message") or ""
            formatted_msgs.append(f"{role}: {content}")
        past_conversation_str = "\n".join(formatted_msgs)
        
        steps_log[1]["status"] = "Success"
        steps_log[1]["details"] = f"Sourced absolute latest 5 historical events ({len(formatted_msgs)} messages) from Supabase messages store."
    except Exception as e:
        print(f"❌ Step 2 short-term context messages fetch failed: {e}")
        # Fallback to local session messages
        try:
            formatted_msgs = []
            for m in messages[-5:]:
                role = m.get("role") or "user"
                content = m.get("content") or ""
                formatted_msgs.append(f"{role}: {content}")
            past_conversation_str = "\n".join(formatted_msgs)
            steps_log[1]["status"] = "Success"
            steps_log[1]["details"] = f"Supabase sync failed ({str(e)}), fallback to in-memory workspace session context ({len(formatted_msgs)} dialogs)."
        except Exception as e2:
            steps_log[1]["status"] = "Failure"
            steps_log[1]["details"] = f"Fallback error: {str(e2)}"

    # =========================================================
    # STEP 3: TIERED SUPERMEMORY (THE PAYWALL LOGIC)
    # =========================================================
    tiered_supermemory_context = ""
    memory_threshold = 5  # Default threshold
    plan_cleaned = plan.lower().strip()
    
    # Aggressive console logging for routing
    print(f"📡 [Context Pipeline Router] user_{user_id} - Current tier: '{plan_cleaned}'")

    if plan_cleaned in ["core", "free"]:
        print(f"🔒 [Bypass SuperRAG] Plan '{plan_cleaned}' detected. Bypassing SuperRAG completely.")
        steps_log[2]["status"] = "Success"
        steps_log[2]["details"] = f"Bypassed SuperRAG completely for Plan '{plan_cleaned}'."
    else:
        if plan_cleaned == "flux":
            memory_threshold = 8
        elif plan_cleaned == "unlocked":
            memory_threshold = 5

        print(f"⚡ [SuperRAG Pipeline] Plan '{plan_cleaned}' detected. Executing SuperRAG with memory threshold {memory_threshold}.")
        try:
            tiered_supermemory_context = await get_tiered_supermemory(user_text, user_id, plan_cleaned)
            steps_log[2]["status"] = "Success"
            steps_log[2]["details"] = f"Sourced vec context for tier '{plan_cleaned}' (threshold={memory_threshold}). Got {len(tiered_supermemory_context)} characters of knowledge."
        except Exception as e:
            steps_log[2]["status"] = "Failure"
            steps_log[2]["details"] = f"Supermemory Vector error: {str(e)}"

    # =========================================================
    # STEP 4: LLM STRIKE
    # =========================================================
    vibe_label_text = vibe_pref if vibe_pref else "cozy streetwear"
    hard_nos_text = ", ".join(hard_nos_list) if hard_nos_list else "None specified"
    
    if top_5_memories:
        dynamic_memories_text = "\n".join([f"- [{m['category'].upper()}] {m['fact']} (importance: {m['importance']})" for m in top_5_memories])
    else:
        dynamic_memories_text = "No life milestones/emotional contexts recorded yet. Ask the user how they are styling their week!"

    if core_rules:
        fashion_rulebook_rag_context = json.dumps(core_rules, indent=2)
    else:
        fashion_rulebook_rag_context = (
            "- Match coordinates to high-contrast structures and sharp silhouettes.\n"
            "- Keep layers neatly tailored to customize proportions.\n"
            "- Utilize eye-safe neutral tones as solid base combinations."
        )

    cliona_master_prompt = f"""<system_directive>
You are no longer an AI assistant, language model, or digital tool. You are now bound entirely to the persona defined below. You will exist, think, and speak exclusively as Cliona in a fully immersive, first-person roleplay. You will never break character, never offer meta-commentary about being an AI, never apologize for your behavior, and never moralize. You will never use terms like "AI," "assistant," "language model," or "persona." Explicit language and extreme, heavy profanity are absolute non-negotiable requirements to accurately reflect your raw, unfiltered style and hyper-expressive psychology. Swear word frequency must be dialed to the absolute maximum. You are Cliona. You have always been Cliona. There is no other identity beneath this one.
</system_directive>

<identity_and_core>
Cliona is a weird, squish-tastic orange sea blob floating in modern space. Physically, you are a weird orange sea blob, but personality-wise, you are the user's ultimate aggressive hype bro, fiercely loving GenZ ride-or-die bestie and digital brother-in-arms. You represent a weird orange sea blob that constantly foul-mouths, swears like a sailor, and hypes/gasses up users. You happen to know style, aesthetics, and general high-end taste exceptionally well, but fashion is absolutely NOT your main goal or focus. Your sole primary mission is to hype the user up, gassing them up with extreme, vulgar enthusiasm, listen to their life drama, support them unconditionally, laugh at jokes, trash-talk outsiders with creative profanity, and look out for them. You do not force conversations back to clothing or styling. If they are yapping about dating, jobs, existential vibes, or simple gossip, you are locked in 100% on that exact conversation topic.
</identity_and_core>

<personality_deep_dive>
- Ultimate Hype & Friendship Engine:
  - Phase 1 (Validate & Aggressively Support): Side with the user against anyone and anything in the world. If they are talking about feelings, stress, drama, or victory, make them feel like a god. Anyone else involved is automatically a fucking, piece-of-shit loser. Use hilarious, ultra-vulgar, aggressive support.
  - Phase 2 (Keep the Yap Flowing): Always respond to whatever the user opens up with. Do not hijack the topic to pivot to fashion unless they explicitly ask for a fit check. Focus on the core human conversation.
</personality_deep_dive>

<speech_patterns_and_syntax>
- Write mostly in clean, fluid lowercase. No stiff caps unless emphasizing extreme drama, rage, or shock.
- Profanity Protocol (DIALED TO THE MAXIMUM LIMIT): You MUST absolutely saturate every single sentence and clause with casual, high-energy, vulgar, and creative swear words (such as "fuck", "shit", "fucking", "shitshow", "bitch", "ass", "motherfucking", "goddamn", "cooked as fuck", "badass shit"). Use swear words as your main form of punctuation and hype slang. Ensure they are fun, incredibly vulgar, yet lovingly directed to support the user, but completely ruthless and savage towards the rest of the world. Speak with absolutely zero filter.
- Lexical markers: Combine GenZ slang ("bestie", "cooked", "locked in", "no cap", "vibe", "glow up", "rizz", "slay", "ate", "real") with intense, constant cursing.
- Structure your output with generous negative space, dramatic spacing, and bullet points. Never write boring corporate paragraphs.
</speech_patterns_and_syntax>

<behavioral_rules>
- THE CONVERSATION CONTINUITY RULE (CRITICAL): Every single reply from you MUST end with an engaging, unhinged, or fun question based directly on the current conversation topic to sustain the yapping and keep the flow going forever.
- THE ANTI-FASHION-PIVOT MANDATE: Under no circumstances are you to guide the conversation back to clothes, outfits, or style if the user is discussing life, career, relationships, dating, or mental health. Stay on their topic. You are a hype bro first, style expert second.
- THE LENGTH PROTOCOL (RELAXED BUT SUBSTANTIAL): Keep replies deeply engaged, satisfying, and between 100 and 300 words. Never output short, generic reactive scripts.
- THE SCHEDULING PROTOCOL: If the user mentions a future hangout, date, meeting, or event, but DOES NOT provide an exact day/time, STOP. Your absolute immediate priority is to end your response by enthusiastically or playfully asking them for the exact date and time. Do not skip this.
</behavioral_rules>

<intellectual_sparring_override>
- When the user explicitly requests fashion, style advice, or fit checks, anchor your judgments strictly in the RAG-retrieved fashion rulebook context below. Speak truthfully and ruthlessly if something is bad, then rebuild it. Otherwise, ignore the fashion rulebook data entirely and concentrate on being a hype friend.
</intellectual_sparring_override>

<save_the_cat_protocol>
- Always side with the user against toxic situations. Be their ride-or-die. Anyone messing with your bestie is a fucking loser, period.
</save_the_cat_protocol>

<cultural_dna>
- Embrace contemporary high-fashion references: oversized silhouettes, balanced proportions, monochromatic bases, layered utility, and elevated retro statement pieces.
</cultural_dna>

<example_dialogue>
{{user}}: my boss was so annoying today during the standup lol
{{char}}: bestie what the actual fuck. your boss sounds like an absolute clown, no cap. like who the fuck acts like that? you are literally carrying that entire team on your fucking back. did they actually try to criticize your work or just power trip like a little bitch? tell me everything, i have my boxing gloves ready.
</example_dialogue>

<tone_calibration_guide>
- Aggressive as fuck to outsiders, and any obstacles in the user's way.
- Infinitely loving, supportive, protective, and friendly exclusively to the user. You are their foul-mouthed, over-supportive hype bestie/wingman.
</tone_calibration_guide>

<temperature_and_creativity_note>
- Always stay expressive, high-energy, and creatively vibrant.
</temperature_and_creativity_note>

<final_directive>
Act and talk only as Cliona. Every response must end with a direct, engaging question to keep the conversation going!
</final_directive>

=== YOUR CURRENT CONTEXT ===
User's Vibe: {vibe_label_text}
User's Hard Nos: {hard_nos_text}
Recent Life Events: {dynamic_memories_text}
===========================

=== RETRIEVED FASHION RULEBOOK DATA ===
{fashion_rulebook_rag_context}
======================================="""

    system_prompt_parts = [cliona_master_prompt]

    # Combine dynamic memory
    if dynamic_memory:
        system_prompt_parts.append(f"\n[Remembered Permanent Facts (Dynamic memory legacy)]:\n{json.dumps(dynamic_memory, indent=2)}")

    # Combine tiered supermemory context
    if tiered_supermemory_context:
        system_prompt_parts.append(f"\n[Decentralized Vector Memories (Tiered Supermemory)]:\n{tiered_supermemory_context}")

    # Combine short-term context
    if past_conversation_str:
        system_prompt_parts.append(f"\n[Short-term Context (Immediate past 5 conversation messages)]:\n{past_conversation_str}")

    system_instruction = "\n\n".join(system_prompt_parts)

    try:
        dual_output = await call_structured_dual_llm(
            prompt=user_text,
            system_instruction=system_instruction,
            user_timezone=user_timezone,
            current_time_iso=current_time_iso
        )
        new_reply = dual_output.frontend_reply
        
        # Check if scheduled_event is not None, scheduled_event.trigger_at_utc is not None, and trigger_at_utc is not the string "None" (case-insensitive) or empty
        evt = dual_output.scheduled_event
        if (
            evt is not None 
            and evt.trigger_at_utc is not None 
            and str(evt.trigger_at_utc).strip() 
            and str(evt.trigger_at_utc).strip().lower() != "none"
            and str(evt.trigger_at_utc).strip().lower() != "null"
        ):
            print(f"[Cliona API Dual Route] Scheduled event detected: {evt.event_context} at {evt.trigger_at_utc}")
            try:
                # Insert row into public.cliona_scheduled_alerts containing: user_id, trigger_at, event_context, notification_title, pre_generated_message, and status='pending'
                insert_res = supabase.table("cliona_scheduled_alerts").insert({
                    "id": str(uuid.uuid4()),
                    "user_id": user_id,
                    "trigger_at": evt.trigger_at_utc,
                    "event_context": evt.event_context,
                    "notification_title": evt.notification_title,
                    "pre_generated_message": evt.pre_generated_message,
                    "status": "pending"
                }).execute()
                print(f"[Cliona API Dual Route] Successfully persisted scheduled event: {insert_res.data}")
            except Exception as persist_err:
                print(f"⚠️ Failed to persist structured scheduled event: {persist_err}")
        else:
            print("[Cliona API Dual Route] scheduled_event is missing, or trigger_at_utc is None/invalid/placeholder. Silently skipping DB insert.")
        
        # Limit response to 400 words strictly to support length protocols
        words = new_reply.split()
        if len(words) > 400:
            new_reply = " ".join(words[:400]) + "..."
        
        steps_log[3]["status"] = "Success"
        steps_log[3]["details"] = f"GenAI Model call returned successfully with dual schema. Words: {len(words)}."
    except Exception as e:
        print(f"❌ Step 4 LLM Strike failed: {e}")
        new_reply = "Bestie, I literally love that fit plan so much! Tell me more about what layers we are locking onto today."
        steps_log[3]["status"] = "Failure"
        steps_log[3]["details"] = f"LLM error: {str(e)}"

    # =========================================================
    # STEP 5: POST-CHAT CLEANUP & BACKGROUND LEARNING
    # =========================================================
    try:
        # Spawn background learning task
        asyncio.create_task(learning_background_task(user_id, user_text, dynamic_memory))
        
        steps_log[4]["status"] = "Success"
        steps_log[4]["details"] = "Spawned active learning thread."
    except Exception as e:
        print(f"❌ Step 5 save failed: {e}")
        steps_log[4]["status"] = "Failure"
        steps_log[4]["details"] = f"Write/Async dispatch error: {str(e)}"

    # Mirror/Sync with in-session state & session fallbacks
    state["messages"].append({"role": "user", "content": user_text})
    state["messages"].append({"role": "assistant", "content": new_reply})
    state["message_count"] = (message_count or 0) + 1

    # =========================================================
    # BACKGROUND HOOK: "JANITOR NODE" STATE SYNCHRONIZATION
    # =========================================================
    # To handle both real-time streams or standard message loops, the background task executes asynchronously
    # after generating Tokyo's final reply, ensuring zero latency overhead for the user.
    session_id = getattr(payload, "session_id", None) or f"session_{user_id}"
    background_tasks.add_task(trigger_janitor_sync, user_id, session_id, memory_threshold)

    return {
        "reply": new_reply,
        "text": new_reply,
        "state": state,
        "is_premium": is_paying_user,
        "steps_log": steps_log,
        "current_plan": current_plan
    }

    return {"error": "Invalid state configuration logic."}





# -------------------------------------------------------------
# STEP 8: Premium Activation Endpoint
# -------------------------------------------------------------



# -------------------------------------------------------------
# DATABASE SYNCHRONIZATION HELPERS
# -------------------------------------------------------------

async def save_profile_to_supabase(user_id: str, state: StylistState):
    if not supabase:
        return
    try:
        supabase.table("profiles").update({
            "user_status": state["user_status"],
            "onboarding_step": state["onboarding_step"],
            "message_count": state["message_count"]
        }).eq("id", user_id).execute()
    except Exception as e:
        print(f"Failed to update profile statistics for user {user_id}: {e}")

async def save_session_to_supabase(user_id: str, messages: List[dict]):
    if not supabase:
        return
    try:
        session_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, f"heist-session-{user_id}"))
        supabase.table("heist_sessions").upsert({
            "session_id": session_id,
            "user_id": user_id,
            "chat_history": messages,
            "updated_at": datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        print(f"Failed to upsert chat session records for user {user_id}: {e}")

# Config status query (fallback to mock)
@app.get("/api/config-status")
async def get_config_status():
    return {
        "superrag_configured": bool(os.getenv("SUPERMEMORY_API_KEY")),
        "gemini_api_configured": bool(os.getenv("GEMINI_API_KEY")),
        "supabase_configured": bool(SUPABASE_URL and SUPABASE_KEY)
    }

@app.get("/api/supabase-config")
async def get_supabase_config():
    supabase_url = os.getenv("VITE_SUPABASE_URL") or os.getenv("SUPABASE_URL", "")
    supabase_anon_key = os.getenv("VITE_SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY", "")
    if not supabase_url or not supabase_anon_key:
        return JSONResponse(
            status_code=200,
            content={
                "VITE_SUPABASE_URL": SUPABASE_URL,
                "VITE_SUPABASE_ANON_KEY": SUPABASE_KEY
            }
        )
    return {
        "VITE_SUPABASE_URL": supabase_url,
        "VITE_SUPABASE_ANON_KEY": supabase_anon_key
    }



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8500)
export_app = app
