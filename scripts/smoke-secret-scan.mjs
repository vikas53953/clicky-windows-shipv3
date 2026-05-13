import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const includeExtensions = new Set([".env", ".example", ".json", ".md", ".mjs", ".ps1", ".rs", ".toml", ".ts", ".tsx"]);
const ignoredDirs = new Set([".git", ".venv", ".venv-voxcpm", "__pycache__", "dist", "node_modules", "target"]);
const ignoredFiles = new Set(["package-lock.json", "worker/.dev.vars"]);
const patterns = [
  { name: "OpenAI-style secret key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "Long bare hex secret", regex: /\b[a-f0-9]{64}\b/i }
];

const findings = [];

await scanDir(repoRoot);

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.pattern} matched in ${finding.file}`);
  }
  console.error(`Secret scan failed with ${findings.length} finding(s).`);
  process.exit(1);
}

console.log("Secret scan passed. No API-key shaped values found in source/docs/scripts.");

async function scanDir(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);
    const relative = path.relative(repoRoot, absolute).replaceAll(path.sep, "/");

    if (entry.isDirectory()) {
      if (ignoredDirs.has(entry.name)) continue;
      await scanDir(absolute);
      continue;
    }

    if (!entry.isFile()) continue;
    if (ignoredFiles.has(relative)) continue;
    if (!shouldScanFile(entry.name)) continue;

    const text = await readFile(absolute, "utf8").catch(() => "");
    for (const pattern of patterns) {
      if (pattern.regex.test(text)) {
        findings.push({ file: relative, pattern: pattern.name });
      }
    }
  }
}

function shouldScanFile(fileName) {
  if (fileName === ".env.example") return true;
  const ext = path.extname(fileName);
  return includeExtensions.has(ext);
}
