import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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
    const t = (p as Profile | null)?.theme === "dark" ? "dark" : "light";
    setThemeState(t);
  };

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
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
  }, [theme]);

  const setTheme = (t: "light" | "dark") => {
    setThemeState(t);
    if (profile) void supabase.from("profiles").update({ theme: t }).eq("id", profile.id);
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
