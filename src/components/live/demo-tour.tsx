// Live: "Welcome to Tracker" walkthrough (DemoTour) from index-LBNWlUO7.js.
// Exports used by other chunks: d -> openTour, f -> isTourMenuOpen,
// u -> TOUR_MENU_EVENT. The tour is mounted once in __root.tsx.
// Targets are elements carrying data-tour="..." (nav:<path>, page-title,
// page-main, module-switch, search, search-mobile, sidebar-more).
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/live/auth";

const DONE_KEY = "tracker.tour.done.v1";
const OPEN_EVENT = "tracker:open-tour";
export const TOUR_MENU_EVENT = "tracker:tour-menu";

export function openTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

function setTourMenu(open: boolean) {
  document.documentElement.dataset["tourMenu"] = open ? "1" : "";
  window.dispatchEvent(new Event(TOUR_MENU_EVENT));
}

/** True while a tour step wants the mobile navigation sheet held open. */
export function isTourMenuOpen() {
  return typeof document !== "undefined" && document.documentElement.dataset["tourMenu"] === "1";
}

type TourStep = {
  path?: string;
  targets: string[];
  menu?: boolean;
  perm?: string;
  chapter: string;
  title: string;
  body: string;
  tip?: string;
};

const navTargets = (path: string) => [`nav:${path}`, "page-title"];

