import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Send, Sparkles, User, RefreshCw, LogOut, CheckCircle2, Lock, Settings, X, Image } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import { getApiUrl } from "../lib/api";
import heistLogo from "../assets/Heist-Logo.png";
import { TIER_CONFIG } from "../lib/tier_config";
import GsapSerifHeader from "./GsapSerifHeader";

interface OnboardingProps {
  userEmail: string;
  userId: string;
  onLogout: () => void;
}

interface ChatMessage {
  id: string;
  role: "cliona" | "user" | "system";
  content: string;
  timestamp: Date;
  isNew?: boolean;
}

export function ClionaLogo({ className = "w-6 h-6", animate = true }: { className?: string; animate?: boolean }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${className} ${animate ? "animate-[bounce_3s_infinite_ease-in-out]" : ""}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      referrerPolicy="no-referrer"
    >
      {/* Base Sea-Sponge Blob Shape in Rich Orange */}
      <path
        d="M25,45 C15,35 25,15 45,18 C65,20 85,25 80,45 C75,65 85,85 65,88 C45,90 20,85 22,65 C24,55 35,55 25,45 Z"
        fill="#ff7a00"
        stroke="#e05300"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      {/* Organic Craters / Spots in Darker Orange/Rust */}
      <ellipse cx="40" cy="35" rx="10" ry="7" fill="#cc5200" opacity="0.85" />
      <ellipse cx="65" cy="50" rx="6" ry="9" fill="#cc5200" opacity="0.85" />
      <circle cx="35" cy="65" r="5" fill="#cc5200" opacity="0.85" />
      <circle cx="55" cy="72" r="8" fill="#cc5200" opacity="0.85" />
      <ellipse cx="60" cy="30" rx="5" ry="4" fill="#cc5200" opacity="0.85" />
      <circle cx="48" cy="52" r="4" fill="#cc5200" opacity="0.85" />
    </svg>
  );
}

