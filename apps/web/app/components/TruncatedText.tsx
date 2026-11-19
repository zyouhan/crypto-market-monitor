"use client";

import {
  useEffect,
  useRef,
  useState
} from "react";
import { createPortal } from "react-dom";

interface TruncatedTextProps {
  value: string | null | undefined;
  maxWidth?: number;
  className?: string;
  emptyText?: string;
}

interface TooltipPosition {
  left: number;
  top: number;
  width: number;
  placement: "top" | "bottom";
}

export function TruncatedText({
  value,
  maxWidth = 220,
  className = "",
  emptyText = "--"
}: TruncatedTextProps) {
  const text = value?.trim() ?? "";
  const display = text || emptyText;
  const textRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] =
    useState<TooltipPosition | null>(null);

  function showTooltip(): void {
    const element = textRef.current;

    if (
      !element ||
      !text ||
      element.scrollWidth <= element.clientWidth
    ) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 24);
    const left = Math.min(
      Math.max(rect.left, 12),
      window.innerWidth - width - 12
    );
    const below = rect.bottom + 8;
    const placement =
      below + 150 > window.innerHeight ? "top" : "bottom";

    setPosition({
      left,
      top: placement === "top" ? Math.max(8, rect.top - 8) : below,
      width,
      placement
    });
    setOpen(true);
  }

  function hideTooltip(): void {
    setOpen(false);
    setPosition(null);
  }

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = () => {
      setOpen(false);
      setPosition(null);
    };
    const handleScroll = () => {
      close();
    };

    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", close);

    return () => {
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <span
        ref={textRef}
        className={`cell-truncate ${className}`.trim()}
        style={{ maxWidth }}
        tabIndex={text ? 0 : undefined}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
      >
        {display}
      </span>
      {open &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className={`ui-tooltip ${position.placement}`}
            role="tooltip"
            style={{
              left: position.left,
              top: position.top,
              maxWidth: position.width
            }}
          >
            {text}
          </div>,
          document.body
        )}
    </>
  );
}
