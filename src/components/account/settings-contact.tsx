import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUPPORT_EMAIL, supportMailto } from "@/lib/live/support";

export function ContactSettings() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="text-[13px] font-medium">Questions, billing, or need another workspace?</div>
        <div className="label-text mt-0.5">Email {SUPPORT_EMAIL}. We usually reply within 1 to 2 business days.</div>
      </div>
      <Button size="sm" variant="outline" asChild>
        <a href={supportMailto("Tracker support")}>
          <Mail className="mr-2 size-4" />
          Email us
        </a>
      </Button>
    </div>
  );
}
