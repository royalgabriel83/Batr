import { handle } from "@/server/api/respond";
import { getOfferAssessment } from "@/server/api/valuation";

type Context = RouteContext<"/api/v1/offers/[id]/assessment">;

/** BATR's assessed value of an offer: the value for members, only whether there is one for visitors. */
export const GET = (request: Request, { params }: Context) => handle(async () => getOfferAssessment(request, (await params).id));
