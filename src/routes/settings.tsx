import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Bolt,
  ChevronLeft,
  CircleHelp,
  CloudUpload,
  Coins,
  Database,
  FileSpreadsheet,
  Flag,
  Globe,
  Hash,
  Keyboard,
  LayoutGrid,
  Mail,
  MessagesSquare,
  ReceiptText,
  Scissors,
  Search,
  Sheet,
  Shield,
  Target,
  TriangleAlert,
  UserRound,
  Users,
  Workflow,
  type LucideProps,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/live/auth";
import { Input } from "@/components/ui/input";
// Live app-shell exports AppPage (with `heading` prop), HelpLink and the test app indicator toggle.
import { AppPage, HelpLink, TestAppIndicatorToggle } from "@/components/app-shell";
import { IS_TEST_MODE } from "@/lib/live/test-mode";
import { GoogleConnectCard } from "@/components/live/google-connect";
import { BookmarkletCard } from "@/components/account/bookmarklet-card";
import { AccountSettings } from "@/components/account/settings-account";
import { StagesSettings } from "@/components/account/settings-stages";
import { OutreachChannelsPicker, SenderAccountsSettings } from "@/components/account/settings-channels";
import { CountriesSettings } from "@/components/account/settings-countries";
import { TagsSettings } from "@/components/account/settings-tags";
import { TargetsSettings } from "@/components/account/settings-targets";
import { CrmCurrencySettings } from "@/components/account/settings-currency";
import { InvoiceTemplatesSettings } from "@/components/account/settings-invoice-templates";
import { OutreachTemplatesSettings } from "@/components/account/settings-outreach-templates";
import { FollowupTemplatesSettings } from "@/components/account/settings-followup-templates";
import { RapidEntrySettings } from "@/components/account/settings-rapid-entry";
import { ShortcutsSettings } from "@/components/account/settings-shortcuts";
import { UsersSettings } from "@/components/account/settings-users";
import { PresetsSettings } from "@/components/account/settings-presets";
import { DataSettings } from "@/components/account/settings-data";
import { ImportMappingsSettings } from "@/components/account/settings-import-mappings";
import { AutoBackupSettings } from "@/components/account/settings-auto-backup";
import { ContactSettings } from "@/components/account/settings-contact";
import { DangerZoneSettings } from "@/components/account/settings-danger-zone";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings | Tracker" },
      { name: "description", content: "Manage stages, channels, tags, targets, shortcuts, account and access." },
    ],
  }),
  component: SettingsPage,
});

type SectionItem = {
  id: string;
  title: string;
  icon: ComponentType<LucideProps>;
  lede: string;
  help?: ReactNode;
  show: boolean;
  body: ReactNode;
  unboxed?: boolean;
  danger?: boolean;
};

type SectionGroup = { label: string; items: SectionItem[] };


