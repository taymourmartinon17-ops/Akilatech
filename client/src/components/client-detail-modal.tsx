import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import type { Client, Visit } from "@shared/schema";

interface ClientDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
}

export function ClientDetailModal({ isOpen, onClose, client }: ClientDetailModalProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: visits = [] } = useQuery<Visit[]>({
    queryKey: ['/api/visits', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId && isOpen,
  });

  // Unsnooze mutation
  const unsnoozeMutation = useMutation({
    mutationFn: async (clientId: string) => {
      const response = await fetch(`/api/clients/${clientId}/snooze`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error('Failed to unsnooze client');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/clients', user?.loanOfficerId] });
      toast({
        title: t('client.clientUnsnoozed'),
        description: t('client.clientUnsnoozedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('client.unsnoozeFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  if (!client) return null;

  // Filter visits for this specific client
  const clientVisits = visits.filter(visit => visit.clientId === client.clientId)
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime());

  // Helper functions for snooze status
  const isCurrentlySnoozed = (client: Client): boolean => {
    if (!client.snoozedUntil) return false;
    const snoozeExpiry = new Date(client.snoozedUntil);
    const now = new Date();
    return now <= snoozeExpiry;
  };

  const formatSnoozeDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSnoozeTimeRemaining = (snoozeUntil: string | Date) => {
    const now = new Date();
    const snoozeExpiry = new Date(snoozeUntil);
    const diff = snoozeExpiry.getTime() - now.getTime();
    
    if (diff <= 0) return t('common.expired');
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    if (days > 0) {
      return t('common.daysHoursRemaining', {
        days,
        daysPlural: days > 1 ? 's' : '',
        hours,
        hoursPlural: hours !== 1 ? 's' : ''
      });
    } else if (hours > 0) {
      return hours > 1 
        ? t('common.hoursRemaining', { count: hours })
        : t('common.hourRemaining', { count: hours });
    } else {
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      return minutes > 1
        ? t('common.minutesRemaining', { count: minutes })
        : t('common.minuteRemaining', { count: minutes });
    }
  };

  const handleUnsnooze = (clientId: string) => {
    unsnoozeMutation.mutate(clientId);
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400";
      case "Urgent":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400";
      case "Moderately Urgent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "Low Urgency":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return "text-purple-600 dark:text-purple-400";
    if (score >= 50) return "text-indigo-600 dark:text-indigo-400";
    if (score >= 30) return "text-blue-600 dark:text-blue-400";
    return "text-green-600 dark:text-green-400";
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const formatTime = (time: string) => {
    return new Date(`1970-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatLastVisit = (date: Date | string | null) => {
    if (!date) return t('dashboard.never');
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return t('dashboard.today');
    if (days === 1) return t('dashboard.oneDayAgo');
    return t('dashboard.daysAgo', { days });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-4xl max-h-[80vh] overflow-y-auto" data-testid="client-detail-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3" data-testid="modal-title">
            <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center">
              <span className="text-lg font-medium text-primary">
                {client.name.split(' ').map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
            <div>
              <h2 className="text-xl font-semibold">{client.name}</h2>
              <p className="text-sm text-muted-foreground">{t('client.clientId')}: {client.clientId}</p>
            </div>
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Risk & Urgency Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-card p-4 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('client.riskScore')}</h3>
                <i className="fas fa-chart-line text-muted-foreground"></i>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-bold ${getRiskColor(client.riskScore)}`}>
                  {client.riskScore.toFixed(1)}
                </span>
                <div className="flex-1 bg-muted rounded-full h-2">
                  <div 
                    className={`h-2 rounded-full ${client.riskScore >= 70 ? 'bg-purple-500' : client.riskScore >= 50 ? 'bg-indigo-500' : client.riskScore >= 30 ? 'bg-blue-500' : 'bg-green-500'}`}
                    style={{ width: `${Math.min(client.riskScore, 100)}%` }}
                  ></div>
                </div>
              </div>
            </div>
            
            <div className="bg-card p-4 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('client.urgency')}</h3>
                <i className="fas fa-exclamation-circle text-muted-foreground"></i>
              </div>
              <Badge className={`${getUrgencyColor(client.urgencyClassification)} border-0 text-xs`}>
                {client.urgencyClassification === 'Extremely Urgent' ? t('urgency.extremelyUrgent') :
                 client.urgencyClassification === 'Urgent' ? t('urgency.urgent') :
                 client.urgencyClassification === 'Moderately Urgent' ? t('urgency.moderatelyUrgent') :
                 t('urgency.lowUrgency')}
              </Badge>
              <div className="mt-1 text-xs text-muted-foreground">
                {t('client.compositeScore')}: {client.compositeUrgency?.toFixed(1) || 'N/A'}
              </div>
            </div>
            
            <div className="bg-card p-4 rounded-lg border border-border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-muted-foreground">{t('client.outstanding')}</h3>
                <i className="fas fa-dollar-sign text-muted-foreground"></i>
              </div>
              <span className="text-2xl font-bold text-foreground">
                {client.outstanding.toLocaleString()} JOD
              </span>
            </div>
          </div>
          
          {/* Client Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <i className="fas fa-user me-2 text-primary"></i>
                {t('client.clientInformation')}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.lastVisit')}:</span>
                  <span className="font-medium">{formatLastVisit(client.lastVisitDate)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.feedbackScore')}:</span>
                  <div className="flex items-center gap-1">
                    {client.feedbackScore ? (
                      <>
                        <span className="font-medium">{client.feedbackScore}/5</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <i 
                              key={star}
                              className={`fas fa-star text-xs ${star <= client.feedbackScore! ? 'text-yellow-400' : 'text-gray-300'}`}
                            />
                          ))}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground italic">{t('client.noFeedbackYet')}</span>
                    )}
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.totalVisits')}:</span>
                  <span className="font-medium">{clientVisits.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.completedVisits')}:</span>
                  <span className="font-medium">{clientVisits.filter(v => v.status === 'completed').length}</span>
                </div>
                
                {/* Snooze Status Section */}
                <Separator className="my-4" />
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-muted-foreground flex items-center">
                    <i className="fas fa-clock me-2"></i>
                    {t('client.snoozeStatus')}
                  </h4>
                  {isCurrentlySnoozed(client) ? (
                    <div className="bg-blue-50 dark:bg-blue-950/20 p-3 rounded-lg border border-blue-200 dark:border-blue-900/30" data-testid="snooze-status-active">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 border-0">
                              <i className="fas fa-pause-circle me-1"></i>
                              {t('client.currentlySnoozed')}
                            </Badge>
                          </div>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('client.until')}:</span>
                              <span className="font-medium">
                                {formatSnoozeDate(client.snoozedUntil!)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">{t('client.timeRemaining')}:</span>
                              <span className="font-medium text-blue-700 dark:text-blue-400">
                                {getSnoozeTimeRemaining(client.snoozedUntil!)}
                              </span>
                            </div>
                            {client.snoozedBy && (
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">{t('client.snoozedBy')}:</span>
                                <span className="font-medium">{client.snoozedBy}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleUnsnooze(client.id)}
                          disabled={unsnoozeMutation.isPending}
                          className="ms-3 border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                          data-testid="button-unsnooze"
                        >
                          {unsnoozeMutation.isPending ? (
                            <i className="fas fa-spinner fa-spin me-1"></i>
                          ) : (
                            <i className="fas fa-play me-1"></i>
                          )}
                          {t('client.unsnooze')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-green-50 dark:bg-green-950/20 p-3 rounded-lg border border-green-200 dark:border-green-900/30" data-testid="snooze-status-inactive">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400 border-0">
                          <i className="fas fa-play-circle me-1"></i>
                          {t('client.activeInPriority')}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">
                        {t('client.activeInPriorityDesc')}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold mb-3 flex items-center">
                <i className="fas fa-chart-bar me-2 text-primary"></i>
                {t('client.riskBreakdown')}
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.riskScoreLabel')}:</span>
                  <span className="font-medium">{client.riskScore.toFixed(1)}% (50% {t('client.weight')})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.daysSinceLastInteraction')}:</span>
                  <span className="font-medium">
                    {(() => {
                      const dates = [];
                      if (client.lastVisitDate) dates.push(new Date(client.lastVisitDate));
                      if (client.lastPhoneCallDate) dates.push(new Date(client.lastPhoneCallDate));
                      
                      if (dates.length > 0) {
                        const mostRecent = new Date(Math.max(...dates.map(d => d.getTime())));
                        const days = Math.floor((Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24));
                        return `${days} days (40% ${t('client.weight')})`;
                      }
                      return `30 days (40% ${t('client.weight')})`;
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('client.feedbackImpact')}:</span>
                  <span className="font-medium">
                    {client.feedbackScore || 0}/5 (10% {t('client.weight')})
                  </span>
                </div>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* AI Action Suggestions */}
          {client.actionSuggestions && client.actionSuggestions.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <i className="fas fa-robot me-2 text-primary"></i>
                {t('client.aiActionRecommendations')}
              </h3>
              
              <div className="space-y-3">
                {client.actionSuggestions.map((suggestion, index) => {
                  const getActionIcon = (action: string) => {
                    switch (action) {
                      case 'call': return 'fas fa-phone';
                      case 'visit': return 'fas fa-home';
                      case 'email': return 'fas fa-envelope';
                      case 'restructure': return 'fas fa-edit';
                      case 'monitor': return 'fas fa-eye';
                      default: return 'fas fa-tasks';
                    }
                  };
                  
                  const getUrgencyColor = (urgency: string) => {
                    switch (urgency) {
                      case 'immediate': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400';
                      case 'within_3_days': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400';
                      case 'within_week': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400';
                      case 'within_month': return 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400';
                      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400';
                    }
                  };
                  
                  const formatUrgency = (urgency: string) => {
                    switch (urgency) {
                      case 'immediate': return t('urgency.immediateLabel');
                      case 'within_3_days': return t('urgency.within3DaysLabel');
                      case 'within_week': return t('urgency.withinWeekLabel');
                      case 'within_month': return t('urgency.withinMonthLabel');
                      default: return urgency;
                    }
                  };
                  
                  return (
                    <div key={index} className="bg-muted/30 rounded-lg p-4 border border-border">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <i className={`${getActionIcon(suggestion.action)} text-primary`}></i>
                          <span className="font-medium capitalize">{suggestion.action}</span>
                        </div>
                        <Badge className={`${getUrgencyColor(suggestion.urgency)} border-0 text-xs`}>
                          {formatUrgency(suggestion.urgency)}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium mb-1">{suggestion.description}</p>
                      <p className="text-xs text-muted-foreground italic">{suggestion.reasoning}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          <Separator />
          
          {/* Visit History */}
          <div>
            <h3 className="text-lg font-semibold mb-4 flex items-center">
              <i className="fas fa-history me-2 text-primary"></i>
              {t('client.visitHistory')} ({clientVisits.length} {t('client.visits')})
            </h3>
            
            {clientVisits.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {clientVisits.map((visit) => (
                  <div key={visit.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        visit.status === 'completed' ? 'bg-green-500' : 
                        visit.status === 'scheduled' ? 'bg-blue-500' : 'bg-gray-400'
                      }`}></div>
                      <div>
                        <div className="font-medium">
                          {formatDate(visit.scheduledDate)} at {formatTime(visit.scheduledTime)}
                        </div>
                        <div className="text-sm text-muted-foreground capitalize">
                          {t('client.status')}: {visit.status}
                        </div>
                      </div>
                    </div>
                    <div className="text-end">
                      {visit.status === 'completed' && visit.notes && (
                        <div className="text-sm text-muted-foreground italic mb-1">
                          "{visit.notes}"
                        </div>
                      )}
                      {visit.status === 'completed' && (
                        <Badge variant="outline" className="text-xs">
                          <i className="fas fa-check me-1"></i>
                          {t('client.completedStatus')}
                        </Badge>
                      )}
                      {visit.status === 'scheduled' && (
                        <Badge variant="outline" className="text-xs text-blue-600">
                          <i className="fas fa-clock me-1"></i>
                          {t('client.upcomingStatus')}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <i className="fas fa-calendar-times text-4xl mb-2 opacity-50"></i>
                <p>{t('client.noVisitsRecorded')}</p>
              </div>
            )}
          </div>
        </div>
        
        <div className="flex justify-end pt-4 border-t">
          <Button onClick={onClose} data-testid="button-close">
            <i className="fas fa-times me-2"></i>
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}