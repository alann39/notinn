import { createBrowserRouter } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { LoginPage } from "./login-page";
import { AuthCallbackPage } from "./auth-callback-page";
import { NotesPage } from "./notes-page";
import { NoteDetailPage } from "./note-detail-page";
import { UsagePage } from "./usage-page";
import { SettingsPage } from "./settings-page";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminOverviewPage } from "./admin/admin-overview-page";
import { AdminJobsPage } from "./admin/admin-jobs-page";
import { AdminUsersPage } from "./admin/admin-users-page";
import { AdminInvitesPage } from "./admin/admin-invites-page";
import { AdminApiKeysPage } from "./admin/admin-api-keys-page";

export const router = createBrowserRouter([
  {
    path: "/login",
    element: <LoginPage />,
  },
  {
    path: "/auth/callback",
    element: <AuthCallbackPage />,
  },
  {
    element: <DashboardLayout />,
    children: [
      {
        path: "/",
        element: <NotesPage />,
      },
      {
        path: "/notes",
        element: <NotesPage />,
      },
      {
        path: "/notes/:id",
        element: <NoteDetailPage />,
      },
      {
        path: "/usage",
        element: <UsagePage />,
      },
      {
        path: "/settings",
        element: <SettingsPage />,
      },
    ],
  },
  {
    element: <AdminRouteGuard />,
    children: [
      {
        element: <AdminLayout />,
        children: [
          {
            path: "/admin",
            element: <AdminOverviewPage />,
          },
          {
            path: "/admin/jobs",
            element: <AdminJobsPage />,
          },
          {
            path: "/admin/users",
            element: <AdminUsersPage />,
          },
          {
            path: "/admin/invites",
            element: <AdminInvitesPage />,
          },
          {
            path: "/admin/api-keys",
            element: <AdminApiKeysPage />,
          },
        ],
      },
    ],
  },
]);

