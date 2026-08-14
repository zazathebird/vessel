import { useEffect, useMemo, useRef, useState } from "react";

import { useConfig } from "../config/ConfigContext";
import { useSession } from "../auth/SessionContext";
import { api, type SavedSetup } from "../auth/api";
import { decodeShareCode } from "../config/shareCode";
import { saveCalmPreference } from "../config/persistence";
import { FX, LAYOUTS, TYPESETS } from "../data/catalog";
import { ORNAMENTS } from "../data/ornaments";
import { PALETTES } from "../data/palettes";
import { FOOTER_NAV, NAV } from "../data/pageIds";
import { isEditable } from "../hooks/useOperatorRoutes";
import { isModalOpen, useFocusTrap } from "../hooks/useFocusTrap";

/**
 * The command palette (SPEC-ACCOUNTS.md §10) — the "proper commands" ask.
 *
 * **`⌘K` is deliberately not bound.** It is claimed twice — `SPEC.md` gives it
 * to the operator door as the sixth unlock route, §10 gives it here — and that
 * contradiction is on the client's sign-off list. Binding it now would settle
 * the question by accident. Until the client picks, the palette opens by
 * typing `cmd` anywhere, the same idiom as `whoami` and `login`, and the
 * binding is a two-line change in this file's key listener when it lands.
 *
 * What it offers is what the caller could already do by other means, gated the
 * same way: navigation and the account pages for everyone, saved setups and
 * sign-out when signed in, and the full siteconfig vocabulary — palettes,
 * layouts, backgrounds, type, ornaments, toggles, the dice — for the operator
 * only, mirroring the panel's gate. A palette that gave visitors controls the
 * site otherwise reserves would be a product change wearing a shortcut's
 * clothes.
 *
 * z-index **85** per §11's ladder: above the door's scrim (80), below toasts
 * (90). Rendered as an overlay sibling in `App`, palette-driven, focus-trapped,
 * Escape to dismiss — the dialog rules, at a different altitude.
 */

interface Command {
  id: string;
  label: string;
  run: () => void;
}

/** How much typed buffer to keep while watching for `cmd`. */
const BUFFER = 8;

/**
 * The touch route in (mobile parity, client request 2026-08-13): a band
 * without a hardware keyboard cannot type `cmd` anywhere, so the header shows
 * a chip on those bands that raises this event. An event rather than lifted
 * state, deliberately — the palette owns `open`, and the header should not
 * re-render with it.
 */
const OPEN_EVENT = "v-open-palette";

export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

