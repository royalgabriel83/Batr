import { handle } from "@/server/api/respond";
import { listAgreements } from "@/server/api/agreements";

export const GET = (request: Request) => handle(async () => listAgreements(request));
