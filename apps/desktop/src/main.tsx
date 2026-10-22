import React from "react";
import ReactDOM from "react-dom/client";
import App from "./next/NextApp";
import "./styles.css";
const Root = import.meta.env.DEV && new URLSearchParams(location.search).has("legacy") ? React.lazy(() => import("./App")) : App;
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <React.Suspense fallback={<div>Opening workspace…</div>}><Root /></React.Suspense>
  </React.StrictMode>,
);
