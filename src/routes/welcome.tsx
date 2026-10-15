import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, CirclePlay, ExternalLink, FileSpreadsheet, Loader2, PartyPopper, Plus, Send, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, Loading } from "@/components/live/kit";
import { IS_TEST_MODE } from "@/lib/live/test-mode";
import { runSheetBackup } from "@/lib/live/sheets.functions";
import { ConnectGoogleButton, googleConnectErrorMessage, useGoogleStatus } from "@/components/live/google-connect";
import { OUTREACH_CHANNELS_QUERY_KEY, saveOutreachChannels } from "@/lib/live/outreach-channels";
import { markOnboarded, ONBOARDING_VIDEOS } from "@/components/account/onboarding";

type WelcomeSearch = { google?: "connected" | "error"; reason?: string };

export const Route = createFileRoute("/welcome")({
  validateSearch: (s: Record<string, unknown>): WelcomeSearch => ({
    ...(s.google === "connected" || s.google === "error" ? { google: s.google } : {}),
    ...(typeof s.reason === "string" ? { reason: s.reason } : {}),
  }),
  head: () => ({ meta: [{ title: "Welcome | Tracker" }] }),
  component: WelcomePage,
});

const STEPS = [
  { n: 1, title: "Name your workspace" },
  { n: 2, title: "Pick your outreach channels" },
  ...(IS_TEST_MODE ? [] : [{ n: 3, title: "Connect your Google Sheet" }]),
  { n: 4, title: "Watch how Tracker works" },
];

const stepLabel = (n: number) => `Step ${STEPS.findIndex((s) => s.n === n) + 1} of ${STEPS.length}`;

type ChannelKind = "email" | "instagram" | "linkedin";
const CHANNEL_OPTIONS: { kind: ChannelKind; label: string; icon: string }[] = [
  { kind: "email", label: "Email", icon: "/channel-icons/email.png" },
  { kind: "instagram", label: "Instagram", icon: "/channel-icons/instagram.png" },
  { kind: "linkedin", label: "LinkedIn", icon: "/channel-icons/linkedin.png" },
];

function Confetti({ burst }: { burst: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!burst) return;
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const w = (canvas.width = window.innerWidth);
    const h = (canvas.height = window.innerHeight);
    const colors = ["#111111", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#a855f7"];
    const pieces = Array.from({ length: 180 }, (_, i) => {
      const left = i % 2 === 0;
      return {
        x: left ? 0 : w,
        y: h * 0.75,
        vx: (left ? 1 : -1) * (6 + Math.random() * 10),
        vy: -(10 + Math.random() * 14),
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        s: 6 + Math.random() * 6,
        c: colors[i % colors.length],
      };
    });
    let frame = 0;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pieces) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.globalAlpha = Math.max(0, 1 - frame / 220);
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      frame++;
      if (frame < 220) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [burst]);
  return <canvas ref={ref} className="pointer-events-none fixed inset-0 z-50" aria-hidden="true" />;
}

function Progress({ step }: { step: number }) {
  return (
    <div className="mb-6 flex items-center justify-center gap-2">
      {STEPS.map((s) => (
        <div key={s.n} className={`h-1.5 w-10 rounded-full ${step >= s.n ? "bg-foreground" : "bg-border"}`} />
      ))}
    </div>
  );
}

const choiceClass = (on: boolean) =>
  `pressable flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
    on ? "border-foreground bg-subtle" : "border-border hover:bg-subtle"
  }`;

