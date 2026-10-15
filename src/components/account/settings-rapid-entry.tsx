import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/lib/live/auth";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loading } from "@/components/live/kit";
import {
  RAPID_ENTRY_CONFIG_KEY,
  saveRapidEntryConfig,
  useRapidEntryConfig,
  type RapidEntryConfig,
} from "@/lib/live/config";

type Kind = "instagram" | "linkedin" | "email";
type Row = { label: string; show: string; def?: string };

const SECTIONS: { kind: Kind; title: string; rows: Row[] }[] = [
  {
    kind: "instagram",
    title: "Instagram",
    rows: [
      { label: "Outreach Sent", show: "showOutreachSent", def: "defaultOutreachSent" },
      { label: "Outreach Seen / Replied", show: "showReplied", def: "defaultReplied" },
      { label: "Sent From Account", show: "showSenderAccount" },
      { label: "Tags", show: "showTags" },
    ],
  },
  {
    kind: "linkedin",
    title: "LinkedIn",
    rows: [
      { label: "Connection Request Sent", show: "showConnectionSent", def: "defaultConnectionSent" },
      { label: "Message Sent", show: "showMessageSent", def: "defaultMessageSent" },
      { label: "Replied", show: "showReplied", def: "defaultReplied" },
      { label: "Sent From Account", show: "showSenderAccount" },
      { label: "Tags", show: "showTags" },
    ],
  },
  {
    kind: "email",
    title: "Email",
    rows: [
      { label: "Email Sent", show: "showEmailSent", def: "defaultEmailSent" },
      { label: "Email Replied", show: "showReplied", def: "defaultReplied" },
      { label: "Sender Account", show: "showSenderAccount" },
      { label: "Tags", show: "showTags" },
    ],
  },
];

const ROW = "grid grid-cols-[1fr_70px_90px] items-center rounded-md bg-subtle px-2 py-2 text-[13px]";

export function RapidEntrySettings() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useRapidEntryConfig();
  if (isLoading || !cfg) return <Loading label="Loading rapid entry settings" />;
  const config = cfg as unknown as Record<Kind, Record<string, unknown>>;

  const set = async (kind: Kind, key: string, value: unknown) => {
    const next = { ...config, [kind]: { ...config[kind], [key]: value } };
    qc.setQueryData(["app_settings", RAPID_ENTRY_CONFIG_KEY], next);
    try {
      await saveRapidEntryConfig(next as unknown as RapidEntryConfig);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save rapid entry settings");
    }
    void qc.invalidateQueries({ queryKey: ["app_settings", RAPID_ENTRY_CONFIG_KEY] });
  };
  const on = (kind: Kind, key: string) => !!config[kind][key];

  return (
    <div className="flex flex-col gap-5">
      <div className="text-[12px] text-muted-foreground">
        Choose which quick buttons appear on the Instagram, LinkedIn and Email lead pages, and whether they start
        switched on.
        {!isAdmin && " Only admins can change these."}
      </div>
      {SECTIONS.map((s) => (
        <div key={s.kind}>
          <div className="mb-2 text-[12px] font-medium text-muted-foreground">{s.title}</div>
          <div className="flex flex-col gap-1">
            <div className="grid grid-cols-[1fr_70px_90px] items-center px-2 text-[11px] text-muted-foreground">
              <span>Button</span>
              <span className="text-center">Show</span>
              <span className="text-center">On by default</span>
            </div>
            {s.rows.map((r) => (
              <div key={r.show} className={ROW}>
                <span>{r.label}</span>
                <span className="flex justify-center">
                  <Switch
                    checked={on(s.kind, r.show)}
                    disabled={!isAdmin}
                    onCheckedChange={(v) => void set(s.kind, r.show, v)}
                  />
                </span>
                <span className="flex justify-center">
                  {r.def ? (
                    <Switch
                      checked={on(s.kind, r.def)}
                      disabled={!isAdmin || !on(s.kind, r.show)}
                      onCheckedChange={(v) => void set(s.kind, r.def!, v)}
                    />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">n/a</span>
                  )}
                </span>
              </div>
            ))}
            <div className={ROW}>
              <span>Next Follow-up</span>
              <span className="flex justify-center">
                <Switch
                  checked={!!config[s.kind].showFollowup}
                  disabled={!isAdmin}
                  onCheckedChange={(v) => void set(s.kind, "showFollowup", v)}
                />
              </span>
              <span className="flex justify-center">
                <Select
                  value={String(config[s.kind].defaultFollowup ?? "none")}
                  disabled={!isAdmin || !config[s.kind].showFollowup}
                  onValueChange={(v) => void set(s.kind, "defaultFollowup", v)}
                >
                  <SelectTrigger className="h-7 w-[84px] text-[12px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="2">+2 Days</SelectItem>
                    <SelectItem value="3">+3 Days</SelectItem>
                    <SelectItem value="7">+7 Days</SelectItem>
                  </SelectContent>
                </Select>
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
