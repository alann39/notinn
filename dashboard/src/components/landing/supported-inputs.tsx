import { LANDING_CONTENT, SUPPORTED_INPUTS } from "@/content/landing.id";

export function SupportedInputs(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="input-heading">
      <div className="landing-container">
        <h2 id="input-heading">{LANDING_CONTENT.inputHeading}</h2>
        <ul className="landing-input-list">
          {SUPPORTED_INPUTS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="landing-note">{LANDING_CONTENT.inputFootnote}</p>
      </div>
    </section>
  );
}
