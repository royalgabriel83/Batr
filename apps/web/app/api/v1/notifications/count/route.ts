import { handle } from "@/server/api/respond";
import { notificationCount } from "@/server/api/messages";

export const GET = (request: Request) => handle(async () => notificationCount(request));
