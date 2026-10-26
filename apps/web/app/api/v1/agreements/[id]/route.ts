import { handle } from "@/server/api/respond";
import { getAgreement } from "@/server/api/agreements";

export const GET = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]">) =>
  handle(async () => getAgreement(request, (await params).id));
