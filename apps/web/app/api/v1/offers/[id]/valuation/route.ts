import { handle } from "@/server/api/respond";
import { createValuation, getOfferValuation } from "@/server/api/valuation";

type Context = RouteContext<"/api/v1/offers/[id]/valuation">;

/** The owner's latest valuation of this offer, or null. */
export const GET = (request: Request, { params }: Context) => handle(async () => getOfferValuation(request, (await params).id));

/** Start a valuation of this offer (owner only, one open at a time). */
export const POST = (request: Request, { params }: Context) => handle(async () => createValuation(request, (await params).id));
