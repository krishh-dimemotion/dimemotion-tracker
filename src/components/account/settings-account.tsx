import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/live/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// localStorage key for the remembered lead view (live lead-view chunk).
const LEAD_VIEW_STORAGE_KEY = "lt.leads.view";

export function AccountSettings() {
  const { profile, refresh, theme, setTheme } = useAuth();
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? "");
  const [defaultModule, setDefaultModule] = useState(profile?.default_module ?? "lead");
  const [defaultView, setDefaultView] = useState(profile?.default_lead_view ?? "table");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [updatingPw, setUpdatingPw] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showLink, setShowLink] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!profile) return null;

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        default_module: defaultModule,
        default_lead_view: defaultView,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) return window.alert(error.message);
    if (defaultView !== (profile.default_lead_view ?? "table")) {
      try {
        window.localStorage.removeItem(LEAD_VIEW_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }
    toast.success("Account saved");
    void refresh();
  };

  const upload = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return window.alert("Use a PNG, JPG, WebP or GIF image.");
    if (file.size > 5_242_880) return window.alert("Image must be under 5 MB.");
    setUploading(true);
    try {
      const ext = file.type.split("/")[1].replace("jpeg", "jpg");
      const path = `${profile.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { contentType: file.type, upsert: true });
      if (upErr) throw upErr;
      const url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
      const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
      if (error) throw error;
      setAvatarUrl(url);
      void refresh();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "Couldn't upload the picture.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeAvatar = async () => {
    const { error } = await supabase.from("profiles").update({ avatar_url: null }).eq("id", profile.id);
    if (error) return window.alert(error.message);
    setAvatarUrl("");
    void refresh();
  };

  const initial = (fullName || profile.email || "?").trim().charAt(0).toUpperCase();

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
          <div className="label-text mb-1">Profile picture</div>
          <div className="flex flex-wrap items-center gap-3">
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="size-12 rounded-full border border-border object-cover" />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-full border border-border bg-subtle text-[15px] font-medium text-muted-foreground">
                {initial}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => void upload(e.target.files?.[0])}
            />
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Upload className="mr-2 size-4" />}
              {avatarUrl ? "Change picture" : "Upload a picture"}
            </Button>
            {avatarUrl && (
              <Button size="sm" variant="ghost" onClick={() => void removeAvatar()}>
                Remove
              </Button>
            )}
            <button
              type="button"
              className="text-[12px] text-muted-foreground underline"
              onClick={() => setShowLink((v) => !v)}
            >
              {showLink ? "Hide image link" : "Or use an image link"}
            </button>
          </div>
          {showLink && (
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
              className="mt-2 h-9 text-[13px]"
            />
          )}
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
          <Select value={defaultView ?? "table"} onValueChange={setDefaultView}>
            <SelectTrigger className="h-9 text-[13px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="table">Table</SelectItem>
              <SelectItem value="board">Columns</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button size="sm" className="w-fit" onClick={save} disabled={saving}>
        {saving ? "Saving..." : "Save profile"}
      </Button>
      <div className="border-t border-border pt-4">
        <div className="label-text mb-1">Change password</div>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-9 w-56 text-[13px]"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (password.length < 6) return window.alert("Password must be at least 6 characters.");
              setUpdatingPw(true);
              const { error } = await supabase.auth.updateUser({ password });
              setUpdatingPw(false);
              if (error) return window.alert(error.message);
              setPassword("");
              window.alert("Password updated.");
            }}
            disabled={updatingPw || !password}
          >
            {updatingPw ? "Updating..." : "Update password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
