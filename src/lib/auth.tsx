import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const THEME_STORAGE_KEY = "buzzspear-theme";

function isTheme(value: string | null): value is "light" | "dark" {
  return value === "light" || value === "dark";
}

export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: "owner" | "admin" | "member";
  is_active: boolean;
  theme: string;
  default_module: string | null;
  default_lead_view: string | null;
};

type AuthState = {
  loading: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  permissions: string[];
  isAdmin: boolean;
  can: (key: string) => boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setThemeState] = useState<"light" | "dark">("light");
  const [themeInitialized, setThemeInitialized] = useState(false);
  const themeResolved = useRef(false);

  const load = async (uid: string | undefined) => {
    if (!uid) {
      setProfile(null);
      setPermissions([]);
      return;
    }
    const [{ data: p }, { data: perms }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", uid).maybeSingle(),
      supabase.from("user_permissions").select("permission_key,enabled").eq("user_id", uid),
    ]);
    setProfile((p as Profile) ?? null);
    setPermissions((perms ?? []).filter((r) => r.enabled).map((r) => r.permission_key));

    // Resolve the theme once, on the first profile load. After that the
    // theme only changes through setTheme (or another tab via the storage
    // event), so profile refreshes (e.g. saving settings) can never flip it.
    if (themeResolved.current) return;
    themeResolved.current = true;
    const local = window.localStorage.getItem(THEME_STORAGE_KEY);
    const remote = (p as Profile | null)?.theme === "dark" ? "dark" : "light";
    if (isTheme(local)) {
      setThemeState(local);
      if (p && remote !== local) {
        void supabase.from("profiles").update({ theme: local } as never).eq("id", uid);
      }
    } else {
      setThemeState(remote);
      window.localStorage.setItem(THEME_STORAGE_KEY, remote);
    }
  };


  useEffect(() => {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(savedTheme)) setThemeState(savedTheme);
    setThemeInitialized(true);

    const syncTheme = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY || !isTheme(event.newValue)) return;
      setThemeState(event.newValue);
    };

    window.addEventListener("storage", syncTheme);
    return () => window.removeEventListener("storage", syncTheme);
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setTimeout(() => {
        void load(s?.user?.id).finally(() => setLoading(false));
      }, 0);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      void load(data.session?.user?.id).finally(() => setLoading(false));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!themeInitialized) return;
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.style.colorScheme = theme;
  }, [theme, themeInitialized]);

  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    window.localStorage.setItem(THEME_STORAGE_KEY, t);
    if (profile) void supabase.from("profiles").update({ theme: t } as never).eq("id", profile.id);
  };


  const isAdmin = profile?.role === "admin" || profile?.role === "owner";

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      user: session?.user ?? null,
      profile,
      permissions,
      isAdmin,
      can: (key: string) => {
        if (key === "settings.users") return isAdmin;
        return isAdmin || permissions.includes(key);
      },
      refresh: () => load(session?.user?.id),
      signOut: async () => {
        await supabase.auth.signOut();
        setProfile(null);
        setPermissions([]);
      },
      theme,
      setTheme,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loading, session, profile, permissions, isAdmin, theme],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
