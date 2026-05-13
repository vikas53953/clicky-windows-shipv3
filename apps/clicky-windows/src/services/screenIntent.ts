const SCREEN_CONTEXT_TERMS = [
  "screen",
  "click",
  "button",
  "window",
  "app",
  "page",
  "website",
  "where",
  "this",
  "that",
  "here",
  "visible",
  "see",
  "look",
  "open",
  "select",
  "field",
  "menu",
  "tab",
  "cursor",
  "mouse",
  "show me",
  "help me with"
];

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

  const asksForScreen = SCREEN_CONTEXT_TERMS.some((term) => includesTerm(text, term));
  if (asksForScreen) return true;

  const conversational = CONVERSATIONAL_TERMS.some((term) => includesTerm(text, term));
  if (conversational) return false;

  return false;
}

function includesTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\W)${escaped}(\\W|$)`, "i").test(text);
}
