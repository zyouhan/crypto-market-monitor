export interface SoundAlertSettings {
  enabled: boolean;
  entry: boolean;
  cross: boolean;
}

export const DEFAULT_SOUND_ALERT_SETTINGS: SoundAlertSettings = {
  enabled: false,
  entry: true,
  cross: true
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

    const parsed = JSON.parse(raw) as Partial<SoundAlertSettings>;

    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_SOUND_ALERT_SETTINGS };
    }

    return {
      enabled: parsed.enabled === true,
      entry: parsed.entry !== false,
      cross: parsed.cross !== false
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
    // localStorage 不可用时静默降级，不阻塞页面
  }
}

export function isSoundAlertSignal(
  signal: { event_type: string },
  settings: SoundAlertSettings
): boolean {
  if (!settings.enabled) {
    return false;
  }

  const isEntry =
    signal.event_type === "ENTRY_LONG" ||
    signal.event_type === "ENTRY_SHORT";

  if (isEntry) {
    return settings.entry;
  }

  const isCross =
    signal.event_type === "TREND_GOLDEN" ||
    signal.event_type === "TREND_DEATH";

  return isCross && settings.cross;
}

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

/**
 * 浏览器要求在用户手势中解锁音频，开关/试听时主动调用。
 */
export function unlockAudio(): void {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context.resume().catch(() => undefined);
  }
}

function scheduleTripleBeep(context: AudioContext): void {
  const start = context.currentTime + 0.02;
  const offsets = [0, 0.2, 0.4];

  for (const offset of offsets) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const at = start + offset;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, at);

    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.22, at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(at);
    oscillator.stop(at + 0.14);
  }
}

/**
 * 三声短鸣“滴滴滴”。不依赖音频文件，直接使用 Web Audio 合成。
 */
export function playTripleBeep(): void {
  const context = getAudioContext();

  if (!context) {
    return;
  }

  if (context.state === "suspended") {
    void context
      .resume()
      .then(() => {
        if (context.state !== "closed") {
          scheduleTripleBeep(context);
        }
      })
      .catch(() => undefined);
    return;
  }

  if (context.state !== "closed") {
    scheduleTripleBeep(context);
  }
}
