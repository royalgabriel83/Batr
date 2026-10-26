import { handle } from "@/server/api/respond";
import { deleteDraft, editOffer, getOffer } from "@/server/api/offers";

type Context = RouteContext<"/api/v1/offers/[id]">;

/** Offer detail: anyone for an active offer, the owner otherwise, 404 for others. */
export const GET = (request: Request, { params }: Context) => handle(async () => getOffer(request, (await params).id));

/** Edit fields (rules depend on the status). */
export const PATCH = (request: Request, { params }: Context) => handle(async () => editOffer(request, (await params).id));

/** Delete a draft. */
export const DELETE = (request: Request, { params }: Context) => handle(async () => deleteDraft(request, (await params).id));
