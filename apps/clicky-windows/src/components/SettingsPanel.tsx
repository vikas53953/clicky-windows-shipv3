import type { CSSProperties } from "react";
import { Bug, Eraser, Eye, EyeOff, Hand, Mic, Palette, Settings, ShieldCheck, Volume2, VolumeX, Wifi } from "lucide-react";
import { CLICKY_ACCENT_OPTIONS, CLICKY_AVATAR_OPTIONS, type ClickySettings } from "../services/workerClient";
import { shortcutFromKeyboardEvent } from "../services/shortcutCapture";
import { ClickyMark } from "./ClickyMark";

interface SettingsPanelProps {
  settings: ClickySettings;
  onSettingsChange: (settings: ClickySettings) => void;
  onToggleListening: () => void;
  onTestWorker: () => void;
  onTestVoice: () => void;
  onProbeMic: () => void;
  onClear: () => void;
  pendingComputerTask: string | null;
  onConfirmComputerUse: () => void;
  onCancelComputerUse: () => void;
  listening: boolean;
  nativeSummary: string;
  micStatus: string;
}

export function SettingsPanel({
  settings,
  onSettingsChange,
  onToggleListening,
  onTestWorker,
  onTestVoice,
  onProbeMic,
  onClear,
  pendingComputerTask,
  onConfirmComputerUse,
  onCancelComputerUse,
  listening,
  nativeSummary,
  micStatus
}: SettingsPanelProps) {
  const set = <K extends keyof ClickySettings>(key: K, value: ClickySettings[K]) => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <section className="settings-panel" aria-label="Clicky settings">
      <div className="panel-heading">
        <div>
          <span className="app-mark">C</span>
          <h1>Clicky Windows</h1>
        </div>
        <span className="phase-label">Phase 2 native shell</span>
      </div>

      <div className="primary-actions">
        <button
          className={`record-button ${listening ? "recording" : ""}`}
          type="button"
          aria-label={listening ? "Stop and send voice request" : "Start listening"}
          title={listening ? "Stop and send" : "Start listening"}
          onClick={onToggleListening}
        >
          <Mic size={22} aria-hidden="true" />
          <span>{listening ? "Send" : "Talk"}</span>
        </button>
        <button className="icon-button text-button" type="button" onClick={onTestWorker}>
          <Wifi size={18} aria-hidden="true" />
          <span>Test Worker</span>
        </button>
        <button className="icon-button text-button" type="button" onClick={onTestVoice}>
          <Volume2 size={18} aria-hidden="true" />
          <span>Test Voice</span>
        </button>
        <button className="icon-button text-button" type="button" onClick={onProbeMic}>
          <Mic size={18} aria-hidden="true" />
          <span>Test Mic</span>
        </button>
      </div>

      <div className="native-note">
        <span>{nativeSummary}</span>
        <strong>{micStatus}</strong>
      </div>

      {pendingComputerTask ? (
        <div className="computer-confirmation" role="alert">
          <span>Confirm computer action</span>
          <strong>{pendingComputerTask}</strong>
          <div>
            <button type="button" onClick={onConfirmComputerUse}>
              Confirm
            </button>
            <button type="button" onClick={onCancelComputerUse}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="field-grid">
        <label>
          <span>Worker URL</span>
          <input value={settings.workerUrl} onChange={(event) => set("workerUrl", event.target.value)} />
        </label>
        <label>
          <span>Model</span>
          <input value={settings.model} onChange={(event) => set("model", event.target.value)} />
        </label>
        <label>
          <span>Provider</span>
          <select value={settings.provider} onChange={(event) => set("provider", event.target.value as ClickySettings["provider"])}>
            <option value="opencode">OpenCode</option>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        <label>
          <span>Shortcut</span>
          <input
            value={settings.shortcut}
            readOnly
            aria-label="Clicky global shortcut"
            title="Focus, then press the shortcut keys together"
            onKeyDown={(event) => {
              event.preventDefault();
              const shortcut = shortcutFromKeyboardEvent(event.nativeEvent);
              if (shortcut) set("shortcut", shortcut);
            }}
          />
        </label>
      </div>

      <div className="style-section" style={{ "--clicky-accent": settings.accentColor } as CSSProperties}>
        <div className="setting-subhead">
          <Palette size={17} aria-hidden="true" />
          <span>Clicky style</span>
        </div>
        <div className="swatch-row" role="group" aria-label="Clicky color">
          {CLICKY_ACCENT_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={settings.accentColor === option.value ? "swatch active" : "swatch"}
              type="button"
              aria-label={`${option.label} Clicky`}
              title={option.label}
              style={{ "--swatch-color": option.value } as CSSProperties}
              onClick={() => set("accentColor", option.value)}
            />
          ))}
        </div>
        <div className="avatar-row" role="group" aria-label="Clicky avatar">
          {CLICKY_AVATAR_OPTIONS.map((option) => (
            <button
              key={option.value}
              className={settings.avatar === option.value ? "avatar-choice active" : "avatar-choice"}
              type="button"
              onClick={() => set("avatar", option.value)}
            >
              <ClickyMark avatar={option.value} accentColor={settings.accentColor} size="panel" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="toggle-grid">
        <button className={settings.voiceEnabled ? "toggle active" : "toggle"} type="button" onClick={() => set("voiceEnabled", !settings.voiceEnabled)}>
          {settings.voiceEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
          <span>Voice</span>
        </button>
        <button className={settings.showClicky ? "toggle active" : "toggle"} type="button" onClick={() => set("showClicky", !settings.showClicky)}>
          {settings.showClicky ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
          <span>Show Clicky</span>
        </button>
        <button
          className={settings.computerUseEnabled ? "toggle active" : "toggle"}
          type="button"
          onClick={() => set("computerUseEnabled", !settings.computerUseEnabled)}
        >
          <Hand size={18} aria-hidden="true" />
          <span>Tools</span>
        </button>
        <button className={settings.debugMode ? "toggle active" : "toggle"} type="button" onClick={() => set("debugMode", !settings.debugMode)}>
          <Bug size={18} aria-hidden="true" />
          <span>Debug</span>
        </button>
        <button className={settings.mockMode ? "toggle active" : "toggle"} type="button" onClick={() => set("mockMode", !settings.mockMode)}>
          <Settings size={18} aria-hidden="true" />
          <span>Mock mode</span>
        </button>
      </div>

      <div className="privacy-note">
        <ShieldCheck size={20} aria-hidden="true" />
        <p>Capture starts only after a hotkey or button press. Provider keys stay in the Worker. Tools only open public URLs or point visually.</p>
      </div>

      <button className="clear-button" type="button" onClick={onClear}>
        <Eraser size={17} aria-hidden="true" />
        <span>Clear conversation</span>
      </button>
    </section>
  );
}
