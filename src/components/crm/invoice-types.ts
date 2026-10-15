// Ported from live chunk types-DS6nny0l.js. Invoice data types and app_settings-backed storage.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const INVOICES_KEY = "crm_invoices";
export const BUSINESS_PROFILE_KEY = "crm_invoice_business_profile";
export const TEMPLATES_KEY = "crm_invoice_templates";
export const BANK_TEMPLATES_KEY = "crm_invoice_bank_templates";

export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue";
export type InvoiceTheme = "white" | "black";
export type TaxType = "none" | "gst" | "custom";

export type BusinessProfile = {
  companyName: string;
  email: string;
  phone: string;
  businessNumber: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
  website: string;
  logoUrl: string;
};

export type ClientDetails = {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pinCode: string;
  country: string;
  taxNumber?: string;
};

export type PaymentDetails = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifscOrSwift: string;
  upiId: string;
  paymentLink: string;
  instructions: string;
  paymentMethod?: string;
  accountType?: string;
  routingNumber?: string;
  wireRoutingNumber?: string;
  beneficiaryAddress?: string;
};

export type LineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  taxType: TaxType;
  gstRate: number;
  cessRate?: number;
  customTaxRate?: number;
  amount: number;
};

export type CustomField = { id: string; label: string; value: string };

export type Invoice = {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  theme: InvoiceTheme;
  status: InvoiceStatus;
  sender: BusinessProfile;
  client: ClientDetails;
  items: LineItem[];
  paymentDetails: PaymentDetails;
  notes: string;
  terms: string;
  lutNumber?: string;
  subtotal: number;
  totalTax: number;
  cgstTotal: number;
  sgstTotal: number;
  cessTotal: number;
  discount: number;
  roundOff?: boolean;
  roundOffAmount?: number;
  grandTotal: number;
  leadId?: string | null;
  crmRecordId?: string | null;
  signatureText?: string;
  signatureImage?: string;
  customFields?: CustomField[];
  createdAt: string;
  updatedAt: string;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  currency?: string;
  theme?: InvoiceTheme;
  notes?: string;
  terms?: string;
  items?: LineItem[];
  paymentDetails?: PaymentDetails;
  createdAt: string;
};

export type BankTemplate = PaymentDetails & {
  id: string;
  name: string;
  currency: string;
  countryEmoji?: string;
  lutNumber?: string;
};

export const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  companyName: "",
  email: "",
  phone: "",
  businessNumber: "",
  address: "",
  city: "",
  state: "",
  pinCode: "",
  country: "",
  website: "",
  logoUrl: "",
};

export const EMPTY_PAYMENT_DETAILS: PaymentDetails = {
  bankName: "",
  accountHolder: "",
  accountNumber: "",
  ifscOrSwift: "",
  upiId: "",
  paymentLink: "",
  instructions: "",
};

export function nextInvoiceNumber(invoices: Invoice[] = []) {
  let max = 0;
  for (const inv of invoices) {
    if (!inv.invoiceNumber) continue;
    const m = inv.invoiceNumber.match(/(?:INV-|\b)(\d+)\b/i) || inv.invoiceNumber.match(/(\d+)/);
    if (m && m[1]) {
      const n = parseInt(m[1], 10);
      if (!isNaN(n) && n > max) max = n;
    }
  }
  return `#INV-${String(max + 1).padStart(4, "0")}`;
}

function cacheLocally(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Could not update local cache for ${key}:`, err);
  }
}

async function saveSetting(key: string, value: unknown, cache: unknown) {
  const { error } = await (supabase as any)
    .from("app_settings")
    .upsert({ key, value }, { onConflict: "workspace_id,key" });
  if (error) {
    console.error(`Could not save ${key} to Supabase:`, error);
    throw new Error(`Could not save to the database: ${error.message}`);
  }
  cacheLocally(key, cache);
}

function readLocalArray<T>(key: string): T[] | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function useInvoices() {
  return useQuery({
    queryKey: ["app_settings", INVOICES_KEY],
    queryFn: async (): Promise<Invoice[]> => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", INVOICES_KEY)
        .maybeSingle();
      if (error) {
        console.error("Could not load invoices from Supabase:", error);
        throw new Error(`Could not load invoices from the database: ${error.message}`);
      }
      if (data?.value && Array.isArray(data.value?.invoices)) {
        const list = data.value.invoices as Invoice[];
        cacheLocally(INVOICES_KEY, list);
        return list;
      }
      return readLocalArray<Invoice>(INVOICES_KEY) ?? [];
    },
  });
}

export async function saveInvoices(invoices: Invoice[]) {
  await saveSetting(INVOICES_KEY, { invoices }, invoices);
}

export function useBusinessProfile() {
  return useQuery({
    queryKey: ["app_settings", BUSINESS_PROFILE_KEY],
    queryFn: async (): Promise<BusinessProfile> => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", BUSINESS_PROFILE_KEY)
        .maybeSingle();
      if (error) {
        console.error("Could not load invoice business profile from Supabase:", error);
        throw new Error(`Could not load business profile from the database: ${error.message}`);
      }
      if (data?.value && typeof data.value === "object") return data.value.profile;
      try {
        const raw = localStorage.getItem(BUSINESS_PROFILE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        /* ignore */
      }
      return EMPTY_BUSINESS_PROFILE;
    },
  });
}

export async function saveBusinessProfile(profile: BusinessProfile) {
  await saveSetting(BUSINESS_PROFILE_KEY, { profile }, profile);
}

export function useInvoiceTemplates() {
  return useQuery({
    queryKey: ["app_settings", TEMPLATES_KEY],
    queryFn: async (): Promise<InvoiceTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", TEMPLATES_KEY)
        .maybeSingle();
      if (error) {
        console.error("Could not load invoice templates from Supabase:", error);
        throw new Error(`Could not load invoice templates from the database: ${error.message}`);
      }
      if (data?.value && Array.isArray(data.value?.templates)) {
        const list = data.value.templates as InvoiceTemplate[];
        cacheLocally(TEMPLATES_KEY, list);
        return list;
      }
      return readLocalArray<InvoiceTemplate>(TEMPLATES_KEY) ?? [];
    },
  });
}

export async function saveInvoiceTemplates(templates: InvoiceTemplate[]) {
  await saveSetting(TEMPLATES_KEY, { templates }, templates);
}

/** Random LUT-style reference, e.g. AD0310261234567S. */
export function generateLutNumber() {
  const d = new Date();
  return `AD03${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}${String(Math.floor(1e5 + Math.random() * 9e5))}S`;
}

export function useBankTemplates() {
  return useQuery({
    queryKey: ["app_settings", BANK_TEMPLATES_KEY],
    queryFn: async (): Promise<BankTemplate[]> => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("value")
        .eq("key", BANK_TEMPLATES_KEY)
        .maybeSingle();
      if (error) {
        console.error("Could not load bank templates from Supabase:", error);
        throw new Error(`Could not load bank templates from the database: ${error.message}`);
      }
      if (data?.value && Array.isArray(data.value?.templates)) {
        const list = data.value.templates as BankTemplate[];
        cacheLocally(BANK_TEMPLATES_KEY, list);
        return list;
      }
      return readLocalArray<BankTemplate>(BANK_TEMPLATES_KEY) ?? [];
    },
  });
}

export async function saveBankTemplates(templates: BankTemplate[]) {
  await saveSetting(BANK_TEMPLATES_KEY, { templates }, templates);
}
