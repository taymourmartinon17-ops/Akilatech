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
import ManagerDashboard from "@/pages/manager-dashboard";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/protected-route";
import { I18nProvider } from "@/lib/i18n-provider";
import { CelebrationManager } from "@/components/celebration-manager";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/" component={Login} />
      <Route path="/super-admin/organization/:orgId">
        <ProtectedRoute allowedRoles={['super_admin']}>
          <OrganizationDetail />
        </ProtectedRoute>
      </Route>
      <Route path="/super-admin">
        <ProtectedRoute allowedRoles={['super_admin']}>
          <SuperAdminDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/dashboard/officer/:loanOfficerId" component={Dashboard} />
      <Route path="/data-sync">
        <ProtectedRoute allowedRoles={['admin']}>
          <DataSyncPage />
        </ProtectedRoute>
      </Route>
      <Route path="/clients">
        <ProtectedRoute allowedRoles={['loan_officer']}>
          <ClientList />
        </ProtectedRoute>
      </Route>
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/manager">
        <ProtectedRoute allowedRoles={['manager']}>
          <ManagerDashboard />
        </ProtectedRoute>
      </Route>
      <Route path="/incentives" component={Incentives} />
      <Route path="/admin/gamification">
        <ProtectedRoute allowedRoles={['admin']}>
          <AdminGamification />
        </ProtectedRoute>
      </Route>
      <Route path="/settings">
        <ProtectedRoute allowedRoles={['admin']}>
          <SettingsPage />
        </ProtectedRoute>
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
