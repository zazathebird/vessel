/**
 * A QR encoder, hand-rolled, for the TOTP enrolment screen.
 *
 * **Why this exists rather than a dependency.** `SPEC.md` § *Assets* forbids
 * third-party libraries and the rule is absolute — the routing, the state, the
 * styling, the authentication, the WebAuthn CBOR subset and the ES256
 * verification are all written here for the same reason. The enrolment screen
 * previously said "No QR code — this site ships no third-party code, and that
 * rule does not bend for convenience", which was true about the rule and wrong
 * about the conclusion: encoding a QR is an algorithm, not a dependency.
 *
 * **Why it is worth writing.** The alternative is typing a 32-character base32
 * secret into a phone by hand. The operator of this site spent a day locked out
 * of it because a credential was transcribed wrong once; asking anyone to do
 * that again, on a phone, to set up the factor that will lock them out if it is
 * wrong, is the same mistake with extra steps.
 *
 * **Scope, deliberately narrow.** Byte mode, error-correction level M, versions
 * 1 to 10 — up to 271 bytes, against an `otpauth://` URI that runs about 80. No
 * kanji mode, no numeric or alphanumeric optimisation, no structured append.
 * Everything here is needed by that one string and nothing else is.
 *
 * The output is a square boolean matrix, `true` for a dark module. It has no
 * quiet zone: the caller adds one, because the required four-module border is a
 * rendering concern and a matrix with padding baked in is a matrix you cannot
 * measure.
 */

/** Total codewords (data + error correction) per version, 1-indexed. */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

/**
 * Error-correction level M block structure, per version:
 * `[ecCodewordsPerBlock, blocksGroup1, dataPerBlock1, blocksGroup2, dataPerBlock2]`.
 *
 * The arithmetic is self-checking — `ec × totalBlocks + data` must equal
 * `TOTAL_CODEWORDS[version]` — and `assertTables()` below checks it at module
 * load rather than trusting the transcription.
 */
const M_BLOCKS: number[][] = [
  [],
  [10, 1, 16, 0, 0],
  [16, 1, 28, 0, 0],
  [26, 1, 44, 0, 0],
  [18, 2, 32, 0, 0],
  [24, 2, 43, 0, 0],
  [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0],
  [22, 2, 38, 2, 39],
  [22, 3, 36, 2, 37],
  [26, 4, 43, 1, 44],
];

/** Alignment-pattern centre coordinates per version. */
const ALIGN: number[][] = [
  [],
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

function assertTables(): void {
  for (let v = 1; v <= 10; v += 1) {
    const [ec, b1, d1, b2, d2] = M_BLOCKS[v];
    const total = ec * (b1 + b2) + b1 * d1 + b2 * d2;
    if (total !== TOTAL_CODEWORDS[v]) {
      throw new Error(`QR table mismatch at version ${v}: ${total} vs ${TOTAL_CODEWORDS[v]}`);
    }
  }
}
assertTables();

// ---- GF(256), the field Reed-Solomon works in ------------------------------
// Primitive polynomial 0x11D, as the QR specification requires.

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function mul(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial for `n` error-correction codewords. */
function generator(n: number): number[] {
  let poly = [1];
  for (let i = 0; i < n; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= mul(poly[j], 1);
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

function ecCodewords(data: number[], n: number): number[] {
  const gen = generator(n);
  const rem = new Array<number>(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem[0];
    rem.shift();
    rem.push(0);
    for (let i = 0; i < n; i += 1) rem[i] ^= mul(gen[i + 1], factor);
  }
  return rem;
}

// ---- BCH, for the format and version information ---------------------------

function bch(value: number, poly: number, bits: number): number {
  let rem = value;
  for (let i = bits - 1; i >= 0; i -= 1) {
    if (rem & (1 << (i + polyDegree(poly)))) rem ^= poly << i;
  }
  return rem;
}

function polyDegree(poly: number): number {
  let d = -1;
  for (let i = 0; i < 32; i += 1) if (poly & (1 << i)) d = i;
  return d;
}

/** 15-bit format information: two bits of level, three of mask, BCH, then XOR. */
function formatBits(mask: number): number {
  // 0b00 is level M in the format-information encoding.
  const data = (0b00 << 3) | mask;
  return (((data << 10) | bch(data << 10, 0b10100110111, 5)) ^ 0b101010000010010) & 0x7fff;
}

/** 18-bit version information, required from version 7 up. */
function versionBits(version: number): number {
  return (version << 12) | bch(version << 12, 0b1111100100101, 6);
}

// ---- the encoder -----------------------------------------------------------

function pickVersion(byteLength: number): number {
  for (let v = 1; v <= 10; v += 1) {
    const [ec, b1, d1, b2, d2] = M_BLOCKS[v];
    const dataCodewords = b1 * d1 + b2 * d2;
    // 4 bits of mode indicator + 8 or 16 of character count.
    const headerBits = 4 + (v < 10 ? 8 : 16);
    if (dataCodewords * 8 >= headerBits + byteLength * 8) return v;
    void ec;
  }
  throw new Error("Too much data for a version-10 QR at level M.");
}

function bitStream(bytes: Uint8Array, version: number): number[] {
  const [, b1, d1, b2, d2] = M_BLOCKS[version];
  const dataCodewords = b1 * d1 + b2 * d2;
  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4); // byte mode
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);

  // Terminator, then pad to a whole byte, then the specified alternating pad.
  const capacity = dataCodewords * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i += 1) bits.push(0);
  while (bits.length % 8 !== 0) bits.push(0);

  const words: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    words.push(bits.slice(i, i + 8).reduce((acc, bit) => (acc << 1) | bit, 0));
  }
  const PAD = [0xec, 0x11];
  while (words.length < dataCodewords) words.push(PAD[words.length % 2 === 0 ? 0 : 1]);
  return words;
}

