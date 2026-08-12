import { useConfig } from "../config/ConfigContext";
import { FX, LAYOUTS } from "../data/catalog";
import { PALETTES } from "../data/palettes";
import type { Page } from "../data/pages";
import type { LayoutId } from "../data/catalog";
import { useScramble } from "../hooks/useScramble";
import { Ornament } from "./Ornament";

export function Hero({ page, layout }: { page: Page; layout: LayoutId }) {
  const { config, go, adapted, revealMail } = useConfig();
  const isNotFound = config.page === "notfound";

  const h1Text = useScramble(page.title, config.calm);

  const palette = PALETTES[config.pal];
  const layoutLabel = LAYOUTS.find((l) => l.id === layout)?.label ?? layout;
  const fxLabel = FX.find((f) => f.id === config.fx)?.label ?? config.fx;
  const vitals = isNotFound ? "pressure lost" : config.calm ? "resting" : "pulse 47 bpm";

  return (
    <section className="v-hero">
      <Ornament layout={layout} />

      <div className="v-hero-text">
        <div className="v-eyebrow">
          <span className="v-eyebrow-rule" aria-hidden="true" />
          {page.eyebrow}
        </div>
        <h1 className="v-title">{h1Text}</h1>
        <p className="v-lede">{page.lede}</p>
        <div className="v-cta-row">
          {page.ctas.map((cta) => (
            <button
              key={cta.label}
              type="button"
              className={`v-cta${cta.primary ? " is-primary" : ""}`}
              onClick={() => (cta.action === "reveal-mail" ? revealMail() : go(cta.to))}
            >
              {cta.label}
            </button>
          ))}
        </div>
        <div className="v-vitals">
          <span>{palette.name}</span>
          <span>
            {layoutLabel} layout
            {adapted ? " · adapted" : ""}
          </span>
          <span>{config.calm ? "calm" : fxLabel}</span>
          <span>{vitals}</span>
        </div>
      </div>
    </section>
  );
}
