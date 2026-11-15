"use client";

import {
  useEffect,
  useRef,
  type TextareaHTMLAttributes
} from "react";

interface AutoGrowTextareaProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    "rows" | "onChange"
  > {
  value: string;
  onChange: (value: string) => void;
  minLines?: number;
  maxLines?: number;
}

function resize(
  element: HTMLTextAreaElement,
  minLines: number,
  maxLines: number
): void {
  const style = window.getComputedStyle(element);
  const lineHeight =
    Number.parseFloat(style.lineHeight) ||
    Number.parseFloat(style.fontSize) * 1.5 ||
    18;
  const padding =
    Number.parseFloat(style.paddingTop) +
    Number.parseFloat(style.paddingBottom);
  const border =
    Number.parseFloat(style.borderTopWidth) +
    Number.parseFloat(style.borderBottomWidth);
  const minHeight = lineHeight * minLines + padding + border;
  const maxHeight = lineHeight * maxLines + padding + border;

  element.style.height = "auto";
  const nextHeight = Math.min(
    Math.max(element.scrollHeight, minHeight),
    maxHeight
  );
  element.style.height = `${nextHeight}px`;
  element.style.overflowY =
    element.scrollHeight > maxHeight ? "auto" : "hidden";
}

export function AutoGrowTextarea({
  value,
  onChange,
  minLines = 2,
  maxLines = 5,
  className = "",
  ...props
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (ref.current) {
      resize(ref.current, minLines, maxLines);
    }
  }, [value, minLines, maxLines]);

  return (
    <textarea
      {...props}
      ref={ref}
      rows={minLines}
      className={`auto-grow-textarea ${className}`.trim()}
      value={value}
      onChange={(event) => {
        onChange(event.target.value);
        resize(event.currentTarget, minLines, maxLines);
      }}
    />
  );
}
