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

  const parameterFields = definition.fields.filter(
    (field) => field.type !== "boolean"
  );
  const booleanFields = definition.fields.filter(
    (field) => field.type === "boolean"
  );

  function updateParams(
    key: string,
    next: string | number | boolean
  ): void {
    onChange({
      ...value,
      params: { ...value.params, [key]: next }
    });
  }

  return (
    <div className="strategy-block condition-editor">
      <div className="condition-card-head editor-head">
        <span className={`row-role ${value.role}`}>
          {value.role === "filter" ? "过滤条件" : "触发条件"}
        </span>

        <strong>{definition.label}</strong>

        {value.role === "filter" ? (
          <select
            className="interval-inline"
            value={value.interval}
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
        ) : (
          <span className="condition-interval">
            {value.interval}
          </span>
        )}

        <button
          type="button"
          className="button small danger editor-remove"
          onClick={onRemove}
        >
          删除
        </button>
      </div>

      <div className="strategy-desc condition-editor-desc">
        {definition.description}
      </div>

      <div className="form-grid three">
        {parameterFields.map((field) => (
          <div className="form-field" key={field.key}>
            <label>{field.label}</label>

            {field.type === "select" ? (
              <select
                value={String(fieldValue(value.params, field))}
                onChange={(event) =>
                  updateParams(field.key, event.target.value)
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

      {booleanFields.length > 0 && (
        <div className="condition-boolean-row">
          <span className="direction-row-label">方向</span>

          {booleanFields.map((field) => (
            <label className="toggle-chip" key={field.key}>
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
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      )}
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
