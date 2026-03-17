import { useState, useRef, useCallback } from "react";

const FLASK_BASE = "https://shambaline-878383503053.europe-west1.run.app";

// Silence detection config
const SILENCE_THRESHOLD = 15; // RMS amplitude * 100 — below this is treated as silence
const SPEECH_CONFIRM_MS = 300; // need 300ms of consecutive loud frames to confirm speech started
const SILENCE_MS = 1500;      // stop recording after 1.5s of continuous silence post-speech
const MAX_RECORD_MS = 15000;  // hard cap: stop after 15s regardless

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const silenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const cancelledRef = useRef(false);

  /**
   * Start recording and automatically stop when silence is detected after speech.
   * Calls onRecordingStopped() the moment the mic cuts — so the UI can switch
   * to "Processing..." while transcription happens in the background.
   * Returns the transcribed text once done.
   */
  const recordAndTranscribeAuto = useCallback(
    (onRecordingStopped?: () => void): Promise<string> => {
      return new Promise(async (resolve, reject) => {
        cancelledRef.current = false;

        // --- Mic stream ---
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
          reject(err);
          return;
        }

        // --- Web Audio analyser for silence detection ---
        let analyserNode: AnalyserNode | null = null;
        try {
          const audioCtx = new AudioContext();
          audioCtxRef.current = audioCtx;
          const source = audioCtx.createMediaStreamSource(stream);
          analyserNode = audioCtx.createAnalyser();
          analyserNode.fftSize = 512;
          source.connect(analyserNode);
        } catch {
          // AudioContext unavailable — fall back to MAX_RECORD_MS cap only
        }

        // --- MediaRecorder ---
        const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

        const recorder = new MediaRecorder(stream, { mimeType });
        chunksRef.current = [];
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data);
        };

        recorder.onstop = async () => {
          // Clear silence detection
          if (silenceIntervalRef.current) {
            clearInterval(silenceIntervalRef.current);
            silenceIntervalRef.current = null;
          }
          // Close audio context
          if (audioCtxRef.current) {
            audioCtxRef.current.close().catch(() => {});
            audioCtxRef.current = null;
          }
          stream.getTracks().forEach((t) => t.stop());
          setIsListening(false);

          // Notify caller so UI can flip to "Processing..."
          onRecordingStopped?.();

          if (cancelledRef.current) {
            reject(new Error("Recording cancelled"));
            return;
          }

          // Transcribe
          try {
            const ext = mimeType.includes("webm") ? "webm" : "mp4";
            const blob = new Blob(chunksRef.current, { type: mimeType });
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

        recorder.start(100);
        setIsListening(true);

        // --- Silence detection loop ---
        if (analyserNode) {
          const analyser = analyserNode;
          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const startTime = Date.now();
          let speechConfirmed = false;
          let speechStart: number | null = null; // tracks consecutive loud frames
          let silenceStart: number | null = null;

          silenceIntervalRef.current = setInterval(() => {
            if ((recorder.state as string) === "inactive") {
              clearInterval(silenceIntervalRef.current!);
              silenceIntervalRef.current = null;
              return;
            }

            // Calculate RMS amplitude of current audio frame
            analyser.getByteTimeDomainData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              const v = (dataArray[i] - 128) / 128; // normalise to -1..1
              sum += v * v;
            }
            const rms = Math.sqrt(sum / dataArray.length) * 100;

            if (rms > SILENCE_THRESHOLD) {
              // Loud frame — work towards confirming speech
              silenceStart = null;
              if (!speechConfirmed) {
                if (speechStart === null) speechStart = Date.now();
                if (Date.now() - speechStart >= SPEECH_CONFIRM_MS) {
                  speechConfirmed = true;
                }
              }
            } else {
              // Quiet frame
              speechStart = null; // reset speech confirmation streak
              if (speechConfirmed) {
                // Silence after confirmed speech — start / extend silence window
                if (silenceStart === null) silenceStart = Date.now();
                if (Date.now() - silenceStart >= SILENCE_MS) {
                  clearInterval(silenceIntervalRef.current!);
                  silenceIntervalRef.current = null;
                  if ((recorder.state as string) !== "inactive") recorder.stop();
                  return;
                }
              }
            }

            // Hard cap
            if (Date.now() - startTime >= MAX_RECORD_MS) {
              clearInterval(silenceIntervalRef.current!);
              silenceIntervalRef.current = null;
              if ((recorder.state as string) !== "inactive") recorder.stop();
            }
          }, 100);
        } else {
          // No analyser: fall back to hard cap
          setTimeout(() => {
            if ((recorder.state as string) !== "inactive") recorder.stop();
          }, MAX_RECORD_MS);
        }
      });
    },
    []
  );

  /**
   * Immediately abort any in-progress recording without transcribing.
   * Call this when the user hangs up mid-recording.
   */
  const cancelRecording = useCallback(() => {
    cancelledRef.current = true;

    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current);
      silenceIntervalRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    }

    setIsListening(false);
  }, []);

  const speak = useCallback(async (text: string) => {
    setIsSpeaking(true);
    try {
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
    recordAndTranscribeAuto,
    cancelRecording,
    speak,
    stopSpeaking,
  };
}
