import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";

const command = process.argv[2];

if (!["dev", "build"].includes(command)) {
  console.error("Usage: node scripts/run-tauri.mjs <dev|build>");
  process.exit(2);
}

const cargoBin = path.join(os.homedir(), ".cargo", "bin");
const env = {
  ...process.env,
  PATH: `${cargoBin}${path.delimiter}${process.env.PATH ?? ""}`
};

const executable = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "tauri";
const args = process.platform === "win32" ? ["/d", "/s", "/c", `tauri.cmd ${command}`] : [command];

const child = spawn(executable, args, {
  env,
  stdio: "inherit"
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`tauri ${command} exited by signal ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
