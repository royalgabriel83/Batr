import { handle } from "@/server/api/respond";
import { getPhotoUrls } from "@/server/api/offers";

/** Fresh 10-minute signed links, for a viewer who may still read the offer. */
export const GET = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/photo-urls">) =>
  handle(async () => getPhotoUrls(request, (await params).id));
