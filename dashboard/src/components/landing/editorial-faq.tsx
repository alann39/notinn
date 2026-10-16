import { ChevronDown } from "lucide-react";

export function EditorialFaq() {
  const faqs = [
    {
      q: "Why Telegram instead of a native iOS or Android app?",
      a: "Because you already have Telegram open all day. Building a separate native app adds 5 seconds of friction: find icon, wait for splash screen, tap new note, wait for sync. With Telegram, you just hold the voice button in your chat with @notinnbot while walking or driving, and you're done. Zero capture friction wins every time.",
    },
    {
      q: "What happens if my phone screen locks during a web recording?",
      a: "We implemented the Screen Wake Lock API paired with a silent background audio loop. Your browser (Safari, Chrome, Arc) stays awake throughout the entire lecture or meeting, preventing the mobile OS from sleeping or discarding your audio session.",
    },
    {
      q: "Why Cornell notes instead of a raw speech transcript?",
      a: "Speech-to-text models produce 5,000 words of rambling, filler words, and disjointed sentences that nobody ever re-reads. The Cornell Note Taking System deconstructs the audio into three high-signal layers: Cues & Themes on the left, Synthesized Notes in the center, and Checkable Action Items at the bottom.",
    },
    {
      q: "How does the 45 MB audio upload work on serverless?",
      a: "Most platforms like Vercel have a strict 4.5 MB request body limit. Notinn uses a custom client-side chunking engine: large audio files are sliced into small chunks in the browser and streamed directly to Supabase storage signed URLs, completely bypassing serverless limits.",
    },
    {
      q: "Is my audio and data private?",
      a: "Yes. Your audio files and synthesized notes are tied strictly to your account. We do not sell telemetry, we do not train LLMs on your recordings, and your data is stored encrypted in Supabase with strict Row Level Security (RLS).",
    },
  ];

  return (
    <section id="faq" className="py-20 border-t border-[var(--ed-line)] bg-[var(--ed-bg-subtle)]/30">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-semibold tracking-tight text-[var(--ed-ink)]">
            Questions? Honest answers.
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            Everything you need to know about how Notinn handles your voice, text, and knowledge.
          </p>
        </div>

        <div className="ed-faq-list mt-12">
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
