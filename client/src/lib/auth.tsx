import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";

interface User {
  id: string;
  organizationId: string;
  loanOfficerId: string;
  name: string;
  isAdmin: boolean;
  isSuperAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (organizationId: string, loanOfficerId: string, password: string, skipRedirect?: boolean) => Promise<{ success: boolean; needsPasswordSetup?: boolean; setupToken?: string; error?: string }>;
  signup: (organizationId: string, loanOfficerId: string, password: string, name: string) => Promise<boolean>;
  setPassword: (setupToken: string, password: string) => Promise<boolean>;
  logout: () => void;
  changeLoanOfficerId: (newLoanOfficerId: string) => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const login = async (organizationId: string, loanOfficerId: string, password: string, skipRedirect = false): Promise<{ success: boolean; needsPasswordSetup?: boolean; setupToken?: string; error?: string }> => {
    try {
      const isSuperAdmin = organizationId.toUpperCase() === 'AKILA';
      const endpoint = isSuperAdmin ? '/api/auth/super-admin-login' : '/api/auth/login';
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, loanOfficerId, password }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        // Only update auth state if we're not skipping redirect (actual login vs validation)
        if (!skipRedirect) {
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
          // Redirect super admins to super admin panel, others to dashboard
          setLocation(data.user.isSuperAdmin ? '/super-admin' : '/dashboard');
        }
        return { success: true };
      } else if (response.status === 423) {
        // Password setup required
        const data = await response.json();
        return { success: false, needsPasswordSetup: true, setupToken: data.setupToken };
      } else if (response.status === 429) {
        const data = await response.json().catch(() => ({ message: 'Too many attempts' }));
        return { success: false, error: data.message || 'Too many login attempts. Please try again in 15 minutes.' };
      } else if (response.status === 401) {
        return { success: false, error: 'Invalid Loan Officer ID or password. Please check and try again.' };
      } else if (response.status === 400) {
        const data = await response.json().catch(() => ({ message: 'Bad request' }));
        return { success: false, error: data.message || 'Invalid request. Please check your input.' };
      }
      return { success: false, error: 'Login failed. Please try again.' };
    } catch (error) {
      console.error('Login failed:', error);
      return { success: false, error: 'Network error. Please check your connection and try again.' };
    }
  };

  const signup = async (organizationId: string, loanOfficerId: string, password: string, name: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId, loanOfficerId, password, name }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        // Redirect super admins to super admin panel, others to dashboard
        setLocation(data.user.isSuperAdmin ? '/super-admin' : '/dashboard');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Signup failed:', error);
      return false;
    }
  };

  const setPassword = async (setupToken: string, password: string): Promise<boolean> => {
    try {
      const response = await fetch('/api/auth/set-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setupToken, password }),
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
        // Redirect super admins to super admin panel, others to dashboard
        setLocation(data.user.isSuperAdmin ? '/super-admin' : '/dashboard');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Set password failed:', error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout request failed:', error);
    }
    
    setUser(null);
    localStorage.removeItem('user');
    setLocation('/login');
  };

  const changeLoanOfficerId = async (newLoanOfficerId: string) => {
    if (user && user.loanOfficerId !== newLoanOfficerId) {
      console.log(`[DEBUG] Officer changed from ${user.loanOfficerId} to ${newLoanOfficerId}`);
      
      const updatedUser = { ...user, loanOfficerId: newLoanOfficerId };
      setUser(updatedUser);
      localStorage.setItem('user', JSON.stringify(updatedUser));
      
      // Trigger automatic resync for the new officer
      try {
        console.log(`[DEBUG] Auto-resyncing data for new officer: ${newLoanOfficerId}`);
        await fetch('/api/sync/officer-change', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loanOfficerId: newLoanOfficerId }),
        });
      } catch (error) {
        console.warn('Auto-resync failed:', error);
      }
    }
  };

  useEffect(() => {
    // Validate server session on page load
    const validateSession = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
          localStorage.setItem('user', JSON.stringify(data.user));
        } else {
          // Session invalid or expired, clear local storage
          setUser(null);
          localStorage.removeItem('user');
        }
      } catch (error) {
        console.error('Session validation failed:', error);
        // On network error, try to use localStorage as fallback
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
          try {
            setUser(JSON.parse(savedUser));
          } catch {
            localStorage.removeItem('user');
          }
        }
      } finally {
        setIsLoading(false);
      }
    };

    validateSession();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      login,
      signup,
      setPassword,
      logout,
      changeLoanOfficerId,
      isAuthenticated: !!user,
      isAdmin: !!user?.isAdmin,
      isSuperAdmin: !!user?.isSuperAdmin,
      isLoading,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
