import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";
const smokeUrl = appUrl.includes("?") ? `${appUrl}&mock=true` : `${appUrl}?mock=true`;
const screenshotPath = "docs/phase1-smoke.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 920 } });

try {
  await page.goto(smokeUrl, { waitUntil: "networkidle" });
  await page.getByText("Clicky style", { exact: true }).waitFor({ timeout: 5000 });
  await page.getByRole("button", { name: /test worker/i }).click();
  await page.getByText(/mock: mock mode is active/i).waitFor({ timeout: 5000 });

  const talkButton = page.locator(".record-button");
  await talkButton.hover();
  await page.mouse.down();
  await page.getByText("Listening", { exact: true }).waitFor({ timeout: 3000 });
  await page.mouse.up();

  await page.getByText(/If that is green, the mock shell is ready/i).first().waitFor({ timeout: 8000 });
  await page.getByText("Ready to listen", { exact: true }).waitFor({ timeout: 8000 });

  const rawPointTagVisible = await page.getByText("[POINT:", { exact: false }).count();
  if (rawPointTagVisible > 0) {
    throw new Error("Raw point tags are visible in the UI.");
  }

  const rawPlanVisible = await page.getByText("<CLICKY_PLAN>", { exact: false }).count();
  if (rawPlanVisible > 0) {
    throw new Error("Raw workflow plan JSON is visible in the UI.");
  }

  await page.getByText("Plan", { exact: true }).waitFor({ timeout: 5000 });
  await page.getByText("Check the Clicky shell", { exact: true }).waitFor({ timeout: 5000 });
  await page.getByText("Confirm the Worker is reachable", { exact: true }).waitFor({ timeout: 5000 });

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Phase 1 smoke passed. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
