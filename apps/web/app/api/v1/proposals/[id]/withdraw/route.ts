import { handle } from "@/server/api/respond";
import { closeProposal } from "@/server/api/proposals";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/withdraw">) =>
  handle(async () => closeProposal(request, (await params).id, "withdraw"));
