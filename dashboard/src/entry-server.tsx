import { renderToString } from "react-dom/server";
import { LandingPage } from "./app/landing-page";

export function renderLanding(): string {
  return renderToString(<LandingPage />);
}
