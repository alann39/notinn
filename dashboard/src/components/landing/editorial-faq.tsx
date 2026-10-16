import { ChevronDown } from "lucide-react";

export function EditorialFaq() {
  const faqs = [
    {
      q: "What is free, and what costs money?",
      a: "Everything needed to capture, synthesize, and read notes is free forever: recording via Telegram, forwarding audio, generating Cornell summaries, task matrices, and reading on the web dashboard. Pro ($4.99/mo) unlocks persistent audio archiving for long lectures, 45 MB browser uploads with Screen Wake Lock, and deep semantic search across your entire library.",
    },
    {
      q: "Why Telegram instead of a separate mobile app?",
      a: "Because you already have Telegram open on your phone and laptop. A separate app adds 5 seconds of friction: find icon, wait for cold start, tap new note, wait for sync. With Telegram, you simply hold the voice button in @notinnbot or forward any audio from another chat. Zero capture friction wins every time.",
    },
    {
      q: "What happens to my audio recording after processing?",
      a: "On the Free tier, your audio is held only in ephemeral server memory during transcription and synthesis, then deleted immediately. We do not store raw voice recordings and never train AI models on your speech.",
    },
    {
      q: "How is Notinn different from Otter or Fireflies?",
      a: "Otter and Fireflies send a visible bot to join your Zoom or Google Meet calls, which can feel intrusive. Notinn is built for individual thought and quick forwarding. You capture notes privately without a bot ever entering the room.",
    },
    {
      q: "What happens if my phone locks during a web recording?",
      a: "We implemented the Screen Wake Lock API combined with silent audio loop keepalives. Your browser (Safari, Chrome, Arc) stays awake throughout the entire lecture or meeting, preventing the operating system from suspending your session.",
    },
    {
      q: "Can I export my notes to Notion or Obsidian?",
      a: "Yes. Every note in Notinn generates clean standard Markdown with headings, bullet points, and checkable task lists. One click copies the markdown directly into Obsidian, Logseq, or Notion.",
    },
  ];

  return (
    <section id="faq" className="py-20 border-t border-[var(--ed-line)] bg-[var(--ed-bg-subtle)]/30">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ed-ink)]">
            Questions?
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            Straightforward answers about how Notinn handles your voice, privacy, and notes.
          </p>
        </div>

        <div className="ed-faq-list">
          {faqs.map((f, i) => (
            <details key={i} className="ed-faq-item group">
              <summary>
                <span>{f.q}</span>
                <ChevronDown className="size-4 text-[var(--ed-text-3)] transition-transform duration-200 group-open:rotate-180 shrink-0 ml-4" />
              </summary>
              <div className="ed-faq-content">
                <p>{f.a}</p>
              </div>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
