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

/**
 * Is the keystroke going into a field the visitor is typing in?
 *
 * This used to be answerable with `panelOpen`, because the share-code box was
 * the only text input on the entire site and it lived in the panel. The account
 * pages put inputs in the page itself, and without this guard the consequences
 * are immediate: ArrowLeft to move the cursor inside a password pages the site
 * sideways, and a handle containing `sudo` opens the operator door.
 *
 * Exported because the account routes need exactly the same answer.
 */
export function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
}

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

      // Everything below this line is a shortcut that steals a keystroke, so
      // none of it may run while the visitor is typing into a field. Esc and
      // ⌘K stay above it deliberately: both are wanted *from* a focused input,
      // one to leave and one because it is a global command.
      if (isEditable(event.target)) return;

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
