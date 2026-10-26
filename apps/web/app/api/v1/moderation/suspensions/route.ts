import { handle } from "@/server/api/respond";
import { listSuspensions } from "@/server/api/safety";

export const GET = (request: Request) => handle(async () => listSuspensions(request));
