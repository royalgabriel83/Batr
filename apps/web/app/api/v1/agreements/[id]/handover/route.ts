import { handle } from "@/server/api/respond";
import { confirmHandover } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/handover">) =>
  handle(async () => confirmHandover(request, (await params).id));
