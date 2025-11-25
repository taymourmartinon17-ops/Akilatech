import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { useTranslation } from 'react-i18next';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Phone, Home, Calendar, Trophy, Star, Medal, Award, Clock, CheckCircle, Lock } from "lucide-react";
import type { Client, Visit, PhoneCall, GamificationBadge, GamificationUserBadge } from "@shared/schema";

interface UserStats {
  totalPoints: number;
  currentStreak: number;
  currentRank: number | null;
  badgeCount: number;
}

export function ActionsPreview({ loanOfficerId }: { loanOfficerId: string }) {
  const { t } = useTranslation();
  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ['/api/clients', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  // Generate AI recommendations on-the-fly
  const generateActionRecommendation = (client: Client, translateFn: any) => {
    const feedbackScore = client.feedbackScore || 3;
    const riskScore = client.riskScore || 0;
    const urgency = client.compositeUrgency || 0;
    const lateDays = client.lateDays || 0;
    
    const urgencyLevel: "immediate" | "within_3_days" | "within_week" | "within_month" = 
      urgency >= 4.5 ? 'immediate' : 
      urgency >= 3.5 ? 'within_3_days' :
      urgency >= 2.5 ? 'within_week' : 'within_month';
    
    const preferCall = feedbackScore >= 3.5 || riskScore < 70;
    const action: "call" | "visit" = preferCall ? 'call' : 'visit';
    
    return {
      action,
      urgency: urgencyLevel,
      description: action === 'call' 
        ? translateFn(lateDays > 30 ? 'actions.scheduleCallOverdue' : 'actions.scheduleCallStatus')
        : translateFn(riskScore > 80 ? 'actions.visitHighRisk' : 'actions.visitPaymentDiscussion'),
      reasoning: action === 'call'
        ? translateFn('actions.callReasoningFeedback', { score: feedbackScore.toFixed(1) })
        : translateFn('actions.visitReasoningRisk', { score: riskScore.toFixed(0) })
    };
  };

  // Get top 3 most urgent clients (not snoozed)
  const clientsWithActions = clients
    .filter(client => {
      if (client.snoozedUntil) {
        const snoozeExpiry = new Date(client.snoozedUntil);
        return new Date() > snoozeExpiry;
      }
      return true;
    })
    .sort((a, b) => (b.compositeUrgency || 0) - (a.compositeUrgency || 0))
    .slice(0, 3)
    .map(client => ({
      ...client,
      actionSuggestions: client.actionSuggestions && client.actionSuggestions.length > 0 
        ? client.actionSuggestions 
        : [generateActionRecommendation(client, t)]
    }));

  const getUrgencyGradient = (urgency: string) => {
    switch (urgency) {
      case 'immediate': return 'from-red-500 to-orange-500';
      case 'within_3_days': return 'from-orange-500 to-yellow-500';
      case 'within_week': return 'from-yellow-500 to-amber-500';
      default: return 'from-blue-500 to-cyan-500';
    }
  };

  const getActionIcon = (action: string) => {
    return action === 'call' ? Phone : Home;
  };

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 rounded-xl border border-blue-200 dark:border-blue-800 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group" data-testid="preview-actions">
      {/* Header with gradient */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg" data-testid="preview-actions-title">{t('dashboard.priorityActions')}</h3>
              <p className="text-xs text-blue-100">{t('dashboard.aiRecommendedSteps')}</p>
            </div>
          </div>
          <Badge variant="secondary" className="bg-white/20 text-white border-white/30" data-testid="preview-actions-count">
            {clientsWithActions.length} {t('dashboard.urgent')}
          </Badge>
        </div>
      </div>

      {/* Content */}
      <div className="p-5 space-y-3">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-white/50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : clientsWithActions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="preview-actions-empty">
            <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
            <p className="text-sm">{t('dashboard.allCaughtUp')}</p>
          </div>
        ) : (
          clientsWithActions.map((client) => {
            const suggestion = client.actionSuggestions?.[0];
            if (!suggestion) return null;

            const ActionIcon = getActionIcon(suggestion.action);
            
            return (
              <div 
                key={client.id}
                className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md hover:shadow-lg transition-all duration-200 hover:-translate-y-1 border border-gray-200 dark:border-gray-700"
                data-testid={`preview-action-${client.clientId}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" data-testid={`preview-action-name-${client.clientId}`}>
                          {client.name}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge 
                            className={`text-xs px-2 py-0 bg-gradient-to-r ${getUrgencyGradient(suggestion.urgency)} text-white border-0`}
                            data-testid={`preview-action-urgency-${client.clientId}`}
                          >
                            {t(`urgency.${suggestion.urgency}`)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {t('client.risk')}: {client.riskScore.toFixed(0)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                      {suggestion.description}
                    </p>
                  </div>
                  <Link href={`/calendar?client=${encodeURIComponent(client.clientId)}&action=${suggestion.action}&name=${encodeURIComponent(client.name)}`}>
                    <Button 
                      size="sm"
                      className={`shrink-0 ${suggestion.action === 'call' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                      data-testid={`preview-action-button-${client.clientId}`}
                    >
                      <ActionIcon className="h-4 w-4 mr-1" />
                      {suggestion.action === 'call' ? t('actions.call') : t('actions.visit')}
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer with "View All" link */}
      <Link href="/actions">
        <div className="border-t border-blue-200 dark:border-blue-800 p-3 bg-white/50 dark:bg-gray-900/20 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors cursor-pointer group-hover:bg-blue-50 dark:group-hover:bg-blue-950/30" data-testid="preview-actions-view-all">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-blue-700 dark:text-blue-400">
            <span>{t('dashboard.viewAllActions')}</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>
    </div>
  );
}

export function CalendarPreview({ loanOfficerId }: { loanOfficerId: string }) {
  const { t } = useTranslation();
  const { data: visits = [], isLoading: visitsLoading } = useQuery<Visit[]>({
    queryKey: ['/api/visits', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  const { data: phoneCalls = [], isLoading: callsLoading } = useQuery<PhoneCall[]>({
    queryKey: ['/api/phone-calls', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  const isLoading = visitsLoading || callsLoading;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingVisits = visits.filter(visit => {
    const visitDate = new Date(visit.scheduledDate);
    visitDate.setHours(0, 0, 0, 0);
    return visitDate >= today && visit.status === 'scheduled';
  });

  const upcomingCalls = phoneCalls.filter(call => {
    const callDate = new Date(call.scheduledDate);
    callDate.setHours(0, 0, 0, 0);
    return callDate >= today && call.status === 'scheduled';
  });

  const upcomingInteractions = [
    ...upcomingVisits.map(v => ({ ...v, type: 'visit' as const })),
    ...upcomingCalls.map(c => ({ ...c, type: 'phone_call' as const }))
  ].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()).slice(0, 4);

  const getClientName = (clientId: string) => {
    return clients.find(c => c.clientId === clientId)?.name || t('calendar.unknownClient');
  };

  const getClientUrgency = (clientId: string) => {
    return clients.find(c => c.clientId === clientId)?.urgencyClassification || 'Low Urgency';
  };
  
  const translateUrgency = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent": return t('urgency.extremelyUrgent');
      case "Urgent": return t('urgency.urgent');
      case "Moderately Urgent": return t('urgency.moderatelyUrgent');
      case "Low Urgency": return t('urgency.lowUrgency');
      default: return urgency;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent": return "text-red-600 dark:text-red-400";
      case "Urgent": return "text-orange-600 dark:text-orange-400";
      case "Moderately Urgent": return "text-yellow-600 dark:text-yellow-400";
      default: return "text-green-600 dark:text-green-400";
    }
  };

  const formatRelativeDate = (dateStr: string | Date) => {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return t('calendar.today');
    if (diffDays === 1) return t('calendar.tomorrow');
    if (diffDays < 7) return t('calendar.inDays', { days: diffDays });
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const todayCount = upcomingInteractions.filter(i => {
    const date = new Date(i.scheduledDate);
    date.setHours(0, 0, 0, 0);
    return date.getTime() === today.getTime();
  }).length;

  const thisWeekCount = upcomingInteractions.filter(i => {
    const date = new Date(i.scheduledDate);
    const diffDays = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays < 7;
  }).length;

  return (
    <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20 rounded-xl border border-purple-200 dark:border-purple-800 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group" data-testid="preview-calendar">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg" data-testid="preview-calendar-title">{t('calendar.upcomingSchedule')}</h3>
              <p className="text-xs text-purple-100">{t('calendar.plannedVisitsCalls')}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs" data-testid="preview-calendar-today">
              {todayCount} {t('common.today')}
            </Badge>
            <Badge variant="secondary" className="bg-white/20 text-white border-white/30 text-xs" data-testid="preview-calendar-week">
              {thisWeekCount} {t('common.thisWeek')}
            </Badge>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-white/50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : upcomingInteractions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground" data-testid="preview-calendar-empty">
            <Calendar className="h-12 w-12 mx-auto mb-2 text-purple-500" />
            <p className="text-sm">{t('calendar.noUpcomingAppointments')}</p>
            <Link href="/calendar">
              <Button variant="outline" size="sm" className="mt-3">
                {t('calendar.scheduleNow')}
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {upcomingInteractions.map((interaction) => {
              const clientName = getClientName(interaction.clientId);
              const urgency = getClientUrgency(interaction.clientId);
              const Icon = interaction.type === 'visit' ? Home : Phone;
              
              return (
                <div 
                  key={interaction.id}
                  className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-md hover:shadow-lg transition-all duration-200 border border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700"
                  data-testid={`preview-calendar-${interaction.type}-${interaction.id}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${interaction.type === 'visit' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-green-100 dark:bg-green-900/30'}`}>
                      <Icon className={`h-4 w-4 ${interaction.type === 'visit' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate" data-testid={`preview-calendar-client-${interaction.id}`}>
                        {clientName}
                      </p>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">
                          {formatRelativeDate(interaction.scheduledDate)}
                        </span>
                        <span className="text-muted-foreground">•</span>
                        <span className={getUrgencyColor(urgency)}>
                          {translateUrgency(urgency)}
                        </span>
                      </div>
                    </div>
                    {interaction.scheduledTime && (
                      <Badge variant="outline" className="text-xs shrink-0" data-testid={`preview-calendar-time-${interaction.id}`}>
                        {new Date(`2000-01-01T${interaction.scheduledTime}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <Link href="/calendar">
        <div className="border-t border-purple-200 dark:border-purple-800 p-3 bg-white/50 dark:bg-gray-900/20 hover:bg-purple-50 dark:hover:bg-purple-950/30 transition-colors cursor-pointer group-hover:bg-purple-50 dark:group-hover:bg-purple-950/30" data-testid="preview-calendar-view-all">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-400">
            <span>{t('calendar.viewFullCalendar')}</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>
    </div>
  );
}

export function IncentivesPreview() {
  const { t } = useTranslation();
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/gamification/stats'],
  });

  const { data: allBadges = [], isLoading: badgesLoading } = useQuery<GamificationBadge[]>({
    queryKey: ['/api/gamification/badges'],
  });

  const { data: userBadges = [] } = useQuery<GamificationUserBadge[]>({
    queryKey: ['/api/gamification/badges/user'],
  });

  const isLoading = statsLoading || badgesLoading;
  const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));
  const recentBadges = allBadges.filter(b => earnedBadgeIds.has(b.id)).slice(0, 3);
  const lockedBadges = allBadges.filter(b => !earnedBadgeIds.has(b.id)).slice(0, 3);

  const getRankDisplay = (rank: number | null) => {
    if (!rank) return { text: t('incentives.unranked'), color: 'text-gray-500', icon: null };
    if (rank === 1) return { text: '#1', color: 'text-yellow-500', icon: '🥇' };
    if (rank === 2) return { text: '#2', color: 'text-gray-400', icon: '🥈' };
    if (rank === 3) return { text: '#3', color: 'text-amber-600', icon: '🥉' };
    return { text: `#${rank}`, color: 'text-blue-600', icon: null };
  };

  const rankInfo = getRankDisplay(stats?.currentRank || null);

  return (
    <div className="bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950/20 dark:to-yellow-950/20 rounded-xl border border-amber-200 dark:border-amber-800 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group" data-testid="preview-incentives">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-600 to-yellow-600 p-5 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
              <Trophy className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg" data-testid="preview-incentives-title">{t('incentives.yourPerformance')}</h3>
              <p className="text-xs text-amber-100">{t('incentives.pointsRankAchievements')}</p>
            </div>
          </div>
          <div className="text-right">
            {rankInfo.icon && <span className="text-2xl">{rankInfo.icon}</span>}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {isLoading ? (
          <div className="space-y-4">
            <div className="h-20 bg-white/50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
            <div className="h-16 bg-white/50 dark:bg-gray-800/50 rounded-lg animate-pulse" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md border border-gray-200 dark:border-gray-700" data-testid="preview-incentives-points">
                <div className="flex items-center gap-2 mb-1">
                  <Star className="h-4 w-4 text-yellow-500" />
                  <span className="text-xs text-muted-foreground">{t('incentives.points')}</span>
                </div>
                <p className="text-2xl font-bold bg-gradient-to-r from-yellow-600 to-amber-600 bg-clip-text text-transparent" data-testid="preview-incentives-points-value">
                  {stats?.totalPoints || 0}
                </p>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md border border-gray-200 dark:border-gray-700" data-testid="preview-incentives-rank">
                <div className="flex items-center gap-2 mb-1">
                  <Medal className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-muted-foreground">{t('incentives.rank')}</span>
                </div>
                <p className={`text-2xl font-bold ${rankInfo.color}`} data-testid="preview-incentives-rank-value">
                  {rankInfo.text}
                </p>
              </div>
            </div>

            {/* Badges Showcase */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-md border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-blue-500" />
                  <span className="text-sm font-semibold">{t('incentives.recentBadges')}</span>
                </div>
                <Badge variant="secondary" className="text-xs" data-testid="preview-incentives-badge-count">
                  {stats?.badgeCount || 0} {t('incentives.earned')}
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {recentBadges.length > 0 ? (
                  recentBadges.map((badge) => (
                    <div
                      key={badge.id}
                      className="relative p-2 border-2 border-primary rounded-lg bg-primary/5 text-center group/badge hover:scale-105 transition-transform"
                      title={badge.name}
                      data-testid={`preview-badge-${badge.id}`}
                    >
                      <CheckCircle className="absolute top-0 right-0 h-3 w-3 text-primary -mt-1 -mr-1" />
                      <div className="text-2xl mb-1">{badge.icon}</div>
                      <p className="text-[10px] font-medium truncate">{badge.name}</p>
                    </div>
                  ))
                ) : lockedBadges.slice(0, 3).map((badge) => (
                  <div
                    key={badge.id}
                    className="relative p-2 border rounded-lg bg-muted/30 text-center opacity-50"
                    title={badge.name}
                    data-testid={`preview-badge-locked-${badge.id}`}
                  >
                    <Lock className="absolute top-0 right-0 h-3 w-3 text-muted-foreground -mt-1 -mr-1" />
                    <div className="text-2xl mb-1 grayscale">{badge.icon}</div>
                    <p className="text-[10px] font-medium truncate">{badge.name}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <Link href="/incentives">
        <div className="border-t border-amber-200 dark:border-amber-800 p-3 bg-white/50 dark:bg-gray-900/20 hover:bg-amber-50 dark:hover:bg-amber-950/30 transition-colors cursor-pointer group-hover:bg-amber-50 dark:group-hover:bg-amber-950/30" data-testid="preview-incentives-view-all">
          <div className="flex items-center justify-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
            <span>{t('incentives.viewAllAchievements')}</span>
            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </Link>
    </div>
  );
}
