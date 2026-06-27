import React from "react";

export const HeistDarkBackground: React.FC = () => {
  return (
    <>
      {/* Enforce CSS Keyframes for the dynamic film grain loop */}
      <style>{`
        @keyframes heist-dark-grain-flicker {
          0%, 100% { transform: translate(0, 0); }
          10% { transform: translate(-1%, -1%); }
          20% { transform: translate(1%, 2%); }
          30% { transform: translate(-2%, -2%); }
          40% { transform: translate(1%, 3%); }
          50% { transform: translate(-1%, 1%); }
          60% { transform: translate(2%, -1%); }
          70% { transform: translate(-2%, 1%); }
          80% { transform: translate(1%, -2%); }
          90% { transform: translate(-1%, 3%); }
        }
        
        .heist-dark-animated-grain {
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E");
          animation: heist-dark-grain-flicker 0.3s steps(4) infinite;
        }
      `}</style>

      <div className="fixed inset-0 z-0 pointer-events-none bg-black overflow-hidden">
        
        {/* Layer 1: The Architectural Grid Matrix using #2d2d2d */}
        <div 
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `
              linear-gradient(to right, #2d2d2d 1px, transparent 1px),
              linear-gradient(to bottom, #2d2d2d 1px, transparent 1px)
            `,
            backgroundSize: "9px 9px"
          }}
        />

        {/* Layer 2: The Live Moving Film Grain Overlaid for Dark Theme */}
        <div className="absolute -inset-[50%] w-[200%] h-[200%] heist-dark-animated-grain opacity-[0.03] mix-blend-screen" />

        {/* Subtle vignette to maintain deep contrast */}
        <div className="absolute inset-0 bg-radial-[circle_at_center,transparent_55%,rgba(0,0,0,0.6)]" />
        
      </div>
    </>
  );
};

export default HeistDarkBackground;
