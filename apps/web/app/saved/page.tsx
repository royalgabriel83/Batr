import type { Metadata } from "next";
import { PRODUCT_NAME } from "@batr/shared";
import { requireMember } from "@/server/auth";
import { loadSaved } from "@/server/offers/queries";
import { SavedList } from "./SavedList";

export const metadata: Metadata = { title: `Saved · ${PRODUCT_NAME}` };

// Saved offers (owner, 2026-10-17, with the heart and bookmark). Only
// the member sees this list; nobody is told when their offer is saved.
// Offers that stop being available stay listed, without their details,
// until the member removes them.
export default async function SavedPage() {
  const member = await requireMember("/saved");
  const page = await loadSaved(member.id);
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pt-8 pb-12 md:gap-8 md:px-6 md:pt-12 md:pb-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 md:text-h2-lg">Saved offers</h1>
        <p className="text-body text-text-secondary">Offers you&apos;ve bookmarked. Only you can see this list.</p>
      </div>
      <SavedList initial={page.items} nextCursor={page.next_cursor} />
    </main>
  );
}
