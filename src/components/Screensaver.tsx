import { useConfig } from "../config/ConfigContext";

/**
 * Sixty seconds without a click fades the whole interface out and leaves only
 * the canvas, which speeds up. Mouse movement deliberately does not wake it —
 * a click does (SPEC.md § Screensaver). Disabled entirely in calm.
 *
 * The overlay is what catches that click. The chrome behind it has already had
 * `pointer-events: none` applied by its own fade, so nothing underneath can
 * take the wake click by accident.
 */
export function Screensaver() {
  const { saver, panelOpen, doorOpen, poke } = useConfig();

  if (!saver || panelOpen || doorOpen) return null;

  return (
    <button type="button" className="v-saver" onClick={poke}>
      <span className="v-saver-label">click to return</span>
    </button>
  );
}