// RFC4122 compliant UUID structure helper
function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Pseudo-UUID deterministic translations to map custom sandbox identifiers safely to standard UUID formatting
function getSafeUUID(rawId: string): string {
  const clean = rawId.trim();
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

interface StreamedTextProps {
  content: string;
  enabled: boolean;
  onCharacterTyped?: () => void;
  onComplete?: () => void;
}

function StreamedText({ content, enabled, onCharacterTyped, onComplete }: StreamedTextProps) {
  const [displayedText, setDisplayedText] = useState(enabled ? "" : content);

  useEffect(() => {
    if (!enabled) {
      setDisplayedText(content);
      return;
    }

    let currentIndex = 0;
    const streamSpeed = 10; // ms per step for rapid typing
    const stepSize = 4; // characters per step to type "super quickly"

    setDisplayedText("");

    const interval = setInterval(() => {
      currentIndex += stepSize;
      if (currentIndex >= content.length) {
        setDisplayedText(content);
        clearInterval(interval);
        if (onCharacterTyped) onCharacterTyped();
        if (onComplete) onComplete();
      } else {
        setDisplayedText(content.substring(0, currentIndex));
        if (onCharacterTyped) onCharacterTyped();
      }
    }, streamSpeed);

    return () => clearInterval(interval);
  }, [content, enabled]);

  return <>{displayedText}</>;
}

export default function Onboarding({ userEmail, userId, onLogout }: OnboardingProps) {
  const [local_chat_buffer, setLocalChatBuffer] = useState<ChatMessage[]>([]);
  const [ui_display_messages, setUiDisplayMessages] = useState<ChatMessage[]>([]);
  const [sync_cursor, setSyncCursor] = useState<number>(0);
  const [hasMoreHistory, setHasMoreHistory] = useState<boolean>(true);
  const [isFetchingHistory, setIsFetchingHistory] = useState<boolean>(false);

  const messages = ui_display_messages;

  const syncBatchToServer = async (bufferSnapshot: ChatMessage[], startIndex: number, endIndex: number) => {
    try {
      const sliceToSync = bufferSnapshot.slice(startIndex, endIndex + 1);
      if (sliceToSync.length === 0) return;

      console.log(`[Sliding Window] Synchronizing batch of ${sliceToSync.length} messages (indices ${startIndex} to ${endIndex}) to server...`);
      
      const response = await fetch(getApiUrl("/api/chat/batch-sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          messages: sliceToSync.map(m => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : new Date(m.timestamp).toISOString()
          }))
        })
      });

      if (response.ok) {
        console.log("[Sliding Window] Server returned 200 OK for batch sync.");
        if (startIndex === 0 && endIndex === 7) {
          setSyncCursor(8);
        } else if (startIndex === 8 && endIndex === 15) {
          // CRITICAL FIFO SHIFT: Only AFTER receiving a 200 OK success response from the server, cleanly slice the local_chat_buffer to remove the oldest 8 messages
          setLocalChatBuffer((prev) => {
            const nextBuffer = prev.slice(8, 16);
            console.log(`[Sliding Window] FIFO Shift completed. Buffer length of messages is now: ${nextBuffer.length}`);
            return nextBuffer;
          });
          setSyncCursor(8);
        }
      } else {
        console.warn(`[Sliding Window] Server returned non-200 status for batch sync: ${response.status}`);
      }
    } catch (err) {
      console.error("[Sliding Window] Error executing batch sync to server:", err);
    }
  };

  const setMessages = (newValue: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    setLocalChatBuffer((prev) => {
      const next = typeof newValue === "function" ? newValue(prev) : newValue;
      
      if (next.length > prev.length && prev.length > 0) {
        // This is an append! Immediately evaluate the length of the buffer.
        if (next.length === 8 && sync_cursor === 0) {
          // Checkpoint 1: If local_chat_buffer.length == 8 and sync_cursor == 0, trigger the asynchronous syncBatchToServer() function for messages 0 through 7
          syncBatchToServer(next, 0, 7);
        } else if (next.length === 16) {
          // Checkpoint 2: If local_chat_buffer.length == 16, trigger the asynchronous syncBatchToServer() function for messages 8 through 15
          syncBatchToServer(next, 8, 15);
        }
      } else {
        // Initial load or complete overwrite
        if (prev.length === 0 && next.length > 0) {
          const initCursor = next.length >= 8 ? 8 : next.length;
          setSyncCursor(initCursor);
        }
      }
      return next;
    });

    setUiDisplayMessages((prev) => {
      const next = typeof newValue === "function" ? newValue(prev) : newValue;
      return next;
    });
  };

  const addMessageToBuffer = (newMsg: ChatMessage) => {
    setMessages((prev) => [...prev, newMsg]);
  };

  const [userInput, setUserInput] = useState<string>("");
  const [isTyping, setIsTyping] = useState<boolean>(false);

  const [paywallActive, setPaywallActive] = useState<boolean>(false);
  const [paywallReason, setPaywallReason] = useState<string>("");
  const [monthlyGroqTokens, setMonthlyGroqTokens] = useState<number>(0);
  const [dailyPhotoQueries, setDailyPhotoQueries] = useState<number>(0);
  const [paymentSuccess, setPaymentSuccess] = useState<boolean>(
    userEmail.toLowerCase().trim() === "shravan.p1877@gmail.com"
  );
  const [isOnboardingDone, setIsOnboardingDone] = useState<boolean>(false);

  // Window scroll listener removed to prevent buggy jumping and empty space viewport flickering

  const [superragStatus, setSuperragStatus] = useState<{ active_api: boolean; characters: number } | null>(null);
  const [showRestorePrompt, setShowRestorePrompt] = useState<boolean>(false);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // --- ADMIN MODULE HOOKS & CONTROLS ---
  const isAdmin = userEmail.toLowerCase().trim() === "shravan.p1877@gmail.com";
  const [adminPlan, setAdminPlan] = useState<string>("core");
  const [adminIsUpdating, setAdminIsUpdating] = useState<boolean>(false);
  const [adminStepsLog, setAdminStepsLog] = useState<Array<{step: number; name: string; status: string; details: string}>>([
    { step: 1, name: "STEP 1: BASE IDENTITY", status: "Pending", details: "Awaiting next interaction" },
    { step: 2, name: "STEP 2: SHORT-TERM CONTEXT", status: "Pending", details: "Awaiting next interaction" },
    { step: 3, name: "STEP 3: TIERED SUPERMEMORY", status: "Pending", details: "Awaiting next interaction" },
    { step: 4, name: "STEP 4: LLM STRIKE", status: "Pending", details: "Awaiting next interaction" },
    { step: 5, name: "STEP 5: POST-CHAT & LEARNING", status: "Pending", details: "Awaiting next interaction" }
  ]);

  const handleAdminUpdateProfile = async (selectedPlan: string) => {
    setAdminIsUpdating(true);
    try {
      const response = await fetch(getApiUrl("/api/admin/update-profile"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          plan: selectedPlan,
          is_premium: selectedPlan !== "free"
        })
      });
      if (response.ok) {
        setAdminPlan(selectedPlan);
        
        // Synchronise client-side state
        if (selectedPlan !== "free") {
          setPaywallActive(false);
          setPaymentSuccess(true);
          setIsOnboardingDone(true);
        } else {
          setPaywallActive(false);
          setPaymentSuccess(false);
          setIsOnboardingDone(false);
        }
        alert("Success: Applied plan: '" + selectedPlan + "' and synced locally!");
      } else {
        const errorData = await response.json();
        alert(`Admin override failed: ${errorData.detail || "Unknown error"}`);
      }
    } catch (err: any) {
      alert(`Admin override connection error: ${err.message}`);
    } finally {
      setAdminIsUpdating(false);
    }
  };

  const [isUpgradingPlan, setIsUpgradingPlan] = useState<string | null>(null);

  const handleUpgradePlan = async (requestedPlan: string) => {
    setIsUpgradingPlan(requestedPlan);
    try {
      const response = await fetch(getApiUrl("/api/checkout"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          target_tier: requestedPlan
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.checkout_url) {
          window.location.href = data.checkout_url;
        } else {
          alert("Failed to generate payment session URL. Please try again.");
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(`Checkout failed: ${errData.error || "Please try again."}`);
      }
    } catch (e: any) {
      console.error(e);
      alert(`Checkout connection error: ${e.message}`);
    } finally {
      setIsUpgradingPlan(null);
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // Load initial SuperRAG API activation status check
  useEffect(() => {
    async function checkConfig() {
      try {
        const response = await fetch(getApiUrl("/api/config-status"));
        if (response.ok) {
          const statusResult = await response.json();
          setSuperragStatus({
            active_api: statusResult.superrag_configured,
            characters: 0
          });
        }
      } catch (err) {
        console.warn("Could not load API status config:", err);
      }
    }
    checkConfig();
  }, []);

  // Load existing profile & historical chat dumps from localStorage / Supabase
  useEffect(() => {
    const doneKey = `heist_onboarding_done_${userId}`;

    const cachedDoneStr = localStorage.getItem(doneKey);

    if (cachedDoneStr) {
      setIsOnboardingDone(cachedDoneStr === "true");
    }

    async function loadProfileAndVerifyCloudSession() {
      const supabase = getSupabase();
      if (!supabase || !userId) return;
      
      try {
        // Query Profile for premium validation
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, is_premium, onboarding_step, monthly_groq_tokens, daily_photo_queries")
          .eq("id", getSafeUUID(userId))
          .single();
          
        if (profile) {
          if (profile.monthly_groq_tokens !== undefined) {
             setMonthlyGroqTokens(profile.monthly_groq_tokens || 0);
          }
          if (profile.daily_photo_queries !== undefined) {
             setDailyPhotoQueries(profile.daily_photo_queries || 0);
          }
          if (profile.plan) {
             setAdminPlan(profile.plan);
          }
          
          const currentPlan = (profile.plan || "free").toLowerCase().trim();
          const isPremiumPlan = ["core", "flux", "unlocked"].includes(currentPlan);

          if (profile.is_premium || isPremiumPlan) {
            setPaymentSuccess(true);
            setIsOnboardingDone(true);
            setPaywallActive(false);
          } else {
            setPaymentSuccess(false);
            setPaywallActive(false);
          }
        }
      } catch (err) {
        console.error("Error loading account profile configuration:", err);
      }
    }

    loadProfileAndVerifyCloudSession();

    // FETCH CHAT HISTORY ON FIRST MOUNT
    async function loadInitialHistory() {
      const safeUserId = getSafeUUID(userId);
      setIsFetchingHistory(true);
      try {
        const url = getApiUrl(`/api/chat/history/${safeUserId}?limit=20`);
        console.log(`[BOOT] Fetching initial 20 messages from: ${url}`);
        const response = await fetch(url);
        
        if (response.ok) {
          const data = await response.json();
          const apiMessages: ChatMessage[] = (data.messages || []).map((m: any, index: number) => ({
            id: m.id ? String(m.id) : `db_msg_${index}`,
            role: (m.role === "user" ? "user" : "cliona") as "user" | "cliona",
            content: m.content || "",
            timestamp: m.created_at ? new Date(m.created_at) : new Date()
          }));

          if (apiMessages.length > 0) {
            // Set ui_display_messages equal to this fetched array
            setUiDisplayMessages(apiMessages);

            // **CRITICAL LLM PROTECTION:** Take ONLY the most recent 8 messages from that fetch, 
            // and initialize the local_chat_buffer with them.
            const recent8 = apiMessages.slice(-8);
            setLocalChatBuffer(recent8);

            setHasMoreHistory(data.has_more ?? (apiMessages.length === 20));
            console.log(`[BOOT] Loaded ${apiMessages.length} messages. Set local chat buffer to most recent ${recent8.length}`);
          } else {
            const historyKey = `heist_chat_history_${userId}`;
            const cachedHistoryRaw = localStorage.getItem(historyKey);
            if (cachedHistoryRaw) {
              try {
                const cachedHistory = JSON.parse(cachedHistoryRaw) as ChatMessage[];
                if (Array.isArray(cachedHistory) && cachedHistory.length > 0) {
                  const restoredMessages = cachedHistory.map((msg: any) => ({
                    ...msg,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  }));
                  setUiDisplayMessages(restoredMessages);
                  setLocalChatBuffer(restoredMessages.slice(-8));
                  setHasMoreHistory(false);
                  console.log(`[BOOT] Restored ${restoredMessages.length} cached messages from local storage.`);
                  return;
                }
              } catch (cacheErr) {
                console.warn("[BOOT] Failed to restore cached chat history:", cacheErr);
              }
            }
            // Fallback to initial question if no messages returned
            triggerDefaultWelcome();
          }
        } else {
          console.warn("[BOOT] Failed to fetch chat history, backend returned:", response.status);
          triggerDefaultWelcome();
        }
      } catch (e) {
        console.error("[BOOT] Failed to fetch chat history on mount:", e);
        triggerDefaultWelcome();
      } finally {
        setIsFetchingHistory(false);
      }
    }

    function triggerDefaultWelcome() {
      setIsTyping(true);
      const timer = setTimeout(() => {
        const initMsg: ChatMessage = {
          id: "init_msg",
          role: "cliona",
          content: "hey bestie. welcome to Cliona, where your aesthetic coordinates get absolutely roasted or meticulously built by a faceless, orange sea-sponge blob (me). before we lock in your ultimate master blueprint... what is the most embarrassing fashion phase you have ever survived, or what is your primary styling ick on this glitchy planet? do not hold back, let's start yapping.",
          timestamp: new Date(),
          isNew: true
        };
        setLocalChatBuffer([initMsg]);
        setUiDisplayMessages([initMsg]);
        setIsTyping(false);
      }, 1250);
    }

    loadInitialHistory();

  }, [userId]);

  // Controlled scroll to bottom function that keeps UI locked to scroll position safe from jumping
  const handleScrollToBottom = (force = false) => {
    if (chatContainerRef.current) {
      const container = chatContainerRef.current;
      const threshold = 220; // safe threshold
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
      if (force || isNearBottom) {
        container.scrollTop = container.scrollHeight;
      }
    }
  };

  useEffect(() => {
    handleScrollToBottom(true);
  }, [messages, isTyping]);

  // Sync to local state instantly on modification
  useEffect(() => {
    if (messages.length === 0) return;
    const historyKey = `heist_chat_history_${userId}`;
    const doneKey = `heist_onboarding_done_${userId}`;

    localStorage.setItem(historyKey, JSON.stringify(messages));
    localStorage.setItem(doneKey, String(isOnboardingDone));
  }, [messages, isOnboardingDone, userId]);

  // Save the full updated array to messages in Supabase in background
  useEffect(() => {
    if (messages.length === 0 || !userId) return;
    const supabase = getSupabase();
    if (!supabase) return;

    const timer = setTimeout(async () => {
      try {
        const safeUserId = getSafeUUID(userId);
        console.log(`[Database Sync] Upserting messages for user: ${safeUserId}`);

        // 1. Fetch current message content/role pairs to avoid duplicates
        const { data: existing } = await supabase
          .from("messages")
          .select("role, content")
          .eq("user_id", safeUserId);

        const existingSet = new Set<string>();
        if (existing) {
          existing.forEach((m) => {
            existingSet.add(`${m.role || ""}:${m.content || ""}`);
          });
        }

        // 2. Filter rules to only user and assistant roles and verify uniqueness
        const newRecords = messages
          .filter((msg) => msg.role === "user" || msg.role === "assistant")
          .map((msg) => ({
            user_id: safeUserId,
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.content,
            created_at: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
          }))
          .filter((rec) => !existingSet.has(`${rec.role}:${rec.content}`));

        if (newRecords.length > 0) {
          const { error } = await supabase
            .from("messages")
            .insert(newRecords);
          if (error) throw error;
          console.log(`[Database Sync] Successfully inserted ${newRecords.length} new messages.`);
        }
      } catch (err) {
        console.warn("[Database Sync Failure] messages update offline or error:", err);
      }
    }, 1000); // Debounce database saves by 1s

    return () => clearTimeout(timer);
  }, [messages, userId]);

  // Recover session row from Supabase messages table
  const handleRestoreCloudSession = async () => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;
    setIsRestoring(true);
    try {
      const safeUserId = getSafeUUID(userId);
      console.log("[Recovery] Attempting database row restore for user:", safeUserId);
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("user_id", safeUserId)
        .order("created_at", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        const parsedHistory: ChatMessage[] = data.map((m: any, index: number) => ({
          id: m.id ? String(m.id) : `db_msg_${index}`,
          role: (m.role === "user" ? "user" : "cliona") as "user" | "cliona",
          content: m.content || "",
          timestamp: m.created_at ? new Date(m.created_at) : new Date()
        }));

        const historyKey = `heist_chat_history_${userId}`;
        const sessionKey = `heist_session_id_${userId}`;

        setMessages(parsedHistory);
        localStorage.setItem(sessionKey, safeUserId);
        localStorage.setItem(historyKey, JSON.stringify(parsedHistory));
        
        setShowRestorePrompt(false);
        console.log("[Recovery] Successfully restored messages from database.");
      } else {
        console.log("[Recovery] No messages found for user:", safeUserId);
      }
    } catch (err) {
      console.warn("[Recovery Error] Restore failed:", err);
    } finally {
      setIsRestoring(false);
    }
  };

  const fetchOlderMessages = async (): Promise<boolean> => {
    if (isFetchingHistory || !hasMoreHistory || !userId) return false;
    if (ui_display_messages.length === 0) return false;

    setIsFetchingHistory(true);
    try {
      const oldestMsg = ui_display_messages[0];
      const beforeTimestamp = oldestMsg.timestamp instanceof Date
        ? oldestMsg.timestamp.toISOString()
        : new Date(String(oldestMsg.timestamp)).toISOString();

      const safeUserId = getSafeUUID(userId);
      const url = getApiUrl(`/api/chat/history/${safeUserId}?before_timestamp=${encodeURIComponent(beforeTimestamp)}&limit=20`);
      console.log(`[Infinite Scroll] Fetching older messages before ${beforeTimestamp} from: ${url}`);

      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const oldMessages: ChatMessage[] = (data.messages || []).map((m: any, index: number) => ({
          id: m.id ? String(m.id) : `db_msg_old_${Date.now()}_${index}`,
          role: (m.role === "user" ? "user" : "cliona") as "user" | "cliona",
          content: m.content || "",
          timestamp: m.created_at ? new Date(m.created_at) : new Date()
        }));

        if (oldMessages.length > 0) {
          // PREPEND them to the ui_display_messages array so they appear seamlessly at the top of the chat feed.
          setUiDisplayMessages((prev) => [...oldMessages, ...prev]);
          setHasMoreHistory(data.has_more ?? (oldMessages.length === 20));
          console.log(`[Infinite Scroll] Prepended ${oldMessages.length} older messages.`);
          return true;
        } else {
          setHasMoreHistory(false);
          console.log("[Infinite Scroll] No older messages returned by API.");
        }
      } else {
        console.warn("[Infinite Scroll] Non-200 status fetching older messages:", res.status);
      }
    } catch (e) {
      console.error("[Infinite Scroll] Error fetching older messages:", e);
    } finally {
      setIsFetchingHistory(false);
    }
    return false;
  };

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollTop <= 15 && !isFetchingHistory && hasMoreHistory) {
      const prevScrollHeight = target.scrollHeight;
      fetchOlderMessages().then((loadedNewMessages) => {
        if (loadedNewMessages) {
          requestAnimationFrame(() => {
            target.scrollTop = target.scrollHeight - prevScrollHeight;
          });
        }
      });
    }
  };

  const handleUserAnswer = async (text: string) => {
    if (!text.trim() || isTyping || paywallActive) return;

    // Append user's message with extra salt to absolutely protect against key collision
    const salt = Math.random().toString(36).substring(2, 8);
    const newMsg: ChatMessage = {
      id: `user_${Date.now()}_${salt}`,
      role: "user",
      content: text,
      timestamp: new Date()
    };

    setMessages((prev) => [...prev, newMsg]);
    setUserInput("");
    setIsTyping(true);

    try {
      const response = await fetch(getApiUrl("/api/cliona/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          message: text,
          history: messages.map(m => ({ role: m.role, content: m.content })),
          is_test: false,
          plan: adminPlan
        })
      });

      const data = await response.json();
      setIsTyping(false);

      if (response.status === 403 || data.error === "PAYWALL_HIT") {
        if (adminPlan.toLowerCase().trim() === "free") {
          setPaywallActive(true);
        }
        setPaywallReason(data.message || data.error || data.reply || "limit reached");
        return;
      }

      // Fetch latest profile state from database to update token usage indicators dynamically
      const supabase = getSupabase();
      if (supabase && userId) {
        supabase
          .from("profiles")
          .select("monthly_groq_tokens, daily_photo_queries")
          .eq("id", getSafeUUID(userId))
          .single()
          .then(({ data: profileData }) => {
            if (profileData) {
              if (profileData.monthly_groq_tokens !== undefined) setMonthlyGroqTokens(profileData.monthly_groq_tokens || 0);
              if (profileData.daily_photo_queries !== undefined) setDailyPhotoQueries(profileData.daily_photo_queries || 0);
            }
          });
      }

      if (data.steps_log) {
        setAdminStepsLog(data.steps_log);
      }
      if (data.current_plan) {
        setAdminPlan(data.current_plan);
      }

      const replyText = data.text || data.reply || "Bestie, I love that answer so much!";
      setMessages((prev) => [
        ...prev,
        {
          id: `cliona_onboard_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          role: "cliona",
          content: replyText,
          timestamp: new Date(),
          isNew: true
        }
      ]);

      const isPremiumPlan = ["core", "flux", "unlocked"].includes(adminPlan.toLowerCase().trim());
      if (data.is_premium || isPremiumPlan) {
        setPaywallActive(false);
        setPaymentSuccess(true);
        setIsOnboardingDone(true);
      }
    } catch (err) {
      console.warn("AI chat fetch failed:", err);
      setIsTyping(false);
    }
  };

  const handlePayment = async () => {
    setIsTyping(true);
    setPaywallActive(false);

    try {
      const response = await fetch(getApiUrl("/api/upgrade-premium"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId
        })
      });

      if (!response.ok) {
        throw new Error("Failed to activate premium via upgrade API");
      }

      const data = await response.json();
      setPaymentSuccess(true);
      setIsOnboardingDone(true);

      const hypeText = data.hype_message || "Omg you actually trusted me and unlocked Premium. I remember absolutely everything we just talked about. Let's build this master blueprint.";
      
      setMessages((prev) => [
        ...prev,
        {
          id: `cliona_unlocked_${Date.now()}`,
          role: "cliona",
          content: hypeText,
          timestamp: new Date(),
          isNew: true
        }
      ]);
    } catch (err) {
      console.error("Database upgrade request failed:", err);
      setPaymentSuccess(true);
      setIsOnboardingDone(true);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="flex-grow flex flex-col h-screen max-h-screen bg-transparent text-[var(--text-primary)] overflow-hidden relative font-sans shrink-0">
      
      {/* HEADER BAR - ALWAYS PERSISTENTLY STICKY & FLUID */}
      <header className="relative w-full bg-[var(--bg-base)]/90 border-b border-[var(--border-rule)] flex h-16 items-center justify-between px-4 md:px-10 shrink-0 select-none text-[var(--text-primary)] transition-all duration-350 ease-in-out">
        <div className="flex items-center space-x-2 md:space-x-4">
          <div className={`w-2.5 h-2.5 rounded-full ${isTyping ? "bg-[var(--primary-accent)] animate-ping" : "bg-[var(--primary-accent)]"}`} />
          <span className="text-xs md:text-sm font-black text-[var(--text-primary)] tracking-tight">
            Cliona - Foul-Mouthed Hype Blob.
          </span>
          {superragStatus !== null && userEmail.toLowerCase().trim() === "shravan.p1877@gmail.com" && (
            <span className={`text-[10px] md:text-[11px] font-extrabold uppercase py-1 px-3 border rounded-xl shadow-xs transition duration-200 flex items-center gap-1.5 ${
              superragStatus.active_api
                ? "bg-emerald-950/20 border-emerald-500/50 text-emerald-300"
                : "bg-orange-950/20 border-orange-500/50 text-orange-300"
            }`}>
              🧠 SuperRAG: {superragStatus.active_api ? "Active API" : "Offline Fallback Cache"}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          <button 
            onClick={() => {
              window.history.pushState({}, "", "/settings");
              window.dispatchEvent(new Event("heist-navigate"));
            }}
            title="Settings"
            className="flex items-center space-x-1 px-3 py-1.5 border border-[var(--border-rule)] bg-[var(--surface-card)]/80 rounded-xl text-[var(--text-primary)] hover:bg-[var(--surface-card)] active:scale-95 transition-all text-xs font-bold cursor-pointer shadow-sm animate-pulse-short"
          >
            <Settings size={13} />
            <span>Settings</span>
          </button>
        </div>
      </header>

      {/* WRAPPER CO-PRESENTING MAIN CHAT & ADMIN RUNTIME BAR WITH OFFSET */}
      <div className="flex-grow flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* CHAT CONTAINER AREA */}
        <main className="flex-1 flex flex-col relative bg-transparent overflow-hidden border-r border-[var(--border-rule)]">
          
          {/* CHAT SCREEN WITH TRANSITIONAL EFFECTS */}
          <div className={`flex-1 p-4 md:p-8 flex flex-col justify-between overflow-hidden relative h-full ${(paywallActive && adminPlan.toLowerCase().trim() === "free") ? "backdrop-blur-md pointer-events-none select-none blur-sm" : ""}`}>
            <div 
              ref={chatContainerRef}
              onScroll={handleContainerScroll}
              className="flex-grow overflow-y-auto space-y-6 py-4 px-2 md:px-4"
            >
               {isFetchingHistory && (
                <div id="history-loading-spinner" className="flex items-center justify-center space-x-3 py-2 text-zinc-300">
                  <img 
                    src={heistLogo} 
                    alt="Cliona History Processing" 
                    className="w-4 h-4 animate-spin opacity-80" 
                    referrerPolicy="no-referrer"
                    style={{ animationDuration: '2.5s', animationTimingFunction: 'linear' }}
                  />
                  <span className="text-[10px] uppercase tracking-widest font-mono font-black animate-pulse text-zinc-300">Loading memories...</span>
                </div>
              )}
              {showRestorePrompt && (
                <div className="bg-slate-100 border-2 border-slate-400 p-4 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-3 shadow-md animate-bounce-short">
                  <div className="text-left">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-600">🧠 Cliona remembers everything from previous chats.</p>
                    <p className="text-sm font-extrabold text-black">Restore your custom chat profile and memories seamlessly.</p>
                  </div>
                  <button
                    onClick={handleRestoreCloudSession}
                    disabled={isRestoring}
                    className="bg-[#525252] hover:bg-[#323232] text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-150 active:scale-95 cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
                  >
                    {isRestoring ? "Restoring..." : "Click here to restore"}
                  </button>
                </div>
              )}



              {messages.map((msg, index) => {
                const isUser = msg.role === "user";
                const msgTime = (msg.timestamp instanceof Date ? msg.timestamp : new Date(String(msg.timestamp))).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div 
                    key={`${msg.id}-${index}`}
                    className={`max-w-[85%] md:max-w-[75%] flex flex-col ${isUser ? "ml-auto" : ""}`}
                  >
                    {isUser ? (
                      <div className="p-4 md:p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-rule)] text-[var(--text-primary)] rounded-br-none shadow-md transition-all">
                        <p className="text-[17px] md:text-[19px] lg:text-[21px] leading-relaxed font-normal">
                          {msg.content}
                        </p>
                      </div>
                    ) : (
                      <div className="py-2 text-[var(--text-primary)]">
                        <p className="text-[17px] md:text-[19px] lg:text-[21px] leading-relaxed font-medium text-[var(--text-primary)] font-sans">
                          <StreamedText 
                            content={msg.content} 
                            enabled={!!msg.isNew} 
                            onCharacterTyped={() => {
                              handleScrollToBottom(false);
                            }}
                          />
                        </p>
                      </div>
                    )}
                    <span className="text-[10px] text-[var(--text-secondary)] mt-1.5 uppercase tracking-widest px-1 font-mono font-bold select-none opacity-80">
                      {msg.role === "cliona" ? "Cliona" : "Me"} • {msgTime}
                    </span>
                  </div>
                );
              })}

              {isTyping && (
                <div className="flex items-center space-x-3 py-3 text-[var(--text-secondary)]">
                  <ClionaLogo className="w-5 h-5" />
                  <span className="text-[10px] uppercase tracking-widest font-mono font-black animate-pulse text-[var(--primary-accent)]">Cliona is thinking</span>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="relative w-full bg-[var(--bg-base)]/95 pt-4 pb-4 border-t border-[var(--border-rule)] shrink-0">
              {/* LOWER INPUT CONTROL BOARD */}
              <div className="relative flex items-center px-1 shrink-0">
                <input
                  type="text"
                  value={userInput}
                  onChange={(e) => setUserInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === "Enter") handleUserAnswer(userInput);
                  }}
                  placeholder={
                    paywallActive 
                      ? "Master styling blueprints locking..." 
                      : isTyping
                        ? "Cliona is thinking..."
                        : "Type here to chat..."
                  }
                  disabled={paywallActive || isTyping}
                  className="w-full bg-slate-100 text-black border-2 border-slate-300 py-4 pl-6 pr-16 rounded-2xl text-sm font-bold focus:outline-none placeholder-slate-500 duration-200 shadow-inner"
                />
                <div className="absolute right-4 flex items-center">
                  <button
                    disabled={!userInput.trim() || paywallActive || isTyping}
                    onClick={() => handleUserAnswer(userInput)}
                    className="bg-[#525252] hover:bg-[#323232] text-white p-2.5 rounded-xl transition-all duration-200 disabled:opacity-40 cursor-pointer"
                  >
                    <Send size={14} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* THE PREMIUM PAYWALL BOTTOM SHEET MODAL (SLIDE UP) */}
          <AnimatePresence>
            {(paywallActive && adminPlan.toLowerCase().trim() === "free") && (
              <div id="paywall-wrapper" className="absolute inset-0 bg-slate-900/60 z-50 flex items-end justify-center backdrop-blur-sm">
                <motion.div 
                  initial={{ y: "100%", opacity: 0.8 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: "100%", opacity: 0.8 }}
                  transition={{ type: "spring", damping: 25, stiffness: 180 }}
                  className="w-full max-w-lg bg-white border-t-4 border-l-2 border-r-2 border-[#525252] rounded-t-[2.5rem] p-6 md:p-8 shadow-2xl space-y-4 relative pb-8 text-black overflow-y-auto max-h-[90%]"
                >
                  {/* Visual Puller Bar */}
                  <div className="w-12 h-1 bg-slate-300 rounded-full mx-auto mb-1 shrink-0" />

                  {/* Dynamic user friendly paywall limit banner */}
                  {paywallReason && (
                    <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-3.5 text-center shadow-sm shrink-0 animate-bounce">
                      <p className="text-[10px] text-rose-600 font-extrabold uppercase tracking-widest">⚠️ LIMIT DETECTED</p>
                      <p className="text-xs font-black text-rose-900 leading-normal mt-0.5">{paywallReason}</p>
                    </div>
                  )}

                  <div className="text-center space-y-2">
                    <div className="mx-auto w-10 h-10 bg-slate-105 rounded-full flex items-center justify-center text-teal-950">
                      <Lock size={18} />
                    </div>
                    
                    <GsapSerifHeader
                      tag="h3"
                      className="text-2xl md:text-3xl font-normal text-slate-900 italic tracking-tight"
                    >
                      Style DNA Premium Plans
                    </GsapSerifHeader>
                    
                    <p className="text-xs text-slate-600 font-bold px-4 leading-relaxed font-sans max-w-sm mx-auto">
                      Cliona has compiled your styling coordinates. Upgrade your allowance tier to remove limits and unlock continuing conversation.
                    </p>
                  </div>

                  {/* Multi-Tier Selectors connected to Supabase */}
                  <div className="space-y-3 pt-1">
                    {[
                      { 
                        key: "core", 
                        title: "Cliona Core", 
                        cost: "₹149/mo",
                        tokens: "4.5M Monthly Tokens", 
                        photos: "10 daily photo queries", 
                        memory: "Standard Memory (100 saved facts)"
                      },
                      { 
                        key: "flux", 
                        title: "Cliona Flex", 
                        cost: "₹299/mo",
                        tokens: "8.0M Monthly Tokens", 
                        photos: "30 daily photo queries", 
                        memory: "Elite Supermemory (Saves top 10% of facts)"
                      },
                      { 
                        key: "unlocked", 
                        title: "Cliona Unlocked", 
                        cost: "₹499/mo",
                        tokens: "Unlimited AI Tokens", 
                        photos: "50 daily photo queries", 
                        memory: "Ultimate Supermemory (Saves top 40% of facts)"
                      }
                    ].map((tier) => {
                      const isThisPlan = adminPlan.toLowerCase().trim() === tier.key;
                      return (
                        <div 
                          key={tier.key}
                          className={`p-3.5 rounded-2xl border transition-all pointer-events-auto flex justify-between items-center ${
                            isThisPlan 
                              ? "bg-teal-50 border-teal-900 shadow-md ring-2 ring-teal-950/20" 
                              : "bg-slate-55 hover:bg-slate-100 border-slate-200"
                          }`}
                        >
                          <div className="space-y-0.5 text-left max-w-[70%]">
                            <div className="flex items-center space-x-1.5">
                              <span className="font-extrabold text-sm text-slate-900">{tier.title}</span>
                              {isThisPlan && (
                                <span className="bg-teal-950 text-white text-[8px] font-black tracking-widest uppercase px-1 rounded">Active</span>
                              )}
                            </div>
                            <p className="text-[10px] text-slate-600 leading-tight font-medium">
                              • {tier.tokens} <br />
                              • {tier.photos} <br />
                              • {tier.memory}
                            </p>
                          </div>
                          
                          <button
                            disabled={isThisPlan || isUpgradingPlan !== null}
                            onClick={() => handleUpgradePlan(tier.key)}
                            className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition duration-150 cursor-pointer ${
                              isThisPlan
                                ? "bg-teal-950 text-white opacity-90 cursor-default"
                                : "bg-teal-900 hover:bg-teal-950 text-white hover:shadow-sm"
                            }`}
                          >
                            {isUpgradingPlan === tier.key 
                              ? "Joining..." 
                              : isThisPlan 
                                ? "Active" 
                                : `Select - ${tier.cost}`
                            }
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-2 text-center flex flex-col items-center justify-center space-y-1">
                    {paywallReason ? (
                      <button 
                        onClick={() => {
                          setPaywallActive(false);
                          setPaywallReason("");
                        }}
                        className="text-[10px] font-extrabold text-teal-850 uppercase tracking-widest hover:underline cursor-pointer"
                      >
                        Dismiss & close preview
                      </button>
                    ) : (
                      <button 
                        onClick={onLogout}
                        className="text-[10px] font-bold text-slate-500 uppercase tracking-widest hover:underline hover:text-slate-700 cursor-pointer"
                      >
                        Cancel & exit onboarding
                      </button>
                    )}
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </main>
      </div>

    </div>
  );
}
