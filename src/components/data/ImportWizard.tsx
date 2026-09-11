import { useMemo, useRef, useState } from "react";
import { Card, EmptyState, Pill } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { parseCsv } from "@/components/leads/csv";
import { LEAD_FIELD_DEFS, autoMatchField, type LeadFieldKey } from "@/components/data/importFields";
import { useCountries, useStages, useChannels, useSenderAccounts, useTags } from "@/hooks/useLookups";
import { cn } from "@/lib/utils";

type Mapping = Record<number, LeadFieldKey | "ignore">;

type MappedRow = Partial<Record<LeadFieldKey, string>>;

type DupInfo = { isDuplicate: boolean; existingLeadId?: string };

type RowResult =
  | { row: number; status: "imported" }
  | { row: number; status: "updated" }
  | { row: number; status: "skipped" }
  | { row: number; status: "failed"; error: string };

const STEP_LABELS = ["Upload", "Map columns", "Preview", "Confirm", "Result"];

function normalizeName(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function ImportWizard() {
  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [dupAction, setDupAction] = useState<"skip" | "update">("skip");
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: countries } = useCountries();
  const { data: stages } = useStages("lead");
  const { data: channels } = useChannels();
  const { data: senderAccounts } = useSenderAccounts();
  const { data: tags } = useTags();

  const onFile = async (file: File) => {
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length === 0) return;
    const [head, ...rest] = rows;
    if (!head) return;
    setHeaders(head);
    setDataRows(rest);
    setFileName(file.name);
    const initial: Mapping = {};
    head.forEach((h, i) => {
      initial[i] = autoMatchField(h);
    });
    setMapping(initial);
    setStep(2);
  };

  const mappedRows: MappedRow[] = useMemo(() => {
    return dataRows.map((row) => {
      const mapped: MappedRow = {};
      headers.forEach((_, i) => {
        const field = mapping[i];
        if (field && field !== "ignore") {
          mapped[field] = (row[i] ?? "").trim();
        }
      });
      return mapped;
    });
  }, [dataRows, headers, mapping]);

  const { data: existingLeads } = useExistingLeads(step >= 3);

  const dupMap: DupInfo[] = useMemo(() => {
    if (!existingLeads) return mappedRows.map(() => ({ isDuplicate: false }));
    return mappedRows.map((r): DupInfo => {
      const name = r.company_name ? normalizeName(r.company_name) : "";
      if (!name) return { isDuplicate: false };
      const email = (r.person_1_email || "").trim().toLowerCase();
      const match = existingLeads.find((l) => {
        if (normalizeName(l.company_name) !== name) return false;
        if (email) return l.emails.includes(email);
        return true;
      });
      return match ? { isDuplicate: true, existingLeadId: match.id } : { isDuplicate: false };
    });
  }, [mappedRows, existingLeads]);

  const dupCount = dupMap.filter((d) => d.isDuplicate).length;

  const reset = () => {
    setStep(1);
    setFileName("");
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setResults(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const runImport = async () => {
    setImporting(true);
    const out: RowResult[] = [];
    try {
      const countryMap = new Map((countries ?? []).map((c: any) => [normalizeName(c.name), c.id]));
      const stageMap = new Map((stages ?? []).map((s: any) => [normalizeName(s.name), s.id]));
      const channelMap = new Map((channels ?? []).map((c: any) => [normalizeName(c.name), c.id]));
      const senderMap = new Map((senderAccounts ?? []).map((s: any) => [normalizeName(s.label), s.id]));
      const tagMap = new Map((tags ?? []).map((t: any) => [normalizeName(t.name), t.id]));

      const ensureTag = async (name: string) => {
        const norm = normalizeName(name);
        if (tagMap.has(norm)) return tagMap.get(norm) as string;
        const { data, error } = await supabase.from("tags").insert({ name: name.trim() } as never).select("id,name").single();
        if (error) throw error;
        tagMap.set(norm, (data as any).id);
        return (data as any).id as string;
      };

      for (let i = 0; i < mappedRows.length; i++) {
        const r = mappedRows[i];
        const rowNum = i + 2;
        try {
          if (!r.company_name) {
            out.push({ row: rowNum, status: "failed", error: "Missing company_name" });
            continue;
          }
          const dup = dupMap[i];
          if (dup.isDuplicate && dupAction === "skip") {
            out.push({ row: rowNum, status: "skipped" });
            continue;
          }

          const leadPayload: Record<string, unknown> = {
            company_name: r.company_name,
            primary_contact: r.primary_contact || null,
            country_id: r.country ? countryMap.get(normalizeName(r.country)) ?? null : null,
            stage_id: r.stage ? stageMap.get(normalizeName(r.stage)) ?? null : null,
            channel_id: r.channel ? channelMap.get(normalizeName(r.channel)) ?? null : null,
            sender_account_id: r.sender_account ? senderMap.get(normalizeName(r.sender_account)) ?? null : null,
            date_added: r.date_added || null,
            website_url: r.website_url || null,
            company_linkedin_url: r.company_linkedin_url || null,
            instagram_url: r.instagram_url || null,
            youtube_url: r.youtube_url || null,
            research_notes: r.research_notes || null,
            additional_notes: r.additional_notes || null,
            next_followup_date: r.next_followup_date || null,
          };

          let leadId: string;
          if (dup.isDuplicate && dupAction === "update" && dup.existingLeadId) {
            leadId = dup.existingLeadId;
            const { error } = await supabase.from("leads").update(leadPayload as never).eq("id", leadId);
            if (error) throw error;
            await supabase.from("lead_contacts").delete().eq("lead_id", leadId);
          } else {
            const { data, error } = await supabase.from("leads").insert(leadPayload as never).select("id").single();
            if (error) throw error;
            leadId = (data as any).id;
          }

          const contactRows: Record<string, unknown>[] = [];
          if (r.person_1_name || r.person_1_email || r.person_1_linkedin) {
            contactRows.push({
              lead_id: leadId,
              person_name: r.person_1_name || null,
              email: r.person_1_email || null,
              linkedin_url: r.person_1_linkedin || null,
              is_primary: true,
              order_index: 0,
            });
          }
          if (r.person_2_name || r.person_2_email || r.person_2_linkedin) {
            contactRows.push({
              lead_id: leadId,
              person_name: r.person_2_name || null,
              email: r.person_2_email || null,
              linkedin_url: r.person_2_linkedin || null,
              is_primary: false,
              order_index: 1,
            });
          }
          if (contactRows.length > 0) {
            const { error } = await supabase.from("lead_contacts").insert(contactRows as never);
            if (error) throw error;
          }

          if (r.tags) {
            const tagNames = r.tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean);
            if (tagNames.length > 0) {
              await supabase.from("lead_tags").delete().eq("lead_id", leadId);
              const tagIds = await Promise.all(tagNames.map(ensureTag));
              const tagRows = tagIds.map((tag_id) => ({ lead_id: leadId, tag_id }));
              const { error } = await supabase.from("lead_tags").insert(tagRows as never);
              if (error) throw error;
            }
          }

          out.push({ row: rowNum, status: dup.isDuplicate ? "updated" : "imported" });
        } catch (e: any) {
          out.push({ row: rowNum, status: "failed", error: e?.message ?? "Unknown error" });
        }
      }
      setResults(out);
      setStep(5);
    } finally {
      setImporting(false);
    }
  };

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
          <p className="label-text">Upload a CSV file. Use the template if unsure of the format.</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="text-[13px]"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <p className="label-text">{fileName}: {headers.length} columns, {dataRows.length} rows. Map each column to a lead field.</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] text-muted-foreground">
                  <th className="px-2 py-1 font-medium">CSV column</th>
                  <th className="px-2 py-1 font-medium">Maps to</th>
                </tr>
              </thead>
              <tbody>
                {headers.map((h, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-2 py-1.5">{h || `Column ${i + 1}`}</td>
                    <td className="px-2 py-1.5">
                      <Select
                        value={mapping[i] ?? "ignore"}
                        onValueChange={(v) => setMapping((m) => ({ ...m, [i]: v as LeadFieldKey | "ignore" }))}
                      >
                        <SelectTrigger className="h-8 w-[220px] text-[13px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ignore">Ignore</SelectItem>
                          {LEAD_FIELD_DEFS.map((f) => (
                            <SelectItem key={f.key} value={f.key}>
                              {f.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={reset}>Start over</Button>
            <Button size="sm" onClick={() => setStep(3)}>Next: Preview</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="flex flex-col gap-3">
          <div className="rounded-md border border-border bg-subtle p-2 text-[13px]">
            {dupCount > 0 ? (
              <span>
                <span className="font-medium">{dupCount}</span> of {mappedRows.length} rows match an existing lead
                (company name{`${mappedRows.some((r) => r.person_1_email) ? " and/or email" : ""}`}).
              </span>
            ) : (
              <span>No duplicates detected against existing leads.</span>
            )}
          </div>
          {dupCount > 0 && (
            <RadioGroup value={dupAction} onValueChange={(v) => setDupAction(v as "skip" | "update")} className="flex gap-6">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="skip" id="dup-skip" />
                <Label htmlFor="dup-skip" className="text-[13px]">Skip duplicates</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="update" id="dup-update" />
                <Label htmlFor="dup-update" className="text-[13px]">Update duplicates</Label>
              </div>
            </RadioGroup>
          )}
          <p className="label-text">Preview of the first 10 mapped rows:</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1 font-medium">#</th>
                  <th className="px-2 py-1 font-medium">Company</th>
                  <th className="px-2 py-1 font-medium">Contact</th>
                  <th className="px-2 py-1 font-medium">Email</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {mappedRows.slice(0, 10).map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-2 py-1">{i + 2}</td>
                    <td className="px-2 py-1">{r.company_name || "-"}</td>
                    <td className="px-2 py-1">{r.primary_contact || r.person_1_name || "-"}</td>
                    <td className="px-2 py-1">{r.person_1_email || "-"}</td>
                    <td className="px-2 py-1">
                      {dupMap[i]?.isDuplicate ? <Pill tone="warning">Duplicate</Pill> : <Pill tone="positive">New</Pill>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(2)}>Back</Button>
            <Button size="sm" onClick={() => setStep(4)}>Next: Confirm</Button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="flex flex-col gap-3">
          <p className="text-[13px]">
            Ready to import <span className="font-medium">{mappedRows.length}</span> rows from{" "}
            <span className="font-medium">{fileName}</span>.
            {dupCount > 0 && (
              <>
                {" "}
                {dupAction === "skip" ? (
                  <span>{dupCount} duplicate row(s) will be skipped.</span>
                ) : (
                  <span>{dupCount} duplicate row(s) will be updated.</span>
                )}
              </>
            )}
          </p>
          <p className="label-text">Nothing has been written yet. Confirm to start the import.</p>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(3)} disabled={importing}>Back</Button>
            <Button size="sm" onClick={runImport} disabled={importing}>
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
            <div className="overflow-x-auto">
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
          )}
          <div>
            <Button size="sm" onClick={reset}>Import another file</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SummaryPill({ label, count, tone }: { label: string; count: number; tone: "positive" | "info" | "neutral" | "negative" }) {
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

function useExistingLeads(enabled: boolean) {
  const [data, setData] = useState<{ id: string; company_name: string; emails: string[] }[] | null>(null);
  const loadedRef = useRef(false);
  if (enabled && !loadedRef.current) {
    loadedRef.current = true;
    void (async () => {
      const { data: leads } = await supabase.from("leads").select("id,company_name");
      const { data: contacts } = await supabase.from("lead_contacts").select("lead_id,email");
      const emailsByLead = new Map<string, string[]>();
      (contacts ?? []).forEach((c: any) => {
        if (!c.email) return;
        const arr = emailsByLead.get(c.lead_id) ?? [];
        arr.push(String(c.email).toLowerCase());
        emailsByLead.set(c.lead_id, arr);
      });
      setData((leads ?? []).map((l: any) => ({ id: l.id, company_name: l.company_name, emails: emailsByLead.get(l.id) ?? [] })));
    })();
  }
  return { data };
}
