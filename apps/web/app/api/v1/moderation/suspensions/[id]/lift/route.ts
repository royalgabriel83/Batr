import { handle } from "@/server/api/respond";
import { liftSuspension } from "@/server/api/safety";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/moderation/suspensions/[id]/lift">) =>
  handle(async () => liftSuspension(request, (await params).id));
