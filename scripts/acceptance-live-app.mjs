import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";
const workerUrl = (process.env.CLICKY_WORKER_URL ?? "http://127.0.0.1:8789").replace(/\/$/, "");
const settingsKey = "clicky-settings-v1";

await assertWorkerLive();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });
await installVoiceAndScreenFakes(page);

try {
  await page.goto(appUrl, { waitUntil: "load" });
  await configureLiveSettings(page, workerUrl);
  await page.reload({ waitUntil: "load" });
  await page.getByText("Phase 2 native shell").waitFor({ timeout: 5000 });

  const first = await runVoiceTurn(page, "what color is the sky?", /sky|blue|gray|grey|cloud/i);
  const mathPattern = /345|three hundred(?: and)? forty[- ]five/i;
  const second = await runVoiceTurn(page, "what is 15 times 23?", mathPattern);
  if (/what color is the sky/i.test(second.response)) {
    throw new Error("Rapid-fire turn leaked the previous response into the second answer.");
  }

  await setWorkerUrl(page, "http://127.0.0.1:1");
  const failed = await runVoiceTurn(page, "are you there clicky?", /worker is not reachable|failed/i, { expectError: true });
  if (!/error|needs attention/i.test(failed.statusText)) {
    throw new Error(`Worker-down turn did not enter an error state: ${failed.statusText}`);
  }

  await setWorkerUrl(page, workerUrl);
  await page.getByRole("button", { name: "Clear conversation" }).click();
  const recovered = await runVoiceTurn(page, "what is 15 times 23?", mathPattern);
  if (!mathPattern.test(recovered.response)) {
    throw new Error("App did not recover after restoring the Worker URL.");
  }

  const pointing = await runVoiceTurn(page, "where is the start button?", /start/i);
  await page.locator(".point-ring").waitFor({ timeout: 8000 });
  const pointPosition = await page.locator(".clicky-buddy").boundingBox();
  if (!pointPosition || pointPosition.x < 0 || pointPosition.y < 0) {
    throw new Error("Pointing turn did not move Clicky to a visible target.");
  }

  await page.screenshot({ path: "docs/live-app-acceptance.png", fullPage: true });
  console.log("Live app acceptance passed.");
  console.log(`Rapid fire: "${first.response.slice(0, 90)}" -> "${second.response.slice(0, 90)}"`);
  console.log(`Recovery: "${failed.response.slice(0, 90)}" -> "${recovered.response.slice(0, 90)}"`);
  console.log(`Pointing: "${pointing.response.slice(0, 90)}" at ${Math.round(pointPosition.x)},${Math.round(pointPosition.y)}`);
} finally {
  await browser.close();
}

