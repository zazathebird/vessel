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

  let body: { error?: string };
  try {
    body = await response.json();
  } catch {
    if (response.ok) {
      // A 200 whose body is not JSON is not our Worker — a captive portal or an
      // intermediary's error page. Passing `{}` through as the result would let
      // a flow "succeed" on nothing: signup would create the account server-side
      // and then never show the recovery codes it only shows once.
      throw new ApiError(0, "The server sent an unexpected response. Try again shortly.");
    }
    body = {};
  }
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

/** A passkey sign-in completes in one step — no TOTP stage. See `src/auth/passkeys.ts`. */
export interface PasskeySignInResult {
  status: "signed-in";
  account: PublicAccount;
  resetAt: number | null;
  /**
   * The passkey's own slot, when it has one. Opening it takes a fresh `prf`
   * evaluation — a second authenticator gesture — because the sign-in
   * assertion's own `prf` output is deliberately not retained
   * (`signInWithPasskey` discards it; unlike a spent recovery code it is
   * re-derivable at will, so nothing is stranded by letting it go).
   */
  keySlot?: WrappedKeySlot;
}

/** One passkey, as the account screen lists it. */
export interface PasskeyInfo {
  id: string;
  label: string;
  createdAt: number;
  lastUsedAt: number | null;
  /** False means no `prf`: it signs in and can never open the grant key. */
  hasSlot: boolean;
}

/** One saved setup: a name and the share code it pins (SPEC-ACCOUNTS §11). */
export interface SavedSetup {
  id: string;
  name: string;
  shareCode: string;
  createdAt: number;
}

/** One drive: a label for a folder whose handle only the agent tab holds (§9). */
export interface DriveInfo {
  id: string;
  label: string;
  createdAt: number;
}

/** One paired machine — a browser profile holding handles and a machine key (§12 M). */
export interface MachineInfo {
  id: string;
  name: string;
  /** Base64url uncompressed P-256 point; verifies the agent's signed DTLS fingerprint. */
  agentPubkey: string;
  pairedAt: number;
  lastSeen: number | null;
  /** The signalling object's socket state, asked live — never persisted (§12 N). */
  online: boolean;
  drives: DriveInfo[];
}

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
  // The slot is ciphertext the password's wrapping key opens, so the request
  // proves the password (`authSecret`) — a session alone is not enough. See
  // `keySlot` in `worker/accounts.ts` for what that closes off.
  keySlot: (authSecret: string) =>
    post<{ wrappedGrantKey: string; grantPubkey: string; alg: string }>("/api/account/slot", {
      authSecret,
    }),
  // Both TOTP calls demand the password (`authSecret` in the body): adding a
  // credential is a credential change, and the Worker's `requirePassword` 401s
  // without it. The enrolment screen derives it and passes the whole body here.
  totpEnrol: (body: unknown) => post<{ secret: string; uri: string }>("/api/totp/enrol", body),
  totpConfirm: (body: unknown) => post<{ backupCodes: string[] }>("/api/totp/confirm", body),

  // Passkeys. The two `challenge` calls mint stateless five-minute tokens; the
  // `rpId`/`origin` they return exist for the e2e harness's software
  // authenticator — a real browser writes its own and the Worker checks against
  // the request, which is the security model.
  passkeyChallenge: () =>
    post<{ token: string; challenge: string; rpId: string; origin: string }>(
      "/api/passkey/challenge",
      {},
    ),
  passkeyRegister: (body: unknown) =>
    post<{ status: string; slotWrapped: boolean }>("/api/passkey/register", body),
  passkeyList: () => call<{ passkeys: PasskeyInfo[] }>("/api/passkeys"),
  passkeyRemove: (body: unknown) => post<{ status: string }>("/api/passkey/remove", body),
  passkeySignInChallenge: () =>
    post<{ token: string; challenge: string; rpId: string; origin: string }>(
      "/api/auth/passkey/challenge",
      {},
    ),
  passkeySignIn: (body: unknown) => post<PasskeySignInResult>("/api/auth/passkey", body),

  // Saved setups — session-gated; saving a look is not a credential change.
  setupsList: () => call<{ setups: SavedSetup[] }>("/api/setups"),
  setupSave: (name: string, shareCode: string) =>
    post<{ status: string; setup: SavedSetup }>("/api/setups", { name, shareCode }),
  setupDelete: (id: string) => post<{ status: string }>("/api/setups/delete", { id }),

  // Machines and drives (§13). Pairing carries the password proof (`authSecret`)
  // because registering an agent public key adds a trust anchor (§12 L); the
  // rest are session-gated labels. The pair response's `grantPubkey` is the
  // agent tab's trust root, stored at pair time and never re-fetched.
  machinePair: (body: unknown) =>
    post<{ status: string; machine: MachineInfo; grantPubkey: string }>(
      "/api/machines/pair",
      body,
    ),
  machinesList: () => call<{ machines: MachineInfo[] }>("/api/machines"),
  machineRename: (machineId: string, name: string) =>
    post<{ status: string }>("/api/machines/rename", { machineId, name }),
  machineRemove: (machineId: string) =>
    post<{ status: string }>("/api/machines/remove", { machineId }),
  driveAdd: (machineId: string, label: string) =>
    post<{ status: string; drive: DriveInfo }>("/api/drives", { machineId, label }),
  driveRemove: (driveId: string) => post<{ status: string }>("/api/drives/remove", { driveId }),

  /*
   * Downloads (2026-08-19). `downloadClaim` is the only route in this object
   * that a signed-out stranger calls on purpose — everything else here either
   * creates a session or assumes one. There is deliberately no `download` call
   * for the file itself: that is a plain anchor to a plain URL, so the browser
   * streams it and its own download manager owns the transfer. Fetching it here
   * would mean buffering the whole file into the tab and handing it over as a
   * `blob:`, which is the one construct still blocking the CSP flip.
   */
  downloadClaim: (code: string) =>
    post<{ ticket: string; items: string[]; usesLeft: number }>("/api/downloads/claim", { code }),

  adminDownloadsList: () => call<{ codes: DownloadCodeRow[] }>("/api/admin/downloads"),
  adminDownloadMint: (body: { label: string; item: string | null; maxUses: number; days: number }) =>
    post<{ code: string }>("/api/admin/downloads/mint", body),
  adminDownloadRevoke: (ref: string) =>
    post<{ ok: true }>("/api/admin/downloads/revoke", { ref }),
};

/** One row of the operator's code list. Holds nothing that identifies a person. */
export interface DownloadCodeRow {
  /** First eight hex characters of the stored hash — the handle for revocation. */
  ref: string;
  label: string;
  item_id: string | null;
  created_at: number;
  expires_at: number | null;
  max_uses: number;
  uses: number;
  revoked_at: number | null;
  last_used_at: number | null;
}
