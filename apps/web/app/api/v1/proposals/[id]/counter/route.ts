import { handle } from "@/server/api/respond";
import { counterProposal } from "@/server/api/proposals";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/counter">) =>
  handle(async () => counterProposal(request, (await params).id));
