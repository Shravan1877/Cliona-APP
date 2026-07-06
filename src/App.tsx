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
import { useNavigation } from "./hooks/useNavigation";
import { useAuth } from "./hooks/useAuth";

function shouldShowLightBackground(theme: string): boolean {
  if (theme === "light") return true;
  if (theme === "dark") return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches;
  }
  return false;
}

export default function App() {
  const { path, navigate } = useNavigation();
  const { userEmail, userId, isLoading, login, logout } = useAuth();
  const [activeTheme, setActiveTheme] = useState<string>(() => {
    return localStorage.getItem("heist-theme-choice") || "system";
  });

  // Theme management
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

    window.addEventListener("heist-theme-choice-changed", handleThemeChange);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener("change", handleSystemThemeChange);
    }

    return () => {
      window.removeEventListener("heist-theme-choice-changed", handleThemeChange);
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener("change", handleSystemThemeChange);
      }
    };
  }, [activeTheme]);

  const handleLogout = () => {
    logout().then(() => {
      navigate("/");
    });
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
    return <Legal onBack={() => navigate("/")} />;
  }

  if (path === "/settings") {
    if (userEmail && userId) {
      return <Settings userEmail={userEmail} userId={userId} onLogout={handleLogout} onBack={() => navigate("/")} />;
    } else {
      return <Login onLoginSuccess={login} />;
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
          <Onboarding userEmail={userEmail} userId={userId} onLogout={handleLogout} />
        ) : (
          <Login onLoginSuccess={login} />
        )}
      </div>
      <InstallPrompt />
    </div>
  );
}
