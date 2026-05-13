import { playAudioBlob } from "./audioPlayback";
import { parsePointTags } from "./pointTags";
import { parseWorkflowPlanBlocks } from "./workflowPlan";
import { requestTextToSpeech, type ClickySettings } from "./workerClient";

export interface ExtractedSentences {
  sentences: string[];
  remainder: string;
}

export interface StreamingSpeechMetrics {
  firstTtsRequestMs?: number;
  firstAudioReadyMs?: number;
  ttsTotalMs: number;
  playbackTotalMs: number;
  segments: number;
}

interface StreamingSpeechOptions {
  settings: ClickySettings;
  startedAt: number;
  signal?: AbortSignal;
  synthesize?: (settings: ClickySettings, text: string, signal?: AbortSignal) => Promise<Blob | null>;
  play?: (audio: Blob, signal?: AbortSignal) => Promise<void>;
  now?: () => number;
  onFirstTtsRequestMs?: (ms: number) => void;
  onFirstAudioReadyMs?: (ms: number) => void;
}

export interface StreamingSpeechQueue {
  push(chunk: string): void;
  finish(): void;
  waitUntilDone(): Promise<StreamingSpeechMetrics>;
}

export function extractSpeakableSentences(text: string): ExtractedSentences {
  const clean = sanitizeForSpeech(text);
  const sentences: string[] = [];
  let lastEnd = 0;
  const sentencePattern = /[^.!?।]+[.!?।]+(?:["')\]]+)?/g;
  let match: RegExpExecArray | null;

  while ((match = sentencePattern.exec(clean))) {
    const sentence = normalizeSpeechText(match[0]);
    lastEnd = sentencePattern.lastIndex;
    if (sentence.length >= 2) sentences.push(sentence);
  }

  return {
    sentences,
    remainder: normalizeSpeechText(clean.slice(lastEnd))
  };
}

export function sanitizeForSpeech(text: string): string {
  const withoutPointTags = parsePointTags(text.replace(/\[POINT:[^\]]*$/i, "")).cleanText;
  const withoutPlans = parseWorkflowPlanBlocks(withoutPointTags).cleanText;
  return normalizeSpeechText(withoutPlans);
}

export function createSentenceStreamingSpeech(options: StreamingSpeechOptions): StreamingSpeechQueue {
  const synthesize = options.synthesize ?? requestTextToSpeech;
  const play = options.play ?? playAudioBlob;
  const now = options.now ?? (() => performance.now());
  let buffer = "";
  let chain = Promise.resolve();
  let firstTtsRequestSeen = false;
  let firstAudioReadySeen = false;
  const metrics: StreamingSpeechMetrics = {
    ttsTotalMs: 0,
    playbackTotalMs: 0,
    segments: 0
  };

  const enqueue = (sentence: string) => {
    chain = chain.then(async () => {
      if (options.signal?.aborted) return;
      const ttsStartedAt = now();
      if (!firstTtsRequestSeen) {
        firstTtsRequestSeen = true;
        metrics.firstTtsRequestMs = Math.max(0, Math.round(ttsStartedAt - options.startedAt));
        options.onFirstTtsRequestMs?.(metrics.firstTtsRequestMs);
      }

      const audio = await synthesize(options.settings, sentence, options.signal);
      metrics.ttsTotalMs += Math.max(0, Math.round(now() - ttsStartedAt));

      if (audio && !options.signal?.aborted) {
        if (!firstAudioReadySeen) {
          firstAudioReadySeen = true;
          metrics.firstAudioReadyMs = Math.max(0, Math.round(now() - options.startedAt));
          options.onFirstAudioReadyMs?.(metrics.firstAudioReadyMs);
        }

        const playbackStartedAt = now();
        await play(audio, options.signal);
        metrics.playbackTotalMs += Math.max(0, Math.round(now() - playbackStartedAt));
      }

      if (!options.signal?.aborted) {
        metrics.segments += 1;
      }
    });
  };

  const drainCompleteSentences = () => {
    const extracted = extractSpeakableSentences(buffer);
    buffer = extracted.remainder;
    for (const sentence of extracted.sentences) enqueue(sentence);
  };

  return {
    push(chunk: string) {
      if (options.signal?.aborted) return;
      buffer += chunk;
      drainCompleteSentences();
    },
    finish() {
      if (options.signal?.aborted) {
        buffer = "";
        return;
      }
      const finalText = sanitizeForSpeech(buffer);
      buffer = "";
      if (finalText) enqueue(finalText);
    },
    waitUntilDone() {
      return chain.then(() => metrics);
    }
  };
}

function normalizeSpeechText(value: string): string {
  return value
    .replace(/\s+([.,!?;:।])/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}
