/**
 * The downloads gate (2026-08-19, client request).
 *
 * The loop, entire: the client is paid by e-transfer, hands over a code by
 * whatever means they were already talking to the person, and the visitor types
 * it here. Nothing about the payment reaches this Worker — there is no
 * processor, no webhook, no order, no email, no name. That is what lets
 * SPEC-ACCOUNTS §9's inventory stay exactly as long as it was.
 *
 * THREE THINGS HERE ARE LOAD-BEARING.
 *
 * 1. **The bytes are in private R2 and there is no public URL.** If the files
 *    sat in `dist/` the code entry would be decoration: anyone who guessed a
 *    filename would have the file, and the first person who bought one could
 *    post the link. Every byte is served by this module, after a check.
 *
 * 2. **Redemption is rate-limited on the same Durable Object as sign-in.** A
 *    12-character code is 60 bits, which no one guesses — but only because
 *    guessing is throttled. Without it an attacker gets unlimited offline-speed
 *    attempts against a live endpoint, which is the one shape of attack this
 *    design is otherwise wide open to. It reserves with `assertAttempt` rather
 *    than checking then failing, for the same concurrency reason `challenge`
 *    documents at length in `accounts.ts`.
 *
 * 3. **A claim mints a short-lived token; the download itself is a plain GET.**
 *    Not `fetch` into a blob, and deliberately so: `MachinesPage.saveBlob` is
 *    the one line still holding up the CSP flip to enforcing, because a
 *    `blob:` download anchor has never been proven under the policy. A normal
 *    navigation to a normal URL that answers with `content-disposition` is
 *    governed by no fetch directive at all, needs no `blob:`, and streams
 *    rather than buffering a 200MB file into a tab's memory. It also means a
 *    failed download resumes and a browser's own download manager owns it.
 */

import { assertAttempt, buckets, json, noStore, recordSuccess, requireAccount } from "./accounts";
import { hmac, timingSafeEqual } from "./crypto";
import { BadRequest, fromBlob, toBlob } from "./encoding";
import type { Env } from "./env";
import { mint, verify } from "./session";
import { DOWNLOADS, downloadById } from "../src/data/downloads";

/**
 * Crockford base32 minus the letters that are read wrong off a screen or over
 * the telephone. No I, L, O or U: the first three collide with 1 and 0, and the
 * fourth is left out by Crockford's own alphabet so that no accidental English
 * obscenity can appear in a code the operator has to read aloud.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/** 12 characters of the alphabet above — 60 bits. Grouped 4-4-4 when shown. */
const CODE_LENGTH = 12;

/**
 * Fold the shapes a human types into the one the operator was given.
 *
 * Somebody reading a code off a text message will send back lower case, will
 * lose the hyphens or add their own, and will type O for 0 and I for 1 because
 * that is what the glyphs look like. Every one of those is the same code, and
 * refusing them would generate support mail for the operator's own formatting.
 * Applied identically at mint and at redemption, so the two cannot drift.
 */
function normalise(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/U/g, "V");
}

function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  // Modulo bias is irrelevant at 256 % 32 === 0 — the alphabet divides the byte
  // range exactly, so this is uniform without rejection sampling.
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}

/** Display form. The hyphens are cosmetic; `normalise` strips them on the way back. */
export function formatCode(code: string): string {
  return code.replace(/(.{4})(?=.)/g, "$1-");
}

/** A JSON body, or an empty one. Malformed input is a refusal downstream, never a 500. */
async function readBody(request: Request): Promise<Record<string, unknown>> {
  return request.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>);
}

async function codeHash(env: Env, code: string): Promise<Uint8Array> {
  return new Uint8Array(await hmac(env.AUTH_PEPPER, `download-code:${normalise(code)}`));
}

interface CodeRow {
  code_hash: unknown;
  label: string;
  item_id: string | null;
  created_at: number;
  expires_at: number | null;
  max_uses: number;
  uses: number;
  revoked_at: number | null;
  last_used_at: number | null;
}

/**
 * Redeem a code and return what it opens.
 *
 * The refusal is deliberately one message for every failure — unknown, expired,
 * revoked, exhausted. Distinguishing them would tell somebody feeding in
 * guesses that a particular code *exists*, which is the only bit of information
 * a 60-bit space is trying to keep.
 */
