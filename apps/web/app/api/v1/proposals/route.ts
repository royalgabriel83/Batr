import { handle } from "@/server/api/respond";
import { createProposal, listProposals } from "@/server/api/proposals";

export const GET = (request: Request) => handle(async () => listProposals(request));

export const POST = (request: Request) => handle(async () => createProposal(request));
