/** Dev-only: does the local operator account actually sign in? */
import { api } from "../src/auth/api";
import { signIn } from "../src/auth/flows";

const BASE = "http://127.0.0.1:8787";
const CLIENT_IP = "203.0.113.78";
let cookie: string | null = null;
const nodeFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("/")) return nodeFetch(input, init);
  const headers = new Headers(init?.headers ?? {});
  headers.set("cf-connecting-ip", CLIENT_IP);
  if (cookie) headers.set("cookie", cookie);
  const response = await nodeFetch(`${BASE}${url}`, { ...init, headers });
  const sc = response.headers.get("set-cookie");
  if (sc) cookie = sc.split(";")[0];
  return response;
}) as typeof fetch;

async function totpCode(secret: string, atMs = Date.now()): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secret.replace(/[\s=-]/g, "").toUpperCase();
  const bytes: number[] = []; let bits = 0, value = 0;
  for (const c of cleaned) { value = (value << 5) | alphabet.indexOf(c); bits += 5;
    if (bits >= 8) { bits -= 8; bytes.push((value >>> bits) & 255); } }
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(Math.floor(atMs / 30000)), false);
  const key = await crypto.subtle.importKey("raw", new Uint8Array(bytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const o = mac[mac.length - 1] & 0x0f;
  const bin = ((mac[o] & 0x7f) << 24) | (mac[o+1] << 16) | (mac[o+2] << 8) | mac[o+3];
  return String(bin % 1000000).padStart(6, "0");
}

const HANDLE = process.argv[2] ?? "desktop";
const PASSWORD = process.argv[3] ?? "correct-horse-battery-staple";
/*
 * **The TOTP secret comes from the environment and is never written down here.**
 * `local-operator.ts` prints one when it makes the account; export it as
 * `OP_TOTP_SECRET` before running this. It is a local-D1 fixture either way, but
 * this repository is public and a secret in a public history is permanent.
 */
const SECRET = process.env.OP_TOTP_SECRET ?? "";
if (!SECRET) {
  console.error("Set OP_TOTP_SECRET to the secret local-operator.ts printed.");
  process.exit(1);
}

async function main() {
  const first = await signIn(HANDLE, PASSWORD);
  console.log("  password stage :", first.status);
  if (first.status === "totp-required") {
    const done = await api.totp(first.ticket, await totpCode(SECRET));
    console.log("  totp stage     :", done.status);
  }
  const me = await api.me();
  console.log("  handle         :", me.account?.handle);
  console.log("  isOperator     :", me.account?.isOperator);
}
main().catch((e) => { console.log("  FAILED:", e.status ?? "", e.message); process.exit(1); });
