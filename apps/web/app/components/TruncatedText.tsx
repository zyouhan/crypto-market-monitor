"use client";

interface TruncatedTextProps {
  value: string | null | undefined;
  maxWidth?: number;
  className?: string;
  emptyText?: string;
}

export function TruncatedText({
  value,
  maxWidth = 220,
  className = "",
  emptyText = "--"
}: TruncatedTextProps) {
  const text = value?.trim() ?? "";
  const display = text || emptyText;

  return (
    <span
      className={`cell-truncate ${className}`.trim()}
      style={{ maxWidth }}
      title={text || undefined}
    >
      {display}
    </span>
  );
}
