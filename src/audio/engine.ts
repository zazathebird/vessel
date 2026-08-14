/**
 * The site's voice — synthesised, never sampled.
 *
 * `SPEC.md`'s *Assets* rule is no third-party libraries, no webfonts, no
 * images, and the same reasoning covers audio: there is no `.mp3` here and
 * there will not be one. Every sound is a few oscillators and an envelope,
 * which is also why the whole thing costs no bytes over the wire.
 *
 * **Nothing here can make a noise on its own.** There is no ambient bed, no
 * loop and no timer — every voice is fired by a gesture the visitor made, so
 * autoplay policy is satisfied by construction rather than by asking
 * permission. The `AudioContext` is not even constructed until the first
 * `play()` call, so a visitor who never turns sound on never allocates one.
 *
 * **The pitch comes from the palette**, the same way every colour on the site
 * does. `src/theme.ts` exists so that no component contains a literal colour;
 * this module is the audible half of that idea — no voice contains a literal
 * frequency, they are all intervals above a root the palette chooses. Changing
 * palette retunes the site, which is a joke worth the twenty lines it costs.
 */

/**
 * Root notes, one per palette, as semitone offsets from A3 (220Hz).
 *
 * A pentatonic set (0 2 4 7 9), so any two palettes' roots are consonant and
 * there is no combination of "the palette bled while a toast was still
 * ringing" that lands on a tritone. Indexed modulo the palette count, so
 * appending a twenty-sixth palette needs nothing here.
 */
const ROOTS = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

/** A3. Low enough that the harmonics of a short blip stay out of sibilance. */
const BASE_HZ = 220;

/**
 * Master ceiling. Deliberately timid: this is interface feedback on a personal
 * site, not a game. Every voice sits under this, and the envelopes below never
 * reach it for more than a few milliseconds.
 */
const MASTER_GAIN = 0.09;

/** Semitones → Hz, equal temperament. */
function hz(semitones: number): number {
  return BASE_HZ * Math.pow(2, semitones / 12);
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
}

let engine: Engine | null = null;
/** Set once construction has failed, so a blocked context is not retried per click. */
let broken = false;

/**
 * The palette's root, in semitones. Written by the theme layer on every config
 * change rather than read from it, so this module imports nothing and cannot
 * become a second opinion about what the current palette is.
 */
let root = ROOTS[0];

export function setAudioPalette(paletteIndex: number): void {
  root = ROOTS[((paletteIndex % ROOTS.length) + ROOTS.length) % ROOTS.length];
}

function acquire(): Engine | null {
  if (engine || broken) return engine;
  try {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) {
      broken = true;
      return null;
    }
    const ctx = new Ctor();
    const master = ctx.createGain();
    master.gain.value = MASTER_GAIN;
    master.connect(ctx.destination);
    engine = { ctx, master };
    return engine;
  } catch {
    // No audio device, a blocked context, a browser that refuses. Silence is a
    // fine outcome for interface feedback; nothing else in the app may notice.
    broken = true;
    return null;
  }
}

/**
 * One voice: a sine through its own gain, with an exponential decay.
 *
 * `exponentialRampToValueAtTime` cannot reach zero, hence the tiny floor and
 * the explicit stop — a linear ramp to zero is audibly a click at these
 * durations, which is the one thing a feedback sound must never be.
 */
function blip(
  { ctx, master }: Engine,
  semitones: number,
  at: number,
  duration: number,
  level: number,
  type: OscillatorType = "sine",
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = hz(root + semitones);
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(level, at + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
  osc.connect(gain);
  gain.connect(master);
  osc.start(at);
  osc.stop(at + duration + 0.02);
}

/**
 * The vocabulary. Each is an interval pattern, so all of them retune together
 * when the palette changes.
 *
 * They are deliberately few and deliberately short — under 200ms each. A site
 * that chimes on every click becomes a site people mute, and the toggle that
 * silences this is the one thing here nobody should have to find.
 */
const VOICES = {
  /** Page change: an open fifth, up. The most-heard sound, so the plainest. */
  nav: [
    { note: 0, at: 0, dur: 0.1, level: 0.5 },
    { note: 7, at: 0.045, dur: 0.13, level: 0.42 },
  ],
  /** Any switch flipping. One note, no interval — it is punctuation. */
  toggle: [{ note: 12, at: 0, dur: 0.07, level: 0.42 }],
  /** A panel, door or dialog arriving. */
  open: [
    { note: 0, at: 0, dur: 0.09, level: 0.36 },
    { note: 4, at: 0.04, dur: 0.09, level: 0.36 },
    { note: 9, at: 0.08, dur: 0.14, level: 0.32 },
  ],
  /** …and leaving. The same three, reversed and shorter. */
  close: [
    { note: 9, at: 0, dur: 0.07, level: 0.3 },
    { note: 4, at: 0.035, dur: 0.07, level: 0.3 },
    { note: 0, at: 0.07, dur: 0.11, level: 0.28 },
  ],
  /** A toast. Quietest thing here: it accompanies text that already says it. */
  toast: [{ note: 16, at: 0, dur: 0.05, level: 0.22 }],
  /** The dice. The one flourish, because rolling one is a deliberate flourish. */
  shuffle: [
    { note: 0, at: 0, dur: 0.07, level: 0.34 },
    { note: 4, at: 0.035, dur: 0.07, level: 0.34 },
    { note: 7, at: 0.07, dur: 0.07, level: 0.34 },
    { note: 12, at: 0.105, dur: 0.16, level: 0.38 },
  ],
  /** Something refused. The only minor interval in the set, and the only one
   *  that needs no explanation when you hear it. */
  deny: [
    { note: 3, at: 0, dur: 0.1, level: 0.34, type: "triangle" as OscillatorType },
    { note: -1, at: 0.06, dur: 0.16, level: 0.3, type: "triangle" as OscillatorType },
  ],
} as const;

export type VoiceId = keyof typeof VOICES;

/**
 * Fire a voice. Safe to call at any time and from anywhere: it is a no-op
 * unless sound is on, and it never throws.
 *
 * The caller decides whether sound is on — `play` does not read config,
 * because a module that reached into `ConfigContext` would make the audio a
 * second source of truth about a setting the user can see a checkbox for.
 */
export function play(voice: VoiceId): void {
  const live = acquire();
  if (!live) return;
  try {
    // A context created before the first gesture starts suspended, and one
    // that has been backgrounded can be suspended again later. Resuming inside
    // a gesture-triggered call is exactly when the browser allows it.
    if (live.ctx.state === "suspended") void live.ctx.resume();
    const at = live.ctx.currentTime + 0.001;
    for (const step of VOICES[voice]) {
      blip(
        live,
        step.note,
        at + step.at,
        step.dur,
        step.level,
        "type" in step ? step.type : "sine",
      );
    }
  } catch {
    // A voice that fails is not worth a broken interaction.
  }
}

/**
 * Release the audio device when sound is switched off.
 *
 * Not merely cosmetic: a live `AudioContext` keeps an output stream open, which
 * on some platforms shows the tab as "playing audio" and can hold a Bluetooth
 * headset in its high-latency profile for as long as the tab is open. Somebody
 * who turned this off should cost them nothing.
 */
export function releaseAudio(): void {
  const live = engine;
  if (!live) return;
  engine = null;
  try {
    void live.ctx.close();
  } catch {
    // Already closing, or never opened properly. Nothing to recover.
  }
}
