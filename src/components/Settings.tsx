import React, { useState, useEffect } from "react";
import { 
  ArrowLeft, Settings as SettingsIcon, User, RefreshCw, CheckCircle2, Lock, LogOut, Sun, Moon, Info 
} from "lucide-react";
import GsapSerifHeader from "./GsapSerifHeader";
import { getSupabase } from "../lib/supabase";
import { TIER_CONFIG } from "../lib/tier_config";

interface SettingsProps {
  userEmail: string;
  userId: string;
  onLogout: () => void;
  onBack: () => void;
}

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

export default function Settings({ userEmail, userId, onLogout, onBack }: SettingsProps) {
  const [settingsTab, setSettingsTab] = useState<"profile" | "usage" | "legal" | "device">("profile");
  const [adminPlan, setAdminPlan] = useState<string>("free");
  const [monthlyGroqTokens, setMonthlyGroqTokens] = useState<number>(0);
  const [dailyPhotoQueries, setDailyPhotoQueries] = useState<number>(0);
  const [isUpgradingPlan, setIsUpgradingPlan] = useState<string | null>(null);

  const [themeMode, setThemeMode] = useState<"system" | "light" | "dark">(() => {
    const cached = localStorage.getItem("cliona-theme-choice") as "system" | "light" | "dark" | null;
    return cached || "system";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    if (themeMode === "light") {
      root.classList.add("light");
    } else if (themeMode === "dark") {
      root.classList.add("dark");
    }
    localStorage.setItem("cliona-theme-choice", themeMode);
    
    // Dispatch custom event to notify App.tsx immediately for dynamic background switching
    window.dispatchEvent(new CustomEvent("cliona-theme-choice-changed", { detail: themeMode }));
  }, [themeMode]);

  // Load profile state
  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase || !userId) return;

    async function loadStats() {
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("plan, monthly_groq_tokens, daily_photo_queries")
          .eq("id", getSafeUUID(userId))
          .single();

        if (profile) {
          if (profile.plan) setAdminPlan(profile.plan);
          if (profile.monthly_groq_tokens !== undefined) setMonthlyGroqTokens(profile.monthly_groq_tokens || 0);
          if (profile.daily_photo_queries !== undefined) setDailyPhotoQueries(profile.daily_photo_queries || 0);
        }
      } catch (err) {
        console.warn("Failed loading stats:", err);
      }
    }
    loadStats();
  }, [userId]);

  const handleForceUpgrade = async (requestedPlan: string) => {
    setIsUpgradingPlan(requestedPlan);
    try {
      const response = await fetch("/api/checkout", {
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

  return (
    <div className="min-h-screen w-full bg-[var(--bg-base)] text-[var(--text-primary)] transition-colors duration-300 flex flex-col font-sans animate-fadeIn">
      {/* Settings Header Block */}
      <header className="relative w-full bg-[var(--bg-base)] border-b border-[var(--border-rule)] flex h-16 items-center justify-between px-6 md:px-12 backdrop-blur-md select-none">
        <div className="flex items-center space-x-3">
          <SettingsIcon size={18} className="text-[var(--primary-accent)]" />
          <span className="text-xs font-black uppercase tracking-wider">CLIONA System Preferences</span>
        </div>
        
        <button
          onClick={onBack}
          className="flex items-center space-x-2 px-4 py-2 border border-[var(--border-rule)] bg-[var(--surface-card)] hover:bg-[var(--bg-deep)] rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95"
        >
          <ArrowLeft size={13} />
          <span>Back to Chat</span>
        </button>
      </header>

      {/* Main Settings Panel Split */}
      <div className="flex-grow w-full max-w-7xl mx-auto flex flex-col md:flex-row overflow-visible">
        
        {/* Navigation Tabs on Left */}
        <aside className="w-full md:w-64 border-r border-[var(--border-rule)] bg-[var(--bg-deep)]/40 p-6 space-y-2 shrink-0 select-none">
          <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold px-4 pb-2">Category</p>
          
          <button
            onClick={() => setSettingsTab("profile")}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-150 font-bold text-xs uppercase tracking-wider flex items-center space-x-2.5 cursor-pointer ${
              settingsTab === "profile"
                ? "bg-[var(--primary-accent)] text-white shadow-md font-black"
                : "hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <User size={14} />
            <span>Profile & Theme</span>
          </button>

          <button
            onClick={() => setSettingsTab("usage")}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-150 font-bold text-xs uppercase tracking-wider flex items-center space-x-2.5 cursor-pointer ${
              settingsTab === "usage"
                ? "bg-[var(--primary-accent)] text-white shadow-md font-black"
                : "hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <RefreshCw size={14} />
            <span>Usage & Allowance</span>
          </button>

          <button
            onClick={() => setSettingsTab("legal")}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-150 font-bold text-xs uppercase tracking-wider flex items-center space-x-2.5 cursor-pointer ${
              settingsTab === "legal"
                ? "bg-[var(--primary-accent)] text-white shadow-md font-black"
                : "hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <CheckCircle2 size={14} />
            <span>Terms & Legal Policy</span>
          </button>

          <button
            onClick={() => setSettingsTab("device")}
            className={`w-full text-left px-4 py-3 rounded-xl transition-all duration-150 font-bold text-xs uppercase tracking-wider flex items-center space-x-2.5 cursor-pointer ${
              settingsTab === "device"
                ? "bg-[var(--primary-accent)] text-white shadow-md font-black"
                : "hover:bg-[var(--surface-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Lock size={14} />
            <span>Device & Security</span>
          </button>

          <div className="pt-8 border-t border-[var(--border-rule)] mt-6 px-2">
            <button
              onClick={onLogout}
              className="w-full bg-rose-600/95 hover:bg-rose-700 text-white font-extrabold text-xs tracking-widest uppercase py-3 rounded-xl transition duration-150 shadow-md text-center flex items-center justify-center space-x-2 cursor-pointer active:scale-95"
            >
              <LogOut size={13} />
              <span>Log Out</span>
            </button>
          </div>
        </aside>

        {/* Dynamic Panel Pane View */}
        <main className="flex-grow bg-[var(--bg-base)] p-6 md:p-12 overflow-y-auto space-y-8 select-text">
          
          {settingsTab === "profile" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <GsapSerifHeader tag="h3" className="text-xl md:text-2xl font-normal italic tracking-tight uppercase" key="profile">
                  Profile & Preferences
                </GsapSerifHeader>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Configure active user details and conversation preferences.</p>
              </div>

              {/* Active account details */}
              <div className="p-5 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-rule)] space-y-2">
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold">Active ID / Principal Email</p>
                <p className="text-base font-bold font-mono tracking-tight">{userEmail}</p>
              </div>

              {/* Aesthetic theme UI selector */}
              <div className="space-y-3">
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold">Aesthetic Canvas Selector</p>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setThemeMode("light")}
                    type="button"
                    className={`p-5 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all duration-150 flex flex-col items-center justify-center space-y-2.5 cursor-pointer ${
                      themeMode === "light"
                        ? "bg-[var(--primary-accent)] border-[var(--primary-accent)] text-white shadow-lg font-black"
                        : "bg-[var(--surface-card)] border border-[var(--border-rule)] text-[var(--text-primary)] hover:border-[var(--text-secondary)]"
                    }`}
                  >
                    <Sun size={18} className="opacity-90" />
                    <span>Parchment</span>
                  </button>
                  <button
                    onClick={() => setThemeMode("dark")}
                    type="button"
                    className={`p-5 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all duration-150 flex flex-col items-center justify-center space-y-2.5 cursor-pointer ${
                      themeMode === "dark"
                        ? "bg-[var(--primary-accent)] border-[var(--primary-accent)] text-white shadow-lg font-black"
                        : "bg-[var(--surface-card)] border border-[var(--border-rule)] text-[var(--text-primary)] hover:border-[var(--text-secondary)]"
                    }`}
                  >
                    <Moon size={18} className="opacity-90" />
                    <span>Matte Void</span>
                  </button>
                  <button
                    onClick={() => setThemeMode("system")}
                    type="button"
                    className={`p-5 rounded-2xl border font-bold text-xs uppercase tracking-wider transition-all duration-150 flex flex-col items-center justify-center space-y-2.5 cursor-pointer ${
                      themeMode === "system"
                        ? "bg-[var(--primary-accent)] border-[var(--primary-accent)] text-white shadow-lg font-black"
                        : "bg-[var(--surface-card)] border border-[var(--border-rule)] text-[var(--text-primary)] hover:border-[var(--text-secondary)]"
                    }`}
                  >
                    <Info size={18} className="opacity-90" />
                    <span>System Defaults</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {settingsTab === "usage" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <GsapSerifHeader tag="h3" className="text-xl md:text-2xl font-normal italic tracking-tight uppercase" key="usage">
                  Active Limits & Allowances
                </GsapSerifHeader>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Real-time usage counters & subscription thresholds.</p>
              </div>

              <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-rule)] space-y-4">
                <div className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold border-b border-[var(--border-rule)] pb-2">
                  <span>Rate limits status</span>
                  <span className="text-white bg-[var(--primary-accent)] px-2.5 py-0.5 rounded-full normal-case font-black tracking-normal uppercase">
                    {adminPlan.toUpperCase()} Plan
                  </span>
                </div>

                {(() => {
                  const activePlanKey = (adminPlan || "free").toLowerCase().trim();
                  const activeLimits = TIER_CONFIG[activePlanKey] || TIER_CONFIG.free;
                  const limitVal = activeLimits.groqTokenLimit;

                  if (limitVal === Infinity) {
                    return (
                      <div className="space-y-3 text-xs">
                        <div className="flex justify-between font-bold">
                          <span>Allowance Status:</span>
                          <span className="text-[var(--primary-accent)] font-black uppercase">Unlimited</span>
                        </div>
                        <div className="w-full bg-[var(--border-rule)] h-2 rounded-full overflow-hidden">
                          <div className="bg-gradient-to-r from-[var(--primary-accent)] to-[var(--muted-accent)] h-full w-full" />
                        </div>
                        <p className="text-[10px] text-[var(--text-secondary)] italic leading-relaxed pt-1">
                          Unlimited processing speed with continuous cloud synchronization enabled.
                        </p>
                      </div>
                    );
                  }

                  const percent = Math.min(100, Math.floor((monthlyGroqTokens / limitVal) * 100));
                  return (
                    <div className="space-y-4 text-xs text-[var(--text-primary)]">
                      <div className="flex justify-between font-bold">
                        <span>AI Token Consumption:</span>
                        <span className="font-extrabold font-mono">{percent}% utilized ({monthlyGroqTokens.toLocaleString()} / {limitVal.toLocaleString()})</span>
                      </div>
                      <div className="w-full bg-[var(--border-rule)] h-3 rounded-full overflow-hidden">
                        <div 
                          className="bg-gradient-to-r from-[var(--primary-accent)] to-[var(--muted-accent)] h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-[var(--text-secondary)] pt-1 font-semibold">
                        <span>{percent}% of your monthly premium token pool is exhausted</span>
                        {activeLimits.photoQueryLimit > 0 && (
                          <span>Photos parsed: {dailyPhotoQueries}/{activeLimits.photoQueryLimit} daily Limit</span>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Instant plan management / sandbox trigger */}
              <div className="space-y-3">
                <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold">Instant Plan Alignment</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleForceUpgrade("free")}
                    disabled={isUpgradingPlan !== null}
                    className={`p-4 rounded-xl border text-xs font-bold transition duration-150 uppercase cursor-pointer ${
                      adminPlan.trim().toLowerCase() === "free"
                        ? "border-amber-600 bg-amber-600/10 text-amber-500 font-extrabold"
                        : "border-[var(--border-rule)] hover:border-amber-600 text-[var(--text-primary)]"
                    }`}
                  >
                    Set Free Tier
                  </button>
                  <button
                    onClick={() => handleForceUpgrade("premium")}
                    disabled={isUpgradingPlan !== null}
                    className={`p-4 rounded-xl border text-xs font-bold transition duration-150 uppercase cursor-pointer ${
                      adminPlan.trim().toLowerCase() === "premium"
                        ? "border-emerald-600 bg-emerald-600/10 text-emerald-500 font-extrabold"
                        : "border-[var(--border-rule)] hover:border-emerald-600 text-[var(--text-primary)]"
                    }`}
                  >
                    Set Premium Tier
                  </button>
                </div>
              </div>
            </div>
          )}

          {settingsTab === "legal" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <GsapSerifHeader tag="h3" className="text-xl md:text-2xl font-normal italic tracking-tight uppercase" key="legal">
                  Terms and Conditions
                </GsapSerifHeader>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Official platform terms, privacy protocols, and warranties.</p>
              </div>

              <div className="p-8 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-rule)] space-y-5 text-sm leading-relaxed text-[var(--text-secondary)] h-[500px] overflow-y-auto shadow-sm">
                <p className="font-bold text-[var(--text-primary)]">Last Updated: June 15, 2026</p>
                
                <div className="space-y-2">
                  <p className="font-black text-[var(--text-primary)] uppercase tracking-wide">1. Acceptance of Terms</p>
                  <p>By engaging with Cliona (the "Service") operated via the Cliona backend system, you acknowledge and agree to be bound by these system-wide terms. If you do not accept these guidelines, access is strictly forbidden.</p>
                </div>

                <div className="space-y-2">
                  <p className="font-black text-[var(--text-primary)] uppercase tracking-wide">2. AI System Advice & Limitations</p>
                  <p>Conversational responses, memory summaries, reminders, and supportive suggestions are generated utilizing Gemini and Groq server models. For similarity matching and vector search, we strictly utilize the Gemini embedding model, while text-based LLM queries are handled through the Groq console without any change to fast conversational generation.</p>
                </div>

                <div className="space-y-2">
                  <p className="font-black text-[var(--text-primary)] uppercase tracking-wide">3. Subscription Tiers & API Tokens</p>
                  <p>Allowances of server compute are strictly governed by your active subscription profile (Free, Core, Flux, or Unlocked). Core profiles bypass premium RAG pipelines. Tokens bleed is strictly throttled on administrative sandboxes to protect network resource pools. Reverse-engineering of internal endpoints is prohibited.</p>
                </div>

                <div className="space-y-2">
                  <p className="font-black text-[var(--text-primary)] uppercase tracking-wide">4. Privacy & Vector Supermemory</p>
                  <p>UserData is preserved with lightweight Supabase storage backends. Dynamic conversation traces are indexed into high-performance vector databases when plan rules allow. If you wish to wipe your conversation context, you can purge database profiles at any point.</p>
                </div>
              </div>
            </div>
          )}

          {settingsTab === "device" && (
            <div className="max-w-2xl space-y-6">
              <div>
                <GsapSerifHeader tag="h3" className="text-xl md:text-2xl font-normal italic tracking-tight uppercase" key="device">
                  Device Status & Security
                </GsapSerifHeader>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Secure system indicators and connected terminal parameters.</p>
              </div>

              <div className="p-6 rounded-2xl bg-[var(--surface-card)] border border-[var(--border-rule)] space-y-4 text-xs text-[var(--text-primary)] shadow-sm">
                <div className="space-y-1">
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold">Active Status</p>
                  <p className="font-semibold text-emerald-400">● Live Secure Connection</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold">State Persistence Pipeline</p>
                  <p className="font-mono">Supabase SQL State Synchronization Active</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-widest font-extrabold">Browser Host Node</p>
                  <p className="font-mono">TLS encrypted SSL Tunnel</p>
                </div>
              </div>
            </div>
          )}

        </main>

      </div>
    </div>
  );
}
