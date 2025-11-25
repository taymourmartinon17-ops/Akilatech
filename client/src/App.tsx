import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import DataSyncPage from "@/pages/data-sync";
import SettingsPage from "@/pages/settings";
import ClientList from "@/pages/ClientList";
import CalendarPage from "@/pages/calendar";
import Incentives from "@/pages/Incentives";
import AdminGamification from "@/pages/AdminGamification";
import SuperAdminDashboard from "@/pages/super-admin-dashboard";
import OrganizationDetail from "@/pages/organization-detail";
import { AuthProvider } from "@/lib/auth";
import { AdminRoute } from "@/components/admin-route";
import { SuperAdminRoute } from "@/components/super-admin-route";
import { I18nProvider } from "@/lib/i18n-provider";
import { CelebrationManager } from "@/components/celebration-manager";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Login} />
      <Route path="/super-admin/organization/:orgId">
        <SuperAdminRoute>
          <OrganizationDetail />
        </SuperAdminRoute>
      </Route>
      <Route path="/super-admin">
        <SuperAdminRoute>
          <SuperAdminDashboard />
        </SuperAdminRoute>
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/officer/:loanOfficerId" component={Dashboard} />
      <Route path="/data-sync">
        <AdminRoute>
          <DataSyncPage />
        </AdminRoute>
      </Route>
      <Route path="/clients" component={ClientList} />
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/incentives" component={Incentives} />
      <Route path="/admin/gamification">
        <AdminRoute>
          <AdminGamification />
        </AdminRoute>
      </Route>
      <Route path="/settings">
        <AdminRoute>
          <SettingsPage />
        </AdminRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <TooltipProvider>
          <AuthProvider>
            <Toaster />
            <CelebrationManager />
            <Router />
          </AuthProvider>
        </TooltipProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}

export default App;
