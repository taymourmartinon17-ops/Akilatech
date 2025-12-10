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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar, Clock, User, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Client {
  id: string;
  clientId: string;
  clientName: string;
  loanOfficerId: string;
}

interface LoanOfficer {
  loanOfficerId: string;
  name: string;
  clientCount: number;
}

interface AvailabilityData {
  loanOfficerId: string;
  scheduledVisits: number;
  scheduledCalls: number;
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
  
  const [selectedOfficer, setSelectedOfficer] = useState(client.loanOfficerId);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("09:00");
  const [notes, setNotes] = useState("");

  const { data: availability } = useQuery<AvailabilityData>({
    queryKey: ['/api/manager/loan-officers', selectedOfficer, 'availability'],
    queryFn: async () => {
      const response = await fetch(`/api/manager/loan-officers/${selectedOfficer}/availability`);
      if (!response.ok) throw new Error('Failed to fetch availability');
      return response.json();
    },
    enabled: !!selectedOfficer,
  });

  const assignMutation = useMutation({
    mutationFn: async (data: { clientId: string; loanOfficerId: string; scheduledDate: string; scheduledTime: string; notes: string }) => {
      return apiRequest('POST', '/api/manager/assign-visit', data);
    },
    onSuccess: () => {
      toast({
        title: t('manager.visitAssigned'),
        description: t('manager.visitAssignedDescription'),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/manager/clients'] });
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
    if (!selectedOfficer || !scheduledDate || !scheduledTime) {
      toast({
        title: t('common.error'),
        description: t('manager.fillRequiredFields'),
        variant: "destructive",
      });
      return;
    }
    
    assignMutation.mutate({
      clientId: client.clientId,
      loanOfficerId: selectedOfficer,
      scheduledDate,
      scheduledTime,
      notes,
    });
  };

  const selectedOfficerData = loanOfficers.find(o => o.loanOfficerId === selectedOfficer);

  return (
    <Dialog open={true} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-[500px]" data-testid="modal-assign-visit">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-purple-600" />
            {t('manager.assignVisitTitle')}
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <p className="text-sm text-slate-600 dark:text-slate-400">{t('manager.client')}</p>
            <p className="font-medium text-slate-900 dark:text-white">{client.clientName}</p>
            <p className="text-xs text-slate-500">{client.clientId}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="officer">{t('manager.selectOfficer')}</Label>
            <Select value={selectedOfficer} onValueChange={setSelectedOfficer}>
              <SelectTrigger id="officer" data-testid="select-officer">
                <SelectValue placeholder={t('manager.selectOfficerPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {loanOfficers.map((officer) => (
                  <SelectItem key={officer.loanOfficerId} value={officer.loanOfficerId}>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      <span>{officer.name}</span>
                      <span className="text-slate-500">({officer.clientCount} clients)</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {availability && selectedOfficerData && (
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800">
              <p className="text-sm font-medium text-indigo-900 dark:text-indigo-100">
                {t('manager.availabilityTitle', { name: selectedOfficerData.name })}
              </p>
              <p className="text-sm text-indigo-700 dark:text-indigo-300">
                {t('manager.scheduledActivities', { 
                  visits: availability.scheduledVisits, 
                  calls: availability.scheduledCalls 
                })}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="date">{t('manager.visitDate')}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="date"
                  type="date"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                  className="pl-10"
                  min={new Date().toISOString().split('T')[0]}
                  data-testid="input-date"
                />
              </div>
            </div>
            
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">{t('manager.notes')}</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('manager.notesPlaceholder')}
              rows={3}
              data-testid="input-notes"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel">
              {t('common.cancel')}
            </Button>
            <Button 
              type="submit" 
              disabled={assignMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
              data-testid="button-submit"
            >
              {assignMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t('manager.assignVisit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
