import { handle } from "@/server/api/respond";
import { reportProblem } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/problem">) =>
  handle(async () => reportProblem(request, (await params).id));
