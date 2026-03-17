import { useState, useRef, useCallback } from "react";

const FLASK_BASE = "https://shambaline-878383503053.europe-west1.run.app";

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);

  const startRecording = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
      ? "audio/webm"
      : "audio/mp4";

    const recorder = new MediaRecorder(stream, { mimeType });
    chunksRef.current = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };

    mediaRecorderRef.current = recorder;
    recorder.start(100);
    setIsListening(true);
  }, []);

  const stopRecordingAndTranscribe = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === "inactive") {
        reject(new Error("No active recording"));
        return;
      }

      recorder.onstop = async () => {
        setIsListening(false);
        try {
          const mimeType = recorder.mimeType || "audio/mp4";
          const blob = new Blob(chunksRef.current, { type: mimeType });
          const ext = mimeType.includes("webm") ? "webm" : "mp4";

          const formData = new FormData();
          formData.append("audio", blob, `recording.${ext}`);

          const res = await fetch(`${FLASK_BASE}/api/transcribe`, {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Transcription failed");
          const data = await res.json();
          resolve(data.text || "");
        } catch (err) {
          reject(err);
        }
      };

      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    });
  }, []);

  const speak = useCallback(async (text: string) => {
    setIsSpeaking(true);
    try {
      // Fetch MP3 from Flask gTTS (South African English accent)
      const res = await fetch(`${FLASK_BASE}/api/tts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error("TTS failed");

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudioRef.current = audio;

      await new Promise<void>((resolve, reject) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
        audio.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Audio playback failed"));
        };
        audio.play().catch(reject);
      });
    } finally {
      currentAudioRef.current = null;
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    const audio = currentAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      currentAudioRef.current = null;
    }
    setIsSpeaking(false);
  }, []);

  return {
    isListening,
    isSpeaking,
    startRecording,
    stopRecordingAndTranscribe,
    speak,
    stopSpeaking,
  };
}
