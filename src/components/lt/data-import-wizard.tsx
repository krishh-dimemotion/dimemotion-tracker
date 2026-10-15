// "Import leads" wizard on /lt/data. Ported from the live lt.data chunk.
import { useEffect, useMemo, useRef, useState } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, FileSpreadsheet, Globe, LoaderCircle, Play, Sparkles, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useChannels, useCountries, useSenderAccounts, useStages, useTags } from "@/hooks/useLookups";
import { reportLovableError } from "@/lib/lovable-error-reporting";
// Shared live ports (created in parallel by another agent).
import { Card, Pill, downloadCsv } from "@/components/live/kit";
import { useAuth } from "@/lib/live/auth";
import {
  FIELD_BY_KEY,
  analyzeSheet,
  convertRow,
  headerSignature,
  isMultiValueField,
  matchHeader,
  normalizeHeader,
  normalizeName,
  type Confidence,
  type ConvertedRow,
  type Lookups,
  type SheetAnalysis,
} from "./data-fields";
import { ALL_SHEETS, readSpreadsheet } from "./data-read-sheet";
import { CompanyNameSourcePicker, FieldPicker, ResultTile, SaveTemplateDialog, SmartAnalysisDialog, type WorkspaceAdditions } from "./data-dialogs";

import { aiMapColumns, fetchGoogleSheetCsv } from "@/lib/live/import.functions";

function reportError(info: { page: string; errorTitle: string; errorMessage: string; errorStack?: string; category: string }) {
  reportLovableError(new Error(info.errorMessage), info);
}

/** Section title with a help hint (live app-shell export). TODO: help popover for `section`. */
function SectionTitle({ children }: { children: React.ReactNode; section: string }) {
  return <span className="inline-flex items-center gap-1">{children}</span>;
}

const STEPS = ["Upload", "Map columns", "Preview", "Confirm", "Result"];
const BATCH = 25;
const SESSION_KEY = "lead_tracker_active_import_session";
const STAGE_COLORS = ["#6366f1", "#ec4899", "#8b5cf6", "#14b8a6", "#f59e0b", "#3b82f6", "#10b981", "#888888"];

type DupAction = "skip" | "merge" | "update" | "add_new";
type DupInfo = { isDuplicate: boolean; isIntraSheetDuplicate?: boolean; duplicateReason?: string; existing?: Record<string, any> };
type QueueItem = { index: number; row: ConvertedRow; dup: DupInfo };
type RowResult = { row: number; status: "imported" | "updated" | "skipped" | "failed"; error?: string };
type ImportSession = {
  fileName: string;
  totalRows: number;
  processedCount: number;
  insertedLeadIds: string[];
  remainingQueue: QueueItem[];
  dupAction: DupAction;
  timestamp: number;
};
type AnalysisError = { title: string; category: string; details: string };

function classifyAiError(message: string) {
  const r = message.toLowerCase();
  let category = "general";
  let title = "Analysis Notice";
  if (r.includes("429") || r.includes("rate limit") || r.includes("quota") || r.includes("too many requests") || r.includes("overused")) {
    category = "rate_limit";
    title = "The AI is being overused / Rate limit reached";
  } else if (r.includes("500") || r.includes("502") || r.includes("503") || r.includes("system") || r.includes("down")) {
    category = "system_error";
    title = "System is down or experiencing an error";
  }
  return { category, title };
}

function domainOf(raw: string) {
  try {
    const u = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return (
      String(raw)
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .replace(/^www\./, "")
        .split("/")[0] ?? ""
    );
  }
}

/** Fill only empty fields on the existing lead. */
function mergeEmpty(incoming: Record<string, unknown>, existing: Record<string, any>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(incoming)) {
    if (v == null || v === "") continue;
    const cur = existing[k];
    if (cur == null || cur === "" || cur === false) out[k] = v;
  }
  return out;
}

