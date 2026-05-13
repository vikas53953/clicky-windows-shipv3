$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$devVarsPath = Join-Path $repoRoot "worker\.dev.vars"

function Read-SecretText([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

$openCodeKey = Read-SecretText "Paste OpenCode API key"
$elevenLabsKey = Read-SecretText "Paste ElevenLabs API key"
$voiceId = Read-Host "ElevenLabs voice ID (optional, press Enter to auto-pick first voice)"
$model = Read-Host "OpenCode model (default: minimax-m2.7)"
$apiMode = Read-Host "OpenCode API mode: responses or chat_completions (default: chat_completions)"
$baseUrl = Read-Host "OpenCode base URL (default: https://opencode.ai/zen/v1)"

if ([string]::IsNullOrWhiteSpace($openCodeKey)) {
  throw "OpenCode API key is required for live OpenCode smoke."
}

if ([string]::IsNullOrWhiteSpace($elevenLabsKey)) {
  throw "ElevenLabs API key is required for live TTS smoke."
}

if ([string]::IsNullOrWhiteSpace($model)) {
  $model = "minimax-m2.7"
}

if ([string]::IsNullOrWhiteSpace($apiMode)) {
  $apiMode = "chat_completions"
}

if ([string]::IsNullOrWhiteSpace($baseUrl)) {
  $baseUrl = "https://opencode.ai/zen/v1"
}

$content = @"
MOCK_MODE=false
LLM_PROVIDER=opencode
OPENCODE_MODEL=$model
OPENCODE_API_MODE=$apiMode
OPENCODE_BASE_URL=$baseUrl
OPENCODE_API_KEY=$openCodeKey
ELEVENLABS_API_KEY=$elevenLabsKey
ELEVENLABS_VOICE_ID=$voiceId
ELEVENLABS_STT_MODEL_ID=scribe_v1
ASSEMBLYAI_API_KEY=
"@

Set-Content -LiteralPath $devVarsPath -Value $content -NoNewline
Write-Host "Wrote local Worker secrets to $devVarsPath. This file is gitignored."
