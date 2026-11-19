"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";

import { api } from "../lib/api";
import { isAlertSignal } from "../lib/format";
import {
  DEFAULT_SOUND_ALERT_SETTINGS,
  getSoundAlertKind,
  loadSoundAlertSettings,
  playSignalSound,
  saveSoundAlertSettings,
  unlockAudio,
  type SoundAlertSettings,
  type SoundSignalKind
} from "../lib/sound";
import type { MonitorItem, MonitorSignalItem } from "../types";
import { SignalToasts } from "./SignalToasts";

interface MonitorRuntimeValue {
  monitors: MonitorItem[];
  alerts: MonitorSignalItem[];
  monitorCount: number;
  toasts: MonitorSignalItem[];
  dismissToast: (id: number) => void;
  soundSettings: SoundAlertSettings;
  updateSoundSettings: (settings: SoundAlertSettings) => void;
}

const MonitorRuntimeContext =
  createContext<MonitorRuntimeValue | null>(null);

export function MonitorRuntimeProvider({
  children
}: {
  children: ReactNode;
}) {
  const [monitors, setMonitors] = useState<MonitorItem[]>([]);
  const [alerts, setAlerts] = useState<MonitorSignalItem[]>([]);
  const [toasts, setToasts] = useState<MonitorSignalItem[]>([]);
  const [soundSettings, setSoundSettings] =
    useState<SoundAlertSettings>(() => {
      if (typeof window === "undefined") {
        return { ...DEFAULT_SOUND_ALERT_SETTINGS };
      }

      return loadSoundAlertSettings();
    });
  const soundSettingsRef = useRef(soundSettings);
  const seenSignalIdsRef = useRef<Set<number> | null>(null);
  const inFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;

    try {
      const [monitorData, alertData] = await Promise.all([
        api<MonitorItem[]>("/api/monitors"),
        api<{ items: MonitorSignalItem[] }>(
          "/api/signals?limit=30&triggered=1"
        )
      ]);
      const nextAlerts = alertData.items.filter(isAlertSignal);

      setMonitors(monitorData);
      setAlerts(nextAlerts);

      if (seenSignalIdsRef.current === null) {
        seenSignalIdsRef.current = new Set(
          nextAlerts.map((signal) => signal.id)
        );
        return;
      }

      const seen = seenSignalIdsRef.current;
      const fresh = nextAlerts.filter(
        (signal) => !seen.has(signal.id)
      );

      if (fresh.length === 0) {
        return;
      }

      for (const signal of fresh) {
        seen.add(signal.id);
      }

      const monitorById = new Map(
        monitorData.map((monitor) => [monitor.id, monitor])
      );
      let soundKind: SoundSignalKind | null = null;

      for (const signal of fresh) {
        const monitor = signal.monitor_id
          ? monitorById.get(signal.monitor_id)
          : undefined;

        if (monitor?.sound_enabled !== 1) {
          continue;
        }

        const kind = getSoundAlertKind(
          signal,
          soundSettingsRef.current
        );

        if (kind) {
          soundKind = kind;
          break;
        }
      }

      if (soundKind) {
        playSignalSound(soundKind);
      }

      setToasts((current) =>
        [...current, ...fresh].slice(-4)
      );
    } catch {
      // Keep the previous state; the next poll retries.
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    soundSettingsRef.current = soundSettings;
  }, [soundSettings]);

  useEffect(() => {
    void load();

    const timer = window.setInterval(() => {
      void load();
    }, 15_000);
    const refresh = () => {
      void load();
    };

    window.addEventListener("focus", refresh);
    window.addEventListener("monitors-changed", refresh);
    document.addEventListener("visibilitychange", refresh);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("monitors-changed", refresh);
      document.removeEventListener(
        "visibilitychange",
        refresh
      );
    };
  }, [load]);

  useEffect(() => {
    const handlePointerDown = () => unlockAudio();

    window.addEventListener("pointerdown", handlePointerDown, {
      once: true
    });

    return () => {
      window.removeEventListener(
        "pointerdown",
        handlePointerDown
      );
    };
  }, []);

  useEffect(() => {
    if (toasts.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToasts((current) => current.slice(1));
    }, 10_000);

    return () => window.clearTimeout(timer);
  }, [toasts]);

  const updateSoundSettings = useCallback(
    (next: SoundAlertSettings) => {
      soundSettingsRef.current = next;
      setSoundSettings(next);
      saveSoundAlertSettings(next);
    },
    []
  );

  const value = useMemo(
    () => ({
      monitors,
      alerts,
      monitorCount: monitors.filter(
        (monitor) => monitor.enabled
      ).length,
      toasts,
      dismissToast: (id: number) =>
        setToasts((current) =>
          current.filter((signal) => signal.id !== id)
        ),
      soundSettings,
      updateSoundSettings
    }),
    [
      monitors,
      alerts,
      toasts,
      soundSettings,
      updateSoundSettings
    ]
  );

  return (
    <MonitorRuntimeContext.Provider value={value}>
      {children}
      <SignalToasts
        toasts={toasts}
        monitors={monitors}
        onDismiss={value.dismissToast}
      />
    </MonitorRuntimeContext.Provider>
  );
}

export function useMonitorRuntime(): MonitorRuntimeValue {
  const context = useContext(MonitorRuntimeContext);

  if (!context) {
    throw new Error(
      "useMonitorRuntime must be used inside MonitorRuntimeProvider"
    );
  }

  return context;
}
