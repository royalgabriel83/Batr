import { handle } from "@/server/api/respond";
import { closeProposal } from "@/server/api/proposals";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/decline">) =>
  handle(async () => closeProposal(request, (await params).id, "decline"));
