import { handle } from "@/server/api/respond";
import { createReport, listMyReports } from "@/server/api/safety";

export const GET = (request: Request) => handle(async () => listMyReports(request));
export const POST = (request: Request) => handle(async () => createReport(request));
