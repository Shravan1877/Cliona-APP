import { useState, useEffect, useCallback } from "react";
import { getSupabase, getSafeUUID } from "../lib/supabase";
import { getApiUrl } from "../lib/api";

export interface AuthState {
  userEmail: string | null;
  userId: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

export interface UseAuthReturn extends AuthState {
  login: (email: string, id: string) => void;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const USER_EMAIL_KEY = "heist_user_email";
const USER_ID_KEY = "heist_user_id";

/**
 * Custom hook for managing authentication state and Supabase session
 */
export function useAuth(): UseAuthReturn {
  const [authState, setAuthState] = useState<AuthState>({
    userEmail: null,
    userId: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const loadSession = useCallback(async () => {
    let savedEmail = localStorage.getItem(USER_EMAIL_KEY);
    let activeUserId = localStorage.getItem(USER_ID_KEY);

    const supabase = getSupabase();
    if (supabase) {
      try {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");

        const hash = window.location.hash || "";
        const cleanHash = hash.startsWith("#") ? hash.substring(1) : hash;
        const hashParams = new URLSearchParams(cleanHash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        let userSession: any = null;

        if (code) {
          console.log("useAuth: Exchanging auth code for session...");
          const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
          userSession = exchangeData.session;
        } else if (accessToken && refreshToken) {
          console.log("useAuth: Setting session from URL hash...");
          const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) throw sessionError;
          userSession = sessionData.session;
        } else {
          const { data: { session } } = await supabase.auth.getSession();
          userSession = session;
        }

        if (userSession?.user) {
          const user = userSession.user;
          activeUserId = user.id;
          savedEmail = user.email || null;
          localStorage.setItem(USER_ID_KEY, activeUserId);
          if (savedEmail) {
            localStorage.setItem(USER_EMAIL_KEY, savedEmail);
          }

          // Ensure profile exists
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", activeUserId)
            .maybeSingle();

          if (!profile) {
            const isAdmin = savedEmail?.toLowerCase().trim() === "shravan.p1877@gmail.com";
            await supabase.from("profiles").insert([{
              id: activeUserId,
              full_name: user.user_metadata?.full_name || savedEmail?.split("@")[0] || "User",
              avatar_url: user.user_metadata?.avatar_url || null,
              scan_credits: 5,
              batch_credits: 8,
              is_premium: isAdmin,
              message_count: 0,
            }]);
          }

          // Clean URL
          const url = new URL(window.location.href);
          if (code) url.searchParams.delete("code");
          if (accessToken) url.hash = "";
          window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
        }
      } catch (authErr) {
        console.warn("Could not retrieve active Supabase session:", authErr);
      }
    }

    return { email: savedEmail, userId: activeUserId };
  }, []);

  const loadConfig = useCallback(async () => {
    try {
      const res = await fetch(getApiUrl("/api/supabase-config"));
      if (res.ok) {
        const config = await res.json();
        if (config.url && config.key) {
          const { initSupabaseKeys } = await import("../lib/supabase");
          initSupabaseKeys(config.url, config.key);
        }
      }
    } catch (err) {
      console.warn("Failed loading Dynamic Supabase configuration:", err);
    }
  }, []);

  useEffect(() => {
    async function initAuth() {
      await loadConfig();
      const { email, userId } = await loadSession();
      
      let finalUserId = userId;
      if (!finalUserId) {
        // Generate anonymous user ID
        if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
          finalUserId = crypto.randomUUID();
        } else {
          finalUserId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
            const r = (Math.random() * 16) | 0;
            const v = c === "x" ? r : (r & 0x3) | 0x8;
            return v.toString(16);
          });
        }
        localStorage.setItem(USER_ID_KEY, finalUserId);
      }

      setAuthState({
        userEmail: email,
        userId: finalUserId,
        isLoading: false,
        isAuthenticated: !!email,
      });
    }

    initAuth();
  }, [loadConfig, loadSession]);

  const login = useCallback((email: string, id: string) => {
    localStorage.setItem(USER_EMAIL_KEY, email);
    localStorage.setItem(USER_ID_KEY, id);
    setAuthState(prev => ({
      ...prev,
      userEmail: email,
      userId: id,
      isAuthenticated: true,
    }));
  }, []);

  const logout = useCallback(async () => {
    localStorage.removeItem(USER_EMAIL_KEY);
    localStorage.removeItem(USER_ID_KEY);
    
    const supabase = getSupabase();
    if (supabase) {
      await supabase.auth.signOut().catch(() => {});
    }

    setAuthState(prev => ({
      ...prev,
      userEmail: null,
      userId: null,
      isAuthenticated: false,
    }));
  }, []);

  const refreshProfile = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase || !authState.userId) return;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", getSafeUUID(authState.userId))
        .single();

      if (profile?.email) {
        setAuthState(prev => ({
          ...prev,
          userEmail: profile.email,
        }));
        localStorage.setItem(USER_EMAIL_KEY, profile.email);
      }
    } catch (err) {
      console.warn("Failed to refresh profile:", err);
    }
  }, [authState.userId]);

  return {
    ...authState,
    login,
    logout,
    refreshProfile,
  };
}
