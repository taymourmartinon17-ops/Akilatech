import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

interface SuperAdminRouteProps {
  children: ReactNode;
}

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { isAuthenticated, isSuperAdmin, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated) {
      setLocation('/');
      return;
    }
    
    if (!isSuperAdmin) {
      setLocation('/dashboard');
      return;
    }
  }, [isAuthenticated, isSuperAdmin, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-slate-600 dark:text-slate-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
}
