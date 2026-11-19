export const SELF_CHECK_CHANGED_EVENT = "self-check-changed";
export const SELF_CHECK_CREATE_EVENT = "self-check-create-requested";

export function notifySelfCheckChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SELF_CHECK_CHANGED_EVENT));
  }
}

export function requestSelfCheckCreate(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(SELF_CHECK_CREATE_EVENT));
  }
}
