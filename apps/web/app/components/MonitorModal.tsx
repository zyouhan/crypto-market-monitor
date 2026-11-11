"use client";

import { useState, type FormEvent } from "react";

import {
  ConditionEditor,
  createDefaultCondition,
  type ConditionDraft
} from "./ConditionEditor";
import {
  MONITOR_PRESETS,
  buildPresetConditions,
  type MonitorPreset
} from "../lib/monitor-presets";
import type {
  ConditionCatalogItem,
  ConditionKind,
  MonitorItem,
  SaveMonitorPayload
} from "../types";

const INTERVALS = [
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M"
];

interface MonitorModalProps {
  item: MonitorItem | null;
  catalog: ConditionCatalogItem[];
  serverchanConfigured: boolean;
  loading: boolean;
  error: string;
  onClose: () => void;
  onSave: (payloads: SaveMonitorPayload[]) => Promise<void>;
}

function intervalIndex(interval: string): number {
  const index = INTERVALS.indexOf(interval);

  return index >= 0 ? index : 0;
}

function defaultConditions(
  catalog: ConditionCatalogItem[],
  interval: string
): ConditionDraft[] {
  const definition =
    catalog.find((item) => item.kind === "KDJ_EXTREME") ??
    catalog[0];

  if (!definition) {
    return [];
  }

  return [
    createDefaultCondition(definition, interval, "trigger")
  ];
}

function baseIntervalFor(
  conditions: ConditionDraft[],
  fallback: string
): string {
  const triggers = conditions.filter(
    (condition) => condition.role === "trigger"
  );

  if (triggers.length === 0) {
    return fallback;
  }

  return triggers.reduce(
    (fastest, condition) =>
      intervalIndex(condition.interval) <
      intervalIndex(fastest)
        ? condition.interval
        : fastest,
    triggers[0].interval
  );
}

