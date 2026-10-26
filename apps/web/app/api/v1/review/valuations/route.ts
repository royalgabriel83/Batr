import { handle } from "@/server/api/respond";
import { reviewQueue } from "@/server/api/valuation";

/** BATR staff: valuations waiting for review (`?status=` to filter). */
export const GET = (request: Request) => handle(async () => reviewQueue(request));
