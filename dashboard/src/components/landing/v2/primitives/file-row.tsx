import { FileText, type LucideIcon } from "lucide-react";

interface FileRowProps {
  readonly name: string;
  readonly extension: string;
  readonly icon?: LucideIcon;
}

/**
 * `icon / fname / ext` from the design's Export tile: a 10px-padded column card,
 * three of them side by side. Rendered on the dark tile, so it inherits colour.
 */
export function FileRow({
  name,
  extension,
  icon: Icon = FileText,
}: FileRowProps): React.ReactElement {
  return (
    <span className="v2-file-row">
      <Icon aria-hidden="true" size={14} />
      <span className="v2-file-row__name">{name}</span>
      <span className="v2-file-row__ext">{extension}</span>
    </span>
  );
}
