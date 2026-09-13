import { useEffect, useState, type ReactNode } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Boxes,
  CalendarClock,
  Columns3,
  Database,
  Gauge,
  Keyboard,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings as SettingsIcon,
  Sun,
  Table2,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DEFAULT_SHORTCUTS, isTypingTarget } from "@/lib/shortcuts";
import { supabase } from "@/integrations/supabase/client";
import { Loading } from "@/components/kit";
import { useGlobalRealtime } from "@/hooks/useRealtime";

export type ModuleKey = "lead" | "crm";

type NavItem = { to: string; label: string; icon: typeof Gauge; perm: string };

const LEAD_NAV: NavItem[] = [
  { to: "/lt/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "lead.dashboard" },
  { to: "/lt/leads", label: "Leads", icon: Table2, perm: "lead.leads" },
  { to: "/lt/followups", label: "Follow-ups", icon: CalendarClock, perm: "lead.leads" },
  { to: "/lt/outreach", label: "Outreach Tracker", icon: Gauge, perm: "lead.outreach_tracker" },
  { to: "/lt/ledger", label: "Ledger", icon: ListChecks, perm: "lead.ledger" },
  { to: "/lt/archive", label: "Archive", icon: Boxes, perm: "lead.archive" },
  { to: "/lt/data", label: "Import / Export", icon: Database, perm: "lead.import_export" },
];

const CRM_NAV: NavItem[] = [
  { to: "/crm/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "crm.records" },
  { to: "/crm/records", label: "Records", icon: Table2, perm: "crm.records" },
  { to: "/crm/pipeline", label: "Pipeline", icon: Columns3, perm: "crm.pipeline" },
  { to: "/crm/todos", label: "To-dos", icon: ListChecks, perm: "crm.todos" },
  { to: "/crm/followups", label: "Follow-ups", icon: CalendarClock, perm: "crm.followups" },
  { to: "/crm/revenue", label: "Revenue", icon: BarChart3, perm: "crm.revenue" },
];

function SidebarBody({
  module,
  collapsed,
  onNavigate,
}: {
  module: ModuleKey;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const { can } = useAuth();
  const nav = (module === "lead" ? LEAD_NAV : CRM_NAV).filter((n) => can(n.perm));
  const canLead = can("module.lead_tracker");
  const canCrm = can("module.crm");

  return (
    <div className="flex h-full flex-col justify-between">
      <div>
        <div className={cn("px-3 py-4", collapsed && "px-2")}>
          {!collapsed && (
            <div className="mb-3 text-[13px] font-semibold tracking-tight">Buzzspear Tracker</div>
          )}
          <div className="flex gap-1">
            {canLead && (
              <Link
                to="/lt/dashboard"
                onClick={onNavigate}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1 text-center text-[11px]",
                  module === "lead" ? "border-foreground" : "border-border text-muted-foreground",
                )}
              >
                {collapsed ? "LT" : "Lead Tracker"}
              </Link>
            )}
            {canCrm && (
              <Link
                to="/crm/records"
                onClick={onNavigate}
                className={cn(
                  "flex-1 rounded-md border px-2 py-1 text-center text-[11px]",
                  module === "crm" ? "border-foreground" : "border-border text-muted-foreground",
                )}
              >
                {collapsed ? "CRM" : "CRM"}
              </Link>
            )}
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              onClick={onNavigate}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-subtle hover:text-foreground"
              activeProps={{ className: "bg-subtle text-foreground" }}
            >
              <n.icon className="size-4 shrink-0" />
              {!collapsed && n.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="px-2 pb-3">
        <Link
          to="/settings"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-muted-foreground hover:bg-subtle hover:text-foreground"
          activeProps={{ className: "bg-subtle text-foreground" }}
        >
          <SettingsIcon className="size-4 shrink-0" />
          {!collapsed && "Settings"}
        </Link>
      </div>
    </div>
  );
}

function ShortcutHelp({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-auto">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="divide-y divide-border">
          {DEFAULT_SHORTCUTS.map((s) => (
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

function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [leads, setLeads] = useState<{ id: string; company_name: string; lead_code: string }[]>([]);

  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setLeads([]);
      return;
    }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from("leads")
        .select("id,company_name,lead_code")
        .or(`company_name.ilike.%${query}%,lead_code.ilike.%${query}%`)
        .limit(8);
      setLeads(data ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [query, open]);

  const go = (to: string) => {
    onOpenChange(false);
    void navigate({ to });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={false}>
          <CommandInput placeholder="Search pages and leads" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>No results</CommandEmpty>
            <CommandGroup heading="Pages">
              {[...LEAD_NAV, ...CRM_NAV, { to: "/settings", label: "Settings" }]
                .filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
                .map((p) => (
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

export function AppPage({
  module,
  title,
  perm,
  actions,
  children,
}: {
  module: ModuleKey;
  title: string;
  perm?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { loading, session, profile, can, theme, setTheme, signOut } = useAuth();
  useGlobalRealtime();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("bs.sidebar.collapsed");
    if (stored) setCollapsed(stored === "1");
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) void navigate({ to: "/auth" });
    else if (profile && !profile.is_active) void navigate({ to: "/pending" });
  }, [loading, session, profile, navigate]);

  useEffect(() => {
    let lastG = 0;
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen(true);
        return;
      }
      if (e.key.toLowerCase() === "g") {
        lastG = Date.now();
        return;
      }
      if (Date.now() - lastG < 1200) {
        const map: Record<string, string> = {
          d: "/lt/dashboard",
          l: "/lt/leads",
          o: "/lt/outreach",
          c: "/crm/records",
          p: "/crm/pipeline",
          r: "/crm/revenue",
          s: "/settings",
        };
        const to = map[e.key.toLowerCase()];
        if (to) {
          lastG = 0;
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
        const el = document.querySelector<HTMLInputElement>("[data-global-search]");
        el?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [navigate, pathname]);

  if (loading) return <Loading />;
  if (!session) return <Loading label="Redirecting" />;
  if (perm && profile?.is_active && !can(perm)) {
    return (
      <div className="p-10 text-center text-[13px] text-muted-foreground">
        You do not have access to this page. Ask an admin to grant it in Settings.
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "hidden shrink-0 border-r border-border bg-surface md:block",
          collapsed ? "w-14" : "w-[220px]",
        )}
      >
        <SidebarBody module={module} collapsed={collapsed} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-surface px-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[240px] p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarBody module={module} collapsed={false} />
            </SheetContent>
          </Sheet>
          <Button
            variant="ghost"
            size="icon"
            className="hidden md:inline-flex"
            onClick={() => {
              setCollapsed((c) => {
                window.localStorage.setItem("bs.sidebar.collapsed", c ? "0" : "1");
                return !c;
              });
            }}
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </Button>
          <h1 className="page-title truncate">{title}</h1>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="absolute top-2.5 left-2 size-3.5 text-muted-foreground" />
              <Input
                data-global-search
                readOnly
                onFocus={() => setPaletteOpen(true)}
                onClick={() => setPaletteOpen(true)}
                placeholder="Search"
                className="h-8 w-[200px] pl-7 text-[13px]"
              />
            </div>
            {actions}
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setHelpOpen(true)}>
              <Keyboard className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={profile?.email ?? ""}
              onClick={() => {
                void signOut().then(() => navigate({ to: "/auth" }));
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">{children}</main>
      </div>

      <ShortcutHelp open={helpOpen} onOpenChange={setHelpOpen} />
      <GlobalSearch open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
  );
}

export { Wallet };
