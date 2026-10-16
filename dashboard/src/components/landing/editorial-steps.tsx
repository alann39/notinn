export function EditorialSteps() {
  const steps = [
    {
      num: "1",
      tag: "Hold & Speak",
      title: "Record or Forward",
      desc: "Tap the microphone in Telegram while walking, or forward any voice memo from your friends or colleagues.",
    },
    {
      num: "2",
      tag: "15s Pipeline",
      title: "Instant Synthesis",
      desc: "Gemini AI extracts key arguments, deadlines, action items, and generates Cornell cues in 15 seconds.",
    },
    {
      num: "3",
      tag: "Telegram Chat",
      title: "Review on Mobile",
      desc: "Receive the structured summary right inside your Telegram thread — no app switching required.",
    },
    {
      num: "4",
      tag: "Web Reader",
      title: "Deep Read & Act",
      desc: "Open the web dashboard for full Cornell 2-column recall, task checking, and Markdown export.",
    },
  ];

  return (
    <section id="workflow" className="py-20 border-t border-[var(--ed-line)] bg-[var(--ed-bg-subtle)]/40">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ed-ink)]">
            No setup. No sign-in. <br />
            <em>No tutorial.</em>
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            Designed to get out of your way so your raw thoughts actually get captured before they evaporate.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((s) => (
            <div key={s.num} className="p-6 rounded-2xl bg-[var(--ed-surface)] border border-[var(--ed-line)] shadow-2xs hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between mb-4">
                <span className="font-mono text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {s.num}
                </span>
                <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-[var(--ed-surface-2)] text-[var(--ed-text-2)] border border-[var(--ed-line)]">
                  {s.tag}
                </span>
              </div>
              <h3 className="text-lg font-bold text-[var(--ed-ink)] mb-2">{s.title}</h3>
              <p className="text-sm text-[var(--ed-text-2)] leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
