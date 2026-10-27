/**
 * The design has a bare 1440x120 frame between Before/After → Pricing and
 * Pricing → Closing CTA. Both are `linear-gradient(180deg)` strips in the pen
 * export: the orange surface fades into the panel below. The first one is
 * flipped (`matrix(1, 0, 0, -1, 0, 0)`), which the CSS applies per variant, so
 * one component keeps the two instances identical.
 */
export function SectionTransition({
  to,
}: {
  readonly to: "pricing" | "cta";
}): React.ReactElement {
  return <div className="v2-section-transition" data-to={to} aria-hidden="true" />;
}
