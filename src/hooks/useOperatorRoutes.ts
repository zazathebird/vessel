import { useEffect, useRef } from "react";

import { useConfig } from "../config/ConfigContext";
import { NAV } from "../data/pageIds";
import { isModalOpen } from "./useFocusTrap";

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

const KONAMI_KEYS = KONAMI.split(" ");

const DRAG_THRESHOLD = 260;

/**
 * Is the tail of the buffer the opening of a konami?
 *
 * The code contains two ArrowLefts and two ArrowRights, so without this an
 * operator entering it is paged across four pages before the door opens.
 * A complete match is not "started" — the door branch has already taken it.
 */
function konamiStarted(keys: string[]): boolean {
  for (let i = 0; i < keys.length; i++) {
    const tail = keys.slice(i);
    if (tail.length < KONAMI_KEYS.length && tail.every((k, j) => k === KONAMI_KEYS[j])) return true;
  }
  return false;
}

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
  const { config, go, openDoor, closeDoor, closePanel, panelOpen, doorOpen, poke } = useConfig();

  // Read at event time, not bind time, so the listeners can be attached once.
  const live = useRef({ page: config.page, panelOpen, doorOpen });
  useEffect(() => {
    live.current = { page: config.page, panelOpen, doorOpen };
  });

  useEffect(() => {
    const keys: string[] = [];

    const onKey = (event: KeyboardEvent) => {
      const key = (event.key || "").toLowerCase();
      poke();

      // A dialog or the command palette is aria-modal: the rest of the page is
      // promised inert, so none of these routes may fire under one — not even
      // ⌘K, which would open the door invisibly *beneath* the palette's scrim.
      // The modal's own Escape handler sits on `document` and stops
      // propagation, so it has already acted before this listener on `window`
      // could; everything else is simply refused here.
      if (isModalOpen()) return;

      if ((event.metaKey || event.ctrlKey) && key === "k") {
        // Only take the keystroke off the browser if the door actually opens.
        // `openDoor` refuses everyone who is not the operator, which is every
        // visitor, and stealing their ⌘K in exchange for nothing is a tax.
        if (openDoor("⌘K")) event.preventDefault();
        return;
      }
      if (key === "escape") {
        // One layer per Escape. The door and the panel are mutually exclusive
        // (openDoor closes the panel), so this is one close either way — the
        // if/else states the layering rather than changing it. The layers that
        // *can* stack, dialogs and the palette, handle their own Escape on
        // `document` and stop propagation before this listener runs.
        if (live.current.doorOpen) closeDoor();
        else closePanel();
        return;
      }

      // Everything below this line is a shortcut that steals a keystroke, so
      // none of it may run while the visitor is typing into a field. Esc and
      // ⌘K stay above it deliberately: both are wanted *from* a focused input,
      // one to leave and one because it is a global command.
      if (isEditable(event.target)) return;

      // The buffer is read before paging, not after, because an arrow key can
      // belong to either and the sequence has the stronger claim on it.
      keys.push(key);
      if (keys.length > 12) keys.shift();
      const buffer = keys.join(" ");
      if (buffer.includes("s u d o")) {
        keys.length = 0;
        openDoor("typed command");
        return;
      }
      if (buffer.includes(KONAMI)) {
        keys.length = 0;
        openDoor("konami");
        return;
      }

      if (
        (key === "arrowright" || key === "arrowleft") &&
        !live.current.panelOpen &&
        !konamiStarted(keys)
      ) {
        const i = NAV.findIndex((n) => n.id === live.current.page);
        if (i > -1) {
          go(NAV[(i + (key === "arrowright" ? 1 : NAV.length - 1)) % NAV.length].id);
        }
      }
    };

    // A drag that is a text selection must not open the door. Same reasoning as
    // `useAccountRoutes`, which owns the other direction: selecting the share
    // code in the panel, or ten recovery codes that render exactly once, is a
    // sideways pointer drag over text and nothing else.
    let dragFrom: number | null = null;
    const onDown = (event: PointerEvent) => {
      dragFrom = isEditable(event.target) ? null : event.clientX;
      poke();
    };
    const onUp = (event: PointerEvent) => {
      const from = dragFrom;
      dragFrom = null;
      if (from === null) return;
      if (isModalOpen()) return;
      if (window.getSelection()?.toString()) return;
      if (event.clientX - from > DRAG_THRESHOLD) openDoor("dragged sideways");
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
