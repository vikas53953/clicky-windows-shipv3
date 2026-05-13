const workerUrl = (process.env.CLICKY_WORKER_URL ?? "http://127.0.0.1:8789").replace(/\/$/, "");

const response = await fetch(`${workerUrl}/voice-health?deep=true`, {
  headers: {
    Accept: "application/json",
    Origin: "http://127.0.0.1:5174"
  }
});

if (!response.ok) {
  console.error(`Voice health failed with HTTP ${response.status}: ${await response.text()}`);
  process.exit(1);
}

const health = await response.json();
console.log(JSON.stringify(health, null, 2));

if (health.ok) {
  console.log("Voice health smoke passed.");
} else if (health.status === "detected_unusual_activity") {
  console.error("Voice health smoke blocked externally: ElevenLabs blocked this key/account.");
  process.exit(2);
} else {
  console.error(`Voice health smoke failed: ${health.message || health.status || "unknown error"}`);
  process.exit(1);
}
