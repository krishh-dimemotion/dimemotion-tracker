import { Pill } from "@/components/kit";
import type { Stage } from "./types";

export function StagePill({ stage }: { stage: Stage | null | undefined }) {
  if (!stage) return <Pill>No stage</Pill>;
  return <Pill color={stage.color}>{stage.name}</Pill>;
}

export function stageById(stages: Stage[] | undefined, id: string | null) {
  if (!id || !stages) return null;
  return stages.find((s) => s.id === id) ?? null;
}
