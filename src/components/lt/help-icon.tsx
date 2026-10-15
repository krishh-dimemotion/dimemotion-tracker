// Live app-shell `Hr`: small "?" link into the in-app guide.
import { CircleHelp } from "lucide-react";

const GUIDE_URL = "https://tracker.infosized.co/guide";
const helpHref = (section?: string) => (section ? `${GUIDE_URL}#${section}` : GUIDE_URL);

export function HelpIcon({ section, label = "What does this mean?" }: { section: string; label?: string }) {
  return (
    <a
      href={helpHref(section)}
      target="_blank"
      rel="noreferrer"
      title={label}
      aria-label={label}
      onClick={(e) => e.stopPropagation()}
      className="inline-flex size-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:bg-subtle hover:text-foreground"
    >
      <CircleHelp className="size-3.5" />
    </a>
  );
}