export async function claim(request: Request, env: Env): Promise<Response> {
  const body = await readBody(request);
  const supplied = typeof body.code === "string" ? body.code : "";
  const refused = new BadRequest("That code isn't valid. Check it and try again.", 403);

  // Before the database, and before any timing is observable: a code of the
  // wrong shape is a typo, not an attempt, and counting it would let the
  // operator's own customers exhaust the bucket by pasting an email signature.
  const code = normalise(supplied);
  if (code.length !== CODE_LENGTH) throw refused;

  const names = await buckets(request, env, `download:${code.slice(0, 4)}`);
  await assertAttempt(env, names);

  const hash = await codeHash(env, code);
  const row = await env.DB.prepare(
    `SELECT code_hash, label, item_id, created_at, expires_at, max_uses, uses, revoked_at, last_used_at
       FROM download_codes WHERE code_hash = ?`,
  )
    .bind(toBlob(hash))
    .first<CodeRow>();

  // `timingSafeEqual` on a value already used as a primary key looks redundant
  // and is not: it keeps the comparison discipline uniform across the codebase,
  // so nobody reading this later concludes that a `===` would have done and
  // carries that conclusion somewhere it matters.
  if (!row || !timingSafeEqual(hash, fromBlob(row.code_hash))) throw refused;

  const now = Date.now();
  if (row.revoked_at !== null) throw refused;
  if (row.expires_at !== null && row.expires_at < now) throw refused;
  if (row.uses >= row.max_uses) throw refused;

  // The count and the day, in the same statement that re-checks the ceiling.
  //
  // The ceiling is in the WHERE clause and not in an `if` above it, following
  // the last-way-in convention the account guards use: two concurrent
  // redemptions of a code on its final use would both pass a pre-check and both
  // write. Zero `meta.changes` is the refusal.
  const day = Math.floor(now / 86_400_000) * 86_400_000;
  const update = await env.DB.prepare(
    `UPDATE download_codes SET uses = uses + 1, last_used_at = ?
      WHERE code_hash = ? AND revoked_at IS NULL AND uses < max_uses`,
  )
    .bind(day, toBlob(hash))
    .run();
  if (!update.meta.changes) throw refused;

  await recordSuccess(env, names);

  // A code scoped to one item opens that item; an unscoped one opens everything
  // that is not already free. A scope naming an item that has since left the
  // catalogue opens nothing, which is the honest outcome — better than falling
  // back to "everything", which is how a withdrawn item gets handed out.
  const opens = DOWNLOADS.filter((d) => !d.free).filter(
    (d) => row.item_id === null || row.item_id === d.id,
  );

  // The TTL rides on the purpose (`session.ts`), not on this call — one place
  // decides how long each kind of token lives, so none of them can drift.
  const ticket = await mint(env.SESSION_SECRET, "download", opens.map((d) => d.id).join(","));

  return noStore(
    json({
      ticket,
      items: opens.map((d) => d.id),
      usesLeft: Math.max(0, row.max_uses - row.uses - 1),
    }),
  );
}

/**
 * Stream one file out of the private bucket.
 *
 * A GET rather than a POST because it is a download: the browser's own manager
 * handles it, ranges work, and nothing has to be buffered in a tab. The ticket
 * rides in the query string, which is the one place this codebase otherwise
 * refuses to put anything — and it is safe here precisely because a ticket is
 * not personal data, expires in half an hour and names no one.
 */
