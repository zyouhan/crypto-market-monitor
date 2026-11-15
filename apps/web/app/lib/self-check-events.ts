export const SELF_CHECK_CHANGED_EVENT = "self-check-changed";

export function notifySelfCheckChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SELF_CHECK_CHANGED_EVENT));
  }
}
