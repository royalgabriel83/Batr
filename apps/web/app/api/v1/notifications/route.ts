import { handle } from "@/server/api/respond";
import { listNotifications } from "@/server/api/messages";

export const GET = (request: Request) => handle(async () => listNotifications(request));
