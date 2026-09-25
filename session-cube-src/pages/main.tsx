import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SessionCube } from "@/components/session-cube";
import "@/styles.css";

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <SessionCube />
    </StrictMode>,
  );
}
