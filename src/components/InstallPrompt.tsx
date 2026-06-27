import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sparkles, Download, X, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent original browser pop-up
      e.preventDefault();
      // Store the event
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Only show if the user hasn't dismissed it in this browser session
      const isDismissed = sessionStorage.getItem("heist_pwa_prompt_dismissed");
      if (!isDismissed) {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Optional: detect if already installed
    const handleAppInstalled = () => {
      console.log("HEIST PWA successfully installed!");
      setIsVisible(false);
      setDeferredPrompt(null);
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    // Trigger standard browser dialog
    await deferredPrompt.prompt();

    // Check user decision
    const choiceResult = await deferredPrompt.userChoice;
    console.log(`User installation choice: ${choiceResult.outcome}`);

    // Clean up
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismissClick = () => {
    // Suppress prompt for current session
    sessionStorage.setItem("heist_pwa_prompt_dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible || !deferredPrompt) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 350, damping: 25 }}
        className="fixed bottom-6 left-4 right-4 md:left-auto md:right-6 md:w-[400px] bg-slate-950/95 backdrop-blur-xl border border-slate-800/80 p-5 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] z-[99999] flex flex-col space-y-4 font-sans"
        id="heist-pwa-install-prompt"
      >
        <div className="flex items-start justify-between">
          <div className="flex space-x-3">
            <div className="p-2.5 bg-gradient-to-br from-amber-500 to-yellow-600 rounded-xl text-black shrink-0 shadow-lg shadow-amber-500/10">
              <Smartphone size={20} className="stroke-[2.5]" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-1.5 leading-none mt-1">
                Install Cliona App <Sparkles size={12} className="text-amber-400 fill-amber-400" />
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                Install Cliona to your home screen for the full native experience, fast loading, and offline tools.
              </p>
            </div>
          </div>
          <button
            onClick={handleDismissClick}
            className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex items-center space-x-3 pt-1">
          <button
            onClick={handleDismissClick}
            className="flex-1 py-2.5 px-4 text-xs font-black uppercase tracking-wider border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-900 active:scale-95 transition-all text-center rounded-xl cursor-pointer"
          >
            Maybe Later
          </button>
          <button
            onClick={handleInstallClick}
            className="flex-1 py-2.5 px-4 text-xs font-black uppercase tracking-wider bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 active:scale-95 text-black transition-all text-center rounded-xl font-bold shadow-md shadow-amber-500/10 cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <Download size={14} className="stroke-[2.5]" />
            <span>Install Now</span>
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
