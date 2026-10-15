import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Loader2, Pin, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import {
  defaultLeadStage,
  pickChannelForKind,
  addDaysLocalISO,
  normalizeInstagram,
  normalizeLinkedIn,
  parseLinkedInInput,
} from "@/lib/live/config";
import { findDuplicateLead, type DuplicateMatchKind } from "@/lib/live/duplicate-detector";

/* ---------- page title cleanup + URL classification ---------- */

function cleanTitle(title: string | null | undefined) {
  if (!title) return "";
  let t = title.trim();
  t = t.replace(/\s*[|•·\-–—]\s*(LinkedIn|Instagram|Facebook|X|Twitter).*$/i, "");
  t = t.replace(/\s*\(@[^)]+\)\s*$/, "");
  t = t.replace(/\s*on Instagram.*$/i, "");
  t = t.replace(/^\(\d+\)\s*/, "");
  return t.trim().slice(0, 120);
}

export const CLIP_REJECTED_MESSAGE = "Only Instagram and LinkedIn profiles can be saved as leads.";

export function isClippableUrl(url: string) {
  if (/(^|[/.@])(instagram\.com|instagr\.am)\b/i.test(url) && normalizeInstagram(url)) return true;
  return normalizeLinkedIn(url) !== null;
}

type ClipPlan = {
  channel: "instagram" | "linkedin";
  url: string;
  companyName: string;
  primaryContact: string | null;
  leadPatch: Record<string, unknown>;
  contactPatch: Record<string, unknown>;
};

function planClip(url: string, title: string | null): ClipPlan | null {
  if (!isClippableUrl(url)) return null;
  const cleaned = cleanTitle(title);
  const ig = /instagram\.com|instagr\.am/i.test(url) ? normalizeInstagram(url) : null;
  if (ig) {
    const handle = `@${ig.handle}`;
    return {
      channel: "instagram",
      url: ig.url,
      companyName: handle,
      primaryContact: handle,
      leadPatch: { instagram_url: ig.url, additional_notes: cleaned || null },
      contactPatch: {
        person_name: cleaned && cleaned.toLowerCase() !== handle ? cleaned : null,
        instagram_url: ig.url,
      },
    };
  }
  const parsed = parseLinkedInInput(url);
  const li = normalizeLinkedIn(url);
  if (!parsed || !li) return null;
  const isCompany = li.kind === "company";
  const person = isCompany ? "" : parsed.personName || cleaned;
  const company = isCompany ? parsed.companyName || cleaned : "";
  return {
    channel: "linkedin",
    url: li.url,
    companyName: company || person || li.url,
    primaryContact: person || null,
    leadPatch: isCompany ? { company_linkedin_url: li.url } : {},
    contactPatch: { person_name: person || null, ...(isCompany ? {} : { linkedin_url: li.url }) },
  };
}

export type ClipResult = {
  leadId: string;
  companyName: string;
  channel: "instagram" | "linkedin";
  duplicate: boolean;
  leadCode?: string | null;
  matchedOn?: DuplicateMatchKind;
};

export async function saveClippedLead(url: string, title: string | null, userId: string): Promise<ClipResult> {
  const plan = planClip(url, title);
  if (!plan) throw new Error(CLIP_REJECTED_MESSAGE);
  const dupe = await findDuplicateLead(plan.channel === "instagram" ? { instagram: plan.url } : { linkedin: plan.url });
  if (dupe)
    return {
      leadId: dupe.leadId,
      companyName: dupe.companyName,
      channel: plan.channel,
      duplicate: true,
      leadCode: dupe.leadCode,
      matchedOn: dupe.matchedOn,
    };
  const [{ data: channels }, { data: stages }] = await Promise.all([
    supabase.from("channels").select("id, kind, name, is_active"),
    supabase
      .from("stages")
      .select("id, name, order_index, board, is_won, is_lost, is_archived")
      .eq("board", "lead"),
  ]);
  const lead: Record<string, unknown> = {
    company_name: plan.companyName.slice(0, 200) || plan.url,
    primary_contact: plan.primaryContact,
    date_added: addDaysLocalISO(0),
    created_by: userId,
    ...plan.leadPatch,
  };
  const channel = pickChannelForKind(channels ?? [], plan.channel);
  if (channel) lead.channel_id = channel.id;
  const stage = defaultLeadStage(stages ?? []);
  if (stage) lead.stage_id = stage.id;
  const hasContact = Object.values(plan.contactPatch).some((v) => v != null && v !== "");
  const { data: leadId, error } = await (
    supabase as unknown as {
      rpc: (fn: string, a: unknown) => Promise<{ data: string | null; error: { message: string } | null }>;
    }
  ).rpc("create_lead", {
    _lead: lead,
    _contacts: hasContact ? [{ ...plan.contactPatch, order_index: 0, is_primary: true }] : [],
  });
  if (error || !leadId) throw new Error(error?.message ?? "Could not save the lead.");
  return { leadId, companyName: String(lead.company_name), channel: plan.channel, duplicate: false };
}

function bookmarkletCode(origin: string) {
  const js = `(function(){try{var w=window.open('${origin}/clip?url='+encodeURIComponent(location.href)+'&title='+encodeURIComponent(document.title||''),'tracker_clip','width=420,height=340,noopener=no');if(w){w.focus();}else{alert('Allow pop-ups for this site to save leads.');}}catch(e){alert('Could not save this page: '+e.message);}})();`;
  return `javascript:${encodeURIComponent(js)}`;
}

