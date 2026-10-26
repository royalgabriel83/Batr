import { handle } from "@/server/api/respond";
import { recordAppeal } from "@/server/api/safety";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/moderation/suspensions/[id]/appeal">) =>
  handle(async () => recordAppeal(request, (await params).id));