export function CommandPalette() {
  const { config, update, go, shuffle, say, togglePanel } = useConfig();
  const { me, isOperator, refresh } = useSession();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [setups, setSetups] = useState<SavedSetup[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  // Modal for the same reason dialogs are: while the palette is up, the global
  // key routes must not page the site or open the door underneath it.
  useFocusTrap(open, ref, { modal: true });

  // The typed route in. Same guards as the account routes: never while typing
  // in a field, never with a modifier held — and never over an open dialog,
  // whose buttons are not editable fields but whose aria-modal still means
  // "nothing else may act".
  useEffect(() => {
    const keys: string[] = [];
    const onKey = (event: KeyboardEvent) => {
      if (isModalOpen()) return;
      if (isEditable(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = (event.key || "").toLowerCase();
      if (key.length !== 1) return;
      keys.push(key);
      if (keys.length > BUFFER) keys.shift();
      if (keys.join("").includes("cmd")) {
        keys.length = 0;
        setOpen(true);
      }
    };
    // The header chip's route in — same modal guard as the typed one; the
    // other guards are about keystrokes and do not apply to a real button.
    const onOpenEvent = () => {
      if (isModalOpen()) return;
      setOpen(true);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onOpenEvent);
    };
  }, []);

  // Escape closes from anywhere in the palette, including the input. One
  // Escape, one layer: propagation stops here so the operator routes' handler
  // on `window` cannot also close the panel this palette was opened over.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // A fresh open is a fresh question.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
    if (me) {
      api
        .setupsList()
        .then(({ setups: rows }) => setSetups(rows))
        .catch(() => setSetups([]));
    } else {
      setSetups([]);
    }
  }, [open, me]);

  const commands = useMemo<Command[]>(() => {
    if (!open) return [];
    const list: Command[] = [];
    const add = (id: string, label: string, run: () => void) =>
      list.push({ id, label, run });

    for (const entry of [...NAV, ...FOOTER_NAV]) {
      add(`go-${entry.id}`, `go — ${entry.label}`, () => go(entry.id));
    }

    if (me) {
      add("account", "account — summary", () => go("signin"));
      for (const setup of setups) {
        add(`setup-${setup.id}`, `setup — ${setup.name}`, () => {
          const shared = decodeShareCode(setup.shareCode);
          if (!shared) {
            say(`${setup.name} does not decode any more`);
            return;
          }
          update(shared);
          say(`applied ${setup.name}`);
        });
      }
      add("signout", "account — sign out", () => {
        void api
          .signout()
          .then(() => refresh())
          .then(() => say("signed out"))
          // Same words as SignIn's sign-out path: a failure that says nothing
          // leaves someone believing they signed out when they did not.
          .catch(() => say("Could not reach the server — you may still be signed in."));
      });
    } else {
      add("signin", "account — sign in", () => go("signin"));
      add("signup", "account — make one", () => go("signup"));
    }

    if (isOperator) {
      add("admin", "go — administration", () => go("admin"));
      add("panel", "siteconfig — open the panel", () => togglePanel());
      add("shuffle", "siteconfig — roll the dice", () => shuffle());
      PALETTES.forEach((palette, index) =>
        add(`pal-${palette.id}`, `palette — ${palette.name}`, () => update({ pal: index })),
      );
      for (const layout of LAYOUTS) {
        add(`layout-${layout.id}`, `layout — ${layout.label}`, () => update({ layout: layout.id }));
      }
      for (const fx of FX) {
        add(`fx-${fx.id}`, `background — ${fx.label}`, () => update({ fx: fx.id }));
      }
      TYPESETS.forEach((typeset, index) =>
        add(`type-${typeset.id}`, `type — ${typeset.label}`, () => update({ type: index })),
      );
      for (const ornament of ORNAMENTS) {
        add(`orn-${ornament.id}`, `ornament — ${ornament.label}`, () =>
          update({ ornament: ornament.id }),
        );
      }
      const toggles = [
        ["grain", config.grain],
        ["breathe", config.breathe],
        ["cursor", config.cursor],
        ["calm", config.calm],
      ] as const;
      for (const [key, value] of toggles) {
        add(`toggle-${key}`, `toggle — ${key} ${value ? "off" : "on"}`, () => {
          // Calm follows the visitor home from every toggle that flips it
          // deliberately — the header, the panel, and here.
          if (key === "calm") saveCalmPreference(!value);
          update({ [key]: !value });
        });
      }
    }

    return list;
  }, [open, me, setups, isOperator, config, go, update, say, shuffle, togglePanel, refresh]);

  const needle = query.trim().toLowerCase();
  const matches = needle
    ? commands.filter((command) => command.label.toLowerCase().includes(needle))
    : commands;
  const active = matches[Math.min(selected, Math.max(0, matches.length - 1))];

  if (!open) return null;

  const run = (command: Command) => {
    setOpen(false);
    command.run();
  };

  return (
    <div className="v-cmd-scrim" onClick={() => setOpen(false)}>
      <div
        ref={ref}
        className="v-cmd"
        role="dialog"
        aria-modal="true"
        aria-label="commands"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          className="v-input v-cmd-input"
          role="combobox"
          aria-expanded="true"
          aria-controls="v-cmd-list"
          aria-activedescendant={active ? `v-cmd-${active.id}` : undefined}
          aria-label="type a command"
          placeholder="type — pages, setups, looks"
          value={query}
          spellCheck={false}
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSelected((index) => Math.min(index + 1, matches.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setSelected((index) => Math.max(index - 1, 0));
            } else if (event.key === "Enter" && active) {
              event.preventDefault();
              run(active);
            }
          }}
        />

        <ul className="v-cmd-list" role="listbox" id="v-cmd-list" aria-label="matching commands">
          {matches.length === 0 ? (
            <li className="v-cmd-empty" aria-disabled="true">
              nothing answers to that
            </li>
          ) : (
            matches.map((command) => (
              <li
                key={command.id}
                id={`v-cmd-${command.id}`}
                role="option"
                aria-selected={command === active}
                className={`v-cmd-item${command === active ? " is-selected" : ""}`}
                // Mouse path: run on mouse down so the input never blurs first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  run(command);
                }}
                onMouseMove={() => setSelected(matches.indexOf(command))}
              >
                {command.label}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