export async function file(request: Request, env: Env, url: URL): Promise<Response> {
  const id = url.searchParams.get("item") ?? "";
  const item = downloadById(id);
  if (!item) throw new BadRequest("No such download.", 404);

  if (!item.free) {
    const ticket = url.searchParams.get("t") ?? "";
    const token = await verify(env.SESSION_SECRET, "download", ticket);
    if (!token) throw new BadRequest("That download link has expired. Enter your code again.", 403);
    // The subject is the list the code opened, so a ticket for one item cannot
    // be re-pointed at another by editing the query string.
    if (!token.subject.split(",").includes(item.id)) {
      throw new BadRequest("That code doesn't cover this download.", 403);
    }
  }

  // RANGE REQUESTS ARE PASSED STRAIGHT TO R2, and this is the one piece of this
  // module that is about the client's actual customers rather than about
  // security. These are large binaries going to people whose connection is the
  // reason they are on this site at all; without a range the browser cannot
  // resume, so a dropout at 90% of a 300MB file means starting again. R2 parses
  // the header itself when handed the `Headers` object, so there is no range
  // parser here to have an off-by-one in.
  const object = await env.DOWNLOADS.get(item.id, { range: request.headers });
  // The catalogue is deployed and the bucket is uploaded to by hand, so the two
  // can genuinely disagree. Saying which id is missing costs nothing — the
  // catalogue is public — and turns a silent 404 into something the operator
  // can act on.
  if (!object) throw new BadRequest(`That file isn't uploaded yet (${item.id}).`, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("content-type", "application/octet-stream");
  // `attachment` and an explicit filename: without it the browser may render
  // a script or a text file in the tab instead of saving it, and the name would
  // otherwise be the opaque object key.
  headers.set("content-disposition", `attachment; filename="${item.filename.replace(/"/g, "")}"`);
  headers.set("cache-control", "private, no-store");
  // Advertised unconditionally, because a browser only *asks* for a range when
  // it has been told ranges are available.
  headers.set("accept-ranges", "bytes");

  // `object.range` is present only when R2 actually served a partial body, so
  // it — not the request header — is what decides the status. A range that R2
  // declined to honour must still answer 200 with the whole file, or the
  // browser stitches a complete file out of a response it believes is partial.
  const range = object.range;
  if (range && "offset" in range) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    const end = offset + length - 1;
    headers.set("content-range", `bytes ${offset}-${end}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { headers });
}

/* -------------------------------------------------------------------------- */
/* Operator surface                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The caller, if they are a signed-in operator. Throws otherwise.
 *
 * A local copy of `admin.ts`'s guard rather than an import, because that one is
 * private to that module and exporting it would make an accounts-administration
 * helper part of this module's contract. Three call sites, one line each — the
 * duplication is cheaper than the coupling.
 */
async function operator(request: Request, env: Env) {
  const account = await requireAccount(request, env);
  if (account.is_operator !== 1) throw new BadRequest("Only the operator can do that.", 403);
  return account;
}

/**
 * Mint a code and return it **once**.
 *
 * The plaintext exists for the length of this response and is then
 * unrecoverable, which is the same promise the recovery codes make and for the
 * same reason: a store the operator can read back is a store an attacker can
 * read back. If the client loses one before sending it, they revoke and mint
 * again — two clicks, and it keeps the database worthless to anyone who steals it.
 */
export async function mintCode(request: Request, env: Env): Promise<Response> {
  await operator(request, env);

  const body = await readBody(request);
  const label = typeof body.label === "string" ? body.label.slice(0, 120) : "";
  const itemId = typeof body.item === "string" && body.item ? body.item : null;
  if (itemId && !downloadById(itemId)) throw new BadRequest("No such download.", 404);

  const maxUses = Number.isInteger(body.maxUses) ? Math.min(50, Math.max(1, body.maxUses as number)) : 5;
  const days = Number.isInteger(body.days) ? Math.min(3650, Math.max(0, body.days as number)) : 0;

  const code = generateCode();
  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO download_codes (code_hash, label, item_id, created_at, expires_at, max_uses, uses)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(toBlob(await codeHash(env, code)), label, itemId, now, days ? now + days * 86_400_000 : null, maxUses)
    .run();

  return noStore(json({ code: formatCode(code) }));
}

export async function listCodes(request: Request, env: Env): Promise<Response> {
  await operator(request, env);

  // Everything except the hash. There is nothing here that identifies a person
  // — that is the design — so the operator sees the whole row.
  const { results } = await env.DB.prepare(
    `SELECT label, item_id, created_at, expires_at, max_uses, uses, revoked_at, last_used_at,
            substr(hex(code_hash), 1, 8) AS ref
       FROM download_codes ORDER BY created_at DESC LIMIT 200`,
  ).all();

  return noStore(json({ codes: results }));
}

/**
 * Revoke by reference — the first eight hex characters of the hash, which is
 * what the list shows. The operator cannot revoke by code because they no
 * longer have it, which is the point of not storing it.
 */
export async function revokeCode(request: Request, env: Env): Promise<Response> {
  await operator(request, env);

  const body = await readBody(request);
  const ref = typeof body.ref === "string" ? body.ref.toUpperCase() : "";
  if (!/^[0-9A-F]{8}$/.test(ref)) throw new BadRequest("Which code?");

  const result = await env.DB.prepare(
    "UPDATE download_codes SET revoked_at = ? WHERE substr(hex(code_hash), 1, 8) = ? AND revoked_at IS NULL",
  )
    .bind(Date.now(), ref)
    .run();
  if (!result.meta.changes) throw new BadRequest("That code is already revoked, or gone.", 404);

  return noStore(json({ ok: true }));
}
