/**
 * The Worker's bindings and secrets, in their own module.
 *
 * Split out of `index.ts` so that the handler modules can name the type without
 * importing the entry point that imports them. The cycle would resolve at
 * runtime — ESM tolerates it for types — but it makes the dependency direction
 * of the account layer unreadable, and this file costs nothing.
 */

export interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  RATE_LIMIT: DurableObjectNamespace;
  /** One signalling object per paired machine (SPEC-ACCOUNTS.md §8, §13). */
  SIGNAL: DurableObjectNamespace;

  /**
   * Private bucket holding the downloadable programs (2026-08-19).
   *
   * PRIVATE IS THE WHOLE POINT. These files are sold, and R2 buckets have no
   * public URL unless one is deliberately attached — so the only way to a byte
   * is `worker/downloads.ts`, after a code check. Put one of these in `public/`
   * and the code entry in front of it becomes decoration.
   */
  DOWNLOADS: R2Bucket;

  /** HMAC key for stored auth hashes (§4). */
  AUTH_PEPPER: string;
  /** HMAC key for session cookies. */
  SESSION_SECRET: string;
  /** Wraps totp.secret_enc at rest. */
  TOTP_ENC_KEY: string;
  /** Seeds the daily-rotating rate-limit salt. */
  RATE_SALT_SEED: string;
}
