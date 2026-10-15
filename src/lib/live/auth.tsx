// Live: AuthProvider + useAuth from index-LBNWlUO7.js (export `g` = useAuth).
// Adds workspaces on top of the older src/lib/auth.tsx: the current workspace,
// the list of workspaces the user belongs to, switching and creating them,
// and per-workspace permissions. Theme is stored under `tracker.theme`.
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Context,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { db } from "./db";

export const THEME_STORAGE_KEY = "tracker.theme";

export type Theme = "light" | "dark";
export type WorkspaceRole = "owner" | "admin" | "member";

export type Workspace = { id: string; name: string; role: WorkspaceRole | string };

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: WorkspaceRole | string;
  is_active: boolean;
  theme: string | null;
  current_workspace_id?: string | null;
  default_module?: string | null;
  default_lead_view?: string | null;
  [key: string]: unknown;
};

export type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  workspace: Workspace | null;
  workspaces: Workspace[];
  switchWorkspace: (id: string) => Promise<void>;
  createWorkspace: (name: string) => Promise<void>;
  permissions: string[];
  isAdmin: boolean;
  can: (key: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  theme: Theme;
  setTheme: (t: Theme) => void;
};

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    if (window.localStorage.getItem(THEME_STORAGE_KEY) === "dark") return "dark";
  } catch {
    /* storage blocked */
  }
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

// The older provider in src/lib/auth.tsx is still mounted (nested) for files
// that import it; it keeps its own theme under this key and listens for
// storage events. Mirroring the value keeps both providers on the same theme.
const LEGACY_THEME_KEY = "buzzspear-theme";

function storeTheme(t: Theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
    if (window.localStorage.getItem(LEGACY_THEME_KEY) !== t) {
      window.localStorage.setItem(LEGACY_THEME_KEY, t);
      window.dispatchEvent(new StorageEvent("storage", { key: LEGACY_THEME_KEY, newValue: t }));
    }
  } catch {
    /* storage blocked */
  }
}

// Kept on globalThis so HMR and duplicate module copies share one context.
const g = globalThis as unknown as { __liveAuthContext?: Context<AuthState | null> };
const AuthContext = (g.__liveAuthContext ??= createContext<AuthState | null>(null));

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);

  const load = async (uid?: string) => {
    if (!uid) {
      setProfile(null);
      setPermissions([]);
      setWorkspaces([]);
      setWorkspace(null);
      return;
    }
    const [{ data: prof }, { data: members }] = await Promise.all([
      db.from("profiles").select("*").eq("id", uid).maybeSingle(),
      db.from("workspace_members").select("role, workspace_id, workspaces(id, name)").eq("user_id", uid),
    ]);
    const list: Workspace[] = ((members ?? []) as {
      role: string;
      workspace_id: string;
      workspaces: { id: string; name: string } | null;
    }[])
      .map((m) => ({ id: m.workspace_id, name: m.workspaces?.name ?? "Workspace", role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const p = prof as Profile | null;
    const current = list.find((w) => w.id === p?.current_workspace_id) ?? list[0] ?? null;
    if (current && p && p.current_workspace_id !== current.id) {
      await db.rpc("switch_workspace", { _ws: current.id });
    }
    const { data: perms } = current
      ? await db
          .from("user_permissions")
          .select("permission_key,enabled")
          .eq("user_id", uid)
          .eq("workspace_id", current.id)
      : { data: [] };
    setWorkspaces(list);
    setWorkspace(current);
    setProfile(p ? { ...p, role: current?.role ?? "member", is_active: !!current } : null);
    setPermissions(
      ((perms ?? []) as { permission_key: string; enabled: boolean }[])
        .filter((x) => x.enabled)
        .map((x) => x.permission_key),
    );
    if (p) {
      const t: Theme = p.theme === "dark" ? "dark" : "light";
      setThemeState(t);
      storeTheme(t);
    }
  };

  const lastUid = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    // Demo deploys skip the login screen by signing into a shared demo account.
    const demoEmail = import.meta.env.VITE_DEMO_EMAIL as string | undefined;
    const demoPassword = import.meta.env.VITE_DEMO_PASSWORD as string | undefined;
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      if (!s && demoEmail && demoPassword) {
        void supabase.auth.signInWithPassword({ email: demoEmail, password: demoPassword });
        return;
      }
      setSession(s);
      const uid = s?.user?.id ?? null;
      if (uid === lastUid.current) {
        setLoading(false);
        return;
      }
      lastUid.current = uid;
      // Defer so Supabase finishes its own auth work before we query.
      setTimeout(() => {
        void load(uid ?? undefined).finally(() => setLoading(false));
      }, 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = (t: Theme) => {
    const prev = theme;
    setThemeState(t);
    storeTheme(t);
    if (!profile) return;
    const id = profile.id;
    void (async () => {
      const { error } = await db.from("profiles").update({ theme: t }).eq("id", id);
      if (error) {
        setThemeState(prev);
        storeTheme(prev);
        toast.error("Could not save your theme. Please try again.");
        return;
      }
      setProfile((cur) => (cur && cur.id === id ? { ...cur, theme: t } : cur));
    })();
  };

  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      workspace,
      workspaces,
      switchWorkspace: async (id) => {
        const { error } = await db.rpc("switch_workspace", { _ws: id });
        if (error) throw error;
        window.location.assign("/");
      },
      createWorkspace: async (name) => {
        const { error } = await db.rpc("create_workspace", { _name: name });
        if (error) throw error;
        window.location.assign("/");
      },
      permissions,
      isAdmin,
      can: (key) => (key === "settings.users" ? isAdmin : isAdmin || permissions.includes(key)),
      refresh: () => load(session?.user?.id),
      signOut: async () => {
        await supabase.auth.signOut();
        lastUid.current = null;
        setProfile(null);
        setPermissions([]);
        setWorkspaces([]);
        setWorkspace(null);
      },
      theme,
      setTheme,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, session, profile, workspace, workspaces, permissions, isAdmin, theme],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw Error("useAuth must be used inside AuthProvider");
  return ctx;
}
