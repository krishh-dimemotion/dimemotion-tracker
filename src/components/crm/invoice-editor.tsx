// Ported from live chunk crm.invoices-CGKC86lD.js (je). Full invoice builder with live preview.
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { useBlocker } from "@tanstack/react-router";
import {
  ArrowLeft,
  BookmarkPlus,
  Building2,
  DollarSign,
  FileText,
  FolderDown,
  Palette,
  Plus,
  Printer,
  Save,
  Trash2,
  Upload,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, DatePicker } from "@/components/live/kit";
import {
  EMPTY_BUSINESS_PROFILE,
  EMPTY_PAYMENT_DETAILS,
  generateLutNumber,
  nextInvoiceNumber,
  saveBusinessProfile,
  saveInvoiceTemplates,
  useBankTemplates,
  useBusinessProfile,
  useInvoices,
  useInvoiceTemplates,
  type BusinessProfile,
  type ClientDetails,
  type CustomField,
  type Invoice,
  type InvoiceStatus,
  type InvoiceTheme,
  type LineItem,
  type PaymentDetails,
  type TaxType,
} from "@/components/crm/invoice-types";
import { InvoicePreview, printInvoiceSheet } from "@/components/crm/invoice-preview";

export const UNSAVED_DRAFT_KEY = "crm_invoice_unsaved_draft_v1";

export type PrefillClient = {
  crmRecordId?: string;
  leadId?: string;
  dealValue?: number;
  currency?: string;
  companyName?: string;
  contactPerson?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  country?: string;
  taxNumber?: string;
};

type Props = {
  initialInvoice?: Invoice | null;
  initialInvoiceIsLocalDraft?: boolean;
  onSave: (inv: Invoice) => Promise<boolean | void>;
  onCancel: () => void;
  onDelete?: (id: string) => void;
  onDeleteDraft?: (id: string) => void;
  onDiscardDraft?: () => void;
  prefillClient?: PrefillClient | null;
  initialTemplateId?: string;
  startFresh?: boolean;
};

const TWO_WEEKS = 12096e5;
const today = () => new Date().toISOString().slice(0, 10);
const inTwoWeeks = () => new Date(Date.now() + TWO_WEEKS).toISOString().slice(0, 10);

function clientFromPrefill(p?: PrefillClient | null): ClientDetails {
  return {
    companyName: p?.companyName || "",
    contactPerson: p?.contactPerson || "",
    email: p?.email || "",
    phone: p?.phone || "",
    address: p?.address || "",
    city: p?.city || "",
    state: p?.state || "",
    pinCode: p?.pinCode || "",
    country: p?.country || "",
    taxNumber: p?.taxNumber || "",
  };
}

function firstItem(p?: PrefillClient | null): LineItem[] {
  return [
    {
      id: "item-1",
      description: "",
      quantity: 1,
      rate: p?.dealValue || 0,
      taxType: "none",
      gstRate: 18,
      amount: p?.dealValue || 0,
    },
  ];
}

const viewBtn = (active: boolean) =>
  `rounded px-2.5 py-1 font-medium transition-colors ${active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`;

