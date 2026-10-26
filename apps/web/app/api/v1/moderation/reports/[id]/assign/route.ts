import { handle } from "@/server/api/respond";
import { assignReport } from "@/server/api/safety";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/moderation/reports/[id]/assign">) =>
  handle(async () => assignReport(request, (await params).id));
