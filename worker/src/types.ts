export interface WorkerEnv {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENCODE_API_KEY?: string;
  OPENCODE_BASE_URL?: string;
  OPENCODE_MODEL?: string;
  OPENCODE_API_MODE?: string;
  ASSEMBLYAI_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_STT_MODEL_ID?: string;
  ALLOWED_ORIGINS?: string;
  LLM_PROVIDER?: string;
  MOCK_MODE?: string;
  DEFAULT_WEATHER_LOCATION?: string;
  DEFAULT_TIMEZONE?: string;
}

export interface ChatRequest {
  transcript?: string;
  model?: string;
  responseMode?: "quick" | "screen_guidance" | string;
  computerUseEnabled?: boolean;
  timezone?: string;
  provider?: "anthropic" | "openai" | "opencode" | string;
  messages?: ConversationMessage[];
  screenshots?: Array<{
    mediaType: "image/png" | "image/jpeg" | string;
    base64: string;
    width?: number;
    height?: number;
    screen?: number;
    monitorX?: number;
    monitorY?: number;
    monitorWidth?: number;
    monitorHeight?: number;
    scaleFactor?: number;
    cursorX?: number;
    cursorY?: number;
  }>;
  system?: string;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface InternetToolRequest {
  transcript?: string;
  timezone?: string;
}

export interface InternetToolResult {
  type: "weather" | "search" | "url" | "time";
  status: "ok" | "needs_location" | "no_answer" | "error";
  label?: string;
  summary?: string;
  source?: string;
  error?: string;
}
