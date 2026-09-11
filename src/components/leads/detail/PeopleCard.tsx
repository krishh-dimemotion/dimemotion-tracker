import { useEffect, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { CollapsibleCard } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LeadContact } from "@/components/leads/types";

function emailsArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

function PersonBlock({
  contact,
  canEdit,
  canRemove,
  onChange,
  onRemove,
}: {
  contact: LeadContact;
  canEdit: boolean;
  canRemove: boolean;
  onChange: (patch: Record<string, unknown>) => void;
  onRemove: () => void;
}) {
  const [name, setName] = useState(contact.person_name ?? "");
  const [title, setTitle] = useState(contact.job_title ?? "");
  const [email, setEmail] = useState(contact.email ?? "");
  const [linkedin, setLinkedin] = useState(contact.linkedin_url ?? "");
  const [instagram, setInstagram] = useState(contact.instagram_url ?? "");
  const [phone, setPhone] = useState(contact.phone ?? "");
  const [extraEmail, setExtraEmail] = useState("");
  const emails = emailsArray(contact.emails);

  useEffect(() => {
    setName(contact.person_name ?? "");
    setTitle(contact.job_title ?? "");
    setEmail(contact.email ?? "");
    setLinkedin(contact.linkedin_url ?? "");
    setInstagram(contact.instagram_url ?? "");
    setPhone(contact.phone ?? "");
  }, [contact.id]);

  return (
    <div className="rounded-md border border-border p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <Input
          placeholder="Person name"
          className="h-8 text-[13px]"
          value={name}
          disabled={!canEdit}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== (contact.person_name ?? "") && onChange({ person_name: name || null })}
        />
        <Input
          placeholder="Job title"
          className="h-8 text-[13px]"
          value={title}
          disabled={!canEdit}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== (contact.job_title ?? "") && onChange({ job_title: title || null })}
        />
        <Input
          placeholder="Email"
          className="h-8 text-[13px]"
          value={email}
          disabled={!canEdit}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => email !== (contact.email ?? "") && onChange({ email: email || null })}
        />
        <Input
          placeholder="LinkedIn URL"
          className="h-8 text-[13px]"
          value={linkedin}
          disabled={!canEdit}
          onChange={(e) => setLinkedin(e.target.value)}
          onBlur={() => linkedin !== (contact.linkedin_url ?? "") && onChange({ linkedin_url: linkedin || null })}
        />
        <Input
          placeholder="Instagram URL"
          className="h-8 text-[13px]"
          value={instagram}
          disabled={!canEdit}
          onChange={(e) => setInstagram(e.target.value)}
          onBlur={() => instagram !== (contact.instagram_url ?? "") && onChange({ instagram_url: instagram || null })}
        />
        <Input
          placeholder="Phone"
          className="h-8 text-[13px]"
          value={phone}
          disabled={!canEdit}
          onChange={(e) => setPhone(e.target.value)}
          onBlur={() => phone !== (contact.phone ?? "") && onChange({ phone: phone || null })}
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {emails.map((em, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded-md border border-border px-1.5 py-0.5 text-[12px]">
            {em}
            {canEdit && (
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => onChange({ emails: emails.filter((_, idx) => idx !== i) })}
              >
                <X className="size-3" />
              </button>
            )}
          </span>
        ))}
        {canEdit && (
          <div className="flex items-center gap-1">
            <Input
              placeholder="Additional email"
              className="h-7 w-[180px] text-[12px]"
              value={extraEmail}
              onChange={(e) => setExtraEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && extraEmail.trim()) {
                  onChange({ emails: [...emails, extraEmail.trim()] });
                  setExtraEmail("");
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[12px]"
              onClick={() => {
                if (extraEmail.trim()) {
                  onChange({ emails: [...emails, extraEmail.trim()] });
                  setExtraEmail("");
                }
              }}
            >
              Add email
            </Button>
          </div>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
          <input
            type="checkbox"
            checked={!!contact.is_primary}
            disabled={!canEdit}
            onChange={(e) => onChange({ is_primary: e.target.checked })}
          />
          Primary contact
        </label>
        {canEdit && canRemove && (
          <Button variant="ghost" size="icon" className="size-7" onClick={onRemove}>
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export function PeopleCard({
  contacts,
  canEdit,
  onChange,
  onAdd,
  onRemove,
}: {
  contacts: LeadContact[];
  canEdit: boolean;
  onChange: (contactId: string, patch: Record<string, unknown>) => void;
  onAdd: () => void;
  onRemove: (contactId: string) => void;
}) {
  return (
    <CollapsibleCard id="lead.people" title="People">
      <div className="flex flex-col gap-3">
        {contacts.map((c) => (
          <PersonBlock
            key={c.id}
            contact={c}
            canEdit={canEdit}
            canRemove={contacts.length > 1}
            onChange={(patch) => onChange(c.id, patch)}
            onRemove={() => onRemove(c.id)}
          />
        ))}
        {canEdit && (
          <Button variant="outline" size="sm" className="w-fit" onClick={onAdd}>
            <Plus className="mr-1 size-3.5" /> Add person
          </Button>
        )}
      </div>
    </CollapsibleCard>
  );
}
