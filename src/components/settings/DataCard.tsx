import { Database, Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

export function DataCard() {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href="/lt/data">
          <Database className="size-4" /> Import / Export
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href="/lt/archive">
          <Boxes className="size-4" /> Archive
        </a>
      </Button>
    </div>
  );
}
