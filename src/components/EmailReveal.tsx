import { useConfig } from "../config/ConfigContext";
import { MAIL } from "../data/mail";

/**
 * Click to reveal the address, which also copies it and toasts. Reveal state
 * lives in the context rather than here, so Contact's primary CTA can trigger
 * the same reveal and so it resets on page change (SPEC.md § State).
 */
export function EmailReveal() {
  const { mailShown, revealMail } = useConfig();

  return (
    <button type="button" className="v-mail" onClick={revealMail}>
      {mailShown ? MAIL : "click to reveal the address"}
    </button>
  );
}
