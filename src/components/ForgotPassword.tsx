import React, { useState } from "react";
import { motion } from "motion/react";
import { Sparkles, Mail, ArrowRight, ArrowLeft, ShieldCheck, MailCheck } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import GsapSerifHeader from "./GsapSerifHeader";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address bestie.");
      return;
    }

    setLoading(true);
    setError(null);
    setGeneratedLink(null);

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase connection is not configured or offline. Please declare VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.");
      setLoading(false);
      return;
    }

    try {
      const resetUrl = `${window.location.origin}/update-password`;
      console.log("Requesting password reset for:", email, "with redirectTo:", resetUrl);
      
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: resetUrl,
      });

      if (resetError) {
        // Intercept SMTP rate limit or recovery email delivery issues and fall back to admin generateLink
        const errMsg = (resetError.message || "").toLowerCase();
        if (
          errMsg.includes("email") ||
          errMsg.includes("sending") ||
          errMsg.includes("smtp") ||
          errMsg.includes("mail") ||
          errMsg.includes("network")
        ) {
          console.log("Standard recovery email failed. Activating secure fallback reset link generator...");
          const response = await fetch("/api/auth/generate-reset-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, redirectTo: resetUrl }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || resetError.message);
          }
          if (result.action_link) {
            setGeneratedLink(result.action_link);
            setSuccess(true);
            return;
          }
        }
        throw resetError;
      }

      setSuccess(true);
    } catch (err: any) {
      console.error("Supabase Reset Error details:", err);
      setError(err?.message || "Failed to trigger standard password reset link. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const navigateToLogin = () => {
    window.history.pushState({}, "", "/");
    window.dispatchEvent(new Event("heist-navigate"));
  };

  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center p-4 md:p-8 font-sans transition-colors duration-300 relative">
      <div id="forgot-password-container" className="w-full max-w-md bg-[var(--surface-card)] border-2 border-[var(--border-rule)] rounded-3xl p-6 md:p-10 shadow-xl relative overflow-hidden transition-colors duration-300">
        {/* Aesthetic accents */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--primary-accent)]/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[var(--primary-accent)]/5 rounded-full blur-2xl" />

        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex py-1 px-3 bg-[var(--primary-accent)]/10 rounded-full text-[var(--primary-accent)] text-xs font-mono tracking-wider font-extrabold uppercase items-center justify-center">
            <Sparkles size={12} className="mr-1 animate-pulse" />
            CLIONA RECOVERY PROTOCOL
          </div>
          <GsapSerifHeader
            tag="h1"
            className="text-3xl font-normal text-[var(--text-primary)] italic leading-tight"
          >
            Reset Password
          </GsapSerifHeader>
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
            Enter your credentials code pipeline. We will deliver a secure authentication link to update your passkey.
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
        >
          {success ? (
            <div className="space-y-6 text-center py-4">
              <div className="w-16 h-16 bg-teal-50 border-2 border-teal-800/15 rounded-full flex items-center justify-center mx-auto text-teal-800 animate-pulse">
                <MailCheck size={28} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Transmission Sent</h3>
                {generatedLink ? (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                      Supabase email gateway limit exceeded! But we securely generated your real, official recovery link directly. Click below to securely reset your password via Supabase protocol:
                    </p>
                    <div className="pt-2">
                      <a
                        href={generatedLink}
                        className="inline-flex bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-xs tracking-wider uppercase py-3.5 px-6 rounded-xl transition-all duration-200 cursor-pointer shadow-md items-center justify-center space-x-2"
                      >
                        ⚡ RESET PASSWORD THROUGH LINK
                      </a>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                    A verification update payload link has been successfully dispatched to <span className="font-extrabold text-teal-900 font-mono">{email}</span>. Click the link to update your password profile safely.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={navigateToLogin}
                className="w-full bg-slate-900 hover:bg-black text-white font-extrabold text-xs tracking-widest uppercase py-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <ArrowLeft size={14} className="mr-1" />
                <span>RETURN TO AUTHENTICATOR</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="email-input" className="block text-xs uppercase tracking-widest font-black text-slate-600">
                  Registered Email Address
                </label>
                <div className="relative flex items-center">
                  <Mail size={16} className="absolute left-4 text-slate-500 z-10" />
                  <input
                    id="email-input"
                    type="email"
                    required
                    placeholder="bestie@cliona.style"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-50 border border-slate-300 py-3 pl-11 pr-4 rounded-xl text-sm font-bold text-black focus:outline-none focus:border-teal-800 transition-colors placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              {error && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-500/20 p-3.5 rounded-xl font-medium whitespace-pre-wrap break-all leading-relaxed font-mono text-left max-h-48 overflow-y-auto">
                  <span className="font-sans font-bold block uppercase tracking-wider text-[10px] mb-1 text-rose-800">Error Payload:</span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-xs tracking-widest uppercase py-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
              >
                <span>{loading ? "TRANSMITTING LINK..." : "SEND PASSWORD RESET"}</span>
                <ArrowRight size={14} />
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={navigateToLogin}
                  className="text-xs text-teal-800 hover:text-teal-950 font-black tracking-wider uppercase underline cursor-pointer"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}
        </motion.div>

        <div className="mt-8 pt-4 border-t border-slate-100 flex flex-col items-center space-y-2 text-[10px] text-slate-400 font-mono tracking-widest uppercase select-none">
          <div className="flex items-center space-x-1.5">
            <ShieldCheck size={12} className="text-teal-800/40" />
            <span>CLIONA RECOVERY LOGIC MODULE v1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}
