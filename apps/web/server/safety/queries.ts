import {
  blockedMembersFor,
  moderationQueueFor,
  moderationReportFor,
  myReportsFor,
  safetyStatusFor,
  suspensionsFor,
  type ModerationReportView,
  type QueueFilters,
  type SafetyStatus,
} from "@/server/api/safety";
import { currentCaller, orNull } from "@/server/proposals/queries";

// Reads for the safety pages (specs/milestone-6.md), with the member's
// own session and the same views as the API.

/** S8 banner and the moderation link; nothing for a visitor. */
export async function loadSafetyStatus(): Promise<SafetyStatus> {
  const caller = await currentCaller();
  if (!caller.user) return { suspended: false, moderator: false, senior: false, warned: false };
  return safetyStatusFor(caller);
}

export async function loadBlockedMembers() {
  return blockedMembersFor(await currentCaller());
}

export async function loadMyReports() {
  return myReportsFor(await currentCaller());
}

/** Null for anyone who isn't a moderator: the page is a 404. */
export async function loadModerationQueue(filters: QueueFilters = {}) {
  const caller = await currentCaller();
  return orNull(() => moderationQueueFor(caller, filters));
}

export async function loadModerationReport(id: string): Promise<ModerationReportView | null> {
  const caller = await currentCaller();
  return orNull(() => moderationReportFor(caller, id));
}

export async function loadSuspensions() {
  const caller = await currentCaller();
  return orNull(() => suspensionsFor(caller));
}
