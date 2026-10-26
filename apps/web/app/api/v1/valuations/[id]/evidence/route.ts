import { handle } from "@/server/api/respond";
import { uploadEvidence } from "@/server/api/valuation";

/** Upload one evidence file (multipart: file, kind, component_id). */
export const POST = (request: Request, { params }: RouteContext<"/api/v1/valuations/[id]/evidence">) =>
  handle(async () => uploadEvidence(request, (await params).id));
