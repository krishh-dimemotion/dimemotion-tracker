import { createFileRoute, redirect } from "@tanstack/react-router";

// The live app no longer has a pending-approval screen; /pending forwards to /modules.
export const Route = createFileRoute("/pending")({
  beforeLoad: () => {
    throw redirect({ to: "/modules" });
  },
});
