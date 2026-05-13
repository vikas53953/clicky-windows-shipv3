import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174/?mock=true";
const screenshotPath = "docs/phase2-browser-smoke.png";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
});
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });

try {
  await page.goto(appUrl, { waitUntil: "networkidle" });
  await page.getByText("Phase 2 native shell").waitFor({ timeout: 5000 });
  await page.getByText(/Browser preview/i).first().waitFor({ timeout: 5000 });

  await page.getByRole("button", { name: /test worker/i }).click();
  await page.getByText(/mock: mock mode is active/i).waitFor({ timeout: 5000 });

  await page.getByRole("button", { name: /test mic/i }).click();
  await page.getByText(/OK: Microphone permission granted/i).first().waitFor({ timeout: 5000 });

  const talkButton = page.locator(".record-button");
  await talkButton.hover();
  await page.mouse.down();
  await page.getByText("Listening", { exact: true }).waitFor({ timeout: 3000 });
  await page.mouse.up();

  await page.getByText(/If that is green, the mock shell is ready/i).first().waitFor({ timeout: 8000 });
  await page.getByText("Pointing", { exact: true }).waitFor({ timeout: 8000 });

  const rawPointTagVisible = await page.getByText("[POINT:", { exact: false }).count();
  if (rawPointTagVisible > 0) {
    throw new Error("Raw point tags are visible in the Phase 2 UI.");
  }

  const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (horizontalOverflow > 0) {
    throw new Error(`Desktop layout has horizontal overflow: ${horizontalOverflow}`);
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Phase 2 browser smoke passed. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
