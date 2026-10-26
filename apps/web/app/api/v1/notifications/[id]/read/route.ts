import { handle } from "@/server/api/respond";
import { readNotification } from "@/server/api/messages";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/notifications/[id]/read">) =>
  handle(async () => readNotification(request, (await params).id));
