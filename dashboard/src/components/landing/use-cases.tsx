import { LANDING_CONTENT, USE_CASES } from "@/content/landing.id";

export function UseCases(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="use-cases-heading">
      <div className="landing-container">
        <h2 id="use-cases-heading">{LANDING_CONTENT.useCasesHeading}</h2>
        <div className="landing-use-cases">
          {USE_CASES.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
