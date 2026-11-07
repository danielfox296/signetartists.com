/* The Signet admin: a static app at admin.signetartists.com that edits
   content/ on the staging branch of the Signet repo. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./ui/App.jsx";

// A tab opened before a new build can fail to load one of its chunks:
// reload once to get the new build.
window.addEventListener("vite:preloadError", (e) => {
  try {
    if (sessionStorage.getItem("signet-admin-reloaded")) return;
    sessionStorage.setItem("signet-admin-reloaded", "1");
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});
window.addEventListener("load", () => setTimeout(() => {
  try {
    sessionStorage.removeItem("signet-admin-reloaded");
  } catch {
    /* nothing */
  }
}, 10000));

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
