import { handle } from "@/server/api/respond";
import { blockMember, listBlocks } from "@/server/api/safety";

export const GET = (request: Request) => handle(async () => listBlocks(request));
export const POST = (request: Request) => handle(async () => blockMember(request));
