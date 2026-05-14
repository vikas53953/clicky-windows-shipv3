interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: Event) => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    webkitAudioContext?: typeof AudioContext;
    __CLICKY_ACCEPTANCE_TRANSCRIPT__?: string;
  }
}

export interface VoiceCaptureController {
  stop: () => Promise<VoiceCaptureResult>;
  getLevel: () => number;
}

export interface VoiceCaptureResult {
  transcript: string;
  audioBlob: Blob | null;
  speechRecognitionUsed: boolean;
}

export async function startVoiceCapture(): Promise<VoiceCaptureController> {
  if (typeof window.__CLICKY_ACCEPTANCE_TRANSCRIPT__ === "string") {
    return {
      getLevel: () => (window.__CLICKY_ACCEPTANCE_TRANSCRIPT__ ? 0.4 : 0),
      stop: async () => ({
        transcript: window.__CLICKY_ACCEPTANCE_TRANSCRIPT__ || "",
        audioBlob: null,
        speechRecognitionUsed: true
      })
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Microphone capture is not available in this runtime.");
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const chunks: Blob[] = [];
  const recorder = new MediaRecorder(stream, chooseRecorderOptions());
  const recognition = createSpeechRecognition();
  const voiceMeter = createVoiceMeter(stream);
  let transcript = "";
  let stopped = false;

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };
  recorder.start();

  if (recognition) {
    recognition.onresult = (event) => {
      transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript || "")
        .join(" ")
        .trim();
    };
    recognition.onerror = () => {};
    try {
      recognition.start();
    } catch {
      // Some WebView/Chromium builds throw if recognition is already starting.
    }
  }

  return {
    getLevel: voiceMeter.getLevel,
    stop: () =>
      new Promise<VoiceCaptureResult>((resolve) => {
        if (stopped) {
          resolve({ transcript, audioBlob: null, speechRecognitionUsed: Boolean(recognition) });
          return;
        }
        stopped = true;

        if (recognition) {
          try {
            recognition.stop();
          } catch {
            // Recognition may already be stopped by the browser.
          }
        }

        recorder.onstop = () => {
          stream.getTracks().forEach((track) => track.stop());
          voiceMeter.stop();
          resolve({
            transcript,
            audioBlob: chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null,
            speechRecognitionUsed: Boolean(recognition)
          });
        };

        if (recorder.state === "inactive") {
          stream.getTracks().forEach((track) => track.stop());
          voiceMeter.stop();
          resolve({
            transcript,
            audioBlob: chunks.length > 0 ? new Blob(chunks, { type: recorder.mimeType || "audio/webm" }) : null,
            speechRecognitionUsed: Boolean(recognition)
          });
          return;
        }

        recorder.stop();
      })
  };
}

function chooseRecorderOptions(): MediaRecorderOptions | undefined {
  const preferredTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  const mimeType = preferredTypes.find((type) => MediaRecorder.isTypeSupported(type));
  return mimeType ? { mimeType } : undefined;
}

function createVoiceMeter(stream: MediaStream): { getLevel: () => number; stop: () => void } {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    return { getLevel: () => 0, stop: () => {} };
  }

  try {
    const context = new AudioContextClass();
    const analyser = context.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.62;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    return {
      getLevel: () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (const point of data) {
          const normalized = (point - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / data.length);
        return rms < 0.01 ? 0 : Math.min(1, rms * 7);
      },
      stop: () => {
        source.disconnect();
        void context.close();
      }
    };
  } catch {
    return { getLevel: () => 0, stop: () => {} };
  }
}

function createSpeechRecognition(): SpeechRecognitionLike | null {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) return null;

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  return recognition;
}
