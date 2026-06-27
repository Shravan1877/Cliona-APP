import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import { TIER_CONFIG } from "./src/lib/tier_config.js";
import { spawn } from "child_process";
import DodoPayments from "dodopayments";
import { Webhooks } from "@dodopayments/express";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "15mb" }));

// Pseudo-UUID deterministic translations to map custom sandbox identifiers safely to standard UUID formatting
function getSafeUUID(rawId: string): string {
  const clean = (rawId || "").slice(0, 100).trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return clean;
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hex = Math.abs(hash).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex.substring(0, 12)}`;
}

// -------------------------------------------------------------
// Supabase Server Client lazy-initialization (Safe guard)
// -------------------------------------------------------------
let supabaseServerClient: any = null;
const HARDCODED_SUPABASE_URL = "https://xhsxktsnmrrsxcmouqki.supabase.co";
const HARDCODED_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhoc3hrdHNubXJyc3hjbW91cWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDUwNzcsImV4cCI6MjA5MzMyMTA3N30.A-ja-yPnlFT3zMP5ew7HSYETN4-5aiClLyW1YXYWDfA";

function getSupabaseServerClient() {
  if (!supabaseServerClient) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || HARDCODED_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || HARDCODED_SUPABASE_ANON_KEY;
    if (url && key) {
      supabaseServerClient = createClient(url, key);
      console.log("✅ Supabase Server Client successfully initialized.");
    } else {
      console.warn("⚠️ Supabase Credentials missing! Cannot execute database state actions.");
    }
  }
  return supabaseServerClient;
}

// -------------------------------------------------------------
// Dodo Payments Client lazy-initialization (Safe guard)
// -------------------------------------------------------------
let dodoClientInstance: DodoPayments | null = null;

function getDodoClient(): DodoPayments {
  if (!dodoClientInstance) {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    if (!apiKey) {
      throw new Error("DODO_PAYMENTS_API_KEY environment variable is required but missing.");
    }
    dodoClientInstance = new DodoPayments({
      bearerToken: apiKey,
      environment: (process.env.DODO_PAYMENTS_ENVIRONMENT as 'test_mode' | 'live_mode') || 'test_mode',
    });
    console.log(`✅ Dodo Payments Client successfully initialized in ${(process.env.DODO_PAYMENTS_ENVIRONMENT || 'test_mode')} mode.`);
  }
  return dodoClientInstance;
}

// -------------------------------------------------------------
// In-Memory Session states
// -------------------------------------------------------------
interface InSessionState {
  user_id: string;
  message_count: number;
  requires_paywall: boolean;
  detected_vibe: string;
  physical_traits: {
    skin_color: string;
    skin_undertone: string;
    hair_type: string;
    hair_color: string;
    bone_structure?: string;
  };
  onboarding_step: number; // 0 to 10
  messages: { id: string; role: "user" | "assistant"; content: string; timestamp: string }[];
  is_unlocked: boolean;
}

const sessionStore: Record<string, InSessionState> = {};


// -------------------------------------------------------------
// Supermemory RAG implementation
// -------------------------------------------------------------
async function querySupermemory(q: string, userId: string): Promise<string> {
  const supermemoryKey = process.env.SUPERMEMORY_API_KEY;
  if (!supermemoryKey) {
    // Elegant system backup context containing luxury styling rules (Cliona's knowledge pool)
    return `
      Styling context from Cliona Theory:
      - Deep slate, rich gray, charcoal, and dark teal complements cool undertones flawlessly.
      - Baggy/oversized silhouettes look spectacular aligned with cropped, fitted elements to maintain height and crisp posture.
      - Contrast and proportion balancing (60/40 rule) provides effortless streetwear and Old Money styles. Keep accessories minimal yet high-concept.
    `;
  }

  try {
    const url = "https://api.supermemory.ai/v4/profile";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-supermemory-api-key": supermemoryKey,
      },
      body: JSON.stringify({
        containerTag: `user_${userId}`,
        q: q,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const staticProfile = data.profile?.static?.join("\n") || "";
      const dynamicProfile = data.profile?.dynamic?.join("\n") || "";
      const searchMemories = data.searchResults?.results?.map((r: any) => r.memory).join("\n") || "";

      return `
        User Supermemory static facts: 
        ${staticProfile}
        
        Recent context: 
        ${dynamicProfile}
        
        Relevant memories: 
        ${searchMemories}
      `;
    }
  } catch (error) {
    console.error("Supermemory query failed:", error);
  }
  return "";
}

async function addToSupermemory(content: string, userId: string): Promise<boolean> {
  const supermemoryKey = process.env.SUPERMEMORY_API_KEY;
  if (!supermemoryKey) return false;

  try {
    const url = "https://api.supermemory.ai/v3/documents";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-supermemory-api-key": supermemoryKey,
      },
      body: JSON.stringify({
        content,
        containerTag: `user_${userId}`,
      }),
    });
    return response.ok;
  } catch (error) {
    console.error("Supermemory write failed:", error);
  }
  return false;
}

// Helper to determine if input contains life rambling / venting
function isVentingOrYapping(text: string): boolean {
  const lowercase = text.toLowerCase();
  const yappingPhrases = [
    "ex", "boyfriend", "girlfriend", "breakup", "break up", "relationship",
    "vent", "angry", "sad", "unhappy", "depressed", "situationship", "toxic",
    "boss", "work", "hate my", "whining", "job", "stress", "grind", "fatigued"
  ];
  return yappingPhrases.some((phrase) => lowercase.includes(phrase));
}

// -------------------------------------------------------------
// API Endpoints
// -------------------------------------------------------------

app.get("/api/health", (req, res) => {
  res.json({ status: "alive" });
});

// Serve Supabase configuration from environment variables at runtime to the client application
app.get("/api/supabase-config", (req, res) => {
  res.json({
    url: HARDCODED_SUPABASE_URL,
    key: HARDCODED_SUPABASE_ANON_KEY,
  });
});

// Diagnostic API status checks
app.get("/api/config-status", (req, res) => {
  res.json({
    superrag_configured: !!process.env.SUPERMEMORY_API_KEY,
    groq_configured: !!process.env.GROQ_API_KEY,
    gemini_configured: !!process.env.GEMINI_API_KEY
  });
});

// Additional Sync & Admin Routes for Development
app.post("/api/chat/batch-sync", (req, res) => {
  const { user_id: raw_user_id, messages } = req.body;
  if (!raw_user_id) {
    return res.status(400).json({ error: "Missing user_id parameter." });
  }
  const user_id = getSafeUUID(raw_user_id);

  if (!sessionStore[user_id]) {
    sessionStore[user_id] = {
      user_id,
      message_count: 0,
      requires_paywall: false,
      detected_vibe: "COOL",
      physical_traits: {
        skin_color: "Not scanned",
        skin_undertone: "Not scanned",
        hair_type: "Not scanned",
        hair_color: "Not scanned",
        bone_structure: "Not scanned",
      },
      onboarding_step: 0,
      messages: [],
      is_unlocked: false,
    };
  }

  const session = sessionStore[user_id];
  const existingIds = new Set(session.messages.map(m => m.id));
  let synced = 0;

  for (const msg of (messages || [])) {
    if (!existingIds.has(msg.id)) {
      session.messages.push({
        id: msg.id,
        role: msg.role === "cliona" ? "assistant" : msg.role,
        content: msg.content,
        timestamp: msg.timestamp || new Date().toISOString()
      });
      synced++;
    }
  }
  session.message_count = session.messages.length;
  console.log(`[Batch Sync Express] Synced ${synced} messages for user ${user_id}. Total messages: ${session.message_count}`);
  return res.json({ status: "ok", synced });
});

app.get("/api/chat/history/:user_id", async (req, res) => {
  const { user_id: raw_user_id } = req.params;
  const before_timestamp = req.query.before_timestamp as string | undefined;
  const limitQuery = req.query.limit as string | undefined;
  const limitVal = limitQuery ? parseInt(limitQuery, 10) : 20;

  if (!raw_user_id) {
    return res.status(400).json({ error: "Missing user_id parameter in path." });
  }
  const user_id = getSafeUUID(raw_user_id);

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    console.warn(`[Get Chat History] Supabase client is missing. Cannot fetch database messages for user: ${user_id}`);
    return res.json({ messages: [], has_more: false });
  }

  try {
    let query = supabase
      .from("messages")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false })
      .limit(limitVal);

    if (before_timestamp) {
      query = query.lt("created_at", before_timestamp);
    }

    const { data: dbMessages, error } = await query;

    if (error) {
      console.error("⚠️ Failed to fetch chat history from Supabase:", error);
      return res.status(500).json({ error: "Database query failed.", details: error.message });
    }

    // Reverse resulting array to keep it in chronological order before sending
    const messages = (dbMessages || []).slice().reverse();
    const has_more = (dbMessages || []).length === limitVal;

    console.log(`[Get Chat History] Fetched ${messages.length} messages for user: ${user_id}. Has more: ${has_more}`);
    return res.json({ messages, has_more });
  } catch (error: any) {
    console.error("❌ Catastrophic error in GET chat history endpoint:", error);
    return res.status(500).json({ error: "Internal server error.", details: error.message || error });
  }
});


app.post("/api/admin/update-profile", (req, res) => {
  const { user_id: raw_user_id, plan, user_status, is_premium } = req.body;
  if (!raw_user_id) {
    return res.status(400).json({ error: "Missing user_id parameter." });
  }
  const user_id = getSafeUUID(raw_user_id);

  if (!sessionStore[user_id]) {
    sessionStore[user_id] = {
      user_id,
      message_count: 0,
      requires_paywall: false,
      detected_vibe: "COOL",
      physical_traits: {
        skin_color: "Not scanned",
        skin_undertone: "Not scanned",
        hair_type: "Not scanned",
        hair_color: "Not scanned",
        bone_structure: "Not scanned",
      },
      onboarding_step: 0,
      messages: [],
      is_unlocked: false,
    };
  }

  const session = sessionStore[user_id];
  session.is_unlocked = !!is_premium;
  session.requires_paywall = (user_status === "STATE_3_PAYWALL");
  if (user_status === "STATE_4_PREMIUM") {
    session.onboarding_step = 10;
  } else if (user_status === "STATE_1_NEW") {
    session.onboarding_step = 0;
  }

  // Also sync to Supabase database in background
  const supabase = getSupabaseServerClient();
  if (supabase && user_id) {
    supabase
      .from("profiles")
      .update({
        plan: plan || "free",
        user_status: user_status || "STATE_1_NEW",
        is_premium: !!is_premium
      })
      .eq("id", user_id)
      .then(({ error }) => {
        if (error) console.error("⚠️ Failed to sync admin update to profiles: ", error);
        else console.log(`[Admin Update Sync] Successfully updated Supabase profiles: plan=${plan}, status=${user_status}`);
      });
  }

  console.log(`[Admin Update Express] Updated user ${user_id} profile state to: ${user_status}, plan: ${plan}`);
  return res.json({
    status: "success",
    message: `Successfully updated user profile params.`,
    user_status,
    is_premium
  });
});

app.get(["/auth/callback", "/auth/callback/"], (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Completing Authentication</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0c0a09;
            color: #f5f5f4;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
          }
          .card {
            background-color: #1c1917;
            border: 2px solid #2e2a24;
            padding: 30px;
            border-radius: 20px;
            max-width: 400px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.5);
          }
          h2 {
            margin-top: 0;
            color: #d97706;
            font-style: italic;
          }
          p {
            color: #a8a29e;
            font-size: 14px;
            line-height: 1.5;
          }
          .spinner {
            width: 40px;
            height: 40px;
            border: 4px solid #d97706;
            border-top-color: transparent;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 20px auto;
          }
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>PROCESS SIGN IN</h2>
          <div class="spinner"></div>
          <p>We are finishing your secure authentication with Google. This window will close automatically.</p>
        </div>
        <script>
          if (window.opener) {
            window.opener.postMessage({
              type: 'OAUTH_AUTH_SUCCESS',
              search: window.location.search,
              hash: window.location.hash
            }, '*');
            window.close();
          } else {
            window.location.href = '/' + window.location.search + window.location.hash;
          }
        </script>
      </body>
    </html>
  `);
});

