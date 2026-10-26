import { handle } from "@/server/api/respond";
import { requestCancellation } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/cancellation">) =>
  handle(async () => requestCancellation(request, (await params).id));
