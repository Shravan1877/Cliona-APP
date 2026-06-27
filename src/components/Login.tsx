import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sun, Moon, Sparkles, ArrowRight, ShieldCheck, Mail, Lock, AlertTriangle } from "lucide-react";
import { getSupabase, getSupabaseKeys } from "../lib/supabase";
import GsapSerifHeader from "./GsapSerifHeader";

interface LoginProps {
  onLoginSuccess: (email: string, userId: string) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase connection is not configured or offline. Please declare VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.");
      setLoading(false);
      return;
    }

    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: window.location.origin,
        },
      });

      if (oauthError) throw oauthError;
    } catch (err: any) {
      console.error("Google login failed:", err);
      setError(err.message || "Failed to trigger Google Sign-In protocol.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address bestie.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters bestie.");
      return;
    }
    
    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase connection is not configured or offline. Please declare VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.");
      setLoading(false);
      return;
    }

    try {
      if (mode === "signin") {
        console.log("Supabase signing in with email and password:", email);
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;

        const userId = data.user?.id || "";
        if (userId) {
          // Query if profile exists
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", userId)
            .maybeSingle();

          if (!profile) {
            const isAdmin = email.toLowerCase().trim() === "shravan.p1877@gmail.com";
            // Put clean entry matching the user profiles schema
            await supabase.from("profiles").insert([
              {
                id: userId,
                full_name: email.split("@")[0],
                scan_credits: 5,
                batch_credits: 8,
                is_premium: isAdmin,
                message_count: 0,
              },
            ]);
          }
          onLoginSuccess(email, userId);
        }
      } else {
        console.log("Supabase signing up with email and password:", email);
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (signUpError) throw signUpError;

        const userId = data.user?.id || "";
        if (userId) {
          // Create the profiles table entry
          const isAdmin = email.toLowerCase().trim() === "shravan.p1877@gmail.com";
          await supabase.from("profiles").insert([
            {
              id: userId,
              full_name: email.split("@")[0],
              scan_credits: 5,
              batch_credits: 8,
              is_premium: isAdmin,
              message_count: 0,
            },
          ]);

          if (data.session) {
            onLoginSuccess(email, userId);
          } else {
            setSuccessMessage("Account created successfully! Check email for verification code if required, or sign in now.");
            setMode("signin");
            setPassword("");
          }
        }
      }
    } catch (err: any) {
      console.error("Supabase Auth Error details:", err);
      let errorMsg = err.message || "Failed to authenticate. Please check your credentials.";
      if (err.status) errorMsg += ` (Status code: ${err.status})`;
      if (err.description) errorMsg += ` - ${err.description}`;
      if (err.details) errorMsg += ` - ${err.details}`;
      
      const extraDetails: string[] = [];
      if (err.error_description) extraDetails.push(`Desc: ${err.error_description}`);
      if (err.error) extraDetails.push(`Error name: ${err.error}`);
      
      if (extraDetails.length > 0) {
        errorMsg += `\n[${extraDetails.join(" / ")}]`;
      }
      
      try {
        const rawJson = JSON.stringify(err);
        if (rawJson && rawJson !== "{}") {
          errorMsg += `\n\nRaw Error details:\n${rawJson}`;
        }
      } catch (pErr) {}

      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-4 md:p-8 font-sans transition-colors duration-300 relative">

      <div id="login-container" className="w-full max-w-md bg-[var(--surface-card)] border-2 border-[var(--border-rule)] rounded-3xl p-6 md:p-10 shadow-xl relative overflow-hidden transition-colors duration-300">
        {/* Aesthetic accents */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--primary-accent)]/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[var(--primary-accent)]/5 rounded-full blur-2xl" />

        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex py-1 px-3 bg-[var(--primary-accent)]/10 rounded-full text-[var(--primary-accent)] text-xs font-mono tracking-wider font-extrabold uppercase items-center justify-center">
            <Sparkles size={12} className="mr-1 animate-pulse" />
            CLIONA HYPING ENGINE
          </div>
          <GsapSerifHeader
            tag="h1"
            className="text-3xl md:text-4xl font-normal text-[var(--text-primary)] italic leading-tight"
            key={mode}
            lines={mode === "signin" ? ["Get gassed up", "by Cliona"] : ["Join the", "bubble"]}
          />
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
            A foul-mouthed, orange sea blob and ultimate hype friend. Real database state with Supabase and unhinged AI-powered validation.
          </p>
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
          >
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email-input" className="block text-xs uppercase tracking-widest font-black text-[var(--text-secondary)]">
                  Your Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail size={16} className="absolute left-4 text-[var(--text-secondary)]/70 z-10" />
                  <input
                    id="email-input"
                    type="email"
                    required
                    placeholder="bestie@cliona.style"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full bg-[var(--bg-deep)]/45 border border-[var(--border-rule)] py-3 pl-11 pr-4 rounded-xl text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-accent)] transition-all placeholder-[var(--text-secondary)]/50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="password-input" className="block text-xs uppercase tracking-widest font-black text-[var(--text-secondary)]">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      window.history.pushState({}, "", "/forgot-password");
                      window.dispatchEvent(new Event("heist-navigate"));
                    }}
                    className="text-[10px] text-[var(--primary-accent)] hover:text-[var(--text-primary)] font-black uppercase tracking-wider hover:underline cursor-pointer"
                  >
                    Forgot?
                  </button>
                </div>
                <div className="relative flex items-center">
                  <Lock size={16} className="absolute left-4 text-[var(--text-secondary)]/70 z-10" />
                  <input
                    id="password-input"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    className="w-full bg-[var(--bg-deep)]/45 border border-[var(--border-rule)] py-3 pl-11 pr-4 rounded-xl text-sm font-bold text-[var(--text-primary)] focus:outline-none focus:border-[var(--primary-accent)] transition-all placeholder-[var(--text-secondary)]/50"
                  />
                </div>
              </div>

              {successMessage && (
                <div className="text-xs text-teal-800 bg-teal-50 border border-teal-500/20 p-3.5 rounded-xl font-medium leading-relaxed">
                  {successMessage}
                </div>
              )}

              {error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-500/20 p-3.5 rounded-xl font-medium whitespace-pre-wrap break-all leading-relaxed font-mono text-left max-h-48 overflow-y-auto w-full">
                  <span className="font-sans font-bold block uppercase tracking-wider text-[10px] mb-1 text-rose-800">Detailed Authentication Error:</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[var(--primary-accent)] hover:bg-[var(--primary-accent)]/90 text-white font-extrabold text-xs tracking-widest uppercase py-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <span>
                  {loading 
                    ? (mode === "signin" ? "SIGNING IN..." : "CREATING ACCOUNT...") 
                    : (mode === "signin" ? "AUTHENTICATE" : "REGISTER PROTOCOL")
                  }
                </span>
                <ArrowRight size={14} />
              </button>



              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === "signin" ? "signup" : "signin");
                    setError(null);
                    setSuccessMessage(null);
                  }}
                  className="text-xs text-[var(--primary-accent)] hover:text-[var(--text-primary)] font-black tracking-wider uppercase underline cursor-pointer"
                >
                  {mode === "signin" 
                    ? "Don't have an account? Sign Up" 
                    : "Already have an account? Sign In"
                  }
                </button>
              </div>
            </form>
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 pt-4 border-t border-[var(--border-rule)] flex flex-col items-center space-y-2 text-[10px] text-[var(--text-secondary)] font-mono tracking-widest uppercase select-none">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck size={12} className="text-[var(--primary-accent)]/40" />
            <span>SUPABASE AUTH PROTOCOL</span>
          </div>
          <div className="flex items-center space-x-3 text-[10px] text-[var(--text-secondary)] font-medium font-sans lowercase tracking-tight">
            <button 
              type="button"
              onClick={() => {
                window.history.pushState({}, "", "/legal");
                window.dispatchEvent(new Event("heist-navigate"));
              }}
              className="hover:text-[var(--primary-accent)] transition cursor-pointer font-bold underline"
            >
              Refund, Privacy & Terms Policies
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
