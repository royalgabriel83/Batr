import type { MemberStatusView } from "@batr/shared";
import { getCaller } from "./auth";
import { notificationCountFor, unreadCountsFor } from "./messages";
import { waitingCounts } from "./proposals";
import { ApiError, ok } from "./respond";
import { safetyStatusFor } from "./safety";

// The counts and banner the web works out in its layout, for the mobile
// app (specs/milestone-2-part-2.md, Q8). No member ids are returned;
// unread counts are keyed by the member's own proposal ids.

export async function getMemberStatus(request: Request): Promise<Response> {
  const caller = await getCaller(request);
  if (!caller.user) throw new ApiError("UNAUTHENTICATED");
  const [waiting, unread, notifications, safety] = await Promise.all([
    waitingCounts(caller),
    unreadCountsFor(caller),
    notificationCountFor(caller),
    safetyStatusFor(caller),
  ]);
  const view: MemberStatusView = {
    exchanges: waiting.turn + waiting.agreements,
    waiting: { turn: waiting.turn, agreements: waiting.agreements },
    messages: Object.keys(unread).length,
    unread_by_proposal: unread,
    notifications,
    suspended: safety.suspended,
    warned: safety.warned,
  };
  return ok(view);
}
