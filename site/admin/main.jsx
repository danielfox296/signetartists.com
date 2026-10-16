/* The Signet admin: a static app at admin.signetartists.com that edits
   content/ on the staging branch of the Signet repo. */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./app.css";
import { App } from "./ui/App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
