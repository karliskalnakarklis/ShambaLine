import { useState, useRef, useCallback } from "react";
import { Phone, PhoneOff } from "lucide-react";
import { useSpeech } from "./hooks/useSpeech";

const API_BASE = "http://karliss-macbook-pro.local:5001";
const RECORD_SECONDS = 7;

type Phase = "idle" | "starting" | "recording" | "processing" | "speaking";

async function apiStart(): Promise<string> {
  const res = await fetch(`${API_BASE}/api/start`, { method: "POST" });
  const data = await res.json();
  return data.greeting;
}

async function apiChat(text: string): Promise<string> {
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  return data.reply;
}

export default function App() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [callDuration, setCallDuration] = useState(0);
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { startRecording, stopRecordingAndTranscribe, speak, stopSpeaking } = useSpeech();

  const startTimer = () => {
    setCallDuration(0);
    timerRef.current = setInterval(() => setCallDuration((s) => s + 1), 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const formatDuration = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, "0");
    const sec = (s % 60).toString().padStart(2, "0");
    return `${m}:${sec}`;
  };

  const conversationLoop = useCallback(async () => {
    while (activeRef.current) {
      setPhase("recording");
      try {
        await startRecording();
      } catch {
        break;
      }

      await new Promise((res) => setTimeout(res, RECORD_SECONDS * 1000));

      if (!activeRef.current) {
        try { await stopRecordingAndTranscribe(); } catch { /* cleanup */ }
        break;
      }

      setPhase("processing");
      let userText = "";
      try {
        userText = await stopRecordingAndTranscribe();
      } catch {
        continue;
      }

      if (!userText.trim()) continue;

      if (["stop", "goodbye", "hang up", "end call"].some(w => userText.toLowerCase().includes(w))) {
        break;
      }

      let reply = "";
      try {
        reply = await apiChat(userText);
      } catch {
        continue;
      }

      if (!activeRef.current) break;

      setPhase("speaking");
      await speak(reply);

      await new Promise((res) => setTimeout(res, 600));
    }

    activeRef.current = false;
    stopTimer();
    setPhase("idle");
    setCallDuration(0);
  }, [startRecording, stopRecordingAndTranscribe, speak]);

  const handleCall = async () => {
    if (phase !== "idle") return;
    setPhase("starting");
    activeRef.current = true;
    startTimer();

    try {
      const greeting = await apiStart();
      if (!activeRef.current) return;
      setPhase("speaking");
      await speak(greeting);
    } catch {
      activeRef.current = false;
      stopTimer();
      setPhase("idle");
      return;
    }

    if (activeRef.current) conversationLoop();
  };

  const handleHangUp = async () => {
    activeRef.current = false;
    await stopSpeaking();
    stopTimer();
    setPhase("idle");
    setCallDuration(0);
  };

  const inCall = phase !== "idle";

  const phaseLabel: Record<Phase, string> = {
    idle: "",
    starting: "Connecting...",
    recording: "Listening...",
    processing: "Processing...",
    speaking: "Speaking...",
  };

  return (
    <div style={{
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "space-between",
      background: inCall ? "#111" : "#1a1a1a",
      fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
      padding: "60px 40px 60px",
      transition: "background 0.4s",
    }}>

      {/* Top: contact info */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        {/* Avatar */}
        <div style={{
          width: 90, height: 90,
          borderRadius: "50%",
          background: "#2d7a3a",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 36,
          boxShadow: inCall ? "0 0 0 4px rgba(45,122,58,0.3)" : "none",
        }}>
          🌿
        </div>

        <div style={{ textAlign: "center" }}>
          <div style={{ color: "white", fontSize: 28, fontWeight: 300, letterSpacing: "-0.5px" }}>
            ShambaLine AI
          </div>
          {inCall ? (
            <div style={{ color: "#4ade80", fontSize: 15, marginTop: 4 }}>
              {phase === "starting" ? "Connecting..." : formatDuration(callDuration)}
            </div>
          ) : (
            <div style={{ color: "#888", fontSize: 15, marginTop: 4 }}>
              AI Farming Assistant
            </div>
          )}
        </div>
      </div>

      {/* Middle: status indicator */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
        {inCall && (
          <>
            <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 40 }}>
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} style={{
                  width: 6,
                  borderRadius: 3,
                  background: phase === "recording" ? "#4ade80"
                    : phase === "speaking" ? "#60a5fa"
                    : "#555",
                  height: phase === "recording" || phase === "speaking"
                    ? `${20 + Math.sin(i * 1.2) * 15}px`
                    : "8px",
                  animation: (phase === "recording" || phase === "speaking")
                    ? `bar${i} 0.8s ease-in-out infinite alternate`
                    : "none",
                  transition: "height 0.3s, background 0.3s",
                }} />
              ))}
            </div>
            <div style={{ color: "#aaa", fontSize: 15 }}>
              {phaseLabel[phase]}
            </div>
          </>
        )}
      </div>

      {/* Bottom: call button */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <button
          onClick={inCall ? handleHangUp : handleCall}
          style={{
            width: 80, height: 80,
            borderRadius: "50%",
            border: "none",
            background: inCall ? "#dc2626" : "#2d7a3a",
            color: "white",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer",
            boxShadow: inCall
              ? "0 8px 32px rgba(220,38,38,0.5)"
              : "0 8px 32px rgba(45,122,58,0.5)",
            transition: "all 0.2s",
          }}
        >
          {inCall
            ? <PhoneOff style={{ width: 32, height: 32 }} />
            : <Phone style={{ width: 32, height: 32 }} />}
        </button>
        <span style={{ color: "#666", fontSize: 13 }}>
          {inCall ? "End Call" : "Call ShambaLine"}
        </span>
      </div>

      <style>{`
        @keyframes bar1 { from{height:8px} to{height:32px} }
        @keyframes bar2 { from{height:16px} to{height:24px} }
        @keyframes bar3 { from{height:6px} to{height:36px} }
        @keyframes bar4 { from{height:20px} to{height:14px} }
        @keyframes bar5 { from{height:10px} to{height:28px} }
      `}</style>
    </div>
  );
}
