import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  FileText,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Settings,
  Shield,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAdmin } from "@/hooks/use-admin";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipPopup,
} from "@/components/ui/tooltip";
import { NotinnLogo } from "@/components/brand/notinn-logo";
import { cn } from "@/lib/utils";

interface NavigationItem {
  readonly name: string;
  readonly href: string;
  readonly icon: typeof FileText;
}

const navigation: readonly NavigationItem[] = [
  { name: "Notes", href: "/notes", icon: FileText },
  { name: "Usage & Quota", href: "/usage", icon: BarChart3 },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const { signOut } = useAuth();
  const { isAdmin } = useAdmin();
  const { isCollapsed, collapse, expand } = useSidebar();
  const [isHovered, setIsHovered] = useState(false);

  // If collapsed but hovered, display in preview flyout overlay mode
  const isExpanded = !isCollapsed || isHovered;

  const handleNavClick = () => {
    if (isCollapsed) {
      expand();
      setIsHovered(false);
    }
  };

  return (
    <TooltipProvider>
      <aside
        id="sidebar-navigation"
        aria-label="Main navigation"
        onMouseEnter={() => {
          if (isCollapsed) setIsHovered(true);
        }}
        onMouseLeave={() => setIsHovered(false)}
        className={cn(
          "hidden lg:flex fixed inset-y-0 left-0 flex-col bg-card border-r border-border transition-all duration-200 ease-in-out",
          isExpanded ? "w-64" : "w-16",
          isCollapsed && isHovered ? "z-40 shadow-2xl" : "z-30",
        )}
      >
        {/* Brand Header & Toggle */}
        <div
          className={cn(
            "flex h-16 items-center border-b border-border transition-colors",
            isExpanded ? "justify-between px-4" : "justify-center px-2",
          )}
        >
          {isExpanded ? (
            <>
              <div
                onClick={() => {
                  if (isCollapsed) {
                    expand();
                    setIsHovered(false);
                  }
                }}
                className={cn(
                  "flex items-center gap-3 min-w-0 select-none",
                  isCollapsed && "cursor-pointer group",
                )}
                role={isCollapsed ? "button" : undefined}
                tabIndex={isCollapsed ? 0 : undefined}
                aria-label={isCollapsed ? "Pin sidebar open" : undefined}
              >
                <NotinnLogo size="md" className="group-hover:opacity-90 transition-opacity" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-semibold tracking-tight text-foreground font-sans truncate">
                    Notinn
                  </span>
                  <span className="text-[11px] text-muted-foreground font-normal truncate">
                    Capture & Notes
                  </span>
                </div>
              </div>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      onClick={() => {
                        if (isCollapsed) {
                          expand();
                          setIsHovered(false);
                        } else {
                          collapse();
                          setIsHovered(false);
                        }
                      }}
                      aria-label={isCollapsed ? "Pin sidebar open" : "Collapse sidebar"}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
                    >
                      {isCollapsed ? (
                        <PanelLeft className="size-4" />
                      ) : (
                        <PanelLeftClose className="size-4" />
                      )}
                    </button>
                  }
                />
                <TooltipPopup side="right" sideOffset={8}>
                  {isCollapsed ? "Pin sidebar open" : "Collapse sidebar"}
                </TooltipPopup>
              </Tooltip>
            </>
          ) : (
            /* When collapsed and not hovered: show ONLY the centered logo with zero collision */
            <button
              type="button"
              onClick={() => {
                expand();
                setIsHovered(false);
              }}
              aria-label="Expand sidebar"
              className="flex shrink-0 items-center justify-center hover:opacity-90 transition-opacity cursor-pointer"
            >
              <NotinnLogo size="md" />
            </button>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-2.5 py-4 overflow-y-auto">
          <ul className="space-y-1.5" role="list">
            {navigation.map((item) => {
              const navLink = (
                <NavLink
                  to={item.href}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    cn(
                      "group flex items-center rounded-lg transition-colors select-none",
                      isExpanded
                        ? "gap-3 px-3 py-2 text-xs sm:text-sm font-medium"
                        : "justify-center size-10 mx-auto",
                      isActive
                        ? "bg-muted text-foreground font-semibold shadow-2xs"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      <item.icon
                        className={cn(
                          "size-4 shrink-0 transition-colors",
                          isActive
                            ? "text-foreground"
                            : "text-muted-foreground group-hover:text-foreground",
                        )}
                        strokeWidth={isActive ? 2.2 : 2}
                      />
                      {isExpanded && (
                        <span className="flex-1 tracking-tight truncate">
                          {item.name}
                        </span>
                      )}
                    </>
                  )}
                </NavLink>
              );

              return <li key={item.name}>{navLink}</li>;
            })}

            {isAdmin && (
              <li>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <NavLink
                        to="/admin"
                        onClick={handleNavClick}
                        className={({ isActive }) =>
                          cn(
                            "group flex items-center rounded-lg transition-colors select-none text-blue-500 hover:bg-blue-500/10",
                            isExpanded
                              ? "gap-3 px-3 py-2 text-xs sm:text-sm font-medium"
                              : "justify-center size-10 mx-auto",
                            isActive && "bg-blue-500/15 font-semibold",
                          )
                        }
                      >
                        <Shield className="size-4 shrink-0 text-blue-500" strokeWidth={2} />
                        {isExpanded && (
                          <span className="flex-1 tracking-tight truncate">
                            Admin Console
                          </span>
                        )}
                      </NavLink>
                    }
                  />
                  {!isExpanded && (
                    <TooltipPopup side="right" sideOffset={12}>
                      Admin Console
                    </TooltipPopup>
                  )}
                </Tooltip>
              </li>
            )}
          </ul>
        </nav>

        {/* Sign Out footer */}
        <div className="border-t border-border p-2.5">
          {isExpanded ? (
            <button
              type="button"
              onClick={signOut}
              className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <LogOut className="size-4" strokeWidth={2} />
              <span className="tracking-tight">Sign out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={signOut}
              aria-label="Sign out"
              className="flex size-10 mx-auto items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
            >
              <LogOut className="size-4" strokeWidth={2} />
            </button>
          )}
        </div>
      </aside>
    </TooltipProvider>
  );
}
