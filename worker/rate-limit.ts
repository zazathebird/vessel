/**
 * Rate limiting for sign-in and other credential operations.
 *
 * A Durable Object rather than a D1 table, because D1 offers no atomic
 * read-modify-write and a counter that loses races is a counter an attacker can
 * outrun by firing concurrently (SPEC-ACCOUNTS.md §4). One object instance owns
 * one counter, and its single-threaded execution is the whole point.
 *
 * **No raw IP address is stored here or anywhere else.** An IP is personal data
 * and the spec's §9 inventory lists it as never collected. Callers key this
 * object by an HMAC of the address under a salt that rotates daily, so a bucket
 * identifies a repeat offender inside the window and is meaningless afterwards.
 * See `clientKey` in ./crypto.ts — the hashing happens before we get here, and
 * this class never sees an address to be careless with.
 */

/**
 * Attempts allowed inside one window before backoff starts.
 *
 * A default rather than a constant, because the two kinds of bucket are counting
 * different things. An **account** bucket watches one person's credential and
 * five wrong tries is generous. A **client** bucket watches an address, and one
 * address is a household, an office, or a whole mobile carrier behind NAT — five
 * would lock out a café because one person mistyped. Callers pass what suits
 * them; the shape of the backoff is identical either way.
 */
const DEFAULT_FREE_ATTEMPTS = 5;

/** The base window. Backoff multiplies this, it does not replace it. */
const WINDOW_MS = 15 * 60 * 1000;

/**
 * Backoff doubles per failure past the free allowance, to a ceiling. The
 * ceiling exists so a forgetful owner is not locked out for a week by someone
 * else's attack on their handle.
 */
const MAX_PENALTY_MS = 60 * 60 * 1000;

export interface RateVerdict {
  /** Whether the caller may attempt at all. */
  allowed: boolean;
  /** Attempts left before backoff engages. Zero once blocked. */
  remaining: number;
  /** When the block lifts, epoch ms. Only meaningful when `allowed` is false. */
  retryAt: number;
}

interface Bucket {
  failures: number;
  /** Epoch ms before which no attempt is permitted. */
  blockedUntil: number;
  /** Epoch ms after which the bucket is stale and resets. */
  expiresAt: number;
}

const EMPTY: Bucket = { failures: 0, blockedUntil: 0, expiresAt: 0 };

export class RateLimiter {
  private state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const now = Date.now();
    const free = Number(url.searchParams.get("free")) || DEFAULT_FREE_ATTEMPTS;

    switch (url.pathname) {
      case "/check":
        return json(await this.check(now, free));
      case "/fail":
        return json(await this.fail(now, free));
      case "/succeed":
        return json(await this.succeed(now, free));
      case "/reset":
        await this.state.storage.deleteAll();
        return json({ allowed: true, remaining: free, retryAt: 0 });
      default:
        return new Response("not found", { status: 404 });
    }
  }

  /** Read the bucket, discarding it if the window has already elapsed. */
  private async load(now: number): Promise<Bucket> {
    const stored = await this.state.storage.get<Bucket>("bucket");
    if (!stored || stored.expiresAt <= now) return { ...EMPTY };
    return stored;
  }

  /** Would an attempt be permitted right now? Does not consume anything. */
  private async check(now: number, free: number): Promise<RateVerdict> {
    const bucket = await this.load(now);
    if (bucket.blockedUntil > now) {
      return { allowed: false, remaining: 0, retryAt: bucket.blockedUntil };
    }
    return {
      allowed: true,
      remaining: Math.max(0, free - bucket.failures),
      retryAt: 0,
    };
  }

  /**
   * A success, on a bucket that must not simply be wiped.
   *
   * This is for the **client** bucket, and the distinction from `/reset` is the
   * whole security of it. A wipe on success is a gift to an attacker: sign in
   * correctly to an account you own, and the counter recording your failures
   * against everybody else's accounts goes back to zero — so you can test five
   * passwords, reset, test five more, for ever. Credential stuffing is exactly
   * what this bucket exists to stop, and a wipe disables it.
   *
   * Decaying by one instead means honest traffic drains the counter roughly as
   * fast as it fills it, while a run of failures still accumulates. An attacker
   * gets one attempt back per success rather than all of them.
   */
  private async succeed(now: number, free: number): Promise<RateVerdict> {
    const bucket = await this.load(now);
    if (bucket.failures > 0) {
      bucket.failures -= 1;
      await this.state.storage.put("bucket", bucket);
    }
    return this.check(now, free);
  }

  /**
   * Record a failed attempt and return the verdict for the *next* one.
   *
   * Only failures are recorded. A successful sign-in calls /reset, so an
   * ordinary user who mistypes twice and then succeeds carries nothing forward.
   */
  private async fail(now: number, free: number): Promise<RateVerdict> {
    const bucket = await this.load(now);
    bucket.failures += 1;
    bucket.expiresAt = now + WINDOW_MS;

    const over = bucket.failures - free;
    if (over > 0) {
      // 2^over windows, capped. The cap matters: without it a sustained attack
      // on a known handle locks its owner out indefinitely, which converts a
      // brute-force attempt into a denial of service.
      const penalty = Math.min(WINDOW_MS * 2 ** (over - 1), MAX_PENALTY_MS);
      bucket.blockedUntil = now + penalty;
      bucket.expiresAt = bucket.blockedUntil + WINDOW_MS;
    }

    await this.state.storage.put("bucket", bucket);

    // Storage is dropped once the window is fully spent, so a quiet bucket
    // leaves nothing behind — including the derived key that named it.
    await this.state.storage.setAlarm(bucket.expiresAt);

    return {
      allowed: bucket.blockedUntil <= now,
      remaining: Math.max(0, free - bucket.failures),
      retryAt: bucket.blockedUntil,
    };
  }

  /** Window elapsed with no further attempts: forget this caller entirely. */
  async alarm(): Promise<void> {
    const bucket = await this.state.storage.get<Bucket>("bucket");
    if (!bucket || bucket.expiresAt <= Date.now()) {
      await this.state.storage.deleteAll();
    }
  }
}

function json(body: RateVerdict): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}
