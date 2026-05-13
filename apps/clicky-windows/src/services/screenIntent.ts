const CONVERSATIONAL_TERMS = [
  "are you there",
  "say hi",
  "hello",
  "hi clicky",
  "can you hear me",
  "who are you",
  "what can you do"
];

export function shouldCaptureScreenForTranscript(transcript: string): boolean {
  const text = transcript.trim().toLowerCase();
  if (!text) return true;

  const conversational = CONVERSATIONAL_TERMS.some((term) => includesTerm(text, term));
  if (conversational && text.split(/\s+/).length <= 8) return false;

  return true;
}

function includesTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
}
