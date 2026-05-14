import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";
const smokeUrl = appUrl.includes("?") ? `${appUrl}&mock=true` : `${appUrl}?mock=true`;
const screenshotPath = "docs/shortcut-smoke.png";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });

try {
  await page.goto(smokeUrl, { waitUntil: "load" });
  await page.getByText("Phase 2 native shell").waitFor({ timeout: 5000 });

  await holdClickyShortcut(page);
  await page.getByText("Listening", { exact: true }).waitFor({ timeout: 5000 });

  await releaseClickyShortcut(page);
  await page.getByText(/try asking about something visible on your screen/i).first().waitFor({ timeout: 9000 });
  await page.getByText("Ready to listen", { exact: true }).waitFor({ timeout: 9000 });

  const rawPointTagVisible = await page.getByText("[POINT:", { exact: false }).count();
  if (rawPointTagVisible > 0) {
    throw new Error("Raw point tags are visible after shortcut-driven mock response.");
  }

  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`Shortcut smoke passed. Ctrl+Alt+Space started and sent the mock flow. Screenshot: ${screenshotPath}`);
} finally {
  await browser.close();
}

async function holdClickyShortcut(page) {
  await page.keyboard.down("Control");
  await page.keyboard.down("Alt");
  await page.keyboard.down("Space");
}

async function releaseClickyShortcut(page) {
  await page.keyboard.up("Space");
  await page.keyboard.up("Alt");
  await page.keyboard.up("Control");
}
