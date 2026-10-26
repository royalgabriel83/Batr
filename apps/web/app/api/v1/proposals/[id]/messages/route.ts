import { handle } from "@/server/api/respond";
import { getThread, sendMessage } from "@/server/api/messages";

export const GET = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/messages">) =>
  handle(async () => getThread(request, (await params).id));

export const POST = (request: Request, { params }: RouteContext<"/api/v1/proposals/[id]/messages">) =>
  handle(async () => sendMessage(request, (await params).id));
