import { useEffect, useState, type ChangeEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Calendar, Check, FileText, Plus, Save, Trash2, Upload, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, EmptyState, Loading } from "@/components/live/kit";
import {
  BANK_TEMPLATES_KEY,
  DEFAULT_BUSINESS_PROFILE,
  generateLutNumber,
  saveBankTemplates,
  saveBusinessProfile,
  saveInvoiceTemplates,
  useBankTemplates,
  useBusinessProfile,
  useInvoiceTemplates,
  type BankTemplate,
  type BusinessProfile,
  type InvoiceTemplate,
} from "@/components/account/invoice-template-types";

type Confirm = { title: string; description: string; confirmLabel: string; action: () => void };

const COUNTRY_FLAGS = ["🇺🇸", "🇪🇺", "🇮🇳", "🇬🇧", "🇦🇪", "🇨🇦", "🇦🇺", "🇸🇬"];
const BANK_CURRENCIES = ["USD", "EUR", "GBP", "INR", "CAD", "AUD", "AED", "SGD", "JPY", "CHF"];

function Field({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={className}>
      <div className="label-text mb-1">{label}</div>
      {children}
    </div>
  );
}

function DetailRow({ label, value, valueClass }: { label: string; value: ReactNode; valueClass: string }) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={valueClass}>{value}</span>
    </div>
  );
}

const withoutKey = <T,>(obj: Record<string, T>, key: string) => {
  const next = { ...obj };
  delete next[key];
  return next;
};

