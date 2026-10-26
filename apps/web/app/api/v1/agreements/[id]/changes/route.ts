import { handle } from "@/server/api/respond";
import { proposeChange } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/changes">) =>
  handle(async () => proposeChange(request, (await params).id));