export const TOUR_STEPS: TourStep[] = [
  {
    targets: [],
    chapter: "Welcome",
    title: "Welcome to Tracker",
    body: "This short walkthrough opens every part of the app and shows what each one is for. It takes about two minutes.",
    tip: "Use the left and right arrow keys to move, Esc to close. You can replay it any time from More > Take the tour.",
  },
  {
    targets: ["module-switch"],
    menu: true,
    chapter: "Basics",
    title: "Two apps in one",
    body: "Lead Tracker is for finding and reaching out to new leads. CRM is for the deals and clients that came out of it. Switch between them here.",
    tip: "Shortcut: Ctrl/Cmd + 1 for Lead Tracker, Ctrl/Cmd + 2 for CRM.",
  },
  {
    targets: ["search", "search-mobile"],
    chapter: "Basics",
    title: "Find anything fast",
    body: "Search jumps to any page or lead by name or lead code.",
    tip: "Press Ctrl/Cmd + K or / from anywhere.",
  },
  {
    path: "/lt/dashboard",
    targets: navTargets("/lt/dashboard"),
    perm: "lead.dashboard",
    chapter: "Lead Tracker",
    title: "Dashboard",
    body: "Your outreach at a glance: leads added, messages sent, replies and how each stage is converting.",
  },
  {
    path: "/lt/leads",
    targets: navTargets("/lt/leads"),
    perm: "lead.leads",
    chapter: "Lead Tracker",
    title: "Leads",
    body: "Every lead in one table. Filter, sort, change stages inline, pick custom date ranges, and open any lead to see its full history.",
    tip: "Press N on any Lead Tracker page to add a new lead.",
  },
  {
    path: "/lt/leads/instagram",
    targets: ["nav:/lt/leads/instagram", "page-title"],
    perm: "lead.leads",
    chapter: "Lead Tracker",
    title: "Rapid entry & Today stream",
    body: "Instagram, LinkedIn and Email each have a rapid entry workflow with live stream tracking, one-click follow-up dates (+2d, +3d, +1w), message template copying, and company peek drawers.",
    tip: "Click any company name in the stream to slide open the lead preview.",
  },
  {
    path: "/lt/followups",
    targets: navTargets("/lt/followups"),
    perm: "lead.leads",
    chapter: "Lead Tracker",
    title: "Follow-ups",
    body: "Who you need to message again and when. Overdue and due today come first, so nobody slips through.",
  },
  {
    path: "/lt/todos",
    targets: navTargets("/lt/todos"),
    perm: "lead.leads",
    chapter: "Lead Tracker",
    title: "To-dos",
    body: "Tasks tied to your leads, with in-app due date pickers, so the next step is always written down.",
  },
  {
    path: "/lt/activity",
    targets: navTargets("/lt/activity"),
    perm: "lead.leads",
    chapter: "Lead Tracker",
    title: "Activity",
    body: "A timeline of everything done on your leads, by you and your team.",
  },
  {
    path: "/lt/outreach",
    targets: navTargets("/lt/outreach"),
    perm: "lead.outreach_tracker",
    chapter: "Lead Tracker",
    title: "Outreach Tracker",
    body: "Your daily outreach numbers per channel against your targets, with custom date range filters, streaks and channel breakdowns.",
    tip: "Filter by This week, This month, or custom date ranges using the in-app calendar.",
  },
  {
    path: "/lt/ledger",
    targets: navTargets("/lt/ledger"),
    perm: "lead.ledger",
    chapter: "Lead Tracker",
    title: "Ledger",
    body: "A day by day record of your outreach work, kept for looking back and spotting patterns.",
  },
  {
    path: "/lt/archive",
    targets: navTargets("/lt/archive"),
    perm: "lead.archive",
    chapter: "Lead Tracker",
    title: "Archive",
    body: "Leads you set aside live here. Nothing is lost, and you can bring any of them back.",
  },
  {
    path: "/lt/data",
    targets: navTargets("/lt/data"),
    perm: "lead.import_export",
    chapter: "Lead Tracker",
    title: "AI Import and export",
    body: "Bring leads in with AI column matching, duplicate scanning, and session recovery protection so uploads are never interrupted.",
    tip: "Messy spreadsheet headers and secondary contacts are matched automatically.",
  },
  {
    path: "/crm/dashboard",
    targets: navTargets("/crm/dashboard"),
    perm: "crm.records",
    chapter: "CRM",
    title: "CRM dashboard",
    body: "Pipeline value, deals won and what is coming up, all in one view.",
  },
  {
    path: "/crm/records",
    targets: navTargets("/crm/records"),
    perm: "crm.records",
    chapter: "CRM",
    title: "Records",
    body: "Your clients and deals. Each record keeps its contacts, deal value, notes and history together.",
  },
  {
    path: "/crm/pipeline",
    targets: navTargets("/crm/pipeline"),
    perm: "crm.pipeline",
    chapter: "CRM",
    title: "Pipeline",
    body: "Drag deals from stage to stage on the board and see the value sitting in each one.",
  },
  {
    path: "/crm/invoices",
    targets: navTargets("/crm/invoices"),
    perm: "crm.records",
    chapter: "CRM",
    title: "Invoices",
    body: "Create, customize, preview and print branded client invoices with saved business profiles, bank details, LUT tax numbers and deal linking.",
    tip: "Link invoices directly to CRM deals for streamlined revenue tracking.",
  },
  {
    path: "/crm/todos",
    targets: navTargets("/crm/todos"),
    perm: "crm.todos",
    chapter: "CRM",
    title: "CRM to-dos",
    body: "Tasks for your deals and clients, separate from your lead work.",
  },
  {
    path: "/crm/followups",
    targets: navTargets("/crm/followups"),
    perm: "crm.followups",
    chapter: "CRM",
    title: "CRM follow-ups",
    body: "Clients and deals waiting on a reply or a check-in, sorted by when they are due.",
  },
  {
    path: "/crm/activity",
    targets: navTargets("/crm/activity"),
    perm: "crm.records",
    chapter: "CRM",
    title: "CRM activity",
    body: "Everything that happened across your records, in order.",
  },
  {
    path: "/crm/revenue",
    targets: navTargets("/crm/revenue"),
    perm: "crm.revenue",
    chapter: "CRM",
    title: "Revenue",
    body: "Earnings, MRR, win rate and revenue by month, worked out from the deals you closed.",
  },
  {
    path: "/settings",
    targets: ["page-title"],
    chapter: "Workspace",
    title: "Settings",
    body: "Set your stages, channels, outreach targets, templates, Google Sheet backup and team members here.",
  },
  {
    path: "/lt/dashboard",
    targets: ["sidebar-more", "page-title"],
    menu: true,
    chapter: "Workspace",
    title: "Help is always close",
    body: "Under More you will find Settings, keyboard shortcuts, the full guide and a way to report a problem. The ? next to a page title opens that part of the guide.",
    tip: "You can replay this tour from More > Take the tour.",
  },
  {
    path: "/lt/dashboard",
    perm: "module.lead_tracker",
    targets: [],
    chapter: "Done",
    title: "You are all set",
    body: "Start by adding your first lead. Everything else builds from there.",
  },
];

function findTarget(targets: string[]) {
  for (const t of targets)
    for (const el of document.querySelectorAll(`[data-tour="${t}"]`)) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) return el;
    }
  return null;
}

