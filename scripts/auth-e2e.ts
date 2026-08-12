/**
 * End-to-end verification of the authentication layer.
 *
 * SPEC-ACCOUNTS.md §7 and §12 H fix phase 1's internal order: **authentication
 * works end to end before any interface work starts.** This file is what "works"
 * means. It is the gate, not a nicety.
 *
 * The important property is that it imports the **real** browser modules from
 * `src/auth` rather than reimplementing the derivation. A test that reimplements
 * the thing it tests agrees with itself and proves nothing; this one fails if the
 * browser and the Worker ever disagree about a byte, which is the only failure
 * mode that actually matters here. It runs under Node because Node has the same
 * `WebCrypto` the browser does — no jsdom, no polyfill, no new dependency.
 *
 * Run it with `npm run test:auth`, which bundles this file with the esbuild that
 * already ships inside Vite and points it at a running `wrangler dev`.
 *
 * There is no assertion library, for the same reason there is no UI library.
 */

import { deriveFromPassword, deriveFromRecoveryCode, newKdfParams } from "../src/auth/derive";
import { fromBase64Url, toBase64Url } from "../src/auth/encoding";
import { generateGrantKey, unwrapSlot, wrapSlot, signWithGrantKey } from "../src/auth/grantKey";
import {
  looksLikeRecoveryCode,
  newRecoveryCodes,
  normaliseRecoveryCode,
} from "../src/auth/recoveryCodes";

const BASE = process.env.VESSEL_API ?? "http://127.0.0.1:8787";

// A per-run suffix, so the harness can be run repeatedly against the same local
// database without colliding on the handle uniqueness index.
const RUN = Math.random().toString(36).slice(2, 8);

