const PENDING_INVITE_KEY = "tracker.pendingInvite";

export function setPendingInvite(token: string) {
  try {
    window.localStorage.setItem(PENDING_INVITE_KEY, token);
  } catch {
    /* storage unavailable */
  }
}

export function getPendingInvite(): string | null {
  try {
    return window.localStorage.getItem(PENDING_INVITE_KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    window.localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* storage unavailable */
  }
}
