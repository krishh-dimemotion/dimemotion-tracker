import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

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
    <div className={cn("rounded-lg border border-border bg-card p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="text-[13px] font-medium">{title}</div>
          <div className="flex items-center gap-2">{actions}</div>
        </div>
      )}
      {children}
    </div>
  );
}

export function CollapsibleCard({
  id,
  title,
  actions,
  defaultOpen = true,
  children,
  className,
}: {
  id: string;
  title: ReactNode;
  actions?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const storageKey = `bs.collapse.${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const v = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (v !== null) setOpen(v === "1");
  }, [storageKey]);

  const toggle = () => {
    setOpen((prev) => {
      window.localStorage.setItem(storageKey, prev ? "0" : "1");
      return !prev;
    });
  };

  return (
    <div className={cn("rounded-lg border border-border bg-card", className)}>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={toggle}
          className="flex flex-1 items-center gap-2 text-left text-[13px] font-medium"
        >
          {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          {title}
        </button>
        <div className="flex items-center gap-2">{actions}</div>
      </div>
      {open && <div className="border-t border-border p-4">{children}</div>}
    </div>
  );
}

export function Metric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  tone?: "positive" | "warning" | "negative" | "info";
}) {
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "warning"
        ? "text-warning"
        : tone === "negative"
          ? "text-negative"
          : tone === "info"
            ? "text-info"
            : "";
  return (
    <Card>
      <div className="label-text">{label}</div>
      <div className={cn("metric-number mt-1", toneClass)}>{value}</div>
      {helper !== undefined && <div className="label-text mt-1">{helper}</div>}
    </Card>
  );
}

export function Pill({
  children,
  tone = "neutral",
  color,
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "warning" | "negative" | "info";
  color?: string | null;
}) {
  const toneClass =
    tone === "positive"
      ? "border-positive text-positive"
      : tone === "warning"
        ? "border-warning text-warning"
        : tone === "negative"
          ? "border-negative text-negative"
          : tone === "info"
            ? "border-info text-info"
            : "border-border text-muted-foreground";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] leading-4 whitespace-nowrap",
        toneClass,
      )}
      style={color ? { borderColor: color, color } : undefined}
    >
      {children}
    </span>
  );
}

export function Dot({ color }: { color?: string | null }) {
  return (
    <span
      className="inline-block size-2 shrink-0 rounded-full"
      style={{ backgroundColor: color ?? "#666666" }}
    />
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-10 text-center">
      <div className="text-[14px] font-medium">{title}</div>
      {hint && <div className="label-text max-w-md">{hint}</div>}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return <div className="label-text p-6">{label}...</div>;
}

/** Checkbox with an editable paired date. Ticking stamps now; unticking confirms and clears. */
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
  date: string | null;
  disabled?: boolean;
  helper?: string;
  onChange: (checked: boolean, date: string | null) => void;
}) {
  const dateValue = date ? new Date(date).toISOString().slice(0, 10) : "";
  return (
    <div className="flex flex-wrap items-center gap-3 py-1">
      <label className="flex min-w-[180px] items-center gap-2 text-[13px]">
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(v) => {
            const next = v === true;
            if (!next) {
              if (!window.confirm(`Clear "${label}" and its date?`)) return;
              onChange(false, null);
            } else {
              onChange(true, new Date().toISOString());
            }
          }}
        />
        {label}
      </label>
      <Input
        type="date"
        className="h-8 w-[160px] text-[13px]"
        value={dateValue}
        disabled={disabled || !checked}
        onChange={(e) => {
          const v = e.target.value;
          onChange(true, v ? new Date(v + "T12:00:00").toISOString() : null);
        }}
      />
      {helper && <span className="label-text">{helper}</span>}
    </div>
  );
}

export const MANUAL_HELPER = "Entered manually, no automatic tracking";
