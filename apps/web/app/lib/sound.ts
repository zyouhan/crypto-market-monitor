export type SoundSignalKind =
  | "entry-long"
  | "entry-short"
  | "golden"
  | "death"
  | "volume"
  | "level";

export interface SoundAlertSettings {
  enabled: boolean;
  entryLong: boolean;
  entryShort: boolean;
  golden: boolean;
  death: boolean;
  volume: boolean;
  level: boolean;
}

export const DEFAULT_SOUND_ALERT_SETTINGS: SoundAlertSettings = {
  enabled: false,
  entryLong: true,
  entryShort: true,
  golden: true,
  death: true,
  volume: true,
  level: true
};

const STORAGE_KEY = "crypto-market-monitor:sound-alerts";

export function loadSoundAlertSettings(): SoundAlertSettings {
  if (typeof window === "undefined") {
    return { ...DEFAULT_SOUND_ALERT_SETTINGS };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULT_SOUND_ALERT_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<
      SoundAlertSettings & { entry?: boolean; cross?: boolean }
    >;

    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_SOUND_ALERT_SETTINGS };
    }

    return {
      enabled: parsed.enabled === true,
      entryLong:
        parsed.entryLong ?? parsed.entry ?? true,
      entryShort:
        parsed.entryShort ?? parsed.entry ?? true,
      golden: parsed.golden ?? parsed.cross ?? true,
      death: parsed.death ?? parsed.cross ?? true,
      volume: parsed.volume ?? true,
      level: parsed.level ?? true
    };
  } catch {
    return { ...DEFAULT_SOUND_ALERT_SETTINGS };
  }
}

export function saveSoundAlertSettings(
  settings: SoundAlertSettings
): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(settings)
    );
  } catch {
    // localStorage 不可用时静默降级
  }
}

export function getSoundAlertKind(
  signal: {
    event_type: string;
    direction?: string | null;
  },
  settings: SoundAlertSettings
): SoundSignalKind | null {
  if (!settings.enabled) {
    return null;
  }

  switch (signal.event_type) {
    case "ENTRY_LONG":
      return settings.entryLong ? "entry-long" : null;
    case "ENTRY_SHORT":
      return settings.entryShort ? "entry-short" : null;
    case "TREND_GOLDEN":
      return settings.golden ? "golden" : null;
    case "TREND_DEATH":
      return settings.death ? "death" : null;
    case "VOLUME_SPIKE":
      return settings.volume ? "volume" : null;
    case "PRICE_LEVEL":
      return settings.level ? "level" : null;
    case "MACD_DEA_TURN":
      return signal.direction === "BEAR"
        ? settings.death
          ? "death"
          : null
        : settings.golden
          ? "golden"
          : null;
    case "STOP_LOSS_HIT":
      return settings.death ? "death" : null;
    case "ADX_TREND":
      return signal.direction === "BEAR"
        ? settings.death
          ? "death"
          : null
        : settings.golden
          ? "golden"
          : null;
    case "TRADE_1R":
    case "TRADE_BREAKEVEN":
      return signal.direction === "BEAR"
        ? settings.death
          ? "death"
          : null
        : settings.golden
          ? "golden"
          : null;
    default:
      return null;
  }
}

const TONES: Record<SoundSignalKind, number[]> = {
  "entry-long": [660, 880, 1100],
  "entry-short": [880, 700, 520],
  golden: [880, 1100, 1320],
  death: [440, 330, 220],
  volume: [740, 740, 980],
  level: [620, 820]
};

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new window.AudioContext();
    }

    return audioContext;
  } catch {
    return null;
  }
}

export function unlockAudio(): void {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

function scheduleTones(
  context: AudioContext,
  frequencies: number[]
): void {
  const start = context.currentTime + 0.02;
  const step = 0.16;

  frequencies.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + index * step;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, at);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.2, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(
      0.0001,
      at + 0.12
    );

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.14);
  });
}

export function playSignalSound(kind: SoundSignalKind): void {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  const play = () => {
    if (context.state !== "closed") {
      scheduleTones(context, TONES[kind]);
    }
  };

  if (context.state === "suspended") {
    void context
      .resume()
      .then(play)
      .catch(() => undefined);
    return;
  }

  play();
}

/** 兼容旧的“滴滴滴”入口，默认使用做多入场音效。 */
export function playTripleBeep(): void {
  playSignalSound("entry-long");
}
