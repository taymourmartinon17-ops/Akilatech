import { useAuth } from "@/lib/auth";
import { useLocation } from "wouter";
import { useEffect } from "react";

interface AdminRouteProps {
  children: React.ReactNode;
}

export function AdminRoute({ children }: AdminRouteProps) {
  const { user, isAuthenticated, isAdmin } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/');
      return;
    }
    
    if (!isAdmin) {
      setLocation('/dashboard');
      return;
    }
  }, [isAuthenticated, isAdmin, setLocation]);

  // Show nothing while redirecting
  if (!isAuthenticated || !isAdmin) {
    return null;
  }

  return <>{children}</>;
}