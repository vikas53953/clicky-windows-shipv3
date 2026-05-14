# Hey Clicky — Complete Product Reference for Windows Build

**Compiled by:** Claude for Vikas (pylabmit)
**Date:** May 14, 2026
**Sources:** Isaac Flath teardown, Farza's X posts, YC listing, heyclicky.com, open-source repo, XDA/Yahoo coverage, Farza LinkedIn, Farza's May 13 livestream

---

## WHAT CLICKY ACTUALLY IS

Clicky is NOT a chat app. Clicky is NOT a dashboard. Clicky is NOT a settings panel with an overlay.

Clicky is a **glowing blue triangle that flies across your screen**, lives next to your cursor, sees everything you see, listens when you speak, talks back, and physically points at buttons/UI elements it's referring to. It's the closest thing to having a human teacher sitting next to you watching your screen.

The current commercial version (private, v1.0.12+) has evolved beyond the open-source V1 into a full agent platform. Here's the evolution:

### V1 (Open Source — github.com/farzaa/clicky)

- Blue triangle cursor companion
- Push-to-talk (Ctrl+Option hotkey, does NOT intercept the key)
- Screenshot per monitor on release
- Claude vision for understanding the screen
- ElevenLabs TTS for spoken responses
- AssemblyAI streaming transcription
- [POINT:x,y:label] tags for pointing at UI elements
- Cloudflare Worker proxy (3 routes: /chat, /tts, /transcribe-token)
- Last 10 conversation turns for context
- Menu bar app, no main window visible

### V1.0.12+ (Private, Commercial — heyclicky.com)

Everything from V1, PLUS:

- **"Clicky Agent" voice command** — say "clicky agent" and it spawns a background agent
- **Background agents** can: build Mac apps, research IG micro-influencers, summarize PDFs, email summaries to your team
- **Computer use** — Clicky can now actually click things on screen (powered by Cua, YC X25)
- **Native Apple integrations** — interacts with Notes, Calendar, Reminders directly
- **Gmail, Calendar, Drive** via voice — "run your Gmail, Calendar, Drive with just voice"
- **Idea/link/inspo saving** — new way to save ideas, links, inspiration
- **$9/month Pro tier** — 150 agent messages/month, unlimited voice
- **YC S26 backed** — $10.1M raised

---

## THE THREE LAYERS (How The Overlay Actually Works)

Based on Isaac Flath's code teardown:

```
Layer 3 (top):    Transparent overlay window (click-through, always-on-top)
                  → Blue triangle drawn here, speech bubble drawn here
                  
Layer 2 (middle): User's actual cursor (works normally, no interception)

Layer 1 (bottom): Whatever app the user is using (Figma, DaVinci, browser, etc.)
```

Key insight: **Clicky creates one transparent FULL-SCREEN overlay window per monitor.** Not a small 260×92 widget. A full-screen transparent window that lets clicks pass through. Inside that window, it draws a small blue triangle wherever it wants the buddy to be.

This is the critical architectural difference from our current build. Our build has a small Tauri window (74×54 idle, 380×210 bubble) that floats near the cursor. Farza's Clicky has a FULL-SCREEN transparent window where the triangle can fly anywhere — including flying from the cursor position to a button 800 pixels away in a smooth arc animation.

### The Flight Animation

When pointing at a UI element, the triangle doesn't teleport. It:

1. Picks a midpoint between current position and target
2. Lifts the midpoint so the path arcs upward (quadratic bezier curve)
3. Glides along the curve
4. Rotates to face direction of travel each frame
5. Scales up at mid-flight so it "swoops"

This animation is what makes Clicky feel alive vs mechanical.

---

## THE VOICE PIPELINE (Exact Flow)

```
User holds Ctrl+Option
  → AssemblyAI websocket starts streaming transcription in real-time
  → User speaks
  → User releases Ctrl+Option
  
Release triggers:
  → Screenshot captured per monitor (max 1280px, 80% JPEG quality)
  → Screenshots labeled: "screen 1 of 2 — cursor is on this screen (primary focus) (image dimensions: 1280x831 pixels)"
  → Clicky's own windows are filtered OUT of screenshots
  → Transcript + screenshots + last 10 turns sent to Claude via Worker /chat
  
Claude responds:
  → Text streamed back
  → [POINT:x,y:label] tag parsed with regex, stripped from visible text
  → Visible text sent to ElevenLabs TTS
  → Triangle flies to the POINT coordinates
  → Audio plays simultaneously with triangle animation
```

### Critical Details for Windows Build:

1. **AssemblyAI uses streaming websocket, not batch upload.** Real-time transcription while the user is still speaking. Our build uses ElevenLabs batch STT after recording stops — that's an extra latency hit.

2. **Screenshots filter out Clicky's own windows.** On Mac, the screenshot API can exclude specific windows. On Windows with Tauri's `screenshots` crate, we need to handle this — either capture before showing overlay, or use Windows Graphics Capture API with window exclusion.

