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

import { exec } from "node:child_process";
import { promisify } from "node:util";

import { api, ApiError, uploadPart } from "../src/auth/api";
import { deriveFromPassword, deriveFromRecoveryCode, newKdfParams } from "../src/auth/derive";
import { fromBase64Url, toBase64Url } from "../src/auth/encoding";
import {
  beginTotpEnrolment,
  changePassword as changePasswordFlow,
  openGrantKey,
  signIn as signInFlow,
  signInWithRecoveryCode,
  signUp as signUpFlow,
} from "../src/auth/flows";
import {
  SLOT_ALG,
  generateGrantKey,
  rewrapSlot,
  unwrapSlot,
  wrapSlot,
  signWithGrantKey,
} from "../src/auth/grantKey";
import {
  addPasskey,
  prfWrappingKey,
  removePasskey,
  signInWithPasskey,
} from "../src/auth/passkeys";
import {
  looksLikeRecoveryCode,
  newRecoveryCodes,
  normaliseRecoveryCode,
} from "../src/auth/recoveryCodes";
import {
  fingerprintFromSdp,
  generateMachineKeypair,
  normalizeFingerprint,
  signFingerprint,
  verifyFingerprint,
} from "../src/share/handshake";
import { isValidPath } from "../src/share/paths";
import { decodeShareCode, encodeShareCode } from "../src/config/shareCode";
import { DEFAULT_CONFIG } from "../src/config/types";
import { FX, LAYOUTS, PICKABLE_FX, TYPESETS } from "../src/data/catalog";
import { ORNAMENTS } from "../src/data/ornaments";
import { PALETTES } from "../src/data/palettes";
import { PRESETS } from "../src/data/presets";
import { SoftwareAuthenticator } from "./webauthn-sim";

// `ws`, marked external in the esbuild step and resolved from node_modules at
// run time. It is already present as a transitive dependency of wrangler, and
// the runtime constraint ("no third-party runtime libraries") is about the
// site, not about this Node harness — Node's own WebSocket cannot attach a
// cookie header, and the signalling socket authenticates by cookie.
import WebSocket from "ws";

const BASE = process.env.VESSEL_API ?? "http://127.0.0.1:8787";

// A per-run suffix, so the harness can be run repeatedly against the same local
// database without colliding on the handle uniqueness index.
const RUN = Math.random().toString(36).slice(2, 8);

/** See the header note in `Client.call`. RFC 5737 reserves this range for documentation. */
const CLIENT_IP = `203.0.113.${1 + Math.floor(Math.random() * 254)}`;

// The fetch shim: what lets this file import `flows.ts` and `api.ts` for real -
//
// The browser modules call `fetch("/api/…")` with relative paths and lean on the
// browser's cookie jar. Node has neither, so the harness supplies both — and
// ONLY for relative URLs. The raw `Client` below builds absolute URLs and passes
// through untouched, so its cookie isolation is unaffected. This wrapper is the
// whole difference between driving the real modules and re-implementing them,
// and re-implementation was exactly the coverage gap: a copy cannot fail when
// browser and Worker drift apart.
class BrowserSession {
  cookie: string | null = null;
}

let browser = new BrowserSession();

/** Point the flows/api modules at a fresh (or saved) cookie jar. */
function asBrowser(session: BrowserSession): BrowserSession {
  browser = session;
  return session;
}

const nodeFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url =
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("/")) return nodeFetch(input as RequestInfo, init);

  const headers = new Headers(init?.headers ?? {});
  // Same per-run rate-limit bucket as `Client.call` — see the note there.
  headers.set("cf-connecting-ip", CLIENT_IP);
  if (browser.cookie) headers.set("cookie", browser.cookie);

  const response = await nodeFetch(`${BASE}${url}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) browser.cookie = setCookie.split(";")[0];
  return response;
}) as typeof fetch;

/**
 * Run a call that is SUPPOSED to fail, and hand back how it failed. An
 * `ApiError` carries the Worker's status; a local (pre-network) refusal from
 * `flows.ts` comes back as status -1, which is itself worth asserting — it
 * proves the check fired before anything went over the wire.
 */
async function refusal(
  run: () => Promise<unknown>,
): Promise<{ status: number; message: string } | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof ApiError) return { status: error.status, message: error.message };
    return { status: -1, message: (error as Error).message };
  }
}

/**
 * The password proof `/api/account/slot` now demands (TODO 15): derive the
 * account's auth secret the way the browser does, via the challenge route.
 */
async function slotProof(handle: string, password: string): Promise<string> {
  const { kdf } = await api.challenge(handle);
  const derived = await deriveFromPassword(password, {
    salt: fromBase64Url(kdf.salt),
    iterations: kdf.iterations,
  });
  return derived.authSecret;
}

/**
 * Run one statement against the local D1 the Worker under test is using.
 *
 * The admin section needs an operator, `is_operator` is not settable through any
 * API on purpose, and `docs/BREAK-GLASS.md` step 1 is exactly this statement
 * against production. Concurrent access alongside `wrangler dev` is fine —
 * SQLite arbitrates — and the Worker reads the account row per request, so a
 * flip is visible immediately.
 *
 * Async rather than `execSync`, and that is load-bearing: wrangler takes several
 * seconds, and a blocked event loop stops undici from noticing the dev server
 * closing its idle keep-alive socket — the next fetch then dies on the stale
 * connection with a "could not reach the server" that looks like the Worker
 * crashed. It did not; the harness just went deaf for five seconds.
 */
const execAsync = promisify(exec);

async function d1(sql: string): Promise<void> {
  if (sql.includes('"')) throw new Error("keep double quotes out of harness SQL");
  await execAsync(`npx wrangler d1 execute vessel --local --command "${sql}"`);
}

/**
 * Wait for the next 30-second TOTP step. Each successful second factor spends
 * its step (the replay guard — `migrations/0002`), so a scenario that needs a
 * fresh code after one has just been used must sit out the remainder.
 */
function untilNextTotpStep(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30_000 - (Date.now() % 30_000) + 750));
}

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

  /**
   * Almost every client shares the run's bucket. The exception is the signup
   * quota check at the end, which needs an address of its own to trip signup
   * backoff without blocking the rest of this section — same RFC 5737 trick,
   * different documentation range.
   */
  constructor(private ip: string = CLIENT_IP) {}

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
      "cf-connecting-ip": this.ip,
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

// Signalling helpers -----------------------------------------------------------
//
// The signalling socket authenticates by session cookie, which Node's built-in
// WebSocket cannot send — hence `ws`, which takes arbitrary headers. The queue
// turns an event stream into awaitable frames so the scenarios read in order;
// a socket close is delivered into the same queue as `{ type: "__closed" }` so
// a test can await it like any other frame, and a timeout comes back as
// `{ type: "__timeout" }` rather than a rejection so a missing frame fails a
// check instead of crashing the run.

const WS_BASE = BASE.replace(/^http/, "ws");

class SignalSocket {
  private queue: Record<string, any>[] = [];
  private waiters: ((frame: Record<string, any>) => void)[] = [];

  constructor(readonly ws: WebSocket) {
    ws.on("message", (data) => {
      let frame: Record<string, any>;
      try {
        frame = JSON.parse(String(data));
      } catch {
        frame = { type: "__unparseable", raw: String(data).slice(0, 80) };
      }
      this.deliver(frame);
    });
    ws.on("close", (code) => this.deliver({ type: "__closed", code }));
  }

  private deliver(frame: Record<string, any>): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter(frame);
    else this.queue.push(frame);
  }

  next(timeoutMs = 5000): Promise<Record<string, any>> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        const index = this.waiters.indexOf(waiter);
        if (index >= 0) this.waiters.splice(index, 1);
        resolve({ type: "__timeout" });
      }, timeoutMs);
      const waiter = (frame: Record<string, any>) => {
        clearTimeout(timer);
        resolve(frame);
      };
      this.waiters.push(waiter);
    });
  }

  send(frame: unknown): void {
    this.ws.send(typeof frame === "string" ? frame : JSON.stringify(frame));
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Already closed is fine.
    }
  }
}

/** Open a signalling socket, or reject with the refusal's HTTP status. */
function wsOpen(machineId: string, role: string, cookie: string | null): Promise<SignalSocket> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { "cf-connecting-ip": CLIENT_IP };
    if (cookie) headers.cookie = cookie;
    const ws = new WebSocket(`${WS_BASE}/api/signal/${machineId}?role=${role}`, { headers });
    ws.on("open", () => resolve(new SignalSocket(ws)));
    ws.on("unexpected-response", (_req, res) => reject(new Error(`status ${res.statusCode}`)));
    ws.on("error", (error) => reject(error));
  });
}

/** The HTTP status a refused upgrade came back with, or -1 if it opened. */
async function wsRefusedStatus(
  machineId: string,
  role: string,
  cookie: string | null,
): Promise<number> {
  try {
    const socket = await wsOpen(machineId, role, cookie);
    socket.close();
    return -1;
  } catch (error) {
    const match = /status (\d+)/.exec((error as Error).message);
    return match ? Number(match[1]) : -2;
  }
}

/** A plausible SDP with a random DTLS fingerprint, for driving the ceremony. */
function fakeSdp(): { sdp: string; fingerprint: string } {
  const hex = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(":");
  const fingerprint = `sha-256 ${hex}`;
  const sdp = `v=0\r\no=- 0 0 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\na=fingerprint:${fingerprint}\r\na=setup:actpass\r\n`;
  return { sdp, fingerprint };
}

// The scenarios ---------------------------------------------------------------

async function main(): Promise<void> {
  const handle = `harness-${RUN}`;
  const password = "correct horse battery staple";

  section("Reachability");
  const client = new Client();
  const health = await client.call("/api/health");
  check("the Worker answers /api/health", client.lastStatus === 200, `status ${client.lastStatus}`);
  check("D1 has all eight tables — phase 1 plus machines and drives", health.ok === true, `tables: ${health.tables}`);
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
    // The gate first (TODO 15): a session cookie alone must not fetch the
    // ciphertext an offline password grind would turn into grant authority.
    const sessionOnly = await client.call("/api/account/slot", { body: {} });
    check("the session alone does not fetch the slot", client.lastStatus === 401, sessionOnly.error);

    const { kdf } = await client.call("/api/auth/challenge", { body: { handle } });
    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const slot = await client.call("/api/account/slot", {
      body: { authSecret: derived.authSecret },
    });
    check("the account's own slot comes back", client.lastStatus === 200);
    check("the slot is 40 bytes", fromBase64Url(slot.wrappedGrantKey ?? "").length === 40);
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
    await untilNextTotpStep();

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
        slotAlg: SLOT_ALG,
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

  section("Setting a password after recovery (§4, the other half)");
  {
    // Recovery is only worth having if it ends with the account openable again.
    // Everything above proves a code signs in; this proves the person who used
    // one can get a password back — and that the grant key survives it.
    const rescuee = `harness-set-${RUN}`;
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
        slotAlg: SLOT_ALG,
        recovery,
      },
    });
    check("the set-password fixture account was created", setup.lastStatus === 201);

    const lost = new Client();
    const { kdf } = await lost.call("/api/auth/challenge", { body: { handle: rescuee } });
    const derived = await deriveFromRecoveryCode(codes[0], {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.recoveryIterations,
    });
    const redeemed = await lost.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: derived.authSecret, kind: "recovery" },
    });
    check(
      "redemption hands back a set-password ticket",
      typeof redeemed.setPasswordTicket === "string" && redeemed.setPasswordTicket.length > 0,
      JSON.stringify(redeemed).slice(0, 160),
    );

    // **The ticket is the whole security argument.** A session records who you
    // are, never how you proved it, so if a password sign-in also minted one —
    // or if the endpoint accepted a session alone — a stolen cookie would become
    // permanent account takeover rather than a bounded thirty-minute exposure.
    const owner2 = new Client();
    await owner2.call("/api/auth/challenge", { body: { handle: rescuee } });
    const pwIn = await owner2.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: credential.authSecret },
    });
    check(
      "a password sign-in gets no set-password ticket",
      pwIn.status === "signed-in" && pwIn.setPasswordTicket === undefined,
      JSON.stringify(pwIn).slice(0, 140),
    );
    const noTicket = await owner2.call("/api/account/set-password", {
      body: {
        authSecret: credential.authSecret,
        iterations: 600_000,
        passwordSlot: toBase64Url(await wrapSlot(grant.scalar, credential.wrappingKey)),
        slotAlg: SLOT_ALG,
      },
    });
    check(
      "a live session alone cannot set a password",
      owner2.lastStatus === 401,
      JSON.stringify(noTicket).slice(0, 140),
    );

    // **Re-wrap, never regenerate.** The slot goes ciphertext-to-ciphertext, so
    // the grant key is the same key afterwards — which is what the signature
    // check below actually proves.
    const nextPassword = `${password}-recovered`;
    const next = await deriveFromPassword(nextPassword, {
      salt: fromBase64Url(kdf.salt),
      iterations: 600_000,
    });
    const rewrapped = await rewrapSlot(
      fromBase64Url(redeemed.keySlot.wrappedGrantKey),
      derived.wrappingKey,
      next.wrappingKey,
    );
    const body = {
      ticket: redeemed.setPasswordTicket,
      authSecret: next.authSecret,
      iterations: 600_000,
      passwordSlot: toBase64Url(rewrapped),
      slotAlg: SLOT_ALG,
    };
    const set = await lost.call("/api/account/set-password", { body });
    check("the new password is accepted", set.status === "set", JSON.stringify(set).slice(0, 160));

    const reuse = await lost.call("/api/account/set-password", { body });
    check("the ticket cannot be replayed", lost.lastStatus === 401, JSON.stringify(reuse).slice(0, 140));

    const fresh = new Client();
    const after = await fresh.call("/api/auth/challenge", { body: { handle: rescuee } });
    const reDerived = await deriveFromPassword(nextPassword, {
      salt: fromBase64Url(after.kdf.salt),
      iterations: after.kdf.iterations,
    });
    const signedIn = await fresh.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: reDerived.authSecret },
    });
    check("the new password signs in", signedIn.status === "signed-in", signedIn.error);

    const slot = await fresh.call("/api/account/slot", {
      body: { authSecret: reDerived.authSecret },
    });
    const reopened = await unwrapSlot(
      fromBase64Url(slot.wrappedGrantKey),
      reDerived.wrappingKey,
      fromBase64Url(slot.grantPubkey),
    );
    const message = new TextEncoder().encode("still the same grant key");
    const pub = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(slot.grantPubkey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    check(
      "the new password opens the ORIGINAL grant key",
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        await signWithGrantKey(reopened, message),
        message,
      ),
    );
    check(
      "the grant public key never moved",
      slot.grantPubkey === toBase64Url(grant.publicKeyRaw),
    );

    const stale = new Client();
    await stale.call("/api/auth/challenge", { body: { handle: rescuee } });
    const refused = await stale.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: credential.authSecret },
    });
    check("the old password no longer works", stale.lastStatus === 401, JSON.stringify(refused).slice(0, 120));

    // **The salt-reuse check, and the reason it exists.** The remaining nine
    // codes were derived against the password's salt at signup. Rolling a fresh
    // salt when setting the new password would leave all nine deriving against a
    // salt nothing uses any more — ten codes silently dead, discovered by the
    // one person who needed them. This is that check.
    const ninth = await deriveFromRecoveryCode(codes[9], {
      salt: fromBase64Url(after.kdf.salt),
      iterations: after.kdf.recoveryIterations,
    });
    const survivor = new Client();
    await survivor.call("/api/auth/challenge", { body: { handle: rescuee } });
    const another = await survivor.call("/api/auth/signin", {
      body: { handle: rescuee, authSecret: ninth.authSecret, kind: "recovery" },
    });
    check(
      "the remaining recovery codes survive the new password",
      another.status === "signed-in",
      JSON.stringify(another).slice(0, 140),
    );
  }

  // The real browser modules -----------------------------------------------------
  //
  // Everything above drives the Worker with raw fetch, which proves the Worker
  // but not the code the browser actually runs. These three sections import
  // `flows.ts` and `api.ts` and drive them end to end through the shimmed
  // fetch, so a byte-level disagreement between `src/auth` and `worker/` fails
  // here rather than in a user's browser.
  section("flows.ts + api.ts, driven for real");
  const flowsHandle = `harness-flow-${RUN}`;
  const secondPassword = `${password}, changed`;
  const finalPassword = `${password}, recovered`;
  let flowsCodes: string[] = [];
  let flowsTotpSecret = "";
  let grantPubkeyAtSignup = "";
  {
    asBrowser(new BrowserSession());

    const tooShort = await refusal(() => signUpFlow(flowsHandle, "short"));
    check(
      "signUp refuses a short password before any network call",
      tooShort?.status === -1,
      tooShort?.message,
    );

    const created = await signUpFlow(flowsHandle, password);
    check("signUp creates the account", created.account.handle === flowsHandle);
    check("signUp hands back ten recovery codes", created.recoveryCodes.length === 10);
    flowsCodes = created.recoveryCodes;

    const me = await api.me();
    check("signUp leaves the browser signed in", me.account.handle === flowsHandle);

    await api.signout();
    const signedOut = await refusal(() => api.me());
    check("api.signout ends the session", signedOut?.status === 401, signedOut?.message);

    const wrong = await refusal(() => signInFlow(flowsHandle, "definitely not the password"));
    check("signIn with the wrong password surfaces the Worker's 401", wrong?.status === 401, wrong?.message);

    const good = await signInFlow(flowsHandle, password);
    check("signIn signs in", good.status === "signed-in");

    // TODO 15's gate: the slot is ciphertext a password grind turns into grant
    // authority, so the session alone must not fetch it.
    const misproved = await refusal(async () =>
      api.keySlot(await slotProof(flowsHandle, "definitely not the password")),
    );
    check(
      "the key slot is refused without the password proof",
      misproved?.status === 401,
      misproved?.message,
    );
    grantPubkeyAtSignup = (await api.keySlot(await slotProof(flowsHandle, password))).grantPubkey;

    // Change-password, previously an untested endpoint. The flow re-wraps the
    // slot ciphertext-to-ciphertext, so the proof is that the *new* password
    // opens the *original* grant key — asserted at the very end of the third
    // section, after recovery and set-password have also had their turn.
    const samePassword = await refusal(() => changePasswordFlow(password, password));
    check("changePassword refuses the unchanged password locally", samePassword?.status === -1);

    await changePasswordFlow(password, secondPassword);
    asBrowser(new BrowserSession());
    const stale = await refusal(() => signInFlow(flowsHandle, password));
    check("the old password no longer signs in", stale?.status === 401, stale?.message);
    const changed = await signInFlow(flowsHandle, secondPassword);
    check("the changed password signs in", changed.status === "signed-in");

    // §3's single-operation unwrap. The slot endpoint now checks the password
    // (TODO 15); the TOTP half stays browser-side format checking until the
    // phase-3 grant-submission endpoint exists — so any six digits pass here,
    // deliberately.
    const opened = await openGrantKey(secondPassword, "000000");
    const message = new TextEncoder().encode("one signature, then the key dies");
    const pub = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(grantPubkeyAtSignup),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    check(
      "openGrantKey opens the account's grant key after a password change",
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        await signWithGrantKey(opened, message),
        message,
      ),
    );

    // TOTP enrolment through the flow the enrolment screen calls. The derived
    // auth secret lives in the flow's closure between enrol and confirm — the
    // password is asked for once, which is the shape the screen depends on.
    const noSecret = await refusal(() => api.totpEnrol({}));
    check("api.totpEnrol without the password is refused", noSecret?.status === 401, noSecret?.message);

    const wrongEnrolPassword = await refusal(() => beginTotpEnrolment("not the password"));
    check(
      "beginTotpEnrolment demands the real password",
      wrongEnrolPassword?.status === 401,
      wrongEnrolPassword?.message,
    );

    const enrolment = await beginTotpEnrolment(secondPassword);
    check(
      "beginTotpEnrolment returns the secret and the otpauth URI",
      /^[A-Z2-7]{32}$/.test(enrolment.secret) &&
        enrolment.uri.startsWith("otpauth://totp/") &&
        enrolment.uri.includes(enrolment.secret),
    );
    flowsTotpSecret = enrolment.secret;

    const wrongConfirm = await refusal(() => enrolment.confirm("000000"));
    check("a wrong confirmation code is refused through the flow", wrongConfirm?.status === 401, wrongConfirm?.message);

    const backupCodes = await enrolment.confirm(await totpCode(enrolment.secret));
    check("confirm issues ten backup codes", backupCodes.length === 10, String(backupCodes.length));
  }

  section("Recovery with two-factor, through flows.ts — the stranded-key path");
  {
    // This is the path that carried the stranded-wrapping-key bug: on an
    // account WITH a second factor, the key slot arrives only after TOTP, and
    // an earlier version of `signInWithRecoveryCode` had already let the
    // wrapping key go out of scope by then. Neither recovery fixture above has
    // TOTP enrolled, so until this section the regression had zero coverage.
    await untilNextTotpStep();
    asBrowser(new BrowserSession());

    const recovery = await signInWithRecoveryCode(flowsHandle, flowsCodes[0]);
    check(
      "a recovery sign-in on a 2FA account asks for the second factor",
      recovery.result.status === "totp-required",
      JSON.stringify(recovery.result).slice(0, 120),
    );
    check("the key slot is not claimed before the second factor", recovery.canSetPassword() === false);

    const early = await refusal(() => recovery.setPassword(finalPassword));
    check("setPassword before the second factor is refused locally", early?.status === -1);

    const wrongCode = await refusal(() => recovery.completeSecondFactor("000000"));
    check("a wrong second factor is refused", wrongCode?.status === 401, wrongCode?.message);

    const finished = await recovery.completeSecondFactor(await totpCode(flowsTotpSecret));
    check("the correct code completes the recovery sign-in", finished.status === "signed-in");
    check(
      "the wrapping key survived the second factor — slot and ticket in hand",
      recovery.canSetPassword() === true,
      "the stranded-wrapping-key bug is back",
    );

    await recovery.setPassword(finalPassword);
    const me = await api.me();
    check("nine recovery codes remain", me.credentials.recoveryCodesRemaining === 9);

    const twice = await refusal(() => recovery.setPassword(finalPassword));
    check("setPassword cannot be called twice", twice?.status === -1, twice?.message);

    // The password is provably replaced. Completing a fresh sign-in needs a
    // fresh TOTP step; rather than a second 30-second wait, the admin section
    // below resets this account's TOTP and finishes the proof with one factor.
    asBrowser(new BrowserSession());
    const old = await refusal(() => signInFlow(flowsHandle, secondPassword));
    check("the pre-recovery password no longer works", old?.status === 401, old?.message);
    const recovered = await signInFlow(flowsHandle, finalPassword);
    check(
      "the recovered password is accepted (second factor still pending)",
      recovered.status === "totp-required",
      JSON.stringify(recovered).slice(0, 120),
    );
  }

  section("Admin routes and published site config");
  {
    const adminHandle = `harness-adm-${RUN}`;
    const operatorSession = asBrowser(new BrowserSession());
    await signUpFlow(adminHandle, password);

    const denied = await refusal(() => api.adminAccounts());
    check("a non-operator is refused the admin surface", denied?.status === 403, denied?.message);
    const deniedPublish = await refusal(() => api.publishSiteConfig({ pal: 3 }));
    check("a non-operator cannot publish site config", deniedPublish?.status === 403, deniedPublish?.message);

    // The one thing no API can do, by design. BREAK-GLASS step 1, locally.
    await d1(`UPDATE accounts SET is_operator = 1 WHERE handle = '${adminHandle}'`);

    let accounts = (await api.adminAccounts()).accounts;
    const self = accounts.find((row) => row.handle === adminHandle);
    check("flipping is_operator in D1 grants the admin surface", self?.isOperator === true);

    const flowsRow = accounts.find((row) => row.handle === flowsHandle);
    check("the listing shows the 2FA fixture's TOTP as confirmed", flowsRow?.totp.confirmed === true);
    check(
      "the listing counts the fixture's spent recovery code",
      flowsRow?.credentials.recoveryCodesRemaining === 9,
      String(flowsRow?.credentials.recoveryCodesRemaining),
    );

    // Fixtures from previous runs accumulate in local D1, and a stale operator
    // among them would make the last-operator guard below nondeterministic.
    // Deleting them here is the delete route exercised on real targets, and it
    // keeps the local database from growing a run at a time.
    const stale = accounts.filter(
      (row) => row.handle.startsWith("harness-") && !row.handle.endsWith(RUN),
    );
    for (const row of stale) await api.adminDeleteAccount(row.id);
    accounts = (await api.adminAccounts()).accounts;
    check(
      `delete-account removed the ${stale.length} stale fixture(s)`,
      accounts.every((row) => !row.handle.startsWith("harness-") || row.handle.endsWith(RUN)),
    );

    const selfDelete = await refusal(() => api.adminDeleteAccount(self!.id));
    check("an operator cannot delete themselves", selfDelete?.status === 400, selfDelete?.message);

    const otherOperators = accounts.filter((row) => row.isOperator && row.id !== self!.id);
    if (otherOperators.length === 0) {
      const lastFlag = await refusal(() => api.adminSetOperator(self!.id, false));
      check(
        "the only operator cannot remove their own flag",
        lastFlag?.status === 400,
        lastFlag?.message,
      );
    } else {
      // Somebody promoted a non-harness account in this local database; the
      // guard legitimately does not fire, so asserting it would test the
      // database's mood rather than the code.
      console.log(
        `  (skipping the last-operator guard: ${otherOperators.length} other operator(s) exist locally)`,
      );
    }

    await api.adminSetOperator(flowsRow!.id, true);
    let listed = (await api.adminAccounts()).accounts.find((row) => row.id === flowsRow!.id);
    check("operator can be granted", listed?.isOperator === true);
    await api.adminSetOperator(flowsRow!.id, false);
    listed = (await api.adminAccounts()).accounts.find((row) => row.id === flowsRow!.id);
    check("and revoked", listed?.isOperator === false);

    await api.adminResetTotp(flowsRow!.id);
    listed = (await api.adminAccounts()).accounts.find((row) => row.id === flowsRow!.id);
    check("reset-totp clears the flag in the listing", listed?.totp.confirmed === false);

    // ...which finishes the recovery proof: one factor now suffices, the
    // recovered password works, and it opens the ORIGINAL grant key — through
    // signup, change-password, recovery, set-password and a TOTP reset.
    asBrowser(new BrowserSession());
    const oneFactor = await signInFlow(flowsHandle, finalPassword);
    check("after reset-totp the fixture signs in with one factor", oneFactor.status === "signed-in");

    const { kdf } = await api.challenge(flowsHandle);
    const reDerived = await deriveFromPassword(finalPassword, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const slot = await api.keySlot(reDerived.authSecret);
    check("the grant public key never moved", slot.grantPubkey === grantPubkeyAtSignup);
    const reopened = await unwrapSlot(
      fromBase64Url(slot.wrappedGrantKey),
      reDerived.wrappingKey,
      fromBase64Url(slot.grantPubkey),
    );
    const message = new TextEncoder().encode("same key, four credentials later");
    const pub = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(slot.grantPubkey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    check(
      "the recovered password opens the original grant key",
      await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        pub,
        await signWithGrantKey(reopened, message),
        message,
      ),
    );

    // Operator password reset — §4's recovery path, survivable end to end.
    // Reset deletes the password credential and its key slot; the way back is a
    // recovery code (whose slot carries its own copy of the grant key) into
    // setPassword's INSERT branch. This drives the entire loop and finishes on
    // the §5 property that makes reset safe: the grant key never moved, and at
    // no point did the operator hold anything that could open it.
    asBrowser(operatorSession);
    const selfReset = await refusal(() => api.adminResetPassword(self!.id));
    check("an operator cannot reset their own password", selfReset?.status === 400, selfReset?.message);

    const resetResult = await api.adminResetPassword(flowsRow!.id);
    check(
      "reset returns status only — no key material, ever",
      resetResult.status === "ok" &&
        !("wrappedGrantKey" in resetResult) &&
        !("grantPubkey" in resetResult) &&
        !("keySlot" in resetResult),
      JSON.stringify(resetResult).slice(0, 120),
    );
    listed = (await api.adminAccounts()).accounts.find((row) => row.id === flowsRow!.id);
    check("the listing shows the password gone", listed?.credentials.password === false);
    check(
      "the listing shows the account awaiting a new password",
      typeof listed?.resetAt === "number",
    );

    asBrowser(new BrowserSession());
    const deadPassword = await refusal(() => signInFlow(flowsHandle, finalPassword));
    check("the reset password no longer signs in", deadPassword?.status === 401, deadPassword?.message);

    // The challenge salt fallback is what this leans on: with no password row,
    // the salt must come from a recovery credential or the code below derives
    // against a decoy and turns a working code into a wrong one.
    const afterReset = await signInWithRecoveryCode(flowsHandle, flowsCodes[1]);
    check(
      "a recovery code still signs in after the reset",
      afterReset.result.status === "signed-in",
      JSON.stringify(afterReset.result).slice(0, 140),
    );
    check(
      "the sign-in discloses the reset to the owner",
      afterReset.result.status === "signed-in" && typeof afterReset.result.resetAt === "number",
    );
    check("slot and ticket are in hand for the new password", afterReset.canSetPassword() === true);

    const postResetPassword = `${password}, after the reset`;
    await afterReset.setPassword(postResetPassword);

    asBrowser(new BrowserSession());
    const backIn = await signInFlow(flowsHandle, postResetPassword);
    check(
      "setPassword's INSERT branch gives the account a password again",
      backIn.status === "signed-in",
      JSON.stringify(backIn).slice(0, 140),
    );
    check(
      "the reset notice clears once the owner chooses a password",
      backIn.status === "signed-in" && backIn.resetAt === null,
    );
    check(
      "the grant public key survived the operator reset too",
      (await api.keySlot(await slotProof(flowsHandle, postResetPassword))).grantPubkey ===
        grantPubkeyAtSignup,
    );

    // The refusal that keeps reset honest: with no unspent recovery code, the
    // password slot is the last openable copy of the grant key, and deleting it
    // is account destruction under a milder name.
    await d1(
      `UPDATE credentials SET used_at = ${Date.now()} WHERE account_id = (SELECT id FROM accounts WHERE handle = '${handle}') AND kind = 'recovery'`,
    );
    asBrowser(operatorSession);
    const firstFixture = (await api.adminAccounts()).accounts.find((row) => row.handle === handle);
    const sealed = await refusal(() => api.adminResetPassword(firstFixture!.id));
    check(
      "reset is refused when it would seal the account for good",
      sealed?.status === 400,
      sealed?.message,
    );

    // Site config, the remaining untested pair of routes. Reads go through a
    // raw Client: the app deliberately has no fetching reader — the browser
    // gets this injected as `window.__VESSEL_SITE__` — so there is no
    // `api.readSiteConfig` to import, and that absence is correct.
    asBrowser(operatorSession);
    const reader = new Client();
    const original = (await reader.call("/api/site-config")).config ?? null;

    const junkOnly = await refusal(() => api.publishSiteConfig({ nonsense: true }));
    check("a config with no known keys is refused", junkOnly?.status === 400, junkOnly?.message);

    const published = await api.publishSiteConfig({ pal: 7, layout: 2, junk: "stripped" });
    check("the operator can publish", published.status === "published");
    check(
      "unknown keys are stripped before storage",
      !("junk" in (published.config as Record<string, unknown>)),
    );

    const readBack = (await reader.call("/api/site-config")).config as Record<string, unknown>;
    check("the published config reads back", readBack?.pal === 7 && readBack?.layout === 2);

    const shell = await fetch(`${BASE}/`);
    const html = await shell.text();
    check(
      "the app shell carries the injected config",
      html.includes("window.__VESSEL_SITE__") && html.includes('"pal":7'),
      "no __VESSEL_SITE__ injection in served HTML",
    );

    // TODO 12: the report-only CSP, and the nonce that ties the one legitimate
    // inline script to it. The header and the attribute must agree per request
    // or the policy would report the site's own injection.
    const csp = shell.headers.get("content-security-policy-report-only") ?? "";
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    check("the shell carries the report-only CSP", csp.includes("default-src 'self'"), csp.slice(0, 100));
    check(
      "the injected script carries the CSP's own nonce",
      !!nonce && html.includes(`<script nonce="${nonce}">window.__VESSEL_SITE__`),
      csp.slice(0, 100),
    );
    const report = await fetch(`${BASE}/api/csp-report`, { method: "POST", body: "{}" });
    check("a violation report is answered with 204", report.status === 204);

    // Leave the local database's published look the way this run found it.
    if (original) {
      await api.publishSiteConfig(original);
    } else {
      await d1("DELETE FROM site_config WHERE id = 1");
    }
  }

  // Passkeys --------------------------------------------------------------------
  //
  // Driven through the real `src/auth/passkeys.ts` flows via the Authenticator
  // seam, with `scripts/webauthn-sim.ts` standing in for the platform. The sim
  // *encodes* the CBOR and DER the Worker *decodes*, from the spec rather than
  // from shared code, so the wire format is proven against a second opinion.
  section("Passkeys (§4/§5) — another key slot on the same grant key");
  {
    asBrowser(new BrowserSession());
    const pkHandle = `harness-pk-${RUN}`;
    await signUpFlow(pkHandle, password);
    const grantPubkey = (await api.keySlot(await slotProof(pkHandle, password))).grantPubkey;

    // rpId and origin exactly as the Worker will check them, learned from the
    // anonymous challenge route — the sim has no browser to learn them from.
    const probe = await api.passkeySignInChallenge();
    const authenticator = new SoftwareAuthenticator(probe.origin, probe.rpId);

    const wrongPassword = await refusal(() => addPasskey("not the password", "x", authenticator));
    check(
      "addPasskey refuses a wrong password before the authenticator ceremony",
      wrongPassword?.status === -1,
      wrongPassword?.message,
    );

    const added = await addPasskey(password, "harness laptop", authenticator);
    check("addPasskey registers, with the grant key re-wrapped into its slot", added.slotWrapped === true);

    const me = await api.me();
    check("the account now counts one passkey", me.credentials.passkeys === 1, String(me.credentials.passkeys));

    const listed = (await api.passkeyList()).passkeys;
    check(
      "the passkey lists with its label and slot",
      listed.length === 1 && listed[0].label === "harness laptop" && listed[0].hasSlot === true,
      JSON.stringify(listed).slice(0, 140),
    );

    await api.signout();
    asBrowser(new BrowserSession());
    const signedIn = await signInWithPasskey(authenticator);
    check(
      "a passkey signs in",
      signedIn.status === "signed-in" && signedIn.account.handle === pkHandle,
      JSON.stringify(signedIn).slice(0, 140),
    );
    check("the sign-in carries the passkey's key slot", !!signedIn.keySlot);

    // §5's whole point, for the newest credential kind: the prf-derived
    // wrapping key opens the ORIGINAL grant key.
    if (signedIn.keySlot) {
      const assertion = await authenticator.get({
        challenge: crypto.getRandomValues(new Uint8Array(32)),
      });
      const opened = await unwrapSlot(
        fromBase64Url(signedIn.keySlot.wrappedGrantKey),
        await prfWrappingKey(assertion.prfOutput!),
        fromBase64Url(signedIn.keySlot.grantPubkey),
      );
      const message = new TextEncoder().encode("a passkey opens the same key");
      const pub = await crypto.subtle.importKey(
        "raw",
        fromBase64Url(grantPubkey),
        { name: "ECDSA", namedCurve: "P-256" },
        false,
        ["verify"],
      );
      check(
        "the passkey slot opens the ORIGINAL grant key",
        await crypto.subtle.verify(
          { name: "ECDSA", hash: "SHA-256" },
          pub,
          await signWithGrantKey(opened, message),
          message,
        ),
      );
      check(
        "it is the same public key the account was created with",
        signedIn.keySlot.grantPubkey === grantPubkey,
      );
    }

    // The recorded decision (docs/DECISIONS.md 2026-08-13): user verification
    // is the passkey's second factor, so TOTP on the account does not add a
    // stage to a passkey sign-in.
    const enrolment = await beginTotpEnrolment(password);
    await enrolment.confirm(await totpCode(enrolment.secret));
    await api.signout();
    asBrowser(new BrowserSession());
    const oneStep = await signInWithPasskey(authenticator);
    check(
      "a passkey signs in without the TOTP stage — UV is the second factor",
      oneStep.status === "signed-in",
      JSON.stringify(oneStep).slice(0, 120),
    );

    // §5's fallback: no prf, no slot, said honestly rather than faked.
    const prfless = new SoftwareAuthenticator(probe.origin, probe.rpId);
    prfless.supportsPrf = false;
    const bare = await addPasskey(password, "no prf", prfless);
    check("an authenticator without prf registers with no slot", bare.slotWrapped === false);
    const two = (await api.passkeyList()).passkeys;
    check(
      "the slotless passkey lists as such",
      two.length === 2 && two.some((entry) => entry.label === "no prf" && !entry.hasSlot),
      JSON.stringify(two).slice(0, 160),
    );

    // Removing a credential is a credential change, so it demands the password.
    const noPassword = await refusal(() =>
      api.passkeyRemove({ id: two.find((entry) => entry.label === "no prf")!.id }),
    );
    check("removal without the password is refused", noPassword?.status === 401, noPassword?.message);
    await removePasskey(password, two.find((entry) => entry.label === "no prf")!.id);
    check(
      "the removed passkey is gone from the listing",
      (await api.passkeyList()).passkeys.length === 1,
    );

    // The sign-in path's refusals, all one sentence.
    const stranger = new SoftwareAuthenticator(probe.origin, probe.rpId);
    await stranger.create({
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      accountId: "x",
      handle: "x",
    });
    const unknown = await refusal(() => signInWithPasskey(stranger));
    check("an unregistered passkey is refused", unknown?.status === 401, unknown?.message);

    const tampered = await refusal(() =>
      signInWithPasskey({
        create: (options) => authenticator.create(options),
        get: async (options) => {
          const assertion = await authenticator.get(options);
          assertion.signature[assertion.signature.length - 1] ^= 1;
          return assertion;
        },
      }),
    );
    check("a tampered signature is refused", tampered?.status === 401, tampered?.message);

    // A replayed registration: same attestation, same still-valid token. The
    // credential-id uniqueness index is what refuses it, which is what lets the
    // challenge token stay stateless.
    const { kdf } = await api.challenge(pkHandle);
    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const manual = await api.passkeyChallenge();
    const attestation = await authenticator.create({
      challenge: fromBase64Url(manual.challenge),
      accountId: "x",
      handle: pkHandle,
    });
    const registerBody = {
      authSecret: derived.authSecret,
      token: manual.token,
      label: "replayed",
      credential: {
        id: toBase64Url(attestation.id),
        clientDataJSON: toBase64Url(attestation.clientDataJSON),
        attestationObject: toBase64Url(attestation.attestationObject),
      },
    };
    const firstRegistration = await refusal(() => api.passkeyRegister(registerBody));
    check("a slotless manual registration succeeds", firstRegistration === null, firstRegistration?.message);
    const replayed = await refusal(() => api.passkeyRegister(registerBody));
    check("replaying the same registration is refused with 409", replayed?.status === 409, replayed?.message);

    // clientData written for a foreign origin — a phishing page's registration.
    const foreign = new SoftwareAuthenticator("https://evil.example", probe.rpId);
    const foreignChallenge = await api.passkeyChallenge();
    const foreignAttestation = await foreign.create({
      challenge: fromBase64Url(foreignChallenge.challenge),
      accountId: "x",
      handle: pkHandle,
    });
    const foreignRefused = await refusal(() =>
      api.passkeyRegister({
        authSecret: derived.authSecret,
        token: foreignChallenge.token,
        credential: {
          id: toBase64Url(foreignAttestation.id),
          clientDataJSON: toBase64Url(foreignAttestation.clientDataJSON),
          attestationObject: toBase64Url(foreignAttestation.attestationObject),
        },
      }),
    );
    check("a registration from a foreign origin is refused", foreignRefused?.status === 400, foreignRefused?.message);

    // UV is the passkey's second factor: the no-TOTP and no-rate-limit
    // decisions on passkey sign-in rest entirely on the Worker refusing an
    // assertion without it. Until now that refusal was verified by code
    // reading only — a regression deleting the UV check would have passed this
    // whole suite. Proved here instead.
    authenticator.userVerification = false;
    const noUv = await refusal(() => signInWithPasskey(authenticator));
    check(
      "an assertion without user verification is refused",
      noUv !== null && (noUv.status === 400 || noUv.status === 401),
      noUv?.message,
    );
    authenticator.userVerification = true;

    // Valid cryptography over the wrong RP ID hash — a signature minted for
    // some other site. Foreign origin is already refused via clientDataJSON
    // above; this is the authData half of the same boundary.
    authenticator.rpIdOverride = "evil.example";
    const wrongRp = await refusal(() => signInWithPasskey(authenticator));
    check(
      "an assertion over a wrong RP ID hash is refused",
      wrongRp !== null && (wrongRp.status === 400 || wrongRp.status === 401),
      wrongRp?.message,
    );
    authenticator.rpIdOverride = null;
  }

  section("Saved setups (§11) — a name and a share code");
  {
    // Still signed in as the passkey fixture from the section above.
    const none = await api.setupsList();
    check("a fresh account has no setups", none.setups.length === 0, String(none.setups.length));

    const saved = await api.setupSave("Workshop mode", "2-0-0-0-7-3");
    check(
      "a setup saves",
      saved.status === "saved" && saved.setup.name === "Workshop mode",
      JSON.stringify(saved).slice(0, 120),
    );

    const replaced = await api.setupSave("WORKSHOP MODE", "A-3-1-0-7-1");
    check("saving the same name replaces it, case-insensitively", replaced.status === "replaced");
    let listed = (await api.setupsList()).setups;
    check(
      "one setup remains, holding the new code and casing",
      listed.length === 1 && listed[0].shareCode === "A-3-1-0-7-1" && listed[0].name === "WORKSHOP MODE",
      JSON.stringify(listed).slice(0, 140),
    );

    const legacy = await api.setupSave("legacy", "2-0-0-0-7");
    check("a five-field legacy code is accepted", legacy.status === "saved");

    const junk = await refusal(() => api.setupSave("bad", "not a code!!"));
    check("a malformed code is refused", junk?.status === 400, junk?.message);
    const blank = await refusal(() => api.setupSave("   ", "2-0-0-0-7-3"));
    check("a blank name is refused", blank?.status === 400, blank?.message);

    listed = (await api.setupsList()).setups;
    const workshop = listed.find((setup) => setup.name === "WORKSHOP MODE")!;
    const deleted = await api.setupDelete(workshop.id);
    check("a setup deletes", deleted.status === "deleted");
    const missing = await refusal(() => api.setupDelete(workshop.id));
    check("deleting it twice is refused", missing?.status === 404, missing?.message);

    const anonymous = new Client();
    await anonymous.call("/api/setups");
    check("setups are invisible without a session", anonymous.lastStatus === 401);
  }

  // Phase 2 ---------------------------------------------------------------------
  //
  // Machines, drives and the signalling Durable Object (SPEC-ACCOUNTS.md §13).
  // The WebRTC hop itself cannot run under Node — no RTCPeerConnection — so the
  // boundary here is honest: every HTTP and WebSocket route is driven end to
  // end, and the connect ceremony's cryptography is exercised with the real
  // `src/share` modules on both sides of a relayed exchange. Only the DTLS
  // channel that follows needs a browser.

  section("The file protocol's path rule (§12 S) — pure, before any wire");
  {
    check("a plain relative path is valid", isValidPath(["docs", "march.pdf"]));
    check("the empty path names the drive root", isValidPath([]));
    check("a unicode name is valid", isValidPath(["naïve résumé.txt"]));
    check("dot-dot is refused", !isValidPath(["docs", "..", "secrets"]));
    check("a lone dot is refused", !isValidPath(["."]));
    check("a forward slash inside a component is refused", !isValidPath(["a/b"]));
    check("a backslash inside a component is refused", !isValidPath(["a\\b"]));
    check("an empty component is refused", !isValidPath(["docs", ""]));
    check("a DOS device name is refused", !isValidPath(["con"]));
    check("a DOS device name with an extension is refused", !isValidPath(["PRN.txt"]));
    check("a numbered port name is refused", !isValidPath(["com3"]));
    check("a trailing dot is refused", !isValidPath(["name."]));
    check("a trailing space is refused", !isValidPath(["name "]));
    check("a colon is refused", !isValidPath(["c:evil"]));
    check("a control character is refused", !isValidPath([`bad${String.fromCharCode(7)}name`]));
    check("a 256-character component is refused", !isValidPath(["x".repeat(256)]));
    check(
      "a 33-deep path is refused",
      !isValidPath(Array.from({ length: 33 }, () => "a")),
    );
    check("a non-string component is refused", !isValidPath(["docs", 42]));
    check("a non-array is refused", !isValidPath("docs/march.pdf"));

    check(
      "fingerprint normalisation folds case one way",
      normalizeFingerprint("SHA-256 ab:cd:ef") === "sha-256 AB:CD:EF",
    );
    const probe = fakeSdp();
    check(
      "the fingerprint is read out of an SDP",
      fingerprintFromSdp(probe.sdp) === normalizeFingerprint(probe.fingerprint),
    );
    check("an SDP with no fingerprint yields null", fingerprintFromSdp("v=0\r\ns=-\r\n") === null);

    /**
     * The multi-fingerprint refusal (2026-08-14 review).
     *
     * `fingerprintFromSdp` used `.exec` on a non-global regex, so it returned
     * the *first* `a=fingerprint` line and said nothing about the rest. RFC 8122
     * §5 lets a media-level fingerprint override a session-level one, and the
     * whole unmodified SDP goes to `setRemoteDescription` — so a hostile
     * signalling service (in scope per §3 and §12 R) could prepend the owner's
     * genuine fingerprint at session level to its own SDP, pass verification
     * against the trust root, and have DTLS pin to *its* key. Both legs would
     * terminate at the relay and it would read every byte, without forging a
     * signature. Refuse, never repair — the `paths.ts` rule.
     */
    const twoFp =
      "v=0\r\ns=-\r\na=fingerprint:sha-256 AA:BB\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:sha-256 CC:DD\r\n";
    check("an SDP carrying two different fingerprints is refused", fingerprintFromSdp(twoFp) === null);
    const repeatFp =
      "v=0\r\ns=-\r\na=fingerprint:sha-256 AA:BB\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\na=fingerprint:SHA-256 aa:bb\r\n";
    check(
      "the same fingerprint restated per m-section is still accepted",
      fingerprintFromSdp(repeatFp) === normalizeFingerprint("sha-256 AA:BB"),
    );
    check(
      "a second fingerprint differing only in hash algorithm is refused",
      fingerprintFromSdp(
        "a=fingerprint:sha-256 AA:BB\r\na=fingerprint:sha-1 AA:BB\r\n",
      ) === null,
    );
  }

  /**
   * Share codes — the site's other wire format, and the one `CLAUDE.md` warns
   * about hardest.
   *
   * It had no automated coverage until 2026-08-14, which is the wrong way round:
   * every failure here is silent. A code that points at the wrong palette still
   * *works*, an appended catalogue entry breaks every code in circulation
   * without an error anywhere, and a base-36 slip decodes `12` as 38 and applies
   * the default effect — which looks exactly like a failed deploy.
   *
   * Pure, so it runs before any wire, next to the path rule for the same reason.
   */
  section("Share codes (wire format) — round-trip, legacy codes, base-36");
  {
    const full = {
      ...DEFAULT_CONFIG,
      pal: 17,
      layout: LAYOUTS[11].id,
      fx: FX[14].id,
      type: 3,
      ornament: ORNAMENTS[4].id,
      grain: true,
      breathe: false,
      cursor: true,
      calm: false,
      sound: true,
    };
    const there = encodeShareCode(full);
    const back = decodeShareCode(there);
    check("a full config round-trips its palette", back?.pal === full.pal);
    check("…its layout", back?.layout === full.layout);
    check("…its effect", back?.fx === full.fx);
    check("…its typeface", back?.type === full.type);
    check("…its ornament", back?.ornament === full.ornament);
    check(
      "…and every toggle independently",
      back?.grain === true && back?.breathe === false && back?.cursor === true &&
        back?.calm === false && back?.sound === true,
    );
    check("applying a code pins the randomiser to static", back?.mode === "static");

    // The bitfield is 1 grain / 2 breathing / 4 cursor / 8 calm / 16 sound, and
    // each bit is asserted on its own — a swapped pair round-trips perfectly and
    // is still wrong for everyone holding an older code.
    const bitOf = (patch: Partial<typeof full>) =>
      encodeShareCode({ ...DEFAULT_CONFIG, grain: false, breathe: false, cursor: false,
        calm: false, sound: false, ...patch }).split("-")[4];
    check("bit 1 is grain", bitOf({ grain: true }) === "1");
    check("bit 2 is breathing", bitOf({ breathe: true }) === "2");
    check("bit 4 is cursor glow", bitOf({ cursor: true }) === "4");
    check("bit 8 is calm", bitOf({ calm: true }) === "8");
    check("bit 16 is sound", bitOf({ sound: true }) === "G"); // 16 in base 36
    check("bit 32 is slot labels", bitOf({ slots: true }) === "W"); // 32 in base 36
    // Bit 64 is stored **inverted**: set means entrances OFF. Every code already
    // in circulation has it clear and entrances default on, so clear has to keep
    // meaning on. Asserted from both sides because an inversion that is written
    // backwards round-trips perfectly and is wrong for everyone holding a code.
    check("entrances on leaves bit 64 clear", bitOf({ entrances: true }) === "0");
    check("entrances off sets bit 64", bitOf({ entrances: false }) === "1S"); // 64
    check(
      "the full bitfield is 127, and outgrowing one base-36 character is fine",
      bitOf({
        grain: true, breathe: true, cursor: true, calm: true,
        sound: true, slots: true, entrances: false,
      }) === "3J",
    );

    // Codes minted before a field existed must keep meaning what they meant.
    const legacy6 = decodeShareCode("0-0-0-0-7-0");
    const legacy5 = decodeShareCode("A-3-1-0-7");
    check("a six-field code still decodes", legacy6 !== null);
    check("a five-field code still decodes", legacy5 !== null);
    check("a five-field code leaves the ornament alone", legacy5?.ornament === undefined);
    check("a code minted before sound decodes as sound off", legacy6?.sound === false);
    check("…and so does the five-field one", legacy5?.sound === false);

    // The trap that has been paid for once already.
    check("effect index 12 encodes as C, not 12", encodeShareCode({ ...DEFAULT_CONFIG, fx: FX[12].id }).split("-")[2] === "C");
    check(
      "a decimal-looking effect field falls back rather than throwing",
      decodeShareCode("0-0-12-0-7-0")?.fx === FX[0].id,
    );

    // A hidden effect is unlisted, not invalid — `FX` decodes, `PICKABLE_FX` offers.
    check("PICKABLE_FX is a subset of FX", PICKABLE_FX.every((e) => FX.includes(e)));
    for (const entry of FX.filter((e) => e.hidden)) {
      check(`a hidden effect still decodes: ${entry.id}`,
        decodeShareCode(encodeShareCode({ ...DEFAULT_CONFIG, fx: entry.id }))?.fx === entry.id);
    }

    // Out of range must fall back, never throw and never produce undefined ids.
    const wild = decodeShareCode("ZZ-ZZ-ZZ-ZZ-0-ZZ");
    check("an out-of-range palette clamps into the catalogue",
      typeof wild?.pal === "number" && wild.pal >= 0 && wild.pal < PALETTES.length);
    check("an out-of-range layout falls back to a real one",
      LAYOUTS.some((l) => l.id === wild?.layout));
    check("an out-of-range effect falls back to a real one", FX.some((f) => f.id === wild?.fx));
    check("an out-of-range typeface clamps", typeof wild?.type === "number" && wild.type < TYPESETS.length);
    check("an out-of-range ornament falls back to a real one",
      ORNAMENTS.some((o) => o.id === wild?.ornament));

    check("garbage decodes to null", decodeShareCode("nope") === null);
    check("a four-field code is refused", decodeShareCode("0-0-0-0") === null);
    // Seven is the ceiling since the station landed (2026-08-18), not six. This
    // assertion said "a seven-field code is refused" for the day in between and
    // was the harness's only red line — the *format* moved and the test did not.
    check("a seven-field code is accepted", decodeShareCode("0-0-0-0-0-0-0") !== null);
    check("an eight-field code is refused", decodeShareCode("0-0-0-0-0-0-0-0") === null);
    check("a non-base-36 field is refused", decodeShareCode("0-0-!-0-0-0") === null);
    check("an empty string is refused", decodeShareCode("") === null);

    /**
     * The presets' own guarantee: they define themselves structurally and
     * *derive* the code. A hardcoded string stays right until something is
     * appended to a catalogue and then becomes a working code pointing at the
     * wrong palette — the exact failure this discipline exists to prevent. So
     * assert the codes decode to real catalogue entries rather than to literals.
     */
    check("there are presets to check", PRESETS.length > 0);
    for (const preset of PRESETS) {
      const decoded = decodeShareCode(preset.shareCode);
      check(
        `preset "${preset.name}" decodes to real catalogue entries`,
        !!decoded &&
          decoded.pal >= 0 && decoded.pal < PALETTES.length &&
          LAYOUTS.some((l) => l.id === decoded.layout) &&
          FX.some((f) => f.id === decoded.fx) &&
          decoded.type < TYPESETS.length &&
          ORNAMENTS.some((o) => o.id === decoded.ornament),
      );
      check(`preset "${preset.name}" does not switch sound on for anyone`, decoded?.sound === false);
    }
  }

  section("Machines and drives (§13) — pairing is a password ceremony");
  const ownerHandle = `harness-m-${RUN}`;
  const ownerSession = asBrowser(new BrowserSession());
  let machine1Id = "";
  let machine1Pubkey = ""; // base64url, as the machine list reports it
  let ownerGrantPubkey = "";
  let ownerGrantKey!: CryptoKey;
  let rekeyedKeys!: Awaited<ReturnType<typeof generateMachineKeypair>>;
  let strangerCookie: string | null = null;
  {
    await signUpFlow(ownerHandle, password);

    const none = await api.machinesList();
    check("a fresh account has no machines", none.machines.length === 0);

    const anonymous = new Client();
    await anonymous.call("/api/machines");
    check("machines are invisible without a session", anonymous.lastStatus === 401);

    const { kdf } = await api.challenge(ownerHandle);
    const derived = await deriveFromPassword(password, {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });
    const wrongDerived = await deriveFromPassword("wrong password entirely", {
      salt: fromBase64Url(kdf.salt),
      iterations: kdf.iterations,
    });

    const slot = await api.keySlot(derived.authSecret);
    ownerGrantPubkey = slot.grantPubkey;
    ownerGrantKey = await unwrapSlot(
      fromBase64Url(slot.wrappedGrantKey),
      derived.wrappingKey,
      fromBase64Url(slot.grantPubkey),
    );

    const agentKeys = await generateMachineKeypair();

    const unproved = await refusal(() =>
      api.machinePair({ name: "workshop", agentPubkey: toBase64Url(agentKeys.publicKeyBytes) }),
    );
    check("pairing without the password is refused", unproved?.status === 401, unproved?.message);

    const misproved = await refusal(() =>
      api.machinePair({
        name: "workshop",
        agentPubkey: toBase64Url(agentKeys.publicKeyBytes),
        authSecret: wrongDerived.authSecret,
      }),
    );
    check("pairing with the wrong password is refused", misproved?.status === 401, misproved?.message);

    const shortKey = await refusal(() =>
      api.machinePair({
        name: "workshop",
        agentPubkey: toBase64Url(agentKeys.publicKeyBytes.slice(0, 40)),
        authSecret: derived.authSecret,
      }),
    );
    check("a malformed agent public key is refused", shortKey?.status === 400, shortKey?.message);

    const paired = await api.machinePair({
      name: "workshop",
      agentPubkey: toBase64Url(agentKeys.publicKeyBytes),
      authSecret: derived.authSecret,
    });
    machine1Id = paired.machine.id;
    check(
      "a machine pairs",
      paired.status === "paired" && paired.machine.name === "workshop" && !paired.machine.online,
      JSON.stringify(paired).slice(0, 120),
    );
    check(
      "the pair response carries the trust root — the account's own grant key",
      paired.grantPubkey === slot.grantPubkey,
    );

    const dupKeys = await generateMachineKeypair();
    const dupName = await refusal(() =>
      api.machinePair({
        name: "WORKSHOP",
        agentPubkey: toBase64Url(dupKeys.publicKeyBytes),
        authSecret: derived.authSecret,
      }),
    );
    check("a duplicate machine name is refused, case-insensitively", dupName?.status === 409, dupName?.message);

    const keys2 = await generateMachineKeypair();
    const paired2 = await api.machinePair({
      name: "laptop",
      agentPubkey: toBase64Url(keys2.publicKeyBytes),
      authSecret: derived.authSecret,
    });
    check("a second machine pairs", paired2.status === "paired");
    const machine2Id = paired2.machine.id;

    const renamed = await api.machineRename(machine2Id, "kitchen laptop");
    check("a machine renames", renamed.status === "renamed");
    const renameClash = await refusal(() => api.machineRename(machine2Id, "Workshop"));
    check("renaming onto a taken name is refused", renameClash?.status === 409, renameClash?.message);
    const renameGhost = await refusal(() => api.machineRename("no-such-machine", "x"));
    check("renaming an unknown machine is a 404", renameGhost?.status === 404, renameGhost?.message);

    const drive = await api.driveAdd(machine1Id, "Invoices");
    check("a drive adds — a label, never a path", drive.status === "added" && drive.drive.label === "Invoices");
    const driveGhost = await refusal(() => api.driveAdd("no-such-machine", "x"));
    check("a drive on an unknown machine is a 404", driveGhost?.status === 404, driveGhost?.message);

    const listed = (await api.machinesList()).machines;
    const m1 = listed.find((m) => m.id === machine1Id)!;
    check(
      "the list carries the machine, its drive and its agent key",
      listed.length === 2 && m1.drives.length === 1 && m1.agentPubkey === toBase64Url(agentKeys.publicKeyBytes),
      JSON.stringify(listed).slice(0, 160),
    );

    const dropped = await api.driveRemove(m1.drives[0].id);
    check("a drive removes", dropped.status === "removed");
    const droppedTwice = await refusal(() => api.driveRemove(m1.drives[0].id));
    check("removing it twice is a 404", droppedTwice?.status === 404, droppedTwice?.message);

    // Re-attach a drive for the signalling section, then re-key the machine —
    // §12 O's routine recovery — and prove the drives survive it.
    await api.driveAdd(machine1Id, "Invoices");
    rekeyedKeys = await generateMachineKeypair();
    const rekeyed = await api.machinePair({
      machineId: machine1Id,
      agentPubkey: toBase64Url(rekeyedKeys.publicKeyBytes),
      authSecret: derived.authSecret,
    });
    check("re-keying keeps the machine row", rekeyed.status === "rekeyed" && rekeyed.machine.id === machine1Id);
    const afterRekey = (await api.machinesList()).machines.find((m) => m.id === machine1Id)!;
    machine1Pubkey = afterRekey.agentPubkey;
    check(
      "re-keying replaces the agent key and keeps the drives",
      afterRekey.agentPubkey === toBase64Url(rekeyedKeys.publicKeyBytes) && afterRekey.drives.length === 1,
    );

    // Another account can neither see nor steer these machines.
    const strangerSession = asBrowser(new BrowserSession());
    await signUpFlow(`harness-s-${RUN}`, password);
    const strangerView = await api.machinesList();
    check("another account sees no machines", strangerView.machines.length === 0);
    const strangerRename = await refusal(() => api.machineRename(machine1Id, "mine now"));
    check("another account cannot rename them", strangerRename?.status === 404, strangerRename?.message);
    const strangerDrive = await refusal(() => api.driveAdd(machine1Id, "exfil"));
    check("another account cannot add drives to them", strangerDrive?.status === 404, strangerDrive?.message);
    const strangerRemove = await refusal(() => api.machineRemove(machine1Id));
    check("another account cannot remove them", strangerRemove?.status === 404, strangerRemove?.message);
    strangerCookie = strangerSession.cookie;

    asBrowser(ownerSession);
    const m2gone = await api.machineRemove(machine2Id);
    check("a machine removes", m2gone.status === "removed");
    const m2goneTwice = await refusal(() => api.machineRemove(machine2Id));
    check("removing it twice is a 404", m2goneTwice?.status === 404, m2goneTwice?.message);
  }

  section("Signalling (§13) — the Durable Object introduces and cannot listen");
  {
    const cookie = ownerSession.cookie;

    check(
      "an upgrade without a session is refused with 401",
      (await wsRefusedStatus(machine1Id, "agent", null)) === 401,
    );
    check(
      "another account's upgrade is refused with 404",
      (await wsRefusedStatus(machine1Id, "agent", strangerCookie)) === 404,
    );
    check(
      "an unknown machine is refused with 404",
      (await wsRefusedStatus("no-such-machine", "agent", cookie)) === 404,
    );
    check(
      "an unknown role is refused with 400",
      (await wsRefusedStatus(machine1Id, "operator", cookie)) === 400,
    );

    // The agent tab arrives.
    const agent = await wsOpen(machine1Id, "agent", cookie);
    const withAgent = (await api.machinesList()).machines.find((m) => m.id === machine1Id)!;
    check("presence reads from the socket, not a table", withAgent.online === true);
    check("last_seen is stamped on agent connect", withAgent.lastSeen !== null);

    // The owner's browsing tab arrives and is told the agent is there.
    const browserTab = await wsOpen(machine1Id, "browser", cookie);
    const hello = await browserTab.next();
    check(
      "a browser is greeted with the agent's presence",
      hello.type === "hello" && hello.agentOnline === true && typeof hello.peer === "string",
      JSON.stringify(hello),
    );

    // The connect ceremony (§13), with the real src/share crypto on both ends.
    const offerSdp = fakeSdp();
    const ownerSignature = await signFingerprint(
      ownerGrantKey,
      "owner",
      machine1Id,
      offerSdp.fingerprint,
    );
    browserTab.send({
      type: "offer",
      payload: {
        sdp: offerSdp.sdp,
        fingerprint: offerSdp.fingerprint,
        signature: toBase64Url(ownerSignature),
      },
    });

    const offer = await agent.next();
    check(
      "the offer reaches the agent, tagged with its sender",
      offer.type === "offer" && typeof offer.from === "string" && offer.payload?.sdp === offerSdp.sdp,
      JSON.stringify(offer).slice(0, 120),
    );

    const rootBytes = fromBase64Url(ownerGrantPubkey);
    const fingerprint = fingerprintFromSdp(String(offer.payload.sdp))!;
    const signature = fromBase64Url(String(offer.payload.signature));
    check(
      "the agent verifies the owner's signed fingerprint against its trust root",
      await verifyFingerprint(rootBytes, "owner", machine1Id, fingerprint, signature),
    );
    const tampered = signature.slice();
    tampered[7] ^= 0xff;
    check(
      "a tampered signature is refused",
      !(await verifyFingerprint(rootBytes, "owner", machine1Id, fingerprint, tampered)),
    );
    check(
      "a signature for another machine is refused",
      !(await verifyFingerprint(rootBytes, "owner", "other-machine", fingerprint, signature)),
    );
    check(
      "an owner signature cannot be replayed as an agent's",
      !(await verifyFingerprint(rootBytes, "agent", machine1Id, fingerprint, signature)),
    );

    const answerSdp = fakeSdp();
    const agentSignature = await signFingerprint(
      rekeyedKeys.keyPair.privateKey,
      "agent",
      machine1Id,
      answerSdp.fingerprint,
    );
    agent.send({
      type: "answer",
      to: offer.from,
      payload: {
        sdp: answerSdp.sdp,
        fingerprint: answerSdp.fingerprint,
        signature: toBase64Url(agentSignature),
      },
    });
    const answer = await browserTab.next();
    check("the answer comes back to the right browser", answer.type === "answer", JSON.stringify(answer).slice(0, 100));
    check(
      "the browser verifies the agent's fingerprint against machines.agent_pubkey",
      await verifyFingerprint(
        fromBase64Url(machine1Pubkey),
        "agent",
        machine1Id,
        String(answer.payload.fingerprint),
        fromBase64Url(String(answer.payload.signature)),
      ),
    );

    browserTab.send({ type: "ice", payload: { candidate: "candidate:0 1 UDP 1 127.0.0.1 9 typ host" } });
    const iceToAgent = await agent.next();
    check("ICE relays browser → agent", iceToAgent.type === "ice" && iceToAgent.from === offer.from);
    agent.send({ type: "ice", to: offer.from, payload: { candidate: "candidate:1" } });
    const iceToBrowser = await browserTab.next();
    check("ICE relays agent → browser", iceToBrowser.type === "ice");

    // The tab closes: presence goes honest, an offer meets "offline", not an error.
    agent.close();
    const offline = await browserTab.next();
    check(
      "browsers are told when the agent leaves",
      offline.type === "agent-status" && offline.online === false,
      JSON.stringify(offline),
    );
    browserTab.send({ type: "offer", payload: { sdp: "x" } });
    const noAgent = await browserTab.next();
    check(
      "an offer with no agent answers offline, not a failure",
      noAgent.type === "agent-status" && noAgent.online === false,
      JSON.stringify(noAgent),
    );
    const agentGone = (await api.machinesList()).machines.find((m) => m.id === machine1Id)!;
    check("presence reads offline once the socket is gone", agentGone.online === false);

    // It returns; then a second tab takes over (§12 M).
    const agentBack = await wsOpen(machine1Id, "agent", cookie);
    const online = await browserTab.next();
    check("browsers are told when the agent returns", online.type === "agent-status" && online.online === true);
    const usurper = await wsOpen(machine1Id, "agent", cookie);
    const replaced = await agentBack.next();
    check("a second agent tab replaces the first, which is told", replaced.type === "replaced", JSON.stringify(replaced));
    const stillOnline = await browserTab.next();
    check(
      "the browsers never saw the handover as an outage",
      stillOnline.type === "agent-status" && stillOnline.online === true,
      JSON.stringify(stillOnline),
    );

    // The told-tab contract is the frame; the server-side close is cleanup and
    // local workerd delivers it lazily. What must actually hold: relays now go
    // to the new agent and never to the replaced one.
    browserTab.send({ type: "offer", payload: { probe: 1 } });
    const relayedToNew = await usurper.next();
    check("offers relay to the replacing agent", relayedToNew.type === "offer", JSON.stringify(relayedToNew).slice(0, 80));
    const leakToOld = await agentBack.next(1500);
    check(
      "nothing relays to the replaced socket",
      leakToOld.type === "__timeout" || leakToOld.type === "__closed",
      JSON.stringify(leakToOld),
    );
    agentBack.close();

    // Protocol hygiene: the object refuses rather than tolerates.
    usurper.send({ type: "offer", payload: {} });
    const usurperClose = await usurper.next();
    check(
      "an agent sending a browser's vocabulary is disconnected",
      usurperClose.type === "__closed" && usurperClose.code === 1003,
      JSON.stringify(usurperClose),
    );
    const usurperOffline = await browserTab.next();
    check("its departure reads as the agent leaving", usurperOffline.type === "agent-status" && usurperOffline.online === false);

    const oversized = await wsOpen(machine1Id, "browser", cookie);
    await oversized.next(); // its hello
    oversized.send("x".repeat(70_000));
    const oversizedClose = await oversized.next();
    check(
      "an oversized frame closes the socket",
      oversizedClose.type === "__closed" && oversizedClose.code === 1009,
      JSON.stringify(oversizedClose),
    );

    const garbled = await wsOpen(machine1Id, "browser", cookie);
    await garbled.next(); // its hello
    garbled.send("not json at all");
    const garbledClose = await garbled.next();
    check(
      "an unparseable frame closes the socket",
      garbledClose.type === "__closed" && garbledClose.code === 1003,
      JSON.stringify(garbledClose),
    );

    // Removing the machine hangs up on everyone, immediately.
    const removal = await api.machineRemove(machine1Id);
    check("the machine removes while its sockets are live", removal.status === "removed");
    const removedNotice = await browserTab.next();
    check("live sockets are told the machine is gone", removedNotice.type === "machine-removed", JSON.stringify(removedNotice));
    const removedClose = await browserTab.next();
    check("and are closed with the removal code", removedClose.type === "__closed" && removedClose.code === 4004);
    check(
      "an upgrade to the removed machine is refused with 404",
      (await wsRefusedStatus(machine1Id, "agent", cookie)) === 404,
    );
    check(
      "the machine list no longer carries it",
      !(await api.machinesList()).machines.some((m) => m.id === machine1Id),
    );
  }

  // Rate limiting ---------------------------------------------------------------
  //
  // **This runs last, and it has to.** §4's per-client bucket is keyed by
  // `clientKey`, and in local development there is no edge in front of the
  // Worker, so `cf-connecting-ip` is absent and every request in this harness
  // shares the single bucket named "local". Tripping the backoff therefore
  // blocks the whole run. That is the rate limiter working correctly rather than
  // a flaw in it — but it does mean nothing can follow this section.
  /*
   * Downloads sub-pages (2026-08-20). The operator authors a page, uploads a
   * real file into local R2, and every one of the four visibilities is checked
   * from the *outside* — a second browser with no session and no ticket.
   *
   * The outside view is the whole point. Everything in this feature is a
   * decision about who may see what, and a test that only drives the admin
   * routes proves the admin routes work while telling you nothing about the
   * thing that matters. So each state is asserted twice: the operator can, and
   * the stranger cannot.
   */
  section("Downloads sub-pages (2026-08-20) — authoring, uploading, and who may see it");
  {
    const opHandle = `harness-dl-${RUN}`;
    const opSession = asBrowser(new BrowserSession());
    await signUpFlow(opHandle, password);
    await d1(`UPDATE accounts SET is_operator = 1 WHERE handle = '${opHandle}'`);

    const slug = `harness-page-${RUN}`;
    const freeId = `harness-free-${RUN}`;
    const paidId = `harness-paid-${RUN}`;

    // A stranger: no account, no cookie, no ticket. Re-selected whenever the
    // outside view is the thing being asserted.
    const stranger = new BrowserSession();

    await api.adminPageSave({
      slug,
      title: "Harness page",
      summary: "Written by the end-to-end test.",
      intro: "First paragraph.\n\nSecond paragraph.",
      notice: "",
      layout: "list",
      visibility: "public",
      status: "draft",
    });

    asBrowser(stranger);
    const draftHidden = await refusal(() => api.downloadPage(slug));
    check("a draft page is 404 to a stranger", draftHidden?.status === 404, draftHidden?.message);
    const draftUnlisted = (await api.downloadPages()).pages.some((p) => p.slug === slug);
    check("a draft page is not in the public list", draftUnlisted === false);

    asBrowser(opSession);
    const draftVisible = await api.downloadPage(slug);
    check("the operator sees their own draft", draftVisible.page.title === "Harness page");

    // ---- the files, and the bytes -----------------------------------------
    //
    // Two files: one free, one not. The bytes are compared byte for byte on the
    // way out, because "the download worked" and "the download returned the
    // file you uploaded" are different claims and only the second one is worth
    // making.
    const freeBytes = new Uint8Array(2048).map((_, i) => (i * 7 + 11) % 251);
    const paidBytes = new Uint8Array(4096).map((_, i) => (i * 13 + 3) % 251);

    async function upload(id: string, bytes: Uint8Array, free: boolean, name: string) {
      await api.adminFileSave({
        id,
        slug,
        name,
        blurb: "A file the harness made.",
        platform: "any",
        version: "1.0",
        filename: `${id}.bin`,
        free,
        author: "",
        caveat: "",
        group: "",
      });
      const begun = await api.adminUploadBegin(id, "application/octet-stream");
      // One part, which is legal for the final part at any size — see the
      // note on CHUNK in the editor. A second part would have to be 5MiB.
      const part = await uploadPart(id, begun.uploadId, 1, bytes.buffer as ArrayBuffer);
      await api.adminUploadFinish(id, begun.uploadId, [part]);
    }

    await upload(freeId, freeBytes, true, "Free thing");
    await upload(paidId, paidBytes, false, "Paid thing");

    const withFiles = await api.downloadPage(slug);
    check("both files are on the page", (withFiles.files ?? []).length === 2);
    check(
      "the size is measured from the object, not reported by the browser",
      (withFiles.files ?? []).find((f) => f.id === freeId)?.size === freeBytes.byteLength,
      String((withFiles.files ?? []).find((f) => f.id === freeId)?.size),
    );

    // ---- public --------------------------------------------------------
    await api.adminPageSave({ slug, title: "Harness page", layout: "list", visibility: "public", status: "live" });

    asBrowser(stranger);
    const live = await api.downloadPage(slug);
    check("a live public page is readable by a stranger", live.locked === false);
    check(
      "the free file is unlocked and the paid one is not",
      live.files?.find((f) => f.id === freeId)?.unlocked === true &&
        live.files?.find((f) => f.id === paidId)?.unlocked === false,
    );

    const freeResponse = await fetch(`/api/downloads/file?item=${freeId}`);
    const served = new Uint8Array(await freeResponse.arrayBuffer());
    check("a free file downloads without a code", freeResponse.status === 200);
    check(
      "the bytes served are the bytes uploaded",
      served.length === freeBytes.length && served.every((b, i) => b === freeBytes[i]),
    );
    check(
      "it is sent as an attachment with its own filename",
      (freeResponse.headers.get("content-disposition") ?? "").includes(`${freeId}.bin`),
    );

    const paidRefused = await fetch(`/api/downloads/file?item=${paidId}`);
    check("a paid file is refused without a code", paidRefused.status === 403);

    // ---- a code --------------------------------------------------------
    asBrowser(opSession);
    const minted = await api.adminDownloadMint({
      label: "harness",
      item: null,
      slug,
      maxUses: 5,
      days: 0,
    });

    asBrowser(stranger);
    const claimed = await api.downloadClaim(minted.code);
    check("a page-scoped code opens that page", claimed.pages.includes(slug));
    const paidOpened = await fetch(
      `/api/downloads/file?item=${paidId}&t=${encodeURIComponent(claimed.ticket)}`,
    );
    const paidServed = new Uint8Array(await paidOpened.arrayBuffer());
    check("the paid file downloads with the ticket", paidOpened.status === 200);
    check(
      "and its bytes are the ones uploaded",
      paidServed.length === paidBytes.length && paidServed.every((b, i) => b === paidBytes[i]),
    );

    /*
     * **A file-scoped code opens its page to LOOK AT, not to take from.**
     *
     * This is the security review's finding of 2026-08-20, turned into the check
     * that would have caught it. The first version put the file's page into the
     * same list a page-scoped code uses, and `canDownload` honoured that list —
     * so buying one program bought every paid file on the page, by editing one
     * query parameter, with the ids handed over in the page response the
     * customer was entitled to. Both halves are asserted: the page must render,
     * and the sibling file must not come out.
     */
    asBrowser(opSession);
    const oneFile = await api.adminDownloadMint({
      label: "harness-onefile",
      item: paidId,
      slug: null,
      maxUses: 5,
      days: 0,
    });

    asBrowser(stranger);
    const oneClaim = await api.downloadClaim(oneFile.code);
    check("a file-scoped code names the page its file is on", oneClaim.pages.includes(slug));
    const itsOwn = await fetch(
      `/api/downloads/file?item=${paidId}&t=${encodeURIComponent(oneClaim.ticket)}`,
    );
    check("the file it was minted for downloads", itsOwn.status === 200);
    await itsOwn.arrayBuffer();

    // The sibling. `freeId` is free, so a second *paid* file is needed to make
    // the claim mean anything.
    const siblingId = `harness-sib-${RUN}`;
    asBrowser(opSession);
    await upload(siblingId, new Uint8Array(512).fill(9), false, "Sibling");
    asBrowser(stranger);
    const sibling = await fetch(
      `/api/downloads/file?item=${siblingId}&t=${encodeURIComponent(oneClaim.ticket)}`,
    );
    check(
      "a file-scoped code does NOT open another paid file on the same page",
      sibling.status === 403,
      `status ${sibling.status}`,
    );
    const stillReadable = await api.downloadPage(slug, oneClaim.ticket);
    check("but the page itself still renders for them", stillReadable.locked === false);

    /*
     * ---- the redemption invariants -------------------------------------
     *
     * Added 2026-08-20 after a review pointed out that this section drove only
     * happy paths: the module's longest comment defends "every failure gives the
     * same message", the `uses < max_uses` re-check in the UPDATE's WHERE clause
     * is the last-way-in guard, and neither had ever been executed here.
     */

    // A code of the right shape that was never minted.
    asBrowser(stranger);
    const fabricated = await api.downloadClaim("ZZZZ-ZZZZ-ZZZZ").then(
      () => null,
      (thrown: unknown) => thrown as { status?: number; message?: string },
    );
    check("a fabricated code is refused", fabricated?.status === 403, `status ${fabricated?.status}`);

    // Exhaustion: one use, spent, then tried again.
    asBrowser(opSession);
    const once = await api.adminDownloadMint({ label: "harness-once", item: null, slug, maxUses: 1, days: 0 });
    asBrowser(stranger);
    const spent = await api.downloadClaim(once.code);
    check("a one-use code reports nothing left after its only use", spent.usesLeft === 0, `usesLeft ${spent.usesLeft}`);
    const exhausted = await api.downloadClaim(once.code).then(
      () => null,
      (thrown: unknown) => thrown as { status?: number; message?: string },
    );
    check("an exhausted code is refused", exhausted?.status === 403);
    check(
      "and is indistinguishable from a code that never existed",
      exhausted?.status === fabricated?.status && exhausted?.message === fabricated?.message,
      `${exhausted?.message} vs ${fabricated?.message}`,
    );

    // Revocation: minted, revoked, then tried.
    asBrowser(opSession);
    const doomed = await api.adminDownloadMint({ label: "harness-revoked", item: null, slug, maxUses: 5, days: 0 });
    const listed = await api.adminDownloadsList();
    const doomedRow = listed.codes.find((c) => c.label === "harness-revoked");
    check("a minted code appears in the list with a handle", Boolean(doomedRow?.ref));
    check(
      "and the handle is wide enough to be unique",
      (doomedRow?.ref ?? "").length === 16,
      `ref length ${(doomedRow?.ref ?? "").length}`,
    );
    await api.adminDownloadRevoke(doomedRow!.ref);
    asBrowser(stranger);
    const revoked = await api.downloadClaim(doomed.code).then(
      () => null,
      (thrown: unknown) => thrown as { status?: number; message?: string },
    );
    check(
      "a revoked code is refused, in the same words as every other failure",
      revoked?.status === fabricated?.status && revoked?.message === fabricated?.message,
    );

    /*
     * ---- ranges ---------------------------------------------------------
     *
     * The whole design rests on a plain GET so the browser's own manager can
     * resume a 300MB file. Nothing here had ever sent a `Range`.
     */
    const partial = await fetch(`/api/downloads/file?item=${freeId}`, {
      headers: { range: "bytes=0-99" },
    });
    const partialBytes = new Uint8Array(await partial.arrayBuffer());
    check("a range request is answered as a partial", partial.status === 206, `status ${partial.status}`);
    check(
      "with a content-range naming exactly those bytes",
      partial.headers.get("content-range") === `bytes 0-99/${freeBytes.length}`,
      partial.headers.get("content-range") ?? "(none)",
    );
    check(
      "and the bytes are the right hundred",
      partialBytes.length === 100 && partialBytes.every((b, i) => b === freeBytes[i]),
    );

    const headProbe = await fetch(`/api/downloads/file?item=${freeId}`, { method: "HEAD" });
    check(
      "a HEAD probe is answered, so a download manager can resume",
      headProbe.status === 200,
      `status ${headProbe.status}`,
    );
    check(
      "and it advertises ranges",
      headProbe.headers.get("accept-ranges") === "bytes",
    );

    /*
     * ---- the existence oracle -------------------------------------------
     *
     * An unknown id and a real id the caller may not have must be one refusal.
     * They were 404 and 403, which made the status code a map of the table.
     */
    const unknownId = await fetch(`/api/downloads/file?item=harness-no-such-${RUN}`);
    const knownLocked = await fetch(`/api/downloads/file?item=${siblingId}`);
    check(
      "an unknown file and a forbidden one are the same refusal",
      unknownId.status === knownLocked.status && unknownId.status === 403,
      `${unknownId.status} vs ${knownLocked.status}`,
    );

    // A ticket for this page must not open a different one. The scope is the
    // whole security of a code, so it is asserted rather than assumed.
    const otherSlug = `harness-other-${RUN}`;
    asBrowser(opSession);
    await api.adminPageSave({ slug: otherSlug, title: "Other", layout: "list", visibility: "code", status: "live" });
    asBrowser(stranger);
    const wrongPage = await api.downloadPage(otherSlug, claimed.ticket);
    check("a ticket does not open a page it was not minted for", wrongPage.locked === true);

    // ---- code-gated ------------------------------------------------------
    asBrowser(opSession);
    await api.adminPageSave({ slug, title: "Harness page", layout: "list", visibility: "code", status: "live" });

    asBrowser(stranger);
    const locked = await api.downloadPage(slug);
    check("a code-gated page tells a stranger it exists and is locked", locked.locked === true);
    check("and hands over none of its files", (locked.files ?? []).length === 0);
    const stillOpen = await api.downloadPage(slug, claimed.ticket);
    check("the ticket opens it", stillOpen.locked === false);

    // ---- granted ---------------------------------------------------------
    //
    // The one route in that needs an account. A code is a bearer token and a
    // grant is a statement about a person, and they are deliberately separate.
    /*
     * **The named account is the machines section's owner, reused rather than
     * created.** The signup bucket allows twelve per client per window and is
     * documented as "sized just above the harness's own signups" — so a section
     * that adds two of its own spends the headroom the *rate-limiting* section
     * needs to create its fixture before it deliberately exhausts the bucket.
     * That is a real refusal by a real control, and the answer is to want fewer
     * accounts rather than to widen a limit so a test passes.
     *
     * All this needs is a signed-in non-operator, which that account already is.
     */
    const guestHandle = ownerHandle;
    const guestSession = ownerSession;

    asBrowser(opSession);
    await api.adminPageSave({ slug, title: "Harness page", layout: "list", visibility: "granted", status: "live" });

    asBrowser(guestSession);
    const beforeGrant = await refusal(() => api.downloadPage(slug));
    check("a signed-in stranger is refused a granted page", beforeGrant?.status === 404);

    asBrowser(opSession);
    await api.adminGrantAdd({ handle: guestHandle, slug, item: null, label: "harness", days: 0 });

    asBrowser(guestSession);
    const afterGrant = await api.downloadPage(slug);
    check("the named account can read it", afterGrant.locked === false);
    check(
      "and its files are unlocked to them without a code",
      afterGrant.files?.find((f) => f.id === paidId)?.unlocked === true,
    );
    const grantedBytes = await fetch(`/api/downloads/file?item=${paidId}`);
    check("a grant is enough to download the bytes", grantedBytes.status === 200);
    await grantedBytes.arrayBuffer();

    /*
     * **One grant's wildcard may not attach to another grant's scope.**
     *
     * The review's second finding, as a check. `resolveAccess` used to shred
     * every `(page, file)` row into two independent sets, so an account holding
     * a whole-page grant on one page and a single-file grant on another had the
     * first row's "any file" satisfy the second row's item test — and could take
     * every file on the private page. Two grants of different shapes for one
     * returning customer is the ordinary case, not a contrived one.
     */
    asBrowser(opSession);
    const narrowSlug = `harness-narrow-${RUN}`;
    await api.adminPageSave({
      slug: narrowSlug,
      title: "Narrow",
      layout: "list",
      visibility: "granted",
      status: "live",
    });
    const wantedId = `harness-want-${RUN}`;
    const offLimitsId = `harness-off-${RUN}`;
    const savedSlug = slug;
    // `upload` closes over the page it was defined against, so these two are
    // written directly rather than through it.
    for (const [fid, label] of [
      [wantedId, "Wanted"],
      [offLimitsId, "Off limits"],
    ] as const) {
      await api.adminFileSave({
        id: fid,
        slug: narrowSlug,
        name: label,
        blurb: "",
        platform: "any",
        version: "1",
        filename: `${fid}.bin`,
        free: false,
        author: "",
        caveat: "",
        group: "",
      });
      const b = await api.adminUploadBegin(fid, "application/octet-stream");
      const part = await uploadPart(fid, b.uploadId, 1, new Uint8Array(64).fill(1).buffer as ArrayBuffer);
      await api.adminUploadFinish(fid, b.uploadId, [part]);
    }
    // The guest already holds a whole-page grant on `savedSlug` from above.
    await api.adminGrantAdd({ handle: guestHandle, slug: narrowSlug, item: wantedId, label: "one file", days: 0 });

    asBrowser(guestSession);
    const wanted = await fetch(`/api/downloads/file?item=${wantedId}`);
    check("a one-file grant opens that file", wanted.status === 200);
    await wanted.arrayBuffer();
    const offLimits = await fetch(`/api/downloads/file?item=${offLimitsId}`);
    check(
      "a whole-page grant elsewhere does not widen a one-file grant here",
      offLimits.status === 403,
      `status ${offLimits.status}`,
    );

    asBrowser(opSession);
    await api.adminPageDelete(narrowSlug).catch(() => undefined);
    void savedSlug;

    // ---- the operator's own guards ---------------------------------------
    asBrowser(guestSession);
    const notOperator = await refusal(() =>
      api.adminPageSave({ slug: `nope-${RUN}`, title: "No", layout: "list", visibility: "public", status: "live" }),
    );
    check("a non-operator cannot author a page", notOperator?.status === 403, notOperator?.message);
    const noUpload = await refusal(() => api.adminUploadBegin(freeId, "application/octet-stream"));
    check("a non-operator cannot start an upload", noUpload?.status === 403, noUpload?.message);

    asBrowser(opSession);
    const badSlug = await refusal(() =>
      api.adminPageSave({ slug: "Not A Slug", title: "x", layout: "list", visibility: "public", status: "live" }),
    );
    check("a malformed address is refused", badSlug?.status === 400, badSlug?.message);
    const badFilename = await refusal(() =>
      api.adminFileSave({ id: `x-${RUN}`, slug, name: "x", filename: "noextension", free: true }),
    );
    check(
      "a filename with no extension is refused — it is handed to the browser verbatim",
      badFilename?.status === 400,
      badFilename?.message,
    );

    // ---- deleting takes the bytes, the rows and the codes with it --------
    //
    // A code minted for this page, kept until after the delete. A slug is a
    // re-usable primary key, so a code outliving its page would spring back to
    // life the day the operator reuses the address for a different customer.
    asBrowser(opSession);
    // The grants section above left this page on "granted", which codes cannot
    // open — and `mintCode` now refuses that outright rather than handing over a
    // code that redeems and opens nothing. Put it back to a code-gated page,
    // which is what the rest of this block is about.
    await api.adminPageSave({
      slug,
      title: "Harness downloads",
      layout: "list",
      visibility: "code",
      status: "live",
    });
    const orphan = await api.adminDownloadMint({
      label: "harness-orphan",
      item: null,
      slug,
      maxUses: 5,
      days: 0,
    });

    await api.adminPageDelete(slug);
    asBrowser(stranger);
    const gone = await refusal(() => api.downloadPage(slug));
    check("a deleted page is gone", gone?.status === 404);

    /*
     * **Asserted against the cascade, not against the route.**
     *
     * This used to check the byte route answered 404 — which it did whether the
     * `ON DELETE CASCADE` fired or the row was orphaned, because `file()` looks
     * up the *page* first and fails there either way. So the check could not
     * fail, and proved nothing about the thing it was named after.
     *
     * The row is now re-created under a fresh page at the same id: if the
     * cascade did not fire, the old row is still there and `saveFile` would be
     * updating it rather than inserting, leaving the stale `size_bytes` behind.
     */
    asBrowser(opSession);
    await api.adminPageSave({
      slug,
      title: "Reused address",
      layout: "list",
      visibility: "code",
      status: "live",
    });
    const rebuilt = await api.downloadPage(slug);
    check(
      "the files really cascaded — a re-created page starts empty",
      (rebuilt.files ?? []).length === 0,
      `${(rebuilt.files ?? []).length} files survived the delete`,
    );

    // And the code minted for the old page must not open the new one.
    asBrowser(stranger);
    const resurrected = await api.downloadClaim(orphan.code).then(
      () => null,
      (thrown: unknown) => thrown as { status?: number },
    );
    check(
      "a code for a deleted page does not come back when the address is reused",
      resurrected?.status === 403,
      `status ${resurrected?.status}`,
    );

    const goneBytes = await fetch(`/api/downloads/file?item=${freeId}`);
    check("and its bytes are refused", goneBytes.status === 403);

    asBrowser(opSession);
    await api.adminPageDelete(otherSlug).catch(() => undefined);
    await api.adminDownloadRevoke(
      (await api.adminDownloadsList()).codes.find((c) => c.label === "harness")?.ref ?? "",
    ).catch(() => undefined);
  }

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
    const fixturePayload = {
      handle: victim,
      kdf: {
        salt: toBase64Url(params.salt),
        iterations: params.iterations,
        recoveryIterations: 100_000,
      },
      authSecret: credential.authSecret,
      grantPubkey: toBase64Url(grant.publicKeyRaw),
      passwordSlot: toBase64Url(await wrapSlot(grant.scalar, credential.wrappingKey)),
      slotAlg: SLOT_ALG,
      recovery,
    };
    const setup = new Client();
    await setup.call("/api/auth/signup", { body: fixturePayload });
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

    // The signup quota (2026-08-13 audit): account creation counts against a
    // dedicated `signup:` bucket, not only the shared client bucket whose
    // allowance of fifty is sized for a household's sign-in typos. A handle
    // collision records a failure on it, which makes the quota testable without
    // minting a dozen real accounts: collide from a fresh address until refused.
    // With SIGNUP_FREE_ATTEMPTS = 12, a clean bucket refuses attempt 14 (the
    // thirteenth failure is what arms the block); earlier only if a previous
    // run happened to draw the same address inside the window.
    const creator = new Client(`198.51.100.${1 + Math.floor(Math.random() * 254)}`);
    let signupBlockedAt = -1;
    for (let attempt = 1; attempt <= 15 && signupBlockedAt < 0; attempt += 1) {
      await creator.call("/api/auth/signup", { body: fixturePayload });
      if (creator.lastStatus === 429) signupBlockedAt = attempt;
    }
    check(
      "account creation from one address meets backoff",
      signupBlockedAt > 0,
      `not blocked after 15 attempts`,
    );
    check(
      "the signup allowance is tighter than the client bucket's fifty",
      signupBlockedAt > 1 && signupBlockedAt <= 14,
      `blocked at attempt ${signupBlockedAt}`,
    );
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
