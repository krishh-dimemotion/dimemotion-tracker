// Live chunk: TemplateSelect-BdD2yEjV.js
// Export mapping:
//   t -> TemplateSelect      n -> Settings2Icon (lucide Settings2)
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import {
  templatesForChannel,
  useOutreachTemplates,
  type OutreachTemplate,
} from "@/lib/live/outreach-templates";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui";

export { Settings2 as Settings2Icon } from "lucide-react";

const NONE = "__none";

export function TemplateSelect({
  channelId,
  value,
  onChange,
  disabled,
  className,
  placeholder = "Outreach template",
  showManageLink = false,
}: {
  channelId?: string | null;
  value?: string | null;
  onChange: (template: OutreachTemplate | null) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  showManageLink?: boolean;
}) {
  const { data } = useOutreachTemplates();
  const forChannel = templatesForChannel(data, channelId);
  const current = value ? (data ?? []).find((t) => t.id === value) : undefined;
  const options = current && !forChannel.some((t) => t.id === current.id) ? [current, ...forChannel] : forChannel;

  if (options.length === 0)
    return showManageLink ? (
      <Link
        to="/settings"
        hash="outreach_templates"
        className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
      >
        Add outreach templates in Settings
      </Link>
    ) : (
      <span className="text-[12px] text-faint">No templates</span>
    );

  return (
    <Select
      value={value ?? NONE}
      disabled={disabled}
      onValueChange={(v) => onChange(v === NONE ? null : (options.find((t) => t.id === v) ?? null))}
    >
      <SelectTrigger className={cn("h-8 min-w-0 text-[13px]", className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>No template</SelectItem>
        {options.map((t) => (
          <SelectItem key={t.id} value={t.id}>
            {t.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
