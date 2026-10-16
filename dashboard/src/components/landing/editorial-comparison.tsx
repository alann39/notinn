export function EditorialComparison() {
  const rows = [
    {
      feature: "Invades calls with a visible bot",
      notinn: "Never (100% private capture)",
      native: "No",
      bots: "Yes (disrupts meetings)",
    },
    {
      feature: "Structured Cornell Notes format",
      notinn: "Automatic (Cues, Notes, Summary)",
      native: "None (just raw audio)",
      bots: "Rare (wall of raw text)",
    },
    {
      feature: "Zero App Install (works in Telegram)",
      notinn: "Yes (Telegram bot + Web)",
      native: "Preinstalled only",
      bots: "No (requires new app)",
    },
    {
      feature: "Voice & Photo multimodal context",
      notinn: "Yes (slide photos + audio notes)",
      native: "No (audio only)",
      bots: "Rare",
    },
    {
      feature: "Audio privacy & retention",
      notinn: "Deleted immediately after synthesis",
      native: "Stored indefinitely on device",
      bots: "Stored on third-party servers",
    },
    {
      feature: "Action item extraction with deadlines",
      notinn: "Yes (clickable task matrix)",
      native: "No",
      bots: "Varies",
    },
    {
      feature: "Audio limit per note",
      notinn: "45 MB (up to 2 hours)",
      native: "Device storage",
      bots: "15 to 30 min on free tier",
    },
  ];

  return (
    <section id="comparison" className="py-20 border-t border-[var(--ed-line)]">
      <div className="ed-shell">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[var(--ed-ink)]">
            Where it sits
          </h2>
          <p className="text-base text-[var(--ed-text-2)] mt-3">
            An honest comparison. Notinn is built for individual thinking and quick forwarding, not corporate surveillance.
          </p>
        </div>

        <div className="ed-cmp">
          <div className="ed-cmp__scroll">
            <table>
              <thead>
                <tr>
                  <th className="w-2/5">Capability</th>
                  <th className="w-1/5 ed-col-notinn">Notinn</th>
                  <th className="w-1/5">Built-in Voice Memos</th>
                  <th className="w-1/5">Meeting Bots (Otter/Fireflies)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td className="font-medium text-[var(--ed-ink)]">{r.feature}</td>
                    <td className="ed-col-notinn font-semibold text-blue-700 dark:text-blue-400">
                      {r.notinn}
                    </td>
                    <td className="text-[var(--ed-text-3)]">{r.native}</td>
                    <td className="text-[var(--ed-text-3)]">{r.bots}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
