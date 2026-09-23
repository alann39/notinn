import { useTheme } from "@/hooks/use-theme";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      onClick={toggleTheme}
      className="relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full bg-zinc-200 p-0.5 transition-colors duration-200 ease-in-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700"
    >
      <span
        className={`pointer-events-none flex size-6 items-center justify-center rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out dark:bg-zinc-950 ${
          isDark ? "translate-x-5 text-zinc-200" : "translate-x-0 text-zinc-700"
        }`}
      >
        {isDark ? (
          <Moon className="size-3.5" aria-hidden="true" strokeWidth={2.2} />
        ) : (
          <Sun className="size-3.5 text-amber-600" aria-hidden="true" strokeWidth={2.2} />
        )}
      </span>
    </button>
  );
}