export function InvoiceEditor({
  initialInvoice: inv,
  initialInvoiceIsLocalDraft = false,
  onSave,
  onCancel,
  onDelete,
  onDeleteDraft,
  onDiscardDraft,
  prefillClient: prefill,
  initialTemplateId,
  startFresh = false,
}: Props) {
  const { data: profile } = useBusinessProfile();
  const { data: invoices = [] } = useInvoices();
  const { data: templates = [] } = useInvoiceTemplates();
  const { data: bankTemplates = [] } = useBankTemplates();

  const [view, setView] = useState<"editor" | "split" | "preview">("split");
  const [restorable, setRestorable] = useState<Invoice | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [savingOnLeave, setSavingOnLeave] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState(inv?.invoiceNumber || nextInvoiceNumber(invoices));
  const [issueDate, setIssueDate] = useState(inv?.issueDate || today());
  const [dueDate, setDueDate] = useState(inv?.dueDate || inTwoWeeks());
  const [currency, setCurrency] = useState(inv?.currency || prefill?.currency || "USD");
  const [theme, setTheme] = useState<InvoiceTheme>(inv?.theme || "white");
  const [status, setStatus] = useState<InvoiceStatus>(inv?.status || "draft");

  useEffect(() => {
    if (!inv && invoices.length > 0 && (!invoiceNumber || invoiceNumber.startsWith("INV-")))
      setInvoiceNumber(nextInvoiceNumber(invoices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, inv]);

  const [sender, setSender] = useState<BusinessProfile>(inv?.sender || profile || EMPTY_BUSINESS_PROFILE);
  useEffect(() => {
    if (!inv?.sender && profile) setSender(profile);
  }, [profile, inv]);

  const [client, setClient] = useState<ClientDetails>(inv?.client || clientFromPrefill(prefill));
  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [leadId, setLeadId] = useState<string | null>(inv?.leadId || prefill?.leadId || null);
  const [emailWarning, setEmailWarning] = useState("");
  const [signatureText, setSignatureText] = useState(inv?.signatureText || "");
  const [signatureImage, setSignatureImage] = useState(inv?.signatureImage || "");
  const [customFields, setCustomFields] = useState<CustomField[]>(inv?.customFields || []);

  useEffect(() => {
    if (!leadSearch.trim()) {
      setLeadResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const q = leadSearch
        .trim()
        .replace(/[%_,()]/g, " ")
        .replace(/\s+/g, " ");
      const { data: leads } = await (supabase as any).from("leads").select("*").limit(500);
      const bare = q
        .toLowerCase()
        .replace(/^#?lead[-\s]*/i, "")
        .trim();
      const direct = (leads ?? [])
        .filter((l: any) => {
          const fields = [
            l.id,
            l.lead_id,
            l.lead_number,
            l.lead_code,
            l.reference,
            l.display_id,
            l.company_name,
            l.primary_contact,
            l.email,
          ];
          return (
            fields.some((f) => f != null && String(f).toLowerCase().includes(q.toLowerCase())) ||
            (bare.length > 0 && fields.some((f) => f != null && String(f).toLowerCase().includes(bare)))
          );
        })
        .slice(0, 20);
      let viaContacts: any[] = [];
      const { data: contacts } = await (supabase as any)
        .from("lead_contacts")
        .select("*")
        .or(`person_name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(20);
      if (contacts?.length) {
        const ids = [...new Set(contacts.map((c: any) => c.lead_id).filter(Boolean))];
        if (ids.length) {
          const { data } = await (supabase as any)
            .from("leads")
            .select("*, countries(name), lead_contacts(*)")
            .in("id", ids);
          viaContacts = data ?? [];
        }
      }
      const merged = new Map<string, any>();
      [...(direct ?? []), ...viaContacts].forEach((l) => merged.set(l.id, l));
      setLeadResults([...merged.values()].slice(0, 8));
      setSearching(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [leadSearch]);

  const pickLead = (lead: any) => {
    const contacts: any[] = Array.isArray(lead.lead_contacts) ? lead.lead_contacts : [];
    const needle = leadSearch.trim().toLowerCase();
    const matched = needle
      ? contacts.find((c) =>
          String(c.person_name || c.name || "")
            .trim()
            .toLowerCase()
            .includes(needle),
        )
      : undefined;
    const name: string =
      matched?.person_name || matched?.name || lead.primary_contact || contacts[0]?.person_name || contacts[0]?.name || "";
    const lower = name.trim().toLowerCase();
    const contact =
      contacts.find(
        (c) =>
          String(c.person_name || c.name || "")
            .trim()
            .toLowerCase() === lower,
      ) ||
      contacts.find((c) => c.is_primary === true || c.primary === true) ||
      contacts[0];
    const verified = contact && !!contact?.email?.trim() && contact?.email_verified === true ? contact : null;
    const email: string = verified?.email || "";
    const phone: string = contact?.phone || "";
    const country: string = lead.countries?.name || "";
    setEmailWarning(
      email
        ? ""
        : "No verified email is available for " +
            (name || lead.company_name) +
            ". Add an email only after it has been verified in the CRM.",
    );
    setLeadId(lead.id || null);
    setClient({
      companyName: lead.company_name || "",
      contactPerson: name,
      email,
      phone,
      address: "",
      city: "",
      state: "",
      pinCode: "",
      country,
      taxNumber: "",
    });
    setLeadSearch("");
    setLeadResults([]);
    if (name || email || phone || country) toast.success(`Autofilled details from ${lead.company_name}`);
    else
      toast.info(
        `Selected "${lead.company_name}". Note: No contact details (email/phone/address) found on this lead record.`,
      );
  };

  const [items, setItems] = useState<LineItem[]>(inv?.items || firstItem(prefill));
  const [payment, setPayment] = useState<PaymentDetails>(inv?.paymentDetails || EMPTY_PAYMENT_DETAILS);
  const [notes, setNotes] = useState(inv?.notes ?? "");
  const [terms, setTerms] = useState(inv?.terms ?? "");
  const [discount, setDiscount] = useState(inv?.discount ?? 0);
  const [roundOff, setRoundOff] = useState(inv?.roundOff ?? false);
  const [lutNumber, setLutNumber] = useState(inv?.lutNumber ?? "");

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      toast.error("Please enter a template name");
      return;
    }
    const tpl = {
      id: `tpl_${Date.now()}`,
      name: templateName.trim(),
      currency,
      theme,
      notes,
      terms,
      items: items.map((it, i) => ({ ...it, id: `tpl_it_${i + 1}` })),
      paymentDetails: payment,
      createdAt: new Date().toISOString(),
    };
    await saveInvoiceTemplates([tpl, ...templates]);
    toast.success(`Template "${tpl.name}" saved`);
    setTemplateName("");
    setTemplateOpen(false);
  };

  const applyTemplate = (id: string) => {
    if (!id) return;
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (t.currency) setCurrency(t.currency);
    if (t.theme) setTheme(t.theme);
    if (t.notes !== undefined) setNotes(t.notes);
    if (t.terms !== undefined) setTerms(t.terms);
    if (t.items && t.items.length > 0) setItems(t.items.map((it, i) => ({ ...it, id: `item_${Date.now()}_${i}` })));
    if (t.paymentDetails) setPayment(t.paymentDetails);
    toast.success(`Applied template "${t.name}"`);
  };

  useEffect(() => {
    if (initialTemplateId && templates.length > 0) applyTemplate(initialTemplateId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTemplateId, templates.length]);

  const subtotal = items.reduce((acc, it) => acc + it.quantity * it.rate, 0);
  let cgst = 0;
  let sgst = 0;
  let cess = 0;
  let customTax = 0;
  items.forEach((it) => {
    const line = it.quantity * it.rate;
    if (it.taxType === "gst") {
      const gst = line * (it.gstRate / 100);
      cgst += gst / 2;
      sgst += gst / 2;
      if (it.cessRate) cess += line * (it.cessRate / 100);
    } else if (it.taxType === "custom" && it.customTaxRate) customTax += line * (it.customTaxRate / 100);
  });
  const totalTax = cgst + sgst + cess + customTax;
  const beforeRound = Math.max(0, subtotal - discount + totalTax);
  const roundOffAmount = roundOff ? Math.round(beforeRound) - beforeRound : 0;
  const grandTotal = Math.max(0, beforeRound + roundOffAmount);

  const updateItem = (id: string, patch: Partial<LineItem>) => {
    setItems((list) =>
      list.map((it) => {
        if (it.id !== id) return it;
        const next = { ...it, ...patch };
        next.amount = next.quantity * next.rate;
        return next;
      }),
    );
  };
  const addItem = () => {
    setItems((list) => [
      ...list,
      { id: `item-${Date.now()}`, description: "", quantity: 1, rate: 0, taxType: "none", gstRate: 18, amount: 0 },
    ]);
  };
  const removeItem = (id: string) => {
    if (items.length <= 1) {
      toast.error("Invoice must have at least one line item");
      return;
    }
    setItems((list) => list.filter((it) => it.id !== id));
  };
  const onLogo = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2097152) {
      toast.error("Logo file must be smaller than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const url = reader.result as string;
      setSender((s) => ({ ...s, logoUrl: url }));
      toast.success("Logo uploaded");
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    if (inv || prefill || startFresh) return;
    try {
      const raw = localStorage.getItem(UNSAVED_DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (d && d.id && d.invoiceNumber && d.client && Array.isArray(d.items)) {
        setRestorable(d);
        setRestoreOpen(true);
      }
    } catch {
      localStorage.removeItem(UNSAVED_DRAFT_KEY);
    }
  }, [inv, prefill, startFresh]);

  const fallbackId = useRef(`inv_${Date.now()}`);
  const current: Invoice = {
    id: inv?.id || fallbackId.current,
    invoiceNumber,
    issueDate,
    dueDate,
    currency,
    theme,
    status,
    sender,
    client,
    items,
    paymentDetails: payment,
    notes,
    terms,
    lutNumber,
    subtotal,
    totalTax,
    cgstTotal: cgst,
    sgstTotal: sgst,
    cessTotal: cess,
    discount,
    roundOff,
    roundOffAmount,
    grandTotal,
    leadId: leadId || inv?.leadId || prefill?.leadId || null,
    crmRecordId: inv?.crmRecordId || prefill?.crmRecordId || null,
    signatureText,
    signatureImage,
    customFields,
    createdAt: inv?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const baseClient = inv?.client ?? clientFromPrefill(prefill);
  const baseItems = inv?.items ?? firstItem(prefill);
  const dirty = !!(
    status !== (inv?.status ?? "draft") ||
    currency !== (inv?.currency ?? prefill?.currency ?? "USD") ||
    theme !== (inv?.theme ?? "white") ||
    issueDate !== (inv?.issueDate ?? today()) ||
    dueDate !== (inv?.dueDate ?? inTwoWeeks()) ||
    Object.entries(client).some(
      ([k, v]) => String(v ?? "").trim() !== String((baseClient as Record<string, unknown>)[k] ?? "").trim(),
    ) ||
    (inv
      ? JSON.stringify(items) !== JSON.stringify(baseItems)
      : items.some(
          (it) =>
            it.description.trim() ||
            it.rate !== (prefill?.dealValue || 0) ||
            it.quantity !== 1 ||
            it.taxType !== "none" ||
            (it.gstRate ?? 18) !== 18 ||
            !!(it.customTaxRate || it.cessRate),
        )) ||
    signatureText !== (inv?.signatureText ?? "") ||
    signatureImage !== (inv?.signatureImage ?? "") ||
    JSON.stringify(customFields) !== JSON.stringify(inv?.customFields ?? []) ||
    JSON.stringify(payment) !== JSON.stringify(inv?.paymentDetails || EMPTY_PAYMENT_DETAILS) ||
    notes !== (inv?.notes ?? "") ||
    terms !== (inv?.terms ?? "") ||
    discount !== (inv?.discount ?? 0) ||
    roundOff !== (inv?.roundOff ?? false) ||
    lutNumber !== (inv?.lutNumber ?? "") ||
    JSON.stringify(sender) !== JSON.stringify(inv?.sender || profile || EMPTY_BUSINESS_PROFILE)
  );

  const latest = useRef<Invoice | null>(null);
  const guardOn = useRef(true);
  const blocker = useBlocker({
    shouldBlockFn: () => guardOn.current && dirty && !savingOnLeave,
    withResolver: true,
    enableBeforeUnload: () => guardOn.current && dirty && !savingOnLeave,
  });
  latest.current = current;

  useEffect(
    () => () => {
      if (inv || prefill || !guardOn.current) return;
      const snap = latest.current;
      if (snap)
        try {
          if (!dirty) {
            localStorage.removeItem(UNSAVED_DRAFT_KEY);
            return;
          }
          localStorage.setItem(UNSAVED_DRAFT_KEY, JSON.stringify({ ...snap, updatedAt: new Date().toISOString() }));
        } catch {
          /* ignore */
        }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inv, prefill],
  );

  useEffect(() => {
    if (inv || prefill || restoreOpen || restorable) return;
    const t = window.setTimeout(() => {
      try {
        if (!dirty) {
          localStorage.removeItem(UNSAVED_DRAFT_KEY);
          return;
        }
        localStorage.setItem(UNSAVED_DRAFT_KEY, JSON.stringify({ ...current, updatedAt: new Date().toISOString() }));
      } catch {
        /* ignore */
      }
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoiceNumber,
    issueDate,
    dueDate,
    currency,
    theme,
    status,
    sender,
    client,
    items,
    payment,
    notes,
    terms,
    subtotal,
    totalTax,
    cgst,
    sgst,
    cess,
    discount,
    roundOff,
    roundOffAmount,
    grandTotal,
    leadId,
    signatureText,
    signatureImage,
    customFields,
    lutNumber,
    inv,
    prefill,
    restoreOpen,
    restorable,
    dirty,
  ]);

  const restoreDraft = () => {
    if (!restorable) return;
    const d = restorable;
    setInvoiceNumber(d.invoiceNumber);
    setIssueDate(d.issueDate);
    setDueDate(d.dueDate);
    setCurrency(d.currency);
    setTheme(d.theme);
    setStatus(d.status || "draft");
    setSender(d.sender);
    setClient(d.client);
    setItems(d.items);
    setPayment(d.paymentDetails);
    setNotes(d.notes || "");
    setTerms(d.terms || "");
    setDiscount(d.discount || 0);
    setRoundOff(!!d.roundOff);
    setLutNumber(d.lutNumber || "");
    setSignatureText(d.signatureText || "");
    setSignatureImage(d.signatureImage || "");
    setCustomFields(d.customFields || []);
    setRestorable(null);
    setRestoreOpen(false);
    toast.success("Draft restored. Continue editing your invoice.");
  };

  const discardDraft = () => {
    guardOn.current = false;
    try {
      localStorage.removeItem(UNSAVED_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setRestorable(null);
    setRestoreOpen(false);
    onDiscardDraft?.();
  };

  const save = async () => {
    if (!invoiceNumber.trim()) {
      toast.error("Please provide an invoice number");
      return;
    }
    if (!client.companyName.trim()) {
      toast.error("Please enter a client / company name");
      return;
    }
    void saveBusinessProfile(sender);
    if ((await onSave(current)) !== false) {
      guardOn.current = false;
      try {
        localStorage.removeItem(UNSAVED_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      toast.success("Invoice saved successfully");
    }
  };

  const saveAndLeave = async () => {
    if (!invoiceNumber.trim()) {
      toast.error("Please provide an invoice number before leaving.");
      return;
    }
    if (!client.companyName.trim()) {
      toast.error("Please enter a client / company name before leaving.");
      return;
    }
    setSavingOnLeave(true);
    try {
      if ((await onSave({ ...current, updatedAt: new Date().toISOString() })) === false) return;
      guardOn.current = false;
      try {
        localStorage.removeItem(UNSAVED_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setLeaveOpen(false);
      if (blocker.status === "blocked") blocker.proceed?.();
    } finally {
      setSavingOnLeave(false);
    }
  };

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!guardOn.current || !dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const stayHere = () => {
    setLeaveOpen(false);
    if (blocker.status === "blocked") blocker.reset?.();
  };

  return (
    <div className="flex flex-col gap-6">
      <AlertDialog
        open={leaveOpen || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && !savingOnLeave) stayHere();
        }}
      >
        <AlertDialogContent className="w-[calc(100%-2rem)] max-w-lg rounded-xl border border-border bg-background p-6 shadow-2xl sm:p-7">
          <AlertDialogHeader className="space-y-3 text-left">
            <div className="flex size-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600">
              <FileText className="size-5" />
            </div>
            <AlertDialogTitle className="text-lg font-semibold tracking-tight">
              You have an unfinished invoice
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm leading-relaxed">
              Your invoice details have not been saved to your workspace. Choose whether to save this invoice as a
              draft, discard it, or keep editing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2 flex-col gap-2 sm:flex-row sm:justify-end">
            <AlertDialogCancel disabled={savingOnLeave} onClick={stayHere} className="mt-0 sm:order-1">
              Continue editing
            </AlertDialogCancel>
            <Button
              type="button"
              variant="outline"
              disabled={savingOnLeave}
              onClick={() => {
                guardOn.current = false;
                try {
                  if (initialInvoiceIsLocalDraft) localStorage.removeItem(UNSAVED_DRAFT_KEY);
                } catch {
                  /* ignore */
                }
                setLeaveOpen(false);
                if (blocker.status === "blocked") blocker.proceed?.();
                else onCancel();
              }}
              className="sm:order-2"
            >
              Discard invoice
            </Button>
            <AlertDialogAction
              disabled={savingOnLeave}
              onClick={(e) => {
                e.preventDefault();
                void saveAndLeave();
              }}
              className="sm:order-3"
            >
              {savingOnLeave ? "Saving..." : inv ? "Save changes" : "Save as draft"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog
        open={restoreOpen}
        onOpenChange={(open) => {
          if (!open) discardDraft();
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Continue your invoice draft?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            We found an unfinished invoice saved in this browser. Would you like to continue where you left off?
          </p>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={discardDraft}>
              Discard draft
            </Button>
            <Button type="button" onClick={restoreDraft}>
              Continue drafting
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 no-print">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => setLeaveOpen(true)} className="gap-1.5 text-xs">
            <ArrowLeft className="size-4" /> Back to Invoices
          </Button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1 rounded-lg border border-border bg-subtle p-0.5 text-xs">
            <button type="button" onClick={() => setView("editor")} className={viewBtn(view === "editor")}>
              Edit Form
            </button>
            <button
              type="button"
              onClick={() => setView("split")}
              className={`hidden lg:block ${viewBtn(view === "split")}`}
            >
              Split View
            </button>
            <button type="button" onClick={() => setView("preview")} className={viewBtn(view === "preview")}>
              Invoice Preview
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!prefill && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (initialInvoiceIsLocalDraft && onDiscardDraft) discardDraft();
                else if (inv && onDeleteDraft) {
                  guardOn.current = false;
                  onDeleteDraft(inv.id);
                } else if (onDiscardDraft) discardDraft();
                else
                  try {
                    localStorage.removeItem(UNSAVED_DRAFT_KEY);
                  } catch {
                    /* ignore */
                  }
              }}
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Delete this unfinished draft"
            >
              <Trash2 className="size-3.5" /> Delete Draft
            </Button>
          )}
          {templates.length > 0 && (
            <Select onValueChange={applyTemplate}>
              <SelectTrigger className="h-8 text-[12px] gap-1.5 w-[140px]">
                <FolderDown className="size-3.5 text-muted-foreground" />
                <SelectValue placeholder="Apply template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id} className="text-xs">
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setTemplateOpen(true)}
            className="gap-1.5 text-xs"
            title="Save current line items & settings as a reusable template"
          >
            <BookmarkPlus className="size-3.5" /> Save as Template
          </Button>
          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-subtle px-2 py-1">
            <Palette className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground mr-1">Style:</span>
            <button
              type="button"
              onClick={() => setTheme("white")}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-all ${theme === "white" ? "bg-white text-stone-900 border border-stone-300 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              White
            </button>
            <button
              type="button"
              onClick={() => setTheme("black")}
              className={`rounded px-2 py-0.5 text-xs font-medium transition-all ${theme === "black" ? "bg-stone-950 text-stone-100 border border-stone-800 shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Black
            </button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (view === "editor") setView("split");
              printInvoiceSheet(`${invoiceNumber} - ${client.companyName || "Invoice"}`, theme === "black", "editor");
            }}
            className="gap-1.5 text-xs"
          >
            <Printer className="size-3.5" /> Print / PDF
          </Button>
          {inv && onDelete && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Are you sure you want to delete this invoice?")) onDelete(inv.id);
              }}
              className="gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              title="Delete this invoice"
            >
              <Trash2 className="size-3.5" /> Delete
            </Button>
          )}
          <Button size="sm" onClick={save} className="gap-1.5 text-xs font-medium">
            <Save className="size-3.5" /> Save Invoice
          </Button>
        </div>
      </div>

      <div className={`grid gap-6 ${view === "split" ? "grid-cols-1 lg:grid-cols-12" : "grid-cols-1"}`}>
        {(view === "editor" || view === "split") && (
          <div
            className={`${view === "split" ? "lg:col-span-6 xl:col-span-5" : "max-w-3xl mx-auto w-full"} flex flex-col gap-5 no-print`}
          >
            <Card className="p-4 sm:p-5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                <FileText className="size-3.5" /> Invoice Information
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div>
                  <div className="label-text mb-1">Invoice Number *</div>
                  <Input
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Currency</div>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="h-8 text-[12px]">
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
                </div>
                <div>
                  <div className="label-text mb-1">Status</div>
                  <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus)}>
                    <SelectTrigger className="h-8 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="sent">Sent</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="overdue">Overdue</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="label-text mb-1">Issue Date</div>
                  <DatePicker
                    value={issueDate || undefined}
                    onChange={(v: string | null | undefined) => setIssueDate(v || "")}
                    placeholder="Issue date"
                    className="w-full text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Due Date</div>
                  <DatePicker
                    value={dueDate || undefined}
                    onChange={(v: string | null | undefined) => setDueDate(v || "")}
                    placeholder="Due date"
                    className="w-full text-[12px]"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <Building2 className="size-3.5" /> Your Business (From)
                </h3>
                <label className="cursor-pointer inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5">
                  <Upload className="size-3" /> {sender.logoUrl ? "Change logo" : "Upload logo"}
                  <input type="file" accept="image/*" className="hidden" onChange={onLogo} />
                </label>
              </div>
              {sender.logoUrl && (
                <div className="mb-3 flex items-center gap-2">
                  <img
                    src={sender.logoUrl}
                    alt="Logo"
                    className="h-8 w-auto max-w-[100px] object-contain border rounded p-0.5"
                  />
                  <button
                    type="button"
                    onClick={() => setSender((s) => ({ ...s, logoUrl: "" }))}
                    className="text-[11px] text-destructive hover:underline"
                  >
                    Remove logo
                  </button>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <div className="label-text mb-1">Company Name</div>
                  <Input
                    value={sender.companyName}
                    onChange={(e) => setSender({ ...sender, companyName: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="label-text mb-1">Tax / GST Number</div>
                  <Input
                    value={sender.businessNumber}
                    placeholder="e.g. GSTIN27AAAC..."
                    onChange={(e) => setSender({ ...sender, businessNumber: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Email</div>
                  <Input
                    value={sender.email}
                    onChange={(e) => setSender({ ...sender, email: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Phone</div>
                  <Input
                    value={sender.phone}
                    onChange={(e) => setSender({ ...sender, phone: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div className="col-span-2">
                  <div className="label-text mb-1">Street Address</div>
                  <Input
                    value={sender.address}
                    onChange={(e) => setSender({ ...sender, address: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">City, State</div>
                  <Input
                    value={`${sender.city}${sender.state ? `, ${sender.state}` : ""}`}
                    placeholder="City, State"
                    onChange={(e) => {
                      const [city, ...rest] = e.target.value.split(",");
                      setSender({ ...sender, city: city.trim(), state: rest.join(",").trim() });
                    }}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">PIN / Postal Code</div>
                  <Input
                    value={sender.pinCode}
                    onChange={(e) => setSender({ ...sender, pinCode: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="size-3.5" /> Client Details (To)
                </h3>
              </div>
              <div className="relative mb-3">
                <div className="label-text mb-1">Autofill from existing CRM lead</div>
                <Input
                  value={leadSearch}
                  onChange={(e) => setLeadSearch(e.target.value)}
                  placeholder="Type any letter to search leads by company or contact..."
                  className="h-8 text-[12px]"
                />
                {searching && (
                  <div className="absolute right-3 top-7 text-[11px] text-muted-foreground animate-pulse">
                    Searching...
                  </div>
                )}
                {leadResults.length > 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-1 shadow-lg max-h-56 overflow-y-auto">
                    {leadResults.map((l) => (
                      <button
                        key={l.id}
                        type="button"
                        onClick={() => pickLead(l)}
                        className="flex w-full items-center justify-between rounded px-2.5 py-1.5 text-left text-[12px] hover:bg-subtle transition-colors"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">{l.company_name}</span>
                          {l.primary_contact && (
                            <span className="text-muted-foreground text-[11px]">{l.primary_contact}</span>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground">
                          {l.email || l.countries?.name || "No details"}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {leadSearch.trim().length > 0 && !searching && leadResults.length === 0 && (
                  <div className="absolute z-20 mt-1 w-full rounded-md border border-border bg-popover p-2 text-center text-[12px] text-muted-foreground shadow-lg">
                    No leads found matching "{leadSearch.trim()}". You can still enter details manually below.
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2 sm:col-span-1">
                  <div className="label-text mb-1">Client Company *</div>
                  <Input
                    value={client.companyName}
                    onChange={(e) => setClient({ ...client, companyName: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <div className="label-text mb-1">Contact Person</div>
                  <Input
                    value={client.contactPerson}
                    onChange={(e) => setClient({ ...client, contactPerson: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Email</div>
                  <Input
                    value={client.email}
                    onChange={(e) => setClient({ ...client, email: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                  {"                  "}
                  {emailWarning && (
                    <p className="mt-1 text-[11px] text-amber-600" role="status">
                      {emailWarning}
                    </p>
                  )}
                </div>
                <div>
                  <div className="label-text mb-1">Tax / GST Number (Optional)</div>
                  <Input
                    value={client.taxNumber || ""}
                    onChange={(e) => setClient({ ...client, taxNumber: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <div className="label-text mb-1">Billing Address</div>
                  <Input
                    value={client.address}
                    onChange={(e) => setClient({ ...client, address: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">City, State</div>
                  <Input
                    value={`${client.city}${client.state ? `, ${client.state}` : ""}`}
                    placeholder="City, State"
                    onChange={(e) => {
                      const [city, ...rest] = e.target.value.split(",");
                      setClient({ ...client, city: city.trim(), state: rest.join(",").trim() });
                    }}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Country & PIN</div>
                  <Input
                    value={`${client.country}${client.pinCode ? `, ${client.pinCode}` : ""}`}
                    placeholder="Country, PIN"
                    onChange={(e) => {
                      const [country, ...rest] = e.target.value.split(",");
                      setClient({ ...client, country: country.trim(), pinCode: rest.join(",").trim() });
                    }}
                    className="h-8 text-[12px]"
                  />
                </div>
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <DollarSign className="size-3.5" /> Line Items & Pricing
                </h3>
                <Button variant="outline" size="sm" onClick={addItem} className="h-7 text-[11px] gap-1">
                  <Plus className="size-3" /> Add item
                </Button>
              </div>
              <div className="flex flex-col gap-3">
                {items.map((it, i) => (
                  <div key={it.id} className="rounded-lg border border-border p-3 space-y-2 bg-subtle/40">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground">Item #{i + 1}</span>
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                    <Input
                      placeholder="Item description or service deliverable..."
                      value={it.description}
                      onChange={(e) => updateItem(it.id, { description: e.target.value })}
                      className="h-8 text-[12px]"
                    />
                    <div className="grid grid-cols-4 gap-2">
                      <div>
                        <div className="label-text text-[10px] mb-1">Qty</div>
                        <Input
                          type="number"
                          min="1"
                          value={it.quantity}
                          onChange={(e) => updateItem(it.id, { quantity: Number(e.target.value) || 0 })}
                          className="h-8 text-[12px] font-mono"
                        />
                      </div>
                      <div>
                        <div className="label-text text-[10px] mb-1">Rate ({currency})</div>
                        <Input
                          type="number"
                          min="0"
                          value={it.rate}
                          onChange={(e) => updateItem(it.id, { rate: Number(e.target.value) || 0 })}
                          className="h-8 text-[12px] font-mono"
                        />
                      </div>
                      <div>
                        <div className="label-text text-[10px] mb-1">Tax Mode</div>
                        <Select value={it.taxType} onValueChange={(v) => updateItem(it.id, { taxType: v as TaxType })}>
                          <SelectTrigger className="h-8 text-[11px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No Tax</SelectItem>
                            <SelectItem value="gst">GST (18%)</SelectItem>
                            <SelectItem value="custom">Custom %</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {it.taxType === "gst" ? (
                        <div>
                          <div className="label-text text-[10px] mb-1">GST Rate %</div>
                          <Select
                            value={String(it.gstRate || 18)}
                            onValueChange={(v) => updateItem(it.id, { gstRate: Number(v) })}
                          >
                            <SelectTrigger className="h-8 text-[11px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="5">5% (2.5+2.5)</SelectItem>
                              <SelectItem value="12">12% (6+6)</SelectItem>
                              <SelectItem value="18">18% (9+9)</SelectItem>
                              <SelectItem value="28">28% (14+14)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      ) : it.taxType === "custom" ? (
                        <div>
                          <div className="label-text text-[10px] mb-1">Tax Rate %</div>
                          <Input
                            type="number"
                            value={it.customTaxRate || 0}
                            onChange={(e) => updateItem(it.id, { customTaxRate: Number(e.target.value) || 0 })}
                            className="h-8 text-[12px] font-mono"
                          />
                        </div>
                      ) : (
                        <div>
                          <div className="label-text text-[10px] mb-1">Line Total</div>
                          <div className="h-8 flex items-center px-2 text-[12px] font-mono font-medium text-foreground">
                            {(it.quantity * it.rate).toLocaleString()}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="mt-2 pt-2 border-t border-border flex justify-end">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-muted-foreground">Discount ({currency}):</span>
                    <Input
                      type="number"
                      min="0"
                      value={discount}
                      onChange={(e) => setDiscount(Number(e.target.value) || 0)}
                      className="h-8 w-28 text-[12px] font-mono"
                    />
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3">
                  <span className="text-[12px] text-muted-foreground">Round off total to nearest whole unit</span>
                  <Button
                    type="button"
                    size="sm"
                    variant={roundOff ? "default" : "outline"}
                    className="h-7 text-xs"
                    onClick={() => setRoundOff((v) => !v)}
                    aria-pressed={roundOff}
                  >
                    {roundOff ? "Round off: On" : "Round off: Off"}
                  </Button>
                </div>
                {roundOff && (
                  <div className="mt-2 flex justify-between text-xs text-muted-foreground">
                    <span>Round-off adjustment</span>
                    <span>
                      {roundOffAmount >= 0 ? "+" : ""}
                      {roundOffAmount.toFixed(2)} {currency}
                    </span>
                  </div>
                )}
              </div>
            </Card>

            <Card className="p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Payment Info & Policies
                </h3>
                {bankTemplates.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground">Autofill:</span>
                    <Select
                      onValueChange={(id) => {
                        const b = bankTemplates.find((x) => x.id === id);
                        if (!b) return;
                        setPayment({
                          bankName: b.bankName,
                          accountHolder: b.accountHolder,
                          accountNumber: b.accountNumber,
                          ifscOrSwift: b.ifscOrSwift,
                          paymentMethod: b.paymentMethod || "",
                          accountType: b.accountType || "",
                          routingNumber: b.routingNumber || "",
                          wireRoutingNumber: b.wireRoutingNumber || "",
                          beneficiaryAddress: b.beneficiaryAddress || "",
                          upiId: b.upiId || "",
                          paymentLink: b.paymentLink || "",
                          instructions: b.instructions || "",
                        });
                        if (b.lutNumber) setLutNumber(b.lutNumber);
                        if (b.currency && b.currency !== currency) setCurrency(b.currency);
                        toast.success(`Loaded ${b.countryEmoji || "🏦"} ${b.name}`);
                      }}
                    >
                      <SelectTrigger className="h-7 text-xs w-[190px]">
                        <SelectValue placeholder="Select saved bank..." />
                      </SelectTrigger>
                      <SelectContent>
                        {bankTemplates.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-xs">
                            {b.countryEmoji || "🏦"} {b.name} ({b.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="label-text mb-1">Bank Name</div>
                  <Input
                    value={payment.bankName}
                    placeholder="e.g. JPMorgan Chase"
                    onChange={(e) => setPayment({ ...payment, bankName: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Account Holder</div>
                  <Input
                    value={payment.accountHolder}
                    placeholder="e.g. John Doe / Studio Inc"
                    onChange={(e) => setPayment({ ...payment, accountHolder: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Account Number</div>
                  <Input
                    value={payment.accountNumber}
                    placeholder="Account number or IBAN"
                    onChange={(e) => setPayment({ ...payment, accountNumber: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Payment Method / Transfer</div>
                  <Input
                    value={payment.paymentMethod || ""}
                    placeholder="e.g. ACH or Fedwire"
                    onChange={(e) => setPayment({ ...payment, paymentMethod: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Account Type</div>
                  <Input
                    value={payment.accountType || ""}
                    placeholder="e.g. Business checking account"
                    onChange={(e) => setPayment({ ...payment, accountType: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Routing Number (ACH)</div>
                  <Input
                    value={payment.routingNumber || ""}
                    placeholder="ACH Routing (9 digits)"
                    onChange={(e) => setPayment({ ...payment, routingNumber: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">Wire Routing (Fedwire)</div>
                  <Input
                    value={payment.wireRoutingNumber || ""}
                    placeholder="Wire Routing (Fedwire)"
                    onChange={(e) => setPayment({ ...payment, wireRoutingNumber: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div>
                  <div className="label-text mb-1">IFSC / SWIFT / BIC</div>
                  <Input
                    value={payment.ifscOrSwift}
                    placeholder="IFSC or SWIFT code"
                    onChange={(e) => setPayment({ ...payment, ifscOrSwift: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div className="col-span-2">
                  <div className="label-text mb-1">Beneficiary Address</div>
                  <Input
                    value={payment.beneficiaryAddress || ""}
                    placeholder="e.g. 123 Main St, New York, NY 10001"
                    onChange={(e) => setPayment({ ...payment, beneficiaryAddress: e.target.value })}
                    className="h-8 text-[12px]"
                  />
                </div>
                <div className="col-span-2">
                  <div className="label-text mb-1">UPI ID / Payment Link</div>
                  <Input
                    value={payment.upiId}
                    placeholder="e.g. yourname@okhdfcbank or https://pay.link"
                    onChange={(e) => setPayment({ ...payment, upiId: e.target.value })}
                    className="h-8 text-[12px] font-mono"
                  />
                </div>
                <div className="col-span-2 rounded-lg border border-border/80 bg-subtle/30 p-2.5">
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
                        const n = generateLutNumber();
                        setLutNumber(n);
                        toast.success(`Generated LUT Number: ${n}`);
                      }}
                    >
                      Generate LUT
                    </Button>
                  </div>
                  <Input
                    value={lutNumber}
                    placeholder="e.g. AD030226003650S"
                    onChange={(e) => setLutNumber(e.target.value.toUpperCase())}
                    className="h-8 text-[12px] font-mono tracking-wider"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Export of goods / services under LUT without IGST payment. Displayed prominently below bank
                    transfer details.
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="label-text mb-1">Notes for Client</div>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="text-[12px] min-h-[60px]"
                    placeholder="Thank you for your business..."
                  />
                </div>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="text-xs font-semibold">Signature</div>
                  <div>
                    <div className="label-text mb-1">Written signature / signatory name</div>
                    <Input
                      value={signatureText}
                      onChange={(e) => setSignatureText(e.target.value)}
                      placeholder="Type your name as a signature"
                      className="text-[12px]"
                    />
                  </div>
                  <div>
                    <div className="label-text mb-1">Or upload signature image</div>
                    <Input
                      type="file"
                      accept="image/*"
                      className="text-[12px]"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2097152) {
                          toast.error("Signature image must be smaller than 2MB");
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => setSignatureImage(String(reader.result || ""));
                        reader.readAsDataURL(file);
                      }}
                    />
                    {signatureImage && (
                      <div className="flex items-center gap-3">
                        <img
                          src={signatureImage}
                          alt="Signature preview"
                          className="max-h-16 max-w-48 object-contain rounded border bg-white p-1"
                        />
                        <Button type="button" variant="outline" size="sm" onClick={() => setSignatureImage("")}>
                          Remove image
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">Custom invoice fields</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() =>
                        setCustomFields((list) => [...list, { id: "custom-" + Date.now(), label: "", value: "" }])
                      }
                    >
                      <Plus className="size-3 mr-1" /> Add field
                    </Button>
                  </div>
                  {customFields.map((f) => (
                    <div key={f.id} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                      <Input
                        value={f.label}
                        placeholder="Field name"
                        className="text-[12px]"
                        onChange={(e) =>
                          setCustomFields((list) =>
                            list.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)),
                          )
                        }
                      />
                      <Input
                        value={f.value}
                        placeholder="Value"
                        className="text-[12px]"
                        onChange={(e) =>
                          setCustomFields((list) =>
                            list.map((x) => (x.id === f.id ? { ...x, value: e.target.value } : x)),
                          )
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive"
                        onClick={() => setCustomFields((list) => list.filter((x) => x.id !== f.id))}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="label-text mb-1">Terms & Conditions</div>
                  <Textarea
                    value={terms}
                    onChange={(e) => setTerms(e.target.value)}
                    className="text-[12px] min-h-[60px]"
                    placeholder="Payment due in 14 days..."
                  />
                </div>
              </div>
            </Card>
          </div>
        )}
        <div
          className={`${view === "preview" ? "col-span-1 block" : view === "split" ? "lg:col-span-6 xl:col-span-7 block" : "hidden"} print:block sticky top-6 self-start`}
        >
          <div className="rounded-xl border border-border/80 bg-subtle/30 p-2 sm:p-6 overflow-auto print:border-none print:p-0 print:bg-transparent">
            <InvoicePreview invoice={current} />
          </div>
        </div>
      </div>

      <Dialog open={templateOpen} onOpenChange={setTemplateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Save as Invoice Template</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              This will save the current line items, currency ({currency}), style ({theme}), notes, terms, and payment
              details as a reusable template.
            </p>
            <div>
              <div className="label-text mb-1.5">Template Name *</div>
              <Input
                placeholder="e.g. Standard Web Project, Monthly Retainer..."
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                className="text-xs"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void saveTemplate();
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="ghost" size="sm" onClick={() => setTemplateOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveTemplate}>
              Save Template
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
