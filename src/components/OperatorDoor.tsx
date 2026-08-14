import { useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { useFocusTrap } from "../hooks/useFocusTrap";

/**
 * The operator door.
 *
 * This is theatre and says so: there is no backend, no authentication, and
 * nothing behind it but the settings drawer. The three credential rows are
 * decoration, `authenticate` only sets a local flag, and the modal's own copy
 * tells the visitor that the real door is somewhere else. It must never be
 * presented as security, and must never guard anything that matters
 * (SPEC.md § Security).
 */
export function OperatorDoor() {
  const { doorOpen, doorVia, closeDoor, openConfig } = useConfig();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useFocusTrap(doorOpen, dialogRef);

  if (!doorOpen) return null;

  return (
    <div className="v-door-scrim" onClick={closeDoor}>
      <span className="v-shock a" aria-hidden="true" />
      <span className="v-shock b" aria-hidden="true" />

      <div
        ref={dialogRef}
        className="v-door"
        role="dialog"
        aria-modal="true"
        aria-labelledby="v-door-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="v-door-via">
          <span className="v-door-pip" aria-hidden="true" />
          <span>{doorVia}</span>
        </div>

        <h2 id="v-door-title" className="v-door-title">
          Operator access
        </h2>
        <p className="v-door-copy">
          Private hostname. This door is a courtesy — the real one is not on this site, does not
          share a domain, and does not answer to visitors.
        </p>

        <div className="v-door-rows" aria-hidden="true">
          <div className="v-door-row">
            <span>identity</span>
            <span className="v-door-value">••••••••••</span>
          </div>
          <div className="v-door-row">
            <span>key</span>
            <span className="v-door-value">••••••••••••••••</span>
          </div>
          <div className="v-door-row">
            <span>second factor</span>
            <span className="v-door-pending">awaiting hardware key</span>
          </div>
        </div>

        <div className="v-door-actions">
          <button type="button" className="v-door-go" onClick={openConfig}>
            authenticate
          </button>
          <button type="button" className="v-door-leave" onClick={closeDoor}>
            leave
          </button>
        </div>

        <p className="v-door-routes">
          six ways in, all of them yours: 5× logo · konami · type “sudo” · drag the page sideways ·
          the footer dot · ⌘K
        </p>
      </div>
    </div>
  );
}
