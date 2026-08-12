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

import * as accounts from "./accounts";
import { clientKey } from "./crypto";
import { BadRequest } from "./encoding";
import type { Env } from "./env";
import { RateLimiter } from "./rate-limit";

export { RateLimiter };
export type { Env };

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await route(request, env, ctx, url);
    } catch (error) {
      // A `BadRequest` carries wording that was written to be shown to a user;
      // anything else carries wording that was not, so it becomes a generic 500.
      // §10 requires that failures say what to do next, and "something went
      // wrong" is the honest version of that when we genuinely do not know.
      if (error instanceof BadRequest) return problem(error.status, error.message);
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

    // Identity (§4). The order here is the order a person meets them.
    case "POST /api/auth/signup":
      return accounts.signup(request, env);
    case "POST /api/auth/challenge":
      return accounts.challenge(request, env);
    case "POST /api/auth/signin":
      return accounts.signin(request, env);
    case "POST /api/auth/totp":
      return accounts.signinTotp(request, env);
    case "POST /api/auth/signout":
      return accounts.signout(request, env);

    // The signed-in account.
    case "GET /api/me":
      return accounts.me(request, env);
    case "GET /api/account/slot":
      return accounts.keySlot(request, env);
    case "POST /api/totp/enrol":
      return accounts.totpEnrol(request, env);
    case "POST /api/totp/confirm":
      return accounts.totpConfirm(request, env);

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
