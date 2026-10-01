import { LANDING_CONTENT } from "@/content/landing.id";

export function SearchAndDashboard(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="library-heading">
      <div className="landing-container">
        <h2 id="library-heading">{LANDING_CONTENT.libraryHeading}</h2>
        <p>{LANDING_CONTENT.libraryBody}</p>
        <p>
          <a className="landing-secondary-link" href="/notes">
            {LANDING_CONTENT.dashboardLink}
          </a>
        </p>
      </div>
    </section>
  );
}
