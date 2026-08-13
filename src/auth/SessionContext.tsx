import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";

import { api, type MeResult } from "./api";

/**
 * Who is signed in, for the parts of the interface that depend on it.
 *
 * Deliberately separate from `ConfigContext`. §11 requires that context stay
 * synchronous and gain no fetching — it builds config during the first render
 * so there is no flash of the default palette — and this one is a fetch by
 * nature. Keeping them apart is what lets the site render fully before the
 * answer arrives.
 *
 * Everything gated on this **starts hidden and appears** once the answer comes
 * back, never the reverse. A control that flashes into view and vanishes is
 * worse than one that arrives a moment late, and more importantly the operator
 * panel must never be visible to a visitor even for one frame.
 *
 * Signed out, offline, or with the Worker down, `account` is null and the site
 * is the site every visitor sees. That is the whole of §11's "everything
 * degrades" for this layer.
 */

interface SessionValue {
  /** The signed-in account, or null. Null while the first check is in flight. */
  me: MeResult | null;
  /** True once the first check has settled, whatever it found. */
  known: boolean;
  /** True only for a signed-in operator. The one flag the interface gates on. */
  isOperator: boolean;
  /** Re-read the session — after a sign-in, a sign-out, or a change to it. */
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResult | null>(null);
  const [known, setKnown] = useState(false);

  // Last call wins, by serial number. Without this, the mount-time probe can
  // settle *after* a post-sign-in refresh — its 401 lands late, `setMe(null)`
  // reads as signed-out, and losing `isOperator` force-closes the panel and
  // door over a perfectly valid session.
  const serial = useRef(0);

  const refresh = useCallback(async () => {
    const ticket = ++serial.current;
    let next: MeResult | null;
    try {
      next = await api.me();
    } catch {
      // A 401 is the ordinary answer for a visitor, not a fault, and a network
      // failure has to land in the same place: signed out, site unchanged.
      next = null;
    }
    if (ticket !== serial.current) return;
    setMe(next);
    setKnown(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionValue>(
    () => ({ me, known, isOperator: me?.account.isOperator === true, refresh }),
    [me, known, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession outside SessionProvider");
  return value;
}
