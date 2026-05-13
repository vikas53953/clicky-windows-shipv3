# VoxCPM Local TTS

## Why This Exists

ElevenLabs is currently blocked for this workspace, and the user found VoxCPM as a free/open-source alternative with Turkish support.

Clicky now has a local VoxCPM fallback before Voicebox/Chatterbox and Windows speech synthesis.

VoxCPM2 documents support for these 30 languages:

```txt
Arabic, Burmese, Chinese, Danish, Dutch, English, Finnish, French, German, Greek,
Hebrew, Hindi, Indonesian, Italian, Japanese, Khmer, Korean, Lao, Malay,
Norwegian, Polish, Portuguese, Russian, Spanish, Swahili, Swedish, Tagalog,
Thai, Turkish, Vietnamese
```

It also documents Chinese dialect support:

```txt
Sichuanese, Cantonese, Wu, Northeastern Mandarin, Henan dialect, Shaanxi dialect,
Shandong dialect, Tianjin dialect, Minnan
```

## Expected Local API

Clicky expects an OpenAI-compatible speech endpoint:

```txt
POST http://127.0.0.1:8000/v1/audio/speech
```

Request:

```json
{
  "model": "openbmb/VoxCPM2",
  "input": "Clicky voice test.",
  "voice": "default"
}
```

Response:

```txt
audio/wav or another browser-playable audio content type
```

## Check Command

Check local prerequisites:

```powershell
npm run voxcpm:check-prereqs
```

Start the sidecar after installing VoxCPM dependencies:

```powershell
npm run voxcpm:install
npm run voxcpm:serve
```

Run:

```powershell
npm run check:voxcpm
```

If the VoxCPM service is not running, this reports:

```json
{
  "ok": false,
  "status": "not_running"
}
```

When the service is running and returns playable audio, it writes:

```txt
docs/voxcpm-smoke.wav
```

## App Environment

```txt
VITE_CLICKY_VOXCPM_URL=http://127.0.0.1:8000/v1
VITE_CLICKY_VOXCPM_MODEL=openbmb/VoxCPM2
VITE_CLICKY_VOXCPM_VOICE=default
```

These are not secrets. VoxCPM is local-only.

## Reference Startup Shape

The VoxCPM repository documents both direct Python use and vLLM-Omni serving. The Clicky integration is built for the OpenAI-compatible serving path, because it gives the desktop app a simple localhost HTTP interface.

This repo also includes a small OpenAI-compatible wrapper:

```txt
tools/voxcpm_openai_server.py
```

It exposes:

```txt
GET  /health
POST /v1/audio/speech
```

Bootstrap path:

```powershell
npm run voxcpm:install
npm run voxcpm:serve
```

The install step creates `.venv-voxcpm` and installs `voxcpm`. The serve step starts the local server. The venv and generated smoke audio are gitignored.

Example shape from the VoxCPM docs:

```powershell
vllm serve openbmb/VoxCPM-0.5B --task audio --trust-remote-code --dtype bfloat16 --max-model-len 1024 --enforce-eager --gpu-memory-utilization 0.4
```

Use the current VoxCPM-recommended model if their docs change. This may need CUDA/WSL2 on Windows depending on the installed PyTorch/vLLM stack.

## Fallback Order

1. ElevenLabs through the Worker.
2. Local VoxCPM OpenAI-compatible speech endpoint.
3. Local Voicebox/Chatterbox.
4. Windows speech synthesis.

## Ollama Note

Ollama is installed on this machine, but the installed models are not TTS models. Community Orpheus TTS GGUF/Ollama entries exist, including some multilingual tags, but I did not find a Turkish-ready Ollama TTS path comparable to VoxCPM2. They are not currently wired because they need extra audio-token decoding or a service wrapper before Clicky can play real audio reliably.

## Current Machine Prereq Finding

Verified on this Windows machine:

```txt
Python 3.11: available
VoxCPM venv: created at .venv-voxcpm
VoxCPM package: installed
NVIDIA/CUDA: not detected by nvidia-smi
GPU list: Intel Arc Graphics plus DisplayLink devices
```

The `voxcpm` pip package is available for Python 3.11, but its wheel metadata lists a full ML/audio stack:

```txt
torch>=2.5.0, torchaudio>=2.5.0, torchcodec, transformers>=4.36.2,
gradio, modelscope, datasets, funasr, librosa, soundfile, safetensors, and others
```

Sidecar status:

```txt
GET /health: works
OPTIONS /v1/audio/speech: works after CORS fix
POST /v1/audio/speech: timed out after 180 seconds on CPU
```

The VoxCPM logs show:

```txt
Running on device: cpu
torch.compile disabled - VoxCPMModel can only be optimized on CUDA device
cuda is not available, using cpu instead
```

Decision: do not claim local VoxCPM is a practical working voice replacement on this machine until `npm run check:voxcpm` writes `docs/voxcpm-smoke.wav`. The integration path is wired, but this machine needs a faster runtime/GPU path or a lighter local TTS engine for usable live Clicky voice.
