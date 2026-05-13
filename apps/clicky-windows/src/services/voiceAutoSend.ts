export const VOICE_AUTO_SEND_SILENCE_MS = 2_300;
export const VOICE_AUTO_SEND_MIN_RECORDING_MS = 1_200;
export const VOICE_AUTO_SEND_FAILSAFE_MS = 15_000;

export interface VoiceAutoSendState {
  autoStopOnSilence: boolean;
  silenceAlreadyTriggered: boolean;
  nowMs: number;
  recordingStartedAtMs: number;
  speechStarted: boolean;
  lastVoiceAtMs: number;
}

export function shouldAutoSendVoice(state: VoiceAutoSendState): boolean {
  if (!state.autoStopOnSilence || state.silenceAlreadyTriggered) return false;

  const recordingAge = state.nowMs - state.recordingStartedAtMs;
  if (recordingAge >= VOICE_AUTO_SEND_FAILSAFE_MS) return true;
  if (recordingAge < VOICE_AUTO_SEND_MIN_RECORDING_MS) return false;
  if (!state.speechStarted) return false;

  return state.nowMs - state.lastVoiceAtMs >= VOICE_AUTO_SEND_SILENCE_MS;
}
