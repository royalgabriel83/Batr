import { handle } from "@/server/api/respond";
import { listThreads } from "@/server/api/messages";

export const GET = (request: Request) => handle(async () => listThreads(request));