/* ---------- custom clipper icon (app_settings.clipper_icon) ---------- */

const ICON_KEY = "clipper_icon";
const ICON_QUERY_KEY = ["app_settings", ICON_KEY];

function parseIcon(value: unknown) {
  const v = value && typeof value === "object" ? (value as { dataUrl?: unknown }) : {};
  return {
    dataUrl:
      typeof v.dataUrl === "string" && /^(data:image\/|https?:\/\/)/.test(v.dataUrl) ? v.dataUrl : null,
  };
}

export function useClipperIcon() {
  return useQuery({
    queryKey: ICON_QUERY_KEY,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", ICON_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseIcon(data?.value);
    },
    staleTime: 300_000,
  });
}

async function saveClipperIcon(dataUrl: string | null) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: ICON_KEY, value: { dataUrl } } as never, { onConflict: "workspace_id,key" });
  if (error) throw error;
}

async function compressImage(file: File, { maxSize = 256, maxBytes = 307_200 } = {}) {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file.");
  if (file.size > 10_485_760) throw new Error("Image must be smaller than 10 MB.");
  const src = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.src = src;
    });
    const scale = Math.min(1, maxSize / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not process that image.");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const limit = maxBytes * 1.37;
    let out = canvas.toDataURL("image/webp", 0.82);
    if (!out.startsWith("data:image/webp") || out.length > limit) out = canvas.toDataURL("image/png");
    if (out.length > limit) out = canvas.toDataURL("image/webp", 0.6);
    if (out.length > limit) throw new Error("That image is still too large after compression. Try a smaller one.");
    return out;
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function ClipperIcon({ dataUrl, className }: { dataUrl?: string | null; className?: string }) {
  return dataUrl ? (
    <img src={dataUrl} alt="" className={`${className ?? "size-4"} shrink-0 rounded-sm object-cover`} />
  ) : (
    <Pin className={className ?? "size-4"} />
  );
}

function ClipperIconSetting() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data } = useClipperIcon();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const save = async (dataUrl: string | null) => {
    setBusy(true);
    try {
      await saveClipperIcon(dataUrl);
      qc.setQueryData(ICON_QUERY_KEY, { dataUrl });
      toast.success(dataUrl ? "Clipper icon updated" : "Clipper icon reset to the default pin");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the icon");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      await save(await compressImage(file, { maxSize: 128, maxBytes: 307_200 }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that image");
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex size-9 items-center justify-center pro-card">
        <ClipperIcon dataUrl={data?.dataUrl} className="size-7" />
      </div>
      <div className="flex flex-col">
        <span className="text-[13px] font-medium">Clipper icon</span>
        <span className="text-[12px] text-muted-foreground">
          {data?.dataUrl ? "Custom icon" : "Default pin"} · shown on the button below and in the save window
        </span>
      </div>
      {isAdmin ? (
        <div className="ml-auto flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
          <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />} Upload Icon
          </Button>
          {data?.dataUrl && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => void save(null)}>
              <Trash2 className="size-3.5" /> Remove Icon
            </Button>
          )}
        </div>
      ) : (
        <span className="ml-auto text-[12px] text-muted-foreground">Only admins can change this.</span>
      )}
    </div>
  );
}

export function BookmarkletCard() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);
  const { data: icon } = useClipperIcon();

  useEffect(() => {
    const c = bookmarkletCode(window.location.origin);
    setCode(c);
    // React refuses javascript: URLs in href, so set it directly.
    linkRef.current?.setAttribute("href", c);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
      toast.success("Bookmark code copied");
    } catch {
      toast.error("Could not copy. Select the code and copy it by hand.");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">
        Drag the button below onto your browser's bookmarks bar. Then, on any Instagram profile or LinkedIn profile or
        company page, click it once and that page is saved as a new lead. No typing, no switching tabs. Other pages
        (posts, feeds, websites, docs) are ignored.
      </p>
      <ClipperIconSetting />
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-dashed border-border bg-subtle p-4">
        <a
          ref={linkRef}
          draggable
          onClick={(e) => {
            e.preventDefault();
            toast.info("Drag this button to your bookmarks bar instead of clicking it here.");
          }}
          className="inline-flex cursor-grab items-center gap-2 rounded-md border border-foreground bg-foreground px-3 py-2 text-[13px] font-medium text-background no-underline active:cursor-grabbing"
        >
          <ClipperIcon dataUrl={icon?.dataUrl} /> Save to Tracker
        </a>
        <Button size="sm" variant="outline" onClick={() => void copy()}>
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copy code
        </Button>
      </div>
      <ol className="ml-4 list-decimal space-y-1 text-[12px] text-muted-foreground">
        <li>Show your bookmarks bar (Ctrl/Cmd + Shift + B).</li>
        <li>Drag the black "Save to Tracker" button up onto that bar.</li>
        <li>Open a lead's Instagram profile or LinkedIn profile/company page and click the bookmark.</li>
        <li>A small window confirms the lead was saved, then closes itself.</li>
      </ol>
      <p className="text-[12px] text-muted-foreground">
        On a phone or a browser that blocks dragging, use "Copy code", create a new bookmark by hand and paste the code
        as its address. Allow pop-ups for this site so the confirmation window can open. Saving a page you already have
        simply opens the existing lead instead of duplicating it.
      </p>
    </div>
  );
}
