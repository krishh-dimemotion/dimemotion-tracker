// Live: client error reporting from index-LBNWlUO7.js (export `l`) plus the
// stale-chunk reload helpers used by the root error boundary.
// TODO(server): the live handler (server fn 329d1310...) emails the report to
// support. The stub below only logs on the server.
import { createServerFn } from "@tanstack/react-start";
import { IS_TEST_MODE } from "./test-mode";

type ErrorReport = {
  page: string;
  environment: "test" | "live";
  errorTitle: string;
  errorMessage?: string;
  errorStack?: string;
  category: string;
  userEmail?: string;
  userAgent?: string;
};

const sendErrorReport = createServerFn({ method: "POST" })
  .inputValidator((d: ErrorReport) => d)
  .handler(async ({ data }) => {
    console.error("[client-error]", data.category, data.page, data.errorTitle);
    return { ok: true };
  });

export async function reportClientError(e: {
  page?: string;
  errorTitle: string;
  errorMessage?: string;
  errorStack?: string;
  category?: string;
  userEmail?: string;
}) {
  try {
    const page = e.page || (typeof window !== "undefined" ? window.location.pathname : "/");
    const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : undefined;
    void sendErrorReport({
      data: {
        page,
        environment: IS_TEST_MODE ? "test" : "live",
        errorTitle: e.errorTitle,
        errorMessage: e.errorMessage,
        errorStack: e.errorStack,
        category: e.category ?? "general",
        userEmail: e.userEmail,
        userAgent,
      },
    });
  } catch {
    /* never throw from the reporter */
  }
}

const STALE_CHUNK =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Cannot read properties of undefined \(reading ['"]component['"]\)/i;
const RELOAD_KEY = "tracker.reloadedForNewVersionAt";

export function isStaleChunkError(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  return STALE_CHUNK.test(msg);
}

/** Reload once (per 30 s) to pick up a new deploy. Returns true if it reloaded. */
export function reloadForNewVersion() {
  if (typeof window === "undefined") return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 3e4) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
