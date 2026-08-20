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
import { mint } from "./session";
import { canDownload, resolveAccess, ticketSubject } from "./downloadPages";
import type { FileRow, PageRow } from "./downloadPages";

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
 * How much of the stored hash is the operator's handle for a code.
 *
 * Sixteen hex characters — 64 bits. It was eight, which is 32 bits with no
 * uniqueness check, and a collision silently revoked the wrong row. `mintCode`
 * now refuses a colliding handle outright, so this only has to be wide enough
 * that it never happens.
 */
const REF_LENGTH = 16;

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
  /** Page scope (2026-08-20). NULL alongside a NULL `item_id` means everything. */
  slug: string | null;
  created_at: number;
  expires_at: number | null;
  max_uses: number;
  uses: number;
  revoked_at: number | null;
  last_used_at: number | null;
}

/**
 * What a redeemed code opens, as the three lists a ticket carries.
 *
 * **A code scoped to one file also opens the page that file is on** — the page
 * is where the download button is, so a ticket that opened the bytes and not the
 * page would be a code that works and appears not to.
 *
 * **But it opens it to look at, not to take from, and the distinction is the
 * whole security of a file-scoped code** (found in review, 2026-08-20, before it
 * shipped). The first version put that page in the same list a page-scoped code
 * uses, and `canDownload` honoured that list — so a customer who bought one
 * program could fetch every other paid file on the page by changing one query
 * parameter, with the ids handed to them in the page response they were entitled
 * to. `visible` is the weaker grant and `open` is the stronger one; only `open`
 * reaches the bytes.
 */
