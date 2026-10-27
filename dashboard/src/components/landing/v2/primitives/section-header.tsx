import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface SectionHeaderProps {
  readonly eyebrow: string;
  /** ReactNode so the design's hard line breaks (`⏎`) stay explicit. */
  readonly title: React.ReactNode;
  readonly intro?: React.ReactNode;
  readonly eyebrowIcon?: LucideIcon;
  readonly eyebrowVariant?: "plain" | "pill";
  readonly size?: "md" | "lg";
  readonly titleId?: string;
  readonly className?: string;
}

export function SectionHeader({
  eyebrow,
  title,
  intro,
  eyebrowIcon: EyebrowIcon,
  eyebrowVariant = "plain",
  size = "md",
  titleId,
  className,
}: SectionHeaderProps): React.ReactElement {
  return (
    <header className={cn("v2-section-header", className)} data-size={size}>
      <div className="v2-section-header__main">
        {eyebrowVariant === "pill" ? (
          <p className="v2-section-header__pill">
            {EyebrowIcon ? <EyebrowIcon aria-hidden="true" size={12} /> : null}
            <span>{eyebrow}</span>
          </p>
        ) : (
          <p className="v2-section-header__eyebrow">{eyebrow}</p>
        )}
        <h2 id={titleId} className="v2-section-header__title">
          {title}
        </h2>
      </div>
      {intro ? <p className="v2-section-header__intro">{intro}</p> : null}
    </header>
  );
}
