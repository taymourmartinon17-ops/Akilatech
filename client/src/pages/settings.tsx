import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Settings, User, Cog, BarChart3, Clock, Heart, ArrowLeft, Camera } from "lucide-react";
import { useLocation } from "wouter";
import { ProgressModal } from "@/components/progress-modal";
import { useWeightBroadcast } from "@/hooks/use-client-calculation";
import { useTranslation } from 'react-i18next';
import { useAuth } from "@/lib/auth";

interface WeightSettings {
  // Risk Score Component Weights (should total 100)
  riskLateDaysWeight: number;
  riskOutstandingAtRiskWeight: number;
  riskParPerLoanWeight: number;
  riskReschedulesWeight: number;
  riskPaymentConsistencyWeight: number;
  riskDelayedInstalmentsWeight: number;
  
  // Urgency Score Component Weights (should total 100)
  urgencyRiskScoreWeight: number;
  urgencyDaysSinceVisitWeight: number;
  urgencyFeedbackScoreWeight: number;
  
  // Feedback Score Component Weights (should total 100)
  feedbackPaymentWillingnessWeight: number;
  feedbackFinancialSituationWeight: number;
  feedbackCommunicationQualityWeight: number;
  feedbackComplianceCooperationWeight: number;
  feedbackFutureOutlookWeight: number;
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [showProgressModal, setShowProgressModal] = useState(false);
  const { broadcastWeightUpdate } = useWeightBroadcast();
  const { user } = useAuth();
  
  usePageTracking({ pageName: "Settings", pageRoute: "/settings" });
  
  const [weights, setWeights] = useState<WeightSettings>({
    // Default Risk Score weights
    riskLateDaysWeight: 25,
    riskOutstandingAtRiskWeight: 20,
    riskParPerLoanWeight: 20,
    riskReschedulesWeight: 15,
    riskPaymentConsistencyWeight: 10,
    riskDelayedInstalmentsWeight: 10,
    
    // Default Urgency Score weights
    urgencyRiskScoreWeight: 50,
    urgencyDaysSinceVisitWeight: 40,
    urgencyFeedbackScoreWeight: 10,
    
    // Default Feedback Score weights
    feedbackPaymentWillingnessWeight: 30,
    feedbackFinancialSituationWeight: 25,
    feedbackCommunicationQualityWeight: 15,
    feedbackComplianceCooperationWeight: 20,
    feedbackFutureOutlookWeight: 10,
  });

  // Fetch current global settings
  const { data: settings, isLoading } = useQuery<WeightSettings>({
    queryKey: ['/api/settings'],
  });

  // Update weights when settings are loaded
  useEffect(() => {
    if (settings && typeof settings === 'object' && Object.keys(settings).length > 0) {
      setWeights({
        riskLateDaysWeight: settings.riskLateDaysWeight ?? 25,
        riskOutstandingAtRiskWeight: settings.riskOutstandingAtRiskWeight ?? 20,
        riskParPerLoanWeight: settings.riskParPerLoanWeight ?? 20,
        riskReschedulesWeight: settings.riskReschedulesWeight ?? 15,
        riskPaymentConsistencyWeight: settings.riskPaymentConsistencyWeight ?? 10,
        riskDelayedInstalmentsWeight: settings.riskDelayedInstalmentsWeight ?? 10,
        
        urgencyRiskScoreWeight: settings.urgencyRiskScoreWeight ?? 50,
        urgencyDaysSinceVisitWeight: settings.urgencyDaysSinceVisitWeight ?? 40,
        urgencyFeedbackScoreWeight: settings.urgencyFeedbackScoreWeight ?? 10,
        
        feedbackPaymentWillingnessWeight: settings.feedbackPaymentWillingnessWeight ?? 30,
        feedbackFinancialSituationWeight: settings.feedbackFinancialSituationWeight ?? 25,
        feedbackCommunicationQualityWeight: settings.feedbackCommunicationQualityWeight ?? 15,
        feedbackComplianceCooperationWeight: settings.feedbackComplianceCooperationWeight ?? 20,
        feedbackFutureOutlookWeight: settings.feedbackFutureOutlookWeight ?? 10,
      });
    }
  }, [settings]);

