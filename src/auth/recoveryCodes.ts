/**
 * Recovery codes — the second of §4's four recovery paths, and the last one
 * that keeps everything.
 *
 * Ten are issued at signup. Each is a credential in its own right (§4: "an
 * account is a display handle plus one or more credentials"), which means each
 * carries its own key slot, which in turn means redeeming one restores **grant
 * authority in full** rather than merely letting the user back in. That is the
 * whole reason they are not simply a password-reset token: operator reset is
 * path three precisely because it cannot do this.
 *
 * They are also the path a user is most likely to interact with on paper, so the
 * alphabet is chosen for transcription rather than for density.
 */

/**
 * Crockford's base32 alphabet: the digits and uppercase letters minus `I`, `L`,
 * `O` and `U`. The first three are dropped because they are unreadable next to
 * `1` and `0` in most typefaces — including this site's, which offers five and
 * cannot promise any of them disambiguates. `U` is dropped because its absence
 * is what stops a random code spelling something unfortunate.
 */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const CODE_LENGTH = 20;
const GROUP = 5;

/** §4 fixes the count. */
export const RECOVERY_CODE_COUNT = 10;

/**
 * One code, grouped for reading: `K7M2P-9XQRT-4WVN8-BCDF3`.
 *
 * Twenty symbols over a 32-letter alphabet is 100 bits, which is why
 * `RECOVERY_ITERATIONS` in ./derive.ts can be an order of magnitude below the
 * password count without weakening anything — see the note there.
 *
 * The masking is uniform rather than nearly so: 256 divides by 32 exactly, so
 * `byte & 31` has no modulo bias to apologise for.
 */
export function newRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    if (i > 0 && i % GROUP === 0) code += "-";
    code += ALPHABET[bytes[i] & 31];
  }
  return code;
}

export function newRecoveryCodes(count = RECOVERY_CODE_COUNT): string[] {
  return Array.from({ length: count }, newRecoveryCode);
}

/**
 * Fold the ways a person might type a code back onto the way it was generated.
 *
 * The ambiguous letters are *accepted and mapped* rather than rejected, which is
 * the point of choosing this alphabet: someone reading `0` off a card and typing
 * `O` has not made a mistake worth an error message. Grouping hyphens and any
 * whitespace go, because a code copied out of a password manager arrives with
 * neither and one typed by hand arrives with both.
 *
 * Both the slot derivation and the server-side lookup run on this same
 * normalised form, so they cannot disagree about what a user typed.
 */
export function normaliseRecoveryCode(input: string): string {
  return input
    .replace(/[\s-]/g, "")
    .toUpperCase()
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** Whether a string could be a code at all, checked before any crypto runs. */
export function looksLikeRecoveryCode(input: string): boolean {
  const code = normaliseRecoveryCode(input);
  return code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c));
}
