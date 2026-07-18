import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { getToken } from "./lib/auth";

// ── Apply dark theme synchronously before first render ─────────────────────────
// This prevents any flash of light-mode styles on mount.
document.documentElement.classList.add("dark");

// ── Global auth interceptor ────────────────────────────────────────────────────
// Automatically attaches the JWT Bearer token to every fetch() call so
// individual components don't need to manage headers manually.
const _fetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const token = getToken();
  if (token) {
    const headers = new Headers(init.headers ?? {});
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    init = { ...init, headers };
  }
  return _fetch(input, init);
};

createRoot(document.getElementById("root")!).render(<App />);
