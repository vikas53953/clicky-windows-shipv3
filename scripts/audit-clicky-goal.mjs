import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargo = path.join(os.homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");
const appUrl = process.env.CLICKY_SMOKE_URL ?? "http://127.0.0.1:5174";

const checks = [
  { name: "Type/lint", command: "npm run lint" },
  { name: "Unit tests", command: "npm run test" },
  { name: "Web + Worker build", command: "npm run build" },
  { name: "Phase 1 shell smoke", command: "npm run smoke:phase1" },
  { name: "Phase 2 browser smoke", command: "npm run smoke:phase2" },
  { name: "Phase 2 native overlay smoke", command: "npm run smoke:phase2:native" },
  { name: "Source secret scan", command: "npm run smoke:secrets" },
  { name: "Shortcut smoke", command: "npm run smoke:shortcut" },
  { name: "Style controls smoke", command: "npm run smoke:style-controls" },
  { name: "Voice waveform behavior smoke", command: "npm run smoke:voice-behavior" },
  { name: "Live voice fallback smoke", command: "npm run smoke:voice-fallback" },
  {
    name: "ElevenLabs voice health",
    command: "npm run smoke:voice-health",
    allowBlocked: (output) =>
      output.includes("detected_unusual_activity") &&
      output.includes("ElevenLabs blocked this key/account")
  },
  {
    name: "Native screenshot Rust test",
    command: `${cargo} test`,
    cwd: path.join(repoRoot, "apps", "clicky-windows", "src-tauri")
  },
  {
    name: "Live providers",
    command: "npm run smoke:live-providers",
    allowBlocked: (output) =>
      output.includes("OpenCode/Kimi smoke passed") &&
      output.includes("ElevenLabs TTS failed with HTTP 401") &&
      output.includes("detected_unusual_activity")
  }
];

const results = [];

const devServer = await ensureSmokeServer();

try {
  for (const check of checks) {
    console.log(`\n=== ${check.name} ===`);
    const result = await runCommand(check.command, check.cwd ?? repoRoot);
    const output = `${result.stdout}\n${result.stderr}`;

    if (result.code === 0) {
      results.push({ ...check, status: "PASS" });
      console.log(`PASS: ${check.name}`);
      continue;
    }

    if (check.allowBlocked?.(output)) {
      results.push({ ...check, status: "BLOCKED_EXTERNAL" });
      console.log(`BLOCKED_EXTERNAL: ${check.name}`);
      continue;
    }

    results.push({ ...check, status: "FAIL", code: result.code });
    console.log(`FAIL: ${check.name} exited with ${result.code}`);
  }

  console.log("\n=== Clicky Goal Audit Summary ===");
  for (const result of results) {
    console.log(`${result.status.padEnd(16)} ${result.name}`);
  }

  const failures = results.filter((result) => result.status === "FAIL");
  const blocked = results.filter((result) => result.status === "BLOCKED_EXTERNAL");

  if (failures.length > 0) {
    console.error("\nAUDIT RESULT: FAIL. Fix failing checks before testing Clicky again.");
    process.exitCode = 1;
  } else if (blocked.length > 0) {
    console.error("\nAUDIT RESULT: NOT COMPLETE. Local/native checks pass, but ElevenLabs is externally blocked.");
    process.exitCode = 2;
  } else {
    console.log("\nAUDIT RESULT: COMPLETE.");
  }
} finally {
  if (devServer.started) {
    stopProcessTree(devServer.process.pid);
  }
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "sh";
    const args = process.platform === "win32" ? ["/d", "/s", "/c", command] : ["-lc", command];
    const child = spawn(executable, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

async function ensureSmokeServer() {
  if (await serverReachable(appUrl)) {
    console.log(`Smoke app already reachable at ${appUrl}.`);
    return { started: false, process: null };
  }

  console.log(`Starting smoke app server at ${appUrl}...`);
  const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "sh";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm run dev -w apps/clicky-windows"]
    : ["-lc", "npm run dev -w apps/clicky-windows"];
  const child = spawn(executable, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (chunk) => process.stdout.write(chunk));
  child.stderr.on("data", (chunk) => process.stderr.write(chunk));

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await serverReachable(appUrl)) {
      console.log(`Smoke app server is reachable at ${appUrl}.`);
      return { started: true, process: child };
    }
    if (child.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  stopProcessTree(child.pid);
  throw new Error(`Smoke app server did not become reachable at ${appUrl}.`);
}

async function serverReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

function stopProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try {
        process.kill(pid, "SIGTERM");
      } catch {}
    }
  }
}
