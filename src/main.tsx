import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import QuickCapture from "./QuickCapture";
import "./index.css";
import "./styles.css";

const isQuickCapture = location.hash === "#quick";

// Apply transparent background synchronously before first paint
// so there is never a white flash in the frameless quick-capture window
if (isQuickCapture) {
  document.documentElement.classList.add("qc-mode");
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isQuickCapture ? <QuickCapture /> : <App />}
  </React.StrictMode>
);
