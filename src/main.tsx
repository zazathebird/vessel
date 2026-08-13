import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { ConfigProvider } from "./config/ConfigContext";
import { SessionProvider } from "./auth/SessionContext";
import "./styles/base.css";
import "./styles/chrome.css";
import "./styles/layouts.css";
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
