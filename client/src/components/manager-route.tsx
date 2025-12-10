import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

interface ManagerRouteProps {
  children: React.ReactNode;
}

export function ManagerRoute({ children }: ManagerRouteProps) {
  const { isAuthenticated, isManager, isLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isLoading) return;
    
    if (!isAuthenticated) {
      setLocation('/');
      return;
    }
    
    if (!isManager) {
      setLocation('/dashboard');
      return;
    }
  }, [isAuthenticated, isManager, isLoading, setLocation]);

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

  if (!isAuthenticated || !isManager) {
    return null;
  }

  return <>{children}</>;
}
