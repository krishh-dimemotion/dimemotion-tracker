import { CollapsibleCard } from "@/components/kit";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { LeadFilters } from "./filters";
import type { Stage, Channel, SenderAccount, Country, Tag } from "./types";
import { STATUS_OPTIONS } from "./types";

export function LeadFilterBar({
  filters,
  onChange,
  stages,
  countries,
  channels,
  senderAccounts,
  tags,
  showArchivedToggle,
}: {
  filters: LeadFilters;
  onChange: (f: LeadFilters) => void;
  stages: Stage[];
  countries: Country[];
  channels: Channel[];
  senderAccounts: SenderAccount[];
  tags: Tag[];
  showArchivedToggle?: boolean;
}) {
  const set = <K extends keyof LeadFilters>(key: K, value: LeadFilters[K]) => onChange({ ...filters, [key]: value });

  const Picker = ({ label, value, onValue, options }: { label: string; value: string; onValue: (v: string) => void; options: { id: string; name: string }[] }) => (
    <div className="flex flex-col gap-1">
      <span className="label-text">{label}</span>
      <Select value={value || "__all"} onValueChange={(v) => onValue(v === "__all" ? "" : v)}>
        <SelectTrigger className="h-8 w-[160px] text-[13px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <CollapsibleCard id="lt.filters" title="Filters" defaultOpen={false}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <span className="label-text">Search</span>
          <Input
            className="h-8 w-[220px] text-[13px]"
            placeholder="Company, contact, code"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
          />
        </div>
        <Picker label="Stage" value={filters.stageId} onValue={(v) => set("stageId", v)} options={stages.map((s) => ({ id: s.id, name: s.name }))} />
        <Picker label="Country" value={filters.countryId} onValue={(v) => set("countryId", v)} options={countries.map((c) => ({ id: c.id, name: c.name }))} />
        <Picker label="Channel" value={filters.channelId} onValue={(v) => set("channelId", v)} options={channels.map((c) => ({ id: c.id, name: c.name }))} />
        <Picker label="Sender account" value={filters.senderAccountId} onValue={(v) => set("senderAccountId", v)} options={senderAccounts.map((s) => ({ id: s.id, name: s.label }))} />
        <Picker label="Status" value={filters.status} onValue={(v) => set("status", v)} options={STATUS_OPTIONS.map((s) => ({ id: s, name: s }))} />
        <Picker label="Tag" value={filters.tagId} onValue={(v) => set("tagId", v)} options={tags.map((t) => ({ id: t.id, name: t.name }))} />
        <div className="flex flex-col gap-1">
          <span className="label-text">Date added</span>
          <div className="flex items-center gap-1">
            <Input type="date" className="h-8 w-[135px] text-[13px]" value={filters.dateFrom} onChange={(e) => set("dateFrom", e.target.value)} />
            <span className="text-muted-foreground">–</span>
            <Input type="date" className="h-8 w-[135px] text-[13px]" value={filters.dateTo} onChange={(e) => set("dateTo", e.target.value)} />
          </div>
        </div>
        <Picker label="Has replied" value={filters.hasReplied} onValue={(v) => set("hasReplied", v as LeadFilters["hasReplied"])} options={[{ id: "yes", name: "Yes" }, { id: "no", name: "No" }]} />
        <Picker label="Loom sent" value={filters.hasLoomSent} onValue={(v) => set("hasLoomSent", v as LeadFilters["hasLoomSent"])} options={[{ id: "yes", name: "Yes" }, { id: "no", name: "No" }]} />
        <button className="label-text underline" onClick={() => onChange({ ...filters, search: "", stageId: "", countryId: "", channelId: "", senderAccountId: "", status: "", tagId: "", dateFrom: "", dateTo: "", hasReplied: "", hasLoomSent: "" })}>
          Clear all
        </button>
      </div>
    </CollapsibleCard>
  );
}
