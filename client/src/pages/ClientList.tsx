import { useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { Navigation } from "@/components/navigation";
import { ClientTable } from "@/components/client-table";
import { useAuth } from "@/lib/auth";
import { useClientCalculation } from "@/hooks/use-client-calculation";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Client } from "@shared/schema";
import { triggerConfettiBurst } from "@/lib/confetti";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';

export default function ClientList() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { loanOfficerId: routeOfficerId } = useParams();
  const { toast } = useToast();

  usePageTracking({ pageName: "Clients", pageRoute: "/clients" });

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  // Listen for visit completion events from WebSocket
  useEffect(() => {
    const handleVisitCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{ visitId: string; clientId: string; clientName: string; loanOfficerId: string }>;
      const { clientName, loanOfficerId } = customEvent.detail;
      
      triggerConfettiBurst();
      
      toast({
        title: `${t('calendar.visitCompleted')}! 🎉`,
        description: `${clientName} ${t('calendar.visitCompleted').toLowerCase()} ${t('common.by')} ${t('client.loanOfficer')} ${loanOfficerId}`,
        duration: 5000,
      });
      
      console.log('[CLIENTS] Visit completion received:', customEvent.detail);
    };

    window.addEventListener('visitCompleted', handleVisitCompleted);
    
    return () => {
      window.removeEventListener('visitCompleted', handleVisitCompleted);
    };
  }, [toast, t]);

  const targetOfficerId = routeOfficerId || user?.loanOfficerId || '';
  const isViewingSpecificOfficer = Boolean(routeOfficerId);

  const { 
    clients: clientsRaw = [], 
    weightSettings,
    isRecalculating,
    recalculateSingleClient,
    refetchClients: refetch 
  } = useClientCalculation(targetOfficerId, user?.organizationId);

  const clients = clientsRaw.map((client, index) => {
    if (index < 3 && client.riskScore > 50) {
      return {
        ...client,
        actionSuggestions: [
          {
            action: 'call' as const,
            description: t('actions.contactClientOverdue'),
            urgency: client.lateDays > 30 ? 'immediate' as const : 'within_3_days' as const,
            reasoning: `${client.lateDays} ${t('client.lateDays').toLowerCase()} ${t('actions.requiresFollowup')}`
          },
          {
            action: 'visit' as const,
            description: t('actions.scheduleUrgentMeeting'),
            urgency: 'within_week' as const,
            reasoning: `${t('client.riskScore')} ${client.riskScore.toFixed(0)} ${t('actions.highRiskConsultation')}`
          },
          {
            action: client.riskScore > 80 ? 'escalate' as const : 'monitor' as const,
            description: client.riskScore > 80 ? t('actions.escalateToSenior') : t('actions.enhancedMonitoring'),
            urgency: client.riskScore > 80 ? 'within_3_days' as const : 'within_week' as const,
            reasoning: client.riskScore > 80 ? t('actions.criticalRiskIntervention') : t('actions.aboveAverageMonitoring')
          }
        ]
      };
    }
    return client;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-slate-600 dark:text-slate-400">{t('common.loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  const isAdmin = user?.isAdmin || user?.loanOfficerId === 'ADMIN';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-blue-950/20 dark:via-indigo-950/20 dark:to-purple-950/20" data-testid="clients-page">
      <Navigation />
      <div className="p-6 max-w-7xl mx-auto">
        {isAdmin && isViewingSpecificOfficer && (
          <div className="mb-6">
            <Button 
              variant="outline" 
              onClick={() => setLocation('/dashboard')}
              data-testid="button-back-to-admin"
            >
              <ArrowLeft className="h-4 w-4 me-2" />
              {t('common.back')} {t('dashboard.toAdminDashboard')}
            </Button>
            <div className="mt-2">
              <h2 className="text-xl font-semibold" data-testid={`text-viewing-officer-${targetOfficerId}`}>
                {t('dashboard.clientsForOfficer')}: {targetOfficerId}
              </h2>
            </div>
          </div>
        )}
        
        <div className="max-w-full">
          <ClientTable 
            clients={clients} 
            onClientUpdate={() => refetch()} 
            onSingleClientRecalculate={recalculateSingleClient}
          />
        </div>
      </div>
    </div>
  );
}
