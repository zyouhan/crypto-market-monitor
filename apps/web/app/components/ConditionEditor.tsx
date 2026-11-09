"use client";

import type {
  ConditionCatalogItem,
  ConditionField,
  ConditionKind,
  ConditionRole
} from "../types";

export interface ConditionDraft {
  kind: ConditionKind;
  role: ConditionRole;
  interval: string;
  params: Record<string, unknown>;
}

interface ConditionEditorProps {
  value: ConditionDraft;
  catalog: ConditionCatalogItem[];
  baseInterval: string;
  intervals: string[];
  onChange: (value: ConditionDraft) => void;
  onRemove: () => void;
}

function defaultsFor(
  definition: ConditionCatalogItem
): Record<string, unknown> {
  const params: Record<string, unknown> = {};

  for (const field of definition.fields) {
    params[field.key] = field.defaultValue;
  }

  return params;
}

function fieldValue(
  value: Record<string, unknown>,
  field: ConditionField
): string | number | boolean {
  const current = value[field.key];

  if (field.type === "boolean") {
    return current !== false;
  }

  if (field.type === "number") {
    return typeof current === "number"
      ? current
      : Number(field.defaultValue);
  }

  return String(current ?? field.defaultValue);
}

export function ConditionEditor({
  value,
  catalog,
  baseInterval,
  intervals,
  onChange,
  onRemove
}: ConditionEditorProps) {
  const definition = catalog.find(
    (item) => item.kind === value.kind
  );

  if (!definition) {
    return null;
  }

  function updateParams(
    key: string,
    next: string | number | boolean
  ): void {
    onChange({
      ...value,
      params: { ...value.params, [key]: next }
    });
  }

  function changeKind(kind: ConditionKind): void {
    const nextDefinition = catalog.find(
      (item) => item.kind === kind
    );

    if (!nextDefinition) {
      return;
    }

    onChange({
      kind,
      role: value.role,
      interval:
        value.role === "trigger"
          ? baseInterval
          : value.interval,
      params: defaultsFor(nextDefinition)
    });
  }

  function changeRole(role: ConditionRole): void {
    onChange({
      ...value,
      role,
      interval:
        role === "trigger" ? baseInterval : value.interval
    });
  }

  return (
    <div className="strategy-block">
      <div className="strategy-head">
        <div className="strategy-heading">
          <div className="strategy-title">
            {definition.label}
          </div>
          <div className="strategy-desc">
            {definition.description}
          </div>
        </div>

        <button
          type="button"
          className="button small danger"
          onClick={onRemove}
        >
          移除
        </button>
      </div>

      <div className="strategy-body">
        <div className="form-grid three">
          <div className="form-field">
            <label>条件类型</label>
            <select
              value={value.kind}
              onChange={(event) =>
                changeKind(event.target.value as ConditionKind)
              }
            >
              {catalog.map((item) => (
                <option key={item.kind} value={item.kind}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>条件角色</label>
            <select
              value={value.role}
              onChange={(event) =>
                changeRole(event.target.value as ConditionRole)
              }
            >
              <option value="trigger">触发条件</option>
              <option value="filter">过滤条件</option>
            </select>
          </div>

          <div className="form-field">
            <label>条件周期</label>
            <select
              value={value.interval}
              disabled={value.role === "trigger"}
              onChange={(event) =>
                onChange({
                  ...value,
                  interval: event.target.value
                })
              }
            >
              {intervals.map((interval) => (
                <option key={interval} value={interval}>
                  {interval}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-grid three">
          {definition.fields.map((field) => (
            <div className="form-field" key={field.key}>
              <label>{field.label}</label>

              {field.type === "boolean" ? (
                <label className="switch-chip condition-check">
                  <input
                    type="checkbox"
                    checked={Boolean(
                      fieldValue(value.params, field)
                    )}
                    onChange={(event) =>
                      updateParams(
                        field.key,
                        event.target.checked
                      )
                    }
                  />
                  开启
                </label>
              ) : field.type === "select" ? (
                <select
                  value={String(fieldValue(value.params, field))}
                  onChange={(event) =>
                    updateParams(
                      field.key,
                      event.target.value
                    )
                  }
                >
                  {(field.options ?? []).map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                    >
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={Number(fieldValue(value.params, field))}
                  onChange={(event) =>
                    updateParams(
                      field.key,
                      Number(event.target.value)
                    )
                  }
                />
              )}

              {field.help && (
                <div className="field-help">{field.help}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function createDefaultCondition(
  definition: ConditionCatalogItem,
  interval: string,
  role: ConditionRole = "trigger"
): ConditionDraft {
  return {
    kind: definition.kind,
    role,
    interval,
    params: defaultsFor(definition)
  };
}
