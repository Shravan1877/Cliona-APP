import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import { Sparkles, Lock, ArrowRight, ShieldCheck, KeyRound } from "lucide-react";
import { getSupabase } from "../lib/supabase";
import GsapSerifHeader from "./GsapSerifHeader";

export default function UpdatePassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<boolean>(false);

  // Optional session verification to ensure recovering user state on load
  useEffect(() => {
    const supabase = getSupabase();
    if (supabase) {
      // Allow Supabase to pick up recovery hash tokens from URL
      supabase.auth.getSession().then(({ data, error }) => {
        if (error) {
          console.warn("Failed retrieving standard recovery session state:", error);
        } else if (data?.session) {
          console.log("Password recover user session detected successfully:", data.session.user?.email);
        }
      });
    }
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters bestie.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match bestie.");
      return;
    }

    setLoading(true);

    const supabase = getSupabase();
    if (!supabase) {
      setError("Supabase connection is not configured or offline. Please declare VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY first.");
      setLoading(false);
      return;
    }

    try {
      console.log("Updating Supabase authorization user password...");
      const { data, error: updateError } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateError) throw updateError;

      // Unset any local cached user logins to provoke a fresh authentication
      localStorage.removeItem("heist_user_email");
      localStorage.removeItem("heist_user_id");

      setSuccess(true);
    } catch (err: any) {
      console.error("Supabase Password Update Error details:", err);
      setError(err?.message || "Failed to update security password credentials. Your reset link may be expired, invalid, or the recovery session lost.");
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
      <div id="update-password-container" className="w-full max-w-md bg-[var(--surface-card)] border-2 border-[var(--border-rule)] rounded-3xl p-6 md:p-10 shadow-xl relative overflow-hidden transition-colors duration-300">
        {/* Aesthetic accents */}
        <div className="absolute -top-10 -right-10 w-32 h-32 bg-[var(--primary-accent)]/5 rounded-full blur-2xl" />
        <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-[var(--primary-accent)]/5 rounded-full blur-2xl" />

        <div className="text-center space-y-3 mb-8">
          <div className="inline-flex py-1 px-3 bg-[var(--primary-accent)]/10 rounded-full text-[var(--primary-accent)] text-xs font-mono tracking-wider font-extrabold uppercase items-center justify-center">
            <Sparkles size={12} className="mr-1 animate-pulse" />
            CLIONA CIPHER SYSTEM
          </div>
          <GsapSerifHeader
            tag="h1"
            className="text-3xl font-normal text-[var(--text-primary)] italic leading-tight"
          >
            New Password
          </GsapSerifHeader>
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
            Enter your new secure security passcode below. Ensure it consists of at least six premium characters.
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
                <KeyRound size={28} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Access Updated</h3>
                <p className="text-xs text-slate-600 leading-relaxed max-w-xs mx-auto">
                  Your security passcode profile has been modified successfully. Please sign in now with your newly created credentials.
                </p>
              </div>
              <button
                type="button"
                onClick={navigateToLogin}
                className="w-full bg-teal-800 hover:bg-teal-900 text-white font-extrabold text-xs tracking-widest uppercase py-4 rounded-xl transition-all duration-200 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>SIGN IN TO ACCESS PORTAL</span>
                <ArrowRight size={14} className="ml-1" />
              </button>
            </div>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="space-y-1.5">
                <label htmlFor="new-password" className="block text-xs uppercase tracking-widest font-black text-slate-600">
                  New Password
                </label>
                <div className="relative flex items-center">
                  <Lock size={16} className="absolute left-4 text-slate-500 z-10" />
                  <input
                    id="new-password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    className="w-full bg-slate-50 border border-slate-300 py-3 pl-11 pr-4 rounded-xl text-sm font-bold text-black focus:outline-none focus:border-teal-800 transition-colors placeholder-slate-400 font-medium"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label htmlFor="confirm-password" className="block text-xs uppercase tracking-widest font-black text-slate-600">
                  Confirm Password
                </label>
                <div className="relative flex items-center">
                  <Lock size={16} className="absolute left-4 text-slate-500 z-10" />
                  <input
                    id="confirm-password"
                    type="password"
                    required
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                <span>{loading ? "SAVING CONFIG..." : "UPDATE ACCESS PASSWORD"}</span>
                <ArrowRight size={14} />
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={navigateToLogin}
                  className="text-xs text-teal-800 hover:text-teal-950 font-black tracking-wider uppercase underline cursor-pointer"
                >
                  Cancel and Sign In
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