export function InvoiceTemplatesSettings() {
  const qc = useQueryClient();
  const { data: savedProfile, isLoading: profileLoading } = useBusinessProfile();
  const { data: templates = [], isLoading: templatesLoading } = useInvoiceTemplates();
  const { data: banks = [], isLoading: banksLoading } = useBankTemplates();
  const [profile, setProfile] = useState<BusinessProfile>(DEFAULT_BUSINESS_PROFILE);
  const [savingProfile, setSavingProfile] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [bankDraft, setBankDraft] = useState<BankTemplate | null>(null);
  const [savingBank, setSavingBank] = useState(false);
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, InvoiceTemplate>>({});
  const [savingTemplateId, setSavingTemplateId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (savedProfile) setProfile(savedProfile);
  }, [savedProfile]);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await saveBusinessProfile(profile);
      void qc.invalidateQueries({ queryKey: ["app_settings", "crm_invoice_business_profile"] });
      toast.success("Business profile and default settings saved");
    } catch (e) {
      const description = e instanceof Error ? e.message : "Unknown database error";
      toast.error("Business profile was not saved", { description });
    } finally {
      setSavingProfile(false);
    }
  };

  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2_097_152) {
      toast.error("Logo must be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setProfile((p) => ({ ...p, logoUrl: reader.result as string }));
      toast.success("Logo uploaded");
    };
    reader.readAsDataURL(file);
  };

  const addTemplate = async () => {
    const name = newName.trim() || `Template ${templates.length + 1}`;
    const tpl: InvoiceTemplate = {
      id: `tpl_${Date.now()}`,
      name,
      currency: "USD",
      theme: "white",
      notes: "",
      terms: "",
      items: [
        {
          id: "item-1",
          description: "Service Deliverable",
          quantity: 1,
          rate: 1000,
          taxType: "none",
          gstRate: 18,
          amount: 1000,
        },
      ],
      createdAt: new Date().toISOString(),
    };
    setDrafts((d) => ({ ...d, [tpl.id]: tpl }));
    setNewName("");
    setOpenTemplateId(tpl.id);
    toast.info(`Template "${name}" is a draft. Click Save Template to create it.`);
  };

  const ask = (title: string, description: string, confirmLabel: string, action: () => void) =>
    setConfirm({ title, description, confirmLabel, action });

  const deleteTemplate = (id: string) => {
    ask(
      "Delete invoice template?",
      "This template will be removed from your saved templates. This action cannot be undone.",
      "Delete template",
      () => {
        void (async () => {
          try {
            await saveInvoiceTemplates(templates.filter((t) => t.id !== id));
            void qc.invalidateQueries({ queryKey: ["app_settings", "crm_invoice_templates"] });
            toast.success("Template deleted");
          } catch (e) {
            const description = e instanceof Error ? e.message : "Unknown database error";
            toast.error("Template was not deleted", { description });
          }
        })();
      },
    );
  };

  const updateDraft = (t: InvoiceTemplate) => setDrafts((d) => ({ ...d, [t.id]: t }));

  const openFresh = (t: InvoiceTemplate) => {
    if (openTemplateId) setDrafts((d) => withoutKey(d, openTemplateId));
    setDrafts((d) => ({ ...d, [t.id]: d[t.id] || { ...t, items: (t.items || []).map((i) => ({ ...i })) } }));
    setOpenTemplateId(t.id);
  };

  const toggleEditor = (t: InvoiceTemplate) => {
    if (openTemplateId === t.id) {
      if (drafts[t.id])
        ask(
          "Discard unsaved changes?",
          "Your changes to this template have not been saved. Discard them and close the editor?",
          "Discard changes",
          () => {
            setDrafts((d) => withoutKey(d, t.id));
            setOpenTemplateId(null);
          },
        );
      else setOpenTemplateId(null);
      return;
    }
    if (openTemplateId && drafts[openTemplateId]) {
      ask(
        "Discard unsaved changes?",
        "Your current template has unsaved changes. Discard them and open another template?",
        "Discard and continue",
        () => openFresh(t),
      );
      return;
    }
    setDrafts((d) => ({ ...d, [t.id]: d[t.id] || { ...t, items: (t.items || []).map((i) => ({ ...i })) } }));
    setOpenTemplateId(t.id);
  };

  const closeEditor = (id: string) => {
    if (drafts[id]) {
      ask(
        "Discard unsaved changes?",
        "Your changes have not been saved. Discard them and close the editor?",
        "Discard changes",
        () => {
          setDrafts((d) => withoutKey(d, id));
          setOpenTemplateId(null);
        },
      );
      return;
    }
    setOpenTemplateId(null);
  };

  const saveTemplate = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;
    if (!draft.name.trim()) {
      toast.error("Enter a template name before saving");
      return;
    }
    setSavingTemplateId(id);
    try {
      const clean = { ...draft, name: draft.name.trim() };
      const next = templates.some((t) => t.id === id)
        ? templates.map((t) => (t.id === id ? clean : t))
        : [clean, ...templates];
      await saveInvoiceTemplates(next);
      setDrafts((d) => withoutKey(d, id));
      void qc.invalidateQueries({ queryKey: ["app_settings", "crm_invoice_templates"] });
      toast.success(`Template "${clean.name}" saved`);
    } catch {
      toast.error("Could not save template. Your edits are still here, please try again.");
    } finally {
      setSavingTemplateId(null);
    }
  };

  const addBank = () => {
    setBankDraft({
      id: `bank_${Date.now()}`,
      name: "",
      countryEmoji: "🇺🇸",
      currency: "USD",
      bankName: "",
      accountHolder: profile.companyName || "",
      accountNumber: "",
      ifscOrSwift: "",
      paymentMethod: "ACH or Fedwire",
      accountType: "Business checking account",
      routingNumber: "",
      wireRoutingNumber: "",
      beneficiaryAddress: "",
      iban: "",
      upiId: "",
      paymentLink: "",
      instructions: "",
      lutNumber: "",
      isDefault: banks.length === 0,
    });
    // Matches live: the editing id is generated separately from the draft id.
    setEditingBankId(`bank_${Date.now()}`);
  };

  const editBank = (b: BankTemplate) => {
    setBankDraft({ ...b });
    setEditingBankId(b.id);
  };

  const saveBank = async () => {
    const g = bankDraft;
    if (!g) return;
    if (!g.name.trim()) {
      toast.error("Please enter a name / label for this bank account (e.g. 'Wise USD' or 'HDFC INR')");
      return;
    }
    if (!g.bankName.trim()) {
      toast.error("Please enter the bank name");
      return;
    }
    if (!g.accountNumber.trim()) {
      toast.error("Please enter an account number or IBAN");
      return;
    }
    setSavingBank(true);
    try {
      let next = banks.some((b) => b.id === g.id) ? banks.map((b) => (b.id === g.id ? g : b)) : [g, ...banks];
      if (g.isDefault) next = next.map((b) => ({ ...b, isDefault: b.id === g.id }));
      await saveBankTemplates(next);
      void qc.invalidateQueries({ queryKey: ["app_settings", BANK_TEMPLATES_KEY] });
      toast.success(`Bank details "${g.name}" saved`);
      setEditingBankId(null);
      setBankDraft(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save bank details");
    } finally {
      setSavingBank(false);
    }
  };

  const deleteBank = (id: string) => {
    ask(
      "Delete bank account details?",
      "This saved bank profile will be removed. Existing issued invoices will not be affected.",
      "Delete account",
      () => {
        void (async () => {
          try {
            await saveBankTemplates(banks.filter((b) => b.id !== id));
            void qc.invalidateQueries({ queryKey: ["app_settings", BANK_TEMPLATES_KEY] });
            toast.success("Bank account removed");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Could not delete bank account");
          }
        })();
      },
    );
  };

  if (profileLoading || templatesLoading || banksLoading) return <Loading />;

  const p = profile;
  const g = bankDraft;
  const setG = (patch: Partial<BankTemplate>) => g && setBankDraft({ ...g, ...patch });

  return (
    <>
      <Dialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirm?.title || "Confirm action"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{confirm?.description}</p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                const action = confirm?.action;
                setConfirm(null);
                action?.();
              }}
            >
              {confirm?.confirmLabel || "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="space-y-6">
        {/* Default sender profile */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="size-4 text-muted-foreground" />
                Default Sender Profile
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                These details will automatically pre-fill on every new invoice you create.
              </p>
            </div>
            <Button size="sm" onClick={saveProfile} disabled={savingProfile} className="gap-1.5 text-xs">
              <Save className="size-3.5" /> Save Profile
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="col-span-1 sm:col-span-2 flex items-center gap-4 pb-2">
              {p.logoUrl ? (
                <div className="relative group">
                  <img
                    src={p.logoUrl}
                    alt="Company Logo"
                    className="h-14 w-auto max-w-[140px] object-contain rounded border p-1"
                  />
                  <button
                    type="button"
                    onClick={() => setProfile((x) => ({ ...x, logoUrl: "" }))}
                    className="mt-1 text-[11px] text-destructive hover:underline block"
                  >
                    Remove logo
                  </button>
                </div>
              ) : (
                <div className="h-14 w-14 rounded border border-dashed flex items-center justify-center text-muted-foreground text-xs">
                  No Logo
                </div>
              )}
              <label className="cursor-pointer inline-flex items-center gap-1.5 text-xs border border-border rounded px-3 py-1.5 hover:bg-subtle transition-colors">
                <Upload className="size-3.5" /> Upload Company Logo
                <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
              </label>
            </div>
            <Field label="Company / Business Name">
              <Input
                value={p.companyName}
                placeholder="e.g. Acme Corp or Studio"
                onChange={(e) => setProfile({ ...p, companyName: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="Tax / GST Number (GSTIN)">
              <Input
                value={p.businessNumber}
                placeholder="e.g. GSTIN27AAACR1234F1Z5"
                onChange={(e) => setProfile({ ...p, businessNumber: e.target.value })}
                className="text-xs h-8 font-mono"
              />
            </Field>
            <Field label="Billing Email">
              <Input
                value={p.email}
                placeholder="billing@yourcompany.com"
                onChange={(e) => setProfile({ ...p, email: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="Phone Number">
              <Input
                value={p.phone}
                placeholder="+1 (555) 000-0000"
                onChange={(e) => setProfile({ ...p, phone: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="Street Address" className="col-span-1 sm:col-span-2">
              <Input
                value={p.address}
                placeholder="123 Market St, Suite 400"
                onChange={(e) => setProfile({ ...p, address: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="City">
              <Input
                value={p.city}
                placeholder="City"
                onChange={(e) => setProfile({ ...p, city: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="State / Province">
              <Input
                value={p.state}
                placeholder="State"
                onChange={(e) => setProfile({ ...p, state: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="PIN / Postal Code">
              <Input
                value={p.pinCode}
                placeholder="Postal Code"
                onChange={(e) => setProfile({ ...p, pinCode: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="Country">
              <Input
                value={p.country}
                placeholder="Country"
                onChange={(e) => setProfile({ ...p, country: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
            <Field label="Website URL" className="col-span-1 sm:col-span-2">
              <Input
                value={p.website}
                placeholder="https://yourcompany.com"
                onChange={(e) => setProfile({ ...p, website: e.target.value })}
                className="text-xs h-8"
              />
            </Field>
          </div>
        </Card>

        {/* Saved bank accounts */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Wallet className="size-4 text-muted-foreground" />
                Saved Bank &amp; Payout Accounts
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Save your multi-currency accounts (Wise, Stripe, Revolut, local bank). Select them in one click inside
                the Invoice Builder.
              </p>
            </div>
            <Button size="sm" onClick={addBank} disabled={!!editingBankId} className="gap-1.5 text-xs">
              <Plus className="size-3.5" /> Add Bank Account
            </Button>
          </div>

          {editingBankId && g && (
            <div className="rounded-lg border border-border bg-subtle/50 p-4 mb-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-semibold text-foreground">
                  {banks.some((b) => b.id === editingBankId) ? "Edit Bank Account" : "New Bank Account"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingBankId(null);
                      setBankDraft(null);
                    }}
                    className="text-xs h-7"
                  >
                    Cancel
                  </Button>
                  <Button size="sm" onClick={() => void saveBank()} disabled={savingBank} className="text-xs h-7 gap-1">
                    <Check className="size-3" /> Save Account
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Account Label / Nickname *">
                  <Input
                    value={g.name}
                    placeholder="e.g. Wise USD Account, HDFC Savings"
                    onChange={(e) => setG({ name: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="Country Flag / Emoji">
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={g.countryEmoji || ""}
                      placeholder="🇺🇸"
                      onChange={(e) => setG({ countryEmoji: e.target.value })}
                      className="text-base h-8 w-16 text-center"
                    />
                    <div className="flex flex-wrap gap-1">
                      {COUNTRY_FLAGS.map((f) => (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setG({ countryEmoji: f })}
                          className="text-sm hover:scale-125 transition-transform"
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                  </div>
                </Field>
                <Field label="Currency *">
                  <Select value={g.currency} onValueChange={(v) => setG({ currency: v })}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BANK_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c} className="text-xs">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Bank Name *">
                  <Input
                    value={g.bankName}
                    placeholder="e.g. JPMorgan Chase, Wise, HDFC Bank"
                    onChange={(e) => setG({ bankName: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="Account Holder Name">
                  <Input
                    value={g.accountHolder}
                    placeholder="e.g. John Doe / Studio Inc"
                    onChange={(e) => setG({ accountHolder: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="Account Number / IBAN *">
                  <Input
                    value={g.accountNumber}
                    placeholder="Account Number or IBAN"
                    onChange={(e) => setG({ accountNumber: e.target.value })}
                    className="text-xs h-8 font-mono"
                  />
                </Field>
                <Field label="SWIFT / BIC / IFSC / Routing">
                  <Input
                    value={g.ifscOrSwift}
                    placeholder="SWIFT, IFSC, or Routing"
                    onChange={(e) => setG({ ifscOrSwift: e.target.value })}
                    className="text-xs h-8 font-mono"
                  />
                </Field>
                <Field label="UPI ID (Optional)">
                  <Input
                    value={g.upiId || ""}
                    placeholder="e.g. user@okhdfcbank"
                    onChange={(e) => setG({ upiId: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="Payment Link (Optional)">
                  <Input
                    value={g.paymentLink || ""}
                    placeholder="https://buy.stripe.com/..."
                    onChange={(e) => setG({ paymentLink: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="Payment Method / Transfer">
                  <Input
                    value={g.paymentMethod || ""}
                    placeholder="e.g. ACH or Fedwire"
                    onChange={(e) => setG({ paymentMethod: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="Account Type">
                  <Input
                    value={g.accountType || ""}
                    placeholder="e.g. Business checking account"
                    onChange={(e) => setG({ accountType: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <Field label="ACH Routing Number">
                  <Input
                    value={g.routingNumber || ""}
                    placeholder="ACH Routing (9 digits)"
                    onChange={(e) => setG({ routingNumber: e.target.value })}
                    className="text-xs h-8 font-mono"
                  />
                </Field>
                <Field label="Fedwire Routing Number">
                  <Input
                    value={g.wireRoutingNumber || ""}
                    placeholder="Wire Routing (Fedwire)"
                    onChange={(e) => setG({ wireRoutingNumber: e.target.value })}
                    className="text-xs h-8 font-mono"
                  />
                </Field>
                <Field label="Beneficiary Address" className="sm:col-span-2">
                  <Input
                    value={g.beneficiaryAddress || ""}
                    placeholder="e.g. 123 Main St, New York, NY 10001"
                    onChange={(e) => setG({ beneficiaryAddress: e.target.value })}
                    className="text-xs h-8"
                  />
                </Field>
                <div className="sm:col-span-3 rounded-lg border border-border/80 bg-subtle/30 p-2.5">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="label-text flex items-center gap-1.5 font-medium text-foreground">
                      <span className="inline-flex items-center justify-center rounded bg-foreground px-1.5 py-0.5 text-[9px] font-bold text-background uppercase">
                        LUT
                      </span>
                      LUT Number (Letter of Undertaking)
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[11px] px-2"
                      onClick={() => {
                        const lut = generateLutNumber();
                        setG({ lutNumber: lut });
                        toast.success(`Generated LUT Number: ${lut}`);
                      }}
                    >
                      Generate LUT
                    </Button>
                  </div>
                  <Input
                    value={g.lutNumber || ""}
                    placeholder="e.g. AD030226003650S"
                    onChange={(e) => setG({ lutNumber: e.target.value.toUpperCase() })}
                    className="text-xs h-8 font-mono tracking-wider"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Used for GST zero-rated export invoices. Displayed prominently below bank transfer details.
                  </p>
                </div>
                <Field label="Wire / Payment Instructions (Optional)" className="sm:col-span-3">
                  <Textarea
                    value={g.instructions || ""}
                    placeholder="e.g. Please include invoice number in wire memo. Intermediary bank details..."
                    onChange={(e) => setG({ instructions: e.target.value })}
                    className="text-xs min-h-[50px]"
                  />
                </Field>
                <div className="sm:col-span-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="bank-is-default"
                    checked={!!g.isDefault}
                    onChange={(e) => setG({ isDefault: e.target.checked })}
                    className="rounded border-border text-primary size-4"
                  />
                  <label htmlFor="bank-is-default" className="text-xs text-foreground cursor-pointer select-none">
                    Set as default bank account on new invoices
                  </label>
                </div>
              </div>
            </div>
          )}

          {banks.length === 0 && !editingBankId ? (
            <EmptyState
              title="No bank accounts saved"
              hint="Add your Wise, Revolut, or primary bank details once to easily attach them to any invoice."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {banks.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-col justify-between rounded-lg border border-border bg-card p-3.5 hover:border-foreground/30 transition-colors"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 font-medium text-xs text-foreground">
                        <span className="text-base">{b.countryEmoji || "🏦"}</span>
                        <span>{b.name}</span>
                        <span className="rounded bg-subtle px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground border">
                          {b.currency}
                        </span>
                        {b.isDefault && (
                          <span className="rounded bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-medium">
                            Default
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => editBank(b)}
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        >
                          <FileText className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => deleteBank(b.id)}
                          className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2.5 text-[11px] space-y-1 text-muted-foreground">
                      <DetailRow label="Bank:" value={b.bankName} valueClass="text-foreground font-medium" />
                      {b.accountHolder && (
                        <DetailRow label="Holder:" value={b.accountHolder} valueClass="text-foreground" />
                      )}
                      <DetailRow label="Account / IBAN:" value={b.accountNumber} valueClass="font-mono text-foreground" />
                      {b.ifscOrSwift && (
                        <DetailRow label="SWIFT / IFSC:" value={b.ifscOrSwift} valueClass="font-mono text-foreground" />
                      )}
                      {b.routingNumber && (
                        <DetailRow label="ACH Routing:" value={b.routingNumber} valueClass="font-mono text-foreground" />
                      )}
                      {b.paymentMethod && (
                        <DetailRow label="Method:" value={b.paymentMethod} valueClass="text-foreground" />
                      )}
                      {b.upiId && <DetailRow label="UPI ID:" value={b.upiId} valueClass="text-foreground" />}
                      {b.lutNumber && (
                        <div className="flex items-center justify-between pt-1 border-t border-border/60">
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-foreground">
                            <span className="rounded bg-foreground px-1 py-0.2 text-[8px] font-bold text-background uppercase">
                              LUT
                            </span>
                            ARN:
                          </span>
                          <span className="font-mono text-[10px] font-semibold text-foreground tracking-wider">
                            {b.lutNumber}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Saved invoice templates */}
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-border">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="size-4 text-muted-foreground" />
                Saved Invoice Templates
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Create and manage recurring service line items, currencies, notes, and terms.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="New template name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="h-8 text-xs w-44"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTemplate();
                  }
                }}
              />
              <Button size="sm" onClick={() => void addTemplate()} className="gap-1 text-xs h-8">
                <Plus className="size-3.5" /> Add Template
              </Button>
            </div>
          </div>

          {templates.length === 0 && Object.keys(drafts).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-xs">
              No templates created yet. You can create templates here or save one directly while building an invoice.
            </div>
          ) : (
            <div className="space-y-4">
              {[...templates, ...Object.values(drafts).filter((d) => !templates.some((t) => t.id === d.id))].map(
                (base) => {
                  const t = drafts[base.id] || base;
                  const open = openTemplateId === t.id;
                  const unsaved = !templates.some((x) => x.id === t.id);
                  const setItems = (items: InvoiceTemplate["items"]) => updateDraft({ ...t, items });
                  return (
                    <div key={t.id} className="rounded-lg border border-border bg-subtle/30 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground">{t.name}</span>
                          <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                            {t.currency} • {t.theme}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            {t.items?.length || 0} line {t.items?.length === 1 ? "item" : "items"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button variant="ghost" size="sm" onClick={() => toggleEditor(base)} className="text-xs h-7">
                            {open ? "Close Editor" : "Edit Template"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => (unsaved ? closeEditor(t.id) : deleteTemplate(t.id))}
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                            title="Delete template"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      {open && (
                        <>
                          <div className="mt-4 pt-4 border-t border-border space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              <Field label="Template Name">
                                <Input
                                  value={t.name}
                                  onChange={(e) => updateDraft({ ...t, name: e.target.value })}
                                  className="text-xs h-8"
                                />
                              </Field>
                              <Field label="Currency">
                                <Select value={t.currency} onValueChange={(v) => updateDraft({ ...t, currency: v })}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="USD">USD ($)</SelectItem>
                                    <SelectItem value="INR">INR (₹)</SelectItem>
                                    <SelectItem value="EUR">EUR (€)</SelectItem>
                                    <SelectItem value="GBP">GBP (£)</SelectItem>
                                    <SelectItem value="CAD">CAD ($)</SelectItem>
                                    <SelectItem value="AUD">AUD ($)</SelectItem>
                                    <SelectItem value="AED">AED (د.إ)</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                              <Field label="Color Theme">
                                <Select value={t.theme} onValueChange={(v) => updateDraft({ ...t, theme: v })}>
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="white">White Theme</SelectItem>
                                    <SelectItem value="black">Black Theme</SelectItem>
                                  </SelectContent>
                                </Select>
                              </Field>
                            </div>
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-medium text-foreground">Preset Line Items</span>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() =>
                                    setItems([
                                      ...(t.items || []),
                                      {
                                        id: `item-${Date.now()}`,
                                        description: "",
                                        quantity: 1,
                                        rate: 0,
                                        taxType: "none",
                                        gstRate: 18,
                                        amount: 0,
                                      },
                                    ])
                                  }
                                  className="h-7 text-xs gap-1"
                                >
                                  <Plus className="size-3" /> Add item
                                </Button>
                              </div>
                              <div className="space-y-2">
                                {t.items?.map((item, idx) => (
                                  <div key={item.id || idx} className="flex items-center gap-2">
                                    <Input
                                      value={item.description}
                                      placeholder="Deliverable description"
                                      onChange={(e) =>
                                        setItems(
                                          t.items.map((x, i) =>
                                            i === idx ? { ...x, description: e.target.value } : x,
                                          ),
                                        )
                                      }
                                      className="text-xs h-8 flex-1"
                                    />
                                    <Input
                                      type="number"
                                      min="1"
                                      value={item.quantity}
                                      onChange={(e) => {
                                        const q = Number(e.target.value) || 1;
                                        setItems(
                                          t.items.map((x, i) =>
                                            i === idx ? { ...x, quantity: q, amount: q * x.rate } : x,
                                          ),
                                        );
                                      }}
                                      className="text-xs h-8 w-16 text-right font-mono"
                                    />
                                    <Input
                                      type="number"
                                      min="0"
                                      value={item.rate}
                                      onChange={(e) => {
                                        const r = Number(e.target.value) || 0;
                                        setItems(
                                          t.items.map((x, i) =>
                                            i === idx ? { ...x, rate: r, amount: r * x.quantity } : x,
                                          ),
                                        );
                                      }}
                                      className="text-xs h-8 w-24 text-right font-mono"
                                    />
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => setItems(t.items.filter((_, i) => i !== idx))}
                                      className="h-8 w-8 text-destructive"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <Field label="Preset Client Notes">
                                <Textarea
                                  value={t.notes || ""}
                                  onChange={(e) => updateDraft({ ...t, notes: e.target.value })}
                                  className="text-xs min-h-[50px]"
                                  placeholder="Thank you for your business..."
                                />
                              </Field>
                              <Field label="Preset Terms & Conditions">
                                <Textarea
                                  value={t.terms || ""}
                                  onChange={(e) => updateDraft({ ...t, terms: e.target.value })}
                                  className="text-xs min-h-[50px]"
                                  placeholder="Payment due in 14 days..."
                                />
                              </Field>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2 border-t border-border pt-3">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => closeEditor(t.id)}
                              disabled={savingTemplateId === t.id}
                            >
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => void saveTemplate(t.id)}
                              disabled={savingTemplateId === t.id}
                              className="gap-1.5"
                            >
                              <Save className="size-3.5" /> {savingTemplateId === t.id ? "Saving..." : "Save Template"}
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                },
              )}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
