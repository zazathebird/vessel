import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { ConfigProvider } from "./config/ConfigContext";
import { SessionProvider } from "./auth/SessionContext";
// First: @font-face must be declared before any rule asks for the family, and
// fonts.css owns the two typography rules base.css and chrome.css leave unset.
import "./styles/fonts.css";
import "./styles/base.css";
import "./styles/chrome.css";
import "./styles/layouts.css";
import "./styles/entrances.css";
import "./styles/overlays.css";
import "./styles/interaction.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <SessionProvider>
      <ConfigProvider>
        <App />
      </ConfigProvider>
    </SessionProvider>
  </StrictMode>,
);
