import { FAQ_ITEMS } from "@/content/landing.id";

export function LandingFaq(): React.ReactElement {
  return (
    <section className="landing-section" aria-labelledby="faq-heading">
      <div className="landing-container">
        <h2 id="faq-heading">Frequently asked questions</h2>
        <div className="landing-faq">
          {FAQ_ITEMS.map((item) => (
            <details key={item.key} name="notinn-faq">
              <summary>
                <span>{item.question}</span>
                <span aria-hidden="true">+</span>
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
