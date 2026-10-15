// Ported from live chunk crm.invoices-CGKC86lD.js (page component P).
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Plus, Printer, ReceiptText, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppPage } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, Loading } from "@/components/live/kit";
import {
  INVOICES_KEY,
  saveInvoices,
  useInvoices,
  useInvoiceTemplates,
  type Invoice,
} from "@/components/crm/invoice-types";
import { InvoiceEditor, UNSAVED_DRAFT_KEY, type PrefillClient } from "@/components/crm/invoice-editor";
import { InvoicePreview, printInvoiceSheet } from "@/components/crm/invoice-preview";

type InvoiceSearch = {
  dealId?: string;
  leadId?: string;
  dealValue?: number;
  currency?: string;
  clientName?: string;
  newForDeal?: string;
};

export const Route = createFileRoute("/crm/invoices")({
  validateSearch: (s: Record<string, unknown>): InvoiceSearch => ({
    dealId: typeof s.dealId === "string" ? s.dealId : undefined,
    leadId: typeof s.leadId === "string" ? s.leadId : undefined,
    dealValue:
      typeof s.dealValue === "string" || typeof s.dealValue === "number" ? Number(s.dealValue) : undefined,
    currency: typeof s.currency === "string" ? s.currency : undefined,
    clientName: typeof s.clientName === "string" ? s.clientName : undefined,
    newForDeal: typeof s.newForDeal === "string" ? s.newForDeal : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Invoices | CRM | Tracker" },
      { name: "description", content: "Create, customize, and export professional client invoices." },
    ],
  }),
  component: InvoicesPage,
});

type DraftEntry = { key: string; invoice: Invoice; source: "local" | "saved" };

const QUERY_KEY = ["app_settings", INVOICES_KEY];

