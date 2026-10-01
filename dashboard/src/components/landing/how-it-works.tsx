import { HOW_IT_WORKS, LANDING_CONTENT } from "@/content/landing.id";

export function HowItWorks(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="cara-kerja">
      <div className="landing-container">
        <h2 id="cara-kerja" tabIndex={-1}>
          {LANDING_CONTENT.howHeading}
        </h2>
        <ol className="landing-steps">
          {HOW_IT_WORKS.map((item) => (
            <li key={item.step}>
              <p className="landing-step-number" aria-hidden="true">
                {item.step}
              </p>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
