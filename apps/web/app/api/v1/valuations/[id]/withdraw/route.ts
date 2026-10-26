import { handle } from "@/server/api/respond";
import { withdrawValuation } from "@/server/api/valuation";

/** Withdraw: `{ expected_revision }`. */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/valuations/[id]/withdraw">) =>
  handle(async () => withdrawValuation(request, (await params).id));
