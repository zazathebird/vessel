/**
 * The roster's ids, which side each is on, and the pools the duels draw from —
 * and nothing else.
 *
 * ## Why this is its own file (2026-09-24)
 *
 * The duel engine (`duel.ts` + `fighters.ts`, ~60 kB minified) is operator-only
 * and is loaded as a separate chunk, on demand, the first time a duel is
 * actually going to be drawn — see `loadDuelEngine` in `effects.ts`. But the
 * published-config validator (`src/data/duelSettings.ts`) runs for every
 * visitor on every load, and it has to know which ids are fighters and which
 * side each is on. When that knowledge lived on the costume table, validating
 * one string pulled every costume, and the engine behind them, into the entry
 * bundle of a site where no visitor can ever see a duel.
 *
 * So the facts the validator needs live here, and **only** here: `fighters.ts`
 * reads `SIDES` to fill in `FIGHTERS[id].side` rather than declaring a second
 * copy, so the pools, the validator and the costume table cannot disagree
 * about who is on which side. `npm run check` asserts this file stays free of
 * any runtime import, and that the built entry chunk contains no engine code.
 */

/** The roster's ids. Not a wire format — no share code or stored config names a
 *  fighter — so this may be reordered or added to freely. */
export type FighterStyle =
  | "hooded"
  | "caped"
  | "horned"
  | "maned"
  | "crowned"
  | "cowled"
  | "ronin"
  | "gladiator"
  | "plague"
  | "golem"
  | "nosferatu"
  | "musketeer"
  | "valkyrie"
  | "executioner"
  | "witch"
  | "sentinel"
  | "prophet"
  | "luchador"
  | "astronaut"
  | "gunslinger"
  | "viking"
  | "pharaoh"
  | "anubis"
  | "ringmaster";

/** Which end of the fight a costume belongs to. Decides the blade colour and,
 *  through the pools, guarantees every match is one of each. */
export type Alignment = "good" | "evil";

/**
 * Every fighter's side — **the one declaration of it**. A `Record` over the
 * union, so a fighter added to `FighterStyle` without a side here is a compile
 * error rather than a fighter silently missing from both pools.
 *
 * The key order is the order the pools list fighters in, which is the order
 * `rollPairing` indexes into — so it is kept in the costume table's order.
 */
export const SIDES: Record<FighterStyle, Alignment> = {
  hooded: "good",
  maned: "good",
  caped: "evil",
  horned: "evil",
  crowned: "evil",
  cowled: "evil",
  ronin: "good",
  gladiator: "good",
  plague: "evil",
  golem: "evil",
  nosferatu: "evil",
  musketeer: "good",
  valkyrie: "good",
  executioner: "evil",
  witch: "evil",
  sentinel: "good",
  prophet: "good",
  luchador: "good",
  astronaut: "good",
  gunslinger: "good",
  pharaoh: "evil",
  viking: "good",
  anubis: "evil",
  ringmaster: "evil",
};

export type DuelPool = "duel" | "duelholy";

/**
 * The two sides, derived from the roster rather than typed out.
 *
 * They used to be four hand-written ids per pool, which is how four of the
 * eight costumes came to be unreachable without anybody noticing: the list and
 * the roster were two places that had to agree, and the gate that caught it
 * only exists because they stopped. Deriving from `SIDES` (which is what `FIGHTERS[].side` reads) — the same
 * field the blade-colour carve-out is checked against — means a fighter is
 * rollable the moment it is declared, and the only way to withhold one is to
 * delete it.
 */
const ROSTER_GOOD = (Object.keys(SIDES) as FighterStyle[]).filter((s) => SIDES[s] === "good");
const ROSTER_EVIL = (Object.keys(SIDES) as FighterStyle[]).filter((s) => SIDES[s] === "evil");

/**
 * Which fighters each duel draws from. Every pool is one side against the
 * other, so a match is always good against evil and the blade colours always
 * disagree — that half is load-bearing and unchanged.
 *
 * **This block used to be attached to `ROSTER_GOOD`**, three declarations above
 * the thing it describes, which is how the eight-fighter arithmetic in it
 * survived two roster changes with a corrected paragraph sitting directly
 * underneath it. It is on `DUEL_POOLS` now, and the numbers are the roster's.
 *
 * **Both pools are the whole roster (2026-08-27, client).** They used to be a
 * themed four each — the order's fight and the war in heaven — and the cost of
 * that was measured rather than argued: with two good and two evil per pool,
 * **four of the eight costumes were unreachable for any given visitor**, only
 * four of the twenty-eight pairs could ever occur, and **72.7% of match resets
 * brought back at least one fighter from the previous match** (23.9% returned
 * the identical pair). The ornament id *is* the pool key and the ornament is
 * published site config, so which half of the roster a visitor could see was
 * fixed for everyone. The client's report was "only a couple characters get
 * chosen ever, always starts with the same characters", and he was right.
 *
 * Merged, and then grown to twenty-four on 2026-08-28: **every fighter is
 * reachable from every pool**, which is 144 pairs and 288 rolled orderings a
 * side rather than four, a per-fighter appearance rate of ~8.3% rather than the
 * ~52% two-of-four gave the lucky half, and back-to-back identical pairings at
 * about 0.7% rather than 24%.
 *
 * **What the merge gave up, stated because it was a real reason.** The roster
 * note above says confusable fighters were kept in different pools so they
 * never meet. That protection is gone, and it is replaced by `NEVER_MEET`
 * rather than by splitting the roster in half again — a blunt instrument that
 * cost four costumes to solve a problem which, once somebody actually measured
 * it, was three pairs.
 */
export const DUEL_POOLS: Record<DuelPool, { good: FighterStyle[]; evil: FighterStyle[] }> = {
  duel: {
    good: ROSTER_GOOD,
    evil: ROSTER_EVIL,
  },
  duelholy: {
    good: ROSTER_GOOD,
    evil: ROSTER_EVIL,
  },
};

