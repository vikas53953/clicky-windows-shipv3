# Clicky Windows Assumptions

## Workspace

- The starting folder contained only `SHIP-AUTOPILOT-v3 (1).md` and `SHIP-SDLC-GATE-CHECKLIST.md`.
- There was no existing app scaffold, no lockfile, and no git repository in this folder.
- SHIPv3 therefore acts as the delivery framework, not as an installed library or generator.

## Toolchain

- Node.js and npm are installed.
- Rust and Cargo are installed through Rustup and native Tauri build now succeeds.
- Phase 1 is scaffolded as a Tauri v2 app, while the React/Vite mock UI remains separately buildable and testable.
- Port 5173 is currently occupied by an unrelated local `ship-console` Vite process, so Clicky uses 5174 for this workspace.
- Port 8787 is currently occupied by the same unrelated local `ship-console` backend, and 8788 is occupied by another local app, so Clicky Worker dev uses 8789.
- Wrangler rejected `compatibility_date = "2026-05-11"` as future/unsupported, so Worker config is pinned to `2026-05-10`.

## Architecture Choices

- Use npm workspaces because SHIPv3 defaults to npm and no other lockfile was present.
- Use `apps/clicky-windows` for the desktop app and `worker` for the Cloudflare Worker proxy.
- Use Cloudflare Worker secrets for provider keys. The desktop app only stores a Worker URL and user preferences.
- Mock mode is first-class for Phase 1 so UI flow can be tested before secrets exist.
