import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Copy, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { syncLeadToSheet } from "@/lib/live/sheets.functions";
import { DUPLICATE_MATCH_LABELS } from "@/lib/live/duplicate-detector";
import {
  CLIP_REJECTED_MESSAGE,
  ClipperIcon,
  isClippableUrl,
  saveClippedLead,
  useClipperIcon,
  type ClipResult,
} from "@/components/account/bookmarklet-card";

const clipSearch = z.object({ url: z.string().optional(), title: z.string().optional() });

export const Route = createFileRoute("/clip")({
  validateSearch: clipSearch,
  head: () => ({
    meta: [
      { title: "Save Lead | Tracker" },
      { name: "description", content: "Save the page you are browsing straight into your lead tracker." },
      { property: "og:title", content: "Save Lead | Tracker" },
      { property: "og:description", content: "Save the page you are browsing straight into your lead tracker." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ClipPage,
});

type ClipState =
  | { kind: "working" }
  | { kind: "signed-out" }
  | { kind: "rejected" }
  | { kind: "saved"; result: ClipResult }
  | { kind: "error"; message: string };

function ClipPage() {
  const { url, title } = Route.useSearch();
  const { user, loading } = useAuth();
  const syncSheet = useServerFn(syncLeadToSheet);
  const { data: icon } = useClipperIcon();
  const [state, setState] = useState<ClipState>({ kind: "working" });
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    if (!url) {
      setState({ kind: "error", message: "No page address was passed in." });
      return;
    }
    if (!isClippableUrl(url)) {
      started.current = true;
      setState({ kind: "rejected" });
      return;
    }
    if (loading) return;
    if (!user) {
      setState({ kind: "signed-out" });
      return;
    }
    started.current = true;
    saveClippedLead(url, title ?? null, user.id)
      .then((result) => {
        setState({ kind: "saved", result });
        if (!result.duplicate)
          syncSheet({ data: { leadId: result.leadId } }).catch((e) => console.error("Google Sheet sync failed:", e));
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "Could not save the lead.";
        setState(message === CLIP_REJECTED_MESSAGE ? { kind: "rejected" } : { kind: "error", message });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, url, title]);

  useEffect(() => {
    if (state.kind !== "rejected") return;
    const t = setTimeout(() => window.close(), 3000);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (state.kind !== "saved" || state.result.duplicate) return;
    const t = setTimeout(() => window.close(), 2200);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-5">
      <div className="w-full max-w-sm pro-card p-5 text-center shadow-sm">
        <div className="mx-auto mb-3 flex size-9 items-center justify-center">
          <ClipperIcon dataUrl={icon?.dataUrl} className="size-9" />
        </div>

        {state.kind === "working" && (
          <p className="inline-flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Saving this page as a lead…
          </p>
        )}

        {state.kind === "signed-out" && (
          <>
            <p className="text-[13px] font-medium">Please sign in first</p>
            <p className="mt-1 text-[12px] text-muted-foreground">Sign in, then click the bookmark again.</p>
            <Button asChild size="sm" className="mt-4">
              <Link to="/auth" search={{ mode: "signin" }}>
                Sign in
              </Link>
            </Button>
          </>
        )}

        {state.kind === "saved" && (
          <>
            <p className="text-[13px] font-medium">{state.result.duplicate ? "Already in your tracker" : "Lead saved"}</p>
            <p className="mt-1 truncate text-[12px] text-muted-foreground">
              {state.result.companyName}
              {state.result.duplicate && state.result.leadCode ? ` (${state.result.leadCode})` : ""}
            </p>
            {state.result.duplicate && state.result.matchedOn && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Matched on {DUPLICATE_MATCH_LABELS[state.result.matchedOn]}
              </p>
            )}
            <div className="mt-4 flex items-center justify-center gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`/lt/leads/${state.result.leadId}`} target="_blank" rel="noreferrer">
                  Open lead
                </a>
              </Button>
              <Button size="sm" onClick={() => window.close()}>
                Close
              </Button>
            </div>
            {!state.result.duplicate && (
              <p className="mt-3 text-[11px] text-muted-foreground">This window closes by itself.</p>
            )}
          </>
        )}

        {state.kind === "rejected" && (
          <>
            <p className="text-[13px] font-medium">Not saved</p>
            <p className="mt-1 text-[12px] text-muted-foreground">
              Only Instagram and LinkedIn profiles can be saved as leads.
            </p>
            <div className="mt-4 flex items-center justify-center">
              <Button size="sm" onClick={() => window.close()}>
                Close
              </Button>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">This window closes in 3 seconds.</p>
          </>
        )}

        {state.kind === "error" && (
          <>
            <p className="text-[13px] font-medium text-destructive">Could not save this page</p>
            <p className="mt-1 text-[12px] text-muted-foreground">{state.message}</p>
            <div className="mt-4 flex items-center justify-center gap-2">
              {url && (
                <Button size="sm" variant="outline" onClick={() => void navigator.clipboard.writeText(url)}>
                  <Copy className="size-3.5" /> Copy link
                </Button>
              )}
              <Button size="sm" onClick={() => window.close()}>
                Close
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
