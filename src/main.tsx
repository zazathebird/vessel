import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { ConfigProvider } from "./config/ConfigContext";
import "./styles/base.css";
import "./styles/chrome.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root is missing from index.html");

createRoot(root).render(
  <StrictMode>
    <ConfigProvider>
      <App />
    </ConfigProvider>
  </StrictMode>,
);
