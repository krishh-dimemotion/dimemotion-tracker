export type ShortcutAction = {
  key: string;
  label: string;
  binding: string;
};

export const DEFAULT_SHORTCUTS: ShortcutAction[] = [
  { key: "help", label: "Open shortcuts help", binding: "?" },
  { key: "palette", label: "Command palette", binding: "Mod+K" },
  { key: "go.dashboard", label: "Go to Dashboard", binding: "G D" },
  { key: "go.leads", label: "Go to Leads", binding: "G L" },
  { key: "go.outreach", label: "Go to Outreach Tracker", binding: "G O" },
  { key: "go.crm", label: "Go to CRM Records", binding: "G C" },
  { key: "go.pipeline", label: "Go to Pipeline", binding: "G P" },
  { key: "go.revenue", label: "Go to Revenue", binding: "G R" },
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
