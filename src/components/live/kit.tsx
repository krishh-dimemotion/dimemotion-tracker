// Live chunk: kit-CyaWpbkv.js
// The chunk bundles Radix internals (Presence, FocusScope, DismissableLayer,
// Popper, react-day-picker, the Checkbox and Popover wrappers) next to the app
// kit. Uppercase exports are those internals; the app-level ones are below.
// Export mapping:
//   t -> Card                 r -> CollapsibleCard        c -> Metric
//   l -> Pill                 i -> Dot                    a -> EmptyState
//   o -> Loading              n -> CheckDate              s -> MANUAL_HELPER
//   u -> DatePicker           d -> DateRangePicker
//   _ -> pct                  g -> money                  m -> fmtDate
//   h -> fmtDateTime          v -> toDateInput            y -> todayISO
//   f -> addDaysISO           p -> downloadCsv
//   b -> Popover              S -> PopoverTrigger         x -> PopoverContent
//   I -> Checkbox             F -> Calendar (react-day-picker wrapper)
//   G -> ChevronRightIcon     K -> ChevronLeftIcon        q -> ChevronDownIcon
//   J -> CalendarIcon         (inbox, loader, x icons are internal)
//   Remaining uppercase letters (A,B,C,D,E,H,j,k,L,M,N,O,P,R,T,U,V,W,w,z) are
//   Radix primitives; use @radix-ui/* directly.
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CalendarIcon, ChevronDown, ChevronRight, Inbox, Loader2, X } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui";

export { Popover, PopoverContent, PopoverTrigger } from "./ui";
export { Checkbox } from "@/components/ui/checkbox";
export { Calendar } from "@/components/ui/calendar";
export {
  CalendarIcon,
  ChevronDown as ChevronDownIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
} from "lucide-react";

/* ---------------------------------------------------------------- helpers */

export function pct(numerator: number, denominator: number) {
  if (!denominator || denominator <= 0) return { text: "0%", value: 0, hasData: false };
  const value = (numerator / denominator) * 100;
  return { text: `${Math.round(value)}%`, value, hasData: true };
}

export function money(value: number | string | null | undefined, currency = "USD") {
  const n = Number(value ?? 0);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `$${n.toFixed(0)}`;
  }
}

export function fmtDate(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function toDateInput(value: string | null | undefined) {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 10);
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 10);
}

export function addDaysISO(days: number, from?: string) {
  const d = from ? new Date(from) : new Date();
  d.setDate(d.getDate() + days);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 10);
}

