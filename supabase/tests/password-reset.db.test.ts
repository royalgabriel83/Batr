import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type pg from "pg";
import { admin, anonClient, connect } from "./support/db.ts";

// Password reset (unit 08c) relies on these Supabase Auth behaviours;
// the web pages are tested end to end in apps/web/e2e. Links last one
// hour and work once (supabase/config.toml, auth.email.otp_expiry), and
// signing out "others" ends every other session, refresh tokens included.

let db: pg.Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

async function memberWithPassword() {
  const email = `reset-${randomUUID()}@example.test`;
  const password = `pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) throw created.error;
  return { id: created.data.user.id, email, password };
}

async function recoveryTokenHash(email: string): Promise<string> {
  const link = await admin.auth.admin.generateLink({ type: "recovery", email });
  if (link.error) throw link.error;
  return link.data.properties.hashed_token;
}

describe("password reset links", () => {
  it("work once", async () => {
    const member = await memberWithPassword();
    const tokenHash = await recoveryTokenHash(member.email);
    const first = await anonClient().auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    expect(first.error).toBeNull();
    expect(first.data.session).not.toBeNull();
    const again = await anonClient().auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    expect(again.error?.code).toBe("otp_expired");
    expect(again.data.session).toBeNull();
  });

  it("expire after one hour", async () => {
    const member = await memberWithPassword();
    const tokenHash = await recoveryTokenHash(member.email);
    await db.query("update auth.users set recovery_sent_at = now() - interval '61 minutes' where id = $1", [member.id]);
    const result = await anonClient().auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    expect(result.error?.code).toBe("otp_expired");
    expect(result.data.session).toBeNull();
  });

  it("refuse a token that was never issued", async () => {
    const result = await anonClient().auth.verifyOtp({ type: "recovery", token_hash: "0".repeat(56) });
    expect(result.error).not.toBeNull();
    expect(result.data.session).toBeNull();
  });
});

describe("after a new password is set", () => {
  it("signing out others ends every other session, refresh tokens included, and keeps this one", async () => {
    const member = await memberWithPassword();
    const other = anonClient();
    const otherSession = (await other.auth.signInWithPassword(member)).data.session;
    expect(otherSession).not.toBeNull();

    const resetting = anonClient();
    const verified = await resetting.auth.verifyOtp({ type: "recovery", token_hash: await recoveryTokenHash(member.email) });
    expect(verified.error).toBeNull();
    const newPassword = `pw-${randomUUID()}`;
    expect((await resetting.auth.updateUser({ password: newPassword })).error).toBeNull();
    expect((await resetting.auth.signOut({ scope: "others" })).error).toBeNull();

    // The other session's access and refresh tokens no longer work.
    const user = await anonClient().auth.getUser(otherSession?.access_token);
    expect(user.error).not.toBeNull();
    expect(user.data.user).toBeNull();
    const refreshed = await anonClient().auth.refreshSession({ refresh_token: otherSession?.refresh_token ?? "" });
    expect(refreshed.error?.code).toBe("refresh_token_not_found");

    // The resetting session carries on.
    expect((await resetting.auth.getUser()).error).toBeNull();

    // Only the new password signs in.
    expect((await anonClient().auth.signInWithPassword(member)).error?.code).toBe("invalid_credentials");
    expect((await anonClient().auth.signInWithPassword({ email: member.email, password: newPassword })).error).toBeNull();
  });

  it("refuses the current password as the new one", async () => {
    const member = await memberWithPassword();
    const resetting = anonClient();
    await resetting.auth.verifyOtp({ type: "recovery", token_hash: await recoveryTokenHash(member.email) });
    const result = await resetting.auth.updateUser({ password: member.password });
    expect(result.error?.code).toBe("same_password");
  });
});
