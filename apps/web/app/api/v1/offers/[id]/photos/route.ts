import { handle } from "@/server/api/respond";
import { uploadPhoto } from "@/server/api/upload";

/** Upload one photo (multipart: file, expected_status, expected_revision, alt_text). */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/offers/[id]/photos">) =>
  handle(async () => uploadPhoto(request, (await params).id));
