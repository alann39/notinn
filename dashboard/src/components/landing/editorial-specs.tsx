import { Bot, ArrowRight } from "lucide-react";

export function EditorialSpecs() {
  const specs = [
    {
      label: "Speed",
      lead: "15 seconds average turnaround",
      desc: "From the second you release the Telegram mic button to your structured Cornell note landing in chat.",
    },
    {
      label: "Privacy",
      lead: "Zero audio storage",
      desc: "Audio files are processed in ephemeral memory, transcribed, and deleted immediately. We never store voice recordings or train models on your data.",
    },
    {
      label: "Ceiling",
      lead: "45 MB audio ceiling",
      desc: "Handles long lectures, extensive brainstorming sessions, and full meetings up to 2 hours in high-fidelity OPUS/AAC.",
    },
    {
      label: "Screen Lock",
      lead: "Screen Wake Lock built-in",
      desc: "Web dashboard holds an active wake lock during recording and upload so your mobile browser never sleeps mid-thought.",
    },
    {
      label: "Format",
      lead: "Pure Markdown & Cornell Structure",
      desc: "No proprietary lock-in. Copy clean markdown with headings, cues, bullet points, and task checklists directly into Obsidian or Notion.",
    },
  ];

  return (
    <section id="specs" className="py-20 border-t border-[var(--ed-line)] bg-[var(--ed-bg-subtle)]/30">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ed-ink)]">
            A zero-bloat thinking tool, <br />
            <em>not a bloated SaaS.</em>
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            Notinn is designed to respect your device, your attention, and your privacy.
          </p>
        </div>

        <div className="ed-stack">
          {specs.map((s, i) => (
            <div key={i} className="ed-stack__row">
              <span className="ed-stack__label">{s.label}</span>
              <div>
                <strong>{s.lead}. </strong>
                <span>{s.desc}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href="https://t.me/notinnbot"
            target="_blank"
            rel="noopener noreferrer"
            className="ed-btn ed-btn--primary inline-flex items-center gap-2"
          >
            <Bot className="size-4" />
            <span>Try @notinnbot on Telegram</span>
            <ArrowRight className="size-4 opacity-60" />
          </a>
        </div>
      </div>
    </section>
  );
}