export function ImportWizard() {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheetName, setSheetName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, string>>({});
  const [confidence, setConfidence] = useState<Record<number, Confidence>>({});
  const [keepLeftovers, setKeepLeftovers] = useState(true);
  const [nameFallback, setNameFallback] = useState("__first_email__");
  const [columnSearch, setColumnSearch] = useState("");
  const [onlyUnmatched, setOnlyUnmatched] = useState(false);
  const [dupAction, setDupAction] = useState<DupAction>("skip");
  const [importing, setImporting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [mappingName, setMappingName] = useState("");
  const [sheetUrl, setSheetUrl] = useState("");
  const [fetchingSheet, setFetchingSheet] = useState(false);
  const [, setAiRunning] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [readingName, setReadingName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [analysisError, setAnalysisError] = useState<AnalysisError | null>(null);
  const [showErrorDetails, setShowErrorDetails] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [, setAiStats] = useState<{ countMatched: number; durationMs?: number; modelUsed?: string } | null>(null);
  const [interrupted, setInterrupted] = useState<ImportSession | null>(null);
  const insertedIds = useRef<string[]>([]);
  const cancelRef = useRef(false);

  const inProgress = !!(importing || (step >= 2 && step < 5) || ((file || rows.length > 0) && step < 5 && !results));
  const blocker = useBlocker({ shouldBlockFn: () => inProgress, withResolver: true, enableBeforeUnload: () => inProgress });

  useEffect(() => {
    if (!inProgress) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue =
        "Your import is currently in progress. If you leave or refresh, your mapping progress will be lost.";
      return e.returnValue;
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [inProgress]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.remainingQueue) && s.remainingQueue.length > 0) setInterrupted(s);
        else localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      localStorage.removeItem(SESSION_KEY);
    }
  }, []);

  const [createdLookups, setCreatedLookups] = useState<Lookups>({
    stages: new Map(),
    channels: new Map(),
    senders: new Map(),
    countries: new Map(),
  });
  const [analysis, setAnalysis] = useState<SheetAnalysis | null>(null);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [applyingAdditions, setApplyingAdditions] = useState(false);
  const [added, setAdded] = useState<WorkspaceAdditions>({ stages: [], channels: [], senders: [], countries: [] });
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const fetchSheet = useServerFn(fetchGoogleSheetCsv as never) as unknown as typeof fetchGoogleSheetCsv;
  const mapColumnsAi = useServerFn(aiMapColumns as never) as unknown as typeof aiMapColumns;
  const fileInput = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();
  // TODO: live reads workspace from auth (index chunk g); repo useAuth may lack it.
  const { workspace } = useAuth() as unknown as { workspace?: { id: string } | null };
  const uploadDisabled = !workspace?.id;

  const { data: countries } = useCountries(false);
  const { data: stages } = useStages("lead");
  const { data: channels } = useChannels();
  const { data: senders } = useSenderAccounts();
  const { data: tags } = useTags();

  const savedMappings = useQuery({
    queryKey: ["import_mappings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any).from("import_mappings").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const signature = useMemo(() => headerSignature(headers), [headers]);

  const loadFile = async (f: File | null, sheet?: string) => {
    if (!f) return;
    setAiUsed(false);
    setAiStats(null);
    setReadingFile(true);
    setReadingName(f.name);
    setAnalysisError(null);
    setShowErrorDetails(false);
    try {
      const sheetData = await readSpreadsheet(f, sheet);
      if (!sheetData.headers?.length && !sheetData.rows?.length) throw Error("No data rows or headers were found in this spreadsheet.");
      setFile(f);
      setFileName(f.name);
      setSheetNames(sheetData.sheetNames);
      setSheetName(sheetData.sheetName);
      setHeaders(sheetData.headers);
      setRows(sheetData.rows);
      setAiStats(null);
      setResults(null);
      const sig = headerSignature(sheetData.headers);
      const saved = (savedMappings.data ?? []).find((m) => m.signature === sig);
      if (saved) {
        setMapping(saved.mapping ?? {});
        setConfidence(Object.fromEntries(sheetData.headers.map((_, i) => [i, "exact"])) as Record<number, Confidence>);
        setKeepLeftovers(!!(saved.options?.keepLeftovers ?? true));
        setNameFallback(String(saved.options?.nameFallback || "__first_email__"));
        setMappingName(saved.name ?? "");
        setStep(2);
        toast.success(`Applied saved template: "${saved.name || "Saved mapping"}"`);
        return;
      }
      const m: Record<number, string> = {};
      const c: Record<number, Confidence> = {};
      const used = new Set<string>();
      sheetData.headers.forEach((h, i) => {
        let r = matchHeader(h);
        if (r.key !== "ignore" && used.has(r.key)) {
          if (r.key === "person_1_email" && !used.has("person_2_email")) r = { key: "person_2_email", confidence: "likely" };
          else if ((r.key === "person_1_email" || r.key === "person_2_email") && !used.has("person_3_email"))
            r = { key: "person_3_email", confidence: "likely" };
          else if ((r.key === "primary_contact" || r.key === "person_1_name") && !used.has("person_2_name"))
            r = { key: "person_2_name", confidence: "likely" };
          else if ((r.key === "primary_contact" || r.key === "person_1_name" || r.key === "person_2_name") && !used.has("person_3_name"))
            r = { key: "person_3_name", confidence: "likely" };
          else if (r.key === "person_1_title" && !used.has("person_2_title")) r = { key: "person_2_title", confidence: "likely" };
          else if (r.key === "person_1_phone" && !used.has("person_2_phone")) r = { key: "person_2_phone", confidence: "likely" };
          else if (r.key === "company_name") r = { key: "additional_notes", confidence: "likely" };
          else {
            m[i] = "ignore";
            c[i] = "none";
            return;
          }
        }
        if (r.key !== "ignore") used.add(r.key);
        m[i] = r.key;
        c[i] = r.confidence;
      });
      setMapping(m);
      setConfidence(c);
      setAiUsed(false);
      setMappingName("");
      setStep(2);
      setAnalysisOpen(true);
      setAnalysisError(null);
      setShowErrorDetails(false);
      setAiRunning(true);
      try {
        const res = await mapColumnsAi({
          data: { headers: sheetData.headers, sampleRows: sheetData.rows.slice(0, 8).map((r) => r.slice(0, sheetData.headers.length)) },
        });
        if (res.ok && res.countMatched > 0) {
          setAiUsed(true);
          setMapping(res.mappings);
          setConfidence(res.confidence);
          setAiStats({ countMatched: res.countMatched, durationMs: res.durationMs, modelUsed: res.modelUsed });
          setAnalysisOpen(false);
        } else if (res.ok) setAnalysisOpen(false);
        else {
          const msg = (res as { error?: string }).error || "Analysis service unavailable";
          const low = msg.toLowerCase();
          const { category, title } = classifyAiError(msg);
          setAnalysisError({ title, category, details: msg });
          reportError({ page: "/lt/data (Import Wizard)", errorTitle: title, errorMessage: msg, category: "ai_failure" });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const { category, title } = classifyAiError(msg);
        setAnalysisError({ title, category, details: msg });
        reportError({
          page: "/lt/data (Import Wizard)",
          errorTitle: title,
          errorMessage: msg,
          errorStack: err instanceof Error ? err.stack : undefined,
          category: "ai_failure",
        });
      } finally {
        setAiRunning(false);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Error reading spreadsheet file:", err);
      toast.error(`Could not read file: ${msg}`);
      setAnalysisError({ title: "Could not read spreadsheet", category: "read_error", details: msg });
      setAnalysisOpen(true);
      reportError({
        page: "/lt/data (Import Wizard)",
        errorTitle: "Could not read spreadsheet file",
        errorMessage: msg,
        errorStack: err instanceof Error ? err.stack : undefined,
        category: "system_error",
      });
    } finally {
      setReadingFile(false);
    }
  };

  const importGoogleSheet = async () => {
    if (uploadDisabled) {
      toast.error("Select a workspace first.");
      return;
    }
    const url = sheetUrl.trim();
    if (!url) {
      toast.error("Please enter a Google Sheet URL.");
      return;
    }
    setFetchingSheet(true);
    try {
      const res = await fetchSheet({ data: { url } });
      const f = new File([res.csvText], res.filename || "google_sheet.csv", { type: "text/csv" });
      await loadFile(f);
      toast.success("Google Sheet loaded successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not fetch Google Sheet");
    } finally {
      setFetchingSheet(false);
    }
  };

  const lookups: Lookups = useMemo(
    () => ({
      stages: new Map([...(stages ?? []).map((s: any) => [normalizeName(s.name), s.id] as [string, string]), ...createdLookups.stages.entries()]),
      channels: new Map([
        ...(channels ?? []).map((c: any) => [normalizeName(c.name), c.id] as [string, string]),
        ...createdLookups.channels.entries(),
      ]),
      senders: new Map([
        ...(senders ?? []).flatMap((s: any) => [
          [normalizeName(s.label), s.id] as [string, string],
          ...(s.identifier ? [[normalizeName(s.identifier), s.id] as [string, string]] : []),
        ]),
        ...createdLookups.senders.entries(),
      ]),
      countries: new Map([
        ...(countries ?? []).map((c: any) => [normalizeName(c.name), c.id] as [string, string]),
        ...createdLookups.countries.entries(),
      ]),
    }),
    [countries, stages, channels, senders, createdLookups],
  );

  const goToPreview = () => {
    const a = analyzeSheet(headers, rows, mapping, lookups);
    setAnalysis(a);
    if (a.hasNewItems) setAnalysisDialogOpen(true);
    else setStep(3);
  };

  const addToWorkspace = async (sel: WorkspaceAdditions) => {
    setApplyingAdditions(true);
    const st = new Map(createdLookups.stages);
    const ch = new Map(createdLookups.channels);
    const se = new Map(createdLookups.senders);
    const co = new Map(createdLookups.countries);
    const made: WorkspaceAdditions = { stages: [], channels: [], senders: [], countries: [] };
    const db = supabase as any;
    try {
      for (const name of sel.stages) {
        const order = (stages ?? []).reduce((m: number, s: any) => Math.max(m, s.order_index), -1) + made.stages.length;
        const color = STAGE_COLORS[Math.floor(Math.random() * STAGE_COLORS.length)];
        const { data, error } = await db
          .from("stages")
          .insert({ name, board: "lead", order_index: order + 1, color })
          .select("id, name")
          .single();
        if (!error && data) {
          st.set(normalizeName(data.name), data.id);
          made.stages.push(data.name);
        }
      }
      for (const name of sel.channels) {
        const { data, error } = await db.from("channels").insert({ name, kind: "other" }).select("id, name").single();
        if (!error && data) {
          ch.set(normalizeName(data.name), data.id);
          made.channels.push(data.name);
        }
      }
      const emailChannel = (channels ?? []).find((c: any) => c.kind === "email") ?? (channels ?? [])[0];
      for (const name of sel.senders) {
        const isEmail = name.includes("@");
        const { data, error } = await db
          .from("sender_accounts")
          .insert({ label: name, identifier: isEmail ? name.toLowerCase().trim() : null, channel_id: emailChannel?.id ?? null, status: "active" })
          .select("id, label, identifier")
          .single();
        if (!error && data) {
          se.set(normalizeName(data.label), data.id);
          if (data.identifier) se.set(normalizeName(data.identifier), data.id);
          made.senders.push(data.label);
        }
      }
      for (const name of sel.countries) {
        const { data, error } = await db.from("countries").insert({ name, is_active: true }).select("id, name").single();
        if (!error && data) {
          co.set(normalizeName(data.name), data.id);
          made.countries.push(data.name);
        }
      }
      setCreatedLookups({ stages: st, channels: ch, senders: se, countries: co });
      setAdded((p) => ({
        stages: [...p.stages, ...made.stages],
        channels: [...p.channels, ...made.channels],
        senders: [...p.senders, ...made.senders],
        countries: [...p.countries, ...made.countries],
      }));
      if (made.stages.length) qc.invalidateQueries({ queryKey: ["stages"] });
      if (made.channels.length) qc.invalidateQueries({ queryKey: ["channels"] });
      if (made.senders.length) qc.invalidateQueries({ queryKey: ["sender_accounts"] });
      if (made.countries.length) qc.invalidateQueries({ queryKey: ["countries"] });
      const n = made.stages.length + made.channels.length + made.senders.length + made.countries.length;
      if (n > 0) toast.success(`Created ${n} new item(s) in your workspace settings!`);
      setAnalysisDialogOpen(false);
      setStep(3);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create some items");
      setAnalysisDialogOpen(false);
      setStep(3);
    } finally {
      setApplyingAdditions(false);
    }
  };

  const converted = useMemo(
    () =>
      rows.map((row) => {
        const values: Record<string, string> = {};
        const leftovers: Record<string, string> = {};
        headers.forEach((h, i) => {
          const key = mapping[i] ?? "ignore";
          const v = (row[i] ?? "").trim();
          if (key === "ignore") {
            if (v) leftovers[h.replace(/\s+/g, " ").trim()] = v;
            return;
          }
          if (v) values[key] = values[key] ? `${values[key]}, ${v}` : v;
        });
        const r = convertRow(values, lookups, { leftovers, keepLeftovers });
        if (!Object.values(mapping).includes("company_name") && nameFallback !== "") {
          if (nameFallback === "__first_email__") {
            const email = r.people.find((p) => p.email)?.email;
            if (email) r.lead.company_name = email;
          } else {
            const v = (row[Number(nameFallback)] ?? "").trim();
            if (v) r.lead.company_name = v;
          }
        }
        if (!r.lead.company_name && r.lead.primary_contact) r.lead.company_name = r.lead.primary_contact;
        if (!r.lead.company_name) {
          const n = r.people.find((p) => p.person_name)?.person_name;
          if (n) r.lead.company_name = n;
        }
        if (!r.lead.company_name) {
          const email = r.people.find((p) => p.email)?.email;
          if (email) r.lead.company_name = email;
        }
        return r;
      }),
    [rows, headers, mapping, lookups, keepLeftovers, nameFallback],
  );
  const missingName = converted.filter((r) => !r.lead.company_name).length;

  const existing = useQuery({
    queryKey: ["import_existing_leads", workspace?.id],
    staleTime: 0,
    refetchOnMount: "always",
    enabled: step >= 2 || rows.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("id,company_name,website_url,instagram_url,company_linkedin_url,date_added");
      if (error) throw error;
      const { data: contacts } = await supabase.from("lead_contacts").select("lead_id,email,phone,linkedin_url,instagram_url");
      const emails = new Map<string, string[]>();
      const phones = new Map<string, string[]>();
      const igs = new Map<string, string[]>();
      const lis = new Map<string, string[]>();
      const push = (m: Map<string, string[]>, k: string, v: string) => {
        const a = m.get(k) ?? [];
        a.push(v);
        m.set(k, a);
      };
      (contacts ?? []).forEach((c: any) => {
        if (c.email) push(emails, c.lead_id, String(c.email).toLowerCase().trim());
        if (c.phone) {
          const d = String(c.phone).replace(/\D/g, "");
          if (d.length >= 7) push(phones, c.lead_id, d);
        }
        if (c.instagram_url) push(igs, c.lead_id, String(c.instagram_url).toLowerCase().trim());
        if (c.linkedin_url) push(lis, c.lead_id, String(c.linkedin_url).toLowerCase().trim());
      });
      return (data ?? []).map((l: any) => {
        const domain = l.website_url ? domainOf(l.website_url) : "";
        const instagrams = [...(igs.get(l.id) ?? [])];
        if (l.instagram_url) instagrams.push(String(l.instagram_url).toLowerCase().trim());
        const linkedins = [...(lis.get(l.id) ?? [])];
        if (l.company_linkedin_url) linkedins.push(String(l.company_linkedin_url).toLowerCase().trim());
        return { lead: l, domain, emails: emails.get(l.id) ?? [], phones: phones.get(l.id) ?? [], instagrams, linkedins };
      });
    },
  });

  const dupInfo: DupInfo[] = useMemo(() => {
    const db = existing.data;
    const seenEmails = new Set<string>();
    const seenDomains = new Set<string>();
    const seenNames = new Set<string>();
    const seenPhones = new Set<string>();
    const seenIgs = new Set<string>();
    const seenLis = new Set<string>();
    return converted.map((r) => {
      const name = typeof r.lead.company_name === "string" ? normalizeName(r.lead.company_name) : "";
      const emails = r.people.map((p) => p.email?.toLowerCase().trim()).filter(Boolean) as string[];
      const phones = r.people.map((p) => (p.phone ? String(p.phone).replace(/\D/g, "") : "")).filter((p) => p.length >= 7);
      const ig = (
        (typeof r.lead.instagram_url === "string" ? r.lead.instagram_url : "") ||
        r.people.map((p) => p.instagram_url).find(Boolean) ||
        ""
      )
        .toLowerCase()
        .trim();
      const li = (
        (typeof r.lead.company_linkedin_url === "string" ? r.lead.company_linkedin_url : "") ||
        r.people.map((p) => p.linkedin_url).find(Boolean) ||
        ""
      )
        .toLowerCase()
        .trim();
      let domain = "";
      const w = r.lead.website_url;
      if (typeof w === "string" && w.trim()) domain = domainOf(w.trim()).trim();
      let intra = false;
      let reason = "";
      if (emails.some((e) => seenEmails.has(e))) {
        intra = true;
        reason = "Same email appears multiple times in sheet";
      } else if (domain && seenDomains.has(domain)) {
        intra = true;
        reason = "Same website domain appears multiple times in sheet";
      } else if (phones.some((p) => seenPhones.has(p))) {
        intra = true;
        reason = "Same phone appears multiple times in sheet";
      } else if (ig && seenIgs.has(ig)) {
        intra = true;
        reason = "Same Instagram appears multiple times in sheet";
      } else if (li && seenLis.has(li)) {
        intra = true;
        reason = "Same LinkedIn appears multiple times in sheet";
      } else if (name && seenNames.has(name)) {
        intra = true;
        reason = "Same lead name appears multiple times in sheet";
      }
      emails.forEach((e) => seenEmails.add(e));
      if (domain) seenDomains.add(domain);
      phones.forEach((p) => seenPhones.add(p));
      if (ig) seenIgs.add(ig);
      if (li) seenLis.add(li);
      if (name) seenNames.add(name);
      if (!db) return { isDuplicate: false, isIntraSheetDuplicate: intra, duplicateReason: reason };
      const hit = db.find((x) => {
        if (emails.length > 0 && x.emails.some((e) => emails.includes(e))) return (reason = "Email already in database"), true;
        if (domain && x.domain && x.domain === domain) return (reason = "Website domain already in database"), true;
        if (phones.length > 0 && x.phones.some((p) => phones.includes(p))) return (reason = "Phone number already in database"), true;
        if (ig && x.instagrams.length > 0 && x.instagrams.some((e) => e.includes(ig) || ig.includes(e)))
          return (reason = "Instagram profile already in database"), true;
        if (li && x.linkedins.length > 0 && x.linkedins.some((e) => e.includes(li) || li.includes(e)))
          return (reason = "LinkedIn profile already in database"), true;
        if (name && normalizeName(x.lead.company_name ?? "") === name) return (reason = "Lead name already in database"), true;
        return false;
      });
      return hit
        ? { isDuplicate: true, isIntraSheetDuplicate: intra, duplicateReason: reason, existing: hit.lead }
        : { isDuplicate: false, isIntraSheetDuplicate: intra, duplicateReason: reason };
    });
  }, [converted, existing.data]);
  const dupCount = dupInfo.filter((d) => d.isDuplicate).length;
  const intraDupCount = dupInfo.filter((d) => d.isIntraSheetDuplicate).length;
  const warnRows = converted.filter((r) => r.warnings.length > 0).length;

  const duplicateFields = useMemo(() => {
    const counts = new Map<string, number>();
    const dups = new Set<string>();
    Object.values(mapping).forEach((k) => {
      if (isMultiValueField(k)) return;
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      if (n > 1) dups.add(k);
    });
    return dups;
  }, [mapping]);
  const hasEmailColumn = useMemo(() => Object.values(mapping).some((k) => k === "primary_contact" || k.endsWith("_email")), [mapping]);
  const usedFields = useMemo(() => new Set(Object.values(mapping).filter((k) => k !== "ignore")), [mapping]);

  const reset = () => {
    setStep(1);
    setFile(null);
    setFileName("");
    setSheetNames([]);
    setSheetName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setConfidence({});
    setResults(null);
    setProgress(0);
    setNameFallback("__first_email__");
    setColumnSearch("");
    setOnlyUnmatched(false);
    setSheetUrl("");
    setFetchingSheet(false);
    setAiRunning(false);
    setAiUsed(false);
    setAiStats(null);
    setCreatedLookups({ stages: new Map(), channels: new Map(), senders: new Map(), countries: new Map() });
    setAnalysis(null);
    setAnalysisDialogOpen(false);
    setAdded({ stages: [], channels: [], senders: [], countries: [] });
    setReadingFile(false);
    setReadingName("");
    setDragOver(false);
    if (fileInput.current) fileInput.current.value = "";
  };

  const saveMapping = async (nameArg?: string) => {
    setSavingTemplate(true);
    const name = (nameArg || mappingName).trim() || fileName || "Saved mapping";
    try {
      const found = (savedMappings.data ?? []).find((m) => m.signature === signature);
      const row = { name, signature, mapping, options: { keepLeftovers, nameFallback } };
      if (found) await (supabase as any).from("import_mappings").update(row).eq("id", found.id);
      else await (supabase as any).from("import_mappings").insert(row);
      await qc.invalidateQueries({ queryKey: ["import_mappings"] });
      setMappingName(name);
      toast.success(`Saved template: "${name}"`);
      setSaveTemplateOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save template");
    } finally {
      setSavingTemplate(false);
    }
  };

  const rollback = async (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    for (let i = 0; i < ids.length; i += 50) {
      const chunk = ids.slice(i, i + 50);
      try {
        await supabase.from("lead_contacts").delete().in("lead_id", chunk);
        await supabase.from("lead_links").delete().in("lead_id", chunk);
        await supabase.from("lead_followups").delete().in("lead_id", chunk);
        await supabase.from("lead_tags").delete().in("lead_id", chunk);
        await supabase.from("leads").delete().in("id", chunk);
      } catch (err) {
        console.error("Rollback batch error:", err);
      }
    }
    await qc.invalidateQueries({ queryKey: ["leads"] });
  };

  const cancelUpload = async () => {
    if (cancelling) return;
    setCancelling(true);
    cancelRef.current = true;
    try {
      const ids = [...insertedIds.current];
      if (ids.length > 0) await rollback(ids);
      localStorage.removeItem(SESSION_KEY);
      insertedIds.current = [];
      setProgress(0);
      setImporting(false);
      toast.info("Upload cancelled. All imported records have been removed.");
    } catch (err) {
      toast.error(`Cancellation failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setImporting(false);
    } finally {
      setCancelling(false);
    }
  };

  const stayOnPage = () => {
    blocker.reset?.();
  };
  const leavePage = async () => {
    if (importing) await cancelUpload();
    else reset();
    blocker.proceed?.();
  };
  const dismissInterrupted = () => {
    localStorage.removeItem(SESSION_KEY);
    setInterrupted(null);
    toast.success("Interrupted upload dismissed. Saved records remain in your workspace.");
  };
  const cancelInterrupted = async () => {
    if (!interrupted) return;
    setCancelling(true);
    try {
      await rollback(interrupted.insertedLeadIds);
      localStorage.removeItem(SESSION_KEY);
      setInterrupted(null);
      toast.info("Interrupted upload cancelled. All saved records from that upload were removed.");
    } catch (err) {
      toast.error(`Rollback failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setCancelling(false);
    }
  };

  /** Shared writer: lead_contacts, lead_links, lead_followups, lead_tags for one lead. */
  const makeDetailWriter = () => {
    const tagIds = new Map((tags ?? []).map((t: any) => [normalizeName(t.name), t.id] as [string, string]));
    const tagId = async (name: string) => {
      const n = normalizeName(name);
      const hit = tagIds.get(n);
      if (hit) return hit;
      const { data, error } = await (supabase as any).from("tags").insert({ name: name.trim() }).select("id").single();
      if (error) throw error;
      tagIds.set(n, data.id);
      return data.id as string;
    };
    return async (leadId: string, row: ConvertedRow, replace: boolean) => {
      const db = supabase as any;
      if (row.people.length > 0) {
        if (replace) await db.from("lead_contacts").delete().eq("lead_id", leadId);
        await db.from("lead_contacts").insert(
          row.people.map((p, i) => ({
            lead_id: leadId,
            person_name: p.person_name,
            job_title: p.job_title,
            email: p.email,
            linkedin_url: p.linkedin_url,
            instagram_url: p.instagram_url,
            phone: p.phone,
            is_primary: i === 0,
            order_index: i,
          })),
        );
      }
      if (row.links.length > 0)
        await db.from("lead_links").insert(row.links.map((url, i) => ({ lead_id: leadId, url, label: null, order_index: i })));
      if (row.followups.length > 0) {
        if (replace) await db.from("lead_followups").delete().eq("lead_id", leadId);
        await db.from("lead_followups").insert(
          row.followups.map((f) => ({
            lead_id: leadId,
            sequence_number: f.sequence_number,
            scheduled_date: f.scheduled_date,
            status: f.status,
            notes: f.notes,
          })),
        );
      }
      if (row.tags.length > 0) {
        const ids = await Promise.all(row.tags.map(tagId));
        if (replace) await db.from("lead_tags").delete().eq("lead_id", leadId);
        await db.from("lead_tags").insert(ids.map((tag_id) => ({ lead_id: leadId, tag_id })));
      }
    };
  };

  /** Processes the queue in batches of 25. Returns false if cancelled. */
  const runQueue = async (
    queue: QueueItem[],
    action: DupAction,
    out: RowResult[],
    onBatch: (processed: number, remaining: QueueItem[]) => void,
  ) => {
    const writeDetails = makeDetailWriter();
    const db = supabase as any;
    for (let start = 0; start < queue.length && !cancelRef.current; start += BATCH) {
      const batch = queue.slice(start, start + BATCH);
      const fresh = batch.filter((q) => !q.dup.isDuplicate || action === "add_new");
      const dups = batch.filter((q) => q.dup.isDuplicate && action !== "add_new");
      if (fresh.length > 0) {
        if (cancelRef.current) break;
        const { data, error } = await db
          .from("leads")
          .insert(fresh.map((q) => q.row.lead))
          .select("id");
        if (!error && data && data.length === fresh.length)
          for (let i = 0; i < fresh.length && !cancelRef.current; i++) {
            const q = fresh[i];
            const id = data[i].id;
            insertedIds.current.push(id);
            try {
              await writeDetails(id, q.row, false);
              out.push({ row: q.index + 2, status: "imported" });
            } catch (err: any) {
              out.push({ row: q.index + 2, status: "failed", error: err?.message ?? "Could not save details" });
            }
          }
        else
          for (const q of fresh) {
            if (cancelRef.current) break;
            try {
              const { data: one, error: e1 } = await db.from("leads").insert(q.row.lead).select("id").single();
              if (e1) throw e1;
              insertedIds.current.push(one.id);
              await writeDetails(one.id, q.row, false);
              out.push({ row: q.index + 2, status: "imported" });
            } catch (err: any) {
              out.push({ row: q.index + 2, status: "failed", error: err?.message ?? "Unknown error" });
            }
          }
      }
      for (const q of dups) {
        if (cancelRef.current) break;
        const ex = q.dup.existing!;
        try {
          const patch = action === "merge" ? mergeEmpty(q.row.lead, ex) : q.row.lead;
          if (Object.keys(patch).length > 0) {
            const { error } = await db.from("leads").update(patch).eq("id", ex.id);
            if (error) throw error;
          }
          await writeDetails(ex.id, q.row, action === "update");
          out.push({ row: q.index + 2, status: "updated" });
        } catch (err: any) {
          out.push({ row: q.index + 2, status: "failed", error: err?.message ?? "Unknown error" });
        }
      }
      if (cancelRef.current) break;
      onBatch(Math.min(queue.length, start + batch.length), queue.slice(start + batch.length));
    }
    return !cancelRef.current;
  };

  const resumeInterrupted = async () => {
    if (!interrupted || importing) return;
    const s = interrupted;
    setImporting(true);
    setCancelling(false);
    cancelRef.current = false;
    insertedIds.current = [...s.insertedLeadIds];
    const base = s.processedCount;
    setProgress(base);
    const out: RowResult[] = [];
    try {
      const done = await runQueue(s.remainingQueue, s.dupAction, out, (processed, remaining) => {
        const p = base + processed;
        setProgress(p);
        try {
          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              fileName: s.fileName,
              totalRows: s.totalRows,
              processedCount: p,
              insertedLeadIds: insertedIds.current,
              remainingQueue: remaining,
              dupAction: s.dupAction,
              timestamp: Date.now(),
            }),
          );
        } catch {
          /* ignore */
        }
      });
      if (!done) return;
      localStorage.removeItem(SESSION_KEY);
      setInterrupted(null);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      toast.success(`Resumed upload complete! Finished importing ${s.fileName}.`);
    } finally {
      setImporting(false);
    }
  };

  const confirmImport = async () => {
    setImporting(true);
    setCancelling(false);
    cancelRef.current = false;
    insertedIds.current = [];
    setProgress(0);
    const out: RowResult[] = [];
    try {
      const queue: QueueItem[] = [];
      for (let i = 0; i < converted.length; i++) {
        const r = converted[i];
        const d = dupInfo[i] ?? { isDuplicate: false };
        const rowNo = i + 2;
        if (!r.lead.company_name) {
          out.push({ row: rowNo, status: "failed", error: "No company name for this row" });
          continue;
        }
        if (d.isDuplicate && dupAction === "skip") {
          out.push({ row: rowNo, status: "skipped" });
          continue;
        }
        queue.push({ index: i, row: r, dup: d });
      }
      try {
        localStorage.setItem(
          SESSION_KEY,
          JSON.stringify({
            fileName,
            totalRows: queue.length,
            processedCount: 0,
            insertedLeadIds: [],
            remainingQueue: queue,
            dupAction,
            timestamp: Date.now(),
          }),
        );
      } catch {
        /* ignore */
      }
      const done = await runQueue(queue, dupAction, out, (processed, remaining) => {
        setProgress(processed);
        try {
          localStorage.setItem(
            SESSION_KEY,
            JSON.stringify({
              fileName,
              totalRows: queue.length,
              processedCount: processed,
              insertedLeadIds: insertedIds.current,
              remainingQueue: remaining,
              dupAction,
              timestamp: Date.now(),
            }),
          );
        } catch {
          /* ignore */
        }
      });
      if (!done) return;
      localStorage.removeItem(SESSION_KEY);
      out.sort((a, b) => a.row - b.row);
      setResults(out);
      setStep(5);
      await qc.invalidateQueries({ queryKey: ["leads"] });
      await qc.invalidateQueries({ queryKey: ["import_existing_leads"] });
      await qc.invalidateQueries({ queryKey: ["leads-board"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-counts"] });
      await qc.invalidateQueries({ queryKey: ["dashboard-active-leads"] });
      if (!(savedMappings.data ?? []).some((m) => m.signature === signature)) setSaveTemplateOpen(true);
    } finally {
      setImporting(false);
    }
  };

  const downloadFailedRows = () => {
    if (!results) return;
    const failed = results.filter((r) => r.status === "failed");
    downloadCsv("failed_rows.csv", [
      ["_row", "_error", ...headers],
      ...failed.map((f) => {
        const src = rows[f.row - 2] ?? [];
        return [f.row, f.error, ...headers.map((_, i) => src[i] ?? "")];
      }),
    ]);
  };

  const visibleColumns = headers
    .map((h, i) => ({ h, i }))
    .filter(({ h, i }) =>
      onlyUnmatched && (mapping[i] ?? "ignore") !== "ignore" ? false : !columnSearch.trim() || normalizeHeader(h).includes(normalizeHeader(columnSearch)),
    );

  const guardUpload = () => {
    toast.error("Select a workspace first.");
  };
  return (
    <Card title={<SectionTitle section="import">Import leads</SectionTitle>}>
      {interrupted && (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3.5 text-[13px]">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <TriangleAlert className="size-4 text-warning" />
            Previous upload was interrupted
          </div>
          <p className="text-muted-foreground text-[12.5px]">
            An upload for file <span className="font-semibold text-foreground">{interrupted.fileName}</span> was interrupted before completing.{" "}
            <span className="font-semibold text-foreground">{interrupted.insertedLeadIds.length}</span> records are saved in your workspace, and{" "}
            <span className="font-semibold text-foreground">{interrupted.remainingQueue.length}</span> rows remain.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button size="sm" onClick={() => void resumeInterrupted()} disabled={importing || cancelling}>
              <Play className="mr-1.5 size-3.5" /> Resume upload ({interrupted.remainingQueue.length} remaining)
            </Button>
            <Button variant="outline" size="sm" onClick={dismissInterrupted} disabled={importing || cancelling}>
              Keep saved records and dismiss
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => void cancelInterrupted()}
              disabled={importing || cancelling}
            >
              Cancel and delete saved records
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1">
            <span className={cn("rounded-full border px-2 py-0.5", step === i + 1 ? "border-foreground text-foreground" : "border-border")}>
              {i + 1}. {label}
            </span>
            {i < STEPS.length - 1 && <span>&gt;</span>}
          </div>
        ))}
      </div>

      {step === 1 && (
        <div className="flex flex-col gap-4">
          <p className="label-text">
            Bring your leads in from any spreadsheet or Google Sheet. Tracker matches column names and uses up to 8 sample rows to clarify
            ambiguous fields. The AI receives those headers and sample values only, not the full sheet; the app processes the full file for
            preview and import. Review warnings before confirming. Embedded images and file attachments are not imported automatically.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-2 rounded-lg border border-border/80 p-3">
              <div className="flex items-center gap-2 text-[13px] font-medium">
                <Upload className="size-4" /> Upload a file
              </div>
              <div className="label-text">CSV or Excel (.csv, .xlsx, .xls). Multi-sheet files are supported.</div>
              <input
                id="spreadsheet-file-input"
                ref={fileInput}
                type="file"
                accept=".csv,.tsv,.xlsx,.xls,.xlsm,text/csv"
                className="hidden"
                disabled={uploadDisabled || readingFile}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void loadFile(f);
                }}
              />
              {readingFile ? (
                <div className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-primary/50 bg-primary/5 px-3 py-6 text-center">
                  <LoaderCircle className="size-6 animate-spin text-primary" />
                  <span className="text-[13px] font-medium text-foreground">Uploading &amp; reading {readingName || "file"}...</span>
                  <span className="text-[12px] text-muted-foreground">Extracting spreadsheet columns and rows...</span>
                </div>
              ) : (
                <label
                  htmlFor="spreadsheet-file-input"
                  tabIndex={0}
                  onClick={(e) => {
                    if (uploadDisabled) {
                      e.preventDefault();
                      guardUpload();
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (uploadDisabled) {
                        guardUpload();
                        return;
                      }
                      fileInput.current?.click();
                    }
                  }}
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    if (uploadDisabled) {
                      guardUpload();
                      return;
                    }
                    const f = e.dataTransfer.files?.[0];
                    if (f) void loadFile(f);
                  }}
                  className={`flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border-2 border-dashed px-3 py-5 text-center transition-colors ${uploadDisabled ? "cursor-not-allowed border-border bg-muted/20 opacity-60" : dragOver ? "border-primary bg-primary/10" : "border-border hover:border-foreground/40 hover:bg-subtle"}`}
                >
                  <Upload className="size-5 text-muted-foreground" />
                  <span className="text-[13px] font-medium text-foreground">{fileName || "Choose a file"}</span>
                  <span className="text-[12px] text-muted-foreground">{fileName ? "Click to pick a different file" : "or drag and drop it here"}</span>
                </label>
              )}
            </div>
            <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/80 p-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[13px] font-medium">
                  <Globe className="size-4" /> Paste Google Sheet link
                </div>
                <div className="label-text">Paste the link of any Google Sheet to load its leads directly.</div>
              </div>
              <div className="flex flex-col gap-2">
                <Input
                  value={sheetUrl}
                  onChange={(e) => setSheetUrl(e.target.value)}
                  disabled={uploadDisabled || fetchingSheet}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && sheetUrl.trim() && !fetchingSheet && !uploadDisabled) {
                      e.preventDefault();
                      void importGoogleSheet();
                    }
                  }}
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  className="text-[12px]"
                />
                <Button size="sm" onClick={() => void importGoogleSheet()} disabled={uploadDisabled || fetchingSheet || !sheetUrl.trim()} className="w-fit">
                  {fetchingSheet ? (
                    <>
                      <LoaderCircle className="mr-1.5 size-3.5 animate-spin" /> Fetching sheet...
                    </>
                  ) : (
                    "Import from Google Sheet"
                  )}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Make sure link sharing in Google Sheets is set to "Anyone with the link can view".
                </span>
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            We flag values that need attention and preserve unsupported text in labeled notes when “Keep leftovers” is enabled. Review the
            preview before confirming; embedded files may need manual upload.
          </p>
        </div>
      )}

      {step === 2 && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="label-text">
              {fileName}: {headers.length} columns, {rows.length} rows
              {sheetNames.length > 1 && sheetName === ALL_SHEETS ? ` (combined from ${sheetNames.length - 1} sheets)` : ""}.
            </p>
          </div>
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="label-text">Sheet tab</span>
              <Select
                value={sheetName}
                onValueChange={(v) => {
                  if (file) void loadFile(file, v);
                }}
              >
                <SelectTrigger className="h-8 w-[240px] text-[13px]">
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
          <div
            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[12.5px] ${aiUsed ? "border-primary/20 bg-primary/5 text-foreground" : "border-border bg-muted/40 text-muted-foreground"}`}
          >
            <Sparkles className={`mt-0.5 size-4 shrink-0 ${aiUsed ? "text-primary" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className="font-medium">{aiUsed ? "AI mapping completed" : "Column matching completed"}</p>
              <p className="mt-0.5 leading-relaxed">
                {aiUsed
                  ? "Review the suggested fields before importing. AI suggestions may need adjustments."
                  : "Tracker matched columns using local rules. Review each field before importing."}
              </p>
            </div>
          </div>
          {!Object.values(mapping).includes("company_name") && (
            <div className="flex flex-col gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[12px] text-foreground sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium text-amber-600 dark:text-amber-400">Company name needs review</p>
                <p className="mt-0.5 text-muted-foreground">
                  No source column is mapped to Company name. Choose the column that contains the actual company name; this selection will be
                  used as the lead name for each imported row.
                </p>
                <p className="mt-1 font-medium">
                  {missingName > 0 ? `Next preview: ${missingName} rows are missing a lead name.` : "Next preview: all rows currently have a lead name."}
                </p>
              </div>
              <CompanyNameSourcePicker headers={headers} rows={rows} value={nameFallback} onChange={setNameFallback} />
            </div>
          )}
          {!hasEmailColumn && (
            <div className="rounded-md border border-border bg-subtle p-2 text-[12px] text-muted-foreground">
              <span className="font-medium text-foreground">Note:</span> No email column is mapped. Leads will be imported without email addresses.
            </div>
          )}
          {duplicateFields.size > 0 && (
            <div className="rounded-md border border-border bg-subtle p-2 text-[12px] text-negative">
              The same field is used more than once: {[...duplicateFields].map((k) => FIELD_BY_KEY.get(k)?.label ?? k).join(", ")}. Values will
              be joined together unless you change one of them.
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Input placeholder="Search columns" className="h-8 w-[200px] text-[13px]" value={columnSearch} onChange={(e) => setColumnSearch(e.target.value)} />
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={onlyUnmatched} onChange={(e) => setOnlyUnmatched(e.target.checked)} />
                Only show unmatched
              </label>
              <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <input type="checkbox" checked={keepLeftovers} onChange={(e) => setKeepLeftovers(e.target.checked)} />
                Keep unmapped columns in notes
              </label>
            </div>
          </div>
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
                {visibleColumns.map(({ h, i }) => {
                  const sample = rows.find((r) => (r[i] ?? "").trim())?.[i] ?? "";
                  const conf = confidence[i] ?? "none";
                  return (
                    <tr key={i} className="border-b border-border">
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-2">
                          <span>{h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`}</span>
                          {conf === "exact" && (mapping[i] ?? "ignore") !== "ignore" && <Pill tone="positive">matched</Pill>}
                          {conf === "likely" && <Pill tone="warning">check</Pill>}
                        </div>
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-1.5 text-muted-foreground">{sample}</td>
                      <td className="px-2 py-1.5">
                        <FieldPicker
                          value={mapping[i] ?? "ignore"}
                          usedFields={usedFields}
                          onChange={(k) => {
                            setMapping((m) => ({ ...m, [i]: k }));
                            setConfidence((c) => ({ ...c, [i]: k === "ignore" ? "none" : "exact" }));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setConfirmRestart(true)}>
              Start over
            </Button>
            <Button size="sm" onClick={goToPreview}>
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
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {dupCount > 0 ? (
                  <>
                    <span className="font-medium text-amber-600 dark:text-amber-400">{dupCount}</span> of {converted.length} rows match an
                    existing lead in your database.
                  </>
                ) : (
                  <>No duplicates detected against existing leads.</>
                )}
                {intraDupCount > 0 && (
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground font-medium">
                    {intraDupCount} row(s) repeat inside this sheet
                  </span>
                )}
                {missingName > 0 && <> {missingName} row(s) still have no lead name and will fail.</>}
                {warnRows > 0 && <> {warnRows} row(s) have warnings.</>}
              </span>
            )}
          </div>
          {dupCount > 0 && (
            <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3">
              {dupCount === converted.length ? (
                <div className="flex items-start gap-2.5 text-warning mb-1">
                  <TriangleAlert className="size-4 shrink-0 mt-0.5" />
                  <div className="text-[12.5px] leading-relaxed">
                    <span className="font-semibold block text-foreground">Duplicate spreadsheet detected</span>
                    All {converted.length} rows in this sheet already exist in your workspace database. By default, duplicate leads are set to{" "}
                    <strong>Skip</strong> to prevent duplicate records. If you want to merge new columns into your existing leads, select{" "}
                    <strong>Merge</strong> below.
                  </div>
                </div>
              ) : null}
              <span className="text-[12.5px] font-medium text-foreground">
                Duplicate resolution strategy ({dupCount} duplicate{dupCount === 1 ? "" : "s"} found):
              </span>
              <RadioGroup value={dupAction} onValueChange={(v) => setDupAction(v as DupAction)} className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                {(
                  [
                    ["skip", "dup-skip", "Skip duplicates"],
                    ["merge", "dup-merge", "Merge (fill empty fields only)"],
                    ["update", "dup-update", "Overwrite duplicates"],
                    ["add_new", "dup-add-new", "Create as new duplicate (Re-add again)"],
                  ] as const
                ).map(([v, id, label]) => (
                  <div key={v} className="flex items-center gap-2">
                    {/* Live radio item: h-4 w-4 rounded-full border-primary, Circle indicator h-3.5 w-3.5 fill-primary */}
                    <RadioGroupItem value={v} id={id} />
                    <Label htmlFor={id} className="text-[13px] cursor-pointer">
                      {label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          )}
          <p className="label-text">Preview of the first 10 rows as they will be saved:</p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-2 py-1 font-medium">#</th>
                  <th className="px-2 py-1 font-medium">Lead &amp; Country</th>
                  <th className="px-2 py-1 font-medium">Contact &amp; Role</th>
                  <th className="px-2 py-1 font-medium">Outreach &amp; Dates</th>
                  <th className="px-2 py-1 font-medium">Personalized Draft</th>
                  <th className="px-2 py-1 font-medium">Links</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {converted.slice(0, 10).map((r, idx) => {
                  const l = r.lead as Record<string, any>;
                  const chips: string[] = [];
                  if (l.email_sent) chips.push("email sent");
                  if (l.email_sent_at) chips.push(`Email sent: ${String(l.email_sent_at).slice(0, 10)}`);
                  if (l.last_contacted_at) chips.push(`Outreach: ${String(l.last_contacted_at).slice(0, 10)}`);
                  if (l.email_viewed) chips.push("viewed");
                  if (l.email_replied) chips.push(`replied${l.reply_sentiment ? ` (${l.reply_sentiment})` : ""}`);
                  if (l.loom_sent) chips.push("loom sent");
                  if (l.linkedin_sent) chips.push("linkedin");
                  if (l.instagram_sent) chips.push("instagram");
                  if (l.meeting_booked) chips.push("meeting booked");
                  const draft = l.personalized_message || l.message_angle;
                  const country = l.country_id ? Array.from(lookups.countries.entries()).find(([, id]) => id === l.country_id)?.[0] : null;
                  return (
                    <tr key={idx} className="border-b border-border align-top">
                      <td className="px-2 py-1 text-muted-foreground">{idx + 2}</td>
                      <td className="px-2 py-1">
                        <div className="font-medium text-foreground">{l.company_name || <span className="text-negative">No name</span>}</div>
                        {country && <div className="text-[11px] text-muted-foreground capitalize">{country}</div>}
                        {r.warnings.length > 0 && <div className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">{r.warnings.join("; ")}</div>}
                      </td>
                      <td className="px-2 py-1">
                        {r.people.length === 0 ? (
                          <span className="text-muted-foreground">{String(l.primary_contact ?? "") || "-"}</span>
                        ) : (
                          r.people.map((p, n) => (
                            <div key={n} className="flex flex-col text-[11px]">
                              <span className="font-medium text-foreground">{p.person_name || String(l.primary_contact ?? "") || "Contact"}</span>
                              {p.job_title && <span className="text-muted-foreground">{p.job_title}</span>}
                              {p.email && <span className="text-primary/90 font-mono text-[10.5px]">{p.email}</span>}
                            </div>
                          ))
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {chips.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {chips.map((c, n) => (
                              <span key={n} className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] text-foreground">
                                {c}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1 max-w-[200px]">
                        {draft ? (
                          <div className="truncate rounded bg-subtle px-1.5 py-0.5 text-[11px] text-muted-foreground" title={draft}>
                            {draft}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        <div className="flex flex-wrap gap-1 text-[11px] text-muted-foreground">
                          {!!l.website_url && <span>🌐 Site</span>}
                          {r.links.length > 0 && <span>🔗 +{r.links.length} link(s)</span>}
                          {!l.website_url && r.links.length === 0 && <span>-</span>}
                        </div>
                      </td>
                      <td className="px-2 py-1">
                        {dupInfo[idx]?.isDuplicate ? (
                          <Pill tone="warning">Duplicate</Pill>
                        ) : dupInfo[idx]?.isIntraSheetDuplicate ? (
                          <Pill tone="neutral">Duplicate in sheet</Pill>
                        ) : (
                          <Pill tone="positive">New</Pill>
                        )}
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
            Ready to import <span className="font-medium">{converted.length}</span> rows from <span className="font-medium">{fileName}</span>.
            {dupCount > 0 && (
              <>
                {" "}
                {dupCount} duplicate row(s) will be{" "}
                {dupAction === "skip"
                  ? "skipped"
                  : dupAction === "merge"
                    ? "merged into the existing lead"
                    : dupAction === "update"
                      ? "overwritten"
                      : "created as new leads (re-added)"}
                .
              </>
            )}
            {intraDupCount > 0 && (
              <span className="block text-muted-foreground text-[12px] pt-1">Note: {intraDupCount} row(s) have duplicate entries within this sheet.</span>
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
            <div className="flex flex-col gap-2.5 rounded-lg border border-warning/40 bg-warning/5 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                  <LoaderCircle className="size-4 animate-spin text-warning" />
                  Importing {progress} of {converted.length} rows ({converted.length > 0 ? Math.round((progress / converted.length) * 100) : 0}%)...
                </div>
                <Button variant="destructive" size="sm" onClick={() => void cancelUpload()} disabled={cancelling}>
                  {cancelling ? "Cancelling and removing data..." : "Cancel upload"}
                </Button>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${converted.length > 0 ? Math.min(100, Math.round((progress / converted.length) * 100)) : 0}%` }}
                />
              </div>
              <p className="text-[12px] text-muted-foreground">
                Upload is in process. Please do not leave or close this page. If you need to stop, click “Cancel upload” to safely abort and
                delete any imported records.
              </p>
            </div>
          )}
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setStep(3)} disabled={importing || cancelling}>
              Back
            </Button>
            <Button size="sm" onClick={() => void confirmImport()} disabled={importing || cancelling}>
              {importing ? "Importing..." : "Confirm and import"}
            </Button>
          </div>
        </div>
      )}

      {step === 5 && results && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ResultTile label="Imported" count={results.filter((r) => r.status === "imported").length} tone="positive" />
            <ResultTile label="Updated" count={results.filter((r) => r.status === "updated").length} tone="info" />
            <ResultTile label="Skipped" count={results.filter((r) => r.status === "skipped").length} tone="neutral" />
            <ResultTile label="Failed" count={results.filter((r) => r.status === "failed").length} tone="negative" />
          </div>
          {results.some((r) => r.status === "skipped") && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-start gap-2.5 text-[12.5px] text-amber-900 dark:text-amber-200">
              <TriangleAlert className="size-4 text-warning shrink-0 mt-0.5" />
              <div>
                <strong>{results.filter((r) => r.status === "skipped").length} duplicate lead(s) were skipped</strong> to protect existing records
                in your workspace database.
              </div>
            </div>
          )}
          {(added.stages.length > 0 || added.channels.length > 0 || added.senders.length > 0 || added.countries.length > 0) && (
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex flex-col gap-1 text-[13px]">
              <div className="font-medium text-foreground flex items-center gap-1.5">
                <Sparkles className="size-4 text-primary" /> Added to your workspace settings:
              </div>
              <div className="text-muted-foreground text-[12px] flex flex-wrap gap-x-4 gap-y-1 pt-0.5">
                {added.stages.length > 0 && (
                  <span>
                    Stages: <span className="text-foreground font-medium">{added.stages.join(", ")}</span>
                  </span>
                )}
                {added.channels.length > 0 && (
                  <span>
                    Channels: <span className="text-foreground font-medium">{added.channels.join(", ")}</span>
                  </span>
                )}
                {added.senders.length > 0 && (
                  <span>
                    Senders: <span className="text-foreground font-medium">{added.senders.join(", ")}</span>
                  </span>
                )}
                {added.countries.length > 0 && (
                  <span>
                    Countries: <span className="text-foreground font-medium">{added.countries.join(", ")}</span>
                  </span>
                )}
              </div>
            </div>
          )}
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
                      .filter((r) => r.status === "failed")
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

      <SmartAnalysisDialog
        open={analysisDialogOpen}
        onOpenChange={setAnalysisDialogOpen}
        analysis={analysis}
        onConfirm={addToWorkspace}
        onSkip={() => {
          setAnalysisDialogOpen(false);
          setStep(3);
        }}
        onBackToMapping={() => setAnalysisDialogOpen(false)}
        isApplying={applyingAdditions}
      />
      <SaveTemplateDialog
        open={saveTemplateOpen}
        onOpenChange={setSaveTemplateOpen}
        defaultName={fileName ? `${fileName.replace(/\.[^/.]+$/, "")} Template` : "Lead Sheet Template"}
        mappedCount={Object.values(mapping).filter((k) => k !== "ignore").length}
        onSave={async (n) => {
          await saveMapping(n);
        }}
        onSkip={() => setSaveTemplateOpen(false)}
        isSaving={savingTemplate}
      />

      <AlertDialog
        open={confirmRestart}
        onOpenChange={(o) => setConfirmRestart(o)}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-base flex items-center gap-2">
              <TriangleAlert className="size-5 text-warning" />
              Start this import over?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              {aiUsed
                ? "Hey, your import session is currently in progress. If you restart now, your current mappings will be cleared. Would you like to continue with this import or start afresh?"
                : "Your current file and column mappings will be cleared. Starting over will not delete leads already saved to your workspace."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep working on this import</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmRestart(false);
                reset();
              }}
            >
              Start over afresh
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={blocker?.status === "blocked"}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-foreground">
              <TriangleAlert className="size-5 text-warning" />
              {importing ? "Upload is in process" : "Active Import Session in Progress"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[13px] text-muted-foreground leading-relaxed">
              {importing
                ? "Your leads are currently being saved to the database. Leaving now will cancel the remaining imports."
                : "Hey, your import session is currently here on the mapping/preview stage. If you leave or restart, you will lose your mapping and current file progress."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={stayOnPage}>Continue with this import</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void leavePage()}>
              Discard and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={readingFile || analysisOpen}
        onOpenChange={(o) => {
          if ((!o && !analysisError) || o) return;
          setAnalysisOpen(false);
          setReadingFile(false);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {readingFile && !analysisError && (
                <>
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                  Reading and preparing file...
                </>
              )}
              {!readingFile && analysisOpen && !analysisError && (
                <>
                  <LoaderCircle className="size-5 animate-spin text-primary" />
                  Analyzing your sheet...
                </>
              )}
              {analysisError && (
                <>
                  <TriangleAlert className="size-5 text-warning" />
                  {analysisError.title}
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {readingFile && !analysisError && (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
              <div className="relative size-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <FileSpreadsheet className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-foreground">Reading {readingName || "your spreadsheet"}</p>
                <p className="text-[12.5px] text-muted-foreground max-w-xs">Parsing spreadsheet rows, sheet tabs, and detecting column headers.</p>
              </div>
            </div>
          )}
          {!readingFile && analysisOpen && !analysisError && (
            <div className="flex flex-col items-center justify-center py-6 text-center gap-3">
              <div className="relative size-16 flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-muted" />
                <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                <Bot className="size-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-[14px] font-medium text-foreground">We are analyzing your sheet</p>
                <p className="text-[12.5px] text-muted-foreground max-w-xs">
                  Detecting column headers, mapping CRM fields, and inspecting data types with AI.
                </p>
              </div>
            </div>
          )}
          {analysisError && (
            <div className="flex flex-col gap-4 py-1 text-sm">
              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <TriangleAlert className="size-4 text-muted-foreground" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-foreground">
                    {analysisError.category === "read_error"
                      ? "We couldn't read this file"
                      : "AI mapping is temporarily unavailable"}
                  </p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">
                    {analysisError.category === "read_error"
                      ? "The spreadsheet could not be read or does not contain recognized headers. Please choose a supported file."
                      : "Your file is still available. We used local matching rules instead, so please review the suggested fields carefully."}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 border-t border-border pt-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {analysisError.category === "read_error" ? (
                    <Button
                      type="button"
                      className="h-10 w-full rounded-lg text-sm font-medium"
                      onClick={() => {
                        setAnalysisOpen(false);
                        setReadingFile(false);
                        setAnalysisError(null);
                        reset();
                        setTimeout(() => fileInput.current?.click(), 100);
                      }}
                    >
                      Choose another file
                    </Button>
                  ) : (
                    <div className="contents">
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full rounded-lg text-sm font-medium"
                        onClick={() => {
                          setAnalysisOpen(false);
                          setAnalysisError(null);
                          setStep(1);
                          setMapping({});
                          setConfidence({});
                          setResults(null);
                        }}
                      >
                        Go back
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 w-full rounded-lg text-sm font-medium"
                        onClick={() => {
                          setAnalysisOpen(false);
                          setAnalysisError(null);
                          reset();
                        }}
                      >
                        Cancel import
                      </Button>
                    </div>
                  )}
                </div>
                {analysisError.category !== "read_error" && (
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs">
                    <button
                      type="button"
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
                      onClick={() => setShowErrorDetails(!showErrorDetails)}
                    >
                      {showErrorDetails ? "Hide error details" : "View error details"}
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:underline"
                      onClick={() => setReportOpen(true)}
                    >
                      Report a problem
                    </button>
                  </div>
                )}
                {showErrorDetails && (
                  <div className="max-h-32 overflow-y-auto break-words rounded-md bg-muted/40 p-3 text-xs leading-relaxed text-muted-foreground">
                    {analysisError.details}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {/* TODO: live renders the app-shell ReportProblemDialog here:
          <ReportProblemDialog open={reportOpen} onOpenChange={setReportOpen}
            initialMessage={analysisError ? `Error during sheet analysis (${analysisError.category}): ${analysisError.details}` : ""} /> */}
      {reportOpen && null}
    </Card>
  );
}
