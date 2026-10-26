import { handle } from "@/server/api/respond";
import { listModerationQueue } from "@/server/api/safety";

export const GET = (request: Request) => handle(async () => listModerationQueue(request));
