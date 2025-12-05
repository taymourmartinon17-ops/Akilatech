import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Clock, AlertTriangle, DollarSign, Calendar, BarChart3, MessageSquare, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import type { Client } from "@shared/schema";

interface ScoreExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  scoreType: 'risk' | 'urgency' | null;
}

interface RiskReason {
  icon: JSX.Element;
  title: string;
  reason: string;
  severity: 'high' | 'medium' | 'low' | 'good';
  value: number;
}

interface UrgencyReason {
  icon: JSX.Element;
  title: string;
  reason: string;
  severity: 'high' | 'medium' | 'low' | 'good';
}

export function ScoreExplanationModal({ isOpen, onClose, client, scoreType }: ScoreExplanationModalProps) {
  const { t } = useTranslation();

  if (!client) return null;

  // Calculate days since most recent interaction
  const daysSinceLastInteraction = (() => {
    const dates = [];
    if (client.lastVisitDate) dates.push(new Date(client.lastVisitDate));
    if (client.lastPhoneCallDate) dates.push(new Date(client.lastPhoneCallDate));
    
    if (dates.length > 0) {
      const mostRecent = new Date(Math.max(...dates.map(d => d.getTime())));
      return Math.max(0, Math.floor((Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return 30;
  })();

  // Generate simple risk reasons based on client data
  const getRiskReasons = (): RiskReason[] => {
    const reasons: RiskReason[] = [];

    // Late Days
    if (client.lateDays > 60) {
      reasons.push({
        icon: <Clock className="w-5 h-5" />,
        title: t('scoreReasons.latePayments'),
        reason: t('scoreReasons.lateDaysHigh', { days: client.lateDays }),
        severity: 'high',
        value: client.lateDays
      });
    } else if (client.lateDays > 30) {
      reasons.push({
        icon: <Clock className="w-5 h-5" />,
        title: t('scoreReasons.latePayments'),
        reason: t('scoreReasons.lateDaysMedium', { days: client.lateDays }),
        severity: 'medium',
        value: client.lateDays
      });
    } else if (client.lateDays > 0) {
      reasons.push({
        icon: <Clock className="w-5 h-5" />,
        title: t('scoreReasons.latePayments'),
        reason: t('scoreReasons.lateDaysLow', { days: client.lateDays }),
        severity: 'low',
        value: client.lateDays
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.latePayments'),
        reason: t('scoreReasons.lateDaysGood'),
        severity: 'good',
        value: 0
      });
    }

    // Outstanding at Risk
    if (client.outstandingAtRisk > 5000) {
      reasons.push({
        icon: <AlertTriangle className="w-5 h-5" />,
        title: t('scoreReasons.atRiskAmount'),
        reason: t('scoreReasons.outstandingHigh', { amount: client.outstandingAtRisk.toLocaleString() }),
        severity: 'high',
        value: client.outstandingAtRisk
      });
    } else if (client.outstandingAtRisk > 2000) {
      reasons.push({
        icon: <AlertTriangle className="w-5 h-5" />,
        title: t('scoreReasons.atRiskAmount'),
        reason: t('scoreReasons.outstandingMedium', { amount: client.outstandingAtRisk.toLocaleString() }),
        severity: 'medium',
        value: client.outstandingAtRisk
      });
    } else if (client.outstandingAtRisk > 0) {
      reasons.push({
        icon: <DollarSign className="w-5 h-5" />,
        title: t('scoreReasons.atRiskAmount'),
        reason: t('scoreReasons.outstandingLow', { amount: client.outstandingAtRisk.toLocaleString() }),
        severity: 'low',
        value: client.outstandingAtRisk
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.atRiskAmount'),
        reason: t('scoreReasons.outstandingGood'),
        severity: 'good',
        value: 0
      });
    }

    // Reschedules
    if (client.countReschedule >= 3) {
      reasons.push({
        icon: <Calendar className="w-5 h-5" />,
        title: t('scoreReasons.loanReschedules'),
        reason: t('scoreReasons.reschedulesHigh', { count: client.countReschedule }),
        severity: 'high',
        value: client.countReschedule
      });
    } else if (client.countReschedule >= 2) {
      reasons.push({
        icon: <Calendar className="w-5 h-5" />,
        title: t('scoreReasons.loanReschedules'),
        reason: t('scoreReasons.reschedulesMedium', { count: client.countReschedule }),
        severity: 'medium',
        value: client.countReschedule
      });
    } else if (client.countReschedule === 1) {
      reasons.push({
        icon: <Calendar className="w-5 h-5" />,
        title: t('scoreReasons.loanReschedules'),
        reason: t('scoreReasons.reschedulesLow'),
        severity: 'low',
        value: 1
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.loanReschedules'),
        reason: t('scoreReasons.reschedulesGood'),
        severity: 'good',
        value: 0
      });
    }

    // Delayed Instalments
    if (client.totalDelayedInstalments > 10) {
      reasons.push({
        icon: <TrendingUp className="w-5 h-5" />,
        title: t('scoreReasons.delayedInstalments'),
        reason: t('scoreReasons.delayedHigh', { count: client.totalDelayedInstalments }),
        severity: 'high',
        value: client.totalDelayedInstalments
      });
    } else if (client.totalDelayedInstalments > 5) {
      reasons.push({
        icon: <TrendingUp className="w-5 h-5" />,
        title: t('scoreReasons.delayedInstalments'),
        reason: t('scoreReasons.delayedMedium', { count: client.totalDelayedInstalments }),
        severity: 'medium',
        value: client.totalDelayedInstalments
      });
    } else if (client.totalDelayedInstalments > 0) {
      reasons.push({
        icon: <TrendingUp className="w-5 h-5" />,
        title: t('scoreReasons.delayedInstalments'),
        reason: t('scoreReasons.delayedLow', { count: client.totalDelayedInstalments }),
        severity: 'low',
        value: client.totalDelayedInstalments
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.delayedInstalments'),
        reason: t('scoreReasons.delayedGood'),
        severity: 'good',
        value: 0
      });
    }

    // Payment Consistency
    if (client.paidInstalments >= 30) {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.paymentHistory'),
        reason: t('scoreReasons.paymentHistoryGood', { count: client.paidInstalments }),
        severity: 'good',
        value: client.paidInstalments
      });
    } else if (client.paidInstalments >= 10) {
      reasons.push({
        icon: <BarChart3 className="w-5 h-5" />,
        title: t('scoreReasons.paymentHistory'),
        reason: t('scoreReasons.paymentHistoryMedium', { count: client.paidInstalments }),
        severity: 'low',
        value: client.paidInstalments
      });
    } else {
      reasons.push({
        icon: <AlertCircle className="w-5 h-5" />,
        title: t('scoreReasons.paymentHistory'),
        reason: t('scoreReasons.paymentHistoryLow', { count: client.paidInstalments }),
        severity: 'medium',
        value: client.paidInstalments
      });
    }

    // Sort by severity (high first, good last)
    const severityOrder = { high: 0, medium: 1, low: 2, good: 3 };
    return reasons.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  };

  // Generate simple urgency reasons
  const getUrgencyReasons = (): UrgencyReason[] => {
    const reasons: UrgencyReason[] = [];

    // Risk Score Impact
    if (client.riskScore >= 70) {
      reasons.push({
        icon: <AlertTriangle className="w-5 h-5" />,
        title: t('scoreReasons.riskLevel'),
        reason: t('scoreReasons.riskLevelHigh'),
        severity: 'high'
      });
    } else if (client.riskScore >= 50) {
      reasons.push({
        icon: <AlertTriangle className="w-5 h-5" />,
        title: t('scoreReasons.riskLevel'),
        reason: t('scoreReasons.riskLevelMedium'),
        severity: 'medium'
      });
    } else if (client.riskScore >= 30) {
      reasons.push({
        icon: <AlertCircle className="w-5 h-5" />,
        title: t('scoreReasons.riskLevel'),
        reason: t('scoreReasons.riskLevelLow'),
        severity: 'low'
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.riskLevel'),
        reason: t('scoreReasons.riskLevelGood'),
        severity: 'good'
      });
    }

    // Days Since Contact
    if (daysSinceLastInteraction > 60) {
      reasons.push({
        icon: <Clock className="w-5 h-5" />,
        title: t('scoreReasons.lastContact'),
        reason: t('scoreReasons.contactVeryOld', { days: daysSinceLastInteraction }),
        severity: 'high'
      });
    } else if (daysSinceLastInteraction > 30) {
      reasons.push({
        icon: <Clock className="w-5 h-5" />,
        title: t('scoreReasons.lastContact'),
        reason: t('scoreReasons.contactOld', { days: daysSinceLastInteraction }),
        severity: 'medium'
      });
    } else if (daysSinceLastInteraction > 14) {
      reasons.push({
        icon: <Clock className="w-5 h-5" />,
        title: t('scoreReasons.lastContact'),
        reason: t('scoreReasons.contactModerate', { days: daysSinceLastInteraction }),
        severity: 'low'
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.lastContact'),
        reason: t('scoreReasons.contactRecent', { days: daysSinceLastInteraction }),
        severity: 'good'
      });
    }

    // Feedback Score
    if (client.feedbackScore <= 2) {
      reasons.push({
        icon: <MessageSquare className="w-5 h-5" />,
        title: t('scoreReasons.previousFeedback'),
        reason: t('scoreReasons.feedbackPoor'),
        severity: 'high'
      });
    } else if (client.feedbackScore <= 3) {
      reasons.push({
        icon: <MessageSquare className="w-5 h-5" />,
        title: t('scoreReasons.previousFeedback'),
        reason: t('scoreReasons.feedbackMixed'),
        severity: 'medium'
      });
    } else if (client.feedbackScore <= 4) {
      reasons.push({
        icon: <MessageSquare className="w-5 h-5" />,
        title: t('scoreReasons.previousFeedback'),
        reason: t('scoreReasons.feedbackOkay'),
        severity: 'low'
      });
    } else {
      reasons.push({
        icon: <CheckCircle className="w-5 h-5" />,
        title: t('scoreReasons.previousFeedback'),
        reason: t('scoreReasons.feedbackGood'),
        severity: 'good'
      });
    }

    // Sort by severity
    const severityOrder = { high: 0, medium: 1, low: 2, good: 3 };
    return reasons.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  };

  const riskReasons = getRiskReasons();
  const urgencyReasons = getUrgencyReasons();

  // Calculate urgency score for display
  const totalContribution = client.compositeUrgency || 0;

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-purple-600 dark:text-purple-400";
    if (score >= 50) return "text-indigo-600 dark:text-indigo-400";
    if (score >= 30) return "text-blue-600 dark:text-blue-400";
    return "text-green-600 dark:text-green-400";
  };

  const getSeverityStyles = (severity: 'high' | 'medium' | 'low' | 'good') => {
    switch (severity) {
      case 'high':
        return {
          bg: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800',
          icon: 'text-purple-600 dark:text-purple-400',
          badge: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
        };
      case 'medium':
        return {
          bg: 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800',
          icon: 'text-indigo-600 dark:text-indigo-400',
          badge: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300'
        };
      case 'low':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          badge: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
        };
      case 'good':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
          icon: 'text-green-600 dark:text-green-400',
          badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
        };
    }
  };

  const getSeverityLabel = (severity: 'high' | 'medium' | 'low' | 'good') => {
    switch (severity) {
      case 'high': return t('scoreReasons.concernHigh');
      case 'medium': return t('scoreReasons.concernMedium');
      case 'low': return t('scoreReasons.concernLow');
      case 'good': return t('scoreReasons.concernGood');
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent":
        return "destructive";
      case "Urgent":
        return "secondary";
      case "Moderately Urgent":
        return "outline";
      case "Low Urgency":
        return "default";
      default:
        return "outline";
    }
  };

  const getUrgencyClassification = (score: number) => {
    if (score >= 60) return { text: t('scoreExplanation.extremelyUrgent'), key: "Extremely Urgent" };
    if (score >= 40) return { text: t('scoreExplanation.urgent'), key: "Urgent" };
    if (score >= 20) return { text: t('scoreExplanation.moderatelyUrgent'), key: "Moderately Urgent" };
    return { text: t('scoreExplanation.lowUrgency'), key: "Low Urgency" };
  };

  const urgencyClass = getUrgencyClassification(totalContribution);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="score-explanation-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{t('scoreReasons.analysisFor', { name: client.name })}</span>
            <Badge variant="outline" data-testid="client-id-badge">
              {client.clientId}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={scoreType || 'risk'} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="risk" data-testid="tab-risk-score">{t('scoreReasons.riskTab')}</TabsTrigger>
            <TabsTrigger value="urgency" data-testid="tab-urgency-score">{t('scoreReasons.urgencyTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="risk" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>{t('scoreReasons.riskScoreTitle')}</span>
                  <span className={`text-3xl font-bold ${getScoreColor(client.riskScore)}`} data-testid="risk-score-display">
                    {client.riskScore.toFixed(0)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <Progress 
                    value={client.riskScore} 
                    className="h-3"
                    data-testid="risk-score-progress"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>{t('scoreReasons.lowRisk')}</span>
                    <span>{t('scoreReasons.highRisk')}</span>
                  </div>
                </div>

                <h4 className="font-semibold text-foreground mb-4">{t('scoreReasons.mainReasons')}</h4>
                
                <div className="space-y-3">
                  {riskReasons.map((reason, index) => {
                    const styles = getSeverityStyles(reason.severity);
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-4 ${styles.bg}`}
                        data-testid={`risk-reason-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 ${styles.icon}`}>
                            {reason.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-foreground">{reason.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${styles.badge}`}>
                                {getSeverityLabel(reason.severity)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{reason.reason}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="urgency" className="space-y-4 mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span>{t('scoreReasons.urgencyScoreTitle')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-2xl font-bold text-foreground" data-testid="urgency-score-display">
                      {totalContribution.toFixed(0)}
                    </span>
                    <Badge variant={getUrgencyColor(urgencyClass.key)} data-testid="urgency-classification-badge">
                      {urgencyClass.text}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <Progress 
                    value={totalContribution} 
                    className="h-3"
                    data-testid="urgency-score-progress"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>{t('scoreReasons.lowPriority')}</span>
                    <span>{t('scoreReasons.highPriority')}</span>
                  </div>
                </div>

                <h4 className="font-semibold text-foreground mb-4">{t('scoreReasons.whyThisUrgency')}</h4>
                
                <div className="space-y-3">
                  {urgencyReasons.map((reason, index) => {
                    const styles = getSeverityStyles(reason.severity);
                    return (
                      <div 
                        key={index} 
                        className={`border rounded-lg p-4 ${styles.bg}`}
                        data-testid={`urgency-reason-${index}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 ${styles.icon}`}>
                            {reason.icon}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-foreground">{reason.title}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${styles.badge}`}>
                                {getSeverityLabel(reason.severity)}
                              </span>
                            </div>
                            <p className="text-sm text-muted-foreground">{reason.reason}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h5 className="font-semibold mb-3">{t('scoreReasons.urgencyLevels')}</h5>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      <span className="text-purple-800 dark:text-purple-300">{t('scoreExplanation.extremelyUrgent')}</span>
                    </div>
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                      <span className="text-indigo-800 dark:text-indigo-300">{t('scoreExplanation.urgent')}</span>
                    </div>
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                      <span className="text-blue-800 dark:text-blue-300">{t('scoreExplanation.moderatelyUrgent')}</span>
                    </div>
                    <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                      <span className="text-green-800 dark:text-green-300">{t('scoreExplanation.lowUrgency')}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
