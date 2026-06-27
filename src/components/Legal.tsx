import React, { useState } from "react";
import { motion } from "motion/react";
import { ArrowLeft, Shield, FileText, RefreshCw, Scale, AlertCircle, Info, Sparkles } from "lucide-react";

type Section = "refund" | "privacy" | "terms";

interface LegalProps {
  onBack: () => void;
}

export default function Legal({ onBack }: LegalProps) {
  const [activeLayout, setActiveLayout] = useState<Section>("refund");

  return (
    <div id="legal-page" className="min-h-screen w-full bg-black text-neutral-300 font-sans flex flex-col antialiased">
      {/* Header */}
      <header className="border-b border-neutral-900 bg-[#0d0d0d]/80 backdrop-blur-md sticky top-0 z-40 px-4 py-4 md:px-8 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={onBack}
            className="group flex items-center space-x-2 text-xs font-black uppercase tracking-wider text-teal-400 hover:text-teal-300 bg-neutral-900/60 border border-neutral-800/80 px-3 py-2 rounded-xl transition duration-150 active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Go Back</span>
          </button>
          
          <div className="h-5 w-[1px] bg-neutral-800 hidden sm:block" />
          
          <div className="hidden sm:flex items-center space-x-2">
            <span className="font-mono text-xs font-bold text-neutral-500 tracking-widest uppercase">STYLING PROTOCOL</span>
            <span className="text-teal-500 font-mono text-[10px] bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20">v3.1.LEGAL</span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <span className="font-extrabold tracking-widest text-[#a3a3a3] font-sans text-sm tracking-tighter uppercase">
            CLIONA<span className="text-teal-400 font-black">.</span>
          </span>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-8 md:py-12 flex flex-col md:flex-row gap-8 lg:gap-12">
        
        {/* Navigation Sidebar / Tab List */}
        <aside className="w-full md:w-64 lg:w-72 shrink-0 space-y-6">
          <div className="bg-[#0f0f0f] border border-neutral-900 rounded-3xl p-6 space-y-4">
            <div>
              <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono font-black">Governance & Policy</p>
              <h2 className="text-lg font-extrabold text-white uppercase tracking-tight mt-1">Legal Center</h2>
            </div>
            
            <p className="text-xs text-[#a3a3a3] leading-relaxed">
              Please review the official regulatory terms, privacy guidelines, and final transaction boundaries for utilizing the <strong>CLIONA.</strong> engine.
            </p>
          </div>

          {/* Tab Options */}
          <div className="flex flex-col gap-2.5">
            <button
              onClick={() => setActiveLayout("refund")}
              className={`w-full text-left flex items-center justify-between p-4 rounded-2xl border transition duration-200 cursor-pointer active:scale-98 ${
                activeLayout === "refund"
                  ? "bg-neutral-900 border-teal-500/30 text-white shadow-lg shadow-teal-500/5 font-bold"
                  : "bg-transparent border-neutral-900 text-neutral-400 hover:bg-neutral-950 hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-3">
                <RefreshCw size={16} className={activeLayout === "refund" ? "text-teal-400" : "text-neutral-500"} />
                <span className="text-sm tracking-wide">Refund Policy</span>
              </div>
              <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${
                activeLayout === "refund" ? "bg-teal-500/15 text-teal-400" : "bg-neutral-900 text-neutral-500"
              }`}>
                Strict
              </span>
            </button>

            <button
              onClick={() => setActiveLayout("privacy")}
              className={`w-full text-left flex items-center justify-between p-4 rounded-2xl border transition duration-200 cursor-pointer active:scale-98 ${
                activeLayout === "privacy"
                  ? "bg-neutral-900 border-teal-500/30 text-white shadow-lg shadow-teal-500/5 font-bold"
                  : "bg-transparent border-neutral-900 text-neutral-400 hover:bg-neutral-950 hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Shield size={16} className={activeLayout === "privacy" ? "text-teal-400" : "text-neutral-500"} />
                <span className="text-sm tracking-wide">Privacy Policy</span>
              </div>
              <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${
                activeLayout === "privacy" ? "bg-teal-500/15 text-teal-400" : "bg-neutral-900 text-neutral-500"
              }`}>
                Secure
              </span>
            </button>

            <button
              onClick={() => setActiveLayout("terms")}
              className={`w-full text-left flex items-center justify-between p-4 rounded-2xl border transition duration-200 cursor-pointer active:scale-98 ${
                activeLayout === "terms"
                  ? "bg-neutral-900 border-teal-500/30 text-white shadow-lg shadow-teal-500/5 font-bold"
                  : "bg-transparent border-neutral-900 text-neutral-400 hover:bg-neutral-950 hover:text-white"
              }`}
            >
              <div className="flex items-center space-x-3">
                <Scale size={16} className={activeLayout === "terms" ? "text-teal-400" : "text-neutral-500"} />
                <span className="text-sm tracking-wide">Terms of Service</span>
              </div>
              <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-full ${
                activeLayout === "terms" ? "bg-teal-500/15 text-teal-400" : "bg-neutral-900 text-neutral-500"
              }`}>
                India
              </span>
            </button>
          </div>

          <div className="bg-[#090909] border border-neutral-900/65 rounded-2xl p-4 flex items-start space-x-3 text-[11px] text-neutral-500">
            <Info size={14} className="text-teal-500 scale-100 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Have legal queries? Contact the <strong>CLIONA.</strong> compliance registry at <span className="text-teal-400 font-mono">compliance@cliona.style</span>.
            </p>
          </div>
        </aside>

        {/* Policy Content Viewer */}
        <main className="flex-1 bg-[#0a0a0a]/50 border border-neutral-900 rounded-3xl p-6 md:p-10 relative overflow-hidden">
          
          {/* Glowing accent backdrops */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-neutral-900/50 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10">
            {activeLayout === "refund" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 pb-4 border-b border-neutral-900">
                  <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-teal-400">
                    <RefreshCw size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-teal-400 font-bold uppercase tracking-widest bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/10">SECTION 1.0</span>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">Refund Policy</h1>
                  </div>
                </div>

                <div className="prose prose-invert prose-teal max-w-none text-neutral-400 text-sm leading-relaxed space-y-6">
                  <p className="text-neutral-300 font-bold text-base bg-neutral-950 p-4 rounded-xl border border-neutral-900/80 leading-relaxed">
                    CLIONA. provides state-of-the-art interactive companion features and unhinged gassing-up consultations. Please read our transaction boundaries carefully before making payments.
                  </p>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">1. No Refund Guarantee for Instantly Delivered Assets</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      CLIONA. is built around providing instantly accessible, personalized digital products (including custom <strong>Style Diagnostic Reports</strong>) and high-performance digital subscriptions (such as <strong>Cliona Premium</strong> processing). Because these files, assets, and neural responses are rendered and delivered to your profile immediately upon payment clearance, <strong>all transactions are final. No refunds, returns, or product exchanges are permitted.</strong>
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">2. Strict Delivery Confirmation</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      Once our multi-layer aesthetic engine completes running reports, or once the chat portal of the Cliona AI becomes accessed or unlocked, digital fulfillment is deemed 100% complete. CLIONA. is not liable for subjective opinions about fashion guidance, fit checks, or aesthetic reports. Once generated, the digital reports are mapped permanently onto our decentralized cloud system.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">3. Subscription Cancelation Rules</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      For premium auto-renewing cycles, users can cancel their recurring subscription at any time. When a subscription is cancelled, access to active premium features remains unlocked until the current billing cycle ends. Future recurring billings are immediately prevented upon submitting a cancellation. No partial or prorated refunds are issued for the remainder of an ongoing billing term.
                    </p>
                  </div>

                  <div className="bg-teal-500/5 border border-teal-500/10 p-5 rounded-2xl flex items-start space-x-3">
                    <AlertCircle className="text-teal-400 shrink-0 mt-0.5 animate-pulse" size={16} />
                    <div className="space-y-1">
                      <p className="text-xs font-bold text-teal-300 uppercase tracking-wide">Digital Nature Acknowledgment</p>
                      <p className="text-xs text-neutral-400 leading-relaxed">
                        By proceeding with checkout or subscribing to Cliona Premium, you explicitly acknowledge and grant consent that you waive all cooling-off periods or traditional e-commerce return rights since delivery of services begins instantly upon payment.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeLayout === "privacy" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 pb-4 border-b border-neutral-900">
                  <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-teal-400">
                    <Shield size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-teal-400 font-bold uppercase tracking-widest bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/10">SECTION 2.0</span>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">Privacy Policy</h1>
                  </div>
                </div>

                <div className="prose prose-invert prose-teal max-w-none text-neutral-400 text-sm leading-relaxed space-y-6">
                  <div className="bg-neutral-950 p-4 border border-neutral-900 rounded-xl">
                    <p className="text-neutral-300 font-bold leading-relaxed">
                      At CLIONA., we build premium digital companion relationships, not surveillance software. Our core business is providing incredible user validation. We never treat your conversational context as a monetization asset.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">1. Front & Side Selfie Photo Analysis</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      User photos uploaded for the Style Diagnostic are processed using advanced localized client-side compression to minimize payload size. They are securely transmitted to our Vision APIs solely for the purpose of geometric bone-structure extraction, custom styling alignment, and hair/undertone classification. 
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">2. Biometric Protection Clause</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      <strong>We do not sell, rent, license, or exchange biometric identifiers, facial recognition data, user photos, or private measurements to third parties.</strong> Analyzing your canvas is purely a mathematical classification mapping. Once your physical traits (e.g., cool undertone, sharp bone symmetry) are finalized and saved, raw photos are subject to automatic purge buffers.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">3. Chat Logs and Thread Memory</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      Chats with the Cliona AI are stored securely across isolated namespaces to maintain conversation memory, support conversational context, and allow your digital stylist best friend to remember your personal anecdotes, styling issues, and preferences. 
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">4. Absolute Deletion Rights ("Right to Be Forgotten")</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      Every CLIONA. user can request complete account data deletion, database purging, and associated memory cleanout. Simply send a request to <span className="text-teal-400 font-mono">compliance@cliona.style</span>, and our administrative triggers will wipe all profiles, memories, and files from our registries within 7 business days.
                    </p>
                  </div>

                  <div className="bg-neutral-950 border border-neutral-900 p-4 rounded-xl flex items-center space-x-3 text-xs text-neutral-500">
                    <Sparkles className="text-teal-500 shrink-0 scale-90" size={16} />
                    <span>Privacy assurance: CLIONA. remains strictly compliant with international GDPR data minimisation concepts and state-level biometric retention limits.</span>
                  </div>
                </div>
              </motion.div>
            )}

            {activeLayout === "terms" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
                className="space-y-6"
              >
                <div className="flex items-center space-x-3 pb-4 border-b border-neutral-900">
                  <div className="p-3.5 bg-teal-500/10 border border-teal-500/20 rounded-2xl text-teal-400">
                    <Scale size={24} />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-teal-400 font-bold uppercase tracking-widest bg-teal-500/10 px-2 py-0.5 rounded border border-teal-500/10">SECTION 3.0</span>
                    <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white uppercase mt-1">Terms of Service</h1>
                  </div>
                </div>

                <div className="prose prose-invert prose-teal max-w-none text-neutral-400 text-sm leading-relaxed space-y-6">
                  <div>
                    <p className="text-neutral-300 font-bold">
                      Welcome to CLIONA. These terms regulate your administrative use of our digital platform, biometric scanner APIs, and interactive conversational engine.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">1. Artificial Intelligence Disclaimer</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      <strong>All styling reports, material metrics, fit classifications, and conversational interactions provided by "Cliona" are generated by Artificial Intelligence algorithms.</strong> These recommendations are for entertainment, aesthetic guidance, and educational inspiration only. Cliona acts as a digital wingman; CLIONA. does not guarantee specific real-world outcomes, social feedback, or compatibility indices.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">2. Liability Limitation</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      CLIONA. is not liable for any subjective dissatisfaction, physical discomfort from clothing purchased elsewhere, or mismatched retail coordinates. All purchase links, aesthetic inspiration, and suggestions are adopted purely at the user's discretion.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">3. Prohibited Content and System Abuse</h2>
                    <p className="pl-4 border-l border-neutral-800">
                      Users must not upload explicit, copyrighted, or malicious photo assets. We reserve the immediate right to suspend user profiles if chats exceed friendly limits, spam requests, utilize automated scrapers, or target physical exploits in our FastAPI routing networks.
                    </p>
                  </div>

                  <div>
                    <h2 className="text-[#a3a3a3] font-extrabold uppercase text-xs tracking-wider font-mono mb-2">4. Governing Law and Legal Jurisdiction</h2>
                    <p className="pl-4 border-l border-neutral-800 font-bold text-white">
                      These terms, alongside any disputes, transaction queries, or complaints arising out of the CLIONA. ecosystem, shall be governed exclusively by the laws of Telangana, India. All users submit to the exclusive location registry and jurisdiction of the courts located in Hyderabad, Telangana, India.
                    </p>
                  </div>

                  <div className="bg-neutral-950 border border-neutral-900 p-4 rounded-xl text-neutral-500 text-xs">
                    Last Revised: May 30, 2026. Codebase Release 3.1. All administrative design properties copyright CLIONA. Inc.
                  </div>
                </div>
              </motion.div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
