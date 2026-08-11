import type { PageBlock } from "../data/pages";
import { EmailReveal } from "./EmailReveal";

/**
 * One content block. Layout-specific chrome (card vs. row vs. borderless
 * column) is entirely CSS — see `.v-block` and its `.layout-*` overrides —
 * this component only ever renders structure and copy.
 */
export function ContentBlock({
  block,
  index,
  staggerMs = 50,
}: {
  block: PageBlock;
  index: number;
  /** Console streams blocks in at 160ms intervals so arrival reads as printed output. */
  staggerMs?: number;
}) {
  return (
    <article className="v-block" style={{ animationDelay: `${(index * staggerMs) / 1000}s` }}>
      <div className="v-block-head">
        <span className="v-kicker">
          <span className="v-kicker-dot" aria-hidden="true" />
          {block.kicker}
        </span>
        <span className="v-block-idx">{String(index + 1).padStart(2, "0")}</span>
      </div>
      <h3>{block.title}</h3>
      {block.body && <p>{block.body}</p>}

      {block.hasList && block.items && (
        <ul className="v-list">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}

      {block.hasTile && (
        <div className="v-tile">
          <span className="v-tile-glow" aria-hidden="true" />
          <span className="v-tile-caption">{block.tile}</span>
        </div>
      )}

      {block.hasMail && <EmailReveal />}
    </article>
  );
}
