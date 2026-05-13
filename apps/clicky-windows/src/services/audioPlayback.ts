const activeAudio = new Set<HTMLAudioElement>();

export function cancelSpeechPlayback(): void {
  for (const audio of activeAudio) {
    audio.pause();
    audio.currentTime = 0;
  }
  activeAudio.clear();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}

export async function playAudioBlob(blob: Blob, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return;
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  activeAudio.add(audio);

  const abortPlayback = () => {
    audio.pause();
    audio.currentTime = 0;
  };

  try {
    signal?.addEventListener("abort", abortPlayback, { once: true });
    await audio.play();
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed."));
      signal?.addEventListener("abort", () => resolve(), { once: true });
    });
  } finally {
    signal?.removeEventListener("abort", abortPlayback);
    activeAudio.delete(audio);
    URL.revokeObjectURL(url);
  }
}

export async function speakWithVoxCpm(text: string): Promise<boolean> {
  const phrase = text.trim();
  if (!phrase) return false;

  const baseUrl = (import.meta.env.VITE_CLICKY_VOXCPM_URL ?? "http://127.0.0.1:8000/v1").replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/audio/speech") ? baseUrl : `${baseUrl}/audio/speech`;
  const model = import.meta.env.VITE_CLICKY_VOXCPM_MODEL ?? "openbmb/VoxCPM2";
  const voice = import.meta.env.VITE_CLICKY_VOXCPM_VOICE ?? "default";

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer EMPTY",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: phrase,
        voice
      })
    });

    if (!response.ok) return false;

    const contentType = response.headers.get("content-type") ?? "audio/wav";
    if (contentType.includes("application/json")) return false;

    const audio = await response.blob();
    if (audio.size < 256) return false;
    await playAudioBlob(audio);
    return true;
  } catch {
    return false;
  }
}

export async function speakWithVoicebox(text: string): Promise<boolean> {
  const phrase = text.trim();
  if (!phrase) return false;

  const voiceboxUrl = (import.meta.env.VITE_CLICKY_VOICEBOX_URL ?? "http://127.0.0.1:17493").replace(/\/$/, "");

  try {
    const response = await fetch(`${voiceboxUrl}/speak`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Voicebox-Client-Id": "clicky-windows"
      },
      body: JSON.stringify({
        text: phrase,
        engine: "chatterbox_turbo",
        language: "en",
        personality: false
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

export async function speakTextLocally(text: string): Promise<boolean> {
  const phrase = text.trim();
  if (!phrase || !("speechSynthesis" in window)) return false;

  window.speechSynthesis.cancel();

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(phrase);
    const timeout = window.setTimeout(() => resolve(false), 6000);
    const finish = (spoken: boolean) => {
      window.clearTimeout(timeout);
      resolve(spoken);
    };
    utterance.rate = 1.02;
    utterance.pitch = 1.05;
    utterance.onend = () => finish(true);
    utterance.onerror = () => finish(false);
    window.speechSynthesis.speak(utterance);
  });
}
