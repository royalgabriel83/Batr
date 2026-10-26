import { handle } from "@/server/api/respond";
import { listOfferProposals } from "@/server/api/proposals";

export const GET = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/proposals">) =>
  handle(async () => listOfferProposals(request, (await params).id));
