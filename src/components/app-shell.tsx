/* eslint-disable @typescript-eslint/no-explicit-any */
// Live chunk: app-shell-DE-EaUp2.js
// The app frame (sidebar, header, command palette, shortcuts)
// plus the shared pieces other chunks import from it.
//
// Export mapping (live letter -> name here):
//   t  -> AppShell (also exported as AppPage for older routes)
//   n  -> TestAppIndicatorToggle      r  -> LeadPeekLink        i  -> useLeadPeek
//   a  -> addEmail                    o  -> parseEmails         s  -> ACTIVITY_TYPE_OPTIONS
//   c  -> AddActivityForm             l  -> LeadEventRow        u  -> LeadPicker
//   d  -> eventLabel                  f  -> eventMeta           p  -> useLeadEventActions
//   m  -> deleteLeadEvent (server fn) h  -> LeadTodosCard       g  -> TASK_SELECT
//   _  -> TaskRow                     v  -> useTaskMutations    y  -> Select
//   b  -> SelectContent               x  -> SelectItem          S  -> SelectTrigger
//   C  -> SelectValue                 w  -> VisuallyHidden      T  -> StagePill
//   E  -> findStage                   D  -> HelpLink            O  -> WithHelp
//   k  -> ReportProblemDialog         A  -> Textarea            j  -> SHORTCUTS
//   M  -> isTypingTarget              z  -> useStages           N  -> useChannels
//   R  -> useSenderAccounts           P  -> useCountries        B  -> useTags
//   I  -> useProfiles                 F  -> useOutreachTargets  L  -> useReportCurrencyCode
//   V  -> useFx                       dt -> useMutation (@tanstack/react-query)
//   Icons: $ Keyboard, G Table2, H Youtube, J ReceiptText, K Sparkles, Q Linkedin,
//   U Video, W UserPlus, X MessageSquarePlus, Y MessageSquare, Z Mail, q Search,
//   et Instagram, tt ImagePlus, nt Globe, rt Flag, it Database, at CircleQuestionMark,
//   ot ChevronUp, st CalendarClock, ct Bot, lt Archive, ut ArchiveRestore.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Activity,
  ArchiveRestore,
  Archive,
  BookOpen,
  Bot,
  Boxes,
  Bug,
  CalendarClock,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  CirclePlay,
  CirclePlus,
  CircleQuestionMark,
  CloudUpload,
  Columns3,
  Compass,
  Copy,
  Database,
  ExternalLink,
  Flag,
  Gauge,
  Globe,
  History,
  ImagePlus,
  Instagram,
  Keyboard,
  LayoutDashboard,
  Link2,
  Linkedin,
  ListChecks,
  ListTodo,
  Loader2,
  LogOut,
  Mail,
  Menu,
  MessageSquare,
  MessageSquarePlus,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  PencilLine,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Sun,
  Table2,
  Trash2,
  Upload,
  UserPlus,
  Video,
  X,
  Youtube,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/live/auth";
import { db } from "@/lib/live/db";
import { IS_TEST_MODE } from "@/lib/live/test-mode";
import { autoStageForOutreach, normalizeEmail, parseUrl } from "@/lib/live/config";
import { useOutreachChannels } from "@/lib/live/outreach-channels";
import { runSheetBackup } from "@/lib/live/sheets.functions";
import { getGoogleStatus } from "@/lib/live/google.functions";
import {
  deleteLeadEvent,
  emailLeadProfile,
  reportProblem,
  updateLeadEvent,
} from "@/lib/live/app-shell.functions";
import { isTourMenuOpen, openTour, TOUR_MENU_EVENT } from "@/components/live/demo-tour";
import { ConnectGoogleButton, GOOGLE_STATUS_QUERY_KEY } from "@/components/live/google-connect";
import { NoWorkspace, WorkspaceSwitcher } from "@/components/live/workspace-switcher";
import { CollapsibleCard, DatePicker, fmtDate, fmtDateTime, Loading, money, Pill, todayISO } from "@/components/live/kit";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  Textarea,
} from "@/components/live/ui";

