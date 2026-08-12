import { useRef, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { decodeShareCode, encodeShareCode } from "../config/shareCode";
import { FX, LAYOUTS, MODES, SCOPES, TYPESETS } from "../data/catalog";
import type { ScopeId } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
import { PALETTES } from "../data/palettes";
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
  const panelRef = useRef<HTMLElement | null>(null);
  const [pasted, setPasted] = useState("");

  useFocusTrap(panelOpen, panelRef);

  if (!panelOpen) return null;

  const code = encodeShareCode(config);

  const toggleScope = (id: ScopeId) =>
    update({ scope: { ...config.scope, [id]: !config.scope[id] } });

  const copyCode = () => {
    navigator.clipboard?.writeText(code).catch(() => {});
    say(`copied ${code}`);
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
        <h2 className="v-panel-label">Background — {FX.length}</h2>
        <div className="v-chip-row">
          {FX.map((effect) => (
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
              update({ calm, breathe: !calm, grain: !calm });
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
        <input
          className="v-paste"
          value={pasted}
          aria-labelledby="v-share-label"
          placeholder="paste a code, press enter"
          onChange={(event) => setPasted(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            applyCode(event.currentTarget.value);
          }}
        />
      </section>

      <button type="button" className="v-knock" onClick={() => say("you are already inside")}>
        <span>◈ operator access</span>
        <span className="v-knock-state">{config.unlocked ? "found" : "locked"}</span>
      </button>
    </aside>
  );
}
