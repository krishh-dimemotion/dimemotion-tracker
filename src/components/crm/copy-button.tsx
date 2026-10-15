// Ported from live chunk CopyButton-oQ1zv6lF.js: link-aware input, email verify toggle, copy button.
import { useState, type ComponentProps } from "react";
import { BadgeCheck, Check, CircleDashed, Copy, ExternalLink, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

// TODO: live imports these from config (normalizeEmail / parseUrl). Inlined copies to avoid guessing export names.
function normalizeEmail(value: string | null | undefined) {
  const t = (value ?? "").trim().replace(/^mailto:/i, "");
  const at = t.lastIndexOf("@");
  if (at <= 0 || at === t.length - 1 || /\s/.test(t)) return null;
  const local = t.slice(0, at);
  const domain = t.slice(at + 1).toLowerCase();
  return /^[^\s@]+\.[a-z]{2,}$/i.test(domain) ? `${local}@${domain}` : null;
}

function parseUrl(value: string | null | undefined) {
  const t = (value ?? "").trim();
  if (!t || /\s/.test(t)) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    return (u.protocol !== "http:" && u.protocol !== "https:") || !u.hostname.includes(".") ? null : u;
  } catch {
    return null;
  }
}

function linkFor(value: string, kind: "url" | "email" = "url") {
  const t = (value ?? "").trim();
  if (!t) return null;
  if (kind === "email") {
    const e = normalizeEmail(t);
    return e ? `mailto:${e}` : null;
  }
  return parseUrl(t)?.toString() ?? null;
}

export function LinkInput({
  kind = "url",
  wrapperClassName,
  className,
  value,
  ...props
}: ComponentProps<typeof Input> & { kind?: "url" | "email"; wrapperClassName?: string }) {
  const href = linkFor(typeof value === "string" ? value : "", kind);
  const label = kind === "email" ? "Write an email" : "Open in new tab";
  return (
    <div className={cn("relative", wrapperClassName)}>
      <Input {...props} value={value} className={cn(className, href && "pr-8")} />
      {href && (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={label}
          aria-label={label}
          onMouseDown={(e) => e.preventDefault()}
          className="absolute top-1/2 right-1.5 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-foreground"
        >
          {kind === "email" ? <Mail className="size-3.5" /> : <ExternalLink className="size-3.5" />}
        </a>
      )}
    </div>
  );
}

export function VerifyToggle({
  verified,
  disabled,
  onToggle,
}: {
  verified: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={verified}
      title={verified ? "Email verified. Click to mark as not verified." : "Not verified. Click to mark this email as verified."}
      onClick={() => onToggle(!verified)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1 rounded-md border px-2 text-[12px] transition-colors disabled:opacity-60",
        verified
          ? "border-positive text-positive"
          : "border-dashed border-border text-muted-foreground hover:bg-subtle hover:text-foreground",
      )}
    >
      {verified ? <BadgeCheck className="size-3.5" /> : <CircleDashed className="size-3.5" />}
      {verified ? "Verified" : "Verify"}
    </button>
  );
}

export function CopyButton({
  text,
  label = "Copy email",
  className,
  size = "md",
}: {
  text: string | null | undefined;
  label?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [copied, setCopied] = useState(false);
  const value = (text ?? "").trim();
  if (!value) return null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast.success(`Copied ${value}`);
    } catch {
      toast.error("Could not copy. Select the text and copy it by hand.");
    }
  };
  const iconClass = size === "sm" ? "size-3" : "size-3.5";
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => void copy()}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-foreground",
        size === "sm" ? "size-4" : "h-8 w-8 border border-border",
        copied && "text-positive",
        className,
      )}
    >
      {copied ? <Check className={iconClass} /> : <Copy className={iconClass} />}
    </button>
  );
}
