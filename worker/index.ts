/**
 * The Vessel Worker.
 *
 * Two jobs, in this order of importance:
 *
 * 1. **Serve the site.** Everything that is not `/api/*` goes to the static
 *    assets binding, which serves `dist/` and falls back to the app shell so
 *    the nine client-routed URLs work. If every route below were deleted, the
 *    site would serve exactly as it does today. That is deliberate — accounts
 *    are strictly additive and nothing that works now may acquire a dependency
 *    on a network call (SPEC-ACCOUNTS.md §11).
 *
 * 2. **Serve the account API**, under `/api/`. Signed-out visitors never touch
 *    it.
 */

import { RateLimiter } from "./rate-limit";
import { clientKey } from "./crypto";

export { RateLimiter };

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RATE_LIMIT: DurableObjectNamespace;

  /** HMAC key for stored auth hashes (§4). */
  AUTH_PEPPER: string;
  /** HMAC key for session cookies. */
  SESSION_SECRET: string;
  /** Wraps totp.secret_enc at rest. */
  TOTP_ENC_KEY: string;
  /** Seeds the daily-rotating rate-limit salt. */
  RATE_SALT_SEED: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await route(request, env, ctx, url);
    } catch (error) {
      // Never leak an internal error to the client. §10 requires that failures
      // state what to do next, and "something went wrong" with a 500 is the
      // honest version of that when we genuinely do not know.
      console.error("unhandled", error);
      return problem(500, "Something went wrong at our end. Try again shortly.");
    }
  },
} satisfies ExportedHandler<Env>;

async function route(
  request: Request,
  env: Env,
  _ctx: ExecutionContext,
  url: URL,
): Promise<Response> {
  switch (`${request.method} ${url.pathname}`) {
    case "GET /api/health":
      return health(env);
    default:
      return problem(404, "No such endpoint.");
  }
}

/**
 * Liveness, and specifically the two things that can be misconfigured in a way
 * the site would otherwise hide: D1 reachable with the migration applied, and
 * the Durable Object namespace answering.
 */
async function health(env: Env): Promise<Response> {
  const row = await env.DB.prepare(
    "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN ('accounts','credentials','key_slots','totp','setups','audit')",
  ).first<{ n: number }>();

  const key = await clientKey("0.0.0.0", env.RATE_SALT_SEED ?? "dev-seed");
  const limiter = env.RATE_LIMIT.get(env.RATE_LIMIT.idFromName(key));
  const verdict = await limiter.fetch("https://rate-limit/check").then((r) => r.json());

  return Response.json({
    ok: row?.n === 6,
    tables: row?.n ?? 0,
    rateLimit: verdict,
  });
}

/** A failure the client is expected to act on. */
function problem(status: number, detail: string): Response {
  return Response.json({ error: detail }, { status });
}
