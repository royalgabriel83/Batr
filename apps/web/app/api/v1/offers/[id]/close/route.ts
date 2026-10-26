import { handle } from "@/server/api/respond";
import { transitionOffer } from "@/server/api/offers";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/close">) =>
  handle(async () => transitionOffer(request, (await params).id, "close"));
