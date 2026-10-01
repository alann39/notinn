import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { router } from "@/app/router";
import "./index.css";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Missing #root application mount");
}

rootElement.replaceChildren();
createRoot(rootElement).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);

