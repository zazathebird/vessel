import { useConfig } from "./config/ConfigContext";
import { encodeShareCode } from "./config/shareCode";
import { NAV, PATHS } from "./data/pageIds";
import { LAYOUTS, TYPESETS } from "./data/catalog";
import { PALETTES } from "./data/palettes";
import { themeClasses, themeVars } from "./theme";

/**
 * SCAFFOLD — not the design.
 *
 * This renders the token layer and state machine so they can be verified in a
 * browser. It is deliberately plain; the real chrome (header, hero, valve,
 * content grid, footer) and the nine pages replace it wholesale.
 *
 * Page copy is ported (src/data/pages.ts). Next: the shared chrome and the
 * Cinematic layout.
 */
export default function App() {
  const { config, update, go, shuffle, band, layout, adapted, toast, clock } = useConfig();

  const palette = PALETTES[config.pal];
  const layoutLabel = LAYOUTS.find((l) => l.id === layout)?.label ?? layout;

  return (
    <div className={themeClasses(config, layout, band)} style={themeVars(config, layout, band)}>
      <div className="stage" style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <header
          style={{
            display: "flex",
            gap: 16,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--header-padding)",
            borderBottom: "1px solid var(--line)",
            margin: "0 calc(var(--grid-gap) * -1)",
          }}
        >
          <span
            className="mono"
            style={{ fontSize: 13, letterSpacing: "0.24em", color: "var(--fg)" }}
          >
            vessel
          </span>

          <nav style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {NAV.map((item) => (
              <a
                key={item.id}
                href={PATHS[item.id]}
                className={`chip${config.page === item.id ? " is-active" : ""}`}
                aria-current={config.page === item.id ? "page" : undefined}
                style={{ textDecoration: "none" }}
                onClick={(event) => {
                  event.preventDefault();
                  go(item.id);
                }}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <button
            type="button"
            className="chip"
            aria-pressed={config.calm}
            onClick={() => update({ calm: !config.calm })}
          >
            {config.calm ? "calm ✓" : "calm"}
          </button>
        </header>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p className="mono" style={{ fontSize: 11, letterSpacing: "0.3em", color: "var(--a1)", margin: 0 }}>
            scaffold · architecture only
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: "var(--font-display)",
              fontSize: "var(--h1-size)",
              lineHeight: 0.96,
              letterSpacing: "-0.035em",
            }}
          >
            {config.page}
          </h1>
          <p style={{ margin: 0, color: "var(--muted)", maxWidth: "56ch", lineHeight: 1.65 }}>
            The token layer, persistence, routing, randomiser and band system are wired. Page copy
            is ported; the real chrome is not built yet.
          </p>
        </div>

        <dl
          className="mono"
          style={{
            display: "grid",
            gridTemplateColumns: "var(--grid-columns)",
            gap: "var(--grid-gap)",
            fontSize: 11,
            letterSpacing: "0.16em",
            color: "var(--faint)",
            margin: 0,
          }}
        >
          {[
            ["palette", palette.name],
            ["layout", `${layoutLabel}${adapted ? " · adapted" : ""}`],
            ["stored layout", config.layout],
            ["band", band],
            ["effect", config.fx],
            ["type", TYPESETS[config.type].label],
            ["mode", config.mode],
            ["share code", encodeShareCode(config)],
            ["clock", clock],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                border: "1px solid var(--line)",
                borderRadius: "var(--radius)",
                padding: 14,
                background: "color-mix(in oklab, var(--surface) 70%, transparent)",
              }}
            >
              <dt style={{ color: "var(--a2)", marginBottom: 6 }}>{label}</dt>
              <dd style={{ margin: 0, color: "var(--fg)", textTransform: "none" }}>{value}</dd>
            </div>
          ))}
        </dl>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="chip" onClick={shuffle}>
            ↻ shuffle
          </button>
          <button
            type="button"
            className="chip"
            onClick={() => update({ grain: !config.grain })}
            aria-pressed={config.grain}
          >
            grain
          </button>
        </div>

        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="mono"
            style={{
              position: "fixed",
              left: "50%",
              bottom: 30,
              transform: "translateX(-50%)",
              border: "1px solid var(--a2)",
              borderRadius: 999,
              padding: "10px 18px",
              fontSize: 11,
              letterSpacing: "0.18em",
              color: "var(--fg)",
              background: "var(--surface)",
              zIndex: 80,
            }}
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  );
}
