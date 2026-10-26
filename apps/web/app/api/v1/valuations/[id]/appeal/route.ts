import { handle } from "@/server/api/respond";
import { appealValuation } from "@/server/api/valuation";

/** Appeal the latest assessment: `{ expected_revision, reason }`. */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/valuations/[id]/appeal">) =>
  handle(async () => appealValuation(request, (await params).id));
