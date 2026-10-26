import { handle } from "@/server/api/respond";
import { markThreadRead } from "@/server/api/messages";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/messages/read">) =>
  handle(async () => markThreadRead(request, (await params).id));
