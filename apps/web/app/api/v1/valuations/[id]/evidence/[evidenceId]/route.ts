import { handle } from "@/server/api/respond";
import { evidenceLink, removeEvidence } from "@/server/api/valuation";

type Context = RouteContext<"/api/v1/valuations/[id]/evidence/[evidenceId]">;

/** A two-minute link to the file, for the uploader or BATR staff. */
export const GET = (request: Request, { params }: Context) =>
  handle(async () => {
    const { id, evidenceId } = await params;
    return evidenceLink(request, id, evidenceId);
  });

/** Remove a file from a draft that was never sent. */
export const DELETE = (request: Request, { params }: Context) =>
  handle(async () => {
    const { id, evidenceId } = await params;
    return removeEvidence(request, id, evidenceId);
  });
