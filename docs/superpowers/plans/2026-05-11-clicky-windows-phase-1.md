# Clicky Windows Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first Windows Clicky shell with a mock push-to-talk flow, Tauri scaffold, Worker scaffold, and SHIPv3 evidence docs.

**Architecture:** Use npm workspaces with a React/Vite/TypeScript desktop app under `apps/clicky-windows`, a Tauri v2 Rust shell under `apps/clicky-windows/src-tauri`, and a Cloudflare Worker proxy under `worker`. Phase 1 runs and tests without provider keys.

**Tech Stack:** npm, React, Vite, TypeScript, Vitest, lucide-react, Tauri v2 scaffold, Cloudflare Worker TypeScript.

---

### Task 1: Planning And Security Docs

**Files:**
- Create: `AGENTS.md`
- Create: `docs/ASSUMPTIONS.md`
- Create: `docs/CLICKY_WINDOWS_PLAN.md`
- Create: `docs/SECURITY.md`
- Create: `docs/TESTING.md`

- [x] Document the empty starting workspace and SHIPv3 mapping.
- [x] Record that Rust/Cargo are missing and native Tauri verification is blocked.
- [x] Document privacy and Worker-only secret handling.

### Task 2: Test-First App Behavior

**Files:**
- Create: `apps/clicky-windows/src/services/pointTags.test.ts`
- Create: `apps/clicky-windows/src/services/clickySession.test.ts`
- Create: `apps/clicky-windows/src/services/pointTags.ts`
- Create: `apps/clicky-windows/src/services/clickySession.ts`

- [x] Write failing tests for point-tag parsing.
- [x] Write failing tests for state-machine transitions.
- [ ] Implement parser and state machine.
- [ ] Run tests and keep them green.

### Task 3: Phase 1 UI

**Files:**
- Create: `apps/clicky-windows/src/App.tsx`
- Create: `apps/clicky-windows/src/components/SettingsPanel.tsx`
- Create: `apps/clicky-windows/src/components/OverlayPreview.tsx`
- Create: `apps/clicky-windows/src/components/StatusRail.tsx`
- Create: `apps/clicky-windows/src/main.tsx`
- Create: `apps/clicky-windows/src/styles.css`

- [ ] Render settings/control panel.
- [ ] Render blue Clicky buddy overlay preview.
- [ ] Wire manual push-to-talk and keyboard mock flow.
- [ ] Hide raw point tags from visible response text.
- [ ] Animate pointer target during pointing state.

### Task 4: Tauri And Worker Scaffolds

**Files:**
- Create: `apps/clicky-windows/src-tauri/Cargo.toml`
- Create: `apps/clicky-windows/src-tauri/tauri.conf.json`
- Create: `apps/clicky-windows/src-tauri/src/main.rs`
- Create: `worker/src/index.ts`
- Create: `worker/test/worker.test.ts`
- Create: `worker/wrangler.toml.example`
- Create: `worker/.dev.vars.example`

- [ ] Add tray menu scaffold.
- [ ] Add overlay window scaffold.
- [ ] Add Worker `/chat`, `/tts`, and `/transcribe-token` routes.
- [ ] Add Worker mock behavior and sanitized errors.

### Task 5: Verification And SHIP Report

**Files:**
- Create: `docs/ship-report.md`
- Update: `docs/TESTING.md`

- [ ] Run install.
- [ ] Run tests.
- [ ] Run typecheck.
- [ ] Run build.
- [ ] Run browser smoke for mock flow.
- [ ] Record exact pass/fail evidence and next steps.
