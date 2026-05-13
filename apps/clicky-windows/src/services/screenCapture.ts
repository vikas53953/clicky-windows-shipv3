import type { ScreenContext } from "./workerClient";
import { captureNativeScreenContext, isTauriRuntime } from "./nativeBridge";

const maxCaptureWidth = 1280;

export async function captureScreenContext(): Promise<ScreenContext[]> {
  const nativeCapture = await captureNativeScreenContext();
  if (nativeCapture?.length) {
    return nativeCapture;
  }

  if (isTauriRuntime()) {
    throw new Error("Native Windows screen capture did not return any images.");
  }

  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("Screen capture is not available in this runtime.");
  }

  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      displaySurface: "monitor"
    },
    audio: false
  });

  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    await waitForVideoFrame(video);

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    const scale = Math.min(1, maxCaptureWidth / width);
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare screen capture canvas.");

    context.drawImage(video, 0, 0, targetWidth, targetHeight);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    const [, base64 = ""] = dataUrl.split(",");

    return [
      {
        mediaType: "image/jpeg",
        base64,
        width: targetWidth,
        height: targetHeight
      }
    ];
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }
}

function waitForVideoFrame(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
      resolve();
      return;
    }

    const timeout = window.setTimeout(resolve, 900);
    video.onloadeddata = () => {
      window.clearTimeout(timeout);
      resolve();
    };
  });
}
