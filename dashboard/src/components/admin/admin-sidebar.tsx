import { NavLink, Link } from "react-router-dom";
import {
  Activity,
  Layers,
  Users,
  Ticket,
  Key,
  ArrowLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NotinnLogo } from "@/components/brand/notinn-logo";

const adminNavItems = [
  { name: "System Health", href: "/admin", icon: Activity, exact: true },
  { name: "Job Queue", href: "/admin/jobs", icon: Layers },
  { name: "User Directory", href: "/admin/users", icon: Users },
  { name: "Alpha Invites", href: "/admin/invites", icon: Ticket },
  { name: "API Keys", href: "/admin/api-keys", icon: Key },
];

export function AdminSidebar() {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col bg-card border-r border-border w-64">
      {/* Header Branding */}
      <div className="flex h-16 items-center gap-2.5 px-6 border-b border-border">
        <NotinnLogo size="sm" />
        <div className="flex flex-col">
          <span className="text-sm font-semibold tracking-tight text-foreground">
            Notinn Ops
          </span>
          <span className="text-[10px] text-muted-foreground font-mono">
            Admin Console
          </span>
        </div>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 space-y-1.5 p-3" aria-label="Admin Navigation">
        {adminNavItems.map((item) => (
          <NavLink
            key={item.name}
            to={item.href}
            end={item.exact}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-medium transition-colors select-none",
                isActive
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )
            }
          >
            <item.icon className="size-4 shrink-0" />
            <span>{item.name}</span>
          </NavLink>
        ))}
      </nav>

      {/* Return to User Notes Dashboard */}
      <div className="border-t border-border p-3">
        <Link
          to="/notes"
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4 shrink-0" />
          <div className="flex flex-col text-left">
            <span>Back to Notes</span>
            <span className="text-[10px] text-muted-foreground/80">User Dashboard</span>
          </div>
        </Link>
      </div>
    </aside>
  );
}