async function opened(
  env: Env,
  row: CodeRow,
): Promise<{ open: string[]; visible: string[]; items: string[] }> {
  if (row.item_id) {
    const item = await env.DB.prepare("SELECT slug FROM download_files WHERE id = ?")
      .bind(row.item_id)
      .first<{ slug: string }>();
    // A scope naming a file that has since been deleted opens nothing. That is
    // the honest outcome; falling back to "everything" is how a withdrawn item
    // gets handed out.
    return item
      ? { open: [], visible: [item.slug], items: [row.item_id] }
      : { open: [], visible: [], items: [] };
  }
  if (row.slug) {
    /*
     * **The page is re-read, exactly as the file is above, and for a worse
     * reason than symmetry.**
     *
     * `download_codes.slug` has no foreign key and no cascade, so deleting a
     * page leaves every code minted for it alive — and a slug is a re-usable
     * `TEXT PRIMARY KEY`. Deleting `acme` and later creating a new page at the
     * same address for a different customer handed every old code the new
     * customer's page and every paid file on it, because `canRead` and
     * `canDownload` both key on `ticketPages.has(page.slug)`. Checking the page
     * still exists does not fix that on its own — `deletePage` now deletes the
     * codes too — but it is the half that cannot be forgotten by a future
     * delete path.
     */
    const page = await env.DB.prepare("SELECT slug FROM download_pages WHERE slug = ?")
      .bind(row.slug)
      .first<{ slug: string }>();
    return page ? { open: [row.slug], visible: [], items: [] } : { open: [], visible: [], items: [] };
  }

  /*
   * Unscoped: every live page it could possibly open, and with it every file on
   * them.
   *
   * **`granted` is excluded, and its absence is the point.** `canRead`'s
   * `granted` branch consults `granted()` alone and never looks at a ticket, so
   * such a page can *never* be opened by a code — including it did nothing but
   * hand the redeemer a list of slugs, and `claim` returns that list to them.
   * The whole reason `granted` 404s rather than saying "locked" is that the
   * existence of a page named after a customer is itself the thing being kept
   * quiet, and this was the one route that read it out loud.
   *
   * **`unlisted` stays, deliberately.** An unscoped code is the operator's
   * "opens everything paid" code, handed to somebody they have decided to trust
   * with everything; withholding the unlisted pages from it would make the
   * widest scope narrower than the page-scoped one. The secret there is the
   * address and this is the operator choosing to share it.
   */
  const { results } = await env.DB.prepare(
    `SELECT slug FROM download_pages
      WHERE status = 'live' AND visibility IN ('public', 'unlisted', 'code')`,
  ).all<{ slug: string }>();
  return { open: results.map((p) => p.slug), visible: [], items: [] };
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
    `SELECT code_hash, label, item_id, slug, created_at, expires_at, max_uses, uses, revoked_at, last_used_at
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
  /*
   * `RETURNING uses` so the count reported back is the one this redemption
   * actually produced. It used to be derived from `row.uses`, read *before* the
   * increment — so two concurrent redemptions of the same code both read 3, both
   * incremented, and both told their customer one use remained when none did.
   * The ceiling itself was always safe (it is re-checked in the WHERE clause and
   * zero changes is the refusal); it was only the number on screen that lied, on
   * exactly the race the WHERE clause exists to survive.
   */
  const update = await env.DB.prepare(
    `UPDATE download_codes SET uses = uses + 1, last_used_at = ?
      WHERE code_hash = ? AND revoked_at IS NULL AND uses < max_uses
      RETURNING uses`,
  )
    .bind(day, toBlob(hash))
    .all<{ uses: number }>();
  const spent = update.results?.[0]?.uses;
  if (typeof spent !== "number") throw refused;

  await recordSuccess(env, names);

  const opens = await opened(env, row);

  // The TTL rides on the purpose (`session.ts`), not on this call — one place
  // decides how long each kind of token lives, so none of them can drift.
  const ticket = await mint(
    env.SESSION_SECRET,
    "download",
    ticketSubject(opens.open, opens.visible, opens.items),
  );

  return noStore(
    json({
      ticket,
      // Both kinds, so the page can navigate somebody to what their code opened.
      // The client uses this to *point*, never to decide — the Worker asks the
      // same question again for every byte it serves.
      pages: [...opens.open, ...opens.visible],
      items: opens.items,
      usesLeft: Math.max(0, row.max_uses - spent),
    }),
  );
}

/** What a partial response is actually sending, once both sides agree there is one. */
export interface RangePlan {
  offset: number;
  length: number;
}

/**
 * Decide whether a response is a 206 and, if so, which bytes it claims to be.
 *
 * PURE AND EXPORTED BECAUSE THE ANSWER CANNOT BE READ OFF THE R2 OBJECT, and
 * believing it could shipped a bug on every download this page has ever served
 * (found 2026-08-19, the first time the bucket was made to hand over a byte).
 * `env.DOWNLOADS.get(id, { range: request.headers })` populates `object.range`
 * **whether or not the request carried a `Range` header at all** — a plain GET
 * comes back reporting `{ offset: 0, length: size }` — so testing that field for
 * an offset, which is what this module did, answered `206 Partial Content` with
 * a `content-range` covering the whole file to browsers that had asked for no
 * such thing. RFC 9110 §15.3.7 allows a 206 only in reply to a range request;
 * the browsers tolerate it and download managers and proxies are entitled not
 * to. Measured on the bench: every free item, every paid item, 206.
 *
 * So the request header decides, not the object, and the second clause is the
 * other half of the same lesson: **R2 may decline a range and send everything.**
 * An unsatisfiable `bytes=999999999-` came back as the whole object, which the
 * old code would have announced as `bytes 0-299999/300000` — a resuming client
 * that trusts a `content-range` it did not ask for writes those bytes at the
 * wrong offset. Serving the whole file as a 200 is explicitly allowed (a server
 * may ignore `Range`) and cannot be misread, so a served range that is not
 * genuinely a subset is answered as one.
 *
 * The suffix form (`bytes=-1000`) is normalised here rather than trusted,
 * because `R2Range` is a union of three shapes and only one of them carries an
 * offset. Clamped to the object, so no arithmetic here can claim a byte that
 * does not exist.
 */
export function rangePlan(asked: boolean, served: R2Range | undefined, size: number): RangePlan | null {
  if (!asked || !served) return null;

  const suffix = "suffix" in served ? served.suffix : undefined;
  const rawOffset = suffix !== undefined ? size - suffix : ("offset" in served ? (served.offset ?? 0) : 0);
  const offset = Math.min(Math.max(0, rawOffset), size);
  const rawLength =
    suffix !== undefined ? suffix : "length" in served ? (served.length ?? size - offset) : size - offset;
  const length = Math.min(Math.max(0, rawLength), size - offset);

  // The whole object is not a partial response, however it was asked for.
  if (offset === 0 && length === size) return null;

  return { offset, length };
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
  /*
   * **One refusal for "no such file" and for "not yours", and it is the same
   * one.**
   *
   * This route used to answer 404 for an unknown id and 403 for a known one the
   * caller could not have — which makes the status code an existence oracle over
   * the whole table, unauthenticated and unthrottled. Ids are lowercase-kebab
   * and the operator names files after what they are and who they are for, so
   * walking `?item=acme-corp-build` told an attacker exactly which files exist,
   * **including files on draft and `granted` pages whose ids appear in no
   * response they are entitled to**.
   *
   * That is the rule this module states three times over — "the shape of the
   * failure is itself information about what exists" — and `readPage` has always
   * honoured it by answering the same 404 for a missing page and a refused one.
   * This route did not.
   */
  const denied = new BadRequest("That download isn't available to you. Check your code and try again.", 403);

  const id = url.searchParams.get("item") ?? "";
  const item = await env.DB.prepare("SELECT * FROM download_files WHERE id = ?")
    .bind(id)
    .first<FileRow>();
  if (!item) throw denied;
  const page = await env.DB.prepare("SELECT * FROM download_pages WHERE slug = ?")
    .bind(item.slug)
    .first<PageRow>();
  if (!page) throw denied;

  /*
   * **The same question the page render asked, asked by the same function.**
   *
   * This route used to carry its own rule — free, or a ticket naming the item —
   * which was right when a file's only gate was its own `free` flag. It is not
   * enough now: a file also sits on a page that may be a draft, unlisted, code-
   * gated or granted to particular accounts, and two places deciding that
   * independently is two places that agree until one of them is edited.
   * `canDownload` starts by asking `canRead` about the page, so bytes can never
   * escape through a page the caller was refused.
   */
  const access = await resolveAccess(request, env, url);
  // One message for every refusal — expired ticket, wrong scope, no grant, a
  // draft page, an id that never existed — for the reason `claim`'s refusal is
  // one message: the shape of the failure is itself information about what
  // exists.
  if (!canDownload(page, item, access)) throw denied;

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
  /*
   * `attachment` and an explicit filename: without it the browser may render a
   * script or a text file in the tab instead of saving it, and the name would
   * otherwise be the opaque object key.
   *
   * **BOTH FORMS, AND THE ASCII ONE IS NOT OPTIONAL.** `headers.set` performs a
   * WebIDL `ByteString` conversion, so a single character above U+00FF throws
   * `TypeError: … greater than 255` — which is not a 400 on the upload, it is a
   * **500 on every click, for ever**, on a row that saved cleanly and lists
   * normally with a working button. `Réparation.exe` is an entirely ordinary
   * name for this operator's files, so the answer is to encode it rather than to
   * refuse it: `filename` carries a flattened ASCII version for anything that
   * only understands RFC 6266's original form, and `filename*` carries the real
   * one per RFC 5987. Modern browsers prefer `filename*`, so the customer gets
   * the accents and nobody gets a 500.
   *
   * `saveFile` refuses control characters, quotes and backslashes on the way in,
   * so the quoted form cannot be broken out of; this strips them again anyway,
   * because a value stored by an earlier, laxer version of that guard is exactly
   * the one nobody re-checks.
   */
  const ascii = item.filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  headers.set(
    "content-disposition",
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(item.filename)}`,
  );
  headers.set("cache-control", "private, no-store");
  // Advertised unconditionally, because a browser only *asks* for a range when
  // it has been told ranges are available.
  headers.set("accept-ranges", "bytes");

  // `rangePlan` decides, and the comment on it is the reason: `object.range` is
  // populated even for a request that carried no `Range` header, so it cannot
  // be the test. A range R2 declined to honour answers 200 with the whole file,
  // or the browser stitches a complete file out of a response it believes is
  // partial — and one that never asked gets a plain 200, as it must.
  const plan = rangePlan(request.headers.has("range"), object.range, object.size);
  if (plan) {
    /*
     * **A zero-length plan is 416, not 206.** `rangePlan` clamps rather than
     * rejecting, so a range starting at or past the end comes back as
     * `{ offset: size, length: 0 }` — and the old arithmetic then emitted
     * `content-range: bytes 300000-299999/300000`, a last-byte-pos *below* the
     * first, which RFC 9110 §14.4 does not permit. A resuming download manager
     * that parses it computes a negative length; a strict proxy drops the
     * response. `Range: bytes=300000-` against a file already complete is the
     * everyday way to produce it, and these are 300MB files on connections that
     * drop — resuming is the whole reason ranges are advertised here.
     *
     * The check suite asserted this shape as *correct* (`{offset: size, length:
     * 0}`) and only ever tested `offset + length <= size`, so it blessed the
     * bug. It has a `length === 0` row now.
     */
    if (plan.length <= 0) {
      const refuse = new Headers();
      refuse.set("content-range", `bytes */${object.size}`);
      refuse.set("accept-ranges", "bytes");
      refuse.set("cache-control", "private, no-store");
      return new Response(null, { status: 416, headers: refuse });
    }

    const end = plan.offset + plan.length - 1;
    headers.set("content-range", `bytes ${plan.offset}-${end}/${object.size}`);
    headers.set("content-length", String(plan.length));
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
  /*
   * A code may now be scoped to a whole **page** as well as to one file
   * (2026-08-20), which is what makes a `code`-gated page usable: one code opens
   * the page and everything on it, and that is the natural unit when the page
   * *is* the product. Both scopes are checked against the database rather than
   * accepted, so a typo in the admin screen is a refusal now instead of a code
   * that opens nothing and is discovered by the customer.
   */
  const slug = typeof body.slug === "string" && body.slug ? body.slug : null;
  if (itemId && slug) throw new BadRequest("Scope a code to a page or to one file, not both.");
  if (itemId) {
    const has = await env.DB.prepare("SELECT id FROM download_files WHERE id = ?").bind(itemId).first();
    if (!has) throw new BadRequest("No such download.", 404);
  }
  if (slug) {
    const has = await env.DB.prepare("SELECT slug, visibility FROM download_pages WHERE slug = ?")
      .bind(slug)
      .first<{ slug: string; visibility: string }>();
    if (!has) throw new BadRequest("No such page.", 404);
    /*
     * **A code can never open a `granted` page, so minting one is refused.**
     *
     * `canRead`'s `granted` branch consults the account's grants alone and never
     * looks at a ticket — by design, because that visibility exists for people
     * who sign in. So a code minted for such a page is not merely weak, it is
     * inert: it redeems successfully, reports the page as opened, and then opens
     * nothing. That is precisely the failure the existence check above was added
     * to prevent, with a forgotten visibility in place of a typo, and the
     * customer is who finds out. A draft is deliberately still allowed — minting
     * before publishing is a normal order of work.
     */
    if (has.visibility === "granted") {
      throw new BadRequest(
        "That page is set to “Only people I've named”, which codes cannot open. Give them access by name, or change the page to “Needs an access code”.",
      );
    }
  }

  const maxUses = Number.isInteger(body.maxUses) ? Math.min(50, Math.max(1, body.maxUses as number)) : 5;
  const days = Number.isInteger(body.days) ? Math.min(3650, Math.max(0, body.days as number)) : 0;

  const code = generateCode();
  const now = Date.now();

  /*
   * **The revoke handle has to be unique or revoking is a coin flip.**
   *
   * `listCodes` shows, and `revokeCode` matches on, a prefix of the stored hash.
   * At the old eight hex characters that is 32 bits with no uniqueness check
   * anywhere — birthday-bound, so a few hundred codes make a collision a real
   * possibility, and `revokeCode`'s `UPDATE … WHERE substr(...) = ?` has no
   * `LIMIT`. Two rows sharing a prefix meant revoking one silently revoked the
   * other, with two identical-looking rows in the list and no way to tell them
   * apart. The direction is fail-safe and the failure is silent, which is the
   * bad combination: the paying customer whose working code stopped is who finds
   * out.
   *
   * Sixteen characters is 64 bits, and it is checked anyway — the cost of one
   * indexed-ish read per mint, against a class of bug nobody could diagnose from
   * the symptom.
   */
  const ref = (await codeHash(env, code))
    .reduce((s, b) => s + b.toString(16).padStart(2, "0"), "")
    .slice(0, REF_LENGTH)
    .toUpperCase();
  const clash = await env.DB.prepare(
    `SELECT 1 FROM download_codes WHERE substr(hex(code_hash), 1, ${REF_LENGTH}) = ?`,
  )
    .bind(ref)
    .first();
  if (clash) {
    // Astronomically unlikely, and an honest refusal beats a silent collision.
    throw new BadRequest("Couldn't mint that one — try again.", 503);
  }

  await env.DB.prepare(
    `INSERT INTO download_codes (code_hash, label, item_id, slug, created_at, expires_at, max_uses, uses)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  )
    .bind(
      toBlob(await codeHash(env, code)),
      label,
      itemId,
      slug,
      now,
      days ? now + days * 86_400_000 : null,
      maxUses,
    )
    .run();

  return noStore(json({ code: formatCode(code) }));
}

export async function listCodes(request: Request, env: Env): Promise<Response> {
  await operator(request, env);

  // Everything except the hash. There is nothing here that identifies a person
  // — that is the design — so the operator sees the whole row.
  const { results } = await env.DB.prepare(
    `SELECT label, item_id, slug, created_at, expires_at, max_uses, uses, revoked_at, last_used_at,
            substr(hex(code_hash), 1, ${REF_LENGTH}) AS ref
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
  if (!new RegExp(`^[0-9A-F]{${REF_LENGTH}}$`).test(ref)) throw new BadRequest("Which code?");

  const result = await env.DB.prepare(
    `UPDATE download_codes SET revoked_at = ?
      WHERE substr(hex(code_hash), 1, ${REF_LENGTH}) = ? AND revoked_at IS NULL`,
  )
    .bind(Date.now(), ref)
    .run();
  if (!result.meta.changes) throw new BadRequest("That code is already revoked, or gone.", 404);

  return noStore(json({ ok: true }));
}
