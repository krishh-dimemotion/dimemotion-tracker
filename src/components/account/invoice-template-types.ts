import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Ported from live chunk types-DS6nny0l (shared with crm.invoices).
export const INVOICES_KEY = "crm_invoices";
export const BUSINESS_PROFILE_KEY = "crm_invoice_business_profile";
export const INVOICE_TEMPLATES_KEY = "crm_invoice_templates";
export const BANK_TEMPLATES_KEY = "crm_invoice_bank_templates";

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

export type BankDetails = {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  ifscOrSwift: string;
  upiId: string;
  paymentLink: string;
  instructions: string;
};

export type BankTemplate = BankDetails & {
  id: string;
  name: string;
  countryEmoji?: string;
  currency: string;
  paymentMethod?: string;
  accountType?: string;
  routingNumber?: string;
  wireRoutingNumber?: string;
  beneficiaryAddress?: string;
  iban?: string;
  lutNumber?: string;
  isDefault?: boolean;
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  taxType: string;
  gstRate: number;
  amount: number;
};

export type InvoiceTemplate = {
  id: string;
  name: string;
  currency: string;
  theme: string;
  notes: string;
  terms: string;
  items: InvoiceLineItem[];
  createdAt: string;
};

export type Invoice = { invoiceNumber?: string; [k: string]: unknown };

export const DEFAULT_BUSINESS_PROFILE: BusinessProfile = {
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

export const DEFAULT_BANK_DETAILS: BankDetails = {
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
  } catch (e) {
    console.warn(`Could not update local cache for ${key}:`, e);
  }
}

const db = supabase as unknown as {
  from: (t: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
};

async function saveSetting(key: string, value: unknown, cache: unknown) {
  const { error } = await db.from("app_settings").upsert({ key, value }, { onConflict: "workspace_id,key" });
  if (error) {
    console.error(`Could not save ${key} to Supabase:`, error);
    throw new Error(`Could not save to the database: ${error.message}`);
  }
  cacheLocally(key, cache);
}

async function loadSetting(key: string, what: string) {
  const { data, error } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  if (error) {
    console.error(`Could not load ${what} from Supabase:`, error);
    return { error };
  }
  return { value: (data?.value ?? null) as Record<string, unknown> | null };
}

function readLocalArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    /* ignore */
  }
  return [];
}

export function useInvoices() {
  return useQuery({
    queryKey: ["app_settings", INVOICES_KEY],
    queryFn: async (): Promise<Invoice[]> => {
      const r = await loadSetting(INVOICES_KEY, "invoices");
      if (r.error) throw new Error(`Could not load invoices from the database: ${r.error.message}`);
      if (r.value && Array.isArray(r.value.invoices)) {
        cacheLocally(INVOICES_KEY, r.value.invoices);
        return r.value.invoices as Invoice[];
      }
      return readLocalArray<Invoice>(INVOICES_KEY);
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
      const r = await loadSetting(BUSINESS_PROFILE_KEY, "invoice business profile");
      if (r.error) throw new Error(`Could not load business profile from the database: ${r.error.message}`);
      if (r.value && typeof r.value === "object") return r.value.profile as BusinessProfile;
      try {
        const raw = localStorage.getItem(BUSINESS_PROFILE_KEY);
        if (raw) return JSON.parse(raw);
      } catch {
        /* ignore */
      }
      return DEFAULT_BUSINESS_PROFILE;
    },
  });
}

export async function saveBusinessProfile(profile: BusinessProfile) {
  await saveSetting(BUSINESS_PROFILE_KEY, { profile }, profile);
}

export function useInvoiceTemplates() {
  return useQuery({
    queryKey: ["app_settings", INVOICE_TEMPLATES_KEY],
    queryFn: async (): Promise<InvoiceTemplate[]> => {
      const r = await loadSetting(INVOICE_TEMPLATES_KEY, "invoice templates");
      if (r.error) throw new Error(`Could not load invoice templates from the database: ${r.error.message}`);
      if (r.value && Array.isArray(r.value.templates)) {
        cacheLocally(INVOICE_TEMPLATES_KEY, r.value.templates);
        return r.value.templates as InvoiceTemplate[];
      }
      return readLocalArray<InvoiceTemplate>(INVOICE_TEMPLATES_KEY);
    },
  });
}

export async function saveInvoiceTemplates(templates: InvoiceTemplate[]) {
  await saveSetting(INVOICE_TEMPLATES_KEY, { templates }, templates);
}

/** Random LUT/ARN-style number, e.g. AD0310261234567S. */
export function generateLutNumber() {
  const d = new Date();
  return `AD03${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getFullYear()).slice(-2)}${String(
    Math.floor(1e5 + Math.random() * 9e5),
  )}S`;
}

export function useBankTemplates() {
  return useQuery({
    queryKey: ["app_settings", BANK_TEMPLATES_KEY],
    queryFn: async (): Promise<BankTemplate[]> => {
      const r = await loadSetting(BANK_TEMPLATES_KEY, "bank templates");
      if (r.error) throw new Error(`Could not load bank templates from the database: ${r.error.message}`);
      if (r.value && Array.isArray(r.value.templates)) {
        cacheLocally(BANK_TEMPLATES_KEY, r.value.templates);
        return r.value.templates as BankTemplate[];
      }
      return readLocalArray<BankTemplate>(BANK_TEMPLATES_KEY);
    },
  });
}

export async function saveBankTemplates(templates: BankTemplate[]) {
  await saveSetting(BANK_TEMPLATES_KEY, { templates }, templates);
}
