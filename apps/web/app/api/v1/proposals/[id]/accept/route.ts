import { handle } from "@/server/api/respond";
import { acceptProposal } from "@/server/api/proposals";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/accept">) =>
  handle(async () => acceptProposal(request, (await params).id));