function SettingsPage() {
  const { can, profile, isAdmin } = useAuth();
  const module = profile?.default_module === "crm" ? "crm" : "lead";
  const canData = can("lead.import_export") || isAdmin;

  const groups: SectionGroup[] = (
    [
      {
        label: "You",
        items: [
          {
            id: "account",
            title: "Account",
            icon: UserRound,
            lede: "Your name, photo, password, theme and where Tracker opens for you.",
            help: <HelpLink section="account" />,
            show: true,
            body: <AccountSettings />,
          },
        ],
      },
      {
        label: "Workspace",
        items: [
          {
            id: "stages",
            title: "Stages",
            icon: Flag,
            lede: "The steps leads and deals move through.",
            help: <HelpLink section="stages" />,
            show: can("settings.stages"),
            body: <StagesSettings />,
          },
          {
            id: "accounts",
            title: "Channels and sender accounts",
            icon: Mail,
            lede: "Where you send outreach from, and each account's limits and warm-up.",
            help: <HelpLink section="channels" />,
            show: can("settings.accounts"),
            body: (
              <>
                <OutreachChannelsPicker />
                <SenderAccountsSettings />
              </>
            ),
          },
          {
            id: "countries",
            title: "Countries",
            icon: Globe,
            lede: "Countries you can tag leads with.",
            help: <HelpLink section="tags-countries" />,
            show: can("settings.countries"),
            body: <CountriesSettings />,
          },
          {
            id: "tags",
            title: "Tags",
            icon: Hash,
            lede: "Labels for grouping and filtering leads.",
            help: <HelpLink section="tags-countries" />,
            show: can("settings.tags"),
            body: <TagsSettings />,
          },
          {
            id: "targets",
            title: "Outreach targets",
            icon: Target,
            lede: "Daily sending goals that power the Outreach Tracker.",
            help: <HelpLink section="outreach-targets" />,
            show: can("settings.targets"),
            body: <TargetsSettings />,
          },
          {
            id: "crm_currency",
            title: "CRM currency",
            icon: Coins,
            lede: "The currency CRM totals are reported in.",
            help: <HelpLink section="currency" />,
            show: can("crm.revenue"),
            body: <CrmCurrencySettings />,
          },
        ],
      },
      {
        label: "Tools",
        items: [
          {
            id: "invoice_templates",
            title: "Invoice templates",
            icon: ReceiptText,
            lede: "Reusable invoice templates, default sender profile and payment details.",
            show: true,
            body: <InvoiceTemplatesSettings />,
          },
          {
            id: "outreach_templates",
            title: "Outreach templates",
            icon: MessagesSquare,
            lede: "The messages you send on each channel. Pick one when you add or follow up a lead.",
            help: <HelpLink section="outreach-templates" />,
            show: can("lead.leads"),
            body: <OutreachTemplatesSettings />,
          },
          {
            id: "followup_templates",
            title: "Follow-up templates",
            icon: Workflow,
            lede: "Reusable follow-up sequences you can apply to any lead.",
            help: <HelpLink section="followup-templates" />,
            show: can("lead.leads"),
            body: <FollowupTemplatesSettings />,
          },
          {
            id: "rapid_entry",
            title: "Rapid Entry Settings",
            icon: Bolt,
            lede: "Which fields show in Rapid Entry, and their defaults.",
            help: <HelpLink section="rapid-entry-settings" />,
            show: can("lead.leads"),
            body: <RapidEntrySettings />,
          },
          {
            id: "bookmarklet",
            title: "One-click lead clipper",
            icon: Scissors,
            lede: "Save leads from LinkedIn or Instagram in one click.",
            help: <HelpLink section="clipper" />,
            show: can("lead.leads"),
            body: <BookmarkletCard />,
          },
          {
            id: "shortcuts",
            title: "Keyboard shortcuts",
            icon: Keyboard,
            lede: "Every keyboard shortcut, and your own bindings.",
            help: <HelpLink section="search-and-shortcuts" />,
            show: can("settings.shortcuts"),
            body: <ShortcutsSettings />,
          },
        ],
      },
      {
        label: "Team",
        items: [
          {
            id: "users",
            title: "Users and access",
            icon: Users,
            lede: "Who is in this workspace, their role and what they can access.",
            help: <HelpLink section="team" />,
            show: isAdmin,
            body: <UsersSettings />,
          },
          {
            id: "presets",
            title: "Access presets",
            icon: Shield,
            lede: "Reusable bundles of permissions for teammates.",
            show: isAdmin,
            body: <PresetsSettings />,
          },
        ],
      },
      {
        label: "Data",
        items: [
          {
            id: "data",
            title: "Data",
            icon: Database,
            lede: "Clear lead data from this workspace.",
            show: canData,
            body: <DataSettings />,
          },
          {
            id: "import_mappings",
            title: "Saved import mappings",
            icon: FileSpreadsheet,
            lede: "Column mappings saved from past imports.",
            show: canData,
            body: <ImportMappingsSettings />,
          },
          {
            id: "google_sheet",
            title: "Google Sheet",
            icon: Sheet,
            lede: "The Google Sheet your leads sync to.",
            help: <HelpLink section="google-sheet" />,
            show: !IS_TEST_MODE,
            body: <GoogleConnectCard />,
          },
          {
            id: "auto_backup",
            title: "Automatic backup",
            icon: CloudUpload,
            lede: "Hourly or daily backups to your Google Sheet.",
            show: !IS_TEST_MODE && canData,
            body: <AutoBackupSettings />,
          },
        ],
      },
      {
        label: "App",
        items: [
          {
            id: "test_mode",
            title: "Test app indicator",
            icon: Shield,
            lede: "Show or hide the TEST APP badge.",
            show: IS_TEST_MODE && isAdmin,
            body: <TestAppIndicatorToggle />,
          },
        ],
      },
      {
        label: "",
        items: [
          {
            id: "contact",
            title: "Contact us",
            icon: CircleHelp,
            lede: "Get help from the Tracker team.",
            show: true,
            body: <ContactSettings />,
          },
          {
            id: "danger_zone",
            title: "Danger zone",
            icon: TriangleAlert,
            lede: "Permanent actions for your account. They cannot be undone.",
            help: <HelpLink section="your-data" />,
            show: true,
            body: <DangerZoneSettings />,
            danger: true,
          },
        ],
      },
    ] satisfies SectionGroup[]
  )
    .map((g) => ({ ...g, items: g.items.filter((i) => i.show) }))
    .filter((g) => g.items.length);

  const allItems = groups.flatMap((g) => g.items);
  const [activeId, setActiveId] = useState("overview");
  const [query, setQuery] = useState("");
  const hashApplied = useRef(false);
  const initialHash = useRef<string | null>(null);

  useEffect(() => {
    if (hashApplied.current) return;
    if (initialHash.current === null) initialHash.current = window.location.hash.replace("#", "");
    const id = initialHash.current;
    const match = allItems.some((i) => i.id === id) ? id : null;
    if (match) {
      hashApplied.current = true;
      setActiveId(match);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allItems.length]);

  const open = (id: string) => {
    setActiveId(id);
    window.history.replaceState(null, "", `#${id}`);
    window.scrollTo({ top: 0 });
  };
  const backToOverview = () => {
    setActiveId("overview");
    window.history.replaceState(null, "", window.location.pathname);
  };

  const active = activeId === "overview" ? null : (allItems.find((i) => i.id === activeId) ?? null);
  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => !q || `${i.title} ${i.lede}`.toLowerCase().includes(q)),
    }))
    .filter((g) => g.items.length);
  const backTo = module === "crm" ? "/crm/dashboard" : "/lt/dashboard";

  const navItem = "pressable flex h-[32px] items-center gap-2.5 rounded-lg px-2.5 text-left text-[13px] font-medium transition-colors";
  const navActive = "bg-subtle font-semibold text-foreground shadow-xs";
  const navIdle = "text-muted-foreground hover:bg-subtle/60 hover:text-foreground";

  return (
    <AppPage module={module} title="Settings" perm="settings.view" heading={false}>
      <div className="flex min-h-screen bg-background text-foreground">
        <aside className="sticky top-0 hidden h-screen w-[248px] shrink-0 overflow-y-auto border-r border-border bg-background px-3 py-4 md:block">
          <Link to={backTo} className={cn(navItem, navIdle)}>
            <ArrowLeft className="size-4 shrink-0" strokeWidth={1.75} />
            Back
          </Link>
          <button type="button" onClick={backToOverview} className={cn(navItem, "mt-2 w-full", active ? navIdle : navActive)}>
            <LayoutGrid className="size-4 shrink-0" strokeWidth={1.75} />
            Overview
          </button>
          <nav aria-label="Settings sections" className="mt-1 flex flex-col">
            {groups.map((group, gi) => (
              <div key={gi} className="flex flex-col gap-0.5">
                {group.label ? (
                  <div className="section-label px-2.5 pt-5 pb-1.5">{group.label}</div>
                ) : (
                  <div className="h-4" />
                )}
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => open(item.id)}
                    className={cn(
                      navItem,
                      item.id === active?.id ? navActive : navIdle,
                      item.danger && "text-negative hover:text-negative",
                    )}
                  >
                    <item.icon className="size-4 shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 leading-tight">{item.title}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <div className="min-w-0 flex-1 bg-background px-4 py-5 md:px-10 md:py-10">
          <div className={cn("mx-auto w-full", active?.unboxed ? "max-w-[1320px]" : "max-w-[860px]")}>
            {active ? (
              <button
                type="button"
                onClick={backToOverview}
                className="mb-4 flex items-center gap-1 text-[13px] font-medium text-muted-foreground md:hidden"
              >
                <ChevronLeft className="size-4" />
                Settings
              </button>
            ) : (
              <Link
                to={backTo}
                className="mb-4 flex w-fit items-center gap-1 text-[13px] font-medium text-muted-foreground md:hidden"
              >
                <ArrowLeft className="size-4" />
                Back
              </Link>
            )}

            {!active && (
              <section aria-label="All settings">
                <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <h2 className="text-[24px] font-semibold tracking-tight">Settings</h2>
                  <div className="relative w-full sm:max-w-[260px]">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-faint" />
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search"
                      className="h-9 pl-8 text-[13px]"
                    />
                  </div>
                </div>
                {filtered.length === 0 && (
                  <p className="text-[13px] text-muted-foreground">No settings match "{query}".</p>
                )}
                {filtered.map((group, gi) => (
                  <div key={gi} className={cn(gi > 0 && "mt-10")}>
                    <h3 className="mb-5 text-[16px] font-semibold tracking-tight">{group.label || "General"}</h3>
                    <div className="grid gap-x-6 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => open(item.id)}
                          className="pressable group -m-2 flex items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-subtle/60"
                        >
                          <span
                            className={cn(
                              "grid size-10 shrink-0 place-items-center rounded-[10px] border border-border bg-surface shadow-xs transition-colors group-hover:border-faint",
                              item.danger ? "text-negative" : "text-foreground",
                            )}
                          >
                            <item.icon className="size-[18px]" strokeWidth={1.75} />
                          </span>
                          <span className="min-w-0">
                            <span className={cn("block text-[13.5px] font-semibold", item.danger && "text-negative")}>
                              {item.title}
                            </span>
                            <span className="mt-0.5 line-clamp-3 block text-[12px] leading-snug text-muted-foreground">
                              {item.lede}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            {active && (
              <section className={cn(active.unboxed ? "w-full" : "max-w-[760px]")} aria-labelledby="settings-title">
                <div className="flex items-center gap-2">
                  <h3
                    id="settings-title"
                    className={cn("text-[22px] font-semibold tracking-tight", active.danger && "text-negative")}
                  >
                    {active.title}
                  </h3>
                  {active.help}
                </div>
                <p className="mt-1 mb-6 max-w-[62ch] text-[13px] text-muted-foreground">{active.lede}</p>
                <div
                  key={active.id}
                  className={cn(
                    "animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
                    active.unboxed ? "mt-2" : "pro-card p-5",
                  )}
                >
                  {active.body}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </AppPage>
  );
}