async function assertWorkerLive() {
  const response = await fetch(`${workerUrl}/health`, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Worker health failed with HTTP ${response.status}`);
  const health = await response.json();
  if (health.mode !== "live") throw new Error(`Worker must be live for acceptance. Current mode: ${health.mode}`);
}

async function configureLiveSettings(page, worker) {
  await page.evaluate(
    ({ key, workerUrl }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          workerUrl,
          model: "gemini-3-flash",
          provider: "opencode",
          accentColor: "#3b82f6",
          avatar: "classic",
          voiceEnabled: false,
          computerUseEnabled: false,
          shortcut: "Ctrl+Alt+Space",
          showClicky: true,
          debugMode: false,
          mockMode: false
        })
      );
    },
    { key: settingsKey, workerUrl: worker }
  );
}

async function setWorkerUrl(page, worker) {
  await page.evaluate(
    ({ key, workerUrl }) => {
      const current = JSON.parse(window.localStorage.getItem(key) || "{}");
      window.localStorage.setItem(key, JSON.stringify({ ...current, workerUrl, mockMode: false, voiceEnabled: false }));
    },
    { key: settingsKey, workerUrl: worker }
  );
  await page.reload({ waitUntil: "load" });
  await page.getByText("Phase 2 native shell").waitFor({ timeout: 5000 });
}

async function runVoiceTurn(page, transcript, expected, options = {}) {
  await page.evaluate((value) => {
    window.__CLICKY_ACCEPTANCE_TRANSCRIPT__ = value;
    window.__clickyTranscriptQueue = [value];
  }, transcript);

  const button = page.getByRole("button", { name: /start listening|stop and send voice request/i });
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error("Talk button was not visible.");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  try {
    await page.getByText("Listening", { exact: true }).waitFor({ timeout: 5000 });
  } catch (error) {
    const status = await page.locator('[aria-label="Clicky status"]').innerText().catch(() => "");
    await page.screenshot({ path: "docs/live-app-acceptance-listening-failure.png", fullPage: true }).catch(() => {});
    throw new Error(`Talk did not enter listening for transcript "${transcript}". Status was:\n${status}\n${error instanceof Error ? error.message : error}`);
  }
  await page.waitForTimeout(180);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  try {
    await page.locator('[aria-label="Clicky status"]').getByText(expected).first().waitFor({ timeout: options.expectError ? 10000 : 30000 });
  } catch (error) {
    const status = await page.locator('[aria-label="Clicky status"]').innerText().catch(() => "");
    await page.screenshot({ path: "docs/live-app-acceptance-failure.png", fullPage: true }).catch(() => {});
    throw new Error(`Expected ${expected} for transcript "${transcript}", but status was:\n${status}\n${error instanceof Error ? error.message : error}`);
  }
  const statusText = await page.locator(".status-pill").innerText();
  const response = await responseText(page);
  return { statusText, response };
}

async function responseText(page) {
  return page.evaluate(() => {
    const blocks = Array.from(document.querySelectorAll(".status-block"));
    const response = blocks.find((block) => block.textContent?.trim().toLowerCase().startsWith("response"));
    return response?.querySelector("p")?.textContent?.trim() || "";
  });
}

async function installVoiceAndScreenFakes(page) {
  await page.addInitScript(() => {
    window.__clickyTranscriptQueue = [];

    class FakeRecognition extends EventTarget {
      continuous = true;
      interimResults = true;
      lang = "en-US";
      onresult = null;
      onerror = null;
      start() {
        window.setTimeout(() => {
          const transcript = window.__clickyTranscriptQueue.shift() || "";
          this.onresult?.({
            results: [[{ transcript }]]
          });
        }, 30);
      }
      stop() {}
    }

    class FakeMediaRecorder extends EventTarget {
      constructor() {
        super();
      }
      static isTypeSupported() {
        return true;
      }
      mimeType = "audio/webm";
      state = "inactive";
      ondataavailable = null;
      onstop = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        window.setTimeout(() => {
          this.ondataavailable?.({ data: new Blob([], { type: "audio/webm" }) });
          this.onstop?.();
        }, 20);
      }
    }

    const fakeAudioTrack = { stop() {} };
    const fakeAudioStream = new MediaStream();
    fakeAudioStream.getTracks = () => [fakeAudioTrack];

    const fakeMediaDevices = {
      ...(navigator.mediaDevices || {}),
      getUserMedia: async () => fakeAudioStream,
      getDisplayMedia: async () => {
        const canvas = document.createElement("canvas");
        canvas.width = 1280;
        canvas.height = 720;
        const context = canvas.getContext("2d");
        context.fillStyle = "#f8fafc";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#111827";
        context.font = "30px Arial";
        context.fillText("Clicky acceptance screen", 72, 92);
        context.fillStyle = "#1f2937";
        context.fillRect(0, 660, canvas.width, 60);
        context.fillStyle = "#2563eb";
        context.fillRect(28, 674, 32, 32);
        context.fillStyle = "#ffffff";
        context.font = "18px Arial";
        context.fillText("Start", 74, 696);
        const stream = canvas.captureStream(1);
        return stream;
      }
    };
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: fakeMediaDevices });

    Object.defineProperty(window, "SpeechRecognition", { configurable: true, value: FakeRecognition });
    Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: FakeRecognition });
    Object.defineProperty(window, "MediaRecorder", { configurable: true, value: FakeMediaRecorder });
  });
}