  // Save global settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (updatedWeights: WeightSettings) => {
      const res = await apiRequest("PUT", "/api/settings", updatedWeights);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to save settings: ${res.status} - ${errorText}`);
      }
      // Check if response has content before parsing as JSON
      const text = await res.text();
      try {
        return text ? JSON.parse(text) : {};
      } catch (error) {
        console.warn('Response is not valid JSON:', text);
        return {};
      }
    },
    onSuccess: () => {
      // The server will now handle broadcasting via WebSocket
      // No need for manual broadcasting since the server does it automatically
      
      // Invalidate all settings queries to ensure all components get updated weights
      queryClient.invalidateQueries({ 
        queryKey: ['/api/settings']
      });
      
      toast({
        title: t('settings.settingsSaved'),
        description: t('settings.settingsSavedDesc'),
      });
    },
    onError: (error: Error) => {
      toast({
        title: t('settings.saveFailed'),
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Create portfolio snapshot mutation (Admin only)
  const createSnapshotMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/portfolio/snapshots", {});
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create snapshot: ${res.status} - ${errorText}`);
      }
      return res.json();
    },
    onSuccess: () => {
      // Invalidate all snapshot queries (prefix match will catch all scoped queries)
      queryClient.invalidateQueries({ 
        queryKey: ['/api/portfolio/snapshots']
      });
      // Also invalidate the current user's specific snapshot query
      if (user?.loanOfficerId) {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/portfolio/snapshots', user.loanOfficerId]
        });
      }
      toast({
        title: "Snapshot Created",
        description: "Performance snapshot has been successfully captured for historical tracking.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Snapshot Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calculate totals for validation
  const riskTotal = weights.riskLateDaysWeight + weights.riskOutstandingAtRiskWeight + 
                   weights.riskParPerLoanWeight + weights.riskReschedulesWeight + 
                   weights.riskPaymentConsistencyWeight + weights.riskDelayedInstalmentsWeight;
  
  const urgencyTotal = weights.urgencyRiskScoreWeight + weights.urgencyDaysSinceVisitWeight + 
                      weights.urgencyFeedbackScoreWeight;
  
  const feedbackTotal = weights.feedbackPaymentWillingnessWeight + weights.feedbackFinancialSituationWeight + 
                       weights.feedbackCommunicationQualityWeight + weights.feedbackComplianceCooperationWeight + 
                       weights.feedbackFutureOutlookWeight;

  // Reset to defaults
  const resetToDefaults = () => {
    setWeights({
      riskLateDaysWeight: 25,
      riskOutstandingAtRiskWeight: 20,
      riskParPerLoanWeight: 20,
      riskReschedulesWeight: 15,
      riskPaymentConsistencyWeight: 10,
      riskDelayedInstalmentsWeight: 10,
      
      urgencyRiskScoreWeight: 50,
      urgencyDaysSinceVisitWeight: 40,
      urgencyFeedbackScoreWeight: 10,
      
      feedbackPaymentWillingnessWeight: 30,
      feedbackFinancialSituationWeight: 25,
      feedbackCommunicationQualityWeight: 15,
      feedbackComplianceCooperationWeight: 20,
      feedbackFutureOutlookWeight: 10,
    });
  };

  // Handle slider change
  const handleSliderChange = (field: keyof WeightSettings) => (value: number[]) => {
    setWeights(prev => ({ ...prev, [field]: value[0] }));
  };

  // Handle input change
  const handleInputChange = (field: keyof WeightSettings) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(0, Math.min(100, Number(e.target.value) || 0));
    setWeights(prev => ({ ...prev, [field]: value }));
  };

  // Save weights
  const handleSave = () => {
    saveSettingsMutation.mutate(weights);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Settings className="h-8 w-8 animate-spin text-border" />
      </div>
    );
  }

  const isValidToSave = Math.abs(riskTotal - 100) < 0.01 && 
                       Math.abs(urgencyTotal - 100) < 0.01 && 
                       Math.abs(feedbackTotal - 100) < 0.01;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 via-cyan-50 to-blue-50 dark:from-teal-950/20 dark:via-cyan-950/20 dark:to-blue-950/20">
      <div className="container mx-auto p-6 space-y-6">
        {/* Header with back navigation */}
        <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost" 
          size="sm"
          onClick={() => navigate('/')}
          className="flex items-center gap-2"
          data-testid="back-to-dashboard"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('settings.backToDashboard')}
        </Button>
        <div className="h-6 w-px bg-border" />
        <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-muted-foreground mt-2">
            {t('settings.customizeWeights')}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={resetToDefaults}
            data-testid="reset-defaults-button"
          >
            {t('settings.resetToDefaults')}
          </Button>
          <Button 
            onClick={handleSave}
            disabled={!isValidToSave || saveSettingsMutation.isPending}
            data-testid="save-settings-button"
          >
            {saveSettingsMutation.isPending ? t('settings.saving') : t('settings.saveSettings')}
          </Button>
        </div>
      </div>

      {/* Risk Score Weights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-red-500" />
            {t('settings.riskScoreComponentWeights')}
            <span className={`ms-auto text-sm ${Math.abs(riskTotal - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {t('settings.total')}: {riskTotal.toFixed(1)}%
            </span>
          </CardTitle>
          <CardDescription>
            {t('settings.adjustRiskFactors')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[
            { key: 'riskLateDaysWeight', label: t('settings.lateDays'), description: t('settings.lateDaysDesc') },
            { key: 'riskOutstandingAtRiskWeight', label: t('settings.outstandingAtRisk'), description: t('settings.outstandingAtRiskDesc') },
            { key: 'riskParPerLoanWeight', label: t('settings.parPerLoan'), description: t('settings.parPerLoanDesc') },
            { key: 'riskReschedulesWeight', label: t('settings.reschedules'), description: t('settings.reschedulesDesc') },
            { key: 'riskPaymentConsistencyWeight', label: t('settings.paymentConsistency'), description: t('settings.paymentConsistencyDesc') },
            { key: 'riskDelayedInstalmentsWeight', label: t('settings.delayedInstalments'), description: t('settings.delayedInstalmentsDesc') },
          ].map(({ key, label, description }) => (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <Label className="font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={weights[key as keyof WeightSettings]}
                    onChange={handleInputChange(key as keyof WeightSettings)}
                    className="w-20 text-end"
                    data-testid={`input-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[weights[key as keyof WeightSettings]]}
                onValueChange={handleSliderChange(key as keyof WeightSettings)}
                max={100}
                step={0.1}
                className="w-full"
                data-testid={`slider-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Urgency Score Weights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-orange-500" />
            {t('settings.urgencyScoreComponentWeights')}
            <span className={`ms-auto text-sm ${Math.abs(urgencyTotal - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {t('settings.total')}: {urgencyTotal.toFixed(1)}%
            </span>
          </CardTitle>
          <CardDescription>
            {t('settings.configureUrgency')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[
            { key: 'urgencyRiskScoreWeight', label: t('settings.riskScore'), description: t('settings.riskScoreDesc') },
            { key: 'urgencyDaysSinceVisitWeight', label: t('settings.daysSinceLastInteraction'), description: t('settings.daysSinceLastInteractionDesc') },
            { key: 'urgencyFeedbackScoreWeight', label: t('settings.feedbackScore'), description: t('settings.feedbackScoreDesc') },
          ].map(({ key, label, description }) => (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <Label className="font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={weights[key as keyof WeightSettings]}
                    onChange={handleInputChange(key as keyof WeightSettings)}
                    className="w-20 text-end"
                    data-testid={`input-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[weights[key as keyof WeightSettings]]}
                onValueChange={handleSliderChange(key as keyof WeightSettings)}
                max={100}
                step={0.1}
                className="w-full"
                data-testid={`slider-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Feedback Score Weights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-purple-500" />
            {t('settings.feedbackScoreComponentWeights')}
            <span className={`ms-auto text-sm ${Math.abs(feedbackTotal - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
              {t('settings.total')}: {feedbackTotal.toFixed(1)}%
            </span>
          </CardTitle>
          <CardDescription>
            {t('settings.adjustFeedbackCategories')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {[
            { key: 'feedbackPaymentWillingnessWeight', label: t('settings.paymentWillingness'), description: t('settings.paymentWillingnessDesc') },
            { key: 'feedbackFinancialSituationWeight', label: t('settings.financialSituation'), description: t('settings.financialSituationDesc') },
            { key: 'feedbackCommunicationQualityWeight', label: t('settings.communicationQuality'), description: t('settings.communicationQualityDesc') },
            { key: 'feedbackComplianceCooperationWeight', label: t('settings.complianceCooperation'), description: t('settings.complianceCooperationDesc') },
            { key: 'feedbackFutureOutlookWeight', label: t('settings.futurePaymentOutlook'), description: t('settings.futurePaymentOutlookDesc') },
          ].map(({ key, label, description }) => (
            <div key={key} className="space-y-2">
              <div className="flex justify-between items-center">
                <div>
                  <Label className="font-medium">{label}</Label>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={weights[key as keyof WeightSettings]}
                    onChange={handleInputChange(key as keyof WeightSettings)}
                    className="w-20 text-end"
                    data-testid={`input-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              </div>
              <Slider
                value={[weights[key as keyof WeightSettings]]}
                onValueChange={handleSliderChange(key as keyof WeightSettings)}
                max={100}
                step={0.1}
                className="w-full"
                data-testid={`slider-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Performance Snapshots (Admin Only) */}
      {user?.isAdmin && (
        <Card className="border-2 border-teal-200 dark:border-teal-800 bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-950/30 dark:to-cyan-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Performance Snapshots
            </CardTitle>
            <CardDescription>
              Capture monthly portfolio performance metrics for historical tracking and trend analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 p-4">
                <h4 className="font-semibold text-sm mb-2">What gets captured:</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• Total clients and outstanding portfolio value</li>
                  <li>• Average risk score and high-risk client count</li>
                  <li>• Visit completion rates and activity metrics</li>
                  <li>• Monthly performance trends</li>
                </ul>
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <p className="text-sm text-muted-foreground">
                  Create a snapshot to track your current portfolio state
                </p>
                <Button
                  onClick={() => createSnapshotMutation.mutate()}
                  disabled={createSnapshotMutation.isPending}
                  className="bg-teal-600 hover:bg-teal-700 dark:bg-teal-700 dark:hover:bg-teal-600"
                  data-testid="create-snapshot-button"
                >
                  {createSnapshotMutation.isPending ? (
                    <>
                      <Settings className="h-4 w-4 me-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 me-2" />
                      Create Snapshot
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Summary */}
      <Card className={`border-2 ${isValidToSave ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold">{t('settings.configurationStatus')}</h3>
              <p className="text-sm text-muted-foreground">
                {isValidToSave 
                  ? t('settings.allWeightsValid')
                  : t('settings.weightsInvalid')
                }
              </p>
            </div>
            <div className="text-end space-y-1">
              <div className={`text-sm ${Math.abs(riskTotal - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {t('settings.risk')}: {riskTotal.toFixed(1)}%
              </div>
              <div className={`text-sm ${Math.abs(urgencyTotal - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {t('settings.urgency')}: {urgencyTotal.toFixed(1)}%
              </div>
              <div className={`text-sm ${Math.abs(feedbackTotal - 100) < 0.01 ? 'text-green-600' : 'text-red-600'}`}>
                {t('settings.feedback')}: {feedbackTotal.toFixed(1)}%
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Progress Modal */}
      <ProgressModal 
        isOpen={showProgressModal} 
        onClose={() => setShowProgressModal(false)} 
      />
      </div>
    </div>
  );
}