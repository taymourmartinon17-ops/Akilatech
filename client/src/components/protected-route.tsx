import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

type Role = 'super_admin' | 'admin' | 'manager' | 'loan_officer';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles: Role[];
  redirectTo?: string;
}

export function ProtectedRoute({ children, allowedRoles, redirectTo = '/dashboard' }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, isSuperAdmin, isManager, user, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  const hasAccess = (): boolean => {
    if (!isAuthenticated) return false;
    
    // Super admins have access to all routes except loan_officer-only routes
    if (isSuperAdmin && !allowedRoles.every(r => r === 'loan_officer')) {
      return true;
    }
    
    for (const role of allowedRoles) {
      switch (role) {
        case 'super_admin':
          if (isSuperAdmin) return true;
          break;
        case 'admin':
          // Admins and super admins can access admin routes
          if (isAdmin || isSuperAdmin) return true;
          break;
        case 'manager':
          if (isManager) return true;
          break;
        case 'loan_officer':
          // Loan officer only - explicitly exclude admins and super admins
          if (user?.role === 'loan_officer' || (!isAdmin && !isSuperAdmin && !isManager)) return true;
          break;
      }
    }
    return false;
  };

  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated) {
      setLocation('/');
      return;
    }
    
    if (!hasAccess()) {
      setLocation(redirectTo);
      return;
    }
  }, [isAuthenticated, isAdmin, isSuperAdmin, isManager, user, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" data-testid="loading-spinner" />
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !hasAccess()) {
    return null;
  }

  return <>{children}</>;
}
