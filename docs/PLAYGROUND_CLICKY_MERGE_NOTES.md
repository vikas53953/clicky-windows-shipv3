# Playground Clicky Merge Notes

Date: 2026-05-14

## Source Reviewed

- Old thread: `019d6e44-1c04-7ae2-8b71-448950b34a71`.
- Old workspace: `C:\Users\vikasmit\OneDrive\Documents\Playground\clicky-windows`.
- The old source folder is currently empty locally, but the Codex rollout and memory preserve the important architecture and snippets.

## Useful Ideas From The Old Clicky

| Old Clicky Idea | Current Tauri Mapping |
| --- | --- |
| Floating buddy near cursor instead of a normal app-first experience | Keep the native click-through overlay as the real product surface. Main window remains settings/debug only. |
| Talk Anywhere fallback shortcut | Native shortcut now tries `ctrl+alt+space`, then falls back to `ctrl+shift+space` if Windows rejects the primary shortcut. |
| Small avatar choices like orb/comet | Added `Orb` and `Comet` avatar styles next to Classic/Dot/Spark. |
| General tool loop | Added safe hidden `<CLICKY_TOOL>` parsing and an opt-in Tools toggle. First safe tool is `open_url`; pointing remains visual via `[POINT:x,y:label:screenN]`. |
| Do not hard-code one or two tasks | Worker prompt now explains the safe local tool contract instead of a static “only weather” behavior. |

## Safety Boundary

The old Electron prototype experimented with click/type tools. This Tauri build does not auto-click or type yet. That is intentional. The current safe merge only allows public URL opening and visual pointing, behind an explicit Tools toggle.

The next step for true computer use should add a permission review layer:

1. Model proposes a tool action.
2. Clicky shows the action beside the cursor.
3. User confirms.
4. Native command executes.
5. Clicky reports exactly what happened.

## Current Product Direction

Clicky should feel like the small cursor companion first. The large settings window should be treated as the control/debug panel, not the main product.
