// Dialogs and small pieces used by the import wizard on /lt/data.
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  Ban,
  Bookmark,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe,
  Layers,
  Link2,
  Mail,
  Plus,
  Radio,
  Search,
  Send,
  Sparkles,
  TriangleAlert,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FIELD_BY_KEY, IMPORT_FIELDS, type SheetAnalysis } from "./data-fields";

export type WorkspaceAdditions = { stages: string[]; channels: string[]; senders: string[]; countries: string[] };

function ChipGroup({
  icon,
  title,
  items,
  selected,
  onToggle,
  mono,
}: {
  icon: React.ReactNode;
  title: string;
  items: { name: string; count: number }[];
  selected: Set<string>;
  onToggle: (name: string) => void;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-subtle/50 p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
        {icon}
        <span>
          {title} ({items.length})
        </span>
      </div>
      <div className="flex flex-wrap gap-2 pt-1">
        {items.map((e) => {
          const on = selected.has(e.name);
          return (
            <label
              key={e.name}
              onClick={() => onToggle(e.name)}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-[12px] cursor-pointer transition-colors ${on ? "border-primary/40 bg-primary/10 text-foreground font-medium" : "border-border bg-background text-muted-foreground"}`}
            >
              <Checkbox checked={on} />
              <span className={mono ? "font-mono text-[11px]" : undefined}>{e.name}</span>
              <span className="text-[11px] text-muted-foreground">({e.count})</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export function SmartAnalysisDialog({
  open,
  onOpenChange,
  analysis,
  onConfirm,
  onSkip,
  onBackToMapping,
  isApplying,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  analysis: SheetAnalysis | null;
  onConfirm: (v: WorkspaceAdditions) => Promise<void>;
  onSkip: () => void;
  onBackToMapping: () => void;
  isApplying: boolean;
}) {
  const [stages, setStages] = useState<Set<string>>(new Set());
  const [channels, setChannels] = useState<Set<string>>(new Set());
  const [senders, setSenders] = useState<Set<string>>(new Set());
  const [countries, setCountries] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!analysis) return;
    setStages(new Set(analysis.stages.map((e) => e.name)));
    setChannels(new Set(analysis.channels.map((e) => e.name)));
    setSenders(new Set(analysis.senderAccounts.map((e) => e.name)));
    setCountries(new Set(analysis.countries.map((e) => e.name)));
  }, [analysis]);
  if (!analysis) return null;
  const total = analysis.stages.length + analysis.channels.length + analysis.senderAccounts.length + analysis.countries.length;
  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, name: string) => {
    const next = new Set(set);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setter(next);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-[620px] p-6">
        <DialogHeader className="gap-1.5 pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-semibold text-[15px]">
            <Sparkles className="size-4" />
            Smart Sheet Analysis
          </div>
          <DialogTitle className="text-[17px] font-semibold text-foreground">New Workspace Items &amp; Analysis</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground leading-relaxed">
            We checked your column names and sample values against Tracker's supported fields and this workspace's settings. Review what
            can be added, what will be preserved in notes, and what may need manual action.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5 py-2">
          {total > 0 && (
            <div className="flex flex-col gap-3">
              <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">Items to Add to Workspace ({total})</div>
              {analysis.stages.length > 0 && (
                <ChipGroup
                  icon={<Layers className="size-3.5 text-primary" />}
                  title="Pipeline Stages"
                  items={analysis.stages}
                  selected={stages}
                  onToggle={(n) => toggle(stages, setStages, n)}
                />
              )}
              {analysis.channels.length > 0 && (
                <ChipGroup
                  icon={<Radio className="size-3.5 text-primary" />}
                  title="Outreach Channels"
                  items={analysis.channels}
                  selected={channels}
                  onToggle={(n) => toggle(channels, setChannels, n)}
                />
              )}
              {analysis.senderAccounts.length > 0 && (
                <ChipGroup
                  icon={<Mail className="size-3.5 text-primary" />}
                  title="Sender Accounts / Mailboxes"
                  items={analysis.senderAccounts}
                  selected={senders}
                  onToggle={(n) => toggle(senders, setSenders, n)}
                  mono
                />
              )}
              {analysis.countries.length > 0 && (
                <ChipGroup
                  icon={<Globe className="size-3.5 text-primary" />}
                  title="Countries"
                  items={analysis.countries}
                  selected={countries}
                  onToggle={(n) => toggle(countries, setCountries, n)}
                />
              )}
            </div>
          )}
          {analysis.customColumns.length > 0 && (
            <div className="rounded-lg border border-border/80 bg-subtle/30 p-3 flex flex-col gap-2">
              <div className="flex items-center gap-2 text-[13px] font-medium text-foreground">
                <FileText className="size-3.5 text-muted-foreground" />
                <span>Custom Columns Preserved in Notes ({analysis.customColumns.length})</span>
              </div>
              <p className="text-[12px] text-muted-foreground">
                These columns do not match standard CRM fields. When “Keep leftovers” is enabled, non-empty text values are saved as labeled
                key-value notes on each lead. Tracker does not create new database columns automatically:
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {analysis.customColumns.map((e) => (
                  <span
                    key={e.header}
                    className="inline-flex items-center gap-1 rounded bg-muted/80 px-2 py-0.5 text-[11px] font-medium text-foreground"
                    title={`Sample: ${e.sample}`}
                  >
                    {e.header}
                  </span>
                ))}
              </div>
            </div>
          )}
          {analysis.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-[13px] font-medium text-amber-600 dark:text-amber-400">
                <TriangleAlert className="size-4 shrink-0" />
                <span>Important Notes &amp; Warnings ({analysis.warnings.length})</span>
              </div>
              <div className="flex flex-col gap-2">
                {analysis.warnings.map((w) => (
                  <div key={w.id} className="flex flex-col gap-0.5 text-[12px] border-b border-border/40 pb-2 last:border-none last:pb-0">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-foreground">{w.title}</span>
                      <span className="rounded bg-muted px-1.5 py-0.2 text-[10px] font-medium text-muted-foreground">{w.action}</span>
                    </div>
                    <span className="text-muted-foreground text-[11px] leading-relaxed">{w.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onBackToMapping} disabled={isApplying} className="text-[12px]">
            Back to mapping
          </Button>
          <Button variant="outline" size="sm" onClick={onSkip} disabled={isApplying} className="text-[12px]">
            Skip &amp; continue
          </Button>
          <Button
            size="sm"
            onClick={async () => {
              await onConfirm({
                stages: Array.from(stages),
                channels: Array.from(channels),
                senders: Array.from(senders),
                countries: Array.from(countries),
              });
            }}
            disabled={isApplying}
            className="text-[12px]"
          >
            {isApplying ? (
              "Adding to workspace..."
            ) : (
              <>
                Add to Workspace &amp; Continue <ChevronRight className="ml-1 size-3.5" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  defaultName,
  mappedCount,
  onSave,
  onSkip,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  defaultName: string;
  mappedCount: number;
  onSave: (name: string) => Promise<void>;
  onSkip: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");
  useEffect(() => {
    if (defaultName) setName(defaultName);
  }, [defaultName]);
  const save = async () => {
    await onSave(name.trim() || defaultName || "Saved Import Template");
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px] p-6">
        <DialogHeader className="gap-1.5 pb-2 border-b border-border">
          <div className="flex items-center gap-2 text-primary font-semibold text-[15px]">
            <Bookmark className="size-4" />
            Save as Import Template
          </div>
          <DialogTitle className="text-[17px] font-semibold text-foreground">Save Mapping for Next Time?</DialogTitle>
          <DialogDescription className="text-[13px] text-muted-foreground leading-relaxed">
            Would you like to save this column mapping as a reusable template? Next time you upload this sheet, Tracker will automatically
            apply this template in 1 click.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] font-medium text-foreground">Template name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Outreach Lead Sheet, Apollo Export, Instantly Campaign"
              className="h-9 text-[13px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void save();
                }
              }}
            />
          </div>
          <div className="rounded-md border border-border/70 bg-subtle/50 px-3 py-2 text-[12px] text-muted-foreground flex items-center justify-between">
            <span>Columns matched &amp; mapped</span>
            <span className="font-semibold text-foreground">{mappedCount} columns</span>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onSkip} disabled={isSaving} className="text-[12px]">
            No thanks, just finish
          </Button>
          <Button size="sm" onClick={save} disabled={isSaving} className="text-[12px]">
            {isSaving ? "Saving template..." : "Save Template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldOption({
  label,
  subLabel,
  isSelected,
  isUsed,
  onSelect,
}: {
  fieldKey: string;
  label: string;
  subLabel?: string;
  isSelected: boolean;
  isUsed: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group flex items-center justify-between rounded-md px-2 py-1.5 text-left transition-colors ${isSelected ? "bg-primary text-primary-foreground font-medium" : isUsed ? "bg-muted/40 text-muted-foreground hover:bg-subtle hover:text-foreground" : "hover:bg-subtle text-foreground"}`}
    >
      <div className="flex flex-col">
        <span className="text-[12px] leading-snug">{label}</span>
        {subLabel && <span className={`text-[10px] ${isSelected ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{subLabel}</span>}
      </div>
      <div className="flex items-center gap-1">
        {isUsed && !isSelected && <span className="text-[9.5px] rounded bg-muted px-1 text-muted-foreground">used</span>}
        {isSelected && <Check className="size-3.5 text-primary-foreground shrink-0" />}
      </div>
    </button>
  );
}

const SectionHead = ({ icon, label }: { icon: React.ReactNode; label: string }) => (
  <div className="flex items-center gap-1.5 text-[12px] font-semibold text-foreground uppercase tracking-wider">
    {icon} {label}
  </div>
);

/** Column-to-field picker shown in the "Maps to" column. */
export function FieldPicker({
  value,
  onChange,
  usedFields = new Set(),
}: {
  value: string;
  onChange: (key: string) => void;
  usedFields?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [person, setPerson] = useState(1);
  const [personSlots, setPersonSlots] = useState(() => {
    let max = 3;
    const check = (k: string) => {
      const m = k.match(/^person_(\d+)_/);
      if (m) max = Math.max(max, parseInt(m[1] ?? "3", 10));
    };
    check(value);
    usedFields.forEach(check);
    return Math.min(8, Math.max(3, max));
  });
  const current = value === "ignore" ? null : FIELD_BY_KEY.get(value);
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return IMPORT_FIELDS.filter((f) =>
      f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q) || f.group.toLowerCase().includes(q)
        ? true
        : f.synonyms.some((s) => s.toLowerCase().includes(q)),
    );
  }, [search]);
  const company = useMemo(() => IMPORT_FIELDS.filter((f) => f.group === "Company"), []);
  const linksF = useMemo(() => IMPORT_FIELDS.filter((f) => f.group === "Links"), []);
  const outreach = useMemo(
    () => IMPORT_FIELDS.filter((f) => ["Email", "Loom", "LinkedIn", "Instagram", "Outcomes", "Follow-ups"].includes(f.group)),
    [],
  );
  const notes = useMemo(() => IMPORT_FIELDS.filter((f) => f.group === "Notes"), []);
  const personFields = useMemo(() => {
    const e = person;
    return [
      { key: `person_${e}_name`, label: `Person ${e} name`, type: "Full name" },
      { key: `person_${e}_title`, label: `Person ${e} job title`, type: "Job title / Role" },
      { key: `person_${e}_email`, label: `Person ${e} email`, type: "Email address" },
      { key: `person_${e}_phone`, label: `Person ${e} phone`, type: "Phone number" },
      { key: `person_${e}_linkedin`, label: `Person ${e} LinkedIn`, type: "LinkedIn profile" },
    ];
  }, [person]);
  const pick = (k: string) => {
    onChange(k);
    setOpen(false);
    setSearch("");
  };
  const option = (f: { key: string; label: string }, subLabel?: string) => (
    <FieldOption
      key={f.key}
      fieldKey={f.key}
      label={f.label}
      subLabel={subLabel}
      isSelected={value === f.key}
      isUsed={usedFields.has(f.key) && value !== f.key}
      onSelect={() => pick(f.key)}
    />
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          className="flex h-8 w-full min-w-[200px] max-w-[280px] items-center justify-between rounded-md border border-border bg-background px-2.5 text-left text-[13px] shadow-xs transition-colors hover:border-foreground/40 hover:bg-subtle focus:outline-none focus:ring-1 focus:ring-primary"
        >
          <span className="truncate">
            {value === "ignore" || !current ? (
              <span className="text-muted-foreground font-normal">Ignore</span>
            ) : (
              <span className="font-medium text-foreground">{current.label}</span>
            )}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground shrink-0 ml-1.5 opacity-60" />
        </button>
      </>
      <DialogContent className="w-[min(1200px,96vw)] max-w-[96vw] max-h-[88vh] overflow-hidden p-0 shadow-xl border border-border bg-popover text-popover-foreground rounded-xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Map spreadsheet column</DialogTitle>
        </DialogHeader>
        <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border p-3 pr-12 bg-subtle/30">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fields (e.g. email, company, notes, phone)..."
              className="h-8 pl-8 text-[12.5px] bg-background"
              autoFocus
            />
          </div>
          <Button
            type="button"
            size="sm"
            variant={value === "ignore" ? "secondary" : "outline"}
            onClick={() => pick("ignore")}
            className="h-8 shrink-0 gap-1.5 text-[12px] font-medium"
          >
            <Ban className="size-3.5 text-muted-foreground" />
            Ignore column
          </Button>
        </div>
        {results ? (
          <div className="max-h-[380px] overflow-y-auto p-3">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">Search Results ({results.length})</div>
            {results.length === 0 ? (
              <div className="py-8 text-center text-[12.5px] text-muted-foreground">No matching fields found for "{search}".</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {results.map((f) => {
                  const sel = value === f.key;
                  const used = usedFields.has(f.key) && !sel;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => pick(f.key)}
                      className={`flex flex-col items-start gap-0.5 rounded-lg border p-2 text-left transition-colors ${sel ? "border-primary bg-primary/10 text-foreground" : "border-border/60 hover:border-foreground/30 hover:bg-subtle text-foreground"}`}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="text-[12.5px] font-medium leading-tight">{f.label}</span>
                        {sel && <Check className="size-3.5 text-primary shrink-0" />}
                      </div>
                      <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                        <span>{f.group}</span>
                        {used && <span className="rounded bg-muted px-1 py-0.2 text-[9.5px]">used</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-border max-h-[calc(88vh-150px)] overflow-y-auto overscroll-contain text-[12px]">
            <div className="p-3 flex flex-col gap-2">
              <SectionHead icon={<Building2 className="size-3.5 text-primary" />} label="Company" />
              <div className="flex flex-col gap-1">{company.map((f) => option(f))}</div>
            </div>
            <div className="p-3 flex flex-col gap-2 bg-subtle/10">
              <div className="flex items-center justify-between">
                <SectionHead icon={<Users className="size-3.5 text-primary" />} label="People" />
              </div>
              <div className="flex flex-wrap items-center gap-1 pb-1 border-b border-border/50">
                {Array.from({ length: personSlots }, (_, i) => i + 1).map((n) => {
                  const active = person === n;
                  const hasMapped = [`person_${n}_name`, `person_${n}_email`, `person_${n}_title`, `person_${n}_phone`].some(
                    (k) => usedFields.has(k) || value === k,
                  );
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setPerson(n)}
                      className={`relative px-2 py-0.5 rounded text-[11.5px] font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"}`}
                    >
                      P{n}
                      {hasMapped && !active && <span className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-primary" />}
                    </button>
                  );
                })}
                {personSlots < 8 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (personSlots < 8) {
                        const n = personSlots + 1;
                        setPersonSlots(n);
                        setPerson(n);
                      }
                    }}
                    title="Add Person detail"
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-dashed border-border"
                  >
                    <Plus className="size-3" />
                  </button>
                )}
              </div>
              <div className="flex flex-col gap-1 pt-1">{personFields.map((f) => option(f, f.type))}</div>
            </div>
            <div className="p-3 flex flex-col gap-2">
              <SectionHead icon={<Link2 className="size-3.5 text-primary" />} label="Links" />
              <div className="flex flex-col gap-1">{linksF.map((f) => option(f))}</div>
            </div>
            <div className="p-3 flex flex-col gap-3 bg-subtle/10">
              <div className="flex flex-col gap-1.5">
                <SectionHead icon={<FileText className="size-3.5 text-primary" />} label="Notes" />
                <div className="flex flex-col gap-1">{notes.map((f) => option(f))}</div>
              </div>
              <div className="flex flex-col gap-1.5 pt-2 border-t border-border/50">
                <SectionHead icon={<Send className="size-3.5 text-primary" />} label="Outreach" />
                <div className="flex flex-col gap-1 pr-1">{outreach.map((f) => option(f, f.group))}</div>
              </div>
            </div>
          </div>
        )}
        <div className="border-t border-border px-3 py-2 bg-subtle/30 text-[11px] text-muted-foreground flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5">
            <ArrowDown className="size-3.5" /> Scroll within this window to see more fields. Click any field to assign it to this column.
          </span>
          {value !== "ignore" && current && (
            <span className="font-medium text-foreground">
              Currently mapped to: <span className="text-primary">{current.label}</span>
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ResultTile({ label, count, tone }: { label: string; count: number; tone: "positive" | "negative" | "info" | "neutral" }) {
  return (
    <div className="rounded-md border border-border bg-subtle p-2 text-center">
      <div
        className={cn(
          "text-[18px] font-semibold",
          tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : tone === "info" ? "text-info" : "text-muted-foreground",
        )}
      >
        {count}
      </div>
      <div className="label-text">{label}</div>
    </div>
  );
}

/** Picks the column used as lead name when no column maps to Company name. */
export function CompanyNameSourcePicker({
  headers,
  rows,
  value,
  onChange,
}: {
  headers: string[];
  rows: string[][];
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const label =
    value === "" || value === "__first_email__"
      ? "First email address"
      : headers[Number(value)]?.replace(/\s+/g, " ").trim() || `Column ${Number(value) + 1}`;
  const q = search.trim().toLowerCase();
  const options = headers
    .map((h, i) => ({
      header: h.replace(/\s+/g, " ").trim() || `Column ${i + 1}`,
      value: String(i),
      sample: rows.find((r) => (r[i] ?? "").trim())?.[i]?.trim() ?? "",
    }))
    .filter((o) => o.header.toLowerCase().includes(q) || o.sample.toLowerCase().includes(q));
  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setSearch("");
  };
  return (
    <>
      <Button
        type="button"
        variant="outline"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="h-9 w-full justify-between gap-2 text-left text-[13px] sm:w-[300px]"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex w-[min(900px,96vw)] max-w-[96vw] max-h-[86vh] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border px-5 py-4">
            <DialogTitle>Choose the company-name source column</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Choose the spreadsheet column that contains the lead or company name. Sample values are shown to help you identify it.
            </p>
          </DialogHeader>
          <div className="border-b border-border bg-subtle/30 p-4">
            <Input
              autoFocus
              placeholder="Search column names or sample values…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 text-[13px]"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3">
            <button
              type="button"
              onClick={() => pick("__first_email__")}
              className="mb-2 flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-3 text-left transition-colors hover:bg-subtle"
            >
              <span>
                <span className="block text-sm font-medium">First email address</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Use an email address only when no company-name column is available.
                </span>
              </span>
              {(value === "" || value === "__first_email__") && <Check className="size-4 shrink-0 text-primary" />}
            </button>
            <div className="mb-2 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
              <ArrowDown className="size-3.5" /> {options.length} source columns · scroll to see all columns
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {options.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pick(o.value)}
                  className={cn(
                    "flex min-w-0 items-start justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-subtle",
                    value === o.value ? "border-primary bg-primary/5" : "border-border",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{o.header}</span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      Sample: <span className="break-words text-foreground">{o.sample || "No sample value"}</span>
                    </span>
                  </span>
                  {value === o.value && <Check className="size-4 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
            {options.length === 0 && (
              <p className="px-2 py-8 text-center text-sm text-muted-foreground">No source columns found. Try a different search.</p>
            )}
          </div>
          <div className="border-t border-border bg-subtle/30 px-4 py-3 text-xs text-muted-foreground">
            Select a source column to use its value as the lead name during import.
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
