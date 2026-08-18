/**
 * The published site appearance — one look, served to everybody.
 *
 * The operator's palette, layout, effect, ornament and typeface are not their
 * own preferences; they are the site's. So they are stored server-side and
 * handed to every visitor, and the config panel that sets them is visible only
 * when signed in as the operator.
 *
 * **How it reaches the browser is the interesting part.** Not a fetch. §11
 * requires that nothing which works today acquires a dependency on a network
 * call, and `ConfigContext` reads its config during the first render
 * specifically so there is no flash of the default palette. A fetch would
 * reintroduce exactly that flash, one 0.9s bleed wide, on every cold load.
 *
 * So the Worker injects the published config into the app shell as it serves
 * it, and the browser reads it synchronously from `window.__VESSEL_SITE__`
 * before React mounts. If this table is empty, or D1 is unreachable, or the
 * injection fails, nothing is injected and the site renders its built-in
 * defaults — which is the site exactly as it was before this file existed.
 */

import { BadRequest } from "./encoding";
import type { Env } from "./env";
import { json, readJson, requireAccount } from "./accounts";

/** Fields the operator publishes. `page` and `unlocked` are per-visit and per-browser. */
const PUBLISHED_KEYS = [
  "pal",
  "layout",
  "fx",
  "ornament",
  "type",
  "mode",
  "scope",
  "calm",
  "grain",
  "breathe",
  "cursor",
  // Tile slot captions (2026-08-14) — operator-only, default off.
  "slots",
  // Interface sounds (2026-08-14). Kept in step with `PUBLISHED_KEYS` in
  // src/config/siteConfig.ts, which carries the reasoning: a key missing here
  // is silently dropped on publish, so the operator's own browser would show a
  // setting that never reached anybody else.
  "sound",
  // Layout entrances (2026-08-18) — same kept-in-step rule as `sound` above.
  "entrances",
  // Where the hero ornament holds (2026-08-18) — same kept-in-step rule. This
  // one is an enum rather than a flag, so a drop here does not degrade to a
  // sensible default the way a missing boolean does: the operator publishes
  // "Roam" and every visitor gets "Hold" with nothing to indicate why.
  "station",
] as const;

/**
 * A ceiling on what can be stored, since this string is injected into every
 * page the site serves. The real config is a couple of hundred bytes.
 */
const MAX_CONFIG_BYTES = 2_000;

/**
 * Cache the published row inside the isolate for a few seconds.
 *
 * Without this, every HTML request costs a D1 read — including the ones that
 * matter least, like a crawler walking all nine pages. With it, a publish takes
 * up to this long to reach visitors who land on a warm isolate, which is a fair
 * trade for a setting that changes when somebody feels like a different colour.
 * The operator sees their own change immediately regardless: their browser
 * applied it locally the moment they clicked it.
 */
const CACHE_MS = 10_000;

let cached: { value: string | null; at: number } | null = null;

/** The published config as a JSON string, or null if nothing is published. */
export async function published(env: Env): Promise<string | null> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  try {
    const row = await env.DB.prepare("SELECT config FROM site_config WHERE id = 1").first<{
      config: string;
    }>();
    cached = { value: row?.config ?? null, at: now };
    return cached.value;
  } catch {
    // A missing table (migration not yet applied) or an unreachable D1 must not
    // take the site down with it. Serving the built-in look is the correct
    // degradation, and it is what every visitor got until this shipped.
    cached = { value: null, at: now };
    return null;
  }
}

/** Read it back — mostly so a publish can be verified without a browser. */
export async function readSiteConfig(_request: Request, env: Env): Promise<Response> {
  const raw = await published(env);
  return json({ config: raw ? (JSON.parse(raw) as unknown) : null });
}

/**
 * Publish. Operator only.
 *
 * The values are **not** validated against the catalogue here, and that is
 * deliberate rather than lax. The legal palettes, layouts, effects, ornaments
 * and typesets live in `src/data/`, and restating those lists in the Worker
 * would give the project two sources of truth that drift the first time one
 * gains an entry — a new palette would be publishable but rejected, or worse,
 * accepted and unrenderable. The browser already validates this object field by
 * field on read and falls back per field, so a nonsense value costs a fallback
 * rather than a broken site. What is checked here is shape and size: that this
 * is an object of known keys small enough to inline into every page.
 */
export async function publishSiteConfig(request: Request, env: Env): Promise<Response> {
  const account = await requireAccount(request, env);
  if (!account.is_operator) throw new BadRequest("Only the operator can change the site.", 403);

  const body = await readJson(request);
  const incoming = body.config;
  if (typeof incoming !== "object" || incoming === null || Array.isArray(incoming)) {
    throw new BadRequest("Send a config object.");
  }

  const source = incoming as Record<string, unknown>;
  const clean: Record<string, unknown> = {};
  for (const key of PUBLISHED_KEYS) {
    if (key in source && source[key] !== undefined) clean[key] = source[key];
  }
  if (Object.keys(clean).length === 0) throw new BadRequest("Nothing in that config to publish.");

  const encoded = JSON.stringify(clean);
  if (encoded.length > MAX_CONFIG_BYTES) throw new BadRequest("That config is too large.");

  await env.DB.prepare(
    `INSERT INTO site_config (id, config, published_at, published_by)
          VALUES (1, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE
            SET config = excluded.config,
                published_at = excluded.published_at,
                published_by = excluded.published_by`,
  )
    .bind(encoded, Date.now(), account.id)
    .run();

  // The isolate that served the write is not the only one running, but clearing
  // here means the operator's next request cannot show them their own stale
  // value, which is the confusing case.
  cached = null;

  return json({ status: "published", config: JSON.parse(encoded) as unknown });
}

/**
 * Inline the published config into the app shell.
 *
 * `HTMLRewriter` streams, so this adds no meaningful latency and never buffers
 * the document. The script goes at the end of `<head>`, before the bundle, so
 * the value is on `window` by the time React's first render reads it.
 *
 * `<` is escaped because the payload sits inside a `<script>` element, where
 * the HTML parser is looking for `</script>` and nothing else can stop it. The
 * values here come from an operator, not a visitor — but a rule that depends on
 * who typed it is one that breaks the day it stops being true.
 *
 * The `nonce` comes from `harden`'s caller in `index.ts` and ties this one
 * inline script to the page's CSP (TODO 12): the policy names the nonce, this
 * attribute matches it, and everything inline that *didn't* come through here
 * stays a violation. The nonce is server-minted base64, never visitor input.
 */
export async function withSiteConfig(
  response: Response,
  env: Env,
  nonce?: string,
): Promise<Response> {
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("text/html")) return response;

  const raw = await published(env);
  if (!raw) return response;

  const payload = raw.replace(/</g, "\\u003c");
  const attr = nonce ? ` nonce="${nonce}"` : "";

  return new HTMLRewriter()
    .on("head", {
      element(head) {
        head.append(`<script${attr}>window.__VESSEL_SITE__=${payload}</script>`, { html: true });
      },
    })
    .transform(response);
}
