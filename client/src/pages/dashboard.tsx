import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navigation } from "@/components/navigation";
import AdminDashboard from "@/components/admin-dashboard";
import { useAuth } from "@/lib/auth";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ClientDetailModal } from "@/components/client-detail-modal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Client } from "@shared/schema";
import { triggerConfettiBurst } from "@/lib/confetti";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from 'react-i18next';
import { PerformanceWidget } from "@/components/performance-widget";
import { PerformanceGraphs } from "@/components/performance-graphs";
import { RefreshCw, Clock, Calendar, Loader2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { motion } from "framer-motion";

export default function Dashboard() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  usePageTracking({ pageName: "Dashboard", pageRoute: "/dashboard" });
  
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [selectedAction, setSelectedAction] = useState<{client: Client, suggestion: any} | null>(null);
  const [showActionReasoning, setShowActionReasoning] = useState(false);

  // Snooze client mutation
  const snoozeMutation = useMutation({
    mutationFn: async ({ clientId, duration }: { clientId: string, duration: number }) => {
      const response = await fetch(`/api/clients/${clientId}/snooze`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration, loanOfficerId: user?.loanOfficerId })
      });
      
      if (!response.ok) {
        throw new Error('Failed to snooze client');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients', user?.loanOfficerId] });
      toast({
        title: t('actions.clientSnoozed'),
        description: t('actions.clientSnoozedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('actions.snoozeFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

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
      
      if (loanOfficerId === user?.loanOfficerId) {
        triggerConfettiBurst();
        
        toast({
          title: `${t('calendar.visitCompleted')}! 🎉`,
          description: `${clientName} ${t('calendar.visitCompleted').toLowerCase()} ${t('common.by')} ${t('client.loanOfficer')} ${loanOfficerId}`,
          duration: 5000,
        });
      }
    };

    window.addEventListener('visitCompleted', handleVisitCompleted);
    
    return () => {
      window.removeEventListener('visitCompleted', handleVisitCompleted);
    };
  }, [user?.loanOfficerId, toast, t]);

  const { data: clientsRaw = [], refetch } = useQuery<Client[]>({
    queryKey: ['/api/clients', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId,
    refetchInterval: 2 * 60 * 1000,
    refetchIntervalInBackground: true,
  });

  const clients = clientsRaw;

  // Filter out snoozed clients
  const clientsNotSnoozed = clients.filter(client => {
    if (client.snoozedUntil) {
      const snoozeExpiry = new Date(client.snoozedUntil);
      const now = new Date();
      return now > snoozeExpiry;
    }
    return true;
  });

  // Sort by urgency and limit to top 20
  const sortedActionClients = clientsNotSnoozed
    .sort((a, b) => (b.compositeUrgency || 0) - (a.compositeUrgency || 0))
    .slice(0, 20);

  // Generate AI recommendations
  const generateActionRecommendations = (client: Client) => {
    const feedbackScore = client.feedbackScore ?? 3;
    const riskScore = client.riskScore ?? 0;
    const urgency = client.compositeUrgency ?? 0;
    const lateDays = client.lateDays ?? 0;
    
    const urgencyLevel: "immediate" | "within_3_days" | "within_week" | "within_month" = 
      urgency >= 4.5 ? 'immediate' : 
      urgency >= 3.5 ? 'within_3_days' :
      urgency >= 2.5 ? 'within_week' : 'within_month';
    
    const preferCall = feedbackScore >= 3.5 || riskScore < 70;
    const action: "call" | "visit" = preferCall ? 'call' : 'visit';
    
    const suggestions: Array<{
      action: "call" | "visit" | "email" | "restructure" | "monitor" | "escalate";
      urgency: "immediate" | "within_3_days" | "within_week" | "within_month";
      description: string;
      reasoning: string;
    }> = [];
    
    if (action === 'call') {
      suggestions.push({
        action: 'call',
        urgency: urgencyLevel,
        description: `Schedule phone call to discuss ${lateDays > 30 ? 'overdue payment' : 'account status'}`,
        reasoning: `Client feedback score of ${feedbackScore.toFixed(1)}/5 indicates good phone responsiveness. Risk level ${riskScore.toFixed(0)} manageable via call.`
      });
    } else {
      suggestions.push({
        action: 'visit',
        urgency: urgencyLevel,
        description: `Conduct in-person visit for ${riskScore > 80 ? 'high-risk account assessment' : 'payment discussion'}`,
        reasoning: `Risk score ${riskScore.toFixed(0)}/100 and feedback ${feedbackScore.toFixed(1)}/5 suggest in-person intervention needed for best results.`
      });
    }
    
    return suggestions;
  };

  const clientsWithRecommendations = sortedActionClients.map(client => ({
    ...client,
    actionSuggestions: client.actionSuggestions && client.actionSuggestions.length > 0 
      ? client.actionSuggestions 
      : generateActionRecommendations(client)
  }));

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return 'bg-purple-600';
      case 'within_3_days': return 'bg-indigo-600';
      case 'within_week': return 'bg-blue-500';
      default: return 'bg-gray-500';
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'call': return 'fa-phone';
      case 'visit': return 'fa-home';
      case 'email': return 'fa-envelope';
      case 'restructure': return 'fa-cogs';
      default: return 'fa-tasks';
    }
  };

  const handleClientClick = (client: Client) => {
    setSelectedClient(client);
    setShowClientModal(true);
  };

  const handleActionClick = (client: Client, suggestion: any) => {
    setSelectedAction({ client, suggestion });
    setShowActionReasoning(true);
  };

  const handlePlanAction = (client: Client, action: string) => {
    setLocation(`/calendar?client=${encodeURIComponent(client.clientId)}&action=${action}&name=${encodeURIComponent(client.name)}`);
  };

  const handleSnoozeClient = (client: Client, duration: number) => {
    snoozeMutation.mutate({ clientId: client.id, duration });
  };

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
  
  // Show admin dashboard for admin users
  if (isAdmin) {
    return (
      <div className="min-h-screen bg-blue-50 dark:bg-gray-900" data-testid="admin-dashboard-page">
        <Navigation />
        <div className="p-6 max-w-7xl mx-auto">
          <AdminDashboard />
        </div>
      </div>
    );
  }

  // Show actions dashboard for regular loan officers
  return (
    <div className="min-h-screen bg-indigo-50 dark:bg-gray-900" data-testid="dashboard-page">
      <Navigation />
      <div className="p-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left Column: Performance Graphs + Actions */}
          <div className="lg:col-span-3 space-y-6">
            {/* Performance Graphs */}
            <PerformanceGraphs loanOfficerId={user.loanOfficerId} />
            
            {/* Actions Header */}
            <motion.div 
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-indigo-600 dark:bg-indigo-700 rounded-xl p-6 text-white shadow-lg"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div 
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
                    className="p-3 bg-white/20 rounded-lg backdrop-blur-sm"
                  >
                    <Calendar className="h-6 w-6" />
                  </motion.div>
                  <div>
                    <h1 className="text-3xl font-bold" data-testid="dashboard-title">
                      {t('actions.pageTitle')}
                    </h1>
                    <p className="text-indigo-100 mt-1" data-testid="dashboard-subtitle">
                      {t('actions.pageSubtitle')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Button 
                    variant="secondary"
                    onClick={() => refetch()}
                    className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white border-white/30 transition-all duration-200"
                    data-testid="button-refresh-actions"
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t('common.refresh')}
                  </Button>
                  <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-sm px-3 py-1">
                    {clientsWithRecommendations.length} {t('dashboard.clientsCount')}
                  </Badge>
                </div>
              </div>
            </motion.div>

            {/* Action Items */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-white dark:bg-gray-800 rounded-xl border border-indigo-200 dark:border-indigo-800 shadow-lg overflow-hidden" 
              data-testid="actions-list"
            >
              <div className="px-6 py-4 border-b border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-950/20">
                <h2 className="text-lg font-semibold text-foreground">{t('actions.recommendedActions')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t('actions.prioritizedByUrgency')}</p>
              </div>
              
              <div className="divide-y divide-border">
                {clientsWithRecommendations.length > 0 ? (
                  clientsWithRecommendations.map((client, index) => (
                    <motion.div 
                      key={client.id} 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
                      className="p-6 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all duration-200" 
                      data-testid={`action-item-${client.clientId}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <button
                              onClick={() => handleClientClick(client)}
                              className="text-lg font-medium text-foreground hover:text-primary hover:underline"
                              data-testid={`button-client-${client.clientId}`}
                            >
                              {client.name}
                            </button>
                            <span className="text-sm text-muted-foreground" data-testid={`text-client-id-${client.clientId}`}>
                              {client.clientId}
                            </span>
                            <Badge variant="outline" data-testid={`badge-risk-${client.clientId}`}>
                              {t('client.riskScore')}: {client.riskScore.toFixed(0)}
                            </Badge>
                            <Badge variant="outline" data-testid={`badge-urgency-score-${client.clientId}`}>
                              {t('client.urgencyScore')}: {(client.compositeUrgency || 0).toFixed(1)}
                            </Badge>
                            <Badge 
                              className={client.urgencyClassification === 'Extremely Urgent' ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' : 
                                       client.urgencyClassification === 'Urgent' ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200' :
                                       client.urgencyClassification === 'Moderately Urgent' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                       'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}
                              data-testid={`badge-urgency-${client.clientId}`}
                            >
                              {client.urgencyClassification === 'Extremely Urgent' ? t('urgency.extremelyUrgent') :
                               client.urgencyClassification === 'Urgent' ? t('urgency.urgent') :
                               client.urgencyClassification === 'Moderately Urgent' ? t('urgency.moderatelyUrgent') :
                               t('urgency.lowUrgency')}
                            </Badge>
                          </div>
                          
                          <div className="space-y-2">
                            {client.actionSuggestions?.map((suggestion, index) => (
                              <div 
                                key={index} 
                                className="flex items-start gap-3 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg cursor-pointer hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border border-indigo-200 dark:border-indigo-800"
                                onClick={() => handleActionClick(client, suggestion)}
                                data-testid={`suggestion-${client.clientId}-${index}`}
                              >
                                <div className="flex items-center gap-2">
                                  <div className={`p-2 rounded-lg ${getUrgencyColor(suggestion.urgency)}`}>
                                    <i className={`fas ${getActionIcon(suggestion.action)} text-white`}></i>
                                  </div>
                                  <Badge className={`text-xs px-2 py-0 ${getUrgencyColor(suggestion.urgency)} text-white border-0`}>
                                    {suggestion.urgency.replace('_', ' ')}
                                  </Badge>
                                </div>
                                <div className="flex-1">
                                  <p className="font-semibold text-foreground text-sm">
                                    {suggestion.description}
                                  </p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {suggestion.reasoning}
                                  </p>
                                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 font-medium">
                                    <i className="fas fa-info-circle me-1"></i>
                                    {t('actions.viewReasoning')}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ms-4">
                          {client.actionSuggestions?.filter(suggestion => 
                            suggestion.action === 'call' || suggestion.action === 'visit'
                          ).map((suggestion, index) => (
                            <Button
                              key={index}
                              size="sm"
                              onClick={() => handlePlanAction(client, suggestion.action)}
                              className={`${
                                suggestion.action === 'call' 
                                  ? 'bg-green-600 hover:bg-green-700 text-white shadow-md hover:shadow-lg' 
                                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md hover:shadow-lg'
                              } transition-all duration-200`}
                              data-testid={`button-plan-${suggestion.action}-${client.clientId}`}
                            >
                              <i className={`fas ${
                                suggestion.action === 'call' ? 'fa-phone' : 'fa-map-marker-alt'
                              } me-1`}></i>
                              {suggestion.action === 'call' ? t('actions.planCall') : t('actions.planVisit')}
                            </Button>
                          ))}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClientClick(client)}
                            data-testid={`button-view-details-${client.clientId}`}
                          >
                            <i className="fas fa-eye me-1"></i>
                            {t('common.viewDetails')}
                          </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="outline"
                                size="sm"
                                className="flex items-center gap-1"
                                data-testid={`button-snooze-${client.clientId}`}
                              >
                                <Clock className="h-3 w-3" />
                                {t('actions.snoozeFor')}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                onClick={() => handleSnoozeClient(client, 1)}
                                data-testid={`snooze-1day-${client.clientId}`}
                              >
                                {t('actions.snoozeFor')} 1 {t('actions.day')}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleSnoozeClient(client, 7)}
                                data-testid={`snooze-1week-${client.clientId}`}
                              >
                                {t('actions.snoozeFor')} 1 {t('actions.week')}
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                onClick={() => handleSnoozeClient(client, 30)}
                                data-testid={`snooze-1month-${client.clientId}`}
                              >
                                {t('actions.snoozeFor')} 1 {t('actions.month')}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </motion.div>
                  ))
                ) : (
                  <div className="p-8 text-center" data-testid="no-actions">
                    <i className="fas fa-check-circle text-4xl text-green-500 mb-4"></i>
                    <h3 className="text-lg font-medium text-foreground mb-2">{t('actions.noUrgentActions')}</h3>
                    <p className="text-muted-foreground">{t('actions.allClientsUpToDate')}</p>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
          
          {/* Right Column: Performance Widget */}
          <div className="lg:col-span-1">
            <PerformanceWidget />
          </div>
        </div>
      </div>

      <ClientDetailModal
        isOpen={showClientModal}
        onClose={() => setShowClientModal(false)}
        client={selectedClient}
      />

      <Dialog open={showActionReasoning} onOpenChange={setShowActionReasoning}>
        <DialogContent className="max-w-2xl" data-testid="action-reasoning-modal">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <i className={`fas ${selectedAction ? getActionIcon(selectedAction.suggestion.action) : 'fa-info'} text-primary`}></i>
              {t('actions.actionReasoningTitle')}
            </DialogTitle>
          </DialogHeader>
          
          {selectedAction && (
            <div className="space-y-4 mt-4">
              <div className="bg-muted/30 p-4 rounded-lg">
                <h3 className="font-semibold mb-2">{selectedAction.client.name}</h3>
                <p className="text-sm text-muted-foreground">{selectedAction.suggestion.description}</p>
              </div>
              <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg">
                <p className="text-sm">{selectedAction.suggestion.reasoning}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
