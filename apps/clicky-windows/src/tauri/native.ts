export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function showMainWindow(): Promise<void> {
  if (!isTauriRuntime()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  const current = getCurrentWindow();
  await current.show();
  await current.setFocus();
}
