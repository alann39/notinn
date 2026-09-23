import { NavLink, Link } from "react-router-dom";
import { Activity, Layers, Users, Ticket, Key, ArrowLeft } from "lucide-react";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface AdminNavItem {
  readonly name: string;
  readonly href: string;
  readonly icon: typeof Activity;
  readonly exact?: boolean;
}

const navTabs: readonly AdminNavItem[] = [
  { name: "System Health", href: "/admin", icon: Activity, exact: true },
  { name: "Job Queue", href: "/admin/jobs", icon: Layers },
  { name: "User Directory", href: "/admin/users", icon: Users },
  { name: "Alpha Invites", href: "/admin/invites", icon: Ticket },
  { name: "API Keys", href: "/admin/api-keys", icon: Key },
];

export function AdminBottomNav() {
  return (
    <TooltipProvider>
      <nav
        aria-label="Mobile admin navigation"
        className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 lg:hidden flex items-center gap-1 p-1.5 rounded-full border border-border/80 bg-card/90 backdrop-blur-xl shadow-xl ring-1 ring-border/20 transition-all duration-200"
      >
        {navTabs.map((tab) => (
          <Tooltip key={tab.name}>
            <TooltipTrigger
              render={
                <NavLink
                  to={tab.href}
                  end={tab.exact}
                  aria-label={tab.name}
                  className={({ isActive }) =>
                    cn(
                      "flex size-11 items-center justify-center rounded-full transition-all duration-150 cursor-pointer select-none",
                      isActive
                        ? "bg-muted text-foreground shadow-xs font-semibold"
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

        {/* Back to User Notes Dashboard Button */}
        <Tooltip>
          <TooltipTrigger
            render={
              <Link
                to="/notes"
                aria-label="Back to Notes Dashboard"
                className="flex size-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all duration-150 cursor-pointer select-none"
              >
                <ArrowLeft className="size-4.5 stroke-[1.8]" />
              </Link>
            }
          />
          <TooltipPopup side="top" sideOffset={10}>
            Back to Notes
          </TooltipPopup>
        </Tooltip>
      </nav>
    </TooltipProvider>
  );
}
