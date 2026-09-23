import { useAuth } from "@/hooks/use-auth";
import { useSearch } from "@/hooks/use-search";
import { useAdmin } from "@/hooks/use-admin";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { Button } from "@/components/ui/button";
import { Link, useNavigate } from "react-router-dom";
import {
  ChevronDown,
  ExternalLink,
  LogOut,
  Search,
  Send,
  Shield,
  User as UserIcon,
} from "lucide-react";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@/components/ui/menu";
import { Badge } from "@/components/ui/badge";
import { SearchCommandDialog } from "@/components/search-command-dialog";

interface HeaderProps {
  readonly title: string;
  readonly description?: string;
  readonly actions?: React.ReactNode;
}

export function Header({ title, description, actions }: HeaderProps) {
  const { user, profile, signOut } = useAuth();
  const { open: searchOpen, setOpen: setSearchOpen } = useSearch();
  const { isAdmin } = useAdmin();
  const navigate = useNavigate();

  const userDisplayName = profile?.display_name || "Account";

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/40 bg-gradient-to-b from-background/95 via-background/80 to-background/40 backdrop-blur-md px-4 sm:px-6 md:px-8 transition-colors">
        <div className="flex flex-col justify-center min-w-0 pr-4">
          <h1 className="text-lg sm:text-xl font-bold tracking-tight text-foreground truncate">
            {title}
          </h1>
          {description && (
            <p className="text-xs text-muted-foreground hidden sm:block truncate">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          {/* Quick Search Palette Trigger (Desktop only, mobile has it in bottom nav) */}
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="hidden sm:inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-muted/40 hover:bg-muted text-xs text-muted-foreground hover:text-foreground transition-all cursor-pointer"
            title="Search notes (Ctrl+F)"
          >
            <Search className="size-3.5" />
            <span>Search…</span>
            <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border text-[10px] font-mono text-muted-foreground">
              Ctrl+F
            </kbd>
          </button>

          {actions && <div className="flex items-center gap-2">{actions}</div>}

          {/* Admin Quick Switcher Button */}
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              render={
                <Link to="/admin" className="gap-1.5 text-xs font-medium">
                  <Shield className="size-3.5 text-blue-500" />
                  <span className="hidden sm:inline">Admin</span>
                </Link>
              }
            />
          )}

          <ThemeToggle />

          {/* User Profile Dropdown Menu (works on both mobile and desktop) */}
          {user && (
            <Menu>
              <MenuTrigger
                render={
                  <button
                    type="button"
                    aria-label="User account menu"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/85 hover:bg-muted/70 px-2.5 py-1 text-xs text-foreground backdrop-blur-sm transition-all shadow-2xs cursor-pointer select-none"
                  >
                    <UserIcon className="size-3.5 text-muted-foreground" strokeWidth={2} />
                    <span className="max-w-[85px] truncate sm:max-w-[140px] font-medium">
                      {userDisplayName}
                    </span>
                    <ChevronDown className="size-3 text-muted-foreground opacity-70" />
                  </button>
                }
              />
              <MenuPopup align="end" className="w-56">
                <div className="px-3 py-2 flex items-center justify-between border-b border-border/50 bg-muted/20">
                  <div className="flex flex-col min-w-0 pr-2">
                    <span className="font-semibold text-xs text-foreground truncate">
                      {userDisplayName}
                    </span>
                    <span className="text-[10px] text-muted-foreground">Connected Account</span>
                  </div>
                  {profile?.plan_key && (
                    <Badge variant="default" className="text-[10px] uppercase font-semibold">
                      {profile.plan_key}
                    </Badge>
                  )}
                </div>

                {isAdmin && (
                  <MenuItem
                    onClick={() => navigate("/admin")}
                    className="cursor-pointer gap-2.5 text-xs py-2 mt-1"
                  >
                    <Shield className="size-3.5 text-blue-500" />
                    <span className="flex-1 font-medium">Admin Dashboard</span>
                  </MenuItem>
                )}

                <MenuItem
                  onClick={() => window.open("https://t.me/NotinnBot", "_blank")}
                  className="cursor-pointer gap-2.5 text-xs py-2 mt-1"
                >
                  <Send className="size-3.5 text-muted-foreground" />
                  <span className="flex-1 font-medium">Open in Telegram</span>
                  <ExternalLink className="size-3 text-muted-foreground/60" />
                </MenuItem>

                <MenuSeparator />

                <MenuItem
                  onClick={signOut}
                  className="cursor-pointer gap-2.5 text-xs py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                >
                  <LogOut className="size-3.5 text-destructive" />
                  <span className="font-medium">Sign out</span>
                </MenuItem>
              </MenuPopup>
            </Menu>
          )}
        </div>
      </header>

      <SearchCommandDialog open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
