import { handle } from "@/server/api/respond";
import { markWarningSeen } from "@/server/api/safety";

/** Milestone 8, W7: the member has seen their warning banner. */
export const POST = (request: Request) => handle(async () => markWarningSeen(request));
