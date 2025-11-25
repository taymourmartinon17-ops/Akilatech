import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { apiRequest } from '@/lib/queryClient';

interface PageTrackingOptions {
  pageName: string;
  pageRoute: string;
}

export function usePageTracking({ pageName, pageRoute }: PageTrackingOptions) {
  const { user, isAuthenticated } = useAuth();
  const startTimeRef = useRef<number>(Date.now());
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    if (!isAuthenticated || !user || user.isSuperAdmin) {
      return;
    }

    startTimeRef.current = Date.now();
    hasTrackedRef.current = false;

    const trackPageView = async () => {
      if (hasTrackedRef.current) return;
      hasTrackedRef.current = true;

      const timeSpent = Math.floor((Date.now() - startTimeRef.current) / 1000);

      if (timeSpent < 1) return;

      try {
        await apiRequest('POST', '/api/analytics/page-view', {
          organizationId: user.organizationId,
          userId: user.id,
          loanOfficerId: user.loanOfficerId,
          pageName,
          pageRoute,
          timeSpent,
          sessionId: sessionStorage.getItem('session_id') || undefined,
        });
      } catch (error) {
        console.error('Failed to track page view:', error);
      }
    };

    const handleBeforeUnload = () => {
      trackPageView();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      trackPageView();
    };
  }, [isAuthenticated, user, pageName, pageRoute]);
}
