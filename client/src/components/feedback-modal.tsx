import { useState } from "react";
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { Client } from "@shared/schema";

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
  onUpdate: () => void;
  interactionType?: 'visit' | 'phone_call';
  onSingleClientRecalculate?: (clientId: string, updatedData: Partial<Client>) => Promise<void>;
}

export function FeedbackModal({ isOpen, onClose, client, onUpdate, interactionType = 'visit', onSingleClientRecalculate }: FeedbackModalProps) {
  const { t } = useTranslation();
  const [interactionDate, setInteractionDate] = useState(new Date().toISOString().split('T')[0]);
  const [feedbackScore, setFeedbackScore] = useState("3");
  // Detailed feedback state
  const [paymentWillingness, setPaymentWillingness] = useState("3");
  const [financialSituation, setFinancialSituation] = useState("3");
  const [communicationQuality, setCommunicationQuality] = useState("3");
  const [complianceCooperation, setComplianceCooperation] = useState("3");
  const [futureOutlook, setFutureOutlook] = useState("3");
  const [visitNotes, setVisitNotes] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateFeedbackMutation = useMutation({
    mutationFn: async (data: { 
      clientId: string; 
      lastVisitDate?: string;
      lastPhoneCallDate?: string; 
      feedbackScore: number;
      paymentWillingness?: number;
      financialSituation?: number;
      communicationQuality?: number;
      complianceCooperation?: number;
      futureOutlook?: number;
      visitNotes?: string;
    }) => {
      return apiRequest('POST', '/api/clients/feedback', data);
    },
    onSuccess: async (_, variables) => {
      // Trigger automatic client-side recalculation when feedback changes
      if (onSingleClientRecalculate && client) {
        const updatedData: Partial<Client> = {
          feedbackScore: variables.feedbackScore,
          paymentWillingness: variables.paymentWillingness,
          financialSituation: variables.financialSituation,
          communicationQuality: variables.communicationQuality,
          complianceCooperation: variables.complianceCooperation,
          futureOutlook: variables.futureOutlook,
          lastVisitDate: interactionType === 'visit' ? new Date(variables.lastVisitDate!) : client.lastVisitDate,
          lastPhoneCallDate: interactionType === 'phone_call' ? new Date(variables.lastPhoneCallDate!) : client.lastPhoneCallDate,
        };
        
        await onSingleClientRecalculate(client.id, updatedData);
      }
      
      toast({
        title: t(`feedbackModal.${interactionType === 'visit' ? 'visitUpdated' : 'phoneCallUpdated'}`),
        description: t(`feedbackModal.${interactionType === 'visit' ? 'visitUpdatedSuccess' : 'phoneCallUpdatedSuccess'}`),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      onUpdate();
      onClose();
      resetForm();
    },
    onError: () => {
      toast({
        title: t('feedbackModal.updateFailed'),
        description: t(`feedbackModal.${interactionType === 'visit' ? 'visitUpdateFailed' : 'phoneCallUpdateFailed'}`),
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setInteractionDate(new Date().toISOString().split('T')[0]);
    setFeedbackScore("3");
    setPaymentWillingness("3");
    setFinancialSituation("3");
    setCommunicationQuality("3");
    setComplianceCooperation("3");
    setFutureOutlook("3");
    setVisitNotes("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!client) return;

    // Calculate composite score from detailed feedback
    const compositeScore = Math.round(
      (parseInt(paymentWillingness) * 0.30 +
       parseInt(financialSituation) * 0.25 +
       parseInt(communicationQuality) * 0.15 +
       parseInt(complianceCooperation) * 0.20 +
       parseInt(futureOutlook) * 0.10)
    );
    
    const feedbackData: any = {
      clientId: client.clientId,
      feedbackScore: compositeScore,
      paymentWillingness: parseInt(paymentWillingness),
      financialSituation: parseInt(financialSituation),
      communicationQuality: parseInt(communicationQuality),
      complianceCooperation: parseInt(complianceCooperation),
      futureOutlook: parseInt(futureOutlook),
      visitNotes: visitNotes.trim() || undefined,
    };

    // Set the appropriate date field based on interaction type
    if (interactionType === 'visit') {
      feedbackData.lastVisitDate = interactionDate;
    } else {
      feedbackData.lastPhoneCallDate = interactionDate;
    }

    updateFeedbackMutation.mutate(feedbackData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="feedback-modal">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">{t(`feedbackModal.${interactionType === 'visit' ? 'updateVisitResults' : 'updatePhoneCallResults'}`)}</DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="feedback-form">
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2">{t('client.name')}</Label>
            <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md" data-testid="selected-client">
              {client ? `${client.name} (${client.clientId})` : t('feedbackModal.noClientSelected')}
            </div>
          </div>
          
          <div>
            <Label htmlFor="interactionDate" className="block text-sm font-medium text-foreground mb-2">
              {t(`feedbackModal.${interactionType === 'visit' ? 'visitDate' : 'phoneCallDate'}`)}
            </Label>
            <Input
              type="date"
              id="interactionDate"
              value={interactionDate}
              onChange={(e) => setInteractionDate(e.target.value)}
              className="w-full"
              required
              data-testid="input-interaction-date"
            />
          </div>
          
          {/* Payment Willingness Assessment */}
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.paymentWillingnessLabel')}
            </Label>
            <Select value={paymentWillingness} onValueChange={setPaymentWillingness}>
              <SelectTrigger data-testid="payment-willingness-select">
                <SelectValue placeholder={t('feedbackModal.selectPaymentWillingness')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('feedbackModal.paymentWillingness1')}</SelectItem>
                <SelectItem value="2">{t('feedbackModal.paymentWillingness2')}</SelectItem>
                <SelectItem value="3">{t('feedbackModal.paymentWillingness3')}</SelectItem>
                <SelectItem value="4">{t('feedbackModal.paymentWillingness4')}</SelectItem>
                <SelectItem value="5">{t('feedbackModal.paymentWillingness5')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Financial Situation Assessment */}
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.financialSituationLabel')}
            </Label>
            <Select value={financialSituation} onValueChange={setFinancialSituation}>
              <SelectTrigger data-testid="financial-situation-select">
                <SelectValue placeholder={t('feedbackModal.selectFinancialSituation')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('feedbackModal.financialSituation1')}</SelectItem>
                <SelectItem value="2">{t('feedbackModal.financialSituation2')}</SelectItem>
                <SelectItem value="3">{t('feedbackModal.financialSituation3')}</SelectItem>
                <SelectItem value="4">{t('feedbackModal.financialSituation4')}</SelectItem>
                <SelectItem value="5">{t('feedbackModal.financialSituation5')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Communication Quality Assessment */}
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.communicationQualityLabel')}
            </Label>
            <Select value={communicationQuality} onValueChange={setCommunicationQuality}>
              <SelectTrigger data-testid="communication-quality-select">
                <SelectValue placeholder={t('feedbackModal.selectCommunicationQuality')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('feedbackModal.communicationQuality1')}</SelectItem>
                <SelectItem value="2">{t('feedbackModal.communicationQuality2')}</SelectItem>
                <SelectItem value="3">{t('feedbackModal.communicationQuality3')}</SelectItem>
                <SelectItem value="4">{t('feedbackModal.communicationQuality4')}</SelectItem>
                <SelectItem value="5">{t('feedbackModal.communicationQuality5')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Compliance & Cooperation Assessment */}
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.complianceCooperationLabel')}
            </Label>
            <Select value={complianceCooperation} onValueChange={setComplianceCooperation}>
              <SelectTrigger data-testid="compliance-cooperation-select">
                <SelectValue placeholder={t('feedbackModal.selectComplianceLevel')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('feedbackModal.complianceCooperation1')}</SelectItem>
                <SelectItem value="2">{t('feedbackModal.complianceCooperation2')}</SelectItem>
                <SelectItem value="3">{t('feedbackModal.complianceCooperation3')}</SelectItem>
                <SelectItem value="4">{t('feedbackModal.complianceCooperation4')}</SelectItem>
                <SelectItem value="5">{t('feedbackModal.complianceCooperation5')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Future Payment Outlook Assessment */}
          <div>
            <Label className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.futureOutlookLabel')}
            </Label>
            <Select value={futureOutlook} onValueChange={setFutureOutlook}>
              <SelectTrigger data-testid="future-outlook-select">
                <SelectValue placeholder={t('feedbackModal.selectFutureOutlook')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t('feedbackModal.futureOutlook1')}</SelectItem>
                <SelectItem value="2">{t('feedbackModal.futureOutlook2')}</SelectItem>
                <SelectItem value="3">{t('feedbackModal.futureOutlook3')}</SelectItem>
                <SelectItem value="4">{t('feedbackModal.futureOutlook4')}</SelectItem>
                <SelectItem value="5">{t('feedbackModal.futureOutlook5')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Visit Notes */}
          <div>
            <Label htmlFor="visitNotes" className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.visitNotesLabel')}
            </Label>
            <Textarea
              id="visitNotes"
              placeholder={t('feedbackModal.visitNotesPlaceholder')}
              value={visitNotes}
              onChange={(e) => setVisitNotes(e.target.value)}
              className="w-full min-h-[80px]"
              data-testid="visit-notes-textarea"
            />
          </div>

          {/* Calculated Score Display */}
          <div className="bg-muted/30 p-3 rounded-md">
            <Label className="block text-sm font-medium text-foreground mb-2">
              {t('feedbackModal.calculatedCompositeScore')}
            </Label>
            <div className="text-lg font-semibold text-foreground">
              {Math.round(
                (parseInt(paymentWillingness) * 0.30 +
                 parseInt(financialSituation) * 0.25 +
                 parseInt(communicationQuality) * 0.15 +
                 parseInt(complianceCooperation) * 0.20 +
                 parseInt(futureOutlook) * 0.10)
              )}/5
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {t('feedbackModal.scoreUsedForUrgency')}
            </div>
          </div>
          
          <div className="pt-4 flex gap-3">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
              data-testid="button-cancel"
            >
              <i className="fas fa-times me-2"></i>
              {t('common.cancel')}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={updateFeedbackMutation.isPending}
              data-testid="button-update"
            >
              <i className="fas fa-check me-2"></i>
              {updateFeedbackMutation.isPending ? t('feedbackModal.updating') : t('feedbackModal.updateVisit')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
