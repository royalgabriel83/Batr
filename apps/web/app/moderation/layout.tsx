import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getCurrentMember } from "@/server/auth";
import { loadSafetyStatus } from "@/server/safety/queries";

// Moderators only (milestone-6.md, S4; milestone 8, acceptance 1). The
// check sits here, outside the loading skeleton's boundary, so anyone
// else gets a real 404 rather than a streamed one. Signed-out visitors
// are sent to sign in by the proxy first.

export default async function ModerationLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  if (member && !(await loadSafetyStatus()).moderator) notFound();
  return children;
}
