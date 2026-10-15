// Live chunk: support-ZHdsfUpL.js
// Export mapping: t -> SUPPORT_EMAIL, n -> supportMailto
export const SUPPORT_EMAIL = "sahil@infosized.co";

export function supportMailto(subject: string, body = "") {
  return `mailto:${SUPPORT_EMAIL}?${new URLSearchParams({ subject, ...(body ? { body } : {}) })
    .toString()
    .replace(/\+/g, "%20")}`;
}
