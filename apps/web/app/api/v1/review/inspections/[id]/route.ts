import { handle } from "@/server/api/respond";
import { inspectionAction } from "@/server/api/valuation";

/** BATR staff: `{ action: schedule | complete | cancel, ... }` on a requested inspection. */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/review/inspections/[id]">) =>
  handle(async () => inspectionAction(request, (await params).id));
