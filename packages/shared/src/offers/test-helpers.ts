import { MemberIdSchema, type MemberId } from "./ids.ts";
import type { Actor } from "./permissions.ts";

export const ownerId: MemberId = MemberIdSchema.parse("8f8a3c55-3b55-4e8e-9d57-0a4e4c1f7a01");
export const otherId: MemberId = MemberIdSchema.parse("1c6f2a90-7d2b-4c1e-8a44-5b9e2d3f6c02");

export const owner: Actor = { kind: "member", id: ownerId };
export const otherMember: Actor = { kind: "member", id: otherId };
export const anonymous: Actor = { kind: "anonymous" };
