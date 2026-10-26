import { handle } from "@/server/api/respond";
import { createOffer, listMarketplace } from "@/server/api/offers";

/** Active offers, newest first, 20 per page (?category=&cursor=). */
export const GET = (request: Request) => handle(() => listMarketplace(request));

/** Create a draft. */
export const POST = (request: Request) => handle(() => createOffer(request));
