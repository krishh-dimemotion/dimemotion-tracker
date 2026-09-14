export type ParsedBool = boolean | null;

const TRUE_WORDS = new Set([
  "yes", "y", "true", "t", "1", "x", "✓", "✔", "checked", "done", "sent", "complete", "completed", "ok",
]);
const FALSE_WORDS = new Set(["no", "n", "false", "f", "0", "-", "none", "not sent", "pending", "na", "n/a"]);

export function parseBool(raw: string): ParsedBool {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (TRUE_WORDS.has(v)) return true;
  if (FALSE_WORDS.has(v)) return false;
  if (v.includes("reply") || v.includes("watched") || v.includes("open")) return true;
  return null;
}

export function parsePercent(raw: string): number | null {
  const v = raw.trim().replace("%", "");
  if (!v) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

export function parseList(raw: string): string[] {
  return raw
    .split(/[;,\n|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/** Returns an ISO date string, or null when the value is empty/unreadable. */
export function parseDate(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;

  // Excel serial number
  if (/^\d{5}(\.\d+)?$/.test(v)) {
    const serial = Number(v);
    if (serial > 20000 && serial < 60000) {
      const ms = Math.round((serial - 25569) * 86400 * 1000);
      return new Date(ms).toISOString().slice(0, 10);
    }
  }

  const isoMatch = v.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) return iso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));

  const numeric = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
  if (numeric) {
    let a = Number(numeric[1]);
    let b = Number(numeric[2]);
    let y = Number(numeric[3]);
    if (y < 100) y += 2000;
    // day-first unless impossible
    if (a > 12 && b <= 12) return iso(y, b, a);
    if (b > 12 && a <= 12) return iso(y, a, b);
    return iso(y, b, a);
  }

  const named = v.toLowerCase().match(/^(\d{1,2})?\s*([a-z]{3,9})\.?\s*(\d{1,2})?,?\s*(\d{4})?/);
  if (named && named[2] && MONTHS[named[2].slice(0, 4)] !== undefined) {
    const m = MONTHS[named[2].slice(0, 4)] ?? MONTHS[named[2].slice(0, 3)];
    const d = Number(named[1] ?? named[3] ?? 1);
    const y = Number(named[4] ?? new Date().getFullYear());
    if (m) return iso(y, m, d);
  }

  const fallback = new Date(v);
  if (!Number.isNaN(fallback.getTime())) return fallback.toISOString().slice(0, 10);
  return null;
}

export type EmailStatus = {
  sent: boolean;
  replied: boolean;
  sentiment: "positive" | "neutral" | "negative" | null;
};

export function parseEmailStatus(raw: string): EmailStatus | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  const positive = v.includes("+") || v.includes("positive") || v.includes("interested");
  const negative = v.includes("-reply") || v.includes("negative") || v.includes("not interested") || v.includes("no thanks");
  const replied = positive || negative || v.includes("reply") || v.includes("replied") || v.includes("response");
  const sent = replied || v.includes("sent") || v.includes("emailed") || v.includes("contacted");
  if (!sent && !replied) return null;
  return {
    sent: true,
    replied,
    sentiment: positive ? "positive" : negative ? "negative" : replied ? "neutral" : null,
  };
}

export function parseSentiment(raw: string): "positive" | "neutral" | "negative" | null {
  const v = raw.trim().toLowerCase();
  if (!v) return null;
  if (v.includes("+") || v.startsWith("pos") || (v.includes("interested") && !v.includes("not"))) return "positive";
  if (v.startsWith("neg") || v.includes("-") || v.includes("not interested")) return "negative";
  if (v.startsWith("neu")) return "neutral";
  return null;
}

export function normalizeLookup(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
