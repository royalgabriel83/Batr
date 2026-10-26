import { handle } from "@/server/api/respond";
import { listSaved } from "@/server/api/marks";

export const GET = (request: Request) => handle(async () => listSaved(request));
