import { handle } from "@/server/api/respond";
import { resolveCancellation } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/cancellation/withdraw">) =>
  handle(async () => resolveCancellation(request, (await params).id, "withdraw"));
