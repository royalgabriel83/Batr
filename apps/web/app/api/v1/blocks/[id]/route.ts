import { handle } from "@/server/api/respond";
import { unblockMember } from "@/server/api/safety";

export const DELETE = (request: Request, { params }: RouteContext<"/api/v1/blocks/[id]">) =>
  handle(async () => unblockMember(request, (await params).id));
