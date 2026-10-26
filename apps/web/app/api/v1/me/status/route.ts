import { handle } from "@/server/api/respond";
import { getMemberStatus } from "@/server/api/status";

export const GET = (request: Request) => handle(async () => getMemberStatus(request));
