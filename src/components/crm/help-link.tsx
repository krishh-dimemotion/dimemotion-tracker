// Ported from live app-shell (Hr / Ur). Small "?" link into the public guide.
import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

const GUIDE_URL = "https://tracker.infosized.co/guide";
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
      <CircleHelp className="size-3.5" />
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
