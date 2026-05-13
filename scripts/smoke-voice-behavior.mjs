import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";
const smokeUrl = appUrl.includes("?") ? `${appUrl}&mock=true` : `${appUrl}?mock=true`;
const screenshotPath = "docs/voice-behavior-smoke.png";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });

try {
  await page.goto(smokeUrl, { waitUntil: "load" });
  await page.getByText("Phase 2 native shell").waitFor({ timeout: 5000 });

  const idleWaveforms = await page.locator(".voice-waveform").count();
  if (idleWaveforms !== 0) {
    throw new Error(`Idle should not render voice waveform. Found ${idleWaveforms}.`);
  }

  const talkButton = page.locator(".record-button");
  await talkButton.hover();
  await page.mouse.down();
  await page.getByText("Listening", { exact: true }).waitFor({ timeout: 5000 });

  const silentListeningWaveforms = await page.locator(".voice-waveform").count();
  if (silentListeningWaveforms !== 0) {
    throw new Error(`Silent listening should not render voice waveform. Found ${silentListeningWaveforms}.`);
  }

  await page.mouse.up();
  await page.getByText("Ready to listen", { exact: true }).waitFor({ timeout: 9000 });

  const readyWaveforms = await page.locator(".voice-waveform").count();
  if (readyWaveforms !== 0) {
    throw new Error(`Ready state should not render voice waveform. Found ${readyWaveforms}.`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Voice behavior smoke passed. Waveforms idle/listening/ready: 0/0/0. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
