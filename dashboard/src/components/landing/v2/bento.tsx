import {
  FileText,
  FileType,
  Image as ImageIcon,
  LayoutGrid,
  Mic,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { FileRow } from "./primitives/file-row";
import { SectionHeader } from "./primitives/section-header";

interface FormatChip {
  readonly label: string;
  readonly icon: LucideIcon;
}

const FORMATS: readonly FormatChip[] = [
  { label: "Voice", icon: Mic },
  { label: "PDF", icon: FileText },
  { label: "Image", icon: ImageIcon },
  { label: "DOCX", icon: FileType },
];

/** Bar heights in px, lifted from the design's 35 `w` rectangles. */
const VOICE_WAVE: readonly number[] = [
  10, 22, 38, 52, 30, 44, 20, 34, 48, 26, 14, 36, 50, 28, 18, 40, 24, 12, 32, 44, 20, 28, 38, 16,
  26, 34, 10, 20, 30, 14, 22, 36, 18, 12, 26,
];

function DashboardTile(): React.ReactElement {
  return (
    <article className="v2-tile v2-tile--dashboard">
      <div className="v2-dash">
        <img
          className="v2-dash__shot"
          src="/landing/v2/dashboard.png"
          alt=""
          aria-hidden="true"
          width={812}
          height={457}
        />
      </div>
      <div className="v2-dash__caption">
        <span>
          <LayoutGrid aria-hidden="true" size={14} />
          Notes library · grid view
        </span>
        <span>Showing 3 notes</span>
      </div>
    </article>
  );
}

function SearchTile(): React.ReactElement {
  return (
    <article className="v2-tile v2-tile--search">
      <div className="v2-tile__top">
        <p className="v2-tile__label">SEARCH</p>
        <p className="v2-search-field">
          <Search aria-hidden="true" size={13} />
          <span>pricing decisions</span>
        </p>
      </div>
      <div className="v2-tile__bottom">
        <p className="v2-tile__title">Full-text &amp; semantic search</p>
        <p className="v2-tile__body">
          Ask in plain language. Results come back with citations pointing to the exact note.
        </p>
        <ul className="v2-citations" aria-label="Citations">
          <li>note 1</li>
          <li>note 2</li>
        </ul>
        <p className="v2-tile__hint">Try: “roadmap”, “pricing”, or a phrase you remember.</p>
      </div>
    </article>
  );
}

function AskTile(): React.ReactElement {
  return (
    <article className="v2-tile v2-tile--ask">
      <div className="v2-tile__top">
        <p className="v2-tile__label">ASK</p>
        <p className="v2-bubble">
          <Sparkles aria-hidden="true" size={13} />
          <span>What did we decide about Early Bird pricing?</span>
        </p>
        <p className="v2-answer">Pro starts at Rp 10.000 for the first 100 users.</p>
      </div>
      <div className="v2-tile__bottom">
        <p className="v2-tile__title v2-tile__title--foot">300 Ask queries / month</p>
      </div>
    </article>
  );
}

function FormatsTile(): React.ReactElement {
  return (
    <article className="v2-tile v2-tile--dark">
      <div className="v2-tile__top">
        <p className="v2-tile__label">INPUTS ACCEPTED</p>
        <ul className="v2-chips" aria-label="Inputs accepted">
          {FORMATS.map(({ label, icon: Icon }) => (
            <li key={label} className="v2-chip">
              <Icon aria-hidden="true" size={15} />
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="v2-tile__bottom">
        <p className="v2-tile__title">Every format, one result</p>
        <p className="v2-tile__body">
          Voice up to 30 minutes, PDFs, screenshots, DOCX — send anything, get back a clean
          structured note.
        </p>
      </div>
    </article>
  );
}

function VoiceTile(): React.ReactElement {
  return (
    <article className="v2-tile v2-tile--dark v2-tile--voice">
      <div className="v2-tile__top">
        <p className="v2-tile__label">VOICE · UP TO 30 MIN</p>
        <div className="v2-wave" aria-hidden="true">
          {VOICE_WAVE.map((height, index) => (
            <span key={index} style={{ height: `${height}px` }} />
          ))}
        </div>
        <p className="v2-wave__time">0:42 / 2:00</p>
      </div>
      <div className="v2-tile__bottom">
        <p className="v2-tile__title">Speak it. It&apos;s written.</p>
        <p className="v2-tile__body">
          No typing required. Record a memo on a walk and it comes back transcribed, titled, and
          tagged.
        </p>
      </div>
    </article>
  );
}

function ExportTile(): React.ReactElement {
  return (
    <article className="v2-tile v2-tile--dark">
      <div className="v2-tile__top">
        <p className="v2-tile__label">EXPORT &amp; TEMPLATE</p>
        <div className="v2-file-list">
          <FileRow name="Brief" extension="PDF" />
          <FileRow name="Roadmap" extension="MD" />
          <FileRow name="Sync" extension="DOCX" />
        </div>
      </div>
      <div className="v2-tile__bottom">
        <p className="v2-tile__title">Notes that keep working</p>
        <p className="v2-tile__body">
          Export to PDF and Markdown, or reformat with a template. Not an archive — a working
          knowledge base.
        </p>
      </div>
    </article>
  );
}

export function Bento(): React.ReactElement {
  return (
    <section id="dashboard" className="v2-bento" aria-labelledby="bento-title" tabIndex={-1}>
      <div className="v2-bento__inner">
        <SectionHeader
          className="v2-bento__header"
          eyebrow="02 — THE WEB DASHBOARD"
          titleId="bento-title"
          title={
            <>
              Capture in the chat.
              <br />
              Think on the canvas.
            </>
          }
          intro="Send voice memos, screenshots, links, and documents to @NotinnBot while you're on the move. When you're back at your desk, open the dashboard to search your library, read structured summaries, and export."
        />

        <div className="v2-bento__grid">
          <div
            className="v2-bento__row v2-bento__row--a"
            role="region"
            aria-label="Dashboard tiles, geser horizontal"
            tabIndex={0}
          >
            <DashboardTile />
            <div className="v2-bento__side">
              <SearchTile />
              <AskTile />
            </div>
          </div>
          <div
            className="v2-bento__row v2-bento__row--b"
            role="region"
            aria-label="Format tiles, geser horizontal"
            tabIndex={0}
          >
            <FormatsTile />
            <VoiceTile />
            <ExportTile />
          </div>
          <p className="v2-bento__hint" aria-hidden="true">
            Geser untuk lihat lainnya →
          </p>
        </div>
      </div>
    </section>
  );
}
