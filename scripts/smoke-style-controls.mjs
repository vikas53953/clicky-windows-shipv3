import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";
const smokeUrl = appUrl.includes("?") ? `${appUrl}&mock=true` : `${appUrl}?mock=true`;
const screenshotPath = "docs/style-controls-smoke.png";
const settingsKey = "clicky-settings-v1";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });

try {
  await page.goto(smokeUrl, { waitUntil: "load" });
  await page.getByText("Clicky style", { exact: true }).waitFor({ timeout: 5000 });

  await page.getByRole("button", { name: "Rose Clicky" }).click();
  await page.getByRole("button", { name: "Spark" }).click();

  const saved = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), settingsKey);
  if (saved.accentColor !== "#f43f5e") {
    throw new Error(`Expected Rose accent #f43f5e, got ${saved.accentColor || "<missing>"}.`);
  }
  if (saved.avatar !== "spark") {
    throw new Error(`Expected Spark avatar, got ${saved.avatar || "<missing>"}.`);
  }

  await page.reload({ waitUntil: "load" });
  await page.getByText("Clicky style", { exact: true }).waitFor({ timeout: 5000 });

  const reloaded = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) || "{}"), settingsKey);
  if (reloaded.accentColor !== "#f43f5e" || reloaded.avatar !== "spark") {
    throw new Error("Clicky style settings did not persist after reload.");
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Style controls smoke passed. Rose + Spark persisted. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}
