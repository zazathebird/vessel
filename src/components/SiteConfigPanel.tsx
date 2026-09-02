import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../auth/api";
import { useSession } from "../auth/SessionContext";
import { publishable } from "../config/siteConfig";
import { useConfig } from "../config/ConfigContext";
import { saveCalmPreference, saveSoundPreference } from "../config/persistence";
import { decodeShareCode, encodeShareCode } from "../config/shareCode";
import { LAYOUTS, MODES, PICKABLE_FX, SCOPES, TYPESETS } from "../data/catalog";
import type { ScopeId } from "../data/catalog";
import { combinationOf, warnings } from "../data/guardrails";
import { PICKABLE_ORNAMENTS } from "../data/ornaments";
import { PICKABLE_STATIONS } from "../data/stations";
import { PALETTES } from "../data/palettes";
import { PRESETS } from "../data/presets";
import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * The siteconfig drawer — everything the operator can change, in the order the
 * spec sets out: behaviour, palette, layout, background, typography, life
 * signs, share codes.
 *
 * Visitors never see this. It is reached only through the operator door, which
 * is theatre and guards nothing but these settings (CLAUDE.md).
 */
export function SiteConfigPanel() {
  const { config, update, say, chime, panelOpen, closePanel, shuffle, setMode } = useConfig();
  const { refresh } = useSession();
  const panelRef = useRef<HTMLElement | null>(null);
  const [pasted, setPasted] = useState("");
  const [publishState, setPublishState] = useState<"idle" | "publishing" | "published">("idle");
  const [leaving, setLeaving] = useState(false);

  /**
   * End operator mode (client request, 2026-08-13): sign the session out and
   * take every operator surface with it. The sign-out is the real mechanism —
   * losing `isOperator` already force-closes the panel and the door
   * (ConfigContext), and the header's operator tabs unrender on the session
   * refresh. `unlocked: false` retires the header's siteconfig button too, so
   * nothing operator-shaped survives the click. Coming back is a fresh
   * sign-in, which is the point of "done".
   */
  const leaveOperatorMode = async () => {
    setLeaving(true);
    try {
      await api.signout();
    } catch {
      // Offline, the cookie survives — say so instead of pretending.
      say("could not reach the server — still signed in");
      return;
    } finally {
      // Both paths: the panel stays mounted while closed, so a `leaving` left
      // true would keep the button disabled at "leaving…" on the next sign-in.
      setLeaving(false);
    }
    update({ unlocked: false });
    closePanel();
    await refresh();
    say("operator mode ended");
  };

  const publish = async () => {
    setPublishState("publishing");
    try {
      await api.publishSiteConfig(publishable(config));
      setPublishState("published");
      say("published to everyone");
    } catch (cause) {
      setPublishState("idle");
      // The Worker's wording is written to be read — a 403 here means this
      // account is signed in but is not the operator, which is worth saying
      // rather than flattening into "failed".
      say(cause instanceof Error ? cause.message : "could not publish");
    }
  };

  useFocusTrap(panelOpen, panelRef);

  // "Published" stops being true the moment anything changes, and a note that
  // still claims it is the surest way to publish nothing and believe otherwise.
  useEffect(() => {
    setPublishState((state) => (state === "published" ? "idle" : state));
  }, [config]);

  if (!panelOpen) return null;

  const code = encodeShareCode(config);

  /*
   * Every guardrail this setup trips, in the table's order (2026-08-30).
   *
   * **Built from the STORED config, deliberately, and not from what is drawn.**
   * The wrapper resolves two of the seventeen on the way to the page, so a
   * combination built from the rendered ornament and the rendered grain can
   * never match those two — the operator would be shown fifteen rules and
   * silently kept from the two that are actively changing his site under him.
   * The stored values are also exactly what `publish` sends, which is the
   * question this section is standing next to.
   *
   * `config.layout`, not the adapted one, for the same reason: a phone
   * collapsing Mosaic to Stack is not a thing he is publishing.
   */
  const tripped = warnings(
    combinationOf({
      pal: config.pal,
      layout: config.layout,
      fx: config.fx,
      ornament: config.ornament,
      station: config.station,
      type: config.type,
      grain: config.grain,
    }),
  );

  const toggleScope = (id: ScopeId) =>
    update({ scope: { ...config.scope, [id]: !config.scope[id] } });

  const copyCode = () => {
    // Never claim a success that did not happen (the TotpEnrol convention):
    // the code is visible in the field either way.
    const written = navigator.clipboard?.writeText(code);
    if (!written) {
      say("copying unavailable — select the code by hand");
      return;
    }
    written.then(
      () => say(`copied ${code}`),
      () => say("copying refused — select the code by hand"),
    );
  };

  const applyCode = (raw: string) => {
    const shared = decodeShareCode(raw);
    if (!shared) {
      say("that isn't a setup code");
      return;
    }
    // A pasted setup is a fixed picture of the site, so it pins the randomiser.
    update(shared);
    setPasted("");
    say("setup applied");
  };

  const submitCode = (event: FormEvent) => {
    event.preventDefault();
    applyCode(pasted);
  };

  return (
    <aside
      ref={panelRef}
      className="v-panel"
      role="dialog"
      // The spec asks for focus trapping here, and a trapped drawer is modal
      // whether or not it covers the page — so say so rather than letting the
      // ARIA and the keyboard behaviour disagree.
      aria-modal="true"
      aria-label="siteconfig — operator controls"
    >
      <div className="v-panel-head">
        <div className="v-panel-title">
          <span className="v-panel-eyebrow">siteconfig</span>
          <span className="v-panel-name">Operator controls</span>
        </div>
        <button type="button" className="v-panel-close" onClick={closePanel} aria-label="close siteconfig">
          ✕
        </button>
      </div>

      <section className="v-panel-section">
        <h2 className="v-panel-label">Behaviour</h2>
        <div className="v-chip-row">
          {MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={`chip${config.mode === mode.id ? " is-active" : ""}`}
              aria-pressed={config.mode === mode.id}
              onClick={() => setMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
        <button type="button" className="v-shuffle" onClick={shuffle}>
          ↻ shuffle now
        </button>
        <div className="v-chip-row">
          {SCOPES.map((scope) => (
            <button
              key={scope.id}
              type="button"
              className={`chip${config.scope[scope.id] ? " is-active" : ""}`}
              aria-pressed={config.scope[scope.id]}
              onClick={() => toggleScope(scope.id)}
            >
              {scope.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v-panel-section">
        <h2 className="v-panel-label">Palette — {PALETTES.length}</h2>
        <div className="v-swatches">
          {PALETTES.map((palette, i) => (
            <button
              key={palette.id}
              type="button"
              className={`v-swatch${config.pal === i ? " is-active" : ""}`}
              style={{ background: palette.bg }}
              aria-pressed={config.pal === i}
              onClick={() => {
                /*
                 * **This used to also write `mode: "static"`, and that was the
                 * second half of the stuck-randomiser bug** (2026-08-27).
                 *
                 * The old reasoning was sound as far as it went: pick a palette
                 * while a randomiser is on and the next roll overwrites it. But
                 * the swatch was the ONLY look control that did this — layout,
                 * background, ornament, station and typography all write just
                 * their own field — so choosing a colour silently turned the
                 * randomiser off, and `publish` sent that. The operator set
                 * "per page", touched a colour, published, and got a frozen
                 * site with no indication of why.
                 *
                 * Silently changing a setting the operator did not touch is
                 * worse than the overwrite it was avoiding. So: pick the
                 * palette, leave the mode alone, and *say* what will happen.
                 */
                update({ pal: i });
                say(
                  config.mode === "static"
                    ? palette.name
                    : `${palette.name} — the randomiser will roll over this`,
                );
              }}
            >
              <span className="v-swatch-dots" aria-hidden="true">
                <span style={{ background: palette.a1 }} />
                <span style={{ background: palette.a2 }} />
                <span style={{ background: palette.a3 }} />
              </span>
              <span className="v-swatch-name">{palette.name}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Presets: a whole look under a name. Applied through decodeShareCode so
          the behaviour is identical to pasting the code below or applying a
          saved setup — one path, including the pin to Static. */}
      <section className="v-panel-section">
        <h2 className="v-panel-label">Presets — {PRESETS.length}</h2>
        <div className="v-chip-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="chip"
              title={preset.note}
              onClick={() => {
                const shared = decodeShareCode(preset.shareCode);
                if (!shared) return;
                update(shared);
                say(preset.name);
              }}
            >
              {preset.name}
            </button>
          ))}
        </div>
      </section>

      <section className="v-panel-section">
        <h2 className="v-panel-label">Layout — {LAYOUTS.length}</h2>
        <div className="v-chip-row">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              className={`chip${config.layout === layout.id ? " is-active" : ""}`}
              aria-pressed={config.layout === layout.id}
              onClick={() => {
                update({ layout: layout.id });
                say(`${layout.label} layout`);
              }}
            >
              {layout.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v-panel-section">
        {/* PICKABLE_FX on both the count and the list, so the number is the number
            of chips below it rather than the length of the wire format. */}
        <h2 className="v-panel-label">Background — {PICKABLE_FX.length}</h2>
        <div className="v-chip-row">
          {PICKABLE_FX.map((effect) => (
            <button
              key={effect.id}
              type="button"
              className={`chip${config.fx === effect.id ? " is-active" : ""}`}
              aria-pressed={config.fx === effect.id}
              onClick={() => {
                update({ fx: effect.id });
                say(effect.label);
              }}
            >
              {effect.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v-panel-section">
        <h2 className="v-panel-label">Ornament — {PICKABLE_ORNAMENTS.length}</h2>
        <div className="v-chip-row">
          {PICKABLE_ORNAMENTS.map((ornament) => (
            <button
              key={ornament.id}
              type="button"
              className={`chip${config.ornament === ornament.id ? " is-active" : ""}`}
              aria-pressed={config.ornament === ornament.id}
              onClick={() => {
                update({ ornament: ornament.id });
                say(ornament.id === "none" ? "ornament off" : ornament.label);
              }}
            >
              {ornament.label}
            </button>
          ))}
        </div>
      </section>

      {/*
        Station sits directly under Ornament because it is a property *of* the
        ornament — where it holds — rather than a peer of it, and the roll ties
        the two to one scope for the same reason. Each chip carries its note as
        a title: "Roam" alone does not say what it will do, and this is the one
        section whose options are behaviours rather than appearances.
      */}
      <section className="v-panel-section">
        <h2 className="v-panel-label">Station — {PICKABLE_STATIONS.length}</h2>
        <div className="v-chip-row">
          {PICKABLE_STATIONS.map((station) => (
            <button
              key={station.id}
              type="button"
              className={`chip${config.station === station.id ? " is-active" : ""}`}
              aria-pressed={config.station === station.id}
              title={station.note}
              onClick={() => {
                update({ station: station.id });
                say(station.label);
              }}
            >
              {station.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v-panel-section">
        <h2 className="v-panel-label">Typography</h2>
        <div className="v-chip-row">
          {TYPESETS.map((set, i) => (
            <button
              key={set.id}
              type="button"
              className={`chip${config.type === i ? " is-active" : ""}`}
              aria-pressed={config.type === i}
              onClick={() => update({ type: i })}
            >
              {set.label}
            </button>
          ))}
        </div>
      </section>

      <section className="v-panel-section">
        <h2 className="v-panel-label">Life signs</h2>
        <div className="v-chip-row">
          <button
            type="button"
            className={`chip${config.grain ? " is-active" : ""}`}
            aria-pressed={config.grain}
            onClick={() => update({ grain: !config.grain })}
          >
            Grain
          </button>
          <button
            type="button"
            className={`chip${config.breathe ? " is-active" : ""}`}
            aria-pressed={config.breathe}
            onClick={() => update({ breathe: !config.breathe })}
          >
            Breathing
          </button>
          <button
            type="button"
            className={`chip${config.cursor ? " is-active" : ""}`}
            aria-pressed={config.cursor}
            onClick={() => update({ cursor: !config.cursor })}
          >
            Cursor glow
          </button>
          <button
            type="button"
            className={`chip${config.entrances ? " is-active" : ""}`}
            aria-pressed={config.entrances}
            onClick={() => update({ entrances: !config.entrances })}
          >
            Entrances
          </button>
          <button
            type="button"
            className={`chip${config.sound ? " is-active" : ""}`}
            aria-pressed={config.sound}
            onClick={() => {
              const sound = !config.sound;
              update({ sound });
              // Every deliberate sound toggle records the preference — the
              // header chip, the command palette and here — exactly as calm's
              // three toggles do. Publishing it is separate and still the
              // operator's; this is the operator's own ears.
              saveSoundPreference(sound);
              // Through `chime`, never `play`. CLAUDE.md says `chime` is the
              // single gate and that calm silences sound entirely — and this
              // chip, unlike the header's, is *visible in calm*, so a direct
              // `play` here made a noise in the one mode that promises none.
              // `update` freshens `live.current` in the same tick, so the gate
              // sees the value just set.
              chime("toggle");
            }}
          >
            Sound
          </button>
          {/*
            Operator-only, and the only control here whose *audience* is the
            operator rather than the visitor: it prints each tile's slot notes
            ("4:5 · photo slot") on the page, which is useful while the real
            photographs are still going in and is production furniture to
            anybody else. Default off — see `Config.slots`.
          */}
          <button
            type="button"
            className={`chip${config.slots ? " is-active" : ""}`}
            aria-pressed={config.slots}
            onClick={() => update({ slots: !config.slots })}
          >
            Slot labels
          </button>
          <button
            type="button"
            className={`chip${config.calm ? " is-active" : ""}`}
            aria-pressed={config.calm}
            onClick={() => {
              const calm = !config.calm;
              // Calm alone — `themeClasses` suppresses grain/breathe under
              // calm; writing them here would overwrite the published values
              // (review 2026-08-13). Matches the header and the palette.
              update({ calm });
              // Recorded like the header's toggle: a deliberate calm choice
              // survives reload, whoever makes it.
              saveCalmPreference(calm);
              say(calm ? "plain — one accent, no motion" : "plain off");
            }}
          >
            Plain
          </button>
        </div>
      </section>

      <section className="v-panel-section">
        <h2 className="v-panel-label" id="v-share-label">
          Share a setup
        </h2>
        <div className="v-share-row">
          <code className="v-code">{code}</code>
          <button type="button" className="chip" onClick={copyCode}>
            copy
          </button>
        </div>
        {/*
         * A real <form>, for the one text input on the site. Enter and the
         * button are then the same path rather than two, and this is the shape
         * the account forms inherit — see CLAUDE.md on why whatever ships here
         * first becomes the convention.
         */}
        <form className="v-share-row" onSubmit={submitCode}>
          <input
            className="v-paste"
            value={pasted}
            aria-labelledby="v-share-label"
            placeholder="paste a code"
            onChange={(event) => setPasted(event.target.value)}
          />
          <button type="submit" className="chip" disabled={!pasted.trim()}>
            apply
          </button>
        </form>
      </section>

      {/*
       * The guardrails, in words, at the moment they are tripped (2026-08-30).
       *
       * Fifteen of the seventeen rules are the client's taste written down, and
       * taste is his to overrule — so this **warns and never refuses**: no chip
       * is disabled, no publish is blocked, nothing above this is greyed out.
       * The one thing he may not do is overrule a rule without being told, and
       * for two days that was the only thing on offer, because `matched()` had
       * no caller at all.
       *
       * It sits directly above Publish, which is the same ordering rule
       * `/setup` and the downloads page follow: the warning goes above the act
       * it is about, because somebody working through a page is following steps
       * rather than reading it.
       *
       * **Rendered whether or not anything is tripped, and that is what makes
       * it announce.** A live region has to be in the document before its
       * content changes — the same finding `PasswordField` records for
       * `role="alert"` firing on insertion. Flipping a chip then inserts a
       * sentence into a region a screen reader is already watching; mounting
       * the whole panel does not interrupt, which is right, since a drawer that
       * reads three warnings at you on open is a drawer nobody opens.
       */}
      <section className="v-panel-section" aria-live="polite">
        <h2 className="v-panel-label">Guardrails — {tripped.length}</h2>
        {tripped.length === 0 ? (
          <p className="v-panel-note">Nothing tripped. This setup breaks none of the site's rules.</p>
        ) : (
          /*
            The first line says what the section is *for*, because a red
            triangle above a publish button reads as "blocked" and this one is
            not: fifteen of the seventeen rules are the client's taste, and
            taste is his to overrule. Saying so once, at the top, is cheaper
            than a reassurance repeated on every row.
          */
          <p className="v-panel-note">
            Warnings, not refusals. Publishing works exactly as it does with none of these.
          </p>
        )}
        {/* An empty list renders nothing, so this needs no guard of its own. */}
        {tripped.map(({ rule, resolved }) => (
          <p key={rule.note} className="v-panel-note">
            {/*
              `--a3` is the danger token and is exempt from calm's collapse, so
              a warning stays a warning in the mode every reduced-motion visitor
              lands in. The marker is decoration, so it is hidden rather than
              read out as the name of a triangle. A resolved rule is a notice
              rather than a warning and gets `--muted`, which is a text colour
              on all 25 palettes — `--faint` (2.78–4.09:1) is not.
            */}
            <span aria-hidden="true" style={{ color: resolved ? "var(--muted)" : "var(--a3)" }}>
              {resolved ? "✓ " : "▲ "}
            </span>
            {rule.note}
            {resolved ? " The page already renders this the allowed way." : ""}
          </p>
        ))}
      </section>

      {/*
       * Publishing is what makes this panel the site's appearance rather than
       * one browser's. Everything above changes the look locally and instantly;
       * this is the one control that changes it for everyone, so it is a
       * separate, deliberate act with its own button rather than an autosave.
       *
       * It sits at the bottom, after every control it publishes, because that
       * is the order the job is done in.
       */}
      <section className="v-panel-section">
        <h2 className="v-panel-label">
          Publish to everyone
        </h2>
        <p className="v-panel-note">
          {publishState === "published"
            ? "Published. Every visitor gets this look from now on."
            : "This changes the site for every visitor, not just you. Unpublished changes are lost when you reload."}
        </p>
        <button
          type="button"
          className="chip"
          onClick={publish}
          disabled={publishState === "publishing"}
        >
          {publishState === "publishing" ? "publishing…" : "publish"}
        </button>
      </section>

      {/*
       * Below Publish because it is the last act of a session, the way Publish
       * is the last act of a change. It ends the *session*, not just the panel:
       * the ✕ above closes the drawer and leaves you operator; this signs out.
       */}
      <section className="v-panel-section">
        <h2 className="v-panel-label">Leave operator mode</h2>
        <p className="v-panel-note">
          Signs you out. The tabs, this panel and the door all go away until you sign in again.
        </p>
        <button type="button" className="chip" onClick={leaveOperatorMode} disabled={leaving}>
          {leaving ? "leaving…" : "leave"}
        </button>
      </section>

      <button type="button" className="v-knock" onClick={() => say("you are already inside")}>
        <span>◈ operator access</span>
        <span className="v-knock-state">{config.unlocked ? "found" : "locked"}</span>
      </button>
    </aside>
  );
}
