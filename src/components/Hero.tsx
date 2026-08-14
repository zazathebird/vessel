import { useConfig } from "../config/ConfigContext";
import type { Page } from "../data/pages";
import type { LayoutId } from "../data/catalog";
import { useScramble } from "../hooks/useScramble";
import { Ornament } from "./Ornament";

export function Hero({ page, layout }: { page: Page; layout: LayoutId }) {
  const { config, go, revealMail } = useConfig();

  const h1Text = useScramble(page.title, config.calm);

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
        {/* The vitals strip — palette name, layout name, effect name, pulse —
            was removed at the client's request on 2026-08-12. The point they
            made is a fair one: the layout should be *shown*, not captioned. The
            names were a readout of state nobody had asked to see.

            One thing went with it and is worth knowing. The strip carried the
            "· adapted" suffix, which was how a visitor could tell that a small
            screen had collapsed the operator's stored layout rather than the
            operator's choice simply not applying. The stored layout is still
            never overwritten, so nothing is silently wrong in the data — but the
            state is no longer surfaced anywhere in the interface. If that
            distinction needs to come back, it wants its own affordance rather
            than the whole readout returning. */}
      </div>
    </section>
  );
}
