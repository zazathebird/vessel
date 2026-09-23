import { Component, Suspense } from "react";
import type { ErrorInfo, ReactNode } from "react";

/**
 * The boundary every code-split surface sits behind.
 *
 * Nothing in `src/` used to be split at all: one 512KB chunk, of which roughly
 * a third is the operator's own application — the settings panel, the door,
 * `/admin` and its downloads editor, `/machines`, `/share` — plus the two
 * account forms, none of which an anonymous visitor can ever execute. Those are
 * `React.lazy` now, and this is what holds them.
 *
 * Two promises, and both are load-bearing:
 *
 * - **The fallback is `null`, never a spinner.** Every split boundary here is
 *   inside a page that has already painted — the hero, the header and the
 *   footer are outside it — so a placeholder would be a flash and a reflow in
 *   the middle of a page the visitor is already reading. Rendering nothing for
 *   one round trip is the smaller lie. It is also why no boundary may ever wrap
 *   the chrome itself.
 * - **A chunk that fails to load must not take the site with it.** A rejected
 *   `import()` throws from inside `React.lazy`, and with no boundary above it
 *   React unmounts the whole tree — a blank page, on a route that used to work.
 *   The one route this matters most on is `/signin`, whose footer link is an
 *   invariant precisely because it is the only findable way in on a phone. So
 *   the route boundaries pass an `error` node and get an honest message with a
 *   reload; the two overlays pass none, because a panel that failed to arrive
 *   is a panel the operator can ask for again.
 */

class ChunkBoundary extends Component<{ children: ReactNode; error: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(cause: Error, info: ErrorInfo) {
    // The log line is the product here, as it is for the CSP reports: there is
    // no store to write to and a failed chunk is almost always a deploy that
    // moved under an open tab, which `wrangler tail` cannot see anyway.
    console.error("[vessel] a lazy chunk failed to load", cause, info.componentStack);
  }

  render() {
    return this.state.failed ? this.props.error : this.props.children;
  }
}

export function Lazy({ children, error = null }: { children: ReactNode; error?: ReactNode }) {
  return (
    <ChunkBoundary error={error}>
      <Suspense fallback={null}>{children}</Suspense>
    </ChunkBoundary>
  );
}

/**
 * What a route says when its chunk never arrived. It is deliberately one block
 * in the ordinary grid shape rather than an overlay: the page around it is
 * intact, and the honest statement is that this part of it is not.
 */
export function ChunkFailed() {
  return (
    <div className="v-grid">
      <article className="v-block" style={{ "--i": 0 } as React.CSSProperties}>
        <h2>This part did not load</h2>
        <p>
          The connection dropped partway, or the site was updated while this tab was open. Reloading
          fixes both.
        </p>
        <div className="v-cta-row">
          <button type="button" className="v-cta is-primary" onClick={() => window.location.reload()}>
            Reload
          </button>
        </div>
      </article>
    </div>
  );
}
