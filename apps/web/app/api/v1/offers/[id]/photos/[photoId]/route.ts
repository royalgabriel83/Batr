import { handle } from "@/server/api/respond";
import { removePhoto, setPhotoAltText } from "@/server/api/offers";

type Context = RouteContext<"/api/v1/offers/[id]/photos/[photoId]">;

/** Remove a photo (refused if an active or paused offer would have none). */
export const DELETE = (request: Request, { params }: Context) =>
  handle(async () => {
    const { id, photoId } = await params;
    return removePhoto(request, id, photoId);
  });

/** Set a photo's alt text (owner, 2026-10-16). */
export const PATCH = (request: Request, { params }: Context) =>
  handle(async () => {
    const { id, photoId } = await params;
    return setPhotoAltText(request, id, photoId);
  });
