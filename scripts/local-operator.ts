/**
 * Create a signed-in-able operator account against the LOCAL dev Worker.
 *
 * Dev-only scaffolding. The harness makes its own fixtures with random
 * credentials nobody can type, and `is_operator` is deliberately not settable
 * through any API — so verifying an operator surface by hand means one of these.
 * It imports the real `src/auth` flows for the same reason `auth-e2e.ts` does.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";

import { api } from "../src/auth/api";
import { beginTotpEnrolment, signUp } from "../src/auth/flows";

const BASE = process.env.VESSEL_API ?? "http://127.0.0.1:8787";
const CLIENT_IP = "203.0.113.77";

let cookie: string | null = null;
const nodeFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith("/")) return nodeFetch(input as RequestInfo, init);
  const headers = new Headers(init?.headers ?? {});
  headers.set("cf-connecting-ip", CLIENT_IP);
  if (cookie) headers.set("cookie", cookie);
  const response = await nodeFetch(`${BASE}${url}`, { ...init, headers });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";")[0];
  return response;
}) as typeof fetch;

const execAsync = promisify(exec);
async function d1(sql: string): Promise<void> {
  await execAsync(`npx wrangler d1 execute vessel --local --command "${sql}"`);
}

/** RFC 6238, independently — same second opinion the harness keeps. */
async function totpCode(secretBase32: string, atMs = Date.now()): Promise<string> {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const cleaned = secretBase32.replace(/[\s=-]/g, "").toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const char of cleaned) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 255);
    }
  }
  const step = Math.floor(atMs / 30000);
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step), false);
  const key = await crypto.subtle.importKey(
    "raw", new Uint8Array(bytes), { name: "HMAC", hash: "SHA-1" }, false, ["sign"],
  );
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1] & 0x0f;
  const binary =
    ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) |
    (mac[offset + 2] << 8) | mac[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
}

const HANDLE = process.env.OP_HANDLE ?? "operator";
const PASSWORD = process.env.OP_PASSWORD ?? "correct-horse-battery-staple";

async function main() {
  const { recoveryCodes } = await signUp(HANDLE, PASSWORD);
  const enrol = await beginTotpEnrolment(PASSWORD);
  await enrol.confirm(await totpCode(enrol.secret));
  await d1(`UPDATE accounts SET is_operator = 1 WHERE handle = '${HANDLE}'`);

  const me = await api.me();
  console.log("\n  handle      ", HANDLE);
  console.log("  password    ", PASSWORD);
  console.log("  totp secret ", enrol.secret);
  console.log("  operator    ", me.account?.isOperator);
  console.log("  recovery    ", recoveryCodes.slice(0, 2).join(" "), "…");
  console.log("\n  code right now:", await totpCode(enrol.secret), "\n");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
