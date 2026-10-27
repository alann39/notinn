import { Check, Sparkles } from "lucide-react";

interface SheetTask {
  readonly text: string;
  readonly owner: string;
  readonly done: boolean;
}

const SHEET_TASKS: readonly SheetTask[] = [
  {
    text: "Review auth migration scope with engineering",
    owner: "@arun",
    done: true,
  },
  { text: "Move beta launch to the 14th", owner: "@faiz", done: false },
  { text: "Confirm Early Bird cap at 100 users", owner: "@ops", done: false },
];

const SHEET_TAGS: readonly string[] = ["#pricing", "#roadmap", "#auth", "#q3"];

/**
 * Static mock of a generated note. It is presentation only: nothing here is
 * interactive, so the checkboxes and the Ask chip are spans, not controls that
 * would have to work.
 */
export function SpecimenSheet(): React.ReactElement {
  return (
    <article className="v2-sheet" aria-label="Example structured note">
      <div className="v2-sheet__head">
        <span className="v2-sheet__head-left">
          <span className="v2-sheet__dots" aria-hidden="true">
            <span className="v2-sheet__dot v2-sheet__dot--capture" />
            <span className="v2-sheet__dot v2-sheet__dot--warning" />
            <span className="v2-sheet__dot v2-sheet__dot--success" />
          </span>
          <span className="v2-sheet__file">note_2026-10-21.md</span>
        </span>
        <span className="v2-sheet__saved">saved</span>
      </div>
      <div className="v2-sheet__body">
        <p className="v2-sheet__crumb">FROM TELEGRAM · 10:42 · 4 ATTACHMENTS</p>
        <h2 className="v2-sheet__title">Pricing &amp; Roadmap Sync</h2>
        <hr className="v2-sheet__rule" />
        <p className="v2-sheet__section">SUMMARY</p>
        <p className="v2-sheet__summary">
          The team aligned on shipping Q3 in two stages: auth migration first, then the
          Telegram bot beta. Pricing stays at Rp 10.000 for the Early Bird cohort of 100 users,
          reviewed after launch.
        </p>
        <p className="v2-sheet__section v2-sheet__section--spaced">ACTION ITEMS</p>
        <ul className="v2-sheet__tasks">
          {SHEET_TASKS.map((task) => (
            <li key={task.text} className="v2-sheet__task" data-done={task.done}>
              <span className="v2-sheet__box" aria-hidden="true">
                {task.done ? <Check size={9} strokeWidth={3} /> : null}
              </span>
              <span className="v2-sheet__task-text">
                {task.done ? <span className="sr-only">Done: </span> : null}
                {task.text}
              </span>
              <span className="v2-sheet__owner">{task.owner}</span>
            </li>
          ))}
        </ul>
      </div>
      <ul id="tags" className="v2-sheet__tags" aria-label="Tags" tabIndex={-1}>
        {SHEET_TAGS.map((tag) => (
          <li key={tag} className="v2-sheet__tag">
            {tag}
          </li>
        ))}
      </ul>
      <p className="v2-sheet__ask">
        <Sparkles aria-hidden="true" size={12} />
        Ask this note a question
      </p>
    </article>
  );
}