export function MonitorModal({
  item,
  catalog,
  serverchanConfigured,
  loading,
  error,
  onClose,
  onSave
}: MonitorModalProps) {
  const initialInterval = item?.interval ?? "5m";
  const [name, setName] = useState(
    item?.name ?? ""
  );
  const [symbol, setSymbol] = useState(item?.symbol ?? "");
  const [enabled, setEnabled] = useState(
    item ? item.enabled === 1 : true
  );
  const [wechatEnabled, setWechatEnabled] = useState(
    item ? item.wechat_enabled === 1 : true
  );
  const [soundEnabled, setSoundEnabled] = useState(
    item ? item.sound_enabled === 1 : true
  );
  const [trackStats, setTrackStats] = useState(
    item ? item.track_stats === 1 : false
  );
  const [referenceIntervals, setReferenceIntervals] = useState<
    Array<"15m" | "1h" | "4h">
  >(
    item?.reference_intervals ?? ["15m", "1h", "4h"]
  );
  const [conditions, setConditions] = useState<ConditionDraft[]>(
    item
      ? item.conditions.map((condition) => ({
          kind: condition.kind,
          role: condition.role,
          interval: condition.interval,
          params: { ...condition.params }
        }))
      : defaultConditions(catalog, initialInterval)
  );
  const [addKind, setAddKind] = useState<ConditionKind>(
    catalog[0]?.kind ?? "KDJ_EXTREME"
  );
  const [localError, setLocalError] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<
    string | null
  >(null);
  const [presetId, setPresetId] = useState<string | null>(
    null
  );
  const [presetName, setPresetName] = useState<string | null>(
    null
  );
  const [batchSymbols, setBatchSymbols] = useState("");

  const isEditing = item !== null;
  const baseInterval = baseIntervalFor(
    conditions,
    initialInterval
  );

  function detachPreset(): void {
    setSelectedPresetId(null);
    setPresetId(null);
    setPresetName(null);
    setTrackStats(false);
  }

  function updateCondition(
    index: number,
    next: ConditionDraft
  ): void {
    detachPreset();
    setConditions((current) =>
      current.map((condition, currentIndex) =>
        currentIndex === index ? next : condition
      )
    );
  }

  function removeCondition(index: number): void {
    detachPreset();
    setConditions((current) =>
      current.filter((_, currentIndex) => currentIndex !== index)
    );
  }

  function addCondition(role: "trigger" | "filter"): void {
    const definition = catalog.find(
      (entry) => entry.kind === addKind
    );

    if (!definition) {
      return;
    }

    detachPreset();
    setConditions((current) => [
      ...current,
      createDefaultCondition(definition, baseInterval, role)
    ]);
  }

  function applyPreset(preset: MonitorPreset): void {
    const next = buildPresetConditions(preset, catalog);

    if (!next) {
      setLocalError("当前条件目录缺少该预设所需条件");
      return;
    }

    setConditions(next);
    setSelectedPresetId(preset.id);
    setPresetId(preset.id);
    setPresetName(preset.defaultName);
    setTrackStats(true);
    setLocalError("");

    if (
      !name.trim() ||
      MONITOR_PRESETS.some(
        (candidate) =>
          candidate.defaultName === name.trim()
      )
    ) {
      setName(preset.defaultName);
    }
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setLocalError("");

    const normalizedSymbol = symbol.trim().toUpperCase();
    const batch = Array.from(
      new Set(
        batchSymbols
          .split(/[\s,，]+/)
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean)
      )
    );
    const symbols =
      batch.length > 0
        ? batch
        : normalizedSymbol
          ? [normalizedSymbol]
          : [];

    if (batch.length > 20) {
      setLocalError("批量标的不能超过 20 个");
      return;
    }

    if (symbols.length === 0) {
      setLocalError("请输入交易标的");
      return;
    }

    if (isEditing && symbols.length > 1) {
      setLocalError("编辑模式只能保存一个标的");
      return;
    }

    if (conditions.length === 0) {
      setLocalError("至少添加一个触发条件");
      return;
    }

    if (
      !conditions.some((condition) => condition.role === "trigger")
    ) {
      setLocalError("至少保留一个触发条件");
      return;
    }

    const payloads: SaveMonitorPayload[] = symbols.map(
      (targetSymbol) => ({
        name:
          symbols.length === 1
            ? name.trim() ||
              `${targetSymbol} ${baseInterval} 监控`
            : `${targetSymbol} ${
                name.trim() ||
                presetName ||
                "自定义监控"
              }`,
        symbol: targetSymbol,
        interval: baseInterval,
        enabled,
        wechat_enabled: wechatEnabled,
        sound_enabled: soundEnabled,
        preset_id: presetId,
        preset_name: presetName,
        track_stats: trackStats,
        reference_intervals: referenceIntervals,
        conditions: conditions.map((condition) => ({
          kind: condition.kind,
          role: condition.role,
          interval: condition.interval,
          params: condition.params
        }))
      })
    );

    try {
      await onSave(payloads);
    } catch {
      // 页面统一展示错误
    }
  }

  const triggerCount = conditions.filter(
    (condition) => condition.role === "trigger"
  ).length;
  const filterCount = conditions.filter(
    (condition) => condition.role === "filter"
  ).length;
  const validationOk = triggerCount > 0;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <form className="modal monitor-modal" onSubmit={handleSubmit}>
        <div className="modal-title-row">
          <h2>
            {isEditing ? "编辑监控项" : "新建监控项"}
          </h2>
          <button
            type="button"
            className="modal-close"
            aria-label="关闭"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="modal-steps">
          <span className="modal-step active">
            <b>1</b> 基本信息
          </span>
          <span className="modal-step-arrow">→</span>
          <span className="modal-step">
            <b>2</b> 通知方式
          </span>
          <span className="modal-step-arrow">→</span>
          <span className="modal-step">
            <b>3</b> 组合条件
          </span>
        </div>

        {(localError || error) && (
          <div className="message error">
            {localError || error}
          </div>
        )}

        {!isEditing && (
          <section className="preset-picker">
            <div className="preset-heading">
              <div>
                <div className="preset-title">快速预设</div>
                <div className="preset-subtitle">
                  选择一套入场条件，可一次创建多个标的
                </div>
              </div>
            </div>

            <div className="preset-grid">
              {MONITOR_PRESETS.map((preset) => {
                const available =
                  buildPresetConditions(preset, catalog) !== null;

                return (
                  <button
                    key={preset.id}
                    type="button"
                    className={`preset-card ${
                      selectedPresetId === preset.id
                        ? "active"
                        : ""
                    }`}
                    disabled={!available}
                    onClick={() => applyPreset(preset)}
                  >
                    <span
                      className={`preset-side ${
                        preset.direction === "long"
                          ? "bull"
                          : "bear"
                      }`}
                    >
                      {preset.direction === "long"
                        ? "做多"
                        : "做空"}
                    </span>
                    <strong>{preset.title}</strong>
                    <span>{preset.description}</span>
                  </button>
                );
              })}
            </div>

            <div className="form-field">
              <label>批量标的（可选）</label>
              <textarea
                rows={2}
                value={batchSymbols}
                placeholder="BTCUSDT, ETHUSDT；留空则使用上方交易标的"
                onChange={(event) => {
                  const value = event.target.value;
                  const count = new Set(
                    value
                      .split(/[\s,，]+/)
                      .map((item) => item.trim().toUpperCase())
                      .filter(Boolean)
                  ).size;

                  setBatchSymbols(value);

                  if (count > 1) {
                    setWechatEnabled(false);
                    setSoundEnabled(false);
                  }
                }}
              />
              <div className="field-help">
                逗号或换行分隔，最多 20 个；多个标的默认关闭微信和声音，可手动开启。
              </div>
            </div>
          </section>
        )}

        <section className="form-section">
          <div className="section-heading">
            <span className="section-number">1</span>
            <h3>基本信息</h3>
          </div>

          <div className="form-grid three">
            <div className="form-field">
              <label>监控项名称</label>
              <input
                value={name}
                placeholder="留空自动生成，如 BTCUSDT 5m"
                onChange={(event) =>
                  setName(event.target.value)
                }
              />
            </div>

            <div className="form-field">
              <label>交易标的</label>
              <input
                value={symbol}
                disabled={
                  isEditing || Boolean(batchSymbols.trim())
                }
                placeholder={
                  batchSymbols.trim()
                    ? "已在批量标的中指定"
                    : "例如 BTCUSDT"
                }
                onChange={(event) =>
                  setSymbol(event.target.value.toUpperCase())
                }
                required={!batchSymbols.trim()}
              />
            </div>

            <div className="form-field">
              <label>检查周期（自动）</label>
              <div className="auto-field">
                <strong>{baseInterval}</strong>
                <span>取所有触发条件中的最小周期</span>
              </div>
            </div>
          </div>

          <div className="stats-toggle-row">
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={trackStats}
                onChange={(event) =>
                  setTrackStats(event.target.checked)
                }
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span>纳入策略统计</span>
            </label>
            <span className="field-help">
              选择预设会自动开启；修改条件后需重新确认是否继续统计
            </span>
          </div>

          <div className="reference-trend-row">
            <span className="reference-label">大级别趋势参考</span>
            {(["15m", "1h", "4h"] as const).map(
              (interval) => (
                <label
                  className="reference-choice"
                  key={interval}
                >
                  <input
                    type="checkbox"
                    checked={referenceIntervals.includes(
                      interval
                    )}
                    onChange={(event) =>
                      setReferenceIntervals((current) =>
                        event.target.checked
                          ? [...current, interval]
                          : current.filter(
                              (item) => item !== interval
                            )
                      )
                    }
                  />
                  {interval}
                </label>
              )
            )}
            <span className="field-help">
              仅记录 DEA 走势，不参与过滤和触发
            </span>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <span className="section-number">2</span>
            <h3>通知方式</h3>
          </div>

          <div className="notification-toggle-row">
            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(event) =>
                  setEnabled(event.target.checked)
                }
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span>启用监控</span>
            </label>

            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={wechatEnabled}
                onChange={(event) =>
                  setWechatEnabled(event.target.checked)
                }
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span>微信通知</span>
            </label>

            <label className="toggle-chip">
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(event) =>
                  setSoundEnabled(event.target.checked)
                }
              />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span>声音提醒</span>
            </label>

            <span className="serverchan-note">
              Server酱 SendKey：
              {serverchanConfigured ? "已配置" : "未配置"}
            </span>
          </div>
        </section>

        <section className="form-section">
          <div className="section-heading">
            <span className="section-number">3</span>
            <h3>组合条件</h3>
          </div>

          <div className="section-help">
            检查周期自动取所有触发条件中的最小周期；每个条件可自由选择自己的 K 线周期。过滤条件使用更低周期时，会取检查时点最近一根已收盘数据。
          </div>

          <div className="condition-add">
            <select
              value={addKind}
              onChange={(event) =>
                setAddKind(
                  event.target.value as ConditionKind
                )
              }
            >
              {catalog.map((definition) => (
                <option
                  key={definition.kind}
                  value={definition.kind}
                >
                  {definition.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="button small"
              onClick={() => addCondition("trigger")}
            >
              + 添加为触发条件
            </button>

            <button
              type="button"
              className="button small"
              onClick={() => addCondition("filter")}
            >
              + 添加为过滤条件
            </button>
          </div>

          {conditions.map((condition, index) => (
            <ConditionEditor
              key={`${condition.kind}-${condition.role}-${index}`}
              value={condition}
              catalog={catalog}
              intervals={INTERVALS}
              onChange={(next) =>
                updateCondition(index, next)
              }
              onRemove={() => removeCondition(index)}
            />
          ))}

          {conditions.length === 0 && (
            <div className="empty">还没有条件，请先添加</div>
          )}
        </section>

        <div className="modal-footer">
          <div
            className={`condition-summary ${
              validationOk ? "ok" : "error"
            }`}
          >
            已含 {triggerCount} 个触发条件 + {filterCount} 个过滤条件
            {validationOk ? "，校验通过" : "，至少需要一个触发条件"}
          </div>

          <div className="form-actions">
            <button
              type="button"
              className="button"
              onClick={onClose}
            >
              取消
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={loading}
            >
              {loading ? "保存中..." : "保存开启"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
