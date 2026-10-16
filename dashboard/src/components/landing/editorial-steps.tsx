export function EditorialSteps() {
  const steps = [
    {
      num: "01",
      tag: "Zero Install",
      title: "Connect",
      desc: "Open @notinnbot on Telegram or visit the web app. No extension, no setup wizard, no app store download.",
    },
    {
      num: "02",
      tag: "Raw Input",
      title: "Speak or Forward",
      desc: "Record a voice note while commuting, forward a messy debate, or upload a 45 MB meeting recording.",
    },
    {
      num: "03",
      tag: "Gemini 2.5",
      title: "Synthesize",
      desc: "The pipeline deconstructs unstructured speech into thematic cues, distilled takeaways, and action items.",
    },
    {
      num: "04",
      tag: "High Density",
      title: "Read & Act",
      desc: "Open your master-detail dashboard, toggle Zen Mode for deep focus, and tick off tasks as you finish them.",
    },
  ];

  return (
    <section id="how-it-works" className="py-20 border-t border-[var(--ed-line)] bg-[var(--ed-bg-subtle)]/30">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--ed-ink)]">
            No setup. No sign-in. No manual.
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            Designed to get out of your way so your raw thoughts actually get captured.
          </p>
        </div>

        <div className="ed-steps mt-12">
          {steps.map((s) => (
            <div key={s.num} className="ed-step">
              <div className="flex items-center justify-between mb-4">
                <span className="ed-step__num">{s.num}</span>
                <span className="text-xs font-mono uppercase px-2 py-0.5 rounded-full bg-[var(--ed-surface-2)] text-[var(--ed-text-2)] border border-[var(--ed-line)]">
                  {s.tag}
                </span>
              </div>
              <h3 className="ed-step__title">{s.title}</h3>
              <p className="ed-step__desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
