import { handle } from "@/server/api/respond";
import { readAllNotifications } from "@/server/api/messages";

export const POST = (request: Request) => handle(async () => readAllNotifications(request));
