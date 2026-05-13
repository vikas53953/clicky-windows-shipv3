# TipTour Reference Notes

Reference repo inspected:

```txt
https://github.com/milind-soni/tiptour-macos
```

## Shortcut Surfaces

TipTour currently exposes two main global key interactions:

1. `Ctrl+Option`: voice mode.
2. `Ctrl+Shift`: freeform focus highlight brush.

The repo also supports AI-generated keyboard-shortcut action steps such as `Cmd+S`, `Return`, or `Cmd+Shift+N`, but those are action-plan step labels, not app-level global hotkeys.

## Architecture To Reuse For Clicky Windows

The useful idea is not the macOS code itself. The useful idea is the product architecture:

1. The model emits a structured action plan, not only chat text.
2. The app resolves semantic labels like `File`, `Save`, or `Export` to screen locations.
3. Teaching mode points and waits for the user.
4. Autopilot mode is separate and gated.
5. Freeform highlight lets the user say "this area" with spatial context.
6. Click detection can auto-advance a checklist after the user clicks the expected target.

## What Maps Cleanly To Windows

| TipTour idea | Windows Clicky adaptation |
| --- | --- |
| `Ctrl+Option` voice mode | Keep `Ctrl+Alt+Space` now; consider modifier-only `Ctrl+Alt` after reliable native key-state testing. |
| `Ctrl+Shift` highlight brush | Add a Windows focus-highlight overlay mode later, using mouse path + bounding box. |
| `submit_workflow_plan(...)` | Added hidden `<CLICKY_PLAN>{...}</CLICKY_PLAN>` parsing in Clicky. |
| Accessibility tree resolver | Use Windows UI Automation as the first resolver tier. |
| Browser DOM/CDP resolver | Use Chrome/Edge DevTools Protocol for browser pages when available. |
| Raw model coordinates fallback | Keep existing `[POINT:x,y:label:screenN]` as last resort. |
| ClickDetector auto-advance | Add a listen-only Windows mouse hook later; do not block clicks. |
| Autopilot action execution | Future feature only, behind explicit approval. |

## Implemented From This Reference

Clicky now supports a hidden workflow-plan block:

```txt
<CLICKY_PLAN>{"goal":"short goal","app":"current app","mode":"teaching","steps":[{"type":"click","label":"File","hint":"Open the File menu","targetContext":"visibleElement"}]}</CLICKY_PLAN>
```

The desktop app strips the raw JSON from the visible answer and renders a checklist in the status rail.

## Next Windows Build Step

The next high-value Windows port is an `ElementResolver` equivalent:

1. Windows UI Automation resolver for native controls.
2. Browser DOM/CDP resolver for Chrome and Edge.
3. Existing `[POINT:...]` fallback.

This should stay teaching-only until permission, targeting, and safety gates are solid.