export { useMutation };
export {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from "@/components/live/ui";
export { deleteLeadEvent, updateLeadEvent } from "@/lib/live/app-shell.functions";
export {
  Archive as ArchiveIcon,
  ArchiveRestore as ArchiveRestoreIcon,
  Bot as BotIcon,
  CalendarClock as CalendarClockIcon,
  ChevronUp as ChevronUpIcon,
  CircleQuestionMark as CircleQuestionMarkIcon,
  Database as DatabaseIcon,
  Flag as FlagIcon,
  Globe as GlobeIcon,
  ImagePlus as ImagePlusIcon,
  Instagram as InstagramIcon,
  Keyboard as KeyboardIcon,
  Linkedin as LinkedinIcon,
  Mail as MailIcon,
  MessageSquare as MessageSquareIcon,
  MessageSquarePlus as MessageSquarePlusIcon,
  ReceiptText as ReceiptTextIcon,
  Search as SearchIcon,
  Sparkles as SparklesIcon,
  Table2 as Table2Icon,
  UserPlus as UserPlusIcon,
  Video as VideoIcon,
  Youtube as YoutubeIcon,
} from "lucide-react";

export type ModuleKey = "lead" | "crm";

/* ================================================================ lookups */

export type Stage = {
  id: string;
  name: string;
  color: string | null;
  order_index: number;
  board: "lead" | "crm" | string;
  is_won?: boolean | null;
  is_lost?: boolean | null;
  is_archived?: boolean | null;
  is_reply_stage?: boolean | null;
  [key: string]: any;
};

export function useStages(board?: "lead" | "crm") {
  return useQuery({
    queryKey: ["stages", board ?? "all"],
    queryFn: async () => {
      let q = db.from("stages").select("*").order("order_index");
      if (board) q = q.eq("board", board);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Stage[];
    },
  });
}

export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async () => {
      const { data, error } = await db.from("channels").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useSenderAccounts() {
  return useQuery({
    queryKey: ["sender_accounts"],
    queryFn: async () => {
      const { data, error } = await db.from("sender_accounts").select("*").order("label");
      if (error) throw error;
      return ((data ?? []) as any[]).map((s) => ({
        ...s,
        label:
          s.status === "active"
            ? `${s.label} · Active`
            : s.status === "warming"
              ? `${s.label} · Warming up`
              : s.status === "paused"
                ? `${s.label} · Paused`
                : s.label,
      }));
    },
  });
}

export function useCountries(activeOnly = true) {
  return useQuery({
    queryKey: ["countries", activeOnly],
    queryFn: async () => {
      let q = db.from("countries").select("*").order("name");
      if (activeOnly) q = q.eq("is_active", true);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await db.from("tags").select("*").order("name");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useProfiles() {
  return useQuery({
    queryKey: ["profiles"],
    queryFn: async () => {
      const { data, error } = await db.from("profiles").select("*").order("created_at");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

export function useOutreachTargets() {
  return useQuery({
    queryKey: ["outreach_targets"],
    queryFn: async () => {
      const { data, error } = await db.from("outreach_targets").select("*");
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
}

const normCurrency = (c: string | null | undefined) => (c ?? "USD").trim().toUpperCase() || "USD";

function useReportCurrency() {
  const { workspace } = useAuth();
  return useQuery({
    queryKey: ["report_currency", workspace?.id],
    enabled: !!workspace?.id,
    staleTime: 3e5,
    queryFn: async () => {
      const { data, error } = await db
        .from("workspaces")
        .select("report_currency")
        .eq("id", workspace!.id)
        .maybeSingle();
      if (error) throw error;
      return normCurrency(data?.report_currency);
    },
  });
}

export function useReportCurrencyCode() {
  return useReportCurrency().data ?? "USD";
}

/** Converts CRM amounts into the workspace's report currency. */
export function useFx() {
  const cur = useReportCurrency();
  const code = cur.data ?? "USD";
  const { data: rates } = useQuery({
    queryKey: ["fx_rates"],
    staleTime: 216e5,
    queryFn: async () => {
      const { data, error } = await db.from("fx_rates").select("currency, per_usd");
      if (error) throw error;
      return new Map(((data ?? []) as any[]).map((r) => [r.currency as string, Number(r.per_usd)]));
    },
  });
  const { data: history, isFetched: historyFetched } = useQuery({
    queryKey: ["fx_rates_history", code],
    enabled: code !== "USD",
    staleTime: 216e5,
    queryFn: async () => {
      const { data, error } = await db
        .from("fx_rates_history")
        .select("day, per_usd")
        .eq("currency", code)
        .order("day");
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({ day: r.day as string, rate: Number(r.per_usd) }));
    },
  });
  return useMemo(() => {
    const perUsd = (c: string) => (c === "USD" ? 1 : (rates?.get(c) ?? 1));
    const rateOn = (iso?: string | null) => {
      if (code === "USD") return 1;
      if (!iso || !history?.length) return perUsd(code);
      let r = history[0].rate;
      for (const h of history)
        if (h.day <= iso.slice(0, 10)) r = h.rate;
        else break;
      return r;
    };
    const convert = (amount: number | string | null | undefined, from?: string | null) => {
      const n = Number(amount ?? 0);
      const c = normCurrency(from);
      return !n || c === code ? n : (n / perUsd(c)) * perUsd(code);
    };
    const closedAtUsd = (r: any) => r.closed_at && r.usd_value_at_close != null;
    return {
      ready: !!rates && cur.isFetched && (code === "USD" || historyFetched),
      code,
      convert,
      value: (r: any) =>
        r.usd_value_manual && r.received_amount != null && normCurrency(r.received_currency) === code
          ? Number(r.received_amount)
          : normCurrency(r.currency) === code && !r.usd_value_manual
            ? Number(r.estimated_value ?? 0)
            : closedAtUsd(r)
              ? Number(r.usd_value_at_close) * rateOn(r.closed_at)
              : convert(r.estimated_value, r.currency),
      mrr: (r: any) =>
        normCurrency(r.currency) === code
          ? Number(r.mrr_amount ?? 0)
          : r.closed_at && r.usd_mrr_at_close != null
            ? Number(r.usd_mrr_at_close) * rateOn(r.closed_at)
            : convert(r.mrr_amount, r.currency),
      fmt: (n: number) => money(n, code),
    };
  }, [rates, history, code, cur.isFetched, historyFetched]);
}

/* ============================================================== shortcuts */

export const SHORTCUTS = [
  { key: "help", label: "Open shortcuts help", binding: "?" },
  { key: "palette", label: "Command palette", binding: "Mod+K" },
  { key: "go.dashboard", label: "Go to Dashboard", binding: "G D" },
  { key: "go.leads", label: "Go to Leads", binding: "G L" },
  { key: "go.outreach", label: "Go to Outreach Tracker", binding: "G O" },
  { key: "go.crm", label: "Go to CRM Records", binding: "G C" },
  { key: "go.pipeline", label: "Go to Pipeline", binding: "G P" },
  { key: "go.revenue", label: "Go to Revenue", binding: "G R" },
  { key: "go.invoices", label: "Go to Invoices", binding: "G I" },
  { key: "go.settings", label: "Go to Settings", binding: "G S" },
  { key: "lead.new", label: "New lead", binding: "N" },
  { key: "focus.search", label: "Focus search", binding: "/" },
  { key: "filters", label: "Open filters", binding: "F" },
  { key: "view.cycle", label: "Cycle view mode", binding: "V" },
  { key: "lead.next", label: "Next lead", binding: "J" },
  { key: "lead.prev", label: "Previous lead", binding: "K" },
  { key: "lead.edit", label: "Edit focused lead", binding: "E" },
  { key: "lead.archive", label: "Archive focused lead", binding: "A" },
  { key: "lead.push", label: "Push focused lead to CRM", binding: "P" },
  { key: "lead.followup", label: "Set follow-up date", binding: "S" },
  { key: "lead.stage", label: "Set stage to nth stage", binding: "1..9" },
  { key: "save", label: "Force save", binding: "Mod+S" },
  { key: "escape", label: "Close dialog, clear selection", binding: "Esc" },
];

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/* =============================================================== realtime */

const REALTIME_INVALIDATIONS: Record<string, string[][]> = {
  leads: [["leads"], ["today-leads"], ["outreach-auto"], ["ledger-counts"], ["dashboard"]],
  lead_events: [["lead-events"], ["ledger"], ["activity"]],
  lead_followups: [["lead-followups"], ["today-leads"], ["followups"]],
  lead_contacts: [["lead-contacts"], ["leads"]],
  lead_links: [["lead-links"], ["leads"]],
  lead_tags: [["lead_tags"], ["tags"], ["leads"]],
  lead_tasks: [["lead-tasks"], ["tasks"]],
  crm_records: [["crm-records"], ["crm-dashboard"], ["crm-pipeline"], ["invoices"]],
  crm_contact_log: [["crm-records"], ["crm-activity"]],
  outreach_daily: [["outreach-daily"], ["ledger"]],
  outreach_targets: [["outreach-targets"]],
  stages: [["stages"]],
  profiles: [["profiles"], ["all_profiles"]],
  user_permissions: [["user-permissions"], ["all_user_permissions"]],
  permission_presets: [["permission_presets"]],
  followup_templates: [["followup_templates"]],
};
const REALTIME_TABLES = Object.keys(REALTIME_INVALIDATIONS);

/** Subscribes to postgres changes and invalidates matching queries (300 ms debounce). */
export function useRealtimeInvalidation() {
  const qc = useQueryClient();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const pending = new Set<string>();
    const flush = () => {
      const tables = Array.from(pending);
      pending.clear();
      for (const t of tables) {
        const keys = REALTIME_INVALIDATIONS[t];
        if (keys) for (const k of keys) void qc.invalidateQueries({ queryKey: k });
        else void qc.invalidateQueries();
      }
    };
    const queue = (t: string) => {
      pending.add(t);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 300);
    };
    const channel = supabase.channel("tracker-realtime");
    for (const t of REALTIME_TABLES)
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table: t }, () => queue(t));
    channel.subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [qc]);
}

/* ======================================================= lead export menu */

function EmailLeadProfileButton({ leadId }: { leadId: string }) {
  const [sending, setSending] = useState(false);
  const send = useServerFn(emailLeadProfile);
  const run = async () => {
    if (sending) return;
    setSending(true);
    try {
      const r = await send({ data: { leadId } });
      toast.success(`Lead profile emailed to ${r.recipient}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not email the lead profile");
    } finally {
      setSending(false);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 text-[12px]" disabled={sending}>
          {sending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Mail className="mr-1 size-3.5" />}
          {sending ? "Sending..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void run()} disabled={sending}>
          <Mail className="mr-2 size-3.5" />
          Email to me
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ============================================== report / feedback dialogs */

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(Error("Couldn't read the screenshot"));
    r.readAsDataURL(file);
  });
}

function useScreenshot() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pick = (f?: File | null) => {
    if (!f) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return void toast.error("Use a PNG, JPG, WebP or GIF image.");
    if (f.size > 5242880) return void toast.error("Screenshot must be under 5 MB.");
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };
  const clear = () => {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  return { file, preview, inputRef, pick, clear };
}

function ScreenshotField({ label, shot }: { label: string; shot: ReturnType<typeof useScreenshot> }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="label-text">{label}</div>
      <input
        ref={shot.inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => shot.pick(e.target.files?.[0])}
      />
      {shot.preview ? (
        <div className="relative w-fit">
          <img src={shot.preview} alt="Screenshot preview" className="max-h-40 rounded-md border border-border" />
          <button
            type="button"
            title="Remove screenshot"
            onClick={shot.clear}
            className="absolute -right-2 -top-2 rounded-full border border-border bg-background p-1 hover:bg-subtle"
          >
            <X className="size-3" />
          </button>
        </div>
      ) : (
        <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => shot.inputRef.current?.click()}>
          <ImagePlus className="mr-2 size-4" />
          Add a screenshot
        </Button>
      )}
      <p className="text-[12px] text-muted-foreground">You can also paste an image into the box above.</p>
    </div>
  );
}

export function ReportProblemDialog({
  open,
  onOpenChange,
  initialMessage = "",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [video, setVideo] = useState("");
  const shot = useScreenshot();
  const page = useRouterState({ select: (s) => s.location.pathname });
  const send = useServerFn(reportProblem);
  const submit = async () => {
    setSending(true);
    try {
      const screenshot = shot.file
        ? { name: shot.file.name.slice(0, 200), type: shot.file.type, base64: await readAsBase64(shot.file) }
        : undefined;
      await send({
        data: {
          message: message || initialMessage,
          page,
          userAgent: navigator.userAgent.slice(0, 500),
          videoUrl: video.trim(),
          screenshot,
        },
      });
      toast.success("Thanks! Your report was sent. We'll look into it.");
      setMessage("");
      setVideo("");
      shot.clear();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the report");
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report a problem</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Tell us what went wrong and what you expected to happen. We'll also see which page you were on.
        </p>
        <Textarea
          autoFocus
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="For example: I clicked Save on a lead and nothing happened."
          onPaste={(e) => {
            const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (img) {
              e.preventDefault();
              shot.pick(img);
            }
          }}
        />
        <ScreenshotField label="Screenshot (optional)" shot={shot} />
        <div className="flex flex-col gap-1">
          <div className="label-text">Loom or video link (optional)</div>
          <Input
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="https://www.loom.com/share/..."
            className="h-9 text-[13px]"
          />
          <p className="text-[12px] text-muted-foreground">
            Record your screen with{" "}
            <a href="https://www.loom.com" target="_blank" rel="noreferrer" className="underline">
              Loom
            </a>{" "}
            and paste the share link here.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={sending || (message || initialMessage).trim().length < 5}>
            {sending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FeedbackDialog({
  open,
  onOpenChange,
  initialMessage = "",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialMessage?: string;
}) {
  const [message, setMessage] = useState(initialMessage);
  const [sending, setSending] = useState(false);
  const [video, setVideo] = useState("");
  const shot = useScreenshot();
  const page = useRouterState({ select: (s) => s.location.pathname });
  const send = useServerFn(reportProblem);
  const submit = async () => {
    setSending(true);
    try {
      const screenshot = shot.file
        ? { name: shot.file.name.slice(0, 200), type: shot.file.type, base64: await readAsBase64(shot.file) }
        : undefined;
      const text = message.startsWith("[FEEDBACK]") ? message : `[FEEDBACK] ${message || initialMessage}`;
      await send({
        data: {
          message: text,
          page,
          userAgent: navigator.userAgent.slice(0, 500),
          videoUrl: video.trim(),
          screenshot,
        },
      });
      toast.success("Thank you! Your feedback has been shared with the team.");
      setMessage("");
      setVideo("");
      shot.clear();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send your feedback");
    } finally {
      setSending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Submit feedback</DialogTitle>
        </DialogHeader>
        <p className="text-[13px] text-muted-foreground">
          Have an idea, feature request, or suggestion to improve Tracker? Let us know what would make your workflow
          smoother.
        </p>
        <Textarea
          autoFocus
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="For example: I would love to see a bulk tags editor or an automatic reminder when follow-up dates arrive."
          onPaste={(e) => {
            const img = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
            if (img) {
              e.preventDefault();
              shot.pick(img);
            }
          }}
        />
        <ScreenshotField label="Screenshot or mockup (optional)" shot={shot} />
        <div className="flex flex-col gap-1">
          <div className="label-text">Loom or video walkthrough (optional)</div>
          <Input
            value={video}
            onChange={(e) => setVideo(e.target.value)}
            placeholder="https://www.loom.com/share/..."
            className="h-9 text-[13px]"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={sending || (message || initialMessage).trim().length < 5}>
            {sending && <Loader2 className="mr-2 size-4 animate-spin" />}
            Send feedback
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ What's new */

type ChangelogEntry = {
  date: string;
  version: string;
  title: string;
  summary: string;
  highlights: { tag: "New" | "Improved" | "Fixed"; text: string }[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "Oct 16, 2026",
    version: "v2.11",
    title: "In-App Date Pickers, Retina Channels & Rapid Stream Flow",
    summary:
      "Replaced all browser date popups with unified in-app pickers, added crisp 96px Retina channel icons, 3-channel sidebar focus, fast follow-up popovers with message templates, and instant company drawer peek.",
    highlights: [
      {
        tag: "New",
        text: "In-App Date & Date Range Pickers: Beautiful popover calendar with quick presets (Today, Tomorrow, +2d, +3d, +1w, This week, Last month, Year to date), month/year dropdowns, and clean dark/light styling across every screen.",
      },
      {
        tag: "New",
        text: "Fast Follow-up Popover: Schedule +2d, +3d, or +1w follow-ups and copy channel message templates with one click directly inside the Today Lead Stream.",
      },
      {
        tag: "New",
        text: "One-Click Template Copy: Copy personalized outreach messages or copy and mark as sent in a single tap without navigating away.",
      },
      {
        tag: "New",
        text: "Lead Company Drawer Peek: Clicking any lead company name slides open the full details drawer instantly without losing your stream position.",
      },
      {
        tag: "Improved",
        text: "Retina Channel Icons: High-resolution 96px Lanczos PNG icons for All Leads (Sheets), Instagram, LinkedIn, and Email.",
      },
      {
        tag: "Improved",
        text: "Strict Channel Sidebar Isolation: Leads sidebar exclusively displays the 3 primary outreach channels, with custom channels managed cleanly in Sender Accounts.",
      },
      {
        tag: "Improved",
        text: "Real-time Cache Performance: Targeted database query invalidation prevents unnecessary re-renders and delivers faster page navigation.",
      },
    ],
  },
  {
    date: "Oct 15, 2026",
    version: "v2.10",
    title: "Invoice Hub",
    summary:
      "Introducing CRM invoice creation and a better spreadsheet import center.",
    highlights: [
      {
        tag: "New",
        text: "CRM Invoice Workspace: Build, edit, preview, and print branded client invoices with reusable templates, automatic numbering, and deal linking.",
      },
      {
        tag: "Improved",
        text: "Spreadsheet Import Center: Centered column picker dialog with search, live duplicate scanning, and upload safety locks.",
      },
    ],
  },
  {
    date: "Coming soon",
    version: "v2.9",
    title: "More AI Features Are on the Way",
    summary:
      "We are preparing additional AI-assisted tools to make lead management and everyday workflows easier. These updates are not available in every workspace yet.",
    highlights: [
      {
        tag: "New",
        text: "Upcoming AI improvements: new AI-assisted capabilities are in development and will be announced as they roll out to workspaces.",
      },
      {
        tag: "Improved",
        text: "A careful rollout: we are finishing checks before making the new features broadly available. Please be patient while we prepare them.",
      },
    ],
  },
  {
    date: "Oct 14, 2026",
    version: "v2.8",
    title: "Invoice Reliability & Navigation",
    summary:
      "More dependable invoice persistence and smoother navigation from CRM deals into invoice creation.",
    highlights: [
      {
        tag: "Fixed",
        text: "Supabase JSON Typing: Invoice settings now use the database JSON type so the persistence code type-checks against the generated schema.",
      },
      {
        tag: "Improved",
        text: "Deal to Invoice Navigation: Invoice search parameters are explicitly optional, keeping general invoice links compatible while preserving deal prefill.",
      },
      {
        tag: "Improved",
        text: "Save Reliability: Cloud write failures remain visible, and the local cache updates only after the database confirms a save.",
      },
    ],
  },
  {
    date: "Oct 14, 2026",
    version: "v2.7",
    title: "Invoices & Reliable Saving",
    summary:
      "A new invoice workflow for client billing, reusable templates, business defaults, and clearer save status.",
    highlights: [
      {
        tag: "New",
        text: "Invoice Workspace: Create, edit, duplicate, preview, print, and manage client invoices from the CRM.",
      },
      {
        tag: "New",
        text: "Reusable Invoice Templates: Save service line items, currencies, themes, notes, terms, and payment instructions for faster billing.",
      },
      {
        tag: "New",
        text: "Business Profile Defaults: Store sender details and payment information to prefill future invoices.",
      },
      { tag: "New", text: "Invoice Draft Recovery: Recover an interrupted invoice draft from the same browser." },
      {
        tag: "Improved",
        text: "Save Confirmation: Invoice and template actions now report successful saves and surface database errors instead of silently claiming success.",
      },
      {
        tag: "Improved",
        text: "Draft Exit Protection: Tracker warns before you leave an invoice with unsaved changes and offers save, discard or continue editing.",
      },
      {
        tag: "Improved",
        text: "Exchange Rate Recovery: CRM currency settings can refresh rates and attempt a refresh when no rates have been loaded yet.",
      },
      {
        tag: "New",
        text: "Flexible Invoice Totals: Optional rounding, custom fields, and signature details support more invoice formats.",
      },
    ],
  },
  {
    date: "Oct 14, 2026",
    version: "v2.6",
    title: "AI Smart Mapping & Upload Protection",
    summary:
      "Complete overhaul of the spreadsheet import engine with intelligent column mapping, visual table-card picker, upload navigation locks, and automated system alerts.",
    highlights: [
      {
        tag: "New",
        text: "AI Column Matching: Automatically maps messy headers, personalized message drafts, and multi-contact rows using high-accuracy models.",
      },
      {
        tag: "New",
        text: "Table-Card Column Picker: Visual 4-column field selector (Company, People with P1/P2/P3 tabs, Links, Outreach & Notes) replaces long vertical dropdowns.",
      },
      {
        tag: "New",
        text: "Automated Error Diagnostic Alerts: System alerts trigger immediately to developer support on unexpected page or background failures.",
      },
      {
        tag: "New",
        text: "Cleaned Sidebar & ID Menu: Clutter-free sidebar navigation with all guides, shortcuts, feedback, and tour options housed neatly inside the user profile menu.",
      },
      {
        tag: "New",
        text: "Upload Guard & Rollback: Prevents accidental page switches during imports and wipes partial records on cancel.",
      },
      {
        tag: "New",
        text: "Interrupted Session Recovery: Resume incomplete imports if your laptop goes to sleep or browser crashes.",
      },
      {
        tag: "Improved",
        text: "Expanded Duplicate Scanner: Cross-checks emails, website domains, names, and intra-sheet duplicates.",
      },
      {
        tag: "Fixed",
        text: "Multi-Email Mapping: Automatically cascades secondary emails to Person 2 and Person 3 instead of ignoring them.",
      },
    ],
  },
  {
    date: "Oct 12, 2026",
    version: "v2.5",
    title: "Lead Cards & Outreach Workspace",
    summary:
      "Enhanced lead cards view with horizontal and vertical groupings, social outreach direct links, and email draft snippet boxes.",
    highlights: [
      {
        tag: "New",
        text: "Balanced Lead Cards: Shows outreach status, primary contact, personalized email draft snippet, and quick actions.",
      },
      { tag: "Improved", text: "Card Pagination: High-performance paging for card and grid views." },
      { tag: "Fixed", text: "Outreach Date Sync: Automatically marks email sent when outreach dates are present." },
    ],
  },
  {
    date: "Oct 10, 2026",
    version: "v2.4",
    title: "Workspace Customization & Google Sheets Sync",
    summary: "Dynamic auto-creation of stages, channels, sender accounts, and countries from incoming lead sheets.",
    highlights: [
      {
        tag: "New",
        text: "Workspace Item Discovery: Notifies and automatically adds new pipeline stages and channels found in sheets.",
      },
      { tag: "Improved", text: "Automated Google Sheet sync with background cron backup." },
    ],
  },
];

export const LATEST_VERSION = CHANGELOG[0]?.version ?? "v2.9";
const WHATS_NEW_SEEN_KEY = "tracker_last_seen_whats_new_version";

export function WhatsNewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const status = [
    { icon: Database, label: "Database", value: "Operational" },
    { icon: Bot, label: "AI Engine", value: "Active" },
    { icon: Zap, label: "Import API", value: "Online" },
    { icon: ShieldCheck, label: "Sync", value: "Protected" },
  ];
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto p-0">
          <div className="border-b border-border bg-subtle/40 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <DialogTitle className="text-[17px] font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="size-5 text-primary" /> What's New in Tracker
                </DialogTitle>
                <p className="text-[12.5px] text-muted-foreground mt-0.5">
                  Latest updates, improvements, and system status across your workspace.
                </p>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                All Systems Operational
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-3">
              <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Bot className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold text-foreground">New AI features are coming soon</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  We are preparing more AI-assisted tools for Tracker. They will become available in your workspaces
                  soon. Please be patient while we finish the rollout.
                </p>
              </div>
            </div>
            <div className="mt-3.5 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-border/50 text-[11.5px] text-muted-foreground">
              {status.map((s) => (
                <div key={s.label} className="flex items-center gap-1.5">
                  <s.icon className="size-3.5 text-emerald-500" />
                  <span>
                    {s.label}: <strong>{s.value}</strong>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5 space-y-8">
            {CHANGELOG.map((entry) => (
              <div
                key={entry.version}
                className="relative pl-6 before:absolute before:left-2 before:top-2 before:bottom-[-32px] before:w-[2px] before:bg-border last:before:hidden"
              >
                <div className="absolute left-0 top-1.5 size-4 rounded-full border-2 border-primary bg-background flex items-center justify-center">
                  <div className="size-1.5 rounded-full bg-primary" />
                </div>
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-[11.5px] font-mono font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary">
                    {entry.version}
                  </span>
                  <span className="text-[12px] text-muted-foreground">{entry.date}</span>
                </div>
                <h4 className="text-[15px] font-semibold text-foreground mb-1">{entry.title}</h4>
                <p className="text-[12.5px] text-muted-foreground mb-3 leading-relaxed">{entry.summary}</p>
                <div className="flex flex-col gap-1.5 rounded-lg border border-border/60 bg-subtle/30 p-3 text-[12.5px]">
                  {entry.highlights.map((h, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span
                        className={`text-[10px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                          h.tag === "New"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : h.tag === "Improved"
                              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                        }`}
                      >
                        {h.tag}
                      </span>
                      <span className="text-foreground/90">{h.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between border-t border-border p-4 bg-subtle/20 text-[12px] gap-3">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Have feedback on these updates?</span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-[12px] gap-1.5 font-medium border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => {
                  onOpenChange(false);
                  setFeedbackOpen(true);
                }}
              >
                <MessageSquare className="size-3.5" />
                Submit feedback
              </Button>
            </div>
            <Button size="sm" variant="secondary" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        initialMessage="Feedback on recent updates: "
      />
    </>
  );
}

/* ================================================================== guide */

export const GUIDE_URL = "https://tracker.infosized.co/guide";
export const guideUrl = (section?: string) => (section ? `${GUIDE_URL}#${section}` : GUIDE_URL);

export function HelpLink({ section, label = "What does this mean?" }: { section?: string; label?: string }) {
  return (
    <a
      href={guideUrl(section)}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:bg-subtle hover:text-foreground"
    >
      <CircleQuestionMark className="size-3.5" />
    </a>
  );
}

export function WithHelp({ children, section }: { children: ReactNode; section?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <HelpLink section={section} />
    </span>
  );
}

export function StagePill({ stage }: { stage?: { name: string; color?: string | null } | null }) {
  return stage ? <Pill color={stage.color}>{stage.name}</Pill> : <Pill>No stage</Pill>;
}

export function findStage<T extends { id: string }>(stages: T[] | null | undefined, id: string | null | undefined) {
  return !id || !stages ? null : (stages.find((s) => s.id === id) ?? null);
}

const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute",
  border: 0,
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  wordWrap: "normal",
};

/** Radix VisuallyHidden equivalent (screen-reader only span). */
export function VisuallyHidden({ style, ...props }: ComponentProps<"span">) {
  return <span {...props} style={{ ...VISUALLY_HIDDEN, ...style }} />;
}

/* ================================================================== tasks */

export const TASK_SELECT = "*, leads(id,company_name,lead_code)";

export function useTaskMutations(onChange?: () => void) {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: ["lead_tasks"] });
    onChange?.();
  };
  return {
    add: useMutation({
      mutationFn: async (row: Record<string, unknown>) => {
        const { error } = await db.from("lead_tasks").insert(row);
        if (error) throw error;
      },
      onSuccess: done,
      onError: (e: any) => toast.error(e.message ?? "Could not add the task"),
    }),
    update: useMutation({
      mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
        const { error } = await db.from("lead_tasks").update(patch).eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
      onError: (e: any) => toast.error(e.message ?? "Could not save the task"),
    }),
    remove: useMutation({
      mutationFn: async (id: string) => {
        const { error } = await db.from("lead_tasks").delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: done,
      onError: (e: any) => toast.error(e.message ?? "Could not delete the task"),
    }),
  };
}

export function TaskRow({ task, canEdit, showLead = false }: { task: any; canEdit: boolean; showLead?: boolean }) {
  const { update, remove } = useTaskMutations();
  const { data: profiles } = useProfiles();
  const owner = (profiles ?? []).find((p) => p.id === task.assignee_id);
  const done = !!task.completed_at;
  const overdue = !done && task.due_date && task.due_date < new Date().toISOString().slice(0, 10);
  return (
    <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
      <input
        type="checkbox"
        checked={done}
        disabled={!canEdit}
        onChange={(e) =>
          update.mutate({ id: task.id, patch: { completed_at: e.target.checked ? new Date().toISOString() : null } })
        }
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-[13px]", done && "text-muted-foreground line-through")}>{task.title}</div>
        <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
          {showLead && task.leads ? <span>{task.leads.company_name}</span> : null}
          {task.due_date ? <span className={cn(overdue && "text-destructive")}>Due {fmtDate(task.due_date)}</span> : null}
          {owner ? <span>{owner.full_name || owner.email}</span> : null}
        </div>
      </div>
      {canEdit && (
        <Button variant="ghost" size="icon" className="size-7" onClick={() => remove.mutate(task.id)}>
          <Trash2 className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

function AddTaskForm({ leadId, canEdit, onAdded }: { leadId: string; canEdit: boolean; onAdded?: () => void }) {
  const { user } = useAuth();
  const { data: profiles } = useProfiles();
  const { add } = useTaskMutations(onAdded);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState(user?.id ?? "");
  const submit = () => {
    if (!title.trim()) return;
    add.mutate(
      { lead_id: leadId, title: title.trim(), due_date: due || null, assignee_id: owner || null },
      {
        onSuccess: () => {
          setTitle("");
          setDue("");
        },
      },
    );
  };
  if (!canEdit) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Add a to-do"
        className="h-8 min-w-[180px] flex-1 text-[13px]"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <DatePicker value={due || undefined} onChange={(v) => setDue(v || "")} placeholder="Due date" className="w-[150px] text-[13px]" />
      <Select value={owner || undefined} onValueChange={setOwner}>
        <SelectTrigger className="h-8 w-[160px] text-[12px]">
          <SelectValue placeholder="Owner" />
        </SelectTrigger>
        <SelectContent>
          {(profiles ?? []).map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name || p.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button size="sm" onClick={submit} disabled={add.isPending}>
        <Plus className="mr-1 size-3.5" /> Add
      </Button>
    </div>
  );
}

export function LeadTodosCard({
  leadId,
  canEdit,
  cardId = "lead.todos",
}: {
  leadId: string;
  canEdit: boolean;
  cardId?: string;
}) {
  const [showDone, setShowDone] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["lead_tasks", "lead", leadId],
    queryFn: async () => {
      const { data, error } = await db
        .from("lead_tasks")
        .select(TASK_SELECT)
        .eq("lead_id", leadId)
        .order("completed_at", { ascending: true, nullsFirst: true })
        .order("due_date", { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const all = data ?? [];
  const open = all.filter((t) => !t.completed_at);
  const done = all.filter((t) => t.completed_at);
  return (
    <CollapsibleCard
      id={cardId}
      title="To-dos"
      actions={<span className="text-[12px] text-muted-foreground">{open.length} open</span>}
    >
      <div className="flex flex-col gap-3">
        <AddTaskForm leadId={leadId} canEdit={canEdit} />
        {isLoading ? (
          <div className="text-[12px] text-muted-foreground">Loading</div>
        ) : open.length === 0 ? (
          <div className="text-[12px] text-muted-foreground">Nothing to do here yet.</div>
        ) : (
          open.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} />)
        )}
        {done.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowDone((v) => !v)}
              className="w-fit text-[12px] text-muted-foreground hover:text-foreground"
            >
              {showDone ? "Hide" : "Show"} completed ({done.length})
            </button>
            {showDone && done.map((t) => <TaskRow key={t.id} task={t} canEdit={canEdit} />)}
          </>
        )}
      </div>
    </CollapsibleCard>
  );
}

/* ============================================================ lead events */

export const ACTIVITY_TYPE_OPTIONS = [
  { value: "email_sent", label: "Email sent", group: "Outreach" },
  { value: "linkedin_sent", label: "LinkedIn message sent", group: "Outreach" },
  { value: "linkedin_connection_sent", label: "LinkedIn connection request sent", group: "Outreach" },
  { value: "instagram_sent", label: "Instagram message sent", group: "Outreach" },
  { value: "followup_sent", label: "Follow-up sent", group: "Outreach" },
  { value: "loom_sent", label: "Loom sent", group: "Outreach" },
  { value: "email_replied", label: "Email replied", group: "Replies" },
  { value: "linkedin_replied", label: "LinkedIn replied", group: "Replies" },
  { value: "instagram_replied", label: "Instagram replied", group: "Replies" },
  { value: "call", label: "Call", group: "Other" },
  { value: "meeting_booked", label: "Meeting booked", group: "Other" },
  { value: "client_closed", label: "Client closed", group: "Other" },
  { value: "note", label: "Note", group: "Other" },
];

export const EVENT_ICONS: Record<string, LucideIcon> = {
  created: CirclePlus,
  lead_created: CirclePlus,
  stage_changed: Flag,
  status_changed: Flag,
  priority_changed: Flag,
  email_sent: Mail,
  email_viewed: Mail,
  email_replied: Mail,
  loom_sent: CirclePlay,
  loom_watched: CirclePlay,
  linkedin_connection_sent: UserPlus,
  linkedin_sent: Linkedin,
  linkedin_replied: Linkedin,
  instagram_sent: Instagram,
  instagram_replied: MessageSquare,
  meeting_booked: Activity,
  client_closed: Activity,
  pushed_to_crm: Upload,
  research_export_email: Mail,
  archived: Archive,
  restored: ArchiveRestore,
  followup_sent: Link2,
  call: Phone,
  note: StickyNote,
};

export const EVENT_LABELS: Record<string, string> = {
  created: "Lead created",
  lead_created: "Lead created",
  stage_changed: "Stage changed",
  status_changed: "Status changed",
  priority_changed: "Priority changed",
  email_sent: "Email sent",
  email_viewed: "Email viewed",
  email_replied: "Email replied",
  loom_sent: "Loom sent",
  loom_watched: "Loom watched",
  linkedin_connection_sent: "LinkedIn connection request sent",
  linkedin_sent: "LinkedIn message sent",
  linkedin_replied: "LinkedIn replied",
  instagram_sent: "Instagram message sent",
  instagram_replied: "Instagram replied",
  meeting_booked: "Meeting booked",
  client_closed: "Client closed",
  pushed_to_crm: "Pushed to CRM",
  research_export_email: "Lead profile emailed to me",
  archived: "Archived",
  restored: "Restored",
  followup_sent: "Follow-up sent",
  call: "Call",
  note: "Note added",
};

type LeadEventLike = { event_type: string; meta?: unknown; [key: string]: any };

export function eventMeta(e: LeadEventLike): Record<string, any> {
  return e.meta && typeof e.meta === "object" ? (e.meta as Record<string, any>) : {};
}

export function defaultEventLabel(e: LeadEventLike) {
  const m = eventMeta(e);
  if (e.event_type === "stage_changed" && m.from && m.to) return `Stage changed from ${m.from} to ${m.to}`;
  if (e.event_type === "status_changed" && m.from && m.to) return `Status changed from ${m.from} to ${m.to}`;
  if (e.event_type === "priority_changed" && m.from && m.to) return `Priority changed from ${m.from} to ${m.to}`;
  return EVENT_LABELS[e.event_type] ?? e.event_type.replace(/_/g, " ");
}

export function eventLabel(e: LeadEventLike) {
  const m = eventMeta(e);
  return typeof m.label === "string" && m.label.trim() ? m.label : defaultEventLabel(e);
}

const FLAG_FOR_EVENT: Record<string, { field: string; label: string }> = {
  email_sent: { field: "email_sent", label: "Email sent" },
  email_viewed: { field: "email_viewed", label: "Email viewed" },
  email_replied: { field: "email_replied", label: "Email replied" },
  loom_sent: { field: "loom_sent", label: "Loom sent" },
  loom_watched: { field: "loom_watched", label: "Loom watched" },
  linkedin_connection_sent: { field: "linkedin_connection_sent", label: "LinkedIn connection request sent" },
  linkedin_sent: { field: "linkedin_sent", label: "LinkedIn message sent" },
  linkedin_replied: { field: "linkedin_replied", label: "LinkedIn replied" },
  instagram_sent: { field: "instagram_sent", label: "Instagram sent" },
  instagram_replied: { field: "instagram_replied", label: "Instagram replied" },
  meeting_booked: { field: "meeting_booked", label: "Meeting booked" },
  client_closed: { field: "client_closed", label: "Client closed" },
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 6e4).toISOString().slice(0, 16);
}

function EventTypeSelect({
  value,
  onChange,
  current,
}: {
  value: string;
  onChange: (v: string) => void;
  current?: string;
}) {
  const known = ACTIVITY_TYPE_OPTIONS.some((o) => o.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-[210px] text-[12px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {!known && current && (
          <SelectItem value={current}>{EVENT_LABELS[current] ?? current.replace(/_/g, " ")}</SelectItem>
        )}
        {ACTIVITY_TYPE_OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.group === "Other" ? o.label : `${o.group}: ${o.label}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function useLeadEventActions(onChange?: () => void) {
  const update = useServerFn(updateLeadEvent);
  const del = useServerFn(deleteLeadEvent);
  return {
    saveEdit: async (e: any, v: { label: string; occurredAt: string; eventType: string }) => {
      const label = v.label.trim() === defaultEventLabel({ event_type: v.eventType, meta: e.meta }) ? "" : v.label.trim();
      try {
        await update({
          data: {
            id: e.id,
            label,
            occurredAt: v.occurredAt,
            ...(v.eventType === e.event_type ? {} : { eventType: v.eventType }),
          },
        });
        toast.success("Activity updated");
        onChange?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update this entry");
      }
    },
    remove: async (e: any, patchLead?: (patch: Record<string, unknown>) => Promise<unknown>) => {
      if (
        !window.confirm(
          `Delete "${eventLabel(e)}"${e.leads?.company_name ? ` for ${e.leads.company_name}` : ""}? It also stops counting in the Ledger and Outreach Tracker.`,
        )
      )
        return;
      try {
        await del({ data: { id: e.id } });
        toast.success("Activity entry deleted");
        const flag = FLAG_FOR_EVENT[e.event_type];
        if (flag && e.lead_id) {
          const { data } = await db.from("leads").select(flag.field).eq("id", e.lead_id).maybeSingle();
          if (
            (data as any)?.[flag.field] === true &&
            window.confirm(`"${flag.label}" is still ticked on this lead. Untick it too?`)
          ) {
            const patch = { [flag.field]: false, [`${flag.field}_at`]: null };
            if (patchLead) await patchLead(patch);
            else await db.from("leads").update(patch).eq("id", e.lead_id);
          }
        }
        onChange?.();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not delete this entry");
      }
    },
    add: async (v: { leadId: string; type: string; label: string; occurredAt: string }) => {
      const flag = FLAG_FOR_EVENT[v.type];
      if (flag) {
        const { data: lead } = await db
          .from("leads")
          .select(`stage_id, ${flag.field}`)
          .eq("id", v.leadId)
          .maybeSingle();
        const row = (lead ?? {}) as Record<string, any>;
        if (lead && row[flag.field] !== true) {
          const patch: Record<string, unknown> = { [flag.field]: true, [`${flag.field}_at`]: v.occurredAt };
          const { data: stages } = await db
            .from("stages")
            .select("id, name, order_index, board, is_won, is_lost, is_archived, is_reply_stage")
            .eq("board", "lead");
          const next = autoStageForOutreach((stages ?? []) as any[], row.stage_id, patch);
          if (next) patch["stage_id"] = next.id;
          const { error } = await db.from("leads").update(patch).eq("id", v.leadId);
          if (error) return void toast.error(error.message);
          if (v.label.trim()) {
            const { data: ev } = await db
              .from("lead_events")
              .select("id, meta, event_type")
              .eq("lead_id", v.leadId)
              .eq("event_type", v.type)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (ev) await update({ data: { id: ev.id, label: v.label.trim() } }).catch(() => undefined);
          }
          toast.success(`${flag.label} logged${next ? ` · stage moved to ${next.name}` : ""}`);
          onChange?.();
          return;
        }
      }
      const { data: u } = await supabase.auth.getUser();
      const label = v.label.trim();
      const { error } = await db.from("lead_events").insert({
        lead_id: v.leadId,
        event_type: v.type,
        occurred_at: v.occurredAt,
        meta: { ...(label ? { label } : {}), manual: true },
        created_by: u.user?.id ?? null,
      });
      if (error) return void toast.error(error.message);
      toast.success("Activity added");
      onChange?.();
    },
  };
}

export function LeadEventRow({
  e,
  canEdit,
  showLead = false,
  onEdit,
  onDelete,
}: {
  e: any;
  canEdit: boolean;
  showLead?: boolean;
  onEdit: (v: { label: string; occurredAt: string; eventType: string }) => Promise<unknown>;
  onDelete?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(eventLabel(e));
  const [when, setWhen] = useState(toLocalInput(e.occurred_at));
  const [type, setType] = useState<string>(e.event_type);
  const [saving, setSaving] = useState(false);
  const Icon = EVENT_ICONS[e.event_type] ?? Activity;
  const meta = eventMeta(e);
  if (editing)
    return (
      <div className="flex flex-col gap-1.5 border-l-2 border-foreground pl-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <EventTypeSelect
            value={type}
            current={e.event_type}
            onChange={(t) => {
              if (label === defaultEventLabel({ event_type: type, meta: e.meta }))
                setLabel(defaultEventLabel({ event_type: t, meta: e.meta }));
              setType(t);
            }}
          />
          <Input
            type="datetime-local"
            value={when}
            onChange={(ev) => setWhen(ev.target.value)}
            className="h-8 w-auto text-[12px]"
          />
        </div>
        <Input value={label} onChange={(ev) => setLabel(ev.target.value)} className="h-8 text-[13px]" autoFocus />
        <div className="flex gap-1.5">
          <Button
            size="sm"
            className="h-8"
            disabled={saving || !when}
            onClick={async () => {
              setSaving(true);
              try {
                await onEdit({ label, occurredAt: new Date(when).toISOString(), eventType: type });
                setEditing(false);
              } finally {
                setSaving(false);
              }
            }}
          >
            <Check className="size-3.5" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditing(false)}>
            <X className="size-3.5" /> Cancel
          </Button>
        </div>
      </div>
    );
  return (
    <div className="group flex gap-2 border-l-2 border-border pl-3">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">
          {showLead && e.lead_id && (
            <>
              <LeadPeekLink id={e.lead_id} className="font-semibold hover:underline hover:underline-offset-4">
                {e.leads?.company_name ?? "Lead"}
              </LeadPeekLink>
              <span className="text-muted-foreground"> · </span>
            </>
          )}
          {eventLabel(e)}
        </div>
        <div className="label-text mt-0.5">
          {fmtDateTime(e.occurred_at)}
          {e.profiles?.full_name || e.profiles?.email ? ` · ${e.profiles.full_name ?? e.profiles.email}` : ""}
          {meta.edited ? " · edited" : ""}
        </div>
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-start gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            title="Edit this entry"
            onClick={() => {
              setLabel(eventLabel(e));
              setWhen(toLocalInput(e.occurred_at));
              setType(e.event_type);
              setEditing(true);
            }}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            title="Delete this entry"
            onClick={onDelete}
            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-subtle hover:text-negative"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

type PickedLead = { id: string; company_name: string | null; lead_code: string | null };

export function LeadPicker({
  value,
  onChange,
  placeholder = "Find lead…",
  className,
}: {
  value: PickedLead | null;
  onChange: (lead: PickedLead | null) => void;
  placeholder?: string;
  className?: string;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickedLead[]>([]);
  useEffect(() => {
    if (value || q.trim().length < 2) return setResults([]);
    const t = setTimeout(async () => {
      const term = q.trim().replace(/[%_,()]/g, " ");
      const { data } = await db
        .from("leads")
        .select("id, company_name, lead_code")
        .or(`company_name.ilike.%${term}%,lead_code.ilike.%${term}%,primary_contact.ilike.%${term}%`)
        .limit(8);
      setResults((data ?? []) as PickedLead[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q, value]);
  if (value)
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-[12px]">
        {value.company_name} <span className="text-muted-foreground">{value.lead_code}</span>
        <button type="button" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
          <X className="size-3" />
        </button>
      </span>
    );
  return (
    <div className={cn("relative", className)}>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-full min-w-[200px] text-[12px]"
      />
      {results.length > 0 && (
        <div className="absolute z-20 mt-1 w-[260px] rounded-md border border-border bg-popover p-1 shadow-md">
          {results.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                onChange(r);
                setQ("");
              }}
              className="flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[12px] hover:bg-subtle"
            >
              <span className="truncate">{r.company_name}</span>
              <span className="text-muted-foreground">{r.lead_code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AddActivityForm({
  leadId,
  onAdd,
  onCancel,
}: {
  leadId?: string;
  onAdd: (v: { leadId: string; type: string; label: string; occurredAt: string }) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [type, setType] = useState("note");
  const [label, setLabel] = useState("");
  const [when, setWhen] = useState(() => toLocalInput(new Date().toISOString()));
  const [picked, setPicked] = useState<PickedLead | null>(null);
  const [saving, setSaving] = useState(false);
  const target = leadId ?? picked?.id;
  const needsText = type === "note" || type === "call";
  const valid = !!target && (!needsText || !!label.trim());
  const submit = async () => {
    if (!valid || !target) return;
    setSaving(true);
    try {
      await onAdd({ leadId: target, type, label, occurredAt: new Date(when).toISOString() });
      setLabel("");
      setType("note");
      setWhen(toLocalInput(new Date().toISOString()));
      setPicked(null);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-dashed border-border p-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {!leadId && <LeadPicker value={picked} onChange={setPicked} />}
        <EventTypeSelect value={type} onChange={setType} />
        <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="h-8 w-auto text-[12px]" />
      </div>
      <Input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={needsText ? "What happened? e.g. Called her, no answer" : "Details (optional)"}
        className="h-8 text-[13px]"
        autoFocus={!!leadId}
      />
      <div className="flex gap-1.5">
        <Button size="sm" className="h-8" disabled={!valid || saving} onClick={() => void submit()}>
          <Check className="size-3.5" /> Add
        </Button>
        <Button size="sm" variant="ghost" className="h-8" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/* ========================================================= contact emails */

export type ContactEmail = { email: string; verified: boolean };

export function parseEmails(value: unknown): ContactEmail[] {
  return Array.isArray(value)
    ? value
        .map((v) => {
          if (typeof v === "string") return v.trim() ? { email: v.trim(), verified: false } : null;
          if (v && typeof v === "object" && typeof (v as any).email === "string") {
            const e = String((v as any).email).trim();
            return e ? { email: e, verified: !!(v as any).verified } : null;
          }
          return null;
        })
        .filter((v): v is ContactEmail => v !== null)
    : [];
}

export function addEmail(list: ContactEmail[], value: string, primary?: string | null) {
  const email = normalizeEmail(value) ?? value.trim();
  if (!email) return list;
  const lower = email.toLowerCase();
  return list.some((e) => e.email.toLowerCase() === lower) || (primary ?? "").toLowerCase() === lower
    ? list
    : [...list, { email, verified: false }];
}

/* ============================================================== lead peek */

const LeadPeekContext = createContext<{ openLead: (id: string) => void }>({ openLead: () => {} });
export const useLeadPeek = () => useContext(LeadPeekContext);

const PEEK_WIDTH_KEY = "tracker.leadPeek.width";
const PEEK_DEFAULT = 480;
const PEEK_MIN = 380;

function storedPeekWidth() {
  try {
    const n = Number(window.localStorage.getItem(PEEK_WIDTH_KEY));
    return n >= PEEK_MIN ? n : PEEK_DEFAULT;
  } catch {
    return PEEK_DEFAULT;
  }
}

export function LeadPeekProvider({ children }: { children: ReactNode }) {
  const [leadId, setLeadId] = useState<string | null>(null);
  const openLead = useCallback((id: string) => setLeadId(id), []);
  const [width, setWidth] = useState(PEEK_DEFAULT);
  useEffect(() => setWidth(storedPeekWidth()), []);
  const save = (w: number) => {
    try {
      window.localStorage.setItem(PEEK_WIDTH_KEY, String(w));
    } catch {
      /* storage blocked */
    }
  };
  return (
    <LeadPeekContext.Provider value={{ openLead }}>
      {children}
      <Sheet open={!!leadId} onOpenChange={(o) => !o && setLeadId(null)}>
        <SheetContent
          side="right"
          style={{ "--peek-w": `${width}px` } as CSSProperties}
          className="flex w-full flex-col gap-0 border-l border-border bg-surface p-0 sm:w-[var(--peek-w)] sm:max-w-[calc(100vw-120px)] [&>button.absolute]:hidden"
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Drag to resize the panel"
            title="Drag to resize, double-click to reset"
            onPointerDown={(e) => {
              e.preventDefault();
              const maxW = () => Math.max(PEEK_MIN, window.innerWidth - 120);
              let w = width;
              const move = (ev: PointerEvent) => {
                w = Math.round(Math.min(maxW(), Math.max(PEEK_MIN, window.innerWidth - ev.clientX)));
                setWidth(w);
              };
              const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
                document.body.style.removeProperty("cursor");
                document.body.style.removeProperty("user-select");
                save(w);
              };
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
              window.addEventListener("pointermove", move);
              window.addEventListener("pointerup", up);
            }}
            onDoubleClick={() => {
              setWidth(PEEK_DEFAULT);
              save(PEEK_DEFAULT);
            }}
            className="group/resize absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize sm:block"
          >
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors group-hover/resize:bg-foreground/30" />
          </div>
          <SheetTitle className="sr-only">Lead details</SheetTitle>
          {leadId && <LeadPeek id={leadId} onClose={() => setLeadId(null)} />}
        </SheetContent>
      </Sheet>
    </LeadPeekContext.Provider>
  );
}

/** A link to a lead that opens the peek drawer on plain click (new tab on modified click). */
export function LeadPeekLink({ id, className, children }: { id: string; className?: string; children: ReactNode }) {
  const { openLead } = useLeadPeek();
  return (
    <a
      href={`/lt/leads/${id}`}
      onClick={(e) => {
        e.stopPropagation();
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        openLead(id);
      }}
      className={cn("text-left", className)}
    >
      {children}
    </a>
  );
}

const OUTREACH_STEPS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "linkedin_connection_sent", label: "Connection request", icon: Linkedin },
  { key: "linkedin_sent", label: "LinkedIn message", icon: Linkedin },
  { key: "linkedin_replied", label: "LinkedIn reply", icon: Linkedin },
  { key: "instagram_sent", label: "Instagram message", icon: Instagram },
  { key: "instagram_replied", label: "Instagram reply", icon: Instagram },
  { key: "email_sent", label: "Email sent", icon: Mail },
  { key: "email_viewed", label: "Email viewed", icon: Mail },
  { key: "email_replied", label: "Email reply", icon: Mail },
  { key: "loom_sent", label: "Loom sent", icon: Video },
  { key: "loom_watched", label: "Loom watched", icon: Video },
  { key: "meeting_booked", label: "Meeting booked", icon: CalendarClock },
  { key: "client_closed", label: "Client closed", icon: Check },
];

function copyText(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Could not copy"),
  );
}

function contactHref(kind: string, value: string) {
  const v = value.trim();
  if (kind === "Email") return `mailto:${v}`;
  if (kind === "Phone") return `tel:${v.replace(/[^\d+]/g, "")}`;
  if (kind === "Instagram" && /^@[\w.]+$/.test(v)) return `https://instagram.com/${v.slice(1)}`;
  return parseUrl(v)?.href ?? null;
}

const URL_RE = /((?:https?:\/\/|www\.)[^\s<>"')\]]+)/gi;

function LinkPart({ part }: { part: string }) {
  const [, body, trail] = part.match(/^(.*?)([.,;:!?]*)$/) ?? [part, part, ""];
  const href = parseUrl(body)?.href;
  return href ? (
    <>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="break-all text-info underline underline-offset-2 hover:text-foreground"
      >
        {body}
      </a>
      {trail}
    </>
  ) : (
    <>{part}</>
  );
}

function Linkify({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return <>{parts.map((p, i) => (i % 2 === 1 ? <LinkPart key={i} part={p} /> : p))}</>;
}

function PeekSectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="section-label">{children}</span>
      {right}
    </div>
  );
}

function LeadPeek({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useAuth();
  const canEdit = can("lead.leads");
  const { data: stages } = useStages("lead");
  const { data: channels } = useChannels();
  const { data: senders } = useSenderAccounts();
  const { data: countries } = useCountries(false);
  const { data: tags } = useTags();
  const { data: lead, isLoading } = useQuery({
    queryKey: ["lead_detail", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("leads")
        .select(
          "*, lead_contacts(*), lead_links(*), lead_followups(*), lead_tags(tag_id), crm_records(id, estimated_value)",
        )
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });
  const { data: events } = useQuery({
    queryKey: ["lead_events", id],
    queryFn: async () => {
      const { data, error } = await db
        .from("lead_events")
        .select("id, event_type, occurred_at, meta, profiles(full_name, email)")
        .eq("lead_id", id)
        .order("occurred_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  if (isLoading) return <Loading />;
  if (!lead)
    return <div className="p-6 text-[13px] text-muted-foreground">This lead was not found. It may have been deleted.</div>;

  const stage = findStage(stages ?? [], lead.stage_id);
  const channelName = (cid: string | null) => channels?.find((c) => c.id === cid)?.name ?? "-";
  const country = countries?.find((c) => c.id === lead.country_id);
  const sender = senders?.find((s) => s.id === lead.sender_account_id);
  const contacts = [...(lead.lead_contacts ?? [])].sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0));
  const primary: any = contacts.find((c: any) => c.is_primary) ?? contacts[0] ?? {};
  const tagIds: string[] = (lead.lead_tags ?? []).map((t: any) => t.tag_id);
  const crm = Array.isArray(lead.crm_records) ? lead.crm_records[0] : lead.crm_records;
  const followups = [...(lead.lead_followups ?? [])].sort(
    (a: any, b: any) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0),
  );
  const nextStep: any = followups.find((f: any) => f.status !== "sent" && f.status !== "skipped");
  const today = todayISO();
  const due: string | null = lead.next_followup_date;
  const tone = due ? (due < today ? "negative" : due === today ? "warning" : "info") : "neutral";
  const doneSteps = OUTREACH_STEPS.filter((s) => lead[s.key]);
  const reach: [LucideIcon, string, string, string?][] = [];
  if (primary.email) reach.push([Mail, "Email", primary.email, primary.email_verified ? "Verified" : undefined]);
  for (const e of parseEmails(primary.emails)) reach.push([Mail, "Email", e.email, e.verified ? "Verified" : undefined]);
  if (primary.phone) reach.push([Phone, "Phone", primary.phone]);
  if (primary.linkedin_url || lead.company_linkedin_url)
    reach.push([Linkedin, "LinkedIn", primary.linkedin_url || lead.company_linkedin_url]);
  if (primary.instagram_url || lead.instagram_url)
    reach.push([Instagram, "Instagram", primary.instagram_url || lead.instagram_url]);
  if (lead.website_url) reach.push([Globe, "Website", lead.website_url]);
  if (lead.youtube_url) reach.push([Youtube, "YouTube", lead.youtube_url]);
  if (lead.loom_url) reach.push([Video, "Loom", lead.loom_url]);
  const toneVar = `var(--${tone === "neutral" ? "faint" : tone})`;

  return (
    <>
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <span className="font-mono text-[11px] text-faint">{lead.lead_code}</span>
        <StagePill stage={stage} />
        <span className="flex-1" />
        <Button asChild size="sm" className="h-8">
          <Link to="/lt/leads/$id" params={{ id }} onClick={onClose}>
            <PencilLine />
            Open full page
          </Link>
        </Button>
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-subtle hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <div>
          <h2 className="text-[21px] font-semibold tracking-tight">{lead.company_name || "Untitled lead"}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {[lead.primary_contact || primary.person_name, primary.job_title].filter(Boolean).join(", ") ||
              "No contact yet"}
            {country ? ` · ${country.flag_emoji ?? ""} ${country.name}` : ""}
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {lead.status && <Pill>{String(lead.status).replace(/_/g, " ")}</Pill>}
            {lead.priority && (
              <Pill tone={lead.priority === "high" ? "negative" : lead.priority === "medium" ? "warning" : "neutral"}>
                {lead.priority} priority
              </Pill>
            )}
            {tagIds.map((tid) => {
              const t = tags?.find((x) => x.id === tid);
              return t ? (
                <Pill key={tid} color={t.color}>
                  {t.name}
                </Pill>
              ) : null;
            })}
            {crm && (
              <Link to="/crm/records/$id" params={{ id: crm.id }} onClick={onClose}>
                <Pill tone="info">In CRM</Pill>
              </Link>
            )}
          </div>
        </div>
        <div
          className="flex flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5"
          style={{
            backgroundColor: `color-mix(in oklab, ${toneVar} 9%, var(--surface))`,
            borderColor: `color-mix(in oklab, ${toneVar} 28%, transparent)`,
          }}
        >
          <span
            className="grid size-8 shrink-0 place-items-center rounded-lg"
            style={{ backgroundColor: `color-mix(in oklab, ${toneVar} 18%, var(--surface))`, color: toneVar }}
          >
            <CalendarClock className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">
              {due
                ? due < today
                  ? `Follow-up overdue since ${fmtDate(due)}`
                  : due === today
                    ? "Follow-up due today"
                    : `Next follow-up ${fmtDate(due)}`
                : "No follow-up set"}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {nextStep
                ? `Step ${nextStep.sequence_number} of ${followups.length}${nextStep.channel_id ? ` via ${channelName(nextStep.channel_id)}` : ""}${nextStep.notes ? `: ${nextStep.notes}` : ""}`
                : "Schedule follow-ups from the full page"}
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
          <dt className="text-muted-foreground">Channel</dt>
          <dd>{channelName(lead.channel_id)}</dd>
          <dt className="text-muted-foreground">Sent from</dt>
          <dd className="truncate">{sender ? `${sender.label ?? sender.identifier}` : "-"}</dd>
          <dt className="text-muted-foreground">Date added</dt>
          <dd className="tabular">{fmtDate(lead.date_added)}</dd>
          <dt className="text-muted-foreground">Last contacted</dt>
          <dd className="tabular">{lead.last_contacted_at ? fmtDateTime(lead.last_contacted_at) : "Never"}</dd>
          {lead.contacted_channel_id && (
            <>
              <dt className="text-muted-foreground">Contacted via</dt>
              <dd>{channelName(lead.contacted_channel_id)}</dd>
            </>
          )}
          {lead.reply_channel_id && (
            <>
              <dt className="text-muted-foreground">Replied on</dt>
              <dd>
                {channelName(lead.reply_channel_id)}
                {lead.reply_sentiment ? `, ${lead.reply_sentiment}` : ""}
              </dd>
            </>
          )}
        </dl>
        <section>
          <PeekSectionLabel>How to reach</PeekSectionLabel>
          {reach.length ? (
            <div className="overflow-hidden rounded-xl border border-border">
              {reach.map(([Icon, kind, value, badge], i) => {
                const href = contactHref(kind, value);
                return (
                  <div
                    key={i}
                    className="group flex items-center gap-2 border-b border-border/70 px-3 py-2 text-[12.5px] last:border-0"
                  >
                    <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="w-16 shrink-0 text-muted-foreground">{kind}</span>
                    {href ? (
                      <a
                        href={href}
                        {...(href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}
                        className="min-w-0 flex-1 truncate underline-offset-2 hover:text-info hover:underline"
                        title={value}
                      >
                        {value}
                      </a>
                    ) : (
                      <span className="min-w-0 flex-1 truncate">{value}</span>
                    )}
                    {badge && <Pill tone="positive">{badge}</Pill>}
                    <button
                      type="button"
                      onClick={() => copyText(value)}
                      title="Copy"
                      className="grid size-6 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-subtle hover:text-foreground group-hover:opacity-100 focus:opacity-100"
                    >
                      <Copy className="size-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No contact details yet.</p>
          )}
          {contacts.length > 1 && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              {contacts.length - 1} more {contacts.length > 2 ? "people" : "person"} on the full page
            </p>
          )}
        </section>
        <section>
          <PeekSectionLabel
            right={
              <span className="font-mono text-[11px] text-faint">
                {doneSteps.length}/{OUTREACH_STEPS.length}
              </span>
            }
          >
            Outreach so far
          </PeekSectionLabel>
          <div className="flex flex-wrap gap-1.5">
            {OUTREACH_STEPS.map((s) => {
              const done = !!lead[s.key];
              const Icon = done ? Check : s.icon;
              return (
                <span
                  key={s.key}
                  title={done && lead[s.key + "_at"] ? fmtDateTime(lead[s.key + "_at"]) : "Not yet"}
                  className={cn(
                    "inline-flex h-6 items-center gap-1 rounded-full px-2 text-[11.5px]",
                    done
                      ? "border border-positive/35 bg-positive/10 text-foreground [&>svg]:text-positive"
                      : "border border-dashed border-border text-faint",
                  )}
                >
                  <Icon className="size-3" />
                  {s.label}
                  {s.key === "loom_watched" && done && lead.loom_watch_percent ? ` ${lead.loom_watch_percent}%` : ""}
                </span>
              );
            })}
          </div>
        </section>
        {(lead.personalized_message || lead.message_angle) && (
          <section>
            <PeekSectionLabel
              right={
                lead.personalized_message ? (
                  <button
                    type="button"
                    onClick={() => copyText(lead.personalized_message)}
                    className="flex items-center gap-1 text-[12px] text-muted-foreground hover:text-foreground"
                  >
                    <Copy className="size-3" />
                    Copy
                  </button>
                ) : null
              }
            >
              Message{lead.message_angle ? ` · ${lead.message_angle}` : ""}
            </PeekSectionLabel>
            <div className="rounded-xl border border-border bg-subtle px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">
              {lead.personalized_message ? (
                <Linkify text={lead.personalized_message} />
              ) : (
                <span className="text-faint">No message written yet</span>
              )}
            </div>
          </section>
        )}
        <section>
          <PeekSectionLabel>Notes</PeekSectionLabel>
          {lead.research_notes || lead.additional_notes ? (
            <div className="space-y-2 rounded-xl border border-border bg-subtle px-3 py-2.5 text-[12.5px] leading-relaxed whitespace-pre-wrap">
              {lead.research_notes && (
                <div>
                  <div className="mb-0.5 font-medium">Research</div>
                  <Linkify text={lead.research_notes} />
                </div>
              )}
              {lead.additional_notes && (
                <div>
                  <div className="mb-0.5 font-medium">Additional</div>
                  <Linkify text={lead.additional_notes} />
                </div>
              )}
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No notes yet.</p>
          )}
        </section>
        <LeadTodosCard leadId={id} canEdit={canEdit} cardId="lead.peek.todos" />
        <section>
          <PeekSectionLabel>Activity</PeekSectionLabel>
          {events?.length ? (
            <ol className="ml-1.5 space-y-3 border-l border-border pl-4">
              {events.slice(0, 8).map((ev, i) => (
                <li key={ev.id} className="relative text-[12.5px]">
                  <span
                    className={cn(
                      "absolute top-1.5 -left-[20.5px] size-2 rounded-full border-[1.5px]",
                      i === 0 ? "border-foreground bg-foreground" : "border-faint bg-surface",
                    )}
                  />
                  {(() => {
                    try {
                      return eventLabel(ev);
                    } catch {
                      return defaultEventLabel(ev);
                    }
                  })()}
                  <span className="block font-mono text-[11px] text-faint">{fmtDateTime(ev.occurred_at)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">No activity yet.</p>
          )}
        </section>
      </div>
      <div className="flex gap-2 border-t border-border bg-subtle/50 px-4 py-3">
        <Button asChild variant="outline" size="sm">
          <a href={`/lt/leads/${id}`} target="_blank" rel="noreferrer">
            <ExternalLink />
            New tab
          </a>
        </Button>
        {crm && (
          <Button asChild variant="outline" size="sm">
            <Link to="/crm/records/$id" params={{ id: crm.id }} onClick={onClose}>
              <Send />
              CRM record
            </Link>
          </Button>
        )}
        <Button asChild size="sm" className="flex-1">
          <Link to="/lt/leads/$id" params={{ id }} onClick={onClose}>
            <PencilLine />
            Edit full lead
          </Link>
        </Button>
      </div>
    </>
  );
}

/* ====================================================== test-app badge */

const TEST_BADGE_KEY = "tracker.test-mode-indicator";
const TEST_BADGE_EVENT = "tracker:test-mode-indicator";

function testBadgeVisible() {
  return typeof window === "undefined" || window.localStorage.getItem(TEST_BADGE_KEY) !== "off";
}

export function TestAppIndicatorToggle() {
  const { isAdmin } = useAuth();
  const [on, setOn] = useState(true);
  useEffect(() => setOn(testBadgeVisible()), []);
  if (!isAdmin) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[13px] font-medium">Test app indicator</div>
        <div className="label-text mt-0.5">
          Show or hide the TEST APP badge.
        </div>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          const next = !on;
          window.localStorage.setItem(TEST_BADGE_KEY, next ? "on" : "off");
          window.dispatchEvent(new Event(TEST_BADGE_EVENT));
          setOn(next);
        }}
      >
        {on ? "Hide test badge" : "Show test badge"}
      </Button>
    </div>
  );
}

/* ========================================================== quick backup */

function QuickBackupButton() {
  const backup = useServerFn(runSheetBackup);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await backup({});
      toast.success("Google Sheets backup completed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Backup failed. Your app data is safe.");
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: ["app_settings", "auto_backup"] });
    }
  };
  return (
    <Button variant="ghost" size="icon" title="Quick backup to Google Sheet" disabled={busy} onClick={() => void run()}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <CloudUpload className="size-4" />}
    </Button>
  );
}

/* ==================================================================== nav */

type NavItem = { to: string; label: string; icon: LucideIcon; perm: string; group: "primary" | "secondary" };

export const LEAD_NAV: NavItem[] = [
  { to: "/lt/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "lead.dashboard", group: "primary" },
  { to: "/lt/leads", label: "Leads", icon: Table2, perm: "lead.leads", group: "primary" },
  { to: "/lt/followups", label: "Follow-ups", icon: CalendarClock, perm: "lead.leads", group: "primary" },
  { to: "/lt/todos", label: "To-dos", icon: ListTodo, perm: "lead.leads", group: "primary" },
  { to: "/lt/outreach", label: "Outreach Tracker", icon: Gauge, perm: "lead.outreach_tracker", group: "primary" },
  { to: "/lt/activity", label: "Activity", icon: History, perm: "lead.leads", group: "secondary" },
  { to: "/lt/ledger", label: "Ledger", icon: ListChecks, perm: "lead.ledger", group: "secondary" },
  { to: "/lt/archive", label: "Archive", icon: Boxes, perm: "lead.archive", group: "secondary" },
  { to: "/lt/data", label: "Import / Export", icon: Database, perm: "lead.import_export", group: "secondary" },
];

export const CRM_NAV: NavItem[] = [
  { to: "/crm/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "crm.records", group: "primary" },
  { to: "/crm/records", label: "Records", icon: Table2, perm: "crm.records", group: "primary" },
  { to: "/crm/pipeline", label: "Pipeline", icon: Columns3, perm: "crm.pipeline", group: "primary" },
  { to: "/crm/revenue", label: "Revenue", icon: ChartColumn, perm: "crm.revenue", group: "primary" },
  { to: "/crm/invoices", label: "Invoices", icon: ReceiptText, perm: "crm.records", group: "primary" },
  { to: "/crm/todos", label: "To-dos", icon: ListChecks, perm: "crm.todos", group: "secondary" },
  { to: "/crm/followups", label: "Follow-ups", icon: CalendarClock, perm: "crm.followups", group: "secondary" },
  { to: "/crm/activity", label: "Activity", icon: History, perm: "crm.records", group: "secondary" },
];

const CHANNEL_LEAD_PATHS = ["/lt/leads/instagram", "/lt/leads/linkedin", "/lt/leads/email"];

const NAV_ITEM =
  "pressable flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-subtle/60 hover:text-foreground";
const NAV_ACTIVE = "bg-subtle font-semibold text-foreground shadow-xs";

type LeadSubItem = { key: string; to: string; label: string; iconSrc?: string };

function LeadsNavGroup({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const inLeads = pathname === "/lt/leads" || pathname.startsWith("/lt/leads/");
  const [open, setOpen] = useState(inLeads);
  useEffect(() => {
    if (inLeads) setOpen(true);
  }, [inLeads]);
  const { data: cfg } = useOutreachChannels();
  const { data: channels = [] } = useChannels();
  const subItems = useMemo(() => {
    const items: LeadSubItem[] = [
      { key: "all-leads", to: "/lt/leads", label: "All Leads", iconSrc: "/channel-icons/sheets.png" },
    ];
    const activeByKind = new Map<string, boolean>();
    for (const c of channels) if (c.kind && c.kind !== "other") activeByKind.set(c.kind, c.is_active);
    const configured = !!(cfg?.kinds && cfg.kinds.length > 0);
    const kinds = new Set<string>(configured ? cfg!.kinds : ["instagram", "linkedin", "email"]);
    const active = (k: string) => !activeByKind.has(k) || !!activeByKind.get(k);
    if (kinds.has("instagram") && active("instagram"))
      items.push({ key: "instagram", to: "/lt/leads/instagram", label: "Instagram", iconSrc: "/channel-icons/instagram.png" });
    if (kinds.has("linkedin") && active("linkedin"))
      items.push({ key: "linkedin", to: "/lt/leads/linkedin", label: "LinkedIn", iconSrc: "/channel-icons/linkedin.png" });
    if (kinds.has("email") && active("email"))
      items.push({ key: "email", to: "/lt/leads/email", label: "Email", iconSrc: "/channel-icons/email.png" });
    return items;
  }, [cfg, channels]);
  const isActive = (s: LeadSubItem) =>
    s.to === "/lt/leads" ? inLeads && !CHANNEL_LEAD_PATHS.includes(pathname) : pathname === s.to;
  const icon = (s: LeadSubItem, size: string) =>
    s.iconSrc ? (
      <img src={s.iconSrc} alt="" className={cn(size, "shrink-0 rounded-xs object-contain")} loading="lazy" />
    ) : (
      <span
        className={cn(
          size,
          "shrink-0 flex items-center justify-center rounded-xs bg-foreground text-[10px] font-bold text-background uppercase",
        )}
      >
        {s.label.charAt(0) || "C"}
      </span>
    );

  if (collapsed)
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-tour={`nav:${item.to}`}
            title={item.label}
            className={cn(NAV_ITEM, "justify-center", inLeads && NAV_ACTIVE)}
          >
            <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          {subItems.map((s) => (
            <DropdownMenuItem key={s.key} asChild>
              <Link
                to={s.to}
                onClick={onNavigate}
                className={cn("flex items-center gap-2 text-[13px]", isActive(s) && "bg-subtle text-foreground")}
              >
                {icon(s, "size-4")}
                {s.label}
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );

  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        data-tour={`nav:${item.to}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cn(NAV_ITEM, inLeads && NAV_ACTIVE)}
      >
        <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronRight className={cn("size-3.5 text-faint transition-transform duration-200", open && "rotate-90")} />
      </button>
      {open && (
        <div className="ml-[18px] flex flex-col gap-0.5 border-l border-border pl-2">
          {subItems.map((s) => (
            <Link
              key={s.key}
              to={s.to}
              data-tour={`nav:${s.to}`}
              onClick={onNavigate}
              className={cn(NAV_ITEM, "h-[30px]", isActive(s) && NAV_ACTIVE)}
            >
              {icon(s, "size-3.5")}
              {s.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ModuleSwitch({ module, collapsed, onNavigate }: { module: ModuleKey; collapsed: boolean; onNavigate?: () => void }) {
  const { can } = useAuth();
  const lt = can("module.lead_tracker");
  const crm = can("module.crm");
  if (!lt && !crm) return null;
  if (collapsed || !(lt && crm))
    return (
      <div data-tour="module-switch" className={cn("flex gap-1", collapsed && "flex-col")}>
        {lt && (
          <Link
            to="/lt/dashboard"
            onClick={onNavigate}
            title="Lead Tracker (Ctrl/Cmd + 1)"
            className={cn(
              "flex-1 rounded-lg border px-2 py-1 text-center text-[11px] font-semibold",
              module === "lead" ? "border-foreground text-foreground" : "border-border text-muted-foreground",
            )}
          >
            {collapsed ? "LT" : "Lead Tracker"}
          </Link>
        )}
        {crm && (
          <Link
            to="/crm/records"
            onClick={onNavigate}
            title="CRM (Ctrl/Cmd + 2)"
            className={cn(
              "flex-1 rounded-lg border px-2 py-1 text-center text-[11px] font-semibold",
              module === "crm" ? "border-foreground text-foreground" : "border-border text-muted-foreground",
            )}
          >
            CRM
          </Link>
        )}
      </div>
    );
  const tab = (active: boolean) =>
    cn(
      "relative z-10 flex h-7 items-center justify-center gap-1.5 text-[12px] font-semibold transition-colors",
      active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    );
  return (
    <div
      data-tour="module-switch"
      className="relative grid grid-cols-2 rounded-[10px] border border-border bg-subtle p-[3px]"
    >
      <span
        aria-hidden
        className={cn(
          "absolute top-[3px] bottom-[3px] left-[3px] w-[calc(50%-3px)] rounded-[7px] bg-surface shadow-xs ring-1 ring-border transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)]",
          module === "crm" && "translate-x-full",
        )}
      />
      <Link to="/lt/dashboard" onClick={onNavigate} className={tab(module === "lead")}>
        Lead Tracker
        <kbd className="font-mono text-[10px] font-medium text-faint">⌘1</kbd>
      </Link>
      <Link to="/crm/records" onClick={onNavigate} className={tab(module === "crm")}>
        CRM
        <kbd className="font-mono text-[10px] font-medium text-faint">⌘2</kbd>
      </Link>
    </div>
  );
}

function AccountMenu({
  collapsed,
  onShortcuts,
}: {
  collapsed: boolean;
  onShortcuts: () => void;
}) {
  const { profile, workspace, theme, setTheme, signOut } = useAuth();
  const navigate = useNavigate();
  const [bugOpen, setBugOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [unseen, setUnseen] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(WHATS_NEW_SEEN_KEY) !== LATEST_VERSION) setUnseen(true);
    } catch {
      /* storage blocked */
    }
  }, []);
  const openNews = () => {
    setNewsOpen(true);
    setUnseen(false);
    try {
      localStorage.setItem(WHATS_NEW_SEEN_KEY, LATEST_VERSION);
    } catch {
      /* storage blocked */
    }
  };
  const name = profile?.full_name || profile?.email || "You";
  const initials = name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const avatar = profile?.avatar_url?.trim() || null;
  const copyId = () => {
    if (!profile?.id) return;
    navigator.clipboard?.writeText(profile.id).then(
      () => toast.success("User ID copied to clipboard"),
      () => toast.error("Could not copy ID"),
    );
  };
  const role = workspace?.role ? workspace.role[0].toUpperCase() + workspace.role.slice(1) : null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            data-tour="sidebar-more"
            className={cn(
              "pressable flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-subtle",
              collapsed && "justify-center",
            )}
            title={profile?.email ?? ""}
          >
            {avatar ? (
              <img src={avatar} alt="" className="size-7 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-subtle font-mono text-[10px] font-semibold text-muted-foreground">
                {initials}
              </span>
            )}
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] font-semibold">{name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{profile?.email}</span>
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-faint" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="w-[260px]">
          <DropdownMenuLabel className="flex flex-col gap-0.5 px-2 py-1.5">
            <span className="truncate text-[13px] font-semibold">{name}</span>
            <span className="truncate text-[12px] font-normal text-muted-foreground">{profile?.email}</span>
          </DropdownMenuLabel>
          {profile?.id && (
            <button
              type="button"
              onClick={copyId}
              className="mx-1 mb-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-md bg-subtle px-2 py-1.5 text-left transition-colors hover:bg-subtle/80"
              title="Click to copy your user ID"
            >
              <span className="section-label w-[75px] shrink-0 whitespace-nowrap">User ID</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">{profile.id}</span>
              <Copy className="size-3.5 text-muted-foreground" />
            </button>
          )}
          {workspace && (
            <div className="mx-1 mb-1 flex items-center gap-2 rounded-md bg-subtle px-2 py-1.5">
              <span className="section-label w-[75px] shrink-0 whitespace-nowrap">Workspace</span>
              <span className="min-w-0 flex-1 text-[12px] leading-snug break-words">
                {workspace.name}
                {role ? ` - ${role}` : ""}
              </span>
            </div>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void navigate({ to: "/settings" })}>
            <Settings className="size-4" />
            <span>Account settings</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onShortcuts}>
            <Keyboard className="size-4" />
            <span className="flex-1">Keyboard shortcuts</span>
            <span className="font-mono text-[11px] text-faint">?</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openTour}>
            <Compass className="size-4" />
            <span>Take the tour</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openNews}>
            <Sparkles className="size-4 text-primary" />
            <span className="flex-1">What's new</span>
            {unseen && <span className="size-2 rounded-full bg-primary" />}
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={GUIDE_URL} target="_blank" rel="noreferrer" className="flex items-center gap-2 cursor-pointer">
              <BookOpen className="size-4" />
              <span>How to use Tracker</span>
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setBugOpen(true)}>
            <Bug className="size-4" />
            <span>Report a bug</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFeedbackOpen(true)}>
            <MessageSquarePlus className="size-4" />
            <span>Submit feedback</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault();
              setTheme(theme === "dark" ? "light" : "dark");
            }}
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            <span>{theme === "dark" ? "Light appearance" : "Dark appearance"}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-negative focus:text-negative"
            onSelect={() => {
              void signOut().then(() => navigate({ to: "/auth", search: { mode: "signin" } as never }));
            }}
          >
            <LogOut className="size-4" />
            <span>Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ReportProblemDialog open={bugOpen} onOpenChange={setBugOpen} />
      <FeedbackDialog open={feedbackOpen} onOpenChange={setFeedbackOpen} />
      <WhatsNewDialog open={newsOpen} onOpenChange={setNewsOpen} />
    </>
  );
}

function SidebarContent({
  module,
  collapsed,
  onNavigate,
  onToggleCollapse,
  onShortcuts,
}: {
  module: ModuleKey;
  collapsed: boolean;
  onNavigate?: () => void;
  onToggleCollapse?: () => void;
  onShortcuts: () => void;
}) {
  const { can } = useAuth();
  const items = (module === "lead" ? LEAD_NAV : CRM_NAV).filter((i) => can(i.perm));
  const link = (i: NavItem) => (
    <Link
      key={i.to}
      to={i.to}
      data-tour={`nav:${i.to}`}
      onClick={onNavigate}
      title={collapsed ? i.label : undefined}
      className={cn(NAV_ITEM, collapsed && "justify-center")}
      activeProps={{ className: NAV_ACTIVE }}
    >
      <i.icon className="size-4 shrink-0" strokeWidth={1.75} />
      {!collapsed && i.label}
    </Link>
  );
  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className={cn("flex flex-col gap-3 px-3 pt-3 pb-3", collapsed && "px-2", !onToggleCollapse && "pr-11")}>
          <div className={cn("flex gap-1", collapsed ? "flex-col items-center" : "items-start")}>
            <div className={cn(collapsed ? "w-full" : "min-w-0 flex-1")}>
              <WorkspaceSwitcher collapsed={collapsed} />
            </div>
            {onToggleCollapse && (
              <Button
                variant="ghost"
                size="icon"
                className={cn("size-8 shrink-0 text-muted-foreground", collapsed && "-mt-2 mb-2")}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                onClick={onToggleCollapse}
              >
                {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
              </Button>
            )}
          </div>
          <ModuleSwitch module={module} collapsed={collapsed} onNavigate={onNavigate} />
        </div>
        {!collapsed && (
          <div className="section-label px-5 pb-1.5">{module === "lead" ? "Lead Tracker" : "CRM"}</div>
        )}
        <nav className="flex flex-col gap-0.5 px-2.5">
          {items
            .filter((i) => i.group !== "secondary")
            .map((i) =>
              module === "lead" && i.to === "/lt/leads" ? (
                <LeadsNavGroup key={i.to} item={i} collapsed={collapsed} onNavigate={onNavigate} />
              ) : (
                link(i)
              ),
            )}
          {items.some((i) => i.group === "secondary") && (
            <>
              <div className="my-1.5 border-t border-border/60 mx-1" />
              {!collapsed && (
                <div className="section-label px-2.5 pb-1 text-[10px] uppercase tracking-wider text-faint">
                  {module === "lead" ? "Operations & Logs" : "Operations"}
                </div>
              )}
              {items.filter((i) => i.group === "secondary").map(link)}
            </>
          )}
        </nav>
      </div>
      <div className={cn("border-t border-border p-2.5", collapsed && "px-1.5")}>
        <AccountMenu collapsed={collapsed} onShortcuts={onShortcuts} />
      </div>
    </div>
  );
}

/* ============================================== shortcuts + palette dialogs */

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-1.5 text-[13px]">
              <span>{s.label}</span>
              <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {s.binding}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [leads, setLeads] = useState<PickedLead[]>([]);
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setLeads([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await db
        .from("leads")
        .select("id,company_name,lead_code")
        .or(`company_name.ilike.%${q}%,lead_code.ilike.%${q}%`)
        .limit(8);
      setLeads((data ?? []) as PickedLead[]);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);
  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };
  const pages = [...LEAD_NAV, ...CRM_NAV, { to: "/settings", label: "Settings" }].filter((p) =>
    p.label.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search pages and leads" value={q} onValueChange={setQ} />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup heading="Pages">
              {pages.map((p) => (
                <CommandItem key={p.to} onSelect={() => go(p.to)}>
                  {p.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {leads.length > 0 && (
              <CommandGroup heading="Leads">
                {leads.map((l) => (
                  <CommandItem key={l.id} onSelect={() => go(`/lt/leads/${l.id}`)}>
                    {l.company_name}
                    <span className="ml-2 text-[11px] text-muted-foreground">{l.lead_code}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function GoogleDisconnectedBanner() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-subtle px-4 py-2 text-[12px]">
      <span>
        Google is disconnected, so backups to your Google Sheet are paused. Your data in Tracker is safe.
      </span>
      <ConnectGoogleButton returnTo="/settings" label="Reconnect Google" className="h-7 text-[12px]" />
    </div>
  );
}

/* ============================================================== AppShell */

const GO_TO: Record<string, string> = {
  d: "/lt/dashboard",
  l: "/lt/leads",
  o: "/lt/outreach",
  c: "/crm/records",
  p: "/crm/pipeline",
  r: "/crm/revenue",
  i: "/crm/invoices",
  s: "/settings",
};

export function AppShell({
  module,
  title,
  perm,
  actions,
  actionsInHeader = true,
  guide,
  heading = true,
  children,
}: {
  module: ModuleKey;
  title: ReactNode;
  perm?: string;
  actions?: ReactNode;
  actionsInHeader?: boolean;
  guide?: string;
  heading?: boolean;
  children?: ReactNode;
}) {
  const { loading, session, profile, workspace, can, isAdmin, theme, setTheme } = useAuth();
  useRealtimeInvalidation();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const fetchGoogle = useServerFn(getGoogleStatus);
  const { data: google } = useQuery({
    queryKey: GOOGLE_STATUS_QUERY_KEY,
    queryFn: () => fetchGoogle({}),
    enabled: !IS_TEST_MODE && !!session && !!workspace && isAdmin,
    staleTime: 6e4,
  });
  const googleDown = !!google?.isAdmin && google.usesConnectedGoogle && !google.connected;

  const [showTestBadge, setShowTestBadge] = useState(true);
  useEffect(() => {
    const sync = () => setShowTestBadge(testBadgeVisible());
    sync();
    window.addEventListener(TEST_BADGE_EVENT, sync);
    return () => window.removeEventListener(TEST_BADGE_EVENT, sync);
  }, []);

  const [collapsed, setCollapsed] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const sync = () => setMenuOpen(isTourMenuOpen());
    sync();
    window.addEventListener(TOUR_MENU_EVENT, sync);
    return () => window.removeEventListener(TOUR_MENU_EVENT, sync);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("tracker.sidebar.collapsed");
    if (saved) setCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (mod && (e.key === "1" || e.key === "2")) {
        e.preventDefault();
        void navigate({ to: e.key === "1" ? "/lt/dashboard" : "/crm/records" });
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "g") {
        gAt = Date.now();
        return;
      }
      if (Date.now() - gAt < 1200) {
        const to = GO_TO[e.key.toLowerCase()];
        if (to) {
          gAt = 0;
          e.preventDefault();
          void navigate({ to });
        }
        return;
      }
      if (e.key.toLowerCase() === "n" && pathname.startsWith("/lt")) {
        e.preventDefault();
        void navigate({ to: "/lt/leads/$id", params: { id: "new" } });
      }
      if (e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, pathname]);

  if (loading) return <Loading page />;
  if (!session) return <Loading page label="Redirecting" />;
  if (profile && !workspace) return <NoWorkspace />;
  if (perm && profile?.is_active && !can(perm))
    return (
      <div className="p-10 text-center text-[13px] text-muted-foreground">
        You do not have access to this page. Ask an admin to grant it in Settings.
      </div>
    );

  const leadMatch = pathname.match(/^\/lt\/leads\/([^/]+)$/);
  const leadExport =
    leadMatch && !["new", "instagram", "linkedin", "email"].includes(leadMatch[1]) ? (
      <EmailLeadProfileButton leadId={leadMatch[1]} />
    ) : null;
  const isSettings = pathname === "/settings";
  const titleText = typeof title === "string" ? title : "";

  return (
    <LeadPeekProvider>
      <div className="flex min-h-screen bg-background">
        {!isSettings && (
          <aside
            className={cn(
              "sticky top-0 hidden h-screen shrink-0 overflow-y-auto border-r border-border bg-background md:block",
              collapsed ? "w-[60px]" : "w-[248px]",
            )}
          >
            <SidebarContent
              module={module}
              collapsed={collapsed}
              onShortcuts={() => setShortcutsOpen(true)}
              onToggleCollapse={() =>
                setCollapsed((c) => {
                  window.localStorage.setItem("tracker.sidebar.collapsed", c ? "0" : "1");
                  return !c;
                })
              }
            />
          </aside>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          {!isSettings && (
            <header className="glass-header sticky top-0 z-40 flex h-14 items-center gap-2 px-3 md:px-6">
              <Sheet
                open={menuOpen}
                onOpenChange={(o) => {
                  if (o || !isTourMenuOpen()) setMenuOpen(o);
                }}
              >
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="md:hidden" title="Menu">
                    <Menu className="size-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[264px] bg-background p-0">
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SidebarContent
                    module={module}
                    collapsed={false}
                          onNavigate={() => setMenuOpen(false)}
                    onShortcuts={() => setShortcutsOpen(true)}
                  />
                </SheetContent>
              </Sheet>
              <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
                <Link
                  to={module === "lead" ? "/lt/dashboard" : "/crm/records"}
                  className={cn(
                    "shrink-0 text-muted-foreground hover:text-foreground",
                    isSettings ? "inline-flex items-center gap-1" : "hidden sm:inline",
                  )}
                >
                  {isSettings && <ChevronLeft className="size-3.5" />}
                  {pathname === "/settings" ? "Workspace" : module === "lead" ? "Lead Tracker" : "CRM"}
                </Link>
                <ChevronRight className={cn("size-3.5 shrink-0 text-faint", !isSettings && "hidden sm:block")} />
                <h1 data-tour="page-title" className="page-title truncate">
                  {title}
                </h1>
              </nav>
              {guide && <HelpLink section={guide} label={`How ${titleText} works`} />}
              {IS_TEST_MODE && showTestBadge && (
                <span
                  title="Test copy, not the live app"
                  className="shrink-0 rounded-full border border-negative/40 bg-negative/8 px-2 py-0.5 text-[10.5px] font-semibold tracking-wide text-negative"
                >
                  TEST APP
                </span>
              )}
              {actionsInHeader && actions}
              {leadExport}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  data-global-search
                  data-tour="search"
                  onClick={() => setPaletteOpen(true)}
                  className="pressable hidden items-center gap-3 rounded-lg border border-border/80 bg-background/50 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-faint hover:text-foreground sm:flex"
                >
                  <Search className="size-3.5" />
                  <span className="hidden lg:inline">Search leads, pages and actions</span>
                  <span className="lg:hidden">Search</span>
                  <kbd className="rounded-md border border-border bg-surface px-1.5 py-px font-mono text-[10.5px] text-foreground">
                    ⌘K
                  </kbd>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  data-tour="search-mobile"
                  className="sm:hidden"
                  title="Search"
                  onClick={() => setPaletteOpen(true)}
                >
                  <Search className="size-4" />
                </Button>
                {!IS_TEST_MODE && (isAdmin || can("lead.import_export")) && <QuickBackupButton />}
                <Button
                  variant="ghost"
                  size="icon"
                  title={theme === "dark" ? "Switch to light" : "Switch to dark"}
                  onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                  className="text-muted-foreground"
                >
                  <span key={theme} className="animate-in spin-in-90 fade-in-0 duration-300">
                    {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
                  </span>
                </Button>
              </div>
            </header>
          )}
          {!IS_TEST_MODE && googleDown && <GoogleDisconnectedBanner />}
          <main
            data-tour="page-main"
            className={
              isSettings
                ? "page-appear w-full flex-1"
                : "page-appear mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 md:px-6 md:py-7"
            }
          >
            {heading && (
              <h2 className="mb-5 text-[24px] leading-tight font-semibold tracking-tight text-balance">{title}</h2>
            )}
            {children}
          </main>
        </div>
        <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </LeadPeekProvider>
  );
}

/** Older routes import AppPage; it is the same shell. */
export const AppPage = AppShell;
