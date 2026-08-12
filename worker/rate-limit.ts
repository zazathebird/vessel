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

/** Attempts allowed inside one window before backoff starts. */
const FREE_ATTEMPTS = 5;

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

    switch (url.pathname) {
      case "/check":
        return json(await this.check(now));
      case "/fail":
        return json(await this.fail(now));
      case "/reset":
        await this.state.storage.deleteAll();
        return json({ allowed: true, remaining: FREE_ATTEMPTS, retryAt: 0 });
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
  private async check(now: number): Promise<RateVerdict> {
    const bucket = await this.load(now);
    if (bucket.blockedUntil > now) {
      return { allowed: false, remaining: 0, retryAt: bucket.blockedUntil };
    }
    return {
      allowed: true,
      remaining: Math.max(0, FREE_ATTEMPTS - bucket.failures),
      retryAt: 0,
    };
  }

  /**
   * Record a failed attempt and return the verdict for the *next* one.
   *
   * Only failures are recorded. A successful sign-in calls /reset, so an
   * ordinary user who mistypes twice and then succeeds carries nothing forward.
   */
  private async fail(now: number): Promise<RateVerdict> {
    const bucket = await this.load(now);
    bucket.failures += 1;
    bucket.expiresAt = now + WINDOW_MS;

    const over = bucket.failures - FREE_ATTEMPTS;
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
      remaining: Math.max(0, FREE_ATTEMPTS - bucket.failures),
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
