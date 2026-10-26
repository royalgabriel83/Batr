import { handle } from "@/server/api/respond";
import { resolveChange } from "@/server/api/agreements";

export const POST = (request: Request, { params }: RouteContext<"/api/v1/agreements/[id]/changes/[versionId]/reject">) =>
  handle(async () => {
    const { id, versionId } = await params;
    return resolveChange(request, id, versionId, "reject");
  });
