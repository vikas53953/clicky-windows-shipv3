interface ShortcutKeyboardEvent {
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  key: string;
  code?: string;
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift", "AltGraph"]);

export function shortcutFromKeyboardEvent(event: ShortcutKeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;

  const key = normalizeShortcutKey(event.key, event.code);
  if (!key) return null;

  const parts: string[] = [];
  if (event.ctrlKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  if (event.metaKey) parts.push("Win");
  parts.push(key);

  return parts.join("+");
}

function normalizeShortcutKey(key: string, code?: string): string {
  if (key === " ") return "Space";
  if (code === "Space") return "Space";
  if (/^[a-z]$/i.test(key)) return key.toUpperCase();
  if (/^[0-9]$/.test(key)) return key;
  if (key.startsWith("Arrow")) return key.replace("Arrow", "");
  return key.length === 1 ? key.toUpperCase() : key;
}
