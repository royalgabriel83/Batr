import { handle } from "@/server/api/respond";
import { getProfile, setProfile } from "@/server/api/profile";

export const GET = (request: Request) => handle(async () => getProfile(request));
export const PATCH = (request: Request) => handle(async () => setProfile(request));
