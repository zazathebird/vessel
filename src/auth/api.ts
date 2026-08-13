/**
 * The transport half of the account layer: one place that knows how to talk to
 * the Worker, and nothing that knows how to derive a key.
 *
 * Deliberately not a React hook and deliberately not a context. §11 requires
 * that `ConfigContext` stays synchronous and gains no fetching — it loads
 * config during first render specifically to avoid a default-palette flash — so
 * every network call in this project starts here and is owned by the account
 * layer above it.
 *
 * `credentials: "same-origin"` is on every request because the session is a
 * cookie. It is the default for same-origin fetches, and it is written out
 * anyway: the day someone points this at a different origin, the silent version
 * of that change is a sign-in that appears to work and then forgets you.
 */

/** A failure with wording the Worker intends to be shown to the user as-is (§10). */
export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { "content-type": "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    // A network failure is not a server error and must not be reported as one.
    // §11: everything degrades — signed out, offline or Worker-down, the site is
    // the site that exists today.
    throw new ApiError(0, "Could not reach the server. Check your connection and try again.");
  }

  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new ApiError(response.status, body.error ?? "Something went wrong. Try again shortly.");
  }
  return body as T;
}

function post<T>(path: string, body: unknown): Promise<T> {
  return call<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export interface PublicAccount {
  id: string;
  handle: string;
  isOperator: boolean;
  createdAt: number;
}

/** What the server knows about the KDF, and therefore what the browser must use. */
export interface KdfDescriptor {
  salt: string;
  iterations: number;
  recoveryIterations: number;
}

/** Ciphertext the server cannot open, returned to the one account it belongs to (§5). */
export interface WrappedKeySlot {
  wrappedGrantKey: string;
  grantPubkey: string;
  alg: string;
}

export type SignInResult =
  | {
      status: "signed-in";
      account: PublicAccount;
      resetAt: number | null;
      /** Present only when a recovery code was redeemed — open it now or it is lost. */
      keySlot?: WrappedKeySlot;
      /**
       * Present only when a recovery code was redeemed: the one-shot capability
       * to set a password without presenting the current one. Fifteen minutes,
       * and deliberately not a cookie — see `TokenPurpose` in `worker/session.ts`.
       */
      setPasswordTicket?: string;
    }
  | { status: "totp-required"; ticket: string };

export interface MeResult {
  account: PublicAccount;
  resetAt: number | null;
  credentials: { password: boolean; passkeys: number; recoveryCodesRemaining: number };
  totp: { enrolled: boolean; confirmed: boolean };
}

/** One account, as the administration screen sees it. No secrets, by design. */
export interface AdminAccount {
  id: string;
  handle: string;
  isOperator: boolean;
  createdAt: number;
  resetAt: number | null;
  credentials: { password: boolean; passkeys: number; recoveryCodesRemaining: number };
  totp: { confirmed: boolean };
}

export const api = {
  signup: (body: unknown) => post<{ account: PublicAccount }>("/api/auth/signup", body),
  challenge: (handle: string) => post<{ kdf: KdfDescriptor }>("/api/auth/challenge", { handle }),
  signin: (body: unknown) => post<SignInResult>("/api/auth/signin", body),
  totp: (ticket: string, code: string) => post<SignInResult>("/api/auth/totp", { ticket, code }),
  signout: () => post<{ status: string }>("/api/auth/signout", {}),
  /** Publish the site's appearance to every visitor. Operator only — 403 otherwise. */
  publishSiteConfig: (config: unknown) =>
    post<{ status: string; config: unknown }>("/api/site-config", { config }),

  // Operator administration. Each refuses a caller who is not an operator, so a
  // non-operator reaching these gets the Worker's 403 wording rather than a
  // silently empty screen.
  adminAccounts: () => call<{ accounts: AdminAccount[] }>("/api/admin/accounts"),
  adminSetOperator: (id: string, isOperator: boolean) =>
    post<{ status: string }>("/api/admin/operator", { id, isOperator }),
  adminResetTotp: (id: string) => post<{ status: string }>("/api/admin/reset-totp", { id }),
  /** Delete the password credential and its key slot. Returns status only — never key material. */
  adminResetPassword: (id: string) =>
    post<{ status: string }>("/api/admin/reset-password", { id }),
  adminDeleteAccount: (id: string) =>
    post<{ status: string }>("/api/admin/delete-account", { id }),
  me: () => call<MeResult>("/api/me"),
  /** Replace the password credential and re-seal its key slot under the new password. */
  changePassword: (body: unknown) => post<{ status: string }>("/api/account/password", body),
  /** The same, for someone who arrived by recovery code and has no current password. */
  setPassword: (body: unknown) => post<{ status: string }>("/api/account/set-password", body),
  keySlot: () =>
    call<{ wrappedGrantKey: string; grantPubkey: string; alg: string }>("/api/account/slot"),
  // Both TOTP calls demand the password (`authSecret` in the body): adding a
  // credential is a credential change, and the Worker's `requirePassword` 401s
  // without it. The enrolment screen derives it and passes the whole body here.
  totpEnrol: (body: unknown) => post<{ secret: string; uri: string }>("/api/totp/enrol", body),
  totpConfirm: (body: unknown) => post<{ backupCodes: string[] }>("/api/totp/confirm", body),
};
