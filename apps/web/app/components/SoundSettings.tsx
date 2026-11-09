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
    "entryLong" | "entryShort" | "golden" | "death"
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
      !value.death
    ) {
      next.entryLong = true;
      next.entryShort = true;
      next.golden = true;
      next.death = true;
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

      <div className="sound-controls">
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
      </div>

      <div className="sound-type-grid">
        {SOUND_TYPES.map((type) => (
          <div className="sound-type-card" key={type.key}>
            <label
              className={`toggle-chip ${
                value.enabled ? "" : "disabled"
              }`}
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

            <div className="sound-type-meta">
              {type.description}
            </div>

            <button
              type="button"
              className="button small"
              onClick={() => preview(type.kind)}
            >
              试听
            </button>
          </div>
        ))}
      </div>

      <div className="panel-subtitle sound-hint">
        保持本页标签打开即可在后台响铃；完全关闭页面后无法播放。浏览器限制自动播放，首次使用请点击“试听”或开关解锁声音。
      </div>
    </section>
  );
}