function csvEscape(value: unknown) {
  const s = value == null ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function downloadCsv(filename: string, rows: unknown[][]) {
  const text = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Parse a YYYY-MM-DD (or ISO) string as a local date. */
function parseLocalDate(value: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(value);
}

function dateToISO(d: Date) {
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 10);
}

/* ------------------------------------------------------------ DatePicker */

const PRESET_BTN =
  "rounded px-2 py-1 text-muted-foreground hover:bg-subtle hover:text-foreground";

export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  minDate,
  maxDate,
  className,
  disabled = false,
  clearable = true,
}: {
  value?: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  className?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => {
    if (!value) return undefined;
    try {
      const d = parseLocalDate(value);
      return Number.isNaN(d.getTime()) ? undefined : d;
    } catch {
      return undefined;
    }
  }, [value]);
  const min = useMemo(() => (minDate ? parseLocalDate(minDate) : undefined), [minDate]);
  const max = useMemo(() => (maxDate ? parseLocalDate(maxDate) : undefined), [maxDate]);
  const pick = (d: Date | undefined) => {
    if (!d) {
      if (clearable) onChange("");
      return;
    }
    onChange(dateToISO(d));
    setOpen(false);
  };
  const today = todayISO();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-8 justify-start text-left font-normal text-xs px-2.5 gap-2",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{value ? fmtDate(value) : placeholder}</span>
          {clearable && value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              className="ml-auto rounded-sm p-0.5 hover:bg-subtle text-muted-foreground hover:text-foreground"
              title="Clear date"
            >
              <X className="size-3" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <div className="p-2 border-b border-border flex items-center justify-between gap-1 overflow-x-auto text-[11px]">
          <button type="button" onClick={() => pick(parseLocalDate(today))} className={PRESET_BTN}>
            Today
          </button>
          <button type="button" onClick={() => pick(parseLocalDate(addDaysISO(1, today)))} className={PRESET_BTN}>
            Tomorrow
          </button>
          <button type="button" onClick={() => pick(parseLocalDate(addDaysISO(2, today)))} className={PRESET_BTN}>
            +2 Days
          </button>
          <button type="button" onClick={() => pick(parseLocalDate(addDaysISO(3, today)))} className={PRESET_BTN}>
            +3 Days
          </button>
          <button type="button" onClick={() => pick(parseLocalDate(addDaysISO(7, today)))} className={PRESET_BTN}>
            +1 Week
          </button>
        </div>
        <div className="p-1">
          <Calendar
            mode="single"
            captionLayout="dropdown"
            startMonth={new Date(2020, 0)}
            endMonth={new Date(2035, 11)}
            selected={selected}
            onSelect={pick}
            disabled={(d: Date) => !!((min && d < min) || (max && d > max))}
            autoFocus
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------- DateRangePicker */

export function DateRangePicker({
  from,
  to,
  onChange,
  className,
  placeholder = "Pick date range",
}: {
  from?: string | null;
  to?: string | null;
  onChange: (from: string, to: string) => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const initial = useMemo<DateRange | undefined>(() => {
    if (!from) return undefined;
    try {
      const f = parseLocalDate(from);
      return { from: f, to: to ? parseLocalDate(to) : f };
    } catch {
      return undefined;
    }
  }, [from, to]);
  const [draft, setDraft] = useState<DateRange | undefined>(initial);
  useEffect(() => {
    setDraft(initial);
  }, [initial, open]);
  const apply = (r?: DateRange) => {
    const range = r || draft;
    if (range?.from) {
      const f = dateToISO(range.from);
      onChange(f, range.to ? dateToISO(range.to) : f);
      setOpen(false);
    }
  };
  const today = todayISO();
  const presets = [
    { label: "Today", get: () => ({ from: today, to: today }) },
    { label: "Yesterday", get: () => ({ from: addDaysISO(-1, today), to: addDaysISO(-1, today) }) },
    {
      label: "This week",
      get: () => {
        const dow = new Date(today).getDay();
        return { from: addDaysISO(-(dow === 0 ? 6 : dow - 1), today), to: today };
      },
    },
    {
      label: "Last week",
      get: () => {
        const dow = new Date(today).getDay();
        const back = dow === 0 ? 6 : dow - 1;
        return { from: addDaysISO(-back - 7, today), to: addDaysISO(-back - 1, today) };
      },
    },
    { label: "This month", get: () => ({ from: today.slice(0, 8) + "01", to: today }) },
    { label: "Last 30 days", get: () => ({ from: addDaysISO(-29, today), to: today }) },
    { label: "Year to date", get: () => ({ from: today.slice(0, 4) + "-01-01", to: today }) },
  ];
  const label = useMemo(
    () => (from ? (from === to || !to ? fmtDate(from) : `${fmtDate(from)} - ${fmtDate(to)}`) : placeholder),
    [from, to, placeholder],
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-8 justify-start text-left font-normal text-xs px-2.5 gap-2",
            !from && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">{label}</span>
          <ChevronDown className="size-3 text-muted-foreground opacity-60 ml-auto" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0 max-w-[95vw]">
        <div className="flex flex-col sm:flex-row">
          <div className="flex flex-row sm:flex-col gap-0.5 border-b sm:border-b-0 sm:border-r border-border p-2 bg-subtle/30 overflow-x-auto sm:w-32 shrink-0">
            <span className="hidden sm:block text-[10px] font-semibold uppercase text-muted-foreground tracking-wider px-2 py-1">
              Presets
            </span>
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  const r = p.get();
                  onChange(r.from, r.to);
                  setOpen(false);
                }}
                className="rounded-md px-2 py-1 text-left text-[11px] text-muted-foreground hover:bg-subtle hover:text-foreground whitespace-nowrap"
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="p-2 flex flex-col justify-between">
            <Calendar
              mode="range"
              captionLayout="dropdown"
              startMonth={new Date(2020, 0)}
              endMonth={new Date(2035, 11)}
              selected={draft}
              onSelect={(r: DateRange | undefined) => {
                setDraft(r);
                if (r?.from && r?.to) apply(r);
              }}
              numberOfMonths={1}
              autoFocus
            />
            <div className="mt-2 pt-2 border-t border-border flex items-center justify-between gap-2 px-1 text-xs">
              <span className="text-[11px] text-muted-foreground truncate">
                {draft?.from
                  ? draft.to
                    ? `${fmtDate(dateToISO(draft.from))} - ${fmtDate(dateToISO(draft.to))}`
                    : `From: ${fmtDate(dateToISO(draft.from))}`
                  : "Pick a range"}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" className="h-7 text-xs" disabled={!draft?.from} onClick={() => apply()}>
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------- Card */

export function Card({
  children,
  className,
  title,
  actions,
}: {
  children?: ReactNode;
  className?: string;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className={cn("pro-card p-5", className)}>
      {(title || actions) && (
        <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0 text-[13px] font-semibold tracking-tight text-foreground">{title}</div>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function CollapsibleCard({
  id,
  title,
  help,
  actions,
  defaultOpen = true,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  help?: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const storageKey = `tracker.collapse.${id}`;
  const [open, setOpen] = useState(defaultOpen);
  useEffect(() => {
    const saved = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (saved !== null) setOpen(saved === "1");
  }, [storageKey]);
  const toggle = () => {
    setOpen((o) => {
      window.localStorage.setItem(storageKey, o ? "0" : "1");
      return !o;
    });
  };
  return (
    <div className={cn("pro-card overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-subtle/50">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className="flex min-w-0 items-center gap-2 text-left text-[13px] font-semibold tracking-tight"
          >
            <ChevronRight
              className={cn(
                "size-4 text-faint transition-transform duration-200 ease-[cubic-bezier(.16,1,.3,1)]",
                open && "rotate-90",
              )}
            />
            {title}
          </button>
          {help}
          <button type="button" aria-hidden tabIndex={-1} onClick={toggle} className="h-5 flex-1" />
        </div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </div>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          {open && <div className="border-t border-border/70 p-4">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export type Tone = "neutral" | "positive" | "warning" | "negative" | "info";

export function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  helper?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="pro-card min-w-0 px-5 py-4">
      <div className="section-label leading-snug">{label}</div>
      <div
        className={cn(
          "metric-number mt-1.5 break-words",
          tone === "positive"
            ? "text-positive"
            : tone === "warning"
              ? "text-warning"
              : tone === "negative"
                ? "text-negative"
                : tone === "info"
                  ? "text-info"
                  : "",
        )}
      >
        {value}
      </div>
      {helper !== undefined && (
        <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">{helper}</div>
      )}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
  color,
}: {
  children?: ReactNode;
  tone?: Tone;
  color?: string | null;
}) {
  const c =
    color ||
    (tone === "positive"
      ? "var(--positive)"
      : tone === "warning"
        ? "var(--warning)"
        : tone === "negative"
          ? "var(--negative)"
          : tone === "info"
            ? "var(--info)"
            : null);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap text-foreground",
        !c && "border-border/80 bg-subtle/50 text-muted-foreground",
      )}
      style={
        c
          ? {
              backgroundColor: `color-mix(in oklab, ${c} 10%, var(--surface))`,
              borderColor: `color-mix(in oklab, ${c} 30%, transparent)`,
            }
          : undefined
      }
    >
      <span
        aria-hidden
        className="size-1.5 shrink-0 rounded-full"
        style={{
          backgroundColor: c ?? "var(--faint)",
          boxShadow: `0 0 0 2.5px color-mix(in oklab, ${c ?? "var(--faint)"} 20%, transparent)`,
        }}
      />
      {children}
    </span>
  );
}

export function Dot({ color }: { color?: string | null }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{
        backgroundColor: color ?? "var(--faint)",
        boxShadow: `0 0 0 3px color-mix(in oklab, ${color ?? "var(--faint)"} 18%, transparent)`,
      }}
    />
  );
}

export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-subtle/40 p-10 text-center">
      <div className="mb-1 grid size-10 place-items-center rounded-xl border border-border bg-surface text-muted-foreground shadow-xs">
        <Inbox className="size-[18px]" strokeWidth={1.75} />
      </div>
      <div className="text-[14px] font-semibold tracking-tight">{title}</div>
      {hint && <div className="label-text max-w-md">{hint}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading", page = false }: { label?: string; page?: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "flex w-full flex-col items-center justify-center gap-2 p-6",
        page ? "min-h-screen" : "min-h-[160px]",
      )}
    >
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <span className="label-text">{label}...</span>
    </div>
  );
}

export function CheckDate({
  label,
  checked,
  date,
  disabled,
  onChange,
  helper,
}: {
  label: string;
  checked: boolean;
  date?: string | null;
  disabled?: boolean;
  onChange: (checked: boolean, at: string | null) => void;
  helper?: ReactNode;
}) {
  const dateValue = date ? new Date(date).toISOString().slice(0, 10) : "";
  return (
    <div className="flex flex-wrap items-center gap-3 py-1">
      <label className="flex min-w-[180px] items-center gap-2 text-[13px]">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => {
            if (v !== true) {
              if (!window.confirm(`Clear "${label}" and its date?`)) return;
              onChange(false, null);
            } else onChange(true, new Date().toISOString());
          }}
        />
        {label}
      </label>
      <DatePicker
        className="w-[160px] text-[13px]"
        value={dateValue || undefined}
        disabled={disabled || !checked}
        onChange={(v) => {
          onChange(true, v ? new Date(v + "T12:00:00").toISOString() : null);
        }}
        placeholder="Pick date"
      />
      {helper && <span className="label-text">{helper}</span>}
    </div>
  );
}

export const MANUAL_HELPER = "Entered manually, no automatic tracking";
