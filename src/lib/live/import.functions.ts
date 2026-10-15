// Server functions for the Import wizard: public Google Sheet download and
// AI column mapping (Claude when ANTHROPIC_API_KEY is set, else the local
// matcher result already on screen is kept).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Confidence } from "@/components/lt/data-fields";

export function parseSheetUrl(url: string): { id: string; gid: string | null } | null {
  const m = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(url);
  if (!m) return null;
  const g = /[#&?]gid=(\d+)/.exec(url);
  return { id: m[1], gid: g ? g[1] : null };
}

export const fetchGoogleSheetCsv = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { url: string }) => d)
  .handler(async ({ data }): Promise<{ csvText: string; filename?: string }> => {
    const p = parseSheetUrl(String(data.url ?? "").trim());
    if (!p) throw new Error("That does not look like a Google Sheets link.");
    const exportUrl = `https://docs.google.com/spreadsheets/d/${p.id}/export?format=csv${p.gid ? `&gid=${p.gid}` : ""}`;
    const res = await fetch(exportUrl, { redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || type.includes("text/html")) {
      throw new Error(
        "Could not read that sheet. Set sharing to \"Anyone with the link can view\" and try again.",
      );
    }
    const csvText = await res.text();
    let filename = "Google Sheet";
    const cd = res.headers.get("content-disposition") ?? "";
    const fm = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(cd);
    if (fm) {
      try {
        filename = decodeURIComponent(fm[1]).replace(/\.csv$/i, "");
      } catch {
        /* keep default */
      }
    }
    return { csvText, filename };
  });

type AiResult =
  | {
      ok: true;
      countMatched: number;
      mappings: Record<number, string>;
      confidence: Record<number, Confidence>;
      durationMs?: number;
      modelUsed?: string;
    }
  | { ok: false; error?: string; countMatched?: number };

const MODEL = "claude-sonnet-5-5";

export const aiMapColumns = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { headers: string[]; sampleRows: string[][] }) => d)
  .handler(async ({ data }): Promise<AiResult> => {
    const key = process.env["ANTHROPIC_API_KEY"];
    // No key: keep the local matcher's mapping (countMatched 0 = no override).
    if (!key) return { ok: true, countMatched: 0, mappings: {}, confidence: {} };
    const { IMPORT_FIELDS } = await import("@/components/lt/data-fields");
    const started = Date.now();
    const fields = IMPORT_FIELDS.map((f) => `${f.key}: ${f.label}`).join("\n");
    const headers = data.headers.slice(0, 200);
    const sample = data.sampleRows.slice(0, 8).map((r) => r.slice(0, headers.length).map((v) => String(v ?? "").slice(0, 120)));
    const prompt = `Map spreadsheet columns to CRM import fields.

Fields (key: label):
${fields}

Columns (index: header):
${headers.map((h, i) => `${i}: ${h}`).join("\n")}

Sample rows (JSON arrays, same column order):
${sample.map((r) => JSON.stringify(r)).join("\n")}

Return ONLY a JSON object: {"<column index>": {"key": "<field key>", "confidence": "exact"|"likely"}} for columns that clearly match a field. Use each field key at most once. Omit columns that match nothing.`;
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: MODEL, max_tokens: 4096, messages: [{ role: "user", content: prompt }] }),
      });
      if (!res.ok) return { ok: false, error: `AI request failed (${res.status}): ${(await res.text()).slice(0, 300)}` };
      const json = (await res.json()) as { content?: { type: string; text?: string }[] };
      const text = (json.content ?? []).map((c) => c.text ?? "").join("");
      const m = /\{[\s\S]*\}/.exec(text);
      if (!m) return { ok: false, error: "The AI response could not be read." };
      const parsed = JSON.parse(m[0]) as Record<string, { key?: string; confidence?: string }>;
      const valid = new Set(IMPORT_FIELDS.map((f) => f.key));
      const used = new Set<string>();
      const mappings: Record<number, string> = {};
      const confidence: Record<number, Confidence> = {};
      for (const [idx, v] of Object.entries(parsed)) {
        const i = Number(idx);
        if (!Number.isInteger(i) || i < 0 || i >= headers.length || !v?.key || !valid.has(v.key) || used.has(v.key)) continue;
        used.add(v.key);
        mappings[i] = v.key;
        confidence[i] = v.confidence === "exact" ? "exact" : "likely";
      }
      for (let i = 0; i < headers.length; i++) if (!(i in mappings)) {
        mappings[i] = "ignore";
        confidence[i] = "none";
      }
      return { ok: true, countMatched: used.size, mappings, confidence, durationMs: Date.now() - started, modelUsed: MODEL };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
