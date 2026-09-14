import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, Pill } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  FIELD_BY_KEY,
  FIELD_GROUPS,
  LEAD_FIELD_DEFS,
  columnSignature,
  matchHeader,
  normalizeHeader,
  type MatchResult,
} from "@/components/data/importFields";
import { readSpreadsheet } from "@/components/data/readFile";
import { buildRow, type BuiltRow, type LookupMaps } from "@/components/data/buildRow";
import { normalizeLookup } from "@/components/data/parseValue";
import { useCountries, useStages, useChannels, useSenderAccounts, useTags } from "@/hooks/useLookups";
import { downloadCsv } from "@/lib/format";
import { cn } from "@/lib/utils";

type Mapping = Record<number, string>;

type DupInfo = { isDuplicate: boolean; existing?: Record<string, unknown> };

type RowResult =
  | { row: number; status: "imported" | "updated" | "skipped" }
  | { row: number; status: "failed"; error: string };

const STEP_LABELS = ["Upload", "Map columns", "Preview", "Confirm", "Result"];
const CHUNK = 25;

export function ImportWizard() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [confidence, setConfidence] = useState<Record<number, MatchResult["confidence"]>>({});
  const [keepLeftovers, setKeepLeftovers] = useState(true);
  const [nameFallback, setNameFallback] = useState<string>("");
  const [search, setSearch] = useState("");
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [dupAction, setDupAction] = useState<"skip" | "update" | "merge">("skip");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [mappingName, setMappingName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  const { data: countries } = useCountries(false);
  const { data: stages } = useStages("lead");
  const { data: channels } = useChannels();
  const { data: senderAccounts } = useSenderAccounts();
  const { data: tags } = useTags();

  const savedMappings = useQuery({
    queryKey: ["import_mappings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("import_mappings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const signature = useMemo(() => columnSignature(headers), [headers]);

  const loadFile = async (f: File, sheet?: string) => {
    const parsed = await readSpreadsheet(f, sheet);
    setFile(f);
    setFileName(f.name);
    setSheetNames(parsed.sheetNames);
    setSheetName(parsed.sheetName);
    setHeaders(parsed.headers);
    setDataRows(parsed.rows);

    const sig = columnSignature(parsed.headers);
    const saved = (savedMappings.data ?? []).find((m: any) => m.signature === sig);
    if (saved) {
      setMapping((saved as any).mapping ?? {});
      setConfidence(Object.fromEntries(parsed.headers.map((_, i) => [i, "exact" as const])));
      setKeepLeftovers(Boolean((saved as any).options?.keepLeftovers ?? true));
      setNameFallback(String((saved as any).options?.nameFallback ?? ""));
      setMappingName((saved as any).name ?? "");
    } else {
      const initial: Mapping = {};
      const conf: Record<number, MatchResult["confidence"]> = {};
      const used = new Set<string>();
      parsed.headers.forEach((h, i) => {
        const m = matchHeader(h);
        if (m.key !== "ignore" && used.has(m.key)) {
          initial[i] = "ignore";
          conf[i] = "none";
          return;
        }
        if (m.key !== "ignore") used.add(m.key);
        initial[i] = m.key;
        conf[i] = m.confidence;
      });
      setMapping(initial);
      setConfidence(conf);
      setMappingName("");
    }
    setStep(2);
  };

  const lookups: LookupMaps = useMemo(
    () => ({
      countries: new Map((countries ?? []).map((c: any) => [normalizeLookup(c.name), c.id])),
      stages: new Map((stages ?? []).map((s: any) => [normalizeLookup(s.name), s.id])),
      channels: new Map((channels ?? []).map((c: any) => [normalizeLookup(c.name), c.id])),
      senders: new Map(
        (senderAccounts ?? []).flatMap((s: any) =>
          [
            [normalizeLookup(s.label), s.id] as [string, string],
            ...(s.identifier ? [[normalizeLookup(s.identifier), s.id] as [string, string]] : []),
          ],
        ),
      ),
    }),
    [countries, stages, channels, senderAccounts],
  );

  const built: BuiltRow[] = useMemo(() => {
    return dataRows.map((row) => {
      const mapped: Record<string, string> = {};
      const leftovers: Record<string, string> = {};
      headers.forEach((h, i) => {
        const key = mapping[i] ?? "ignore";
        const value = (row[i] ?? "").trim();
        if (key === "ignore") {
          if (value) leftovers[h.replace(/\s+/g, " ").trim()] = value;
          return;
        }
        if (!value) return;
        mapped[key] = mapped[key] ? `${mapped[key]}, ${value}` : value;
      });
      const b = buildRow(mapped, lookups, { leftovers, keepLeftovers });
      if (!b.lead["company_name"] && nameFallback !== "") {
        const idx = Number(nameFallback);
        const fallbackValue = (row[idx] ?? "").trim();
        if (fallbackValue) b.lead["company_name"] = fallbackValue;
      }
      if (!b.lead["company_name"]) {
        const firstEmail = b.people.find((p) => p.email)?.email;
        if (firstEmail) b.lead["company_name"] = firstEmail;
      }
      return b;
    });
  }, [dataRows, headers, mapping, lookups, keepLeftovers, nameFallback]);

  const missingCompany = built.filter((b) => !b.lead["company_name"]).length;

  const existing = useQuery({
    queryKey: ["import_existing_leads"],
    enabled: step >= 3,
    queryFn: async () => {
      const { data: leads, error } = await supabase.from("leads").select("*");
      if (error) throw error;
      const { data: contacts } = await supabase.from("lead_contacts").select("lead_id,email");
      const emails = new Map<string, string[]>();
      (contacts ?? []).forEach((c: any) => {
        if (!c.email) return;
        const arr = emails.get(c.lead_id) ?? [];
        arr.push(String(c.email).toLowerCase());
        emails.set(c.lead_id, arr);
      });
      return (leads ?? []).map((l: any) => ({ lead: l, emails: emails.get(l.id) ?? [] }));
    },
  });

  const dupMap: DupInfo[] = useMemo(() => {
    const rows = existing.data;
    if (!rows) return built.map(() => ({ isDuplicate: false }));
    return built.map((b): DupInfo => {
      const name = typeof b.lead["company_name"] === "string" ? normalizeLookup(b.lead["company_name"]) : "";
      const email = b.people.find((p) => p.email)?.email?.toLowerCase() ?? "";
      const match = rows.find((r) => {
        const sameName = name && normalizeLookup(r.lead["company_name"] ?? "") === name;
        const sameEmail = email && r.emails.includes(email);
        return Boolean(sameName || sameEmail);
      });
      return match ? { isDuplicate: true, existing: match.lead } : { isDuplicate: false };
    });
  }, [built, existing.data]);

  const dupCount = dupMap.filter((d) => d.isDuplicate).length;
  const warningCount = built.filter((b) => b.warnings.length > 0).length;

  const duplicateFieldKeys = useMemo(() => {
    const seen = new Map<string, number>();
    const dups = new Set<string>();
    Object.values(mapping).forEach((k) => {
      if (k === "ignore") return;
      const count = (seen.get(k) ?? 0) + 1;
      seen.set(k, count);
      if (count > 1) dups.add(k);
    });
    return dups;
  }, [mapping]);

  const reset = () => {
    setStep(1);
    setFile(null);
    setFileName("");
    setSheetNames([]);
    setSheetName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setConfidence({});
    setResults(null);
    setProgress(0);
    setNameFallback("");
    setSearch("");
    setOnlyUnmatched(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const saveMapping = async () => {
    const name = mappingName.trim() || fileName || "Saved mapping";
    const existingRow = (savedMappings.data ?? []).find((m: any) => m.signature === signature);
    const payload = {
      name,
      signature,
      mapping: mapping as unknown as Record<string, string>,
      options: { keepLeftovers, nameFallback },
    };
    if (existingRow) {
      await supabase.from("import_mappings").update(payload as never).eq("id", (existingRow as any).id);
    } else {
      await supabase.from("import_mappings").insert(payload as never);
    }
    await qc.invalidateQueries({ queryKey: ["import_mappings"] });
  };

  const runImport = async () => {
    setImporting(true);
    setProgress(0);
    const out: RowResult[] = [];
    try {
      const tagMap = new Map((tags ?? []).map((t: any) => [normalizeLookup(t.name), t.id]));
      const ensureTag = async (name: string) => {
        const norm = normalizeLookup(name);
        const hit = tagMap.get(norm);
        if (hit) return hit as string;
        const { data, error } = await supabase.from("tags").insert({ name: name.trim() } as never).select("id").single();
        if (error) throw error;
        tagMap.set(norm, (data as any).id);
        return (data as any).id as string;
      };

      const queue: { index: number; row: BuiltRow; dup: DupInfo }[] = [];
      for (let i = 0; i < built.length; i++) {
        const row = built[i]!;
        const dup = dupMap[i] ?? { isDuplicate: false };
        const rowNum = i + 2;
        if (!row.lead["company_name"]) {
          out.push({ row: rowNum, status: "failed", error: "No company name for this row" });
          continue;
        }
        if (dup.isDuplicate && dupAction === "skip") {
          out.push({ row: rowNum, status: "skipped" });
          continue;
        }
        queue.push({ index: i, row, dup });
      }

      const writeChildren = async (leadId: string, row: BuiltRow, replace: boolean) => {
        if (row.people.length > 0) {
          if (replace) await supabase.from("lead_contacts").delete().eq("lead_id", leadId);
          const contactRows = row.people.map((p, idx) => ({
            lead_id: leadId,
            person_name: p.person_name,
            job_title: p.job_title,
            email: p.email,
            linkedin_url: p.linkedin_url,
            instagram_url: p.instagram_url,
            phone: p.phone,
            is_primary: idx === 0,
            order_index: idx,
          }));
          await supabase.from("lead_contacts").insert(contactRows as never);
        }
        if (row.links.length > 0) {
          await supabase.from("lead_links").insert(
            row.links.map((url, idx) => ({ lead_id: leadId, url, label: null, order_index: idx })) as never,
          );
        }
        if (row.followups.length > 0) {
          if (replace) await supabase.from("lead_followups").delete().eq("lead_id", leadId);
          await supabase.from("lead_followups").insert(
            row.followups.map((f) => ({
              lead_id: leadId,
              sequence_number: f.sequence_number,
              scheduled_date: f.scheduled_date,
              status: f.status,
              notes: f.notes,
            })) as never,
          );
        }
        if (row.tags.length > 0) {
          const ids = await Promise.all(row.tags.map(ensureTag));
          if (replace) await supabase.from("lead_tags").delete().eq("lead_id", leadId);
          await supabase.from("lead_tags").insert(ids.map((tag_id) => ({ lead_id: leadId, tag_id })) as never);
        }
      };

      const mergePayload = (incoming: Record<string, unknown>, current: Record<string, unknown>) => {
        const patch: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(incoming)) {
          if (v === null || v === undefined || v === "") continue;
          const cur = current[k];
          if (cur === null || cur === undefined || cur === "" || cur === false) patch[k] = v;
        }
        return patch;
      };

      for (let start = 0; start < queue.length; start += CHUNK) {
        const chunk = queue.slice(start, start + CHUNK);
        const inserts = chunk.filter((c) => !c.dup.isDuplicate);
        const updates = chunk.filter((c) => c.dup.isDuplicate);

        if (inserts.length > 0) {
          const payloads = inserts.map((c) => c.row.lead);
          const { data, error } = await supabase.from("leads").insert(payloads as never).select("id");
          if (!error && data && data.length === inserts.length) {
            for (let k = 0; k < inserts.length; k++) {
              const entry = inserts[k]!;
              const leadId = (data[k] as any)["id"] as string;
              try {
                await writeChildren(leadId, entry.row, false);
                out.push({ row: entry.index + 2, status: "imported" });
              } catch (e: any) {
                out.push({ row: entry.index + 2, status: "failed", error: e?.message ?? "Could not save details" });
              }
            }
          } else {
            for (const entry of inserts) {
              try {
                const { data: one, error: err } = await supabase
                  .from("leads")
                  .insert(entry.row.lead as never)
                  .select("id")
                  .single();
                if (err) throw err;
                await writeChildren((one as any).id, entry.row, false);
                out.push({ row: entry.index + 2, status: "imported" });
              } catch (e: any) {
                out.push({ row: entry.index + 2, status: "failed", error: e?.message ?? "Unknown error" });
              }
            }
          }
        }

        for (const entry of updates) {
          const current = entry.dup.existing as Record<string, unknown>;
          const leadId = current.id as string;
          try {
            const patch = dupAction === "merge" ? mergePayload(entry.row.lead, current) : entry.row.lead;
            if (Object.keys(patch).length > 0) {
              const { error } = await supabase.from("leads").update(patch as never).eq("id", leadId);
              if (error) throw error;
            }
            await writeChildren(leadId, entry.row, dupAction === "update");
            out.push({ row: entry.index + 2, status: "updated" });
          } catch (e: any) {
            out.push({ row: entry.index + 2, status: "failed", error: e?.message ?? "Unknown error" });
          }
        }

        setProgress(Math.min(queue.length, start + chunk.length));
      }

      out.sort((a, b) => a.row - b.row);
      setResults(out);
      setStep(5);
      await qc.invalidateQueries({ queryKey: ["leads"] });
    } finally {
      setImporting(false);
    }
  };

  const downloadFailedRows = () => {
    if (!results) return;
    const failed = results.filter((r) => r.status === "failed");
    const rows: (string | number | null)[][] = [
      ["_row", "_error", ...headers],
      ...failed.map((f) => {
        const source = dataRows[f.row - 2] ?? [];
        return [f.row, (f as any).error as string, ...headers.map((_, i) => source[i] ?? "")];
      }),
    ];
    downloadCsv("failed_rows.csv", rows);
  };

  const visibleHeaderIndices = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) => {
      if (onlyUnmatched && (mapping[i] ?? "ignore") !== "ignore") return false;
      if (!search.trim()) return true;
      return normalizeHeader(h).includes(normalizeHeader(search));
    });

  return (
    <Card title="Import leads">
      <div className="mb-4 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded-full border px-2 py-0.5",
                step === i + 1 ? "border-foreground text-foreground" : "border-border",
              )}
            >
              {i + 1}. {label}
            </span>
            {i < STEP_LABELS.length - 1 && <span>&gt;</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-3">
          <p className="label-text">
            Upload a CSV or Excel file (.csv, .xlsx, .xls). Column names do not have to match: the app matches them for
            you and you can correct anything it gets wrong.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls,.xlsm,text/csv"
            className="text-[13px]"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void loadFile(f);
            }}
          />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="label-text">
            {fileName}: {headers.length} columns, {dataRows.length} rows.
          </p>

          {sheetNames.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="label-text">Sheet tab</span>
              <Select
                value={sheetName}
                onValueChange={(v) => {
                  if (file) void loadFile(file, v);
                }}
              >
                <SelectTrigger className="h-8 w-[220px] text-[13px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sheetNames.map((n) => (
                    <SelectItem key={n} value={n}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Search columns"
              className="h-8 w-[220px] text-[13px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} />
              Only show unmatched
            </label>
            <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <input type="checkbox" checked={keepLeftovers} onChange={(e) => setKeepLeftovers(e.target.checked)} />
              Keep unmapped columns in additional notes
            </label>
          </div>

          {duplicateFieldKeys.size > 0 && (
            <div className="rounded-md border border-border bg-subtle p-2 text-[12px] text-negative">
              The same field is used more than once:{" "}
              {[...duplicateFieldKeys].map((k) => FIELD_BY_KEY.get(k)?.label ?? k).join(", ")}. Values will be joined
              together unless you change one of them.
            </div>
          )}

          {!Object.values(mapping).includes("company_name") && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-subtle p-2 text-[12px]">
              <span>No company name column found. Use this column as the lead name:</span>
              <Select value={nameFallback || "none"} onValueChange={(v) => setNameFallback(v === "none" ? "" : v)}>
                <SelectTrigger className="h-8 w-[220px] text-[13px]">
                  <SelectValue placeholder="First email address" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">First email address</SelectItem>
                  {headers.map((h, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                  <th className="px-2 py-1 font-medium">Column</th>
                  <th className="px-2 py-1 font-medium">Sample</th>
                  <th className="px-2 py-1 font-medium">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {visibleHeaderIndices.map(({ h, i }) => {
                  const sample = dataRows.find((r) => (r[i] ?? "").trim())?.[i] ?? "";
                  const conf = confidence[i] ?? "none";
                  return (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span>{h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`}</span>
                          {conf === "likely" && <Pill tone="warning">check</Pill>}
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-1.5 text-muted-foreground">{sample}</td>
                      <td className="px-2 py-1.5">
                        <Select
                          value={mapping[i] ?? "ignore"}
                          onValueChange={(v) => {
                            setMapping((m) => ({ ...m, [i]: v }));
                            setConfidence((c) => ({ ...c, [i]: v === "ignore" ? "none" : "exact" }));
                          }}
                        >
                          <SelectTrigger className="h-8 w-[260px] text-[13px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[320px]">
                            <SelectItem value="ignore">Ignore</SelectItem>
                            {FIELD_GROUPS.map((g) => (
                              <SelectGroup key={g}>
                                <SelectLabel>{g}</SelectLabel>
                                {LEAD_FIELD_DEFS.filter((f) => f.group === g).map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={reset}>
              Start over
            </Button>
            <Button size="sm" onClick={() => setStep(3)}>
              Next: Preview
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-subtle p-2 text-[13px]">
            {existing.isLoading ? (
              <span>Checking for duplicates...</span>
            ) : (
              <span>
                {dupCount > 0 ? (
                  <>
                    <span className="font-medium">{dupCount}</span> of {built.length} rows match an existing lead.
                  </>
                ) : (
                  <>No duplicates detected against existing leads.</>
                )}
                {missingCompany > 0 && <> {missingCompany} row(s) still have no lead name and will fail.</>}
                {warningCount > 0 && <> {warningCount} row(s) have warnings.</>}
              </span>
            )}
          </div>

          {dupCount > 0 && (
            <RadioGroup
              value={dupAction}
              onValueChange={(v) => setDupAction(v as "skip" | "update" | "merge")}
              className="flex flex-wrap gap-6"
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value="skip" id="dup-skip" />
                <Label htmlFor="dup-skip" className="text-[13px]">Skip duplicates</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="merge" id="dup-merge" />
                <Label htmlFor="dup-merge" className="text-[13px]">Merge (fill empty fields only)</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="update" id="dup-update" />
                <Label htmlFor="dup-update" className="text-[13px]">Overwrite duplicates</Label>
              </div>
            </RadioGroup>
          )}

          <p className="label-text">Preview of the first 10 rows as they will be saved:</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1 font-medium">#</th>
                  <th className="px-2 py-1 font-medium">Lead</th>
                  <th className="px-2 py-1 font-medium">People</th>
                  <th className="px-2 py-1 font-medium">Outreach</th>
                  <th className="px-2 py-1 font-medium">Follow-ups</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {built.slice(0, 10).map((b, i) => {
                  const marks: string[] = [];
                  if (b.lead["email_sent"]) marks.push("email sent");
                  if (b.lead["email_viewed"]) marks.push("viewed");
                  if (b.lead["email_replied"]) marks.push(`replied${b.lead["reply_sentiment"] ? ` (${b.lead["reply_sentiment"]})` : ""}`);
                  if (b.lead["loom_sent"]) marks.push("loom sent");
                  if (b.lead["loom_watched"]) marks.push("loom watched");
                  if (b.lead["linkedin_sent"]) marks.push("linkedin");
                  if (b.lead["instagram_sent"]) marks.push("instagram");
                  if (b.lead["meeting_booked"]) marks.push("meeting booked");
                  return (
                    <tr key={i} className="border-b border-border align-top">
                      <td className="px-2 py-1">{i + 2}</td>
                      <td className="px-2 py-1">
                        {(b.lead["company_name"] as string) || <span className="text-negative">No name</span>}
                        {b.warnings.length > 0 && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{b.warnings.join("; ")}</div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {b.people.length === 0
                          ? "-"
                          : b.people.map((p) => p.person_name || p.email || p.linkedin_url).join(", ")}
                      </td>
                      <td className="px-2 py-1">{marks.length > 0 ? marks.join(", ") : "-"}</td>
                      <td className="px-2 py-1">{b.followups.length || "-"}</td>
                      <td className="px-2 py-1">
                        {dupMap[i]?.isDuplicate ? <Pill tone="warning">Duplicate</Pill> : <Pill tone="positive">New</Pill>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button size="sm" onClick={() => setStep(4)}>
              Next: Confirm
            </Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px]">
            Ready to import <span className="font-medium">{built.length}</span> rows from{" "}
            <span className="font-medium">{fileName}</span>.
            {dupCount > 0 && (
              <>
                {" "}
                {dupCount} duplicate row(s) will be{" "}
                {dupAction === "skip" ? "skipped" : dupAction === "merge" ? "merged into the existing lead" : "overwritten"}.
              </>
            )}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="Name this mapping to reuse it"
              className="h-8 w-[240px] text-[13px]"
              value={mappingName}
              onChange={(e) => setMappingName(e.target.value)}
            />
            <Button variant="outline" size="sm" onClick={() => void saveMapping()}>
              Save mapping
            </Button>
          </div>
          {importing && (
            <div className="text-[12px] text-muted-foreground">
              Importing {progress} of {built.length} rows...
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(3)} disabled={importing}>
              Back
            </Button>
            <Button size="sm" onClick={() => void runImport()} disabled={importing}>
              {importing ? "Importing..." : "Confirm and import"}
            </Button>
          </div>
        </div>
      )}

      {step === 5 && results && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <SummaryPill label="Imported" count={results.filter((r) => r.status === "imported").length} tone="positive" />
            <SummaryPill label="Updated" count={results.filter((r) => r.status === "updated").length} tone="info" />
            <SummaryPill label="Skipped" count={results.filter((r) => r.status === "skipped").length} tone="neutral" />
            <SummaryPill label="Failed" count={results.filter((r) => r.status === "failed").length} tone="negative" />
          </div>
          {results.some((r) => r.status === "failed") && (
            <>
              <div className="max-h-[260px] overflow-auto">
                <table className="w-full min-w-[400px] border-collapse text-[12px]">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-1 font-medium">Row</th>
                      <th className="px-2 py-1 font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results
                      .filter((r): r is Extract<RowResult, { status: "failed" }> => r.status === "failed")
                      .map((r) => (
                        <tr key={r.row} className="border-b border-border">
                          <td className="px-2 py-1">{r.row}</td>
                          <td className="px-2 py-1 text-negative">{r.error}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <Button variant="outline" size="sm" className="w-fit" onClick={downloadFailedRows}>
                Download failed rows (CSV)
              </Button>
            </>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={reset}>
              Import another file
            </Button>
            <Button variant="outline" size="sm" onClick={() => void saveMapping()}>
              Save this mapping
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryPill({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "positive" | "info" | "neutral" | "negative";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "info"
          ? "text-info"
          : "text-muted-foreground";
  return (
    <div className="rounded-md border border-border bg-subtle p-2 text-center">
      <div className={cn("text-[18px] font-semibold", toneClass)}>{count}</div>
      <div className="label-text">{label}</div>
    </div>
  );
}
