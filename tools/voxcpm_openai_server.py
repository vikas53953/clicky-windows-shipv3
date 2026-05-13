from __future__ import annotations

import argparse
import io
import json
import os
import sys
import traceback
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


DEFAULT_MODEL = os.environ.get("CLICKY_VOXCPM_MODEL", "openbmb/VoxCPM2")
DEFAULT_SAMPLE_RATE = int(os.environ.get("CLICKY_VOXCPM_SAMPLE_RATE", "16000"))

_model_id: str | None = None
_model: Any | None = None


def load_model(model_id: str) -> Any:
  global _model, _model_id
  if _model is not None and _model_id == model_id:
    return _model

  try:
    from voxcpm import VoxCPM
  except Exception as exc:
    raise RuntimeError(
      "The Python package 'voxcpm' is not installed in this environment. "
      "Run scripts/run-voxcpm-local.ps1 -Install first."
    ) from exc

  _model = VoxCPM.from_pretrained(model_id)
  _model_id = model_id
  return _model


def generate_audio(model: Any, text: str) -> tuple[bytes, str]:
  try:
    result = model.generate(text)
  except TypeError:
    result = model.generate(text=text)

  wav, sample_rate = unpack_audio(result)
  return encode_wav(wav, sample_rate), "audio/wav"


def unpack_audio(result: Any) -> tuple[Any, int]:
  if isinstance(result, bytes):
    return result, DEFAULT_SAMPLE_RATE

  if isinstance(result, dict):
    wav = result.get("wav") or result.get("audio") or result.get("waveform")
    sample_rate = result.get("sample_rate") or result.get("sampling_rate") or DEFAULT_SAMPLE_RATE
    return wav, int(sample_rate)

  if isinstance(result, (list, tuple)) and len(result) >= 2:
    return result[0], int(result[1])

  return result, DEFAULT_SAMPLE_RATE


def encode_wav(audio: Any, sample_rate: int) -> bytes:
  if isinstance(audio, bytes):
    return audio

  try:
    import numpy as np
  except Exception as exc:
    raise RuntimeError("VoxCPM returned array audio, but numpy is not installed.") from exc

  if hasattr(audio, "detach"):
    audio = audio.detach().cpu().numpy()

  array = np.asarray(audio)
  if array.size == 0:
    raise RuntimeError("VoxCPM returned an empty audio array.")

  array = np.squeeze(array)
  if array.ndim > 1:
    array = array[0]

  if array.dtype.kind == "f":
    peak = float(np.max(np.abs(array))) or 1.0
    array = np.clip(array / peak, -1.0, 1.0)
    array = (array * 32767).astype(np.int16)
  elif array.dtype != np.int16:
    array = array.astype(np.int16)

  with io.BytesIO() as buffer:
    with wave.open(buffer, "wb") as wav_file:
      wav_file.setnchannels(1)
      wav_file.setsampwidth(2)
      wav_file.setframerate(sample_rate)
      wav_file.writeframes(array.tobytes())
    return buffer.getvalue()


class Handler(BaseHTTPRequestHandler):
  server_version = "ClickyVoxCPM/0.1"

  def do_OPTIONS(self) -> None:
    self.send_response(204)
    self.send_cors_headers()
    self.end_headers()

  def do_GET(self) -> None:
    if self.path in ("/health", "/v1/health"):
      self.send_json(
        200,
        {
          "ok": True,
          "provider": "voxcpm",
          "modelLoaded": _model is not None,
          "model": _model_id or DEFAULT_MODEL,
        },
      )
      return

    self.send_json(404, {"ok": False, "error": "Not found."})

  def do_POST(self) -> None:
    if self.path not in ("/v1/audio/speech", "/audio/speech"):
      self.send_json(404, {"ok": False, "error": "Not found."})
      return

    try:
      body = self.read_json()
      text = str(body.get("input") or body.get("text") or "").strip()
      model_id = str(body.get("model") or DEFAULT_MODEL).strip()
      if not text:
        self.send_json(400, {"ok": False, "error": "Missing required field 'input'."})
        return

      model = load_model(model_id)
      audio, content_type = generate_audio(model, text)
      self.send_response(200)
      self.send_cors_headers()
      self.send_header("Content-Type", content_type)
      self.send_header("Content-Length", str(len(audio)))
      self.end_headers()
      self.wfile.write(audio)
    except Exception as exc:
      detail = traceback.format_exc() if os.environ.get("CLICKY_VOXCPM_DEBUG") == "true" else str(exc)
      self.send_json(500, {"ok": False, "error": "VoxCPM synthesis failed.", "detail": detail})

  def read_json(self) -> dict[str, Any]:
    length = int(self.headers.get("Content-Length", "0"))
    raw = self.rfile.read(length).decode("utf-8")
    if not raw:
      return {}
    return json.loads(raw)

  def send_json(self, status: int, payload: dict[str, Any]) -> None:
    body = json.dumps(payload, indent=2).encode("utf-8")
    self.send_response(status)
    self.send_cors_headers()
    self.send_header("Content-Type", "application/json")
    self.send_header("Content-Length", str(len(body)))
    self.end_headers()
    self.wfile.write(body)

  def send_cors_headers(self) -> None:
    origin = self.headers.get("Origin")
    allowed_origin = origin if origin in ("http://127.0.0.1:5174", "http://localhost:5174", "tauri://localhost") else "*"
    self.send_header("Access-Control-Allow-Origin", allowed_origin)
    self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
    self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")
    self.send_header("Access-Control-Max-Age", "600")

  def log_message(self, format: str, *args: Any) -> None:
    sys.stderr.write("%s - %s\n" % (self.address_string(), format % args))


def main() -> None:
  parser = argparse.ArgumentParser(description="OpenAI-compatible local VoxCPM speech server for Clicky.")
  parser.add_argument("--host", default=os.environ.get("CLICKY_VOXCPM_HOST", "127.0.0.1"))
  parser.add_argument("--port", type=int, default=int(os.environ.get("CLICKY_VOXCPM_PORT", "8000")))
  parser.add_argument("--preload", action="store_true", help="Load the model before accepting requests.")
  parser.add_argument("--model", default=DEFAULT_MODEL)
  args = parser.parse_args()

  os.environ["CLICKY_VOXCPM_MODEL"] = args.model
  if args.preload:
    load_model(args.model)

  server = ThreadingHTTPServer((args.host, args.port), Handler)
  print(f"Clicky VoxCPM server listening on http://{args.host}:{args.port}/v1/audio/speech")
  server.serve_forever()


if __name__ == "__main__":
  main()
