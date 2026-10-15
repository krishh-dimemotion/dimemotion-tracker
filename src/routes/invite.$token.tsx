import { useEffect, useState, type ReactNode } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Card, Loading } from "@/components/live/kit";
import { clearPendingInvite, setPendingInvite } from "@/components/account/pending-invite";

export const Route = createFileRoute("/invite/$token")({
  head: () => ({
    meta: [
      { title: "Join workspace | Tracker" },
      { name: "description", content: "Accept an invite to a Tracker workspace." },
    ],
  }),
  component: InvitePage,
});

type InvitePreview = {
  email: string;
  role: string;
  workspace_name: string;
  expired: boolean;
  used: boolean;
};

// RPCs invite_preview / accept_invite may be missing from the generated types.
const db = supabase as unknown as {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function InvitePage() {
  const { token } = Route.useParams();
  const { loading, session, user, signOut } = useAuth();
  const navigate = useNavigate();
  const [invite, setInvite] = useState<InvitePreview | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    void db.rpc("invite_preview", { _token: token }).then(({ data }) => {
      setInvite((data as InvitePreview[] | null)?.[0] ?? null);
    });
  }, [token]);

  if (loading || invite === undefined) return <Loading page />;

  const shell = (children: ReactNode) => (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-[420px] space-y-3 text-center">{children}</Card>
    </div>
  );

  if (!invite) {
    clearPendingInvite();
    return shell(
      <>
        <div className="text-[16px] font-semibold">Invite not found</div>
        <p className="label-text">This link is not valid. Ask the person who invited you for a new one.</p>
        <Button variant="outline" onClick={() => navigate({ to: "/" })}>
          Go to the app
        </Button>
      </>,
    );
  }

  const sameEmail = (user?.email?.toLowerCase() ?? "") === invite.email.toLowerCase();

  if (invite.expired || (invite.used && !sameEmail)) {
    clearPendingInvite();
    return shell(
      <>
        <div className="text-[16px] font-semibold">This invite can no longer be used</div>
        <p className="label-text">
          It has expired or was already used. Ask an admin of {invite.workspace_name} for a new link.
        </p>
      </>,
    );
  }

  if (!session)
    return shell(
      <>
        <div className="text-[16px] font-semibold">Join {invite.workspace_name}</div>
        <p className="label-text">
          You were invited as <b>{invite.email}</b> ({invite.role}). Sign in or create an account with that email to
          join.
        </p>
        <Button
          onClick={() => {
            setPendingInvite(token);
            void navigate({ to: "/auth" });
          }}
        >
          Continue
        </Button>
      </>,
    );

  if (!sameEmail)
    return shell(
      <>
        <div className="text-[16px] font-semibold">Wrong account</div>
        <p className="label-text">
          This invite is for <b>{invite.email}</b>, but you are signed in as <b>{user?.email}</b>.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setPendingInvite(token);
            void signOut().then(() => navigate({ to: "/auth", search: { mode: "signin" } }));
          }}
        >
          Sign in with {invite.email}
        </Button>
      </>,
    );

  const join = async () => {
    setJoining(true);
    const { error } = await db.rpc("accept_invite", { _token: token });
    if (error) {
      setJoining(false);
      return toast.error(error.message);
    }
    clearPendingInvite();
    window.location.assign("/modules");
  };

  return shell(
    <>
      <div className="text-[16px] font-semibold">Join {invite.workspace_name}</div>
      <p className="label-text">
        You will join as {invite.role}. You can switch between your workspaces from the sidebar.
      </p>
      <Button onClick={() => void join()} disabled={joining}>
        {joining ? "Joining..." : "Join workspace"}
      </Button>
    </>,
  );
}