function InvoicesPage() {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const { data, isLoading } = useInvoices();
  const { data: templates = [] } = useInvoiceTemplates();
  const [startOpen, setStartOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editing, setEditing] = useState<Invoice | null>(null);
  const [resumeLocal, setResumeLocal] = useState(false);
  const [localDraft, setLocalDraft] = useState<Invoice | null>(null);
  const [draftKey, setDraftKey] = useState("");
  const [preview, setPreview] = useState<Invoice | null>(null);
  const [prefill, setPrefill] = useState<PrefillClient | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [themeFilter, setThemeFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");

  const invoices = data ?? [];
  const drafts: DraftEntry[] = [
    ...(localDraft && !invoices.some((i) => i.id === localDraft.id)
      ? [{ key: "local-unsaved-draft", invoice: localDraft, source: "local" as const }]
      : []),
    ...invoices
      .filter((i) => i.status === "draft")
      .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt))
      .map((i) => ({ key: i.id, invoice: i, source: "saved" as const })),
  ];

  useEffect(() => {
    if (!drafts.some((d) => d.key === draftKey)) setDraftKey(drafts[0]?.key ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localDraft, data, draftKey]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(UNSAVED_DRAFT_KEY);
      if (!raw) {
        setLocalDraft(null);
        return;
      }
      const d = JSON.parse(raw);
      setLocalDraft(d && d.id && d.invoiceNumber && d.client && Array.isArray(d.items) ? d : null);
    } catch {
      setLocalDraft(null);
    }
  }, [mode]);

  useEffect(() => {
    if (search.newForDeal || search.dealId) {
      setPrefill({
        crmRecordId: search.dealId,
        leadId: search.leadId,
        dealValue: search.dealValue,
        currency: search.currency,
        companyName: search.clientName ? decodeURIComponent(search.clientName) : "",
      });
      setEditing(null);
      setMode("create");
    }
  }, [search]);

  const filtered = useMemo(
    () =>
      invoices.filter((inv) => {
        if ((statusFilter !== "all" && inv.status !== statusFilter) || (themeFilter !== "all" && inv.theme !== themeFilter))
          return false;
        if (dateFilter !== "all" && inv.issueDate) {
          const d = new Date(inv.issueDate);
          const now = new Date();
          if (dateFilter === "this_month") {
            if (d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) return false;
          } else if (dateFilter === "last_month") {
            const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            if (d.getFullYear() !== lm.getFullYear() || d.getMonth() !== lm.getMonth()) return false;
          } else if (dateFilter === "last_3_months") {
            if (d < new Date(now.getFullYear(), now.getMonth() - 3, 1)) return false;
          } else if (dateFilter === "this_year" && d.getFullYear() !== now.getFullYear()) return false;
        }
        if (query.trim()) {
          const q = query.toLowerCase();
          if (
            !`${inv.invoiceNumber} ${inv.client.companyName} ${inv.client.contactPerson} ${inv.sender.companyName}`
              .toLowerCase()
              .includes(q)
          )
            return false;
        }
        return true;
      }),
    [invoices, query, statusFilter, themeFilter, dateFilter],
  );

  const handleSave = async (inv: Invoice) => {
    const idx = invoices.findIndex((i) => i.id === inv.id);
    let next: Invoice[];
    if (idx >= 0) {
      next = [...invoices];
      next[idx] = inv;
    } else next = [inv, ...invoices];
    try {
      await saveInvoices(next);
      qc.setQueryData(QUERY_KEY, next);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      try {
        window.localStorage.removeItem(UNSAVED_DRAFT_KEY);
      } catch {
        /* ignore */
      }
      setLocalDraft(null);
      setResumeLocal(false);
      toast.success("Invoice saved to your workspace");
      setMode("list");
      setEditing(null);
      setPrefill(null);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown database error";
      toast.error("Invoice was not saved", { description: msg });
      return false;
    }
  };

  const deleteDraft = async (id: string) => {
    try {
      await saveInvoices(invoices.filter((i) => i.id !== id));
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      if (editing?.id === id) setEditing(null);
      toast.success("Draft deleted");
      setMode("list");
    } catch (err) {
      toast.error("Draft was not deleted", {
        description: err instanceof Error ? err.message : "Unknown database error",
      });
    }
  };

  const discardLocal = () => {
    try {
      window.localStorage.removeItem(UNSAVED_DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setLocalDraft(null);
    setResumeLocal(false);
    setMode("list");
    toast.success("Draft deleted");
  };

  const askDelete = async (id: string, e?: MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteId(id);
  };

  const duplicate = async (inv: Invoice, e: MouseEvent) => {
    e.stopPropagation();
    const copy: Invoice = {
      ...inv,
      id: `inv_${Date.now()}`,
      invoiceNumber: `${inv.invoiceNumber}-COPY`,
      issueDate: new Date().toISOString().slice(0, 10),
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await saveInvoices([copy, ...invoices]);
      qc.invalidateQueries({ queryKey: QUERY_KEY });
      toast.success(`Duplicated as ${copy.invoiceNumber}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown database error";
      toast.error("Invoice copy was not saved", { description: msg });
    }
  };

  const openStart = () => {
    setEditing(null);
    setTemplateId(undefined);
    setStartOpen(true);
  };

  return (
    <AppPage module="crm" title="Invoices" perm="crm.records" guide="crm-records">
      {mode === "create" || mode === "edit" ? (
        <InvoiceEditor
          initialInvoice={editing || (resumeLocal ? localDraft : null)}
          initialInvoiceIsLocalDraft={resumeLocal && !editing}
          prefillClient={prefill}
          initialTemplateId={templateId}
          startFresh={mode === "create" && !editing && !prefill && !resumeLocal}
          onSave={handleSave}
          onDelete={(id) => askDelete(id)}
          onDeleteDraft={deleteDraft}
          onDiscardDraft={discardLocal}
          onCancel={() => {
            setMode("list");
            setEditing(null);
            setPrefill(null);
          }}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search invoices or clients..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="h-8 w-[200px] pl-8 text-[12px]"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8 w-[125px] text-[12px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={themeFilter} onValueChange={setThemeFilter}>
                  <SelectTrigger className="h-8 w-[110px] text-[12px]">
                    <SelectValue placeholder="Theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All themes</SelectItem>
                    <SelectItem value="white">White</SelectItem>
                    <SelectItem value="black">Black</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="h-8 w-[130px] text-[12px]">
                    <SelectValue placeholder="Date" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="this_month">This month</SelectItem>
                    <SelectItem value="last_month">Last month</SelectItem>
                    <SelectItem value="last_3_months">Last 3 months</SelectItem>
                    <SelectItem value="this_year">This year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button size="sm" onClick={openStart} className="h-8 text-[12px] gap-1.5">
                <Plus className="size-3.5" /> Create invoice
              </Button>
            </div>
          </Card>

          {!isLoading && drafts.length > 0 && (
            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <ReceiptText className="size-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Continue building</h3>
                <span className="text-xs text-muted-foreground">({drafts.length})</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={draftKey} onValueChange={setDraftKey}>
                  <SelectTrigger className="min-w-[240px] flex-1">
                    <SelectValue placeholder="Choose an unfinished invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {drafts.map(({ key, invoice, source }) => (
                      <SelectItem key={key} value={key}>
                        {invoice.client.companyName || "Unnamed client"} · {invoice.invoiceNumber} ·{" "}
                        {source === "local" ? "Unsaved draft" : "Draft"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!draftKey}
                  onClick={() => {
                    const d = drafts.find((x) => x.key === draftKey);
                    if (!d) return;
                    if (d.source === "local") {
                      setResumeLocal(true);
                      setEditing(null);
                      setPrefill(null);
                      setMode("create");
                    } else {
                      setEditing(d.invoice);
                      setPrefill(null);
                      setMode("edit");
                    }
                  }}
                >
                  Continue Building
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  disabled={!draftKey}
                  onClick={() => {
                    const d = drafts.find((x) => x.key === draftKey);
                    if (!d) return;
                    if (d.source === "local") discardLocal();
                    else void deleteDraft(d.invoice.id);
                  }}
                  aria-label="Delete selected draft"
                  title="Delete selected draft"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          )}

          {isLoading ? (
            <Loading />
          ) : filtered.length === 0 ? (
            <Card className="p-12 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-muted-foreground mb-3">
                <ReceiptText className="size-6" />
              </div>
              <h3 className="text-base font-semibold">No invoices found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                Generate professional white or black branded invoices for your clients and deals in seconds.
              </p>
              <Button size="sm" onClick={openStart} className="mt-4 h-8 text-[12px] gap-1.5">
                <Plus className="size-3.5" /> Create invoice
              </Button>
            </Card>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-subtle/50 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="py-2.5 px-4">Invoice #</th>
                    <th className="py-2.5 px-4">Client</th>
                    <th className="py-2.5 px-4">Issue Date</th>
                    <th className="py-2.5 px-4">Due Date</th>
                    <th className="py-2.5 px-4">Theme</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => {
                        setEditing(inv);
                        setMode("edit");
                      }}
                      className="cursor-pointer hover:bg-subtle/60 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-medium">{inv.invoiceNumber}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{inv.client.companyName || "Unnamed Client"}</div>
                        {inv.client.contactPerson && (
                          <div className="text-[11px] text-muted-foreground">{inv.client.contactPerson}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{inv.issueDate}</td>
                      <td className="py-3 px-4 text-muted-foreground">{inv.dueDate}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${inv.theme === "black" ? "bg-stone-900 text-stone-100 dark:bg-stone-100 dark:text-stone-900" : "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200 border"}`}
                        >
                          {inv.theme}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${inv.status === "paid" ? "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400" : inv.status === "overdue" ? "bg-rose-500/20 text-rose-600 dark:text-rose-400" : "bg-muted text-muted-foreground"}`}
                        >
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold">
                        {inv.currency} {inv.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Quick Preview"
                            onClick={() => setPreview(inv)}
                          >
                            <Eye className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="Duplicate"
                            onClick={(e) => duplicate(inv, e)}
                          >
                            <Copy className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            title="Delete"
                            onClick={(e) => askDelete(inv.id, e)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <Dialog
            open={!!deleteId}
            onOpenChange={(open) => {
              if (!open) setDeleteId(null);
            }}
          >
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Delete this invoice?</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                This invoice will be permanently removed from your saved invoices. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setDeleteId(null)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    const id = deleteId;
                    setDeleteId(null);
                    if (!id) return;
                    void (async () => {
                      try {
                        await saveInvoices(invoices.filter((i) => i.id !== id));
                        qc.invalidateQueries({ queryKey: QUERY_KEY });
                        toast.success("Invoice deleted");
                        if (editing?.id === id) {
                          setEditing(null);
                          setMode("list");
                        }
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Unknown database error";
                        toast.error("Invoice was not deleted", { description: msg });
                      }
                    })();
                  }}
                >
                  Delete invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={startOpen} onOpenChange={setStartOpen}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Start your invoice</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">
                Choose a saved template to prefill the invoice, or start with a completely blank invoice.
              </p>
              {templates.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {templates.map((t) => (
                    <Button
                      key={t.id}
                      type="button"
                      variant="outline"
                      className="w-full justify-start h-auto py-3"
                      onClick={() => {
                        setEditing(null);
                        setTemplateId(t.id);
                        setStartOpen(false);
                        setMode("create");
                      }}
                    >
                      <span className="flex flex-col items-start gap-1">
                        <span>{t.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.currency} · {t.items?.length || 0} line items
                        </span>
                      </span>
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                  You have no saved templates yet. Create a blank invoice now, then save it as a template for next time.
                </p>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setStartOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setTemplateId(undefined);
                    setStartOpen(false);
                    setMode("create");
                  }}
                >
                  Create a fresh invoice
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {preview && (
            <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
              <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                <DialogHeader className="flex flex-row items-center justify-between no-print mb-4 border-b pb-3">
                  <DialogTitle className="text-base font-semibold">Invoice {preview.invoiceNumber}</DialogTitle>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      printInvoiceSheet(
                        `${preview.invoiceNumber} - ${preview.client.companyName || "Invoice"}`,
                        preview.theme === "black",
                        "dialog",
                      )
                    }
                    className="gap-1.5 text-xs mr-6"
                  >
                    <Printer className="size-3.5" /> Print / Export PDF
                  </Button>
                </DialogHeader>
                <div className="rounded-lg overflow-hidden border border-border">
                  <InvoicePreview invoice={preview} />
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}
    </AppPage>
  );
}
