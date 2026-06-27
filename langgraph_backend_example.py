"""
Cliona Stylist AI Chatbot: Persistent LangGraph Thread Storage Engine (Fully Asynchronous)
This module implements production-ready async backend code for thread state persistence 
using PostgreSQL (Supabase), Async LangGraph checkpoints, FastAPI, and Async Postgres Connection Pooling.

Requirements:
    pip install langgraph langgraph-checkpoint-postgres psycopg[binary] psycopg-pool fastapi uvicorn langchain-core
"""

import os
import logging
from typing import List, Dict, Any, Optional
from uuid import UUID
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, status
from pydantic import BaseModel, Field

# 1. Async LangGraph and Postgres checkpointer imports
from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from psycopg_pool import AsyncConnectionPool

# Representative LangGraph agent compilation dependencies
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from langgraph.graph import StateGraph, START, END, MessagesState

# Set up clean logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("heist_persisted_storage")

# Retrieve Supabase Connection URI (PostgreSQL) from environment variables
SUPABASE_DATABASE_URL = os.environ.get(
    "SUPABASE_DATABASE_URL", 
    "postgresql://postgres:your-supabase-password@your-supabase-host:5432/postgres?sslmode=require"
)

# -------------------------------------------------------------
# STEP 1: CONFIGURE ASYNC PSYCOP-POOL CONNECTION POOL & CHECKPOINTER
# -------------------------------------------------------------

# We configure an async thread-safe connection pool with psycopg_pool.
# Scale sizes configured for highly concurrent throughput (min: 5, max: 30)
# 'open' is set to False initially so it can be managed cleanly inside the FastAPI lifespan context.
connection_pool = AsyncConnectionPool(
    conninfo=SUPABASE_DATABASE_URL,
    min_size=5,
    max_size=30,
    open=False,
    kwargs={"autocommit": True}  # Autocommit is recommended for LangGraph state checkpoint writers
)

# Initialize the AsyncPostgresSaver checkpointer, passing our connection pool
checkpointer = AsyncPostgresSaver(connection_pool)


# -------------------------------------------------------------
# STEP 2: DEFINE & COMPILE THE LANGGRAPH AGENT WITH PERSISTENCE
# -------------------------------------------------------------

def tokyo_wingman_node(state: MessagesState) -> Dict[str, Any]:
    """Tokyo AI wingman core stylistic behavior node."""
    user_messages = [msg for msg in state["messages"] if isinstance(msg, HumanMessage)]
    last_msg_content = user_messages[-1].content if user_messages else "Pending preferences."
    
    # Custom Tokyo response text crafting based on style preferences
    reply_text = (
        f"Aesthetic check locked, bestie. Looking over your style direction: \"{last_msg_content}\". "
        "I'm pairing this with heavy neutral streetwear and high-contrast proportions. "
        "No basic fits on my watch! What's our next target pieces?"
    )
    return {"messages": [AIMessage(content=reply_text)]}

# Initialize StateGraph using LangGraph MessagesState model (handles automatic message appending)
workflow = StateGraph(MessagesState)
workflow.add_node("tokyo_stylist", tokyo_wingman_node)
workflow.add_edge(START, "tokyo_stylist")
workflow.add_edge("tokyo_stylist", END)

# COMPILE THE AGENT WITH OUR SUPABASE ASYNC CHECKPOINTER BACKEND
graph_agent = workflow.compile(checkpointer=checkpointer)


# -------------------------------------------------------------
# STEP 3: EXECUTION FUNCTION FOR DISPATCHING MESSAGES (ASYNC)
# -------------------------------------------------------------

def generate_thread_id(user_uuid: UUID, session_uuid: UUID) -> str:
    """
    Combines User UUID and Session UUID into a reliable, composite thread ID.
    This guarantees that stylistic message chains are properly compartmentalized 
    by user session metrics.
    """
    return f"{user_uuid}:{session_uuid}"


async def invoke_stylist_agent(user_uuid: UUID, session_uuid: UUID, user_message: str) -> Dict[str, Any]:
    """
    Dispatches a new user message to the historical thread context,
    automatically reloading state checkpoints and updating the checkpointer asynchronously.
    """
    thread_id = generate_thread_id(user_uuid, session_uuid)
    
    # Configure thread parameter configs recognized by LangGraph persistent graph
    config = {"configurable": {"thread_id": thread_id}}
    
    logger.info(f"Invoking styling model on thread asynchronously: {thread_id}")
    
    # Fire conversational step with existing thread history loaded via AsyncPostgresSaver checkpoint
    input_state = {"messages": [HumanMessage(content=user_message)]}
    result = await graph_agent.ainvoke(input_state, config=config)
    
    # Extract the latest updated message from Tokyo
    latest_message = result["messages"][-1]
    
    return {
        "status": "success",
        "thread_id": thread_id,
        "latest_role": "assistant" if isinstance(latest_message, AIMessage) else "user",
        "latest_content": latest_message.content
    }


