import { handle } from "@/server/api/respond";
import { getValuation, saveValuation } from "@/server/api/valuation";

type Context = RouteContext<"/api/v1/valuations/[id]">;

export const GET = (request: Request, { params }: Context) => handle(async () => getValuation(request, (await params).id));

/** Save the whole draft: `{ expected_revision, draft: { exchange_type, cash_component_kobo, components } }`. */
export const PATCH = (request: Request, { params }: Context) => handle(async () => saveValuation(request, (await params).id));
