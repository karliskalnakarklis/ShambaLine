import { useState } from "react";
import { Phone, Leaf, Sun } from "lucide-react";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";

const HOTLINE_NUMBER = "tel:+254700000000";

export default function App() {
  const [calling, setCalling] = useState(false);

  const handleCall = () => {
    setCalling(true);
    setTimeout(() => setCalling(false), 1500);
    window.open(HOTLINE_NUMBER, "_self");
  };

  return (
    <div className="size-full flex items-center justify-center bg-[#f5f0e8]">
      {/* iPhone-style frame */}
      <div className="w-[375px] h-[812px] max-h-[100dvh] bg-white rounded-[40px] shadow-2xl overflow-hidden flex flex-col relative">
        {/* iOS Status Bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 pt-4 pb-1 z-20">
          <span className="text-[13px] text-white/90">9:41</span>
          <div className="w-[120px] h-[28px] bg-black rounded-full mx-auto" />
          <div className="flex items-center gap-1">
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
              <rect x="0" y="5" width="3" height="7" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="4.5" y="3" width="3" height="9" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="9" y="1" width="3" height="11" rx="1" fill="white" fillOpacity="0.9" />
              <rect x="13.5" y="0" width="3" height="12" rx="1" fill="white" fillOpacity="0.3" />
            </svg>
          </div>
        </div>

        {/* Hero Image */}
        <div className="relative flex-1 overflow-hidden">
          <ImageWithFallback
            src="https://images.unsplash.com/photo-1763307058576-1b98af4e83c4?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3aWRlJTIwZmFybWxhbmQlMjByb3dzJTIwYWVyaWFsJTIwZ3JlZW58ZW58MXx8fHwxNzczNzQ4MzAxfDA&ixlib=rb-4.1.0&q=80&w=1080&utm_source=figma&utm_medium=referral"
            alt="Wide farmland landscape"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-white" />
        </div>

        {/* Content */}
        <div className="flex flex-col items-center px-6 py-10 relative z-10">
          {/* Logo / Title */}
          <div className="flex items-center gap-2 mb-8">
            <Leaf className="w-7 h-7 text-[#2d7a3a]" />
            <h1 className="text-[28px] tracking-tight text-[#2d7a3a]">
              ShambaLine
            </h1>
          </div>

          {/* Call Button */}
          <button
            onClick={handleCall}
            className={`w-full flex items-center justify-center gap-3 py-4 rounded-2xl mb-4 transition-all duration-300 ${
              calling
                ? "bg-[#1e5c28] scale-95"
                : "bg-[#2d7a3a] active:scale-95 hover:bg-[#256e32]"
            }`}
            style={{ boxShadow: "0 8px 24px rgba(45, 122, 58, 0.35)" }}
          >
            <Phone className={`w-6 h-6 text-white ${calling ? "animate-pulse" : ""}`} />
            <span className="text-white text-[18px]">
              {calling ? "Inapiga simu..." : "Piga Simu ShambaLine"}
            </span>
          </button>

          {/* Hotline number */}
          <p className="text-[#b0a28a] mt-4" style={{ fontSize: 13 }}>
            +254 700 000 000
          </p>
        </div>

        {/* iOS Home Indicator */}
        <div className="flex justify-center pb-3">
          <div className="w-[134px] h-[5px] bg-black/20 rounded-full" />
        </div>
      </div>
    </div>
  );
}