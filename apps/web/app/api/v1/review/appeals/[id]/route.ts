import { handle } from "@/server/api/respond";
import { appealAction } from "@/server/api/valuation";

/** BATR staff: `{ action: claim }` or `{ action: decide, decision }` on an appeal. */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/review/appeals/[id]">) =>
  handle(async () => appealAction(request, (await params).id));
