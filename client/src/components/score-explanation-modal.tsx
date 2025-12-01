import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TrendingUp, Clock, AlertTriangle, DollarSign, Calendar, BarChart3, MessageSquare } from "lucide-react";
import type { Client } from "@shared/schema";

interface ScoreExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  scoreType: 'risk' | 'urgency' | null;
}

export function ScoreExplanationModal({ isOpen, onClose, client, scoreType }: ScoreExplanationModalProps) {
  const { t } = useTranslation();
  // Get the loan officer ID consistently with how other pages do it
  const storedUser = localStorage.getItem('user');
  const loanOfficerId = storedUser ? JSON.parse(storedUser).loanOfficerId : 'LO-12345';
  
  // Fetch global settings for dynamic weights (same for all loan officers)
  const { data: settings, isLoading } = useQuery<any>({
    queryKey: ['/api/settings'],
    enabled: isOpen,
  });

  if (!client) return null;

  // Use dynamic weights from settings or fallback to defaults
  const riskWeights = {
    lateDays: settings?.riskLateDaysWeight || 25,
    outstandingAtRisk: settings?.riskOutstandingAtRiskWeight || 20,
    parPerLoan: settings?.riskParPerLoanWeight || 20,
    reschedules: settings?.riskReschedulesWeight || 15,
    paymentConsistency: settings?.riskPaymentConsistencyWeight || 10,
    delayedInstalments: settings?.riskDelayedInstalmentsWeight || 10
  };

  const urgencyWeights = {
    riskScore: settings?.urgencyRiskScoreWeight || 25,
    daysSinceVisit: settings?.urgencyDaysSinceVisitWeight || 50,
    feedbackScore: settings?.urgencyFeedbackScoreWeight || 25
  };

  // Calculate risk score components based on dynamic weights
  const riskComponents = {
    lateDays: {
      value: client.lateDays,
      maxThreshold: 90,
      weight: riskWeights.lateDays,
      score: Math.min((client.lateDays / 90) * riskWeights.lateDays, riskWeights.lateDays),
      label: t('scoreExplanation.lateDaysLabel'),
      description: t('scoreExplanation.lateDaysDesc'),
      icon: <Clock className="w-4 h-4" />
    },
    outstandingAtRisk: {
      value: client.outstandingAtRisk,
      maxThreshold: 10000,
      weight: riskWeights.outstandingAtRisk,
      score: Math.min((client.outstandingAtRisk / 10000) * riskWeights.outstandingAtRisk, riskWeights.outstandingAtRisk),
      label: t('scoreExplanation.outstandingAtRiskLabel'),
      description: t('scoreExplanation.outstandingAtRiskDesc'),
      icon: <AlertTriangle className="w-4 h-4" />
    },
    parPerLoan: {
      value: client.parPerLoan,
      maxThreshold: 1.0,
      weight: riskWeights.parPerLoan,
      score: Math.min((client.parPerLoan / 1.0) * riskWeights.parPerLoan, riskWeights.parPerLoan),
      label: t('scoreExplanation.parPerLoanLabel'),
      description: t('scoreExplanation.parPerLoanDesc'),
      icon: <DollarSign className="w-4 h-4" />
    },
    reschedules: {
      value: client.countReschedule,
      maxThreshold: 5,
      weight: riskWeights.reschedules,
      score: Math.min((client.countReschedule / 5) * riskWeights.reschedules, riskWeights.reschedules),
      label: t('scoreExplanation.reschedulesLabel'),
      description: t('scoreExplanation.reschedulesDesc'),
      icon: <Calendar className="w-4 h-4" />
    },
    paymentConsistency: {
      value: client.paidInstalments,
      maxThreshold: 50,
      weight: riskWeights.paymentConsistency,
      score: Math.max(0, Math.min(((50 - client.paidInstalments) / 50) * riskWeights.paymentConsistency, riskWeights.paymentConsistency)),
      label: t('scoreExplanation.paymentConsistencyLabel'),
      description: t('scoreExplanation.paymentConsistencyDesc'),
      icon: <BarChart3 className="w-4 h-4" />
    },
    delayedInstalments: {
      value: client.totalDelayedInstalments,
      maxThreshold: 20,
      weight: riskWeights.delayedInstalments,
      score: Math.min((client.totalDelayedInstalments / 20) * riskWeights.delayedInstalments, riskWeights.delayedInstalments),
      label: t('scoreExplanation.delayedInstalmentsLabel'),
      description: t('scoreExplanation.delayedInstalmentsDesc'),
      icon: <TrendingUp className="w-4 h-4" />
    }
  };

  // Calculate days since most recent interaction (visits OR phone calls)
  const daysSinceLastInteraction = (() => {
    const dates = [];
    if (client.lastVisitDate) dates.push(new Date(client.lastVisitDate));
    if (client.lastPhoneCallDate) dates.push(new Date(client.lastPhoneCallDate));
    
    if (dates.length > 0) {
      const mostRecent = new Date(Math.max(...dates.map(d => d.getTime())));
      return Math.max(0, Math.floor((Date.now() - mostRecent.getTime()) / (1000 * 60 * 60 * 24)));
    }
    return 30; // Default for new clients
  })();

  // Normalize weights to sum to 1.0 (exactly matching ML service)
  const totalWeight = urgencyWeights.riskScore + urgencyWeights.daysSinceVisit + urgencyWeights.feedbackScore;
  const normalizedWeights = {
    risk: urgencyWeights.riskScore / totalWeight,
    days: urgencyWeights.daysSinceVisit / totalWeight,
    feedback: urgencyWeights.feedbackScore / totalWeight
  };

  // Scale each component to 0-100 where 100 = most urgent (exactly matching ML service)
  const riskUrgency = Math.min(Math.max(client.riskScore, 0), 100);
  const daysUrgency = Math.min(Math.max((daysSinceLastInteraction / 180.0) * 100, 0), 100);
  const feedbackUrgency = Math.max(0, Math.min(100, (5 - client.feedbackScore) * 25));

  // Use backend-provided breakdown if available, otherwise calculate (fallback)
  const urgencyComponents = client.urgencyBreakdown ? {
    riskScore: {
      ...client.urgencyBreakdown.riskScore,
      label: t('scoreExplanation.riskScoreLabel'),
      description: t('scoreExplanation.riskScoreDesc'),
      icon: <TrendingUp className="w-4 h-4" />
    },
    daysSinceInteraction: {
      ...client.urgencyBreakdown.daysSinceInteraction,
      label: t('scoreExplanation.daysSinceContactLabel'),
      description: t('scoreExplanation.daysSinceContactDesc'),
      icon: <Clock className="w-4 h-4" />
    },
    feedbackScore: {
      ...client.urgencyBreakdown.feedbackScore,
      label: t('scoreExplanation.previousFeedbackLabel'),
      description: t('scoreExplanation.previousFeedbackDesc'),
      icon: <MessageSquare className="w-4 h-4" />
    }
  } : {
    // Fallback calculation if no backend breakdown available
    riskScore: {
      value: client.riskScore,
      scaledValue: riskUrgency,
      weight: urgencyWeights.riskScore,
      normalizedWeight: normalizedWeights.risk * 100, // Show as percentage
      contribution: riskUrgency * normalizedWeights.risk,
      label: t('scoreExplanation.riskScoreLabel'),
      description: t('scoreExplanation.riskScoreFallbackDesc'),
      icon: <AlertTriangle className="w-4 h-4" />
    },
    daysSinceInteraction: {
      value: daysSinceLastInteraction,
      scaledValue: daysUrgency,
      weight: urgencyWeights.daysSinceVisit,
      normalizedWeight: normalizedWeights.days * 100, // Show as percentage
      contribution: daysUrgency * normalizedWeights.days,
      label: t('scoreExplanation.daysSinceInteractionLabel'),
      description: t('scoreExplanation.daysSinceInteractionDesc'),
      icon: <Clock className="w-4 h-4" />
    },
    feedbackScore: {
      value: client.feedbackScore,
      scaledValue: feedbackUrgency,
      weight: urgencyWeights.feedbackScore,
      normalizedWeight: normalizedWeights.feedback * 100, // Show as percentage
      contribution: feedbackUrgency * normalizedWeights.feedback,
      label: t('scoreExplanation.previousFeedbackLabel'),
      description: t('scoreExplanation.previousFeedbackFallbackDesc'),
      icon: <BarChart3 className="w-4 h-4" />
    }
  };

  // Calculate total weighted contribution 
  const totalContribution = urgencyComponents.riskScore.contribution + 
                           urgencyComponents.daysSinceInteraction.contribution + 
                           urgencyComponents.feedbackScore.contribution;

  const getScoreColor = (score: number) => {
    if (score >= 70) return "text-purple-600 dark:text-purple-400";
    if (score >= 50) return "text-indigo-600 dark:text-indigo-400";
    if (score >= 30) return "text-blue-600 dark:text-blue-400";
    return "text-green-600 dark:text-green-400";
  };

  const getProgressColor = (score: number) => {
    if (score >= 70) return "bg-purple-500";
    if (score >= 50) return "bg-indigo-500";
    if (score >= 30) return "bg-blue-500";
    return "bg-green-500";
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="score-explanation-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <span>{t('scoreExplanation.scoreAnalysisTitle', { name: client.name })}</span>
            <Badge variant="outline" data-testid="client-id-badge">
              {client.clientId}
            </Badge>
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue={scoreType || 'risk'} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="risk" data-testid="tab-risk-score">{t('scoreExplanation.riskScoreAnalysisTab')}</TabsTrigger>
            <TabsTrigger value="urgency" data-testid="tab-urgency-score">{t('scoreExplanation.urgencyScoreAnalysisTab')}</TabsTrigger>
          </TabsList>

          <TabsContent value="risk" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{t('scoreExplanation.riskScoreBreakdown')}</span>
                  <span className={`text-3xl font-bold ${getScoreColor(client.riskScore)}`} data-testid="risk-score-display">
                    {client.riskScore.toFixed(1)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <Progress 
                    value={client.riskScore} 
                    className="h-4"
                    data-testid="risk-score-progress"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>{t('scoreExplanation.lowRisk')}</span>
                    <span>{t('scoreExplanation.highRisk')}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-foreground mb-3">{t('scoreExplanation.riskFactorsContributing')}</h4>
                  
                  {Object.entries(riskComponents).map(([key, component]) => (
                    <div key={key} className="border border-border rounded-lg p-4" data-testid={`risk-component-${key}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {component.icon}
                          <span className="font-medium">{component.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {t('scoreExplanation.weightPercentage', { weight: component.weight })}
                          </Badge>
                        </div>
                        <span className="font-bold text-sm" data-testid={`score-${key}`}>
                          {component.score.toFixed(1)}/25
                        </span>
                      </div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-sm text-muted-foreground mb-1">
                          <span>{t('scoreExplanation.currentValue', { value: component.value })}</span>
                          <span>{t('scoreExplanation.threshold', { threshold: component.maxThreshold })}</span>
                        </div>
                        <Progress 
                          value={(component.value / component.maxThreshold) * 100} 
                          className="h-2"
                          data-testid={`progress-${key}`}
                        />
                      </div>
                      
                      <p className="text-sm text-muted-foreground">{component.description}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h5 className="font-semibold mb-2 flex items-center">
                    <AlertTriangle className="w-4 h-4 me-2" />
                    {t('scoreExplanation.howRiskScoreCalculated')}
                  </h5>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t('scoreExplanation.riskScoreExplanation')}
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 ms-4">
                    <li>• {t('scoreExplanation.riskFactorLateDays')}</li>
                    <li>• {t('scoreExplanation.riskFactorOutstandingPAR')}</li>
                    <li>• {t('scoreExplanation.riskFactorRescheduling')}</li>
                    <li>• {t('scoreExplanation.riskFactorConsistency')}</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="urgency" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{t('scoreExplanation.urgencyScoreBreakdown')}</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl font-bold text-foreground" data-testid="urgency-score-display">
                      {totalContribution.toFixed(1)}
                    </span>
                    <Badge variant={getUrgencyColor(totalContribution >= 60 ? "Extremely Urgent" : totalContribution >= 40 ? "Urgent" : totalContribution >= 20 ? "Moderately Urgent" : "Low Urgency")} data-testid="urgency-classification-badge">
                      {totalContribution >= 60 ? t('scoreExplanation.extremelyUrgent') : totalContribution >= 40 ? t('scoreExplanation.urgent') : totalContribution >= 20 ? t('scoreExplanation.moderatelyUrgent') : t('scoreExplanation.lowUrgency')}
                    </Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-6">
                  <Progress 
                    value={totalContribution} 
                    className="h-4"
                    data-testid="urgency-score-progress"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-2">
                    <span>{t('scoreExplanation.lowUrgency')}</span>
                    <span>{t('scoreExplanation.highUrgency')}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-semibold text-foreground mb-3">{t('scoreExplanation.urgencyFactorsContributing')}</h4>
                  
                  {Object.entries(urgencyComponents).map(([key, component]) => (
                    <div key={key} className="border border-border rounded-lg p-4" data-testid={`urgency-component-${key}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          {component.icon}
                          <span className="font-medium">{component.label}</span>
                          <Badge variant="outline" className="text-xs">
                            {t('scoreExplanation.weightPercentage', { weight: component.normalizedWeight.toFixed(1) })}
                          </Badge>
                        </div>
                        <span className="font-bold text-sm" data-testid={`urgency-contribution-${key}`}>
                          {t('scoreExplanation.contributionFrom', { contribution: component.contribution.toFixed(1), scaled: component.scaledValue.toFixed(1) })}
                        </span>
                      </div>
                      
                      <div className="mb-2">
                        <div className="flex justify-between text-sm text-muted-foreground mb-1">
                          <span>{t('scoreExplanation.rawValueScaled', { raw: component.value, scaled: component.scaledValue.toFixed(1) })}</span>
                          <span>{t('scoreExplanation.weightNormalized', { weight: component.normalizedWeight.toFixed(1) })}</span>
                        </div>
                        <Progress 
                          value={component.scaledValue} 
                          className="h-2"
                          data-testid={`urgency-progress-${key}`}
                        />
                      </div>
                      
                      <p className="text-sm text-muted-foreground">{component.description}</p>
                    </div>
                  ))}
                </div>


                <div className="mt-6 p-4 bg-muted/50 rounded-lg">
                  <h5 className="font-semibold mb-2 flex items-center">
                    <Clock className="w-4 h-4 me-2" />
                    {t('scoreExplanation.howUrgencyScoreCalculated')}
                  </h5>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t('scoreExplanation.urgencyScoreExplanation')}
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1 ms-4">
                    <li>• {t('scoreExplanation.urgencyFactorRiskScore')}</li>
                    <li>• {t('scoreExplanation.urgencyFactorDays')}</li>
                    <li>• {t('scoreExplanation.urgencyFactorFeedback')}</li>
                    <li className="text-xs italic mt-2">{t('scoreExplanation.weightsNormalized')}</li>
                  </ul>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 bg-purple-100 dark:bg-purple-900/20 rounded">
                      <span className="font-medium text-purple-800 dark:text-purple-400">{t('scoreExplanation.extremelyUrgent')}:</span> {t('scoreExplanation.score60Plus')}
                    </div>
                    <div className="p-2 bg-indigo-100 dark:bg-indigo-900/20 rounded">
                      <span className="font-medium text-indigo-800 dark:text-indigo-400">{t('scoreExplanation.urgent')}:</span> {t('scoreExplanation.score40to59')}
                    </div>
                    <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded">
                      <span className="font-medium text-blue-800 dark:text-blue-400">{t('scoreExplanation.moderatelyUrgent')}:</span> {t('scoreExplanation.score20to39')}
                    </div>
                    <div className="p-2 bg-green-100 dark:bg-green-900/20 rounded">
                      <span className="font-medium text-green-800 dark:text-green-400">{t('scoreExplanation.lowUrgency')}:</span> {t('scoreExplanation.scoreUnder20')}
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