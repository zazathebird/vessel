import { useEffect, useState } from "react";

import { useConfig } from "../config/ConfigContext";

/**
 * The email is never allowed to appear in static markup — it is assembled from
 * parts at runtime. Click reveals it, copies it to the clipboard, and toasts;
 * it resets to unrevealed on every page change (SPEC.md § the nine pages).
 */
const MAIL_PARTS = ["patrickmcclevarty", String.fromCharCode(64), "outlook", ".", "com"];
const MAIL = MAIL_PARTS.join("");

export function EmailReveal() {
  const { config, say } = useConfig();
  const [shown, setShown] = useState(false);

  useEffect(() => {
    setShown(false);
  }, [config.page]);

  const reveal = () => {
    setShown(true);
    navigator.clipboard?.writeText(MAIL).catch(() => {});
    say("address copied");
  };

  return (
    <button type="button" className="v-mail" onClick={reveal}>
      {shown ? MAIL : "click to reveal the address"}
    </button>
  );
}
