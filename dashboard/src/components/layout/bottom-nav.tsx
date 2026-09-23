import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, FileText, Search, Settings } from "lucide-react";
import { useSearch } from "@/hooks/use-search";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TabItem {
  readonly name: string;
  readonly href: string;
  readonly icon: typeof FileText;
}

const tabs: readonly TabItem[] = [
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "Usage", href: "/usage", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function BottomNav() {
  const location = useLocation();
  const { setOpen: setSearchOpen } = useSearch();

  // Hide bottom navigation on Note Detail page (/notes/:id) as requested
  const isNoteDetail =
    location.pathname.startsWith("/notes/") && location.pathname !== "/notes";
  if (isNoteDetail) {
    return null;
  }

  return (
    <TooltipProvider>
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 lg:hidden flex items-center gap-1 p-1.5 rounded-full border border-border/80 bg-card/90 backdrop-blur-xl shadow-xl ring-1 ring-border/20 transition-all duration-200"
      >
        {tabs.map((tab) => (
          <Tooltip key={tab.name}>
            <TooltipTrigger
              render={
                <NavLink
                  to={tab.href}
                  aria-label={tab.name}
                  className={({ isActive }) =>
                    cn(
                      "flex size-11 items-center justify-center rounded-full transition-all duration-150 cursor-pointer select-none",
                      isActive
                        ? "bg-muted text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                    )
                  }
                >
                  <tab.icon className="size-4.5 stroke-[1.8]" />
                </NavLink>
              }
            />
            <TooltipPopup side="top" sideOffset={10}>
              {tab.name}
            </TooltipPopup>
          </Tooltip>
        ))}

        {/* Vertical divider */}
        <div className="w-px h-5 bg-border mx-0.5 shrink-0" aria-hidden="true" />

        {/* Search trigger icon button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search notes"
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 cursor-pointer select-none"
              >
                <Search className="size-4.5 stroke-[1.8]" />
              </button>
            }
          />
          <TooltipPopup side="top" sideOffset={10}>
            Search (Ctrl+F)
          </TooltipPopup>
        </Tooltip>
      </nav>
    </TooltipProvider>
  );
}
