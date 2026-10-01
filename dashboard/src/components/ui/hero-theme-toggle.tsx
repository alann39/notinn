import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

export interface HeroThemeToggleProps {
  readonly checked: boolean;
  readonly onToggle: () => void;
  readonly className?: string;
}

/**
 * Hero-scoped theme switch. Controlled: the hero owns the theme, so this
 * carries no internal state and never touches the dashboard theme.
 */
export function HeroThemeToggle({ checked, onToggle, className }: HeroThemeToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Switch hero background"
      onClick={onToggle}
      className={cn(
        "hero-theme-toggle flex w-16 h-8 p-1 rounded-full cursor-pointer transition-all duration-300 items-center justify-between overflow-hidden",
        checked ? "bg-zinc-950 border border-zinc-800" : "bg-white border border-zinc-200",
        className,
      )}
    >
      <span
        className={cn(
          "flex justify-center items-center w-6 h-6 shrink-0 rounded-full transition-transform duration-300",
          checked ? "transform translate-x-0 bg-zinc-800" : "transform translate-x-8 bg-gray-200",
        )}
      >
        {checked
          ? <Moon className="w-4 h-4 text-white" strokeWidth={1.5} aria-hidden="true" />
          : <Sun className="w-4 h-4 text-gray-700" strokeWidth={1.5} aria-hidden="true" />}
      </span>
      <span
        className={cn(
          "flex justify-center items-center w-6 h-6 shrink-0 rounded-full transition-transform duration-300",
          checked ? "bg-transparent" : "transform -translate-x-8",
        )}
      >
        {checked
          ? <Sun className="w-4 h-4 text-gray-500" strokeWidth={1.5} aria-hidden="true" />
          : <Moon className="w-4 h-4 text-black" strokeWidth={1.5} aria-hidden="true" />}
      </span>
    </button>
  );
}