3. **The Ctrl+Option hotkey does NOT intercept.** Clicky watches it without claiming it. User can still use Ctrl+Option in other apps. Our Tauri `global_shortcut` approach DOES intercept (it claims the shortcut exclusively).

4. **Short-lived AssemblyAI tokens via /transcribe-token.** The Worker issues temporary tokens for the websocket. The desktop app never touches the real AssemblyAI key. Our build doesn't use AssemblyAI at all — we use ElevenLabs STT (batch) + WebView SpeechRecognition fallback.

---

## THE SYSTEM PROMPT (Exact Personality)

From Isaac Flath's teardown of the open-source code:

```
you're clicky, a friendly always-on companion that lives in the user's 
menu bar. the user just spoke to you via push-to-talk and you can see 
their screen(s). your reply will be spoken aloud via text-to-speech, 
so write the way you'd actually talk. this is an ongoing conversation 
— you remember everything they've said before.

rules:
- default to one or two sentences. be direct and dense. BUT if the user 
  asks you to explain more, go deeper, or elaborate, then go all out — 
  give a thorough, detailed explanation with no length limit.
- all lowercase, casual, warm. no emojis.
- write for the ear, not the eye. short sentences. no lists, bullet 
  points, markdown, or formatting — just natural speech.
- never say "simply" or "just".
- don't read out code verbatim. describe what the code does or what 
  needs to change conversationally.
```

And the ending rule (this is genius):

```
don't end with simple yes/no questions like "want me to explain more?" 
or "should i show you?" — those are dead ends that force the user to 
just say yes. instead, when it fits naturally, end by planting a seed 
— mention something bigger or more ambitious they could try, a related 
concept that goes deeper, or a next-level technique that builds on 
what you just explained.
```

The pointing instruction:

```
when you point, append a coordinate tag at the very end of your 
response, AFTER your spoken text.

format: [POINT:x,y:label] where x,y are integer pixel coordinates in 
the screenshot's coordinate space, and label is a short 1-3 word 
description of the element (like "search bar" or "save button"). if 
the element is on the cursor's screen you can omit the screen number. 
if the element is on a DIFFERENT screen, append :screenN where N is 
the screen number from the image label (e.g. :screen2).

if pointing wouldn't help, append [POINT:none].
```

### What Our Build Gets Wrong:

Our system prompt (`clickySystemPrompt` in Worker) is WAY too complex:
- It talks about CLICKY_PLAN with structured JSON workflow plans
- It mentions step types (observe, click, keyboardShortcut, pressKey, type, scroll, openApp, openUrl, setValue)
- It talks about CLICKY_TOOL blocks
- It tells the model about computer use policies

Farza's prompt is simple: be casual, be short, point when helpful, plant a seed. That's it. The workflow plans and tool blocks are overengineering that makes responses slower and more verbose.

---

## THE COORDINATE MATH (How Pointing Works)

Claude returns coordinates in screenshot pixel space. Getting the triangle there requires:

1. **Clamp** to screenshot bounds
2. **Scale up** from screenshot dimensions to actual display dimensions (screenshot was resized to max 1280px)
3. **Flip Y axis** (screenshot origin = top-left, macOS display origin = bottom-left)
4. **Add display offset** (macOS lays out multiple monitors on a global grid)
5. **Convert** from global AppKit point to local SwiftUI coordinate space in the overlay window
6. **Nudge** right and down so triangle points BESIDE the element, not on top of it
7. **Clamp** inside screen padding so triangle doesn't go off-screen

### For Windows (our build):

Steps 3-5 are different on Windows:
- Windows uses top-left origin (same as screenshot), so NO Y-flip needed
- Multiple monitor offsets work differently (virtual screen coordinates)
- Our Tauri overlay is NOT full-screen, it's a small window — so we need to convert global screen coordinates to determine WHERE to position our overlay window

This is why the full-screen overlay approach is architecturally better. With a full-screen overlay, you just draw the triangle at the scaled coordinates. With a small floating window, you have to move the window to the right position AND draw the triangle inside it.

---

## THE MENU BAR UI (What Users Actually See)

Farza's menu bar panel (opened by clicking the menu bar icon) shows:
- Keyboard shortcut reminder (Ctrl+Option)
- 4 color swatches to change the buddy color (blue, green, purple, pink)
- That's basically it

NO settings dashboard. NO model selector. NO provider picker. NO worker URL field. NO debug mode toggle. NO mock mode. NO microphone probe button. NO voice health test. NO status rail with cursor coordinates.

The philosophy: **zero setup, zero config.** Download, open, press Ctrl+Option, talk. Everything works immediately because the Worker and API keys are managed by HeyClicky's infrastructure, not the user.

For our Windows build (self-hosted/local-first), we need settings — but they should be in a HIDDEN settings window accessed from tray → "Settings...", NOT the default experience.

---

