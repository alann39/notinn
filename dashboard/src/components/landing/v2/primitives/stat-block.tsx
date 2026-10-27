import { ArrowUpRight, type LucideIcon } from "lucide-react";

interface StatBlockProps {
  readonly index: string;
  readonly label: string;
  readonly body: string;
  readonly meta: string;
  readonly icon: LucideIcon;
  /** Illustration slot: the card's artwork sits below the foot in the design. */
  readonly children?: React.ReactNode;
}

export function StatBlock({
  index,
  label,
  body,
  meta,
  icon: Icon,
  children,
}: StatBlockProps): React.ReactElement {
  return (
    <article className="v2-stat-block">
      <div className="v2-stat-block__top">
        <div className="v2-stat-block__head">
          <span className="v2-stat-block__num">{index}</span>
          <Icon aria-hidden="true" size={20} className="v2-stat-block__icon" />
        </div>
        <div className="v2-stat-block__text">
          <p className="v2-stat-block__label">{label}</p>
          <p className="v2-stat-block__body">{body}</p>
        </div>
      </div>
      <div className="v2-stat-block__foot">
        <span>{meta}</span>
        <ArrowUpRight aria-hidden="true" size={14} />
      </div>
      {children}
    </article>
  );
}
