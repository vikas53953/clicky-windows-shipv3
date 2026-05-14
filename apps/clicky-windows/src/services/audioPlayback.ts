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
