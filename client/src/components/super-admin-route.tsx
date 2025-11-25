import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect, type ReactNode } from "react";

interface SuperAdminRouteProps {
  children: ReactNode;
}

export function SuperAdminRoute({ children }: SuperAdminRouteProps) {
  const { isAuthenticated, isSuperAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/');
      return;
    }
    
    if (!isSuperAdmin) {
      setLocation('/dashboard');
      return;
    }
  }, [isAuthenticated, isSuperAdmin, setLocation]);

  // Show nothing while redirecting
  if (!isAuthenticated || !isSuperAdmin) {
    return null;
  }

  return <>{children}</>;
}
