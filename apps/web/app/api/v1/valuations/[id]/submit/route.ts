import { handle } from "@/server/api/respond";
import { submitValuation } from "@/server/api/valuation";

/** Send for review: `{ expected_revision, declaration: true, note }`. */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/valuations/[id]/submit">) =>
  handle(async () => submitValuation(request, (await params).id));