/**
 * Split into blocks, compute error correction per block, then interleave.
 *
 * The interleave is the part that looks arbitrary and is not: the standard
 * takes the first codeword of every block, then the second of every block, and
 * so on, so that a scratch across the symbol damages a little of each block
 * rather than destroying one outright.
 */
function codewords(data: number[], version: number): number[] {
  const [ec, b1, d1, b2, d2] = M_BLOCKS[version];
  const blocks: number[][] = [];
  let at = 0;
  for (let i = 0; i < b1; i += 1) blocks.push(data.slice(at, (at += d1)));
  for (let i = 0; i < b2; i += 1) blocks.push(data.slice(at, (at += d2)));

  const ecBlocks = blocks.map((b) => ecCodewords(b, ec));
  const out: number[] = [];
  const maxData = Math.max(d1, d2);
  for (let i = 0; i < maxData; i += 1) {
    for (const b of blocks) if (i < b.length) out.push(b[i]);
  }
  for (let i = 0; i < ec; i += 1) {
    for (const b of ecBlocks) out.push(b[i]);
  }
  return out;
}

type Grid = (boolean | null)[][];

function blank(size: number): Grid {
  return Array.from({ length: size }, () => new Array<boolean | null>(size).fill(null));
}

function placeFinder(g: Grid, row: number, col: number): void {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const rr = row + r;
      const cc = col + c;
      if (rr < 0 || cc < 0 || rr >= g.length || cc >= g.length) continue;
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6;
      const dark =
        inRing &&
        (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
      g[rr][cc] = dark;
    }
  }
}

function reserved(size: number, version: number): boolean[][] {
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (r: number, c: number) => {
    if (r >= 0 && c >= 0 && r < size && c < size) fixed[r][c] = true;
  };

  /*
   * **Nine by nine, not eight** — rows and columns 0 to 8 inclusive.
   *
   * The finder is 7 and the separator takes it to 8, which is what an
   * `i <= 7` loop covers; but row 8 and column 8 carry the *format
   * information*, and they have to be reserved too. Leaving them out let the
   * data placement write payload bits into them, which `writeFormat` then
   * overwrote — corrupting one byte per clobbered module. It survived every
   * structural check (finders, timing, format bits all read back correct) and
   * was caught only by decoding the encoder's own output, which is the whole
   * argument for having a round-trip test rather than an eyeball.
   */
  for (let i = 0; i <= 8; i += 1) {
    for (let j = 0; j <= 8; j += 1) {
      mark(i, j);
      mark(i, size - 1 - j);
      mark(size - 1 - i, j);
    }
  }
  for (let i = 0; i < size; i += 1) {
    mark(6, i);
    mark(i, 6);
  }
  for (const r of ALIGN[version]) {
    for (const c of ALIGN[version]) {
      const nearFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) for (let dc = -2; dc <= 2; dc += 1) mark(r + dr, c + dc);
    }
  }
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        mark(size - 11 + j, i);
        mark(i, size - 11 + j);
      }
    }
  }
  return fixed;
}

