import { handle } from "@/server/api/respond";
import { actOnReport } from "@/server/api/safety";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/moderation/reports/[id]/actions">) =>
  handle(async () => actOnReport(request, (await params).id));
