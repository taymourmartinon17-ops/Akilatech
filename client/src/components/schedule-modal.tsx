import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";
import { useTranslation } from "react-i18next";
import type { Client } from "@shared/schema";

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScheduled: () => void;
  type: "visit" | "phone_call";
  preSelectedClientId?: string;
  preSelectedClientName?: string;
}

export function ScheduleModal({ isOpen, onClose, onScheduled, type, preSelectedClientId, preSelectedClientName }: ScheduleModalProps) {
  const [selectedClientId, setSelectedClientId] = useState(preSelectedClientId || "");
  const [visitDate, setVisitDate] = useState(new Date().toISOString().split('T')[0]);
  const [visitTime, setVisitTime] = useState("09:00");
  const [callType, setCallType] = useState("follow_up");
  const [estimatedDuration, setEstimatedDuration] = useState("15");
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Set pre-selected client when props change
  useEffect(() => {
    if (preSelectedClientId) {
      setSelectedClientId(preSelectedClientId);
    }
  }, [preSelectedClientId]);

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId && isOpen,
  });

  const scheduleInteractionMutation = useMutation({
    mutationFn: async (data: any) => {
      const endpoint = type === "visit" ? '/api/visits' : '/api/phone-calls';
      return apiRequest('POST', endpoint, data);
    },
    onSuccess: () => {
      const actionText = type === "visit" ? "Visit" : "Phone Call";
      toast({
        title: `${actionText} Scheduled`,
        description: `${actionText} scheduled successfully!`,
      });
      const queryKey = type === "visit" ? ['/api/visits'] : ['/api/phone-calls'];
      queryClient.invalidateQueries({ queryKey });
      onScheduled();
      onClose();
      resetForm();
    },
    onError: () => {
      const actionText = type === "visit" ? "visit" : "phone call";
      toast({
        title: "Scheduling Failed",
        description: `Failed to schedule ${actionText}. Please try again.`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setSelectedClientId("");
    setVisitDate(new Date().toISOString().split('T')[0]);
    setVisitTime("09:00");
    setCallType("follow_up");
    setEstimatedDuration("15");
    setOpen(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.loanOfficerId || !selectedClientId) return;

    const scheduledDateTime = new Date(`${visitDate}T${visitTime}`);

    const baseData = {
      clientId: selectedClientId,
      loanOfficerId: user.loanOfficerId,
      scheduledDate: scheduledDateTime.toISOString(),
      scheduledTime: visitTime,
    };

    const data = type === "phone_call" 
      ? { ...baseData, callType, estimatedDuration: parseInt(estimatedDuration) }
      : baseData;

    scheduleInteractionMutation.mutate(data);
  };

  const { t } = useTranslation();
  
  const getUrgencyDisplay = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent":
        return `🔴 ${t('urgency.extremelyUrgent')}`;
      case "Urgent":
        return `🟠 ${t('urgency.urgent')}`;
      case "Moderately Urgent":
        return `🟡 ${t('urgency.moderatelyUrgent')}`;
      case "Low Urgency":
        return `🟢 ${t('urgency.lowUrgency')}`;
      default:
        return urgency;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" data-testid="schedule-modal">
        <DialogHeader>
          <DialogTitle data-testid="modal-title">
            {type === "visit" ? t('calendar.scheduleClientVisit') : t('calendar.schedulePhoneCallTitle')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4" data-testid="schedule-form">
          <div>
            <Label htmlFor="selectClient" className="block text-sm font-medium text-foreground mb-2">
              {t('calendar.selectClient')}
            </Label>
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={open}
                  className="w-full justify-between"
                  data-testid="select-client"
                >
                  {selectedClientId
                    ? clients.find((client) => client.clientId === selectedClientId)?.name +
                      " (" + getUrgencyDisplay(clients.find((client) => client.clientId === selectedClientId)?.urgencyClassification || "") + ")"
                    : t('calendar.chooseClient')}
                  <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0" data-testid="client-search-popover">
                <Command>
                  <CommandInput 
                    placeholder={t('calendar.searchClientsPlaceholder')}
                    data-testid="input-client-search"
                  />
                  <CommandList>
                    <CommandEmpty>{t('calendar.noClientFound')}</CommandEmpty>
                    <CommandGroup>
                      {clients.map((client) => (
                        <CommandItem
                          key={client.id}
                          value={`${client.name} ${client.clientId}`}
                          onSelect={() => {
                            setSelectedClientId(client.clientId);
                            setOpen(false);
                          }}
                          data-testid={`option-client-${client.clientId}`}
                        >
                          <Check
                            className={`me-2 h-4 w-4 ${
                              selectedClientId === client.clientId ? "opacity-100" : "opacity-0"
                            }`}
                          />
                          <div className="flex flex-col">
                            <span className="font-medium">{client.name}</span>
                            <span className="text-sm text-muted-foreground">
                              ID: {client.clientId} • {getUrgencyDisplay(client.urgencyClassification)}
                            </span>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          
          <div>
            <Label htmlFor="scheduleDate" className="block text-sm font-medium text-foreground mb-2">
              {type === "visit" ? t('calendar.visitDate') : t('calendar.callDate')}
            </Label>
            <Input
              type="date"
              id="scheduleDate"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full"
              required
              data-testid="input-date"
            />
          </div>
          
          <div>
            <Label htmlFor="scheduleTime" className="block text-sm font-medium text-foreground mb-2">
              {type === "visit" ? t('calendar.visitTime') : t('calendar.callTime')}
            </Label>
            <Input
              type="time"
              id="scheduleTime"
              value={visitTime}
              onChange={(e) => setVisitTime(e.target.value)}
              className="w-full"
              required
              data-testid="input-time"
            />
          </div>

          {type === "phone_call" && (
            <>
              <div>
                <Label htmlFor="callType" className="block text-sm font-medium text-foreground mb-2">
                  {t('calendar.callType')}
                </Label>
                <Select value={callType} onValueChange={setCallType}>
                  <SelectTrigger data-testid="select-call-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="follow_up" data-testid="option-follow-up">{t('calendar.followUp')}</SelectItem>
                    <SelectItem value="reminder" data-testid="option-reminder">{t('calendar.paymentReminder')}</SelectItem>
                    <SelectItem value="check_in" data-testid="option-check-in">{t('calendar.checkIn')}</SelectItem>
                    <SelectItem value="emergency" data-testid="option-emergency">{t('calendar.emergency')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="estimatedDuration" className="block text-sm font-medium text-foreground mb-2">
                  {t('calendar.estimatedDuration')}
                </Label>
                <Select value={estimatedDuration} onValueChange={setEstimatedDuration}>
                  <SelectTrigger data-testid="select-duration">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5" data-testid="option-5min">5 {t('calendar.minutes')}</SelectItem>
                    <SelectItem value="10" data-testid="option-10min">10 {t('calendar.minutes')}</SelectItem>
                    <SelectItem value="15" data-testid="option-15min">15 {t('calendar.minutes')}</SelectItem>
                    <SelectItem value="20" data-testid="option-20min">20 {t('calendar.minutes')}</SelectItem>
                    <SelectItem value="30" data-testid="option-30min">30 {t('calendar.minutes')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
          
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
              disabled={scheduleInteractionMutation.isPending || !selectedClientId}
              data-testid="button-schedule"
            >
              <i className={`fas ${type === "visit" ? "fa-calendar-plus" : "fa-phone"} me-2`}></i>
              {scheduleInteractionMutation.isPending 
                ? t('calendar.scheduling')
                : type === "visit" ? t('calendar.scheduleVisitButton') : t('calendar.scheduleCallButton')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
