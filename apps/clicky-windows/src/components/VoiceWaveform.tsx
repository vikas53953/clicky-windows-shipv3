interface VoiceWaveformProps {
  level?: number;
  compact?: boolean;
}

const BAR_WEIGHTS = [0.48, 0.82, 1.08, 0.68, 0.94, 0.54];

export function VoiceWaveform({ level = 0, compact = false }: VoiceWaveformProps) {
  const normalized = Math.max(0.04, Math.min(1, level));

  return (
    <span className={compact ? "voice-waveform compact" : "voice-waveform"} aria-hidden="true">
      {BAR_WEIGHTS.map((weight, index) => {
        const scale = Math.max(0.22, Math.min(1.65, 0.22 + normalized * weight * 1.45));
        return <span key={`${weight}-${index}`} style={{ transform: `scaleY(${scale})`, animationDelay: `${index * 52}ms` }} />;
      })}
    </span>
  );
}
