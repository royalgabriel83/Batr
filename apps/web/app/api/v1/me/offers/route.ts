import { handle } from "@/server/api/respond";
import { listMyOffers } from "@/server/api/offers";

/** The member's own offers in any status (?status=). */
export const GET = (request: Request) => handle(() => listMyOffers(request));
