# UX Spec

## Screens

| Screen | Purpose | Priority |
| --- | --- | --- |
| Settings/control panel | Configure Worker URL, model, voice, visibility, debug, mock mode, and manual record | High |
| Overlay preview | Show Clicky buddy, response bubble, listening/thinking/speaking/pointing states | High |
| Status rail | Show current state, Worker status, transcript, response, and errors | High |

## Element Classification

| Element | Screen | Type | Action |
| --- | --- | --- | --- |
| Talk/Send button | Settings | Actionable | Toggles explicit recording/submission |
| Test Worker button | Settings | Actionable | Checks mock/local Worker status |
| Test Voice button | Settings | Actionable | Checks Worker-routed TTS and plays a short voice sample when available |
| Worker URL input | Settings | Actionable | Updates Worker target |
| Model input | Settings | Actionable | Updates requested model |
| Shortcut input | Settings | Actionable | Updates displayed shortcut |
| Voice toggle | Settings | Actionable | Toggles voice preference |
| Show Clicky toggle | Settings | Actionable | Shows/hides overlay buddy |
| Debug toggle | Settings | Actionable | Toggles debug preference |
| Mock mode toggle | Settings | Actionable | Switches mock/live Worker behavior |
| Clicky color swatches | Settings | Actionable | Updates the cursor buddy accent color |
| Clicky avatar choices | Settings | Actionable | Switches between Classic, Dot, and Spark buddy marks |
| Clear conversation | Settings | Actionable | Resets state machine |
| Privacy note | Settings | Informational | Display only |
| Overlay bubble | Overlay | Informational | Displays current guidance |
| Voice waveform | Overlay | Informational | Shows ready/listening audio activity near the buddy |
| Status rail cards | Status | Informational | Display current state |

## States

The UI renders from this state machine:

```txt
idle -> listening -> transcribing -> capturing_screen -> thinking -> speaking -> pointing -> idle
```

Errors move to `error` with a safe visible message.

## Accessibility

- Primary buttons have text labels and icons.
- Manual push-to-talk has an `aria-label`.
- The overlay preview and status rail have landmark labels.
- Mobile viewport was checked at 390px with zero horizontal overflow.
