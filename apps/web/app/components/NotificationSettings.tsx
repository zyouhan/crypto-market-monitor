"use client";

interface NotificationSettingsProps {
  globalMonitor: boolean;
  globalNotify: boolean;
  serverchanConfigured: boolean;
  onMonitorChange: (value: boolean) => void;
  onNotifyChange: (value: boolean) => void;
}

export function NotificationSettings({
  globalMonitor,
  globalNotify,
  serverchanConfigured,
  onMonitorChange,
  onNotifyChange
}: NotificationSettingsProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">全局通知与控制</div>
          <div className="panel-subtitle">
            全局监控关闭后停止自动轮询；手动请求仍可单独执行
          </div>
        </div>
      </div>

      <div className="global-switch-row">
        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={globalMonitor}
            onChange={(event) =>
              onMonitorChange(event.target.checked)
            }
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span>全局监控</span>
        </label>

        <label className="toggle-chip">
          <input
            type="checkbox"
            checked={globalNotify}
            onChange={(event) =>
              onNotifyChange(event.target.checked)
            }
          />
          <span className="toggle-track">
            <span className="toggle-thumb" />
          </span>
          <span>全局微信通知</span>
        </label>

        <span className="serverchan-note">
          Server酱 SendKey：
          {serverchanConfigured ? "已配置" : "未配置"}
        </span>
      </div>
    </section>
  );
}
