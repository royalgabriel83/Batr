import { handle } from "@/server/api/respond";
import { setMark } from "@/server/api/marks";

export const PUT = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/like">) =>
  handle(async () => setMark(request, (await params).id, "like", true));

export const DELETE = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/like">) =>
  handle(async () => setMark(request, (await params).id, "like", false));
