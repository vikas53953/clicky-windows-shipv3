import { describe, expect, it } from "vitest";
import { createSentenceStreamingSpeech, extractSpeakableSentences } from "./streamingSpeech";
import { defaultSettings } from "./workerClient";

describe("streaming speech sentence extraction", () => {
  it("returns complete sentences and keeps the unfinished tail buffered", () => {
    const result = extractSpeakableSentences("Hi there. I can help with that");

    expect(result.sentences).toEqual(["Hi there."]);
    expect(result.remainder).toBe("I can help with that");
  });

  it("does not speak hidden point tags or workflow plans", () => {
    const result = extractSpeakableSentences(
      'Click Test Worker. [POINT:930,318:Test Worker:screen0] <CLICKY_PLAN>{"goal":"test","app":"Clicky","mode":"teaching","steps":[{"type":"click","label":"Test Worker","hint":"Check worker","targetContext":"visibleElement"}]}</CLICKY_PLAN> Then wait.'
    );

    expect(result.sentences).toEqual(["Click Test Worker.", "Then wait."]);
    expect(result.remainder).toBe("");
  });

  it("treats Hindi danda punctuation as a sentence boundary", () => {
    const result = extractSpeakableSentences("haan, main yahan hoon। kaise madad karoon");

    expect(result.sentences).toEqual(["haan, main yahan hoon।"]);
    expect(result.remainder).toBe("kaise madad karoon");
  });

  it("does not synthesize stale speech after its turn is aborted", async () => {
    const abort = new AbortController();
    let calls = 0;
    const queue = createSentenceStreamingSpeech({
      settings: { ...defaultSettings, mockMode: false },
      startedAt: 0,
      signal: abort.signal,
      now: () => 0,
      synthesize: async () => {
        calls += 1;
        return new Blob(["audio"]);
      },
      play: async () => undefined
    });

    abort.abort();
    queue.push("This should not be spoken.");
    queue.finish();
    const metrics = await queue.waitUntilDone();

    expect(calls).toBe(0);
    expect(metrics.segments).toBe(0);
  });
});
