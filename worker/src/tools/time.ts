import type { InternetToolResult, WorkerEnv } from "../types";

export function hasTimeIntent(text: string): boolean {
  return /\b(time|date|today|now|current time|what day)\b/i.test(text);
}

export function timezoneHint(timezone: string | undefined, env: WorkerEnv): string {
  return timezone?.trim() || env.DEFAULT_TIMEZONE?.trim() || "Asia/Kolkata";
}

export function resolveTimeTool(timezone: string): InternetToolResult {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "medium"
  }).format(new Date());

  return {
    type: "time",
    status: "ok",
    label: timezone,
    summary: `Current date and time in ${timezone} is ${formatted}.`,
    source: "Worker clock"
  };
}
