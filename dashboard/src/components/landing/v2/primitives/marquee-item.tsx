interface MarqueeItemProps {
  readonly children: React.ReactNode;
  /** Alternates 500/300 in the design, which is what keeps the loop from reading as a heading. */
  readonly weight?: "medium" | "regular";
}

export function MarqueeItem({
  children,
  weight = "medium",
}: MarqueeItemProps): React.ReactElement {
  return (
    <span className="v2-marquee-item" data-weight={weight}>
      <span>{children}</span>
      <span className="v2-marquee-item__dot" aria-hidden="true" />
    </span>
  );
}
