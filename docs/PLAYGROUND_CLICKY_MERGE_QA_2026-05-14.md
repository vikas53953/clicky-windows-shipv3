# Playground Clicky Merge QA - 2026-05-14

## What Was Merged

- Old Clicky's Talk Anywhere resilience: Tauri now tries `ctrl+alt+space` first and falls back to `ctrl+shift+space` if Windows rejects the primary shortcut.
- Old Clicky's smaller companion personality: added `Orb` and `Comet` avatar styles.
- Old Clicky's tool-loop idea: added hidden `<CLICKY_TOOL>` parsing and an opt-in Tools toggle. The first safe local tool is `open_url`; visual pointing remains through `[POINT:x,y:label:screenN]`.
- Added merge notes in `docs/PLAYGROUND_CLICKY_MERGE_NOTES.md`.

## What Was Not Merged Yet

- Automatic click/type/clipboard/system-control tools from the old Electron prototype.
- Reason: those need a confirmation layer before execution. The old prototype had useful ideas, but direct OS control without a review step is too risky for the current product.

## Verification

| Command | Result |
| --- | --- |
| `npm run test` | PASS: app 37 tests, Worker 22 tests |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `cargo test --manifest-path apps/clicky-windows/src-tauri/Cargo.toml` | PASS |
| `npm run smoke:style-controls` | PASS |
| `npm run smoke:phase2:native` | PASS |
| `npm run smoke:secrets` | PASS |
| `npm run smoke:product-flow` | PASS: `health=live; weather=Delhi ok; search=ok; direct_weather=481ms first chunk; screen_text_model=2089ms first chunk` |
| `npm run tauri:build` | PASS |

## Runtime State

The rebuilt release app was relaunched from:

`apps/clicky-windows/src-tauri/target/release/clicky-windows.exe`
