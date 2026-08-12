import { useConfig } from "../config/ConfigContext";
import { NAV } from "../data/pageIds";
import type { LayoutId } from "../data/catalog";

/**
 * The hero ornament slot.
 *
 * Whichever ornament is selected, it occupies the same square box, so the
 * layouts that resize it (Radial's 540px, Magazine's 180px) and the ones that
 * hide it entirely need no knowledge of which is showing. Radial's orbiting nav
 * pills live in this slot too, and work over any of them.
 *
 * Every ornament is drawn from palette tokens in CSS — see chrome.css — so they
 * all recolour with the palette bleed and all fall still in calm.
 */

/** Layouts with no room for it: the windowed, sideways and row layouts. */
const HIDES_ORNAMENT: LayoutId[] = ["sidescroll", "terminal", "ledger", "console", "sheet"];

export function Ornament({ layout }: { layout: LayoutId }) {
  const { band, config, go } = useConfig();

  if (band === "phone" || config.ornament === "none" || HIDES_ORNAMENT.includes(layout)) {
    return null;
  }

  return (
    <div className={`v-ornament is-${config.ornament}`}>
      {config.ornament === "valve" && <Valve />}
      {config.ornament === "lens" && <Lens />}
      {config.ornament === "aperture" && <Aperture />}
      {config.ornament === "orrery" && <Orrery />}

      {layout === "radial" && (
        // The pills get their own container so their positions can be addressed
        // by :nth-child without counting whatever the ornament put before them.
        <div className="v-orbit">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`chip v-pill v-orbit-pill${config.page === item.id ? " is-active" : ""}`}
              aria-current={config.page === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** The original: a dashed ring, three dilating rings, a glowing core. */
function Valve() {
  return (
    <>
      <span className="v-valve-dash" />
      <span className="v-valve-ring r1" />
      <span className="v-valve-ring r2" />
      <span className="v-valve-ring r3" />
      <span className="v-valve-core" />
    </>
  );
}

/**
 * A lens in a recessed bezel. Nothing scales — the geometry is dead still and
 * only the light in the pupil moves, which is what separates a watching eye
 * from a pumping speaker.
 */
function Lens() {
  return (
    <>
      <span className="v-lens-bezel" />
      <span className="v-lens-inner" />
      <span className="v-lens-halo" />
      <span className="v-lens-iris" />
      <span className="v-lens-pupil" />
      <span className="v-lens-glint" />
    </>
  );
}

/** A camera iris: hard-edged blades on a slow rotation around a dark opening. */
function Aperture() {
  return (
    <>
      <span className="v-ap-blades" />
      <span className="v-ap-hole" />
      <span className="v-ap-rim" />
    </>
  );
}

/** Three bodies on three rings, each orbiting slower the further out it sits. */
function Orrery() {
  return (
    <>
      <span className="v-orrery-ring o1">
        <span className="v-orrery-body" />
      </span>
      <span className="v-orrery-ring o2">
        <span className="v-orrery-body" />
      </span>
      <span className="v-orrery-ring o3">
        <span className="v-orrery-body" />
      </span>
      <span className="v-orrery-sun" />
    </>
  );
}
