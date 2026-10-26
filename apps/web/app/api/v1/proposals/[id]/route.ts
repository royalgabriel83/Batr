import { handle } from "@/server/api/respond";
import { getProposal } from "@/server/api/proposals";

export const GET = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]">) =>
  handle(async () => getProposal(request, (await params).id));
