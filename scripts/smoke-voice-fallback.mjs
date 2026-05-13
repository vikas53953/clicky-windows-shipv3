import { chromium } from "playwright";

const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";
const workerUrl = (process.env.CLICKY_WORKER_URL ?? "http://127.0.0.1:8789").replace(/\/$/, "");
const screenshotPath = "docs/live-voice-fallback-smoke.png";
const settingsKey = "clicky-settings-v1";

async function main() {
  const health = await getWorkerHealth();
  if (health.mode !== "live") {
    throw new Error(`Worker is in ${health.mode} mode. Start a live Worker before running this smoke.`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"]
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 920 } });

  try {
    await page.goto(appUrl, { waitUntil: "load" });
    await page.evaluate(
      ({ key, worker }) => {
        const current = JSON.parse(window.localStorage.getItem(key) || "{}");
        window.localStorage.setItem(
          key,
          JSON.stringify({
            ...current,
            workerUrl: worker,
            provider: "opencode",
            model: "minimax-m2.7",
            voiceEnabled: true,
            mockMode: false
          })
        );
      },
      { key: settingsKey, worker: workerUrl }
    );
    await page.reload({ waitUntil: "load" });
    await page.getByText("Phase 2 native shell").waitFor({ timeout: 5000 });

    await page.getByRole("button", { name: "Test Worker" }).click();
    await page.getByText("live: Clicky Worker reachable.", { exact: true }).waitFor({ timeout: 10000 });

    await page.getByRole("button", { name: "Test Voice" }).click();
    await page
      .getByText(/Voice test passed|fallback worked|no local voice engine responded/i)
      .waitFor({ timeout: 20000 });

    const statusText = await page.locator('[aria-label="Clicky status"]').innerText();
    if (!/Voice test passed|fallback worked|no local voice engine responded/i.test(statusText)) {
      throw new Error(`Voice status did not show a handled primary/fallback voice path: ${statusText}`);
    }

    if (/npm run smoke:live-providers/i.test(statusText)) {
      throw new Error("Voice fallback status leaked the long provider remediation text into the UI.");
    }

    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`Live voice fallback smoke passed. Worker mode: ${health.mode}. Screenshot: ${screenshotPath}`);
  } finally {
    await browser.close();
  }
}

async function getWorkerHealth() {
  const response = await fetch(`${workerUrl}/health`, {
    headers: {
      Accept: "application/json",
      Origin: "http://127.0.0.1:5174"
    }
  });

  if (!response.ok) {
    throw new Error(`Worker health failed with HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
