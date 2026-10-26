import { cache } from "react";
import type { AgreementBox, ProposalBox } from "@batr/shared";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ApiCaller } from "@/server/api/auth";
import {
  getAgreementFor,
  listAgreementsFor,
  type AgreementView,
} from "@/server/api/agreements";
import {
  getProposalFor,
  listProposalsFor,
  offerProposalsFor,
  waitingCounts,
  type ProposalSummaryView,
  type ProposalView,
} from "@/server/api/proposals";
import {
  getThreadFor,
  listNotificationsFor,
  listThreadsFor,
  notificationCountFor,
  unreadCountsFor,
  type ThreadView,
} from "@/server/api/messages";
import { ApiError } from "@/server/api/respond";
import { signPaths } from "@/server/api/views";

// Reads for server-rendered proposal pages, with the member's own
// session and the same views as the API (as server/offers/queries.ts).

export const currentCaller = cache(async (): Promise<ApiCaller> => {
  const client = await createSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  return { client, user, via: "cookie" };
});

/** Null when the proposal doesn't exist or the viewer isn't one of its two members. */
export async function orNull<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.code === "NOT_FOUND" ||
        error.code === "FORBIDDEN" ||
        error.code === "UNAUTHENTICATED")
    )
      return null;
    throw error;
  }
}

export async function loadProposal(id: string): Promise<ProposalView | null> {
  const caller = await currentCaller();
  return orNull(() => getProposalFor(caller, id));
}

export async function loadProposals(box: ProposalBox, cursor: string | null) {
  return listProposalsFor(await currentCaller(), box, cursor);
}

export async function loadAgreement(id: string): Promise<AgreementView | null> {
  const caller = await currentCaller();
  return orNull(() => getAgreementFor(caller, id));
}

export async function loadAgreements(box: AgreementBox, cursor: string | null) {
  return listAgreementsFor(await currentCaller(), box, cursor);
}

/** P5 and A5: what waits on the member, for the Exchanges tabs. */
export async function loadWaitingCounts() {
  return waitingCounts(await currentCaller());
}

/** The count on Exchanges in the header and tab bar. */
export async function loadExchangesCount(): Promise<number> {
  const counts = await loadWaitingCounts();
  return counts.turn + counts.agreements;
}

/** The thread on a proposal or agreement page (Milestone 5). */
export async function loadThread(proposalId: string): Promise<ThreadView | null> {
  const caller = await currentCaller();
  return orNull(() => getThreadFor(caller, proposalId));
}

/** N2: the Messages page. */
export async function loadThreads(cursor: string | null) {
  return listThreadsFor(await currentCaller(), cursor);
}

/** Unread messages by proposal id, for the Exchanges rows. */
export async function loadUnreadCounts(): Promise<Record<string, number>> {
  return unreadCountsFor(await currentCaller());
}

export async function loadNotifications(cursor: string | null) {
  return listNotificationsFor(await currentCaller(), cursor);
}

/** The counts in the header: threads with unread messages, and unread notifications. */
export async function loadHeaderCounts() {
  const caller = await currentCaller();
  const [unread, notifications] = await Promise.all([
    unreadCountsFor(caller),
    notificationCountFor(caller),
  ]);
  return { messages: Object.keys(unread).length, notifications };
}

/** P6: the owner's list of proposals on their offer. */
export async function loadOfferProposals(
  offerId: string,
): Promise<ProposalSummaryView[]> {
  const caller = await currentCaller();
  return (await orNull(() => offerProposalsFor(caller, offerId))) ?? [];
}

/** The member's own open proposal on an offer, if any (one at most). */
export async function loadOpenProposalId(
  offerId: string,
  memberId: string,
): Promise<string | null> {
  const { client } = await currentCaller();
  const { data, error } = await client
    .from("proposals")
    .select("id")
    .eq("offer_id", offerId)
    .eq("proposer_id", memberId)
    .eq("status", "open")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle<{ id: string }>();
  if (error) throw error;
  return data?.id ?? null;
}

export interface OfferChoice {
  id: string;
  title: string;
  thumb_url: string | null;
}

/** The member's active offers, newest first: what they can give. */
export async function loadMyActiveOffers(
  memberId: string,
): Promise<OfferChoice[]> {
  const { client } = await currentCaller();
  const { data, error } = await client
    .from("offers")
    .select("id, title, offer_photos (thumb_path, position)")
    .eq("owner_id", memberId)
    .eq("status", "active")
    .order("published_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data as unknown as {
    id: string;
    title: string;
    offer_photos: { thumb_path: string; position: number }[];
  }[];
  const cover = (row: (typeof rows)[number]) =>
    [...row.offer_photos].sort((a, b) => a.position - b.position)[0]
      ?.thumb_path ?? null;
  const links = await signPaths(
    client,
    rows.flatMap((row) => cover(row) ?? []),
  );
  return rows.map((row) => {
    const path = cover(row);
    return {
      id: row.id,
      title: row.title,
      thumb_url: path ? (links.get(path) ?? null) : null,
    };
  });
}
