"use client";

interface NotificationSettingsProps {
  globalNotify: boolean;
  serverchanConfigured: boolean;
  onChange: (value: boolean) => void;
}

export function NotificationSettings({
  globalNotify,
  serverchanConfigured,
  onChange
}: NotificationSettingsProps) {
  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">微信通知设置</div>
          <div className="panel-subtitle">
            必须同时开启全局开关、标的开关和策略开关
          </div>
        </div>
      </div>

      <div className="switch-row">
        <input
          type="checkbox"
          checked={globalNotify}
          onChange={(event) => onChange(event.target.checked)}
        />
        全局微信通知
      </div>

      <div className="panel-subtitle" style={{ marginTop: 12 }}>
        Server酱 SendKey：
        {serverchanConfigured ? "已配置" : "未配置"}
      </div>
    </section>
  );
}
