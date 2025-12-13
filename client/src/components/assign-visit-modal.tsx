import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Calendar as CalendarIcon, Clock, Phone, MapPin, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";

interface Client {
  id: string;
  clientId: string;
  clientName: string;
  loanOfficerId: string;
  aiRecommendation?: 'visit' | 'call' | 'none';
  aiRecommendationReason?: string;
  riskScore?: number | null;
  urgencyClassification?: string;
}

interface LoanOfficer {
  loanOfficerId: string;
  name: string;
  clientCount: number;
}

interface ScheduledVisit {
  id: number;
  clientId: string;
  clientName: string;
  scheduledDate: string;
  scheduledTime: string;
  status: string;
}

interface AvailabilityData {
  loanOfficerId: string;
  scheduledVisits: number;
  scheduledCalls: number;
  visits: ScheduledVisit[];
  dailyBreakdown: Record<string, { visits: number; calls: number }>;
}

interface AssignVisitModalProps {
  client: Client;
  loanOfficers: LoanOfficer[];
  onClose: () => void;
}

export function AssignVisitModal({ client, loanOfficers, onClose }: AssignVisitModalProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [visitType, setVisitType] = useState<'visit' | 'call'>(client.aiRecommendation === 'call' ? 'call' : 'visit');
  const [calendarOpen, setCalendarOpen] = useState(false);

  const { data: availability, isLoading: availabilityLoading } = useQuery<AvailabilityData>({
    queryKey: ['/api/manager/loan-officers', client.loanOfficerId, 'availability'],
    queryFn: async () => {
      const response = await fetch(`/api/manager/loan-officers/${client.loanOfficerId}/availability`);
      if (!response.ok) throw new Error('Failed to fetch availability');
      return response.json();
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (data: { clientId: string; loanOfficerId: string; scheduledDate: string; scheduledTime: string; notes: string; visitType: string }) => {
      return apiRequest('POST', '/api/manager/assign-visit', data);
    },
    onSuccess: () => {
      toast({
        title: t('manager.visitAssigned'),
        description: t('manager.visitAssignedDescription'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manager/clients'] });
      queryClient.invalidateQueries({ queryKey: ['/api/manager/loan-officers', client.loanOfficerId, 'availability'] });
      onClose();
    },
    onError: () => {
      toast({
        title: t('common.error'),
        description: t('manager.visitAssignError'),
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduledDate || !scheduledTime) {
      toast({
        title: t('common.error'),
        description: t('manager.fillRequiredFields'),
        variant: "destructive",
      });
      return;
    }
    
    assignMutation.mutate({
      clientId: client.clientId,
      loanOfficerId: client.loanOfficerId,
      scheduledDate: format(scheduledDate, 'yyyy-MM-dd'),
      scheduledTime,
      notes,
      visitType,
    });
  };

  const loanOfficer = loanOfficers.find(o => o.loanOfficerId === client.loanOfficerId);

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[550px]" data-testid="modal-assign-visit">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-indigo-600" />
            {t('manager.assignVisitTitle')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('manager.client')}</p>
            <p className="font-medium text-slate-900 dark:text-white">{client.clientName}</p>
            <p className="text-xs text-slate-500">{t('manager.loanOfficer')}: {loanOfficer?.name || client.loanOfficerId}</p>
          </div>

          <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-200 dark:border-indigo-800">
            <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100 mb-2">
              {t('manager.aiRecommendation')}
            </p>
            <div className="flex items-center gap-3">
              {client.aiRecommendation === 'visit' ? (
                <Badge className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1">
                  <MapPin className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                  {t('manager.scheduleVisit')}
                </Badge>
              ) : client.aiRecommendation === 'call' ? (
                <Badge className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1">
                  <Phone className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                  {t('manager.scheduleCall')}
                </Badge>
              ) : (
                <Badge variant="outline" className="px-3 py-1">
                  {t('manager.noRecommendation')}
                </Badge>
              )}
            </div>
            {client.aiRecommendationReason && (
              <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-2">
                {client.aiRecommendationReason}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>{t('manager.actionType')}</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={visitType === 'visit' ? 'default' : 'outline'}
                onClick={() => setVisitType('visit')}
                className={visitType === 'visit' ? 'bg-purple-600 hover:bg-purple-700' : ''}
                data-testid="button-type-visit"
              >
                <MapPin className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                {t('manager.visit')}
              </Button>
              <Button
                type="button"
                variant={visitType === 'call' ? 'default' : 'outline'}
                onClick={() => setVisitType('call')}
                className={visitType === 'call' ? 'bg-indigo-600 hover:bg-indigo-700' : ''}
                data-testid="button-type-call"
              >
                <Phone className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                {t('manager.call')}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('manager.visitDate')}</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground"
                  )}
                  data-testid="button-select-date"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? format(scheduledDate, "PPP") : t('calendar.selectDate')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={scheduledDate}
                  onSelect={(date) => {
                    setScheduledDate(date);
                    setCalendarOpen(false);
                  }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          {availability && availability.visits && availability.visits.length > 0 && (
            <div className="space-y-2">
              <Label className="text-slate-600">{t('manager.upcomingVisits')}</Label>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {availability.visits.slice(0, 5).map((visit) => (
                  <div 
                    key={visit.id} 
                    className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-300">{visit.clientName}</span>
                    <span className="text-slate-500">
                      {format(parseISO(visit.scheduledDate), 'MMM d')} {visit.scheduledTime}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="space-y-2">
            <Label htmlFor="time">{t('manager.visitTime')}</Label>
            <div className="relative">
              <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="pl-10"
                data-testid="input-time"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('manager.notes')}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('manager.notesPlaceholder')}
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={assignMutation.isPending || !scheduledDate}
              className="bg-indigo-600 hover:bg-indigo-700"
              data-testid="button-submit"
            >
              {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {visitType === 'call' ? t('manager.assignCall') : t('manager.assignVisit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
