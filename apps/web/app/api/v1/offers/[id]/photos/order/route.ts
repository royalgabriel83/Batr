import { handle } from "@/server/api/respond";
import { reorderPhotos } from "@/server/api/offers";

/** Reorder photos (the complete ordered list of photo ids). */
export const PUT = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/photos/order">) =>
  handle(async () => reorderPhotos(request, (await params).id));
