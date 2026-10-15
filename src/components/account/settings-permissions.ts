export const PERMISSION_GROUPS = [
  {
    label: "Modules",
    keys: [
      { key: "module.lead_tracker", label: "Lead Tracker module" },
      { key: "module.crm", label: "CRM module" },
    ],
  },
  {
    label: "Lead Tracker",
    keys: [
      { key: "lead.dashboard", label: "Dashboard" },
      { key: "lead.leads", label: "Leads" },
      { key: "lead.lead_create", label: "Create leads" },
      { key: "lead.lead_edit", label: "Edit leads" },
      { key: "lead.lead_delete", label: "Delete leads" },
      { key: "lead.outreach_tracker", label: "Outreach Tracker" },
      { key: "lead.ledger", label: "Ledger" },
      { key: "lead.archive", label: "Archive" },
      { key: "lead.import_export", label: "Import / Export" },
    ],
  },
  {
    label: "CRM",
    keys: [
      { key: "crm.records", label: "Records" },
      { key: "crm.pipeline", label: "Pipeline" },
      { key: "crm.followups", label: "Follow-ups" },
      { key: "crm.todos", label: "To-dos" },
      { key: "crm.record_edit", label: "Edit records" },
      { key: "crm.revenue", label: "Revenue" },
    ],
  },
  {
    label: "Settings",
    keys: [
      { key: "settings.view", label: "View settings" },
      { key: "settings.stages", label: "Stages" },
      { key: "settings.accounts", label: "Channels and accounts" },
      { key: "settings.countries", label: "Countries" },
      { key: "settings.tags", label: "Tags" },
      { key: "settings.targets", label: "Outreach targets" },
      { key: "settings.shortcuts", label: "Keyboard shortcuts" },
    ],
  },
];

export const ALL_PERMISSION_KEYS = PERMISSION_GROUPS.flatMap((g) => g.keys.map((k) => k.key));

export type PermissionPreset = {
  id: string;
  name: string;
  permission_keys: string[];
  is_builtin: boolean;
};
