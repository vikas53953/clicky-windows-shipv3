import type { WorkerEnv } from "../types";
import { trimTrailingSlash } from "../utils/http";
import { truncate } from "../utils/text";

interface ComputerUseResult {
  speech: string;
  summary: string;
}

export function isConfirmedComputerTask(task: string, confirmedTask?: string): boolean {
  return Boolean(task.trim()) && normalizeTask(task) === normalizeTask(confirmedTask || "");
}

export async function executeComputerUseTask(task: string, env: WorkerEnv): Promise<ComputerUseResult> {
  const serverUrl = computerServerUrl(env);
  await assertCuaServerReachable(serverUrl);

  const directUrl = extractOpenUrlTask(task);
  if (directUrl) {
    const payload = await postCuaCommand(serverUrl, "open", { target: directUrl });
    return {
      speech: directUrl.includes("google.com") ? "done, google.com is open. [POINT:none]" : `done, i opened ${directUrl}. [POINT:none]`,
      summary: truncate(JSON.stringify(payload), 700)
    };
  }

  const model = env.CUA_AGENT_MODEL?.trim();
  if (!model) {
    throw new Error("Cua computer_use needs CUA_AGENT_MODEL for autonomous multi-step tasks. The local server is reachable, but no agent model is configured.");
  }

  const response = await fetch(`${serverUrl}/responses`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      input: task,
      agent_kwargs: cuaAgentKwargs(env),
      env: {}
    }),
    signal: AbortSignal.timeout(90_000)
  });

  if (!response.ok) {
    throw new Error(`Cua computer_use failed with HTTP ${response.status}: ${truncate(await response.text(), 500)}`);
  }

  const payload = (await response.json()) as { status?: string; error?: string; output?: unknown };
  if (payload.error || payload.status === "failed") {
    throw new Error(`Cua computer_use failed: ${truncate(payload.error || JSON.stringify(payload.output || payload), 500)}`);
  }

  return {
    speech: "done, the computer task is complete. [POINT:none]",
    summary: truncate(JSON.stringify(payload.output || payload), 900)
  };
}

function cuaAgentKwargs(env: WorkerEnv): Record<string, string> {
  const kwargs: Record<string, string> = {};
  if (env.CUA_AGENT_API_KEY?.trim()) kwargs.api_key = env.CUA_AGENT_API_KEY.trim();
  if (env.CUA_AGENT_API_BASE?.trim()) kwargs.api_base = env.CUA_AGENT_API_BASE.trim();
  return kwargs;
}

function computerServerUrl(env: WorkerEnv): string {
  return trimTrailingSlash(env.CUA_COMPUTER_SERVER_URL?.trim() || "http://127.0.0.1:8000");
}

async function assertCuaServerReachable(serverUrl: string): Promise<void> {
  const response = await fetch(`${serverUrl}/status`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`Cua server health failed with HTTP ${response.status}.`);
}

async function postCuaCommand(serverUrl: string, command: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(`${serverUrl}/cmd`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json"
    },
    body: JSON.stringify({ command, params }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`Cua command ${command} failed with HTTP ${response.status}: ${truncate(await response.text(), 500)}`);
  return parseCuaResponse(await response.text());
}

function parseCuaResponse(text: string): unknown {
  const trimmed = text.trim();
  const payload = trimmed
    .split(/\r?\n/)
    .find((line) => line.trim().startsWith("data:"))
    ?.replace(/^data:\s*/i, "")
    .trim() || trimmed;

  if (!payload) return { success: true };
  try {
    return JSON.parse(payload);
  } catch {
    return { success: true, text: truncate(payload, 700) };
  }
}

function extractOpenUrlTask(task: string): string | null {
  const normalized = task.toLowerCase();
  const explicit = task.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
  if (explicit) return explicit;
  if (/\b(open|launch|go to|navigate)\b/.test(normalized) && /\bgoogle(?:\.com)?\b/.test(normalized)) {
    return "https://www.google.com";
  }
  return null;
}

function normalizeTask(task: string): string {
  return task.toLowerCase().replace(/\s+/g, " ").trim();
}
