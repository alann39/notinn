import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { FEATURED_FORMATS, FEATURES, LANDING_CONTENT } from "@/content/landing.id";

const ROTATING_FORMATS = FEATURED_FORMATS.slice(0, 3);
const ROTATE_INTERVAL_MS = 2500;

export function LandingFeatures(): React.ReactElement {
  const reduceMotion = useReducedMotion();
  const [activeFormat, setActiveFormat] = useState(0);

  useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setActiveFormat((prev) => (prev + 1) % ROTATING_FORMATS.length);
    }, ROTATE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reduceMotion]);

  return (
    <section className="landing-section" aria-labelledby="features-heading">
      <div className="landing-container">
        <h2 id="features-heading">{LANDING_CONTENT.featuresHeading}</h2>
        <div className="landing-features">
          {FEATURES.map((item, index) => (
            <article key={item.title}>
              {index === 0 && (
                <div className="landing-features-demo landing-features-bars" aria-hidden="true">
                  <span style={{ width: "96%" }} />
                  <span style={{ width: "72%" }} />
                  <span style={{ width: "84%" }} />
                  <span className="is-tidy" style={{ width: "58%" }} />
                </div>
              )}
              {index === 1 && (
                <div className="landing-features-demo" aria-hidden="true">
                  <div className="landing-features-pills">
                    {ROTATING_FORMATS.map((format, pillIndex) => (
                      <span
                        key={format}
                        className={`landing-features-pill${pillIndex === activeFormat ? " is-active" : ""}`}
                      >
                        {format}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {index === 2 && (
                <div className="landing-features-demo" aria-hidden="true">
                  <div className="landing-features-saved">
                    <span className="landing-features-check">✓</span>
                    <span>Saved</span>
                  </div>
                  <p className="landing-features-saved-sub">Find and export from the dashboard</p>
                  <div className="landing-features-track">
                    <motion.div
                      className="landing-features-fill"
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: reduceMotion ? 0 : 1.2, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
