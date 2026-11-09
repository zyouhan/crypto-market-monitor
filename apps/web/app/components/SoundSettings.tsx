"use client";

import {
  playSignalSound,
  unlockAudio,
  type SoundAlertSettings,
  type SoundSignalKind
} from "../lib/sound";

interface SoundSettingsProps {
  value: SoundAlertSettings;
  onChange: (value: SoundAlertSettings) => void;
}

const SOUND_TYPES: Array<{
  key: keyof Pick<
    SoundAlertSettings,
    | "entryLong"
    | "entryShort"
    | "golden"
    | "death"
    | "volume"
    | "level"
  >;
  kind: SoundSignalKind;
  label: string;
  description: string;
}> = [
  {
    key: "entryLong",
    kind: "entry-long",
    label: "做多入场",
    description: "上行动机音"
  },
  {
    key: "entryShort",
    kind: "entry-short",
    label: "做空入场",
    description: "下行动机音"
  },
  {
    key: "golden",
    kind: "golden",
    label: "金叉",
    description: "高亮交叉音"
  },
  {
    key: "death",
    kind: "death",
    label: "死叉",
    description: "低沉交叉音"
  },
  {
    key: "volume",
    kind: "volume",
    label: "放量",
    description: "连续量能音"
  },
  {
    key: "level",
    kind: "level",
    label: "到价",
    description: "价位提示音"
  }
];

export function SoundSettings({
  value,
  onChange
}: SoundSettingsProps) {
  function update(
    patch: Partial<SoundAlertSettings>
  ): void {
    onChange({ ...value, ...patch });
  }

  function handleMasterChange(checked: boolean): void {
    if (checked) {
      unlockAudio();
    }

    const next: SoundAlertSettings = {
      ...value,
      enabled: checked
    };

    if (
      checked &&
      !value.entryLong &&
      !value.entryShort &&
      !value.golden &&
      !value.death &&
      !value.volume &&
      !value.level
    ) {
      next.entryLong = true;
      next.entryShort = true;
      next.golden = true;
      next.death = true;
      next.volume = true;
      next.level = true;
    }

    onChange(next);
  }

  function preview(kind: SoundSignalKind): void {
    unlockAudio();
    playSignalSound(kind);
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">声音提醒设置</div>
          <div className="panel-subtitle">
            不同信号类型使用不同提示音
          </div>
        </div>

        <span
          className={`sound-state ${
            value.enabled ? "on" : ""
          }`}
        >
          {value.enabled ? "已开启" : "已关闭"}
        </span>
      </div>

      <div className="sound-controls-row">
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) =>
              handleMasterChange(event.target.checked)
            }
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span>启用声音提醒</span>
        </label>

        <div className="sound-type-strip">
          {SOUND_TYPES.map((type) => (
            <div className="sound-type-item" key={type.key}>
              <label
                className={`toggle-chip ${
                  value.enabled ? "" : "disabled"
                }`}
                title={type.description}
              >
                <input
                  type="checkbox"
                  checked={value[type.key]}
                  disabled={!value.enabled}
                  onChange={(event) =>
                    update({
                      [type.key]: event.target.checked
                    })
                  }
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
                <span>{type.label}</span>
              </label>

              <button
                type="button"
                className="icon-button sound-preview-icon"
                aria-label={`试听${type.label}`}
                title={`试听${type.label}`}
                onClick={() => preview(type.kind)}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  aria-hidden="true"
                >
                  <path
                    d="M4 9v6h4l5 4V5L8 9H4z"
                    fill="currentColor"
                  />
                  <path
                    d="M16 8.5a5 5 0 010 7M18.5 6a8.5 8.5 0 010 12"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="panel-subtitle sound-hint">
        保持本页标签打开即可在后台响铃；完全关闭页面后无法播放。浏览器限制自动播放，首次使用请点击“试听”或开关解锁声音。
      </div>
    </section>
  );
}