const isAppPath = (p: string) => p.startsWith("/lt/") || p.startsWith("/crm/") || p === "/settings";

type Rect = { top: number; left: number; width: number; height: number };

export function DemoTour() {
  const { profile, workspace, can } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const steps = useMemo(
    () =>
      TOUR_STEPS.filter(
        (s) =>
          !(
            (s.perm && !can(s.perm)) ||
            (s.path?.startsWith("/lt/") && !can("module.lead_tracker")) ||
            (s.path?.startsWith("/crm/") && !can("module.crm"))
          ),
      ),
    [can],
  );
  const doneKey = profile?.id ? `${DONE_KEY}:${profile.id}` : null;
  const [index, setIndex] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardH, setCardH] = useState(240);
  const [vw, setVw] = useState(typeof window !== "undefined" ? window.innerWidth : 1024);
  const [vh, setVh] = useState(typeof window !== "undefined" ? window.innerHeight : 768);

  const go = useCallback((i: number) => {
    setRect(null);
    setReady(false);
    setIndex(i);
  }, []);

  const finish = useCallback(() => {
    if (doneKey)
      try {
        localStorage.setItem(doneKey, "1");
      } catch {
        /* storage blocked */
      }
    setTourMenu(false);
    setIndex(null);
    setRect(null);
  }, [doneKey]);

  useEffect(() => {
    const open = () => go(0);
    window.addEventListener(OPEN_EVENT, open);
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, [go]);

  // Auto-start once per user, the first time they land on an app page.
  useEffect(() => {
    if (index !== null || !doneKey || !workspace || !isAppPath(pathname)) return;
    let done = true;
    try {
      done = !!localStorage.getItem(doneKey);
    } catch {
      /* storage blocked */
    }
    if (!done) go(0);
  }, [doneKey, workspace, pathname, index, go]);

  const step = index === null ? null : steps[index];

  useEffect(() => {
    if (step?.path && pathname !== step.path) void navigate({ to: step.path });
  }, [step, pathname, navigate]);

  const mobile = vw < 768;

  useEffect(() => {
    if (step) setTourMenu(mobile && !!step.menu);
  }, [step, mobile]);

  useLayoutEffect(() => {
    if (!step) return;
    let raf = 0;
    let misses = 0;
    let scrolled = false;
    const tick = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
      const onPage = !step.path || window.location.pathname === step.path;
      const targets = window.innerWidth < 768 && step.path && !step.menu ? ["page-main"] : step.targets;
      const el = onPage && targets.length ? findTarget(targets) : null;
      if (el) {
        if (!scrolled) {
          if (targets[0] === "page-main") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
          else el.scrollIntoView({ behavior: "instant" as ScrollBehavior, block: "center" });
          scrolled = true;
        }
        const r = el.getBoundingClientRect();
        setRect((prev) =>
          prev &&
          Math.abs(prev.top - r.top) < 0.5 &&
          Math.abs(prev.left - r.left) < 0.5 &&
          Math.abs(prev.width - r.width) < 0.5 &&
          Math.abs(prev.height - r.height) < 0.5
            ? prev
            : { top: r.top, left: r.left, width: r.width, height: r.height },
        );
        setReady(true);
      } else if (onPage && (!targets.length || ++misses > 40)) {
        setRect(null);
        setReady(true);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight") index >= steps.length - 1 ? finish() : go(index + 1);
      else if (e.key === "ArrowLeft") {
        if (index > 0) go(index - 1);
      } else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, steps.length, go, finish]);

  if (index === null || !step) return null;

  const last = index === steps.length - 1;
  const width = mobile ? vw - 24 : Math.min(380, vw - 24);
  const h = Math.min(cardH, vh - 32);
  const maxBottom = mobile ? vh - h - 20 : vh - 4;

  const spot: Rect | null = rect
    ? (() => {
        const top = Math.max(4, rect.top - 8);
        const bottom = Math.min(maxBottom, rect.top + rect.height + 8);
        if (bottom - top < 24) return null;
        const left = Math.max(4, rect.left - 8);
        return { top, left, width: Math.min(vw - 8 - left, rect.width + 16), height: bottom - top };
      })()
    : null;

  let pos: { top: number; left: number };
  let arrow: "left" | "up" | "down" | null = null;
  if (mobile) pos = { left: 12, top: vh - h - 12 };
  else if (!spot) pos = { left: (vw - width) / 2, top: Math.max(16, (vh - h) / 2) };
  else {
    const below = spot.top + spot.height + 52;
    const fitsBelow = below + h < vh - 16;
    const above = spot.top - 52 - h;
    const center = spot.left + spot.width / 2;
    const roomRight = vw - (spot.left + spot.width) - 64;
    if (roomRight >= width && spot.left + spot.width < vw / 3) {
      arrow = "left";
      pos = { top: spot.top + spot.height / 2 - h / 2, left: spot.left + spot.width + 60 };
    } else if (fitsBelow || above > 8) {
      arrow = fitsBelow ? "up" : "down";
      pos = {
        top: fitsBelow ? below : above,
        left: Math.min(Math.max(12, center - width / 2), vw - width - 12),
      };
    } else pos = { top: vh - h - 16, left: (vw - width) / 2 };
  }
  pos.top = Math.min(Math.max(16, pos.top), vh - h - 16);

  const arrowX = spot ? Math.min(Math.max(spot.left + spot.width / 2, 24), vw - 24) : 0;
  const arrowStyle =
    !spot || !arrow
      ? null
      : arrow === "up"
        ? { left: arrowX, top: spot.top + spot.height + 6, transform: "translateX(-50%)" }
        : arrow === "down"
          ? { left: arrowX, top: spot.top - 42, transform: "translateX(-50%)" }
          : { left: spot.left + spot.width + 14, top: spot.top + spot.height / 2, transform: "translateY(-50%)" };
  const arrowRotate = arrow === "up" ? "-rotate-90" : arrow === "down" ? "rotate-90" : "rotate-180";

  return (
    <div className="pointer-events-auto fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label="App walkthrough">
      {spot ? (
        <div
          className="fixed rounded-xl ring-2 ring-white/70 transition-all duration-300 ease-[cubic-bezier(.16,1,.3,1)]"
          style={{ ...spot, boxShadow: `0 0 0 9999px rgb(0 0 0 / ${mobile ? 0.5 : 0.62})` }}
        />
      ) : (
        <div className="fixed inset-0 bg-black/60 transition-opacity duration-300" />
      )}
      <div className="fixed inset-0" />
      {ready && arrowStyle && (
        <div className="pointer-events-none fixed z-[10000]" style={arrowStyle}>
          <div className={arrow === "left" ? "animate-[tour-nudge_1s_ease-in-out_infinite]" : "animate-bounce"}>
            <ArrowRight className={`size-8 text-white drop-shadow-md ${arrowRotate}`} strokeWidth={2.5} />
          </div>
        </div>
      )}
      {ready && (
        <div
          key={index}
          ref={(el) => {
            if (el && Math.abs(el.offsetHeight - cardH) > 2) setCardH(el.offsetHeight);
          }}
          className={`fixed z-[10001] animate-in fade-in-0 ${mobile ? "slide-in-from-bottom-4 rounded-2xl p-5" : "zoom-in-95 rounded-xl p-4"} border border-border bg-popover text-popover-foreground shadow-2xl duration-200`}
          style={{ ...pos, width, maxHeight: vh - 32, overflowY: "auto" }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="section-label">
              {step.chapter} · {index + 1} / {steps.length}
            </p>
            <button
              type="button"
              onClick={finish}
              aria-label="Skip walkthrough"
              className="-m-1 inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-subtle hover:text-foreground"
            >
              Skip <X className="size-3.5" />
            </button>
          </div>
          <h3 className="mt-2 text-[15px] font-semibold tracking-tight">{step.title}</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
          {step.tip && (
            <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-[12px] leading-relaxed">{step.tip}</p>
          )}
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-subtle">
            <div
              className="h-full rounded-full bg-foreground transition-all duration-300"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <Button
              variant="outline"
              size="sm"
              className={mobile ? "h-10 flex-1 text-[13px]" : "h-8 text-[12px]"}
              onClick={() => go(index - 1)}
              disabled={index === 0}
            >
              <ArrowLeft className="size-3.5" /> Back
            </Button>
            <Button
              size="sm"
              className={mobile ? "h-10 flex-[2] text-[13px]" : "h-8 text-[12px]"}
              onClick={() => (last ? finish() : go(index + 1))}
            >
              {last ? "Get started" : "Next"} <ArrowRight className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
