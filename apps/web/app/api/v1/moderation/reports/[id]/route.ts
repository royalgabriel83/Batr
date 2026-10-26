import { handle } from "@/server/api/respond";
import { getModerationReport } from "@/server/api/safety";

export const GET = (request: Request, { params }: RouteContext<"/api/v1/moderation/reports/[id]">) =>
  handle(async () => getModerationReport(request, (await params).id));
