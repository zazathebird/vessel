import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { api } from "../auth/api";
import { useSession } from "../auth/SessionContext";
import { publishable } from "../config/siteConfig";
import { useConfig } from "../config/ConfigContext";
import { saveCalmPreference } from "../config/persistence";
import { decodeShareCode, encodeShareCode } from "../config/shareCode";
import { LAYOUTS, MODES, PICKABLE_FX, SCOPES, TYPESETS } from "../data/catalog";
import type { ScopeId } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
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
  const { config, update, say, panelOpen, closePanel, shuffle, setMode } = useConfig();
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
                // Choosing a palette by hand pins it — otherwise the next roll
                // would immediately overwrite the choice.
                update({ pal: i, mode: "static" });
                say(palette.name);
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
        <h2 className="v-panel-label">Ornament — {ORNAMENTS.length}</h2>
        <div className="v-chip-row">
          {ORNAMENTS.map((ornament) => (
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
              say(calm ? "calm — one accent, no motion" : "calm off");
            }}
          >
            Calm mode
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