app.post("/api/auth/generate-reset-link", async (req, res) => {
  const { email, redirectTo } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required bestie." });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return res.status(500).json({ error: "Supabase client not initialized on server." });
  }

  try {
    console.log(`[Generate Reset Link]: Generating secure recovery link for ${email}`);
    const { data, error } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo || `${req.headers.origin || "http://localhost:3000"}/update-password`
      }
    });

    if (error) {
      console.error("[Generate Reset Link] Supabase admin error:", error);
      return res.status(400).json({ error: error.message });
    }

    if (!data || !data.properties || !data.properties.action_link) {
      return res.status(500).json({ error: "Failed to generate a secure recovery link. Missing properties." });
    }

    console.log("[Generate Reset Link] Successfully generated recovery link.");
    return res.json({
      status: "success",
      action_link: data.properties.action_link
    });
  } catch (err: any) {
    console.error("[Generate Reset Link] Exception:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

// -------------------------------------------------------------
// Dodo Payments Integration Endpoints
// -------------------------------------------------------------

app.post("/api/checkout", async (req, res) => {
  try {
    const { user_id: raw_user_id, target_tier } = req.body;
    if (!raw_user_id) {
      return res.status(400).json({ error: "Missing user_id parameter in payload." });
    }
    const user_id = getSafeUUID(raw_user_id);
    const tier = String(target_tier || "core").toLowerCase().trim();

    console.log(`[Checkout Session] Creating session for user: ${user_id}, target_tier: ${tier}`);

    const supabase = getSupabaseServerClient();
    let isIndiaOrAsia = false;
    let email = "";
    let fullName = "";

    if (supabase) {
      const { data: profile, error: profileErr } = await supabase
        .from("profiles")
        .select("timezone, email, full_name")
        .eq("id", user_id)
        .maybeSingle();

      if (profileErr) {
        console.error("⚠️ [Checkout Session] Supabase fetch profile error:", profileErr);
      }

      if (profile) {
        if (profile.timezone && profile.timezone.includes("Asia")) {
          isIndiaOrAsia = true;
          console.log(`[Checkout Session] Detected Asia timezone: ${profile.timezone}`);
        }
        email = profile.email || "";
        fullName = profile.full_name || "";
      }
    }

    // Product ID Mapping:
    // Core (Global/USD): pdt_0NgQpVRWuwyRaV0uKRrVj
    // Core (India/INR): pdt_0NgQrFtV7A7YSTag8qMfu
    // Flux (Global/USD): pdt_0NgQqNG5io5in8WdOdU9G
    // Flux (India/INR): pdt_0NgQr5MNqjZ2JNYhZkWYP
    // Unlocked (Global/USD): pdt_0NgQqgl41rwK6j72SoudZ
    // Unlocked (India/INR): pdt_0NgQqvDmc0abvnHYt4qph
    let productId = "";
    if (tier === "core") {
      productId = isIndiaOrAsia ? "pdt_0NgQrFtV7A7YSTag8qMfu" : "pdt_0NgQpVRWuwyRaV0uKRrVj";
    } else if (tier === "flux") {
      productId = isIndiaOrAsia ? "pdt_0NgQr5MNqjZ2JNYhZkWYP" : "pdt_0NgQqNG5io5in8WdOdU9G";
    } else if (tier === "unlocked") {
      productId = isIndiaOrAsia ? "pdt_0NgQqvDmc0abvnHYt4qph" : "pdt_0NgQqgl41rwK6j72SoudZ";
    } else {
      productId = isIndiaOrAsia ? "pdt_0NgQrFtV7A7YSTag8qMfu" : "pdt_0NgQpVRWuwyRaV0uKRrVj"; // Fallback to core
    }

    const dodoClient = getDodoClient();
    
    // Fallbacks if email/fullName are empty
    const customerEmail = email || "customer@cliona.ai";
    const customerName = fullName || "Cliona Customer";

    // Generate checkout session
    const session = await dodoClient.checkoutSessions.create({
      product_cart: [
        {
          product_id: productId,
          quantity: 1,
        }
      ],
      customer: {
        email: customerEmail,
        name: customerName,
      },
      return_url: `${req.headers.referer || process.env.APP_URL || 'http://localhost:3000'}/`,
      metadata: {
        user_id: user_id,
        target_tier: tier,
      }
    });

    console.log(`✅ [Checkout Session Created] ID=${session.session_id}, url=${session.checkout_url}`);
    return res.json({
      checkout_url: session.checkout_url
    });

  } catch (err: any) {
    console.error("[Checkout Session] Exception:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
});

const webhookKey = process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim() || Buffer.from("development-webhook-key").toString("base64");

if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY?.trim()) {
  console.warn("⚠️ [Dodo Webhook] DODO_PAYMENTS_WEBHOOK_KEY is not set; using a development fallback.");
}

app.post('/api/webhooks/dodo', Webhooks({
  webhookKey,
  onPaymentSucceeded: async (payload) => {
    console.log("🔔 [Dodo Webhook] onPaymentSucceeded payload:", JSON.stringify(payload, null, 2));
    
    const email = payload.data?.customer?.email;
    const rawMetadata = payload.data?.metadata || {};
    let userId = rawMetadata.user_id;
    const plan = rawMetadata.target_tier || "core";

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      console.error("❌ [Dodo Webhook] Supabase client is not initialized.");
      return;
    }

    // If userId is not in metadata, query by email
    if (!userId && email) {
      console.log(`🔍 [Dodo Webhook] Querying profile by email: ${email}`);
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (profileData) {
        userId = profileData.id;
        console.log(`🎯 [Dodo Webhook] Found user_id by email: ${userId}`);
      } else {
        console.warn(`⚠️ [Dodo Webhook] No profile found for email ${email}`);
      }
    }

    if (userId) {
      const safeUserId = getSafeUUID(userId);
      console.log(`⚡ [Dodo Webhook] Updating profile to premium for user_id: ${safeUserId}, plan: ${plan}`);

      const { error: updateError } = await supabase
        .from("profiles")
        .update({
          is_premium: true,
          user_status: "STATE_4_PREMIUM",
          plan: plan,
          monthly_groq_tokens: 0,
          daily_photo_queries: 0,
          token_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          last_photo_query_date: new Date().toISOString()
        })
        .eq("id", safeUserId);

      if (updateError) {
        console.error(`❌ [Dodo Webhook] Failed to update profile table:`, updateError);
      } else {
        console.log(`✅ [Dodo Webhook] Successfully enabled premium status in Supabase profiles: plan=${plan}`);
        
        // Update in-memory session store
        const session = sessionStore[safeUserId];
        if (session) {
          session.is_unlocked = true;
          session.requires_paywall = false;
          session.onboarding_step = 10;
          console.log(`🚀 [Dodo Webhook] Synchronized in-memory session state for user ${safeUserId}`);
        }
      }
    } else {
      console.error("❌ [Dodo Webhook] Unable to determine user_id from metadata or email.");
    }
  }
}));

app.post("/api/upgrade-premium", (req, res) => {
  const { user_id: raw_user_id, plan: requestedPlan } = req.body;
  if (!raw_user_id) {
    return res.status(400).json({ error: "Missing user_id parameter in payload." });
  }
  const user_id = getSafeUUID(raw_user_id);

  if (!sessionStore[user_id]) {
    sessionStore[user_id] = {
      user_id,
      message_count: 0,
      requires_paywall: false,
      detected_vibe: "COOL",
      physical_traits: {
        skin_color: "Not scanned",
        skin_undertone: "Not scanned",
        hair_type: "Not scanned",
        hair_color: "Not scanned",
        bone_structure: "Not scanned",
      },
      onboarding_step: 10,
      messages: [],
      is_unlocked: true,
    };
  }

  const session = sessionStore[user_id];
  session.is_unlocked = true;
  session.requires_paywall = false;
  
  const hypeMessage = "Omg you actually trusted me and unlocked Premium. I remember absolutely everything we just talked about. Let's build this master blueprint.";
  const hasHype = session.messages.some(m => m.content === hypeMessage);
  if (!hasHype) {
    session.messages.push({
      id: `msg_ai_premium_hype_${Date.now()}`,
      role: "assistant",
      content: hypeMessage,
      timestamp: new Date().toISOString()
    });
    session.message_count += 1;
  }

  // Also sync to Supabase database in background
  const supabase = getSupabaseServerClient();
  const nextPlan = requestedPlan || "core"; // Fallback to core if not provided
  if (supabase && user_id) {
    supabase
      .from("profiles")
      .update({
        user_status: "STATE_4_PREMIUM",
        is_premium: true,
        plan: nextPlan
      })
      .eq("id", user_id)
      .then(({ error }) => {
        if (error) console.error("⚠️ Failed to sync upgrade-premium to profiles: ", error);
        else console.log(`[User Plan Upgrade Sync] Successfully enabled premium status: plan=${nextPlan}`);
      });
  }

  return res.json({
    status: "success",
    user_status: "STATE_4_PREMIUM",
    is_premium: true,
    text: hypeMessage,
    reply: hypeMessage
  });
});

// Real-time Chat with Cliona leveraging Groq for text & Gemini 3.5 Flash for image/multimodal
app.post("/api/cliona/chat", async (req, res) => {
  const { user_id: raw_user_id, message, history, photo, is_test, is_payment_hype, plan } = req.body;
  if (!raw_user_id) {
    return res.status(400).json({ error: "Missing user_id parameter in payload." });
  }
  const user_id = getSafeUUID(raw_user_id);
  const userText = message ? String(message).trim() : "";
  const styleAnswers: Record<string, any> = {};
  
  if (!userText && !photo && !is_payment_hype) {
    return res.status(400).json({ error: "Message or photo is required." });
  }

  // -------------------------------------------------------------
  // Phase 1 & 3: Database Profiles Matching & Reset Handler
  // -------------------------------------------------------------
  const supabase = getSupabaseServerClient();
  let profile: any = null;

  if (supabase && user_id) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user_id)
        .single();
      
      if (error || !data) {
        // Create user profile baseline row if does not exist in Supabase
        const insertData = {
          id: user_id,
          user_status: "STATE_1_NEW",
          onboarding_step: 0,
          message_count: 0,
          plan: "free",
          is_premium: false,
          monthly_groq_tokens: 0,
          daily_photo_queries: 0,
          last_photo_query_date: new Date().toISOString(),
          token_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
        };
        const { data: inserted, error: insertErr } = await supabase
          .from("profiles")
          .insert([insertData])
          .select()
          .single();
        if (!insertErr && inserted) {
          profile = inserted;
        }
      } else {
        profile = data;
      }
    } catch (err) {
      console.warn("⚠️ Supabase fetching failed, loading local system profile state.");
    }
  }

  // Create baseline fallback profile object
  if (!profile) {
    profile = {
      id: user_id,
      plan: plan || "free",
      message_count: sessionStore[user_id]?.message_count || 0,
      monthly_groq_tokens: 0,
      daily_photo_queries: 0,
      last_photo_query_date: new Date().toISOString(),
      token_reset_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    };
  }

  // --- Reset logic ---
  const now = new Date();
  let needsDbUpdate = false;
  const dbUpdates: any = {};

  const tokenResetDate = profile.token_reset_date ? new Date(profile.token_reset_date) : null;
  if (!tokenResetDate || now >= tokenResetDate) {
    dbUpdates.monthly_groq_tokens = 0;
    dbUpdates.token_reset_date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    needsDbUpdate = true;
    profile.monthly_groq_tokens = 0;
    profile.token_reset_date = dbUpdates.token_reset_date;
    console.log(`[MONETIZATION RESET] Resetting monthly_groq_tokens for user ${user_id}`);
  }

  const lastPhotoQueryDate = profile.last_photo_query_date ? new Date(profile.last_photo_query_date) : null;
  const isDifferentDay = !lastPhotoQueryDate || 
    now.getUTCFullYear() !== lastPhotoQueryDate.getUTCFullYear() || 
    now.getUTCMonth() !== lastPhotoQueryDate.getUTCMonth() || 
    now.getUTCDate() !== lastPhotoQueryDate.getUTCDate();

  if (isDifferentDay) {
    dbUpdates.daily_photo_queries = 0;
    dbUpdates.last_photo_query_date = now.toISOString();
    needsDbUpdate = true;
    profile.daily_photo_queries = 0;
    profile.last_photo_query_date = dbUpdates.last_photo_query_date;
    console.log(`[MONETIZATION RESET] Resetting daily_photo_queries for user ${user_id}`);
  }

  if (needsDbUpdate && supabase && user_id) {
    await supabase
      .from("profiles")
      .update(dbUpdates)
      .eq("id", user_id);
  }

  // Resolve plan limits
  const activePlanRaw = profile.plan || plan || "free";
  const currentPlan = activePlanRaw.toLowerCase().trim();
  const limits = TIER_CONFIG[currentPlan] || TIER_CONFIG.free;

  // --- 1. Total Message Gate (Free tier capped at 10 total messages) ---
  const cachedMessagesCount = profile.message_count ?? (sessionStore[user_id]?.message_count || 0);
  if (currentPlan === "free" && cachedMessagesCount >= 10) {
    console.log(`🚨 [PAYWALL BLOCKED] Free user ${user_id} capped: messages=${cachedMessagesCount}`);
    return res.status(403).json({
      error: "FREE_LIMIT_REACHED",
      message: "You have used all 10 free trial messages! Please upgrade to a premium plan to continue."
    });
  }

  // --- 2. Photo Gate ---
  if (photo) {
    if (profile.daily_photo_queries >= limits.photoQueryLimit) {
      console.log(`🚨 [PAYWALL BLOCKED] Daily photo styling limit reached for user ${user_id}.`);
      return res.status(403).json({
        error: "PHOTO_LIMIT_REACHED",
        message: "You've used all your daily photo styling requests!"
      });
    }
  }

  // --- 3. Token Gate ---
  // OpenRouter is now the primary provider, so allow chat requests to proceed unless the plan is explicitly blocked.
  if (limits.groqTokenLimit === 0 && currentPlan === "free") {
    console.log(`ℹ️ [CHAT ALLOW] Free plan request allowed to proceed with OpenRouter provider.`);
  }

  try {
    const user_timezone = req.body.user_timezone || req.headers["x-user-timezone"] || "Asia/Kolkata";
    const current_time_iso = req.body.current_time_iso || new Date().toISOString();

    // Call Python engine
    const pythonResponse = await fetch("http://127.0.0.1:8500/api/internal/cliona/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        user_id: user_id,
        message: userText,
        history: history || [],
        image_data: photo || null,
        user_timezone: user_timezone,
        current_time_iso: current_time_iso
      })
    });

    if (!pythonResponse.ok) {
      const errorText = await pythonResponse.text();
      console.error(`[Proxy error] Python backend status ${pythonResponse.status}: ${errorText}`);
      return res.status(500).json({ error: "PYTHON_ENGINE_ERROR", message: "Sorry bestie, my engine had a small hiccup. Shall we try again?" });
    }

    const pythonData: any = await pythonResponse.json();
    const assistantReply = pythonData.reply || pythonData.text || "";

    // Calculate estimated tokens for the interaction
    const calculatedTokens = Math.ceil((userText.length + assistantReply.length + (photo ? 1000 : 0)) / 4) + 1500;
    const updatedTokens = (profile.monthly_groq_tokens || 0) + calculatedTokens;
    const updatedPhotoQueries = (profile.daily_photo_queries || 0) + (photo ? 1 : 0);
    const updatedMessageCount = (profile.message_count || 0) + 1;

    // Await saving to heist_sessions and messages tables in Supabase
    if (supabase && user_id) {
      // 1. Save assistant message to messages table
      await supabase
        .from("messages")
        .insert([
          {
            user_id: user_id,
            role: "assistant",
            content: assistantReply,
            created_at: new Date().toISOString()
          }
        ]);

      // 2. Fetch current heist_sessions to get chat history
      const { data: sessionData } = await supabase
        .from("heist_sessions")
        .select("chat_history, session_id")
        .eq("user_id", user_id)
        .maybeSingle();

      let updatedHistory = [];
      if (sessionData && Array.isArray(sessionData.chat_history)) {
        updatedHistory = [...sessionData.chat_history];
      } else {
        // Fallback to history array passed in body
        updatedHistory = (history || []).map((m: any) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp || new Date().toISOString()
        }));
      }

      // Check if last message is already userText to avoid duplicating user message in the session history if it exists
      const lastMsg = updatedHistory[updatedHistory.length - 1];
      if (!lastMsg || lastMsg.content !== userText) {
        updatedHistory.push({
          role: "user",
          content: userText,
          timestamp: new Date().toISOString(),
          id: `msg_user_${Date.now()}`
        });
      }

      // Append assistant message
      updatedHistory.push({
        role: "assistant",
        content: assistantReply,
        timestamp: new Date().toISOString(),
        id: `msg_ai_${Date.now()}`
      });

      const sessionId = sessionData?.session_id || getSafeUUID(`heist-session-${user_id}`);

      await supabase
        .from("heist_sessions")
        .upsert({
          session_id: sessionId,
          user_id: user_id,
          chat_history: updatedHistory,
          updated_at: new Date().toISOString()
        });

      // 3. Update profile's consumption counters
      await supabase
        .from("profiles")
        .update({
          monthly_groq_tokens: updatedTokens,
          daily_photo_queries: updatedPhotoQueries,
          message_count: updatedMessageCount
        })
        .eq("id", user_id);
    }

    // Update Node's memory session store if exists
    if (sessionStore[user_id]) {
      sessionStore[user_id].message_count = updatedMessageCount;
      sessionStore[user_id].messages.push({
        id: `msg_user_${Date.now()}`,
        role: "user",
        content: userText,
        timestamp: new Date().toISOString()
      });
      sessionStore[user_id].messages.push({
        id: `msg_ai_${Date.now()}`,
        role: "assistant",
        content: assistantReply,
        timestamp: new Date().toISOString()
      });
    }

    // Return the final JSON to the React frontend
    return res.json({
      ...pythonData,
      text: assistantReply,
      text_response: assistantReply
    });

  } catch (err: any) {
    console.error("Cliona Proxy Error:", err);
    return res.status(500).json({
      error: "Gateway Proxy Error",
      message: "Sorry bestie, my engine had a small hiccup. Shall we try again?",
      details: String(err?.message || err)
    });
  }
});

// Configure Vite on development & start server
async function startServer() {
  // Start Python FastAPI uvicorn engine process on port 8500
  console.log("Starting Python dual-engine backend on port 8500...");
  const pythonProcess = spawn("python3", ["-m", "uvicorn", "backend_python:app", "--host", "0.0.0.0", "--port", "8500"], {
    stdio: "inherit"
  });

  pythonProcess.on("error", (err) => {
    console.error("Failed to start Python backend process:", err);
  });

  pythonProcess.on("close", (code) => {
    console.log(`Python backend process exited with code: ${code}`);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Host ingress mapping binds to PORT and host '0.0.0.0'
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Cliona node fullstack server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Error starting server:", error);
});

export default app;
