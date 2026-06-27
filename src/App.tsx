import React, { useState, useEffect } from "react";
import Login from "./components/Login";
import Onboarding from "./components/Onboarding";
import InstallPrompt from "./components/InstallPrompt";
import Legal from "./components/Legal";
import ForgotPassword from "./components/ForgotPassword";
import UpdatePassword from "./components/UpdatePassword";
import Settings from "./components/Settings";
import { getApiUrl } from "./lib/api";
import { HeistDarkBackground } from "./components/HeistDarkBackground";
import { HeistLightBackground } from "./components/HeistLightBackground";

export function getOrCreateHeistUserId(): string {
  const STORAGE_KEY = "heist_user_id";
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      id = crypto.randomUUID();
    } else {
      id = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
    }
    localStorage.setItem(STORAGE_KEY, id);
  }
  return id;
}

function shouldShowLightBackground(theme: string): boolean {
  if (theme === "light") return true;
  if (theme === "dark") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  }
  return false;
}

export default function App() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [path, setPath] = useState<string>(window.location.pathname);
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    return localStorage.getItem("heist-theme-choice") || "system";
  });

  // Listen for custom simple navigation events to keep path in sync beautifully
  useEffect(() => {
    const root = document.documentElement;
    const applyTheme = (theme: string) => {
      root.classList.remove("light", "dark");
      if (theme === "light") {
        root.classList.add("light");
      } else if (theme === "dark") {
        root.classList.add("dark");
      } else {
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
          root.classList.add("light");
        } else {
          root.classList.add("dark");
        }
      }
    };

    applyTheme(activeTheme);

    const handleLocationChange = () => {
      setPath(window.location.pathname);
    };

    const handleThemeChange = (e: Event) => {
      const customEvent = e as CustomEvent<string>;
      const newTheme = customEvent.detail || localStorage.getItem("heist-theme-choice") || "system";
      setActiveTheme(newTheme);
      applyTheme(newTheme);
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (localStorage.getItem("heist-theme-choice") === "system") {
        applyTheme("system");
        setActiveTheme("system");
      }
    };

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("heist-navigate", handleLocationChange);
    window.addEventListener("heist-theme-choice-changed", handleThemeChange);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    }

    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("heist-navigate", handleLocationChange);
      window.removeEventListener("heist-theme-choice-changed", handleThemeChange);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      }
    };
  }, [activeTheme]);

  // Check persistent login on mount and fetch Supabase config dynamically
  useEffect(() => {
    async function initConfigAndSession() {
      try {
        const res = await fetch(getApiUrl("/api/supabase-config"));
        if (res.ok) {
          const config = await res.json();
          if (config.url && config.key) {
            const { initSupabaseKeys } = await import("./lib/supabase");
            initSupabaseKeys(config.url, config.key);
          }
        }
      } catch (err) {
        console.warn("Failed loading Dynamic Supabase configuration:", err);
      }

      let savedEmail = localStorage.getItem("heist_user_email");
      let activeUserId = localStorage.getItem("heist_user_id");

      const { getSupabase } = await import("./lib/supabase");
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
            console.log("App.tsx: Found auth code in URL, exchanging for session...");
            const { data: exchangeData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
            userSession = exchangeData.session;
          } else if (accessToken && refreshToken) {
            console.log("App.tsx: Found access_token in URL hash, setting session...");
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
            localStorage.setItem("heist_user_id", activeUserId);
            if (savedEmail) {
              localStorage.setItem("heist_user_email", savedEmail);
            }

            const { data: profile } = await supabase
              .from("profiles")
              .select("*")
              .eq("id", activeUserId)
              .maybeSingle();

            if (!profile) {
              const isAdmin = savedEmail?.toLowerCase().trim() === "shravan.p1877@gmail.com";
              await supabase.from("profiles").insert([
                {
                  id: activeUserId,
                  full_name: user.user_metadata?.full_name || savedEmail?.split("@")[0] || "Stylist User",
                  avatar_url: user.user_metadata?.avatar_url || null,
                  scan_credits: 5,
                  batch_credits: 8,
                  is_premium: isAdmin,
                  message_count: 0,
                },
              ]);
            }

            const url = new URL(window.location.href);
            if (code) {
              url.searchParams.delete("code");
            }
            if (accessToken) {
              url.hash = "";
            }
            window.history.replaceState({}, document.title, url.pathname + url.search + url.hash);
          }
        } catch (authErr) {
          console.warn("Could not retrieve active Supabase session:", authErr);
        }
      }

      if (!activeUserId) {
        activeUserId = getOrCreateHeistUserId();
      }

      if (savedEmail) {
        setUserEmail(savedEmail);
      }
      setUserId(activeUserId);
      setIsLoading(false);
    }

    initConfigAndSession();
  }, []);

  const handleLoginSuccess = (email: string, id: string) => {
    localStorage.setItem("heist_user_email", email);
    localStorage.setItem("heist_user_id", id);
    setUserEmail(email);
    setUserId(id);
  };

  const handleLogout = () => {
    localStorage.removeItem("heist_user_email");
    localStorage.removeItem("heist_user_id");
    
    import("./lib/supabase").then(({ getSupabase }) => {
      const supabase = getSupabase();
      if (supabase) {
        supabase.auth.signOut().catch(() => {});
      }
    });

    setUserEmail(null);
    setUserId(null);
  };

  const showLight = shouldShowLightBackground(activeTheme);

  if (isLoading) {
    return (
      <div className={`min-h-screen w-full ${showLight ? "bg-[#F9F8F6]" : "bg-black"} text-[var(--text-primary)] flex items-center justify-center font-sans relative overflow-hidden`}>
        {showLight ? <HeistLightBackground /> : <HeistDarkBackground />}

        <div className="text-center space-y-4 z-10">
          <div className="w-10 h-10 border-4 border-[var(--primary-accent)] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs uppercase font-extrabold tracking-widest text-[var(--primary-accent)]">
            Securing Connection...
          </p>
        </div>
      </div>
    );
  }

  if (path === "/legal") {
    return (
      <Legal 
        onBack={() => {
          window.history.pushState({}, "", "/");
          window.dispatchEvent(new Event("heist-navigate"));
        }} 
      />
    );
  }

  if (path === "/settings") {
    if (userEmail && userId) {
      return (
        <Settings 
          userEmail={userEmail}
          userId={userId}
          onLogout={handleLogout}
          onBack={() => {
            window.history.pushState({}, "", "/");
            window.dispatchEvent(new Event("heist-navigate"));
          }}
        />
      );
    } else {
      return (
        <Login 
          onLoginSuccess={handleLoginSuccess}
        />
      );
    }
  }

  if (path === "/forgot-password") {
    return <ForgotPassword />;
  }

  if (path === "/update-password") {
    return <UpdatePassword />;
  }

  return (
    <div className={`min-h-screen w-full ${showLight ? "bg-[#F9F8F6]" : "bg-black"} text-[var(--text-primary)] transition-colors duration-300 overflow-hidden flex flex-col animate-fadeIn relative`}>
      {showLight ? <HeistLightBackground /> : <HeistDarkBackground />}
      
      <div className="flex-grow flex flex-col z-10 relative overflow-hidden">
        {userEmail && userId ? (
          <Onboarding 
            userEmail={userEmail} 
            userId={userId} 
            onLogout={handleLogout} 
          />
        ) : (
          <Login 
            onLoginSuccess={handleLoginSuccess} 
          />
        )}
      </div>
      <InstallPrompt />
    </div>
  );
}
