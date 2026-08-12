import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { NAV } from "../data/pageIds";

/**
 * The operator door's keyboard and pointer routes (SPEC.md § The operator door),
 * plus Esc-to-close and arrow-key paging.
 *
 * Four of the six routes live here — the Konami code, typing `sudo`, dragging
 * the page sideways, and ⌘K/Ctrl+K. The other two are attached to the elements
 * they belong to: five taps on the logo (Header) and the footer `·` (Footer).
 *
 * All of this is theatre. There is no authentication and nothing behind the
 * door but a settings panel — see CLAUDE.md.
 */

const KONAMI = [
  "arrowup",
  "arrowup",
  "arrowdown",
  "arrowdown",
  "arrowleft",
  "arrowright",
  "arrowleft",
  "arrowright",
  "b",
  "a",
].join(" ");

const DRAG_THRESHOLD = 260;

export function useOperatorRoutes(): void {
  const { config, go, openDoor, closeDoor, closePanel, panelOpen, poke } = useConfig();

  // Read at event time, not bind time, so the listeners can be attached once.
  const live = useRef({ page: config.page, panelOpen });
  useEffect(() => {
    live.current = { page: config.page, panelOpen };
  });

  useEffect(() => {
    const keys: string[] = [];

    const onKey = (event: KeyboardEvent) => {
      const key = (event.key || "").toLowerCase();
      poke();

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        event.preventDefault();
        openDoor("⌘K");
        return;
      }
      if (key === "escape") {
        closeDoor();
        closePanel();
        return;
      }
      if ((key === "arrowright" || key === "arrowleft") && !live.current.panelOpen) {
        const i = NAV.findIndex((n) => n.id === live.current.page);
        if (i > -1) {
          go(NAV[(i + (key === "arrowright" ? 1 : NAV.length - 1)) % NAV.length].id);
        }
      }

      keys.push(key);
      if (keys.length > 12) keys.shift();
      const buffer = keys.join(" ");
      if (buffer.includes("s u d o")) {
        keys.length = 0;
        openDoor("typed command");
      } else if (buffer.includes(KONAMI)) {
        keys.length = 0;
        openDoor("konami");
      }
    };

    let dragFrom: number | null = null;
    const onDown = (event: PointerEvent) => {
      dragFrom = event.clientX;
      poke();
    };
    const onUp = (event: PointerEvent) => {
      if (dragFrom !== null && event.clientX - dragFrom > DRAG_THRESHOLD) {
        openDoor("dragged sideways");
      }
      dragFrom = null;
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
    };
  }, [go, openDoor, closeDoor, closePanel, poke]);
}
