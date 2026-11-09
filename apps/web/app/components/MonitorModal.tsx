"use client";

import { useState, type FormEvent } from "react";

import {
  ConditionEditor,
  createDefaultCondition,
  type ConditionDraft
} from "./ConditionEditor";
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
  onSave: (payload: SaveMonitorPayload) => Promise<void>;
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
  const [interval, setIntervalValue] = useState(initialInterval);
  const [enabled, setEnabled] = useState(
    item ? item.enabled === 1 : true
  );
  const [wechatEnabled, setWechatEnabled] = useState(
    item ? item.wechat_enabled === 1 : true
  );
  const [soundEnabled, setSoundEnabled] = useState(
    item ? item.sound_enabled === 1 : true
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

  const isEditing = item !== null;

  function changeBaseInterval(next: string): void {
    setIntervalValue(next);

    setConditions((current) =>
      current.map((condition) => {
        if (condition.role === "trigger") {
          return { ...condition, interval: next };
        }

        return intervalIndex(condition.interval) <
          intervalIndex(next)
          ? { ...condition, interval: next }
          : condition;
      })
    );
  }

  function updateCondition(
    index: number,
    next: ConditionDraft
  ): void {
    setConditions((current) =>
      current.map((condition, currentIndex) =>
        currentIndex === index ? next : condition
      )
    );
  }

  function removeCondition(index: number): void {
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

    setConditions((current) => [
      ...current,
      createDefaultCondition(definition, interval, role)
    ]);
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ): Promise<void> {
    event.preventDefault();
    setLocalError("");

    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      setLocalError("请输入交易标的");
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

    for (const condition of conditions) {
      if (
        condition.role === "trigger" &&
        condition.interval !== interval
      ) {
        setLocalError("触发条件必须使用入场周期");
        return;
      }

      if (
        condition.role === "filter" &&
        intervalIndex(condition.interval) <
          intervalIndex(interval)
      ) {
        setLocalError("过滤条件周期不能低于入场周期");
        return;
      }
    }

    const payload: SaveMonitorPayload = {
      name: name.trim() || `${normalizedSymbol} ${interval} 监控`,
      symbol: normalizedSymbol,
      interval,
      enabled,
      wechat_enabled: wechatEnabled,
      sound_enabled: soundEnabled,
      conditions: conditions.map((condition) => ({
        kind: condition.kind,
        role: condition.role,
        interval: condition.interval,
        params: condition.params
      }))
    };

    try {
      await onSave(payload);
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
                disabled={isEditing}
                placeholder="例如 BTCUSDT"
                onChange={(event) =>
                  setSymbol(event.target.value.toUpperCase())
                }
                required
              />
            </div>

            <div className="form-field">
              <label>入场周期</label>
              <select
                value={interval}
                onChange={(event) =>
                  changeBaseInterval(event.target.value)
                }
              >
                {INTERVALS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
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
            多个触发条件必须在同一根入场 K 线同时发生；需要持续状态过滤时，请把条件设为过滤条件。
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
              intervals={INTERVALS.filter(
                (value) =>
                  condition.role === "trigger" ||
                  intervalIndex(value) >= intervalIndex(interval)
              )}
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
