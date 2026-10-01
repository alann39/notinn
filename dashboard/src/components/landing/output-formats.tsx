import { useState } from "react";
import {
  ADDITIONAL_FORMATS,
  FEATURED_FORMATS,
  FORMAT_PREVIEWS,
  LANDING_CONTENT,
} from "@/content/landing.id";

export function OutputFormats(): React.ReactElement {
  const [selectedFormat, setSelectedFormat] = useState<string>("Clean note");
  const activePreview = FORMAT_PREVIEWS[selectedFormat] ?? FORMAT_PREVIEWS["Clean note"];

  return (
    <section className="landing-section" aria-labelledby="format">
      <div className="landing-container">
        <p className="landing-eyebrow">{LANDING_CONTENT.formatsEyebrow}</p>
        <h2 id="format" tabIndex={-1}>
          {LANDING_CONTENT.formatsHeading}
        </h2>
        <p>{LANDING_CONTENT.formatsBody}</p>
        <div className="landing-format-pills" role="group" aria-label="Format preview options">
          {FEATURED_FORMATS.map((format) => {
            const isSelected = selectedFormat === format;
            return (
              <button
                key={format}
                type="button"
                className={`landing-format-pill ${isSelected ? "is-active" : ""}`}
                aria-pressed={isSelected}
                onClick={() => setSelectedFormat(format)}
              >
                {format}
              </button>
            );
          })}
        </div>

        <div className="landing-format-preview-card" aria-live="polite">
          <div className="landing-format-preview-header">
            <span className="landing-panel-label">Result preview</span>
            <span className="landing-notepad-badge">{activePreview.badge}</span>
          </div>
          <h3 className="landing-format-preview-title">{activePreview.title}</h3>
          <p className="landing-format-preview-desc">{activePreview.description}</p>
          <ul className="landing-format-preview-list">
            {activePreview.items.map((item, idx) => (
              <li key={idx}>{item}</li>
            ))}
          </ul>
        </div>

        <details className="landing-disclosure">
          <summary>{LANDING_CONTENT.formatsMore}</summary>
          <ul className="landing-format-list">
            {ADDITIONAL_FORMATS.map((format) => (
              <li key={format}>{format}</li>
            ))}
          </ul>
        </details>
      </div>
    </section>
  );
}