const MASKS: ((r: number, c: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The specification's four penalty rules, used to choose between the masks. */
function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;

  const run = (get: (i: number, j: number) => boolean) => {
    for (let i = 0; i < n; i += 1) {
      let count = 1;
      for (let j = 1; j < n; j += 1) {
        if (get(i, j) === get(i, j - 1)) {
          count += 1;
        } else {
          if (count >= 5) score += 3 + (count - 5);
          count = 1;
        }
      }
      if (count >= 5) score += 3 + (count - 5);
    }
  };
  run((i, j) => m[i][j]);
  run((i, j) => m[j][i]);

  for (let r = 0; r < n - 1; r += 1) {
    for (let c = 0; c < n - 1; c += 1) {
      const v = m[r][c];
      if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
    }
  }

  const PATTERN = [true, false, true, true, true, false, true];
  const hasAt = (get: (k: number) => boolean, start: number) =>
    PATTERN.every((p, k) => get(start + k) === p);
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j + 7 <= n; j += 1) {
      if (hasAt((k) => m[i][k], j)) score += 40;
      if (hasAt((k) => m[k][i], j)) score += 40;
    }
  }

  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark += 1;
  const pct = (dark * 100) / (n * n);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}

/**
 * Encode `text` and return a square matrix of dark/light modules.
 *
 * No quiet zone — see the note at the top of this file.
 */
export function qrMatrix(text: string): boolean[][] {
  const bytes = new TextEncoder().encode(text);
  const version = pickVersion(bytes.length);
  const size = 17 + version * 4;
  const stream = codewords(bitStream(bytes, version), version);

  const grid = blank(size);
  placeFinder(grid, 0, 0);
  placeFinder(grid, 0, size - 7);
  placeFinder(grid, size - 7, 0);
  for (let i = 8; i < size - 8; i += 1) {
    grid[6][i] = i % 2 === 0;
    grid[i][6] = i % 2 === 0;
  }
  for (const r of ALIGN[version]) {
    for (const c of ALIGN[version]) {
      const nearFinder =
        (r <= 8 && c <= 8) || (r <= 8 && c >= size - 9) || (r >= size - 9 && c <= 8);
      if (nearFinder) continue;
      for (let dr = -2; dr <= 2; dr += 1) {
        for (let dc = -2; dc <= 2; dc += 1) {
          grid[r + dr][c + dc] = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
        }
      }
    }
  }
  // The "dark module", which is always set and has no informational content.
  grid[size - 8][8] = true;

  if (version >= 7) {
    const bitsV = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
      const bit = ((bitsV >> i) & 1) === 1;
      const r = Math.floor(i / 3);
      const c = size - 11 + (i % 3);
      grid[r][c] = bit;
      grid[c][r] = bit;
    }
  }

  const fixed = reserved(size, version);

  // Data placement: two columns at a time, right to left, alternating direction,
  // skipping the vertical timing column.
  let bitIndex = 0;
  const nextBit = (): boolean => {
    const byte = stream[bitIndex >> 3];
    const bit = byte === undefined ? 0 : (byte >> (7 - (bitIndex & 7))) & 1;
    bitIndex += 1;
    return bit === 1;
  };
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col -= 1;
    for (let step = 0; step < size; step += 1) {
      const row = upward ? size - 1 - step : step;
      for (let k = 0; k < 2; k += 1) {
        const c = col - k;
        if (fixed[row][c]) continue;
        grid[row][c] = nextBit();
      }
    }
    upward = !upward;
  }

  // Choose the mask by penalty, exactly as the specification prescribes.
  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  let bestMask = 0;
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = grid.map((row, r) =>
      row.map((v, c) => (fixed[r][c] ? v === true : (v === true) !== MASKS[mask](r, c))),
    );
    writeFormat(candidate, size, mask);
    const score = penalty(candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
      bestMask = mask;
    }
  }
  void bestMask;
  return best as boolean[][];
}

function writeFormat(m: boolean[][], size: number, mask: number): void {
  const bits = formatBits(mask);
  const at = (i: number) => ((bits >> i) & 1) === 1;
  for (let i = 0; i <= 5; i += 1) m[8][i] = at(i);
  m[8][7] = at(6);
  m[8][8] = at(7);
  m[7][8] = at(8);
  for (let i = 9; i <= 14; i += 1) m[14 - i][8] = at(i);

  for (let i = 0; i <= 7; i += 1) m[size - 1 - i][8] = at(i);
  for (let i = 8; i <= 14; i += 1) m[8][size - 15 + i] = at(i);
  m[size - 8][8] = true;
}
