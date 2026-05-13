import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cargo = path.join(os.homedir(), ".cargo", "bin", process.platform === "win32" ? "cargo.exe" : "cargo");

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