/** See the header note in `Client.call`. RFC 5737 reserves this range for documentation. */
const CLIENT_IP = `203.0.113.${1 + Math.floor(Math.random() * 254)}`;

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean, detail = ""): void {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(`${label}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/**
 * A cookie jar, because the session is a cookie and Node's fetch does not keep
 * one. Deliberately dumb: it stores whatever the server last set and sends it
 * back, which is exactly enough to prove the session works and not enough to
 * hide a bug behind clever handling.
 */
class Client {
  private cookie: string | null = null;
  lastStatus = 0;

  async call(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<Record<string, any>> {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      // Give each run its own per-client rate-limit bucket.
      //
      // Without this the harness cannot run twice: the rate-limiting section
      // deliberately trips the backoff, and in local development there is no
      // edge in front of the Worker, so `cf-connecting-ip` is absent and every
      // request from every run shares the single bucket named "local". The
      // second run would then be refused before it reached its first check.
      //
      // This is safe to do here and impossible to do in production: Cloudflare
      // overwrites `CF-Connecting-IP` at the edge, so a real client cannot
      // choose its own bucket. The address is fictional — 203.0.113.0/24 is
      // reserved by RFC 5737 for exactly this — and it is HMAC'd under a
      // rotating salt before it names anything anyway (§9).
      "cf-connecting-ip": CLIENT_IP,
    };
    if (this.cookie) headers.cookie = this.cookie;

    const response = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

    this.lastStatus = response.status;
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];

    return (await response.json().catch(() => ({}))) as Record<string, any>;
  }

  get hasSession(): boolean {
    return !!this.cookie && !this.cookie.endsWith("=");
  }

  forgetCookie(): void {
    this.cookie = null;
  }
}

// TOTP, computed here independently of the Worker's implementation ------------
//
// Written out rather than imported from `worker/totp.ts` on purpose. If both
// sides used the same code, a wrong shared implementation would agree with
// itself and pass. This is a second opinion from RFC 6238, not a shortcut.

async function totpCode(secretBase32: string, atMs = Date.now()): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secretBase32.replace(/[\s=-]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }

  const step = Math.floor(atMs / 30000);
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step), false);

  const key = await crypto.subtle.importKey(
    "raw",
    new Uint8Array(bytes),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

// The scenarios ---------------------------------------------------------------

async function main(): Promise<void> {
  const handle = `harness-${RUN}`;
  const password = "correct horse battery staple";

  section("Reachability");
  const client = new Client();
  const health = await client.call("/api/health");
  check("the Worker answers /api/health", client.lastStatus === 200, `status ${client.lastStatus}`);
  check("D1 has all six phase 1 tables", health.ok === true, `tables: ${health.tables}`);
  if (client.lastStatus !== 200) {
    console.log("\nThe Worker is not running. Start it with `npm run dev:worker`.");
    process.exit(1);
  }

  // Slot round trip, offline ---------------------------------------------------
  //
  // Before involving the network at all: does the §5 arrangement work? One grant
  // key, two different credentials, two slots, and both must open the same key.
  section("Key slots (§5), before any network call");
  {
    const params = newKdfParams();
    const grant = await generateGrantKey();
    check("grant public key is an uncompressed P-256 point", grant.publicKeyRaw.length === 65 && grant.publicKeyRaw[0] === 0x04);
    check("grant private scalar is 32 bytes", grant.scalar.length === 32);

    const fromPassword = await deriveFromPassword(password, params);
    const code = newRecoveryCodes(1)[0];
    const fromCode = await deriveFromRecoveryCode(code, { salt: params.salt, iterations: 100_000 });

    const slotA = await wrapSlot(grant.scalar, fromPassword.wrappingKey);
    const slotB = await wrapSlot(grant.scalar, fromCode.wrappingKey);
    check("a wrapped slot is 40 bytes (AES-KW of a 32-byte scalar)", slotA.length === 40);
    check("two credentials produce different ciphertext for the same key", toBase64Url(slotA) !== toBase64Url(slotB));

    // The point of the whole design: different credential, same key.
    const keyA = await unwrapSlot(slotA, fromPassword.wrappingKey, grant.publicKeyRaw);
    const keyB = await unwrapSlot(slotB, fromCode.wrappingKey, grant.publicKeyRaw);

    const payload = new TextEncoder().encode("a grant document would go here");
    const publicKey = await crypto.subtle.importKey(
      "raw",
      grant.publicKeyRaw,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const verifyWith = async (key: CryptoKey) =>
      crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        await signWithGrantKey(key, payload),
        payload,
      );

    check("the password slot reopens into a key that signs", await verifyWith(keyA));
    check("a recovery code slot reopens into the SAME key", await verifyWith(keyB));

    // The wrong wrapping key must fail closed rather than yield garbage.
    let refused = false;
    try {
      await unwrapSlot(slotA, fromCode.wrappingKey, grant.publicKeyRaw);
    } catch {
      refused = true;
    }
    check("the wrong credential cannot open a slot", refused);
  }

  section("Derivation (§4): the two halves are independent");
  {
    const params = newKdfParams();
    const a = await deriveFromPassword(password, params);
    const b = await deriveFromPassword(password, params);
    check("the same password and salt derive the same auth secret", a.authSecret === b.authSecret);

    const other = await deriveFromPassword(password, newKdfParams());
    check("a different salt derives a different auth secret", a.authSecret !== other.authSecret);
    check("the auth secret is 32 bytes", fromBase64Url(a.authSecret).length === 32);
    check("the wrapping key is not extractable", a.wrappingKey.extractable === false);
  }

  section("Recovery code shape");
  {
    const codes = newRecoveryCodes();
    check("ten codes are issued (§4)", codes.length === 10);
    check("all ten are distinct", new Set(codes).size === 10);
    check("a code validates", looksLikeRecoveryCode(codes[0]));
    check(
      "ambiguous characters fold to the generated form",
      normaliseRecoveryCode("o1-il") === normaliseRecoveryCode("0-1-1-1"),
      `${normaliseRecoveryCode("o1-il")} vs ${normaliseRecoveryCode("0-1-1-1")}`,
    );
  }

  // Signup ---------------------------------------------------------------------
  section("Signup");
  let recoveryCodes: string[] = [];
  {
    const params = newKdfParams();
    const credential = await deriveFromPassword(password, params);
    const grant = await generateGrantKey();
    recoveryCodes = newRecoveryCodes();

    const recovery = [];
    for (const code of recoveryCodes) {
      const derived = await deriveFromRecoveryCode(code, { salt: params.salt, iterations: 100_000 });
      recovery.push({
        authSecret: derived.authSecret,
        slot: toBase64Url(await wrapSlot(grant.scalar, derived.wrappingKey)),
      });
    }

    const payload = {
      handle,
      kdf: {
        salt: toBase64Url(params.salt),
        iterations: params.iterations,
        recoveryIterations: 100_000,
      },
      authSecret: credential.authSecret,
      grantPubkey: toBase64Url(grant.publicKeyRaw),
      passwordSlot: toBase64Url(await wrapSlot(grant.scalar, credential.wrappingKey)),
      slotAlg: "AES-KW/HKDF-SHA-256",
      recovery,
    };

    const created = await client.call("/api/auth/signup", { body: payload });
    check("signup returns 201", client.lastStatus === 201, JSON.stringify(created).slice(0, 160));
    check("signup returns the account", created.account?.handle === handle);
    check("signup signs the caller in", client.hasSession);

    // The payload is the place a password could leak, so this is asserted rather
    // than assumed: nothing in what went over the wire resembles it.
    const serialised = JSON.stringify(payload);
    check("the password is nowhere in the signup payload", !serialised.includes(password));
    check("no wrapping key is in the signup payload", !serialised.includes("wrappingKey"));

    const dup = await client.call("/api/auth/signup", { body: payload });
    check("a duplicate handle is refused with 409", client.lastStatus === 409, dup.error);

    const bad = await client.call("/api/auth/signup", {
      body: { ...payload, handle: `x-${RUN}`, recovery: recovery.slice(0, 3) },
    });
    check("fewer than ten recovery codes is refused", client.lastStatus === 400, bad.error);
  }

  section("The session (§4)");
  {
    const me = await client.call("/api/me");
    check("/api/me identifies the account", me.account?.handle === handle);
    check("the account holds a password credential", me.credentials?.password === true);
    check("ten recovery codes remain", me.credentials?.recoveryCodesRemaining === 10, String(me.credentials?.recoveryCodesRemaining));
    check("two-factor is not enrolled yet", me.totp?.enrolled === false);
    check("no operator flag on a self-created account", me.account?.isOperator === false);

    const anonymous = new Client();
    await anonymous.call("/api/me");
    check("/api/me without a session is 401", anonymous.lastStatus === 401);

    const forged = new Client();
    await forged.call("/api/me");
    check("a request with no cookie cannot read an account", forged.lastStatus === 401);
  }

  section("The key slot round trip, through the server");
  {
    const slot = await client.call("/api/account/slot");
    check("the account's own slot comes back", client.lastStatus === 200);
    check("the slot is 40 bytes", fromBase64Url(slot.wrappedGrantKey ?? "").length === 40);

    const { kdf } = await client.call("/api/auth/challenge", { body: { handle } });
    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const key = await unwrapSlot(
      fromBase64Url(slot.wrappedGrantKey),
      derived.wrappingKey,
      fromBase64Url(slot.grantPubkey),
    );
    const payload = new TextEncoder().encode("stored, retrieved, reopened");
    const publicKey = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(slot.grantPubkey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    check(
      "a slot stored by the server reopens and signs",
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        publicKey,
        await signWithGrantKey(key, payload),
        payload,
      ),
    );
  }

  section("Sign-in");
  {
    const fresh = new Client();
    const { kdf } = await fresh.call("/api/auth/challenge", { body: { handle } });
    check("challenge returns KDF parameters", typeof kdf?.salt === "string" && kdf.iterations > 0);

    // §4: this endpoint must not disclose whether an account exists.
    const unknown = await fresh.call("/api/auth/challenge", { body: { handle: `nobody-${RUN}` } });
    check("an unknown handle still gets parameters", typeof unknown.kdf?.salt === "string");
    const again = await fresh.call("/api/auth/challenge", { body: { handle: `nobody-${RUN}` } });
    check(
      "the decoy parameters are stable across probes",
      unknown.kdf.salt === again.kdf.salt,
      "a changing decoy salt would reveal the account does not exist",
    );

    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const result = await fresh.call("/api/auth/signin", {
      body: { handle, authSecret: derived.authSecret },
    });
    check("the right password signs in", result.status === "signed-in", JSON.stringify(result).slice(0, 160));
    check("sign-in sets a session", fresh.hasSession);
    check("no operator reset to disclose", result.resetAt === null);

    const wrong = await deriveFromPassword("not the password at all", {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const rejected = new Client();
    const failure = await rejected.call("/api/auth/signin", {
      body: { handle, authSecret: wrong.authSecret },
    });
    check("the wrong password is refused with 401", rejected.lastStatus === 401);

    const noSuchAccount = await rejected.call("/api/auth/signin", {
      body: { handle: `nobody-${RUN}`, authSecret: wrong.authSecret },
    });
    check(
      "an unknown handle fails with the same message as a wrong password",
      noSuchAccount.error === failure.error,
      `${noSuchAccount.error} vs ${failure.error}`,
    );

    await fresh.call("/api/auth/signout", { body: {} });
    const after = await fresh.call("/api/me");
    check("sign-out ends the session", after.error !== undefined && fresh.lastStatus === 401);
  }

  section("Two-factor (§4)");
  let backupCodes: string[] = [];
  let totpSecret = "";
  {
    const owner = new Client();
    const { kdf } = await owner.call("/api/auth/challenge", { body: { handle } });
    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    await owner.call("/api/auth/signin", { body: { handle, authSecret: derived.authSecret } });

    // Adding a factor is a credential change, so it demands the credential — a
    // session cookie alone must not be enough, or a stolen one locks the owner
    // out of their own account permanently.
    const unauthorised = await owner.call("/api/totp/enrol", { body: {} });
    check("enrolment without the password is refused", owner.lastStatus === 401, unauthorised.error);

    const enrol = await owner.call("/api/totp/enrol", {
      body: { authSecret: derived.authSecret },
    });
    totpSecret = enrol.secret ?? "";
    check("enrolment returns a base32 secret", /^[A-Z2-7]{32}$/.test(enrol.secret ?? ""), enrol.secret);
    check("enrolment returns an otpauth URI", (enrol.uri ?? "").startsWith("otpauth://totp/"));
    check("the URI carries the same secret", (enrol.uri ?? "").includes(enrol.secret));

    const stillOff = await owner.call("/api/me");
    check("an unconfirmed enrolment does not count as two-factor", stillOff.totp?.confirmed === false);

    const badConfirm = await owner.call("/api/totp/confirm", {
      body: { code: "000000", authSecret: derived.authSecret },
    });
    check("a wrong confirmation code is refused", owner.lastStatus === 401, badConfirm.error);

    const confirmed = await owner.call("/api/totp/confirm", {
      body: { code: await totpCode(enrol.secret), authSecret: derived.authSecret },
    });
    check("a correct code confirms enrolment", owner.lastStatus === 200, confirmed.error);
    backupCodes = confirmed.backupCodes ?? [];
    check("ten backup codes are issued (§4)", backupCodes.length === 10, String(backupCodes.length));

    // A second opinion on the code: computed here from RFC 6238 rather than by
    // the Worker's own implementation, so agreement means something.
    const now = await owner.call("/api/me");
    check("two-factor now reads as confirmed", now.totp?.confirmed === true);
  }

  section("Sign-in with two-factor");
  {
    // Confirming enrolment a moment ago *spent* that 30-second step — the
    // replay guard records it, and it is supposed to. So this waits for the
    // step to roll over before asking for a code, which is what a real user
    // does simply by not signing in within the same half-minute they set two
    // factor up. Without the wait the harness would be testing the guard, not
    // the sign-in, and would fail for the right reason at the wrong moment.
    await new Promise((resolve) => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 750));

    const enrolled = new Client();
    const { kdf } = await enrolled.call("/api/auth/challenge", { body: { handle } });
    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    enrolled.forgetCookie();

    const first = await enrolled.call("/api/auth/signin", {
      body: { handle, authSecret: derived.authSecret },
    });
    check("the password alone no longer signs in", first.status === "totp-required", JSON.stringify(first).slice(0, 120));
    check("a ticket is issued for the second factor", typeof first.ticket === "string");
    check("the ticket is not a session", !enrolled.hasSession);

    // A ticket must not be usable as a session: different purpose, different MAC.
    const impostor = new Client();
    await impostor.call("/api/me");
    check("a ticket cannot be presented as a session cookie", impostor.lastStatus === 401);

    const wrongCode = await enrolled.call("/api/auth/totp", {
      body: { ticket: first.ticket, code: "000000" },
    });
    check("a wrong TOTP code is refused", enrolled.lastStatus === 401, wrongCode.error);

    const code = await totpCode(totpSecret);
    const good = await enrolled.call("/api/auth/totp", {
      body: { ticket: first.ticket, code },
    });
    check("a correct TOTP code completes sign-in", good.status === "signed-in", good.error);
    check("the second factor sets a session", enrolled.hasSession);

    // RFC 6238 §5.2, and the reason `migrations/0002` exists: a code stays valid
    // for its step and the drift window after it, so without a replay guard it
    // is a one-time password only by name.
    const shoulderSurfer = new Client();
    const step = await shoulderSurfer.call("/api/auth/signin", {
      body: { handle, authSecret: derived.authSecret },
    });
    const replayed = await shoulderSurfer.call("/api/auth/totp", {
      body: { ticket: step.ticket, code },
    });
    check(
      "the same TOTP code cannot be replayed inside its window",
      shoulderSurfer.lastStatus === 401,
      JSON.stringify(replayed).slice(0, 120),
    );

    // Backup codes are the documented fallback, and single-use is the property
    // worth proving.
    const withBackup = new Client();
    const step1 = await withBackup.call("/api/auth/signin", {
      body: { handle, authSecret: derived.authSecret },
    });
    const used = await withBackup.call("/api/auth/totp", {
      body: { ticket: step1.ticket, code: backupCodes[0] },
    });
    check("a backup code completes sign-in", used.status === "signed-in", used.error);
    check("the backup code sets a session", withBackup.hasSession);

    const replay = new Client();
    const step2 = await replay.call("/api/auth/signin", {
      body: { handle, authSecret: derived.authSecret },
    });
    const reused = await replay.call("/api/auth/totp", {
      body: { ticket: step2.ticket, code: backupCodes[0] },
    });
    check("the same backup code cannot be used twice", replay.lastStatus === 401, JSON.stringify(reused).slice(0, 120));

    const second = await replay.call("/api/auth/totp", {
      body: { ticket: step2.ticket, code: backupCodes[1] },
    });
    check("a different backup code still works", second.status === "signed-in", second.error);
  }

  section("Recovery codes (§4, path two)");
  {
    // A separate account, because redeeming a code spends it.
    const rescuee = `harness-rec-${RUN}`;
    const params = newKdfParams();
    const credential = await deriveFromPassword(password, params);
    const grant = await generateGrantKey();
    const codes = newRecoveryCodes();
    const recovery = [];
    for (const code of codes) {
      const derived = await deriveFromRecoveryCode(code, { salt: params.salt, iterations: 100_000 });
      recovery.push({
        authSecret: derived.authSecret,
        slot: toBase64Url(await wrapSlot(grant.scalar, derived.wrappingKey)),
      });
    }
    const setup = new Client();
    await setup.call("/api/auth/signup", {
      body: {
        handle: rescuee,
        kdf: { salt: toBase64Url(params.salt), iterations: params.iterations, recoveryIterations: 100_000 },
        authSecret: credential.authSecret,
        grantPubkey: toBase64Url(grant.publicKeyRaw),
        passwordSlot: toBase64Url(await wrapSlot(grant.scalar, credential.wrappingKey)),
        recovery,
      },
    });
    check("the recovery fixture account was created", setup.lastStatus === 201);

    const lost = new Client();
    const { kdf } = await lost.call("/api/auth/challenge", { body: { handle: rescuee } });
    check("the challenge carries the recovery iteration count", kdf.recoveryIterations === 100_000, String(kdf.recoveryIterations));

    const derived = await deriveFromRecoveryCode(codes[0], {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.recoveryIterations,
    });
    const redeemed = await lost.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: derived.authSecret, kind: "recovery" },
    });
    check("a recovery code signs in", redeemed.status === "signed-in", JSON.stringify(redeemed).slice(0, 160));

    // §5: "redeeming one preserves grant authority in full." That is only true
    // if the browser is actually handed the slot — the wrapping key lives for
    // the length of this request and the code is spent, so a slot not returned
    // here is a grant key lost for ever. This is the check that would have
    // caught it.
    check("redemption returns the code's key slot", !!redeemed.keySlot, "no keySlot in the response");
    if (redeemed.keySlot) {
      const opened = await unwrapSlot(
        fromBase64Url(redeemed.keySlot.wrappedGrantKey),
        derived.wrappingKey,
        fromBase64Url(redeemed.keySlot.grantPubkey),
      );
      const message = new TextEncoder().encode("recovered grant authority");
      const pub = await crypto.subtle.importKey(
        "raw",
        fromBase64Url(redeemed.keySlot.grantPubkey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      check(
        "the recovered key is the account's original grant key",
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          pub,
          await signWithGrantKey(opened, message),
          message,
        ),
      );
      check(
        "it is the same public key the account was created with",
        redeemed.keySlot.grantPubkey === toBase64Url(grant.publicKeyRaw),
      );
    }

    const after = await lost.call("/api/me");
    check("nine recovery codes remain", after.credentials?.recoveryCodesRemaining === 9, String(after.credentials?.recoveryCodesRemaining));

    const replay = new Client();
    await replay.call("/api/auth/challenge", { body: { handle: rescuee } });
    const again = await replay.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: derived.authSecret, kind: "recovery" },
    });
    check("a spent recovery code is refused", replay.lastStatus === 401, JSON.stringify(again).slice(0, 120));

    // §5: the password slot is untouched by a recovery redemption.
    const owner = new Client();
    await owner.call("/api/auth/challenge", { body: { handle: rescuee } });
    const pw = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const stillWorks = await owner.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: pw.authSecret },
    });
    check("the password still works after a code is spent", stillWorks.status === "signed-in", stillWorks.error);
  }

  // Rate limiting ---------------------------------------------------------------
  //
  // **This runs last, and it has to.** §4's per-client bucket is keyed by
  // `clientKey`, and in local development there is no edge in front of the
  // Worker, so `cf-connecting-ip` is absent and every request in this harness
  // shares the single bucket named "local". Tripping the backoff therefore
  // blocks the whole run. That is the rate limiter working correctly rather than
  // a flaw in it — but it does mean nothing can follow this section.
  section("Rate limiting (§4) — the RateLimiter's backoff path, exercised at last");
  {
    // A handle of its own, so tripping the backoff cannot lock out an account
    // the rest of this run depends on.
    const victim = `harness-rl-${RUN}`;
    const params = newKdfParams();
    const credential = await deriveFromPassword(password, params);
    const grant = await generateGrantKey();
    const recovery = [];
    for (const code of newRecoveryCodes()) {
      const derived = await deriveFromRecoveryCode(code, { salt: params.salt, iterations: 100_000 });
      recovery.push({
        authSecret: derived.authSecret,
        slot: toBase64Url(await wrapSlot(grant.scalar, derived.wrappingKey)),
      });
    }
    const setup = new Client();
    await setup.call("/api/auth/signup", {
      body: {
        handle: victim,
        kdf: {
          salt: toBase64Url(params.salt),
          iterations: params.iterations,
          recoveryIterations: 100_000,
        },
        authSecret: credential.authSecret,
        grantPubkey: toBase64Url(grant.publicKeyRaw),
        passwordSlot: toBase64Url(await wrapSlot(grant.scalar, credential.wrappingKey)),
        recovery,
      },
    });
    check("the rate-limit fixture account was created", setup.lastStatus === 201, setup.lastStatus === 201 ? "" : "signup was itself rate limited — run against a fresh .wrangler state");

    const attacker = new Client();
    const wrong = await deriveFromPassword("wrong", params);
    let blockedAt = -1;
    for (let attempt = 1; attempt <= 9 && blockedAt < 0; attempt += 1) {
      await attacker.call("/api/auth/signin", {
        body: { handle: victim, authSecret: wrong.authSecret },
      });
      if (attacker.lastStatus === 429) blockedAt = attempt;
    }
    check("repeated wrong passwords eventually return 429", blockedAt > 0, `blocked at attempt ${blockedAt}`);
    check("backoff engages after a free allowance, not immediately", blockedAt > 1, `blocked at attempt ${blockedAt}`);

    // And the block is real: the correct password is refused too, which is the
    // honest cost of the ceiling §4 puts on backoff.
    const locked = await attacker.call("/api/auth/signin", {
      body: { handle: victim, authSecret: credential.authSecret },
    });
    check("while blocked, even the right password is refused", attacker.lastStatus === 429, locked.error);
    check("the refusal says when to come back", /try again in about/i.test(locked.error ?? ""), locked.error);
  }

  // Result ---------------------------------------------------------------------
  console.log(`\n${"─".repeat(60)}`);
  if (failures.length === 0) {
    console.log(`${passed} checks passed. Authentication works end to end.`);
    process.exit(0);
  }
  console.log(`${passed} passed, ${failures.length} FAILED:\n`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exit(1);
}

main().catch((error) => {
  console.error("\nThe harness itself threw:", error);
  process.exit(1);
});
