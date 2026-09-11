import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function AccountCard() {
  const { profile, refresh, theme, setTheme } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [defaultModule, setDefaultModule] = useState(profile?.default_module ?? "lead");
  const [defaultLeadView, setDefaultLeadView] = useState(profile?.default_lead_view ?? "table");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  if (!profile) return null;

  const saveProfile = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        default_module: defaultModule,
        default_lead_view: defaultLeadView,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return window.alert(error.message);
    void refresh();
  };

  const changePassword = async () => {
    if (newPassword.length < 6) return window.alert("Password must be at least 6 characters.");
    setPwSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPwSaving(false);
    if (error) return window.alert(error.message);
    setNewPassword("");
    window.alert("Password updated.");
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <div className="label-text mb-1">Full name</div>
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-9 text-[13px]" />
        </div>
        <div>
          <div className="label-text mb-1">Email</div>
          <Input value={profile.email ?? ""} disabled className="h-9 text-[13px]" />
        </div>
        <div className="sm:col-span-2">
          <div className="label-text mb-1">Avatar URL</div>
          <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} className="h-9 text-[13px]" />
        </div>
        <div>
          <div className="label-text mb-1">Theme</div>
          <Select value={theme} onValueChange={(v) => setTheme(v as "light" | "dark")}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Light</SelectItem>
              <SelectItem value="dark">Dark</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="label-text mb-1">Default landing module</div>
          <Select value={defaultModule ?? "lead"} onValueChange={setDefaultModule}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="lead">Lead Tracker</SelectItem>
              <SelectItem value="crm">CRM</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <div className="label-text mb-1">Default lead view</div>
          <Select value={defaultLeadView ?? "table"} onValueChange={setDefaultLeadView}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="table">Table</SelectItem>
              <SelectItem value="board">Board</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" className="w-fit" onClick={saveProfile} disabled={saving}>
        {saving ? "Saving..." : "Save profile"}
      </Button>

      <div className="border-t border-border pt-4">
        <div className="label-text mb-1">Change password</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            placeholder="New password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="h-9 w-56 text-[13px]"
          />
          <Button size="sm" variant="outline" onClick={changePassword} disabled={pwSaving || !newPassword}>
            {pwSaving ? "Updating..." : "Update password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