# -------------------------------------------------------------
# STEP 4: FASTAPI REST ENDPOINTS WITH STORAGE ACCESS & LIFESPAN
# -------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manages connection pool startup and shutdown safely.
    Bypasses connection blocking and scale delays under massive concurrent workflows.
    """
    logger.info("Initializing high-concurrency AsyncConnectionPool to Supabase...")
    await connection_pool.open()
    logger.info("Supabase connection pool established.")
    yield
    logger.info("Shutting down servers: Releasing Supabase connection pool reserves...")
    await connection_pool.close()
    logger.info("Connection pool terminated safely.")


app = FastAPI(
    title="Cliona Stylist Storage Service (Async Scaling)",
    description="Microservice managing persistent LangGraph checkpoints and chatbot logs asynchronously via Supabase.",
    version="2.0.0",
    lifespan=lifespan
)


class ChatMessageResponse(BaseModel):
    id: Optional[str] = Field(None, description="Unique LangChain metadata ID")
    role: str = Field(..., description="Role indicator: user, assistant, system")
    content: str = Field(..., description="Plain text raw message context")


class InvokeRequest(BaseModel):
    message: str = Field(..., description="Style preferences user message payload")


@app.post(
    "/api/chat/invoke/{user_uuid}/{session_uuid}", 
    status_code=status.HTTP_200_OK,
    summary="Invoke styling agent on a specific user thread (Async)"
)
async def invoke_chat_thread(user_uuid: UUID, session_uuid: UUID, payload: InvokeRequest):
    """
    Executes a node run within a dedicated persistent thread config.
    Saves and checkpoints conversation variables to Supabase asynchronously on execution.
    """
    try:
        response_data = await invoke_stylist_agent(user_uuid, session_uuid, payload.message)
        return response_data
    except Exception as e:
        logger.error(f"Failed to invoke agent thread {user_uuid}:{session_uuid}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Stylist thread execution error: {str(e)}"
        )


@app.get(
    "/api/chat/history/{user_uuid}/{session_uuid}",
    response_model=List[ChatMessageResponse],
    summary="Fetch the complete conversational state history of a thread (Async)"
)
async def get_chat_history(user_uuid: UUID, session_uuid: UUID):
    """
    Loads historical state files from the Supabase Postgres database.
    Loops over current thread checkpoint messages array, extracts and serialization returns 
    a highly clean JSON array for frontend scroll-up renderings.
    """
    thread_id = generate_thread_id(user_uuid, session_uuid)
    config = {"configurable": {"thread_id": thread_id}}
    
    try:
        # Load state parameters asynchronously from AsyncPostgresSaver checkpointer
        state_info = await graph_agent.aget_state(config)
        
        # Guard clause: Return empty state list if thread contains no active database commits
        if not state_info or not state_info.values:
            logger.info(f"No existing checkpointer records detected for thread: {thread_id}")
            return []
            
        messages_list = state_info.values.get("messages", [])
        
        # Parse LangChain messages list securely into a clean, serialized JSON API format
        serialized_history: List[ChatMessageResponse] = []
        for msg in messages_list:
            if not isinstance(msg, BaseMessage):
                continue
                
            # Normalize message roles based on LangChain message instances
            if isinstance(msg, HumanMessage):
                role = "user"
            elif isinstance(msg, AIMessage):
                role = "assistant"
            else:
                role = getattr(msg, "type", "system")
                
            serialized_history.append(
                ChatMessageResponse(
                    id=getattr(msg, "id", None),
                    role=role,
                    content=msg.content
                )
            )
            
        logger.info(f"Successfully retrieved {len(serialized_history)} history messages for thread: {thread_id}")
        return serialized_history
        
    except Exception as e:
        logger.error(f"Failed to load chat records for thread {thread_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Unable to read conversation checkpoint: {str(e)}"
        )


if __name__ == "__main__":
    import uvicorn
    # Start on port 8000 for standard Python local development
    uvicorn.run("langgraph_backend_example:app", host="0.0.0.0", port=8000, reload=True)
