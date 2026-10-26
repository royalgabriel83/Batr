import { handle } from "@/server/api/respond";
import { replyToProblem } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/problem/reply">) =>
  handle(async () => replyToProblem(request, (await params).id));
