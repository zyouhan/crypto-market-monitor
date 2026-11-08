"use client";

import {
  playTripleBeep,
  unlockAudio,
  type SoundAlertSettings
} from "../lib/sound";

interface SoundSettingsProps {
  value: SoundAlertSettings;
  onChange: (value: SoundAlertSettings) => void;
}

export function SoundSettings({
  value,
  onChange
}: SoundSettingsProps) {
  function update(patch: Partial<SoundAlertSettings>): void {
    onChange({ ...value, ...patch });
  }

  function handleMasterChange(checked: boolean): void {
    if (checked) {
      // 必须在用户手势中创建/恢复 AudioContext
      unlockAudio();
    }

    const next: SoundAlertSettings = {
      ...value,
      enabled: checked
    };

    if (checked && !value.entry && !value.cross) {
      next.entry = true;
      next.cross = true;
    }

    onChange(next);
  }

  function handlePreview(): void {
    unlockAudio();
    playTripleBeep();
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">声音提醒设置</div>
          <div className="panel-subtitle">
            新信号到达时在浏览器内播放三声短鸣
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
        <label className="switch-row sound-master">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) =>
              handleMasterChange(event.target.checked)
            }
          />
          启用声音提醒
        </label>

        <div className="sound-types">
          <label
            className={`sound-type ${
              value.enabled ? "" : "disabled"
            }`}
          >
            <input
              type="checkbox"
              checked={value.entry}
              disabled={!value.enabled}
              onChange={(event) =>
                update({ entry: event.target.checked })
              }
            />
            入场信号
            <span>做多 / 做空</span>
          </label>

          <label
            className={`sound-type ${
              value.enabled ? "" : "disabled"
            }`}
          >
            <input
              type="checkbox"
              checked={value.cross}
              disabled={!value.enabled}
              onChange={(event) =>
                update({ cross: event.target.checked })
              }
            />
            交叉信号
            <span>金叉 / 死叉</span>
          </label>
        </div>

        <button
          type="button"
          className="button small"
          onClick={handlePreview}
        >
          试听
        </button>
      </div>

      <div className="panel-subtitle sound-hint">
        保持本页标签打开即可在后台响铃（可切到其他标签或窗口）；完全关闭页面后无法播放。浏览器限制自动播放，首次使用请点击“试听”或开关解锁声音。
      </div>
    </section>
  );
}
