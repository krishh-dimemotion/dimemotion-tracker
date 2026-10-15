// Live chunk: WorkspaceSwitcher-DvZBHSJC.js
// The chunk also carries the live Dialog and DropdownMenu wrappers (and Radix
// internals). Those wrappers live in ./ui and are re-exported here under the
// chunk's letters so ports can import from either place.
// Export mapping:
//   n -> WorkspaceSwitcher        t -> NoWorkspace
//   r -> Dialog    l -> DialogTrigger   i -> DialogContent  s -> DialogHeader
//   o -> DialogFooter  c -> DialogTitle  a -> DialogDescription  d -> DialogClose
//   h -> DialogPortal  m -> DialogOverlay (raw)  u/_/f/g/p/v -> raw Radix dialog parts
//   y -> DropdownMenu  w -> DropdownMenuTrigger  b -> DropdownMenuContent
//   x -> DropdownMenuItem  S -> DropdownMenuLabel  C -> DropdownMenuSeparator
//   A -> Columns3Icon  M -> ChevronsUpDownIcon  N -> BoxesIcon  j -> CircleIcon
//   E/T -> RovingFocusGroup Root/Item, D/O -> Direction provider/hook,
//   k -> createCollection (Radix internals; import @radix-ui/* directly).
import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/live/auth";
import { db } from "@/lib/live/db";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/live/support";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui";

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui";
export {
  Boxes as BoxesIcon,
  ChevronsUpDown as ChevronsUpDownIcon,
  Circle as CircleIcon,
  Columns3 as Columns3Icon,
} from "lucide-react";

function NewWorkspaceDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { createWorkspace } = useAuth();
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [canCreate, setCanCreate] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setCanCreate(null);
    void db.rpc("can_create_workspace").then(({ data, error }) => setCanCreate(!error && data === true));
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      await createWorkspace(name.trim());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the workspace.");
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New workspace</DialogTitle>
        </DialogHeader>
        {canCreate === false ? (
          <>
            <p className="text-[13px] text-muted-foreground">
              Your current plan's workspace limit has been reached. Trial and Pro include one workspace; Max
              includes up to three. Upgrade to Max or contact support if you need more.
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
              <Button asChild>
                <a href={supportMailto("Request for another Tracker workspace")}>Email {SUPPORT_EMAIL}</a>
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <p className="text-[13px] text-muted-foreground">
              A separate space with its own leads, CRM, settings and team. It starts with the default stages and
              channels.
            </p>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Workspace name"
              onKeyDown={(e) => e.key === "Enter" && void submit()}
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={creating || !name.trim() || canCreate === null}>
                {creating ? "Creating..." : "Create"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { workspace, workspaces, switchWorkspace, profile } = useAuth();
  const [newOpen, setNewOpen] = useState(false);
  const initial = (workspace?.name ?? "W").trim().charAt(0).toUpperCase();
  const avatar = profile?.avatar_url?.trim() || null;
  const [avatarBroken, setAvatarBroken] = useState(false);
  useEffect(() => setAvatarBroken(false), [avatar]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "mb-3 flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-subtle",
              collapsed && "justify-center px-0",
            )}
            title={workspace?.name ?? "Workspace"}
          >
            {avatar && !avatarBroken ? (
              <img
                src={avatar}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setAvatarBroken(true)}
                className="size-6 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex size-6 shrink-0 items-center justify-center rounded bg-foreground text-[11px] font-semibold text-background">
                {initial}
              </span>
            )}
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight">
                  {workspace?.name ?? "Workspace"}
                </span>
                <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[220px]">
          <DropdownMenuLabel className="text-[11px] text-muted-foreground">Workspaces</DropdownMenuLabel>
          {workspaces.map((w) => (
            <DropdownMenuItem
              key={w.id}
              onSelect={() => {
                if (w.id !== workspace?.id)
                  switchWorkspace(w.id).catch((e) =>
                    toast.error(e instanceof Error ? e.message : "Could not switch."),
                  );
              }}
            >
              <span className="min-w-0 flex-1 truncate">{w.name}</span>
              <span className="text-[11px] text-muted-foreground">{w.role}</span>
              {w.id === workspace?.id && <Check className="size-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setNewOpen(true)}>
            <Plus className="size-3.5" /> New workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <NewWorkspaceDialog open={newOpen} onOpenChange={setNewOpen} />
    </>
  );
}

export function NoWorkspace() {
  const { signOut } = useAuth();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-3 text-center">
        <h1 className="text-[18px] font-semibold">You are not in a workspace</h1>
        <p className="text-[13px] text-muted-foreground">
          Create your own workspace, or ask a teammate to send you an invite link.
        </p>
        <div className="flex justify-center gap-2">
          <Button onClick={() => setOpen(true)}>Create workspace</Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
      <NewWorkspaceDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** Convenience hook over useAuth for the workspace fields. */
export function useWorkspace() {
  const { workspace, workspaces, switchWorkspace, createWorkspace } = useAuth();
  return { workspace, workspaces, switchWorkspace, createWorkspace };
}
