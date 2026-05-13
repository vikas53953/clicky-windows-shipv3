const partialEndingPattern = /\b(and|or|but|so|because|then|to|for|with|in|at|the|a|an|you|can|could|would|should|please|check|tell|show|open|know)\s*$/i;

export function shouldConfirmTranscriptWithStt(transcript: string): boolean {
  const clean = transcript.trim();
  if (!clean) return true;
  if (/[.!?।]$/.test(clean)) return false;

  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length < 3) return true;

  return partialEndingPattern.test(clean);
}
