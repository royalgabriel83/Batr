import { handle } from "@/server/api/respond";
import { reviewAction, reviewGet } from "@/server/api/valuation";

type Context = RouteContext<"/api/v1/review/valuations/[id]">;

/** BATR staff: everything about one valuation. */
export const GET = (request: Request, { params }: Context) => handle(async () => reviewGet(request, (await params).id));

/** BATR staff: `{ action: add_comparison | exclude_comparison | add_note | decide, ... }`. */
export const POST = (request: Request, { params }: Context) => handle(async () => reviewAction(request, (await params).id));
