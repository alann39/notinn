import { createBrowserRouter } from "react-router-dom";
import { AdminLayout } from "@/components/admin/admin-layout";
import { AdminRouteGuard } from "@/components/admin/admin-route-guard";
import { DashboardAppLayout } from "@/components/layout/dashboard-app-layout";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AdminApiKeysPage } from "./admin/admin-api-keys-page";
import { AdminInvitesPage } from "./admin/admin-invites-page";
import { AdminJobsPage } from "./admin/admin-jobs-page";
import { AdminOverviewPage } from "./admin/admin-overview-page";
import { AdminTransactionsPage } from "./admin/admin-transactions-page";
import { AdminUsersPage } from "./admin/admin-users-page";
import { AuthCallbackPage } from "./auth-callback-page";
import { LandingPage } from "./landing-page";
import { PrivacyPage, TermsPage } from "./legal-page";
import { LoginPage } from "./login-page";
import { NoteDetailPage } from "./note-detail-page";
import { NotesPage } from "./notes-page";
import { SettingsPage } from "./settings-page";
import { UsagePage } from "./usage-page";

export const router = createBrowserRouter([
  { path: "/", element: <LandingPage /> },
  { path: "/privacy", element: <PrivacyPage /> },
  { path: "/terms", element: <TermsPage /> },
  {
    element: <DashboardAppLayout />,
    children: [
      { path: "/login", element: <LoginPage /> },
      { path: "/auth/callback", element: <AuthCallbackPage /> },
      {
        element: <DashboardLayout />,
        children: [
          { path: "/notes", element: <NotesPage /> },
          { path: "/notes/:id", element: <NoteDetailPage /> },
          { path: "/usage", element: <UsagePage /> },
          { path: "/settings", element: <SettingsPage /> },
        ],
      },
      {
        element: <AdminRouteGuard />,
        children: [
          {
            element: <AdminLayout />,
            children: [
              { path: "/admin", element: <AdminOverviewPage /> },
              { path: "/admin/jobs", element: <AdminJobsPage /> },
              { path: "/admin/users", element: <AdminUsersPage /> },
              { path: "/admin/invites", element: <AdminInvitesPage /> },
              { path: "/admin/api-keys", element: <AdminApiKeysPage /> },
              { path: "/admin/transactions", element: <AdminTransactionsPage /> },
            ],
          },
        ],
      },
    ],
  },
]);