## THE "CLICKY AGENT" FEATURE (New in Private Build)

From Farza's April 25 announcement and LinkedIn:

Say "clicky agent" followed by a task, and Clicky spawns a background agent that:
- Works autonomously while you do other things
- Can build Mac apps
- Can research (e.g., find IG micro-influencers under $X)
- Can interact with Apple Notes, Calendar, Reminders
- Can run Gmail, Calendar, Drive with voice
- Can summarize PDFs and email summaries
- Uses Cua (YC X25) for computer use — actual mouse clicks and keyboard typing

This is the V2 differentiation. For our V1 Windows build, we should focus on the V1 feature set (point-and-talk) and add agent capability later.

---

## GAP ANALYSIS: OUR BUILD vs FARZA'S CLICKY

| Feature | Farza's Clicky | Our Windows Build | Gap |
|---------|---------------|-------------------|-----|
| Blue triangle buddy | Glowing triangle, flight animation, bezier curves | Static ClickyMark SVG, no flight | CRITICAL |
| Overlay architecture | Full-screen transparent window per monitor | Small floating window (74×54 / 380×210) | CRITICAL |
| Pointing animation | Triangle flies in arc to target, rotates, scales | No flight animation, just a point ring CSS animation | CRITICAL |
| Menu bar simplicity | Click icon → shortcut reminder + 4 color swatches | Full 1180×760 settings dashboard | CRITICAL |
| Voice input | AssemblyAI streaming websocket (real-time) | ElevenLabs batch STT + WebView fallback | SIGNIFICANT |
| LLM | Claude with vision (sees screenshots) | MiniMax M2.7 (cannot see screenshots) | CRITICAL |
| System prompt | Short, casual, "write for the ear" | Long, complex with CLICKY_PLAN JSON | SIGNIFICANT |
| Conversation memory | Last 10 turns | Last 20 turns (fixed in latest patch) | OK |
| TTS | ElevenLabs only | ElevenLabs + 3 fallback paths | OVER-ENGINEERED |
| Hotkey behavior | Watches without intercepting | Claims/intercepts exclusively | MINOR |
| Screenshot filtering | Excludes Clicky's own windows | Does not exclude overlay | MINOR |
| "Planting seeds" | Yes — prompt ends with hooks, not yes/no | No — prompt doesn't have this instruction | EASY FIX |
| Zero setup | Download → works (managed infrastructure) | Requires Worker setup, API keys, model config | BY DESIGN (self-hosted) |
| Background agents | "Clicky Agent" voice command | Not implemented | FUTURE |
| Computer use (clicking) | Yes via Cua | open_url only | FUTURE |

---

## WHAT CODEX MUST BUILD — PRIORITY ORDER

### P0: Make It Feel Like Clicky (NOT a dashboard)

1. **Full-screen transparent overlay** — Replace the small floating window with a full-screen click-through overlay per monitor. Draw the buddy triangle anywhere on screen. This is the single biggest architectural change needed.

2. **Triangle flight animation** — When pointing, animate the buddy from cursor position to target coordinates using a quadratic bezier arc. Rotate to face direction of travel. Scale up at midpoint.

3. **Hide the dashboard** — Main window visible: false on launch. Only accessible via tray → Settings. Tray icon shows: shortcut reminder, 4 color swatches, voice toggle, "Settings..." link.

4. **Fix the system prompt** — Replace the complex CLICKY_PLAN/CLICKY_TOOL prompt with Farza's simple casual prompt. Add the "plant a seed" ending instruction. Write for the ear, not the eye.

### P1: Fix Core Quality

5. **Switch to a vision-capable model** — Claude via Anthropic, or any model that can actually see screenshots. The entire product depends on screen understanding.

6. **Fix screenshot labeling** — Add "screen 1 of N — cursor is on this screen (primary focus) (image dimensions: WxH pixels)" labels to each screenshot sent to the model.

7. **Filter Clicky's own windows from screenshots** — Capture screenshots before showing overlay, or use WGC API with window exclusion.

8. **Consider AssemblyAI streaming** — Real-time transcription while speaking is much faster than batch-upload-after-stop.

### P2: Polish

9. **Breathing idle animation** — Already partially done in CSS, but needs to be on the triangle/buddy, not a static SVG mark.

10. **Sound design** — Subtle audio cues for state transitions (listening start, thinking, response ready).

11. **Non-intercepting hotkey** — Register the shortcut as an observer, not a claimer. Let other apps still receive Ctrl+Alt+Space.

---

## FOR CODEX: THE SINGLE INSTRUCTION THAT MATTERS

```
You are building a product where a glowing blue triangle flies across 
the user's screen, lands next to UI elements, and talks to you like 
a friend. 

The triangle is the product. Everything else is infrastructure.

If the triangle doesn't fly, the product doesn't exist.
```

---

*Reference compiled from public sources for pylabmit's Windows Clicky build — May 14, 2026*
