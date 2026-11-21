"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  id: number;
}

const ConfirmContext = createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({
  children
}: {
  children: ReactNode;
}) {
  const [pending, setPending] =
    useState<PendingConfirm | null>(null);
  const resolverRef = useRef<((value: boolean) => void) | null>(
    null
  );
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const nextIdRef = useRef(0);

  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      resolverRef.current?.(false);
      previousFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;

      return new Promise<boolean>((resolve) => {
        resolverRef.current = resolve;
        nextIdRef.current += 1;
        setPending({
          ...options,
          id: nextIdRef.current
        });
      });
    },
    []
  );

  const close = useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setPending(null);

    const previous = previousFocusRef.current;
    previousFocusRef.current = null;

    if (previous?.isConnected) {
      window.setTimeout(() => previous.focus(), 0);
    }
  }, []);

  useEffect(() => {
    if (!pending) {
      return;
    }

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pending, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="confirm-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                close(false);
              }
            }}
          >
            <div
              className="confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby={`confirm-title-${pending.id}`}
              aria-describedby={`confirm-message-${pending.id}`}
            >
              <h2 id={`confirm-title-${pending.id}`}>
                {pending.title ?? "确认操作"}
              </h2>
              <p id={`confirm-message-${pending.id}`}>
                {pending.message}
              </p>
              <div className="confirm-actions">
                <button
                  ref={cancelButtonRef}
                  type="button"
                  className="button"
                  onClick={() => close(false)}
                >
                  {pending.cancelLabel ?? "取消"}
                </button>
                <button
                  type="button"
                  className={`button ${
                    pending.danger === false ? "primary" : "danger"
                  }`}
                  onClick={() => close(true)}
                >
                  {pending.confirmLabel ?? "确认"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): (
  options: ConfirmOptions
) => Promise<boolean> {
  const context = useContext(ConfirmContext);

  if (!context) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }

  return context;
}
