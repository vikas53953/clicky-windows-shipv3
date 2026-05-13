const workerUrl = (process.env.CLICKY_WORKER_URL || "http://127.0.0.1:8789").replace(/\/$/, "");

const response = await fetch(`${workerUrl}/tools/resolve`, {
  method: "POST",
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json",
    Origin: "http://127.0.0.1:5174"
  },
  body: JSON.stringify({ transcript: "Can you tell me the weather in Delhi?" })
});

if (!response.ok) {
  throw new Error(`Internet tools smoke failed with HTTP ${response.status}: ${await response.text()}`);
}

const payload = await response.json();
const weather = payload.tools?.find((tool) => tool.type === "weather");
if (!weather || weather.status !== "ok" || !weather.summary?.includes("Delhi")) {
  throw new Error(`Internet tools smoke returned unexpected payload: ${JSON.stringify(payload)}`);
}

console.log(`Internet tools smoke passed: ${weather.summary}`);