function WelcomePage() {
  const navigate = useNavigate();
  const { loading, session, user, workspace, refresh } = useAuth();
  const search = Route.useSearch();
  const [step, setStep] = useState(search.google ? 3 : 0);
  const [video, setVideo] = useState(0);
  const [sheetState, setSheetState] = useState<"idle" | "creating" | "ready" | "error">("idle");
  const [sheetError, setSheetError] = useState("");
  const runBackup = useServerFn(runSheetBackup);
  const { data: google, refetch: refetchGoogle } = useGoogleStatus();
  const [burst, setBurst] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const [kinds, setKinds] = useState<ChannelKind[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [otherDraft, setOtherDraft] = useState("");

  useEffect(() => {
    if (!loading && !session) void navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (workspace && !name) setName(workspace.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  useEffect(() => {
    if (step === 0) setBurst((b) => b + 1);
  }, [step]);

  useEffect(() => {
    if (!session || !search.google) return;
    void navigate({ to: "/welcome", search: {}, replace: true });
    if (search.google === "error") {
      setSheetError(googleConnectErrorMessage(search.reason));
      setSheetState("error");
      return;
    }
    setSheetState("creating");
    runBackup({})
      .catch((e) => console.error("Initial sheet backup failed", e))
      .finally(() => {
        void refetchGoogle().then(() => setSheetState("ready"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (sheetState === "idle" && google?.usesConnectedGoogle) setSheetState("ready");
  }, [google, sheetState]);

  if (loading || !session || !workspace) return <Loading page />;

  const firstName = (user?.user_metadata?.full_name as string | undefined)?.split(" ")[0];

  const saveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Give your workspace a name");
    setBusy(true);
    const { error } = await (
      supabase as unknown as {
        from: (t: string) => {
          update: (v: unknown) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> };
        };
      }
    )
      .from("workspaces")
      .update({ name: trimmed })
      .eq("id", workspace.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    await refresh();
    setStep(2);
  };

  const toggleKind = (k: ChannelKind) => setKinds((ks) => (ks.includes(k) ? ks.filter((x) => x !== k) : [...ks, k]));
  const allPicked = CHANNEL_OPTIONS.every((c) => kinds.includes(c.kind));
  const addOther = () => {
    const v = otherDraft.trim();
    if (!v) return;
    if (!custom.some((c) => c.toLowerCase() === v.toLowerCase())) setCustom((cs) => [...cs, v]);
    setOtherDraft("");
  };
  const afterChannels = () => setStep(IS_TEST_MODE ? 4 : 3);
  const otherOn = showOther || custom.length > 0;

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <Confetti burst={burst} />
      <div className="w-full max-w-[460px]">
        {step === 0 && (
          <div className="text-center">
            <PartyPopper className="mx-auto size-10" />
            <h1 className="mt-4 text-[24px] font-semibold">Welcome{firstName ? `, ${firstName}` : ""}!</h1>
            <p className="label-text mt-2">Thanks for signing up. Here's what you need to do to get set up.</p>
            <Card className="mt-6 text-left">
              <ol className="space-y-4">
                {STEPS.map((s, i) => (
                  <li key={s.n} className="flex items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-[12px] font-medium">
                      {i + 1}
                    </span>
                    <span className="text-[14px]">{s.title}</span>
                  </li>
                ))}
              </ol>
            </Card>
            <Button className="mt-6 w-full" onClick={() => setStep(1)}>
              Let's start
            </Button>
          </div>
        )}

        {step === 1 && (
          <>
            <Progress step={step} />
            <Card>
              <div className="label-text">{stepLabel(1)}</div>
              <h2 className="mt-1 text-[18px] font-semibold">Name your workspace</h2>
              <p className="label-text mt-1">
                This is where your leads and pipeline live. Use your name or your business name.
              </p>
              <form className="mt-4 space-y-3" onSubmit={saveName}>
                <div className="space-y-1">
                  <Label className="text-[12px]">Workspace name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus required />
                </div>
                <Button className="w-full" type="submit" disabled={busy}>
                  Continue
                </Button>
              </form>
            </Card>
          </>
        )}

        {step === 2 && (
          <>
            <Progress step={step} />
            <Card>
              <div className="label-text">{stepLabel(2)}</div>
              <h2 className="mt-1 text-[18px] font-semibold">Where do you send most of your outreach from?</h2>
              <p className="label-text mt-1">
                Pick one, a few, or all of them. Your dashboard shows the matching outreach rates first, and you can
                change this any time in Settings.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {CHANNEL_OPTIONS.map((c) => {
                  const on = kinds.includes(c.kind);
                  return (
                    <button
                      key={c.kind}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleKind(c.kind)}
                      className={`pressable flex min-w-0 items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-[13px] font-medium transition-colors ${
                        on ? "border-foreground bg-subtle" : "border-border hover:bg-subtle"
                      }`}
                    >
                      <img src={c.icon} alt="" className="size-5 shrink-0 object-contain" />
                      <span className="min-w-0 flex-1 truncate">{c.label}</span>
                      {on && <Check className="size-4 shrink-0" />}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  aria-pressed={allPicked}
                  onClick={() => setKinds(allPicked ? [] : CHANNEL_OPTIONS.map((c) => c.kind))}
                  className={choiceClass(allPicked)}
                >
                  <Send className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">All of them</span>
                  {allPicked && <Check className="size-4 shrink-0" />}
                </button>
                <button
                  type="button"
                  aria-pressed={otherOn}
                  onClick={() => setShowOther((v) => !v)}
                  className={choiceClass(otherOn)}
                >
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">Other channel</span>
                  {custom.length > 0 && <Check className="size-4 shrink-0" />}
                </button>
              </div>
              {otherOn && (
                <div className="mt-3 space-y-2 rounded-lg border border-border/80 p-3">
                  <Label className="text-[12px]">Channel name</Label>
                  <div className="flex gap-2">
                    <Input
                      value={otherDraft}
                      onChange={(e) => setOtherDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addOther();
                        }
                      }}
                      placeholder="WhatsApp, X, Cold calls..."
                      maxLength={40}
                      autoFocus
                    />
                    <Button type="button" variant="outline" onClick={addOther}>
                      Add
                    </Button>
                  </div>
                  {custom.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {custom.map((c) => (
                        <span
                          key={c}
                          className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-subtle px-2.5 py-0.5 text-[12px] font-medium"
                        >
                          <span className="truncate">{c}</span>
                          <button
                            type="button"
                            aria-label={`Remove ${c}`}
                            onClick={() => setCustom((cs) => cs.filter((x) => x !== c))}
                            className="text-muted-foreground hover:text-foreground"
                          >
                            <X className="size-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="label-text">Custom channels are added to Settings, Channels.</p>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)} disabled={busy}>
                  Back
                </Button>
                <Button variant="ghost" className="flex-1" onClick={afterChannels} disabled={busy}>
                  Skip
                </Button>
                <Button
                  className="flex-1"
                  disabled={busy}
                  onClick={async () => {
                    const draft = otherDraft.trim();
                    const allCustom = draft && !custom.includes(draft) ? [...custom, draft] : custom;
                    if (kinds.length === 0 && allCustom.length === 0)
                      return toast.error("Pick at least one channel");
                    setBusy(true);
                    try {
                      await saveOutreachChannels({ kinds, custom: allCustom });
                      await Promise.all([
                        qc.invalidateQueries({ queryKey: OUTREACH_CHANNELS_QUERY_KEY }),
                        qc.invalidateQueries({ queryKey: ["channels"] }),
                      ]);
                      afterChannels();
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Could not save your channels");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Continue
                </Button>
              </div>
            </Card>
          </>
        )}

        {step === 3 && (
          <>
            <Progress step={step} />
            <Card>
              <div className="label-text">{stepLabel(3)}</div>
              <h2 className="mt-1 text-[18px] font-semibold">Connect your Google Sheet</h2>
              <p className="label-text mt-1">
                Tracker creates a sheet in your own Google Drive and keeps your leads backed up there. Your data is
                always yours. Tracker can only see the sheet it creates, nothing else in your Drive.
              </p>
              {sheetState === "creating" && (
                <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-border/80 p-6 text-center">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                  <div className="text-[14px] font-medium">Creating your sheet…</div>
                  <div className="label-text">This takes a few seconds.</div>
                </div>
              )}
              {sheetState === "ready" && (
                <div className="mt-4 flex flex-col items-center gap-2 rounded-lg border border-border/80 p-6 text-center">
                  <div className="flex size-9 items-center justify-center rounded-full bg-foreground text-background">
                    <Check className="size-5" />
                  </div>
                  <div className="text-[14px] font-medium">Your sheet is ready</div>
                  {google?.googleEmail && <div className="label-text">Connected as {google.googleEmail}</div>}
                  {google?.sheetUrl && (
                    <a
                      href={google.sheetUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="label-text mt-1 inline-flex items-center gap-1 underline"
                    >
                      <ExternalLink className="size-3.5" /> Open your sheet
                    </a>
                  )}
                </div>
              )}
              {(sheetState === "idle" || sheetState === "error") && (
                <div className="mt-4 flex flex-col items-center gap-3 rounded-md border border-dashed border-border p-6 text-center">
                  <FileSpreadsheet className="size-6 text-muted-foreground" />
                  {sheetState === "error" && <div className="text-[13px] text-destructive">{sheetError}</div>}
                  {google && !google.isAdmin ? (
                    <div className="label-text">Only workspace admins can connect Google.</div>
                  ) : (
                    <ConnectGoogleButton
                      returnTo="/welcome"
                      label={sheetState === "error" ? "Try again" : "Connect Google"}
                    />
                  )}
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(2)}
                  disabled={sheetState === "creating"}
                >
                  Back
                </Button>
                {sheetState === "ready" ? (
                  <Button className="flex-1" onClick={() => setStep(4)}>
                    Continue
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setStep(4)}
                    disabled={sheetState === "creating"}
                  >
                    Skip for now
                  </Button>
                )}
              </div>
            </Card>
          </>
        )}

        {step === 4 && (
          <>
            <Progress step={step} />
            <Card>
              <div className="label-text">{stepLabel(4)}</div>
              <h2 className="mt-1 text-[18px] font-semibold">Watch how Tracker works</h2>
              <p className="label-text mt-1">
                A short walkthrough in {ONBOARDING_VIDEOS.length} parts. Watch them in order, or skip ahead and come
                back any time.
              </p>
              {ONBOARDING_VIDEOS.length > 0 ? (
                <>
                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {ONBOARDING_VIDEOS.map((v, i) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setVideo(i)}
                        className={`rounded-md border px-3 py-2 text-left transition-colors ${
                          i === video ? "border-foreground bg-subtle" : "border-border hover:bg-subtle"
                        }`}
                      >
                        <div className="label-text">Part {i + 1}</div>
                        <div className="text-[13px] font-medium leading-snug">{v.title}</div>
                      </button>
                    ))}
                  </div>
                  <div className="mt-3 aspect-video overflow-hidden rounded-md border border-border bg-subtle">
                    <iframe
                      key={ONBOARDING_VIDEOS[video].id}
                      className="size-full"
                      src={`https://www.youtube-nocookie.com/embed/${ONBOARDING_VIDEOS[video].id}?rel=0`}
                      title={`Part ${video + 1}: ${ONBOARDING_VIDEOS[video].title}`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[13px]">
                    <span className="font-medium">
                      Part {video + 1} of {ONBOARDING_VIDEOS.length}: {ONBOARDING_VIDEOS[video].title}
                    </span>
                    {video < ONBOARDING_VIDEOS.length - 1 && (
                      <button
                        type="button"
                        className="text-muted-foreground underline hover:text-foreground"
                        onClick={() => setVideo(video + 1)}
                      >
                        Next: Part {video + 2}
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <div className="mt-4 flex aspect-video flex-col items-center justify-center gap-2 rounded-md border border-border bg-subtle">
                  <CirclePlay className="size-8 text-muted-foreground" />
                  <div className="label-text">Tutorial video coming soon</div>
                </div>
              )}
              <div className="mt-4 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(IS_TEST_MODE ? 2 : 3)}>
                  Back
                </Button>
                <Button className="flex-1" onClick={() => setStep(5)}>
                  Continue
                </Button>
              </div>
            </Card>
          </>
        )}

        {step === 5 && (
          <div className="text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-foreground text-background">
              <Check className="size-6" />
            </div>
            <h1 className="mt-4 text-[24px] font-semibold">You're good to go now</h1>
            <p className="label-text mt-2">{workspace.name} is ready. Start using your tracker now.</p>
            <Button
              className="mt-6 w-full"
              onClick={async () => {
                await markOnboarded();
                void navigate({ to: "/modules" });
              }}
            >
              Start using Tracker
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
