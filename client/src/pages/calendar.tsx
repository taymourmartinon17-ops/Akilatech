import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from "framer-motion";
import { Navigation } from "@/components/navigation";
import { ScheduleModal } from "@/components/schedule-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/lib/auth";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { 
  Trash2, 
  CheckCircle, 
  Clock, 
  Phone, 
  Home, 
  Loader2, 
  Target, 
  Zap, 
  Calendar as CalendarIcon,
  ChevronRight,
  TrendingUp,
  AlertTriangle,
  Plus,
  Sparkles
} from "lucide-react";
import type { Visit, PhoneCall, Client } from "@shared/schema";
import { triggerConfettiBurst } from "@/lib/confetti";
import { useToast } from "@/hooks/use-toast";

export default function Calendar() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  usePageTracking({ pageName: "Calendar", pageRoute: "/calendar" });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalType, setScheduleModalType] = useState<"visit" | "phone_call">("visit");
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [selectedPhoneCall, setSelectedPhoneCall] = useState<PhoneCall | null>(null);
  const [feedback, setFeedback] = useState("");
  const [paymentWillingness, setPaymentWillingness] = useState("3");
  const [financialSituation, setFinancialSituation] = useState("3");
  const [communicationQuality, setCommunicationQuality] = useState("3");
  const [complianceCooperation, setComplianceCooperation] = useState("3");
  const [futureOutlook, setFutureOutlook] = useState("3");
  const [preSelectedClientId, setPreSelectedClientId] = useState<string | null>(null);
  const [preSelectedAction, setPreSelectedAction] = useState<string | null>(null);
  const [preSelectedClientName, setPreSelectedClientName] = useState<string | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  useEffect(() => {
    const handleVisitCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{ visitId: string; clientId: string; clientName: string; loanOfficerId: string }>;
      const { clientName, loanOfficerId } = customEvent.detail;
      
      if (loanOfficerId === user?.loanOfficerId) {
        triggerConfettiBurst();
        toast({
          title: t('calendar.visitCompletedTitle'),
          description: t('calendar.visitCompletedDesc', { clientName }),
          duration: 5000,
        });
        refetchVisits();
      }
    };

    window.addEventListener('visitCompleted', handleVisitCompleted);
    return () => window.removeEventListener('visitCompleted', handleVisitCompleted);
  }, [user?.loanOfficerId, toast]);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');
    const action = urlParams.get('action');
    const clientName = urlParams.get('name');
    
    if (clientId && action) {
      setPreSelectedClientId(clientId);
      setPreSelectedAction(action);
      setPreSelectedClientName(clientName);
      setScheduleModalType(action === 'call' ? 'phone_call' : 'visit');
      setShowScheduleModal(true);
      window.history.replaceState({}, '', '/calendar');
    }
  }, []);

  const { data: visits = [], refetch: refetchVisits } = useQuery<Visit[]>({
    queryKey: ['/api/visits', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId,
  });

  const { data: phoneCalls = [], refetch: refetchPhoneCalls } = useQuery<PhoneCall[]>({
    queryKey: ['/api/phone-calls', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId,
  });

  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId,
  });

  const deleteVisitMutation = useMutation({
    mutationFn: async (visitId: string) => {
      await apiRequest('DELETE', `/api/visits/${visitId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visits', user?.loanOfficerId] });
    },
  });

  const deletePhoneCallMutation = useMutation({
    mutationFn: async (phoneCallId: string) => {
      await apiRequest('DELETE', `/api/phone-calls/${phoneCallId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/phone-calls', user?.loanOfficerId] });
    },
  });

  const completeVisitMutation = useMutation({
    mutationFn: async ({ visitId, notes, clientId, scheduledDate, feedbackScore, paymentWillingness, financialSituation, communicationQuality, complianceCooperation, futureOutlook }: { 
      visitId: string; notes?: string; clientId: string; scheduledDate: string; feedbackScore: number;
      paymentWillingness: number; financialSituation: number; communicationQuality: number;
      complianceCooperation: number; futureOutlook: number;
    }) => {
      await apiRequest('PATCH', `/api/visits/${visitId}/complete`, { notes });
      await apiRequest('POST', '/api/clients/feedback', {
        clientId, lastVisitDate: scheduledDate, feedbackScore, paymentWillingness,
        financialSituation, communicationQuality, complianceCooperation, futureOutlook, visitNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visits', user?.loanOfficerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', user?.loanOfficerId] });
    },
  });

  const completePhoneCallMutation = useMutation({
    mutationFn: async ({ phoneCallId, notes, duration, clientId, scheduledDate, feedbackScore, paymentWillingness, financialSituation, communicationQuality, complianceCooperation, futureOutlook }: { 
      phoneCallId: string; notes?: string; duration?: number; clientId: string; scheduledDate: string; feedbackScore: number;
      paymentWillingness: number; financialSituation: number; communicationQuality: number;
      complianceCooperation: number; futureOutlook: number;
    }) => {
      await apiRequest('PATCH', `/api/phone-calls/${phoneCallId}/complete`, { notes, duration });
      await apiRequest('POST', '/api/clients/feedback', {
        clientId, lastPhoneCallDate: scheduledDate, feedbackScore, paymentWillingness,
        financialSituation, communicationQuality, complianceCooperation, futureOutlook, visitNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/phone-calls', user?.loanOfficerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', user?.loanOfficerId] });
    },
  });

  const getClientDetails = (clientId: string) => clients.find(client => client.clientId === clientId);

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const getTasksForDate = (date: Date) => {
    const dateStart = new Date(date);
    dateStart.setHours(0, 0, 0, 0);
    const dateEnd = new Date(date);
    dateEnd.setHours(23, 59, 59, 999);

    const dayVisits = visits.filter(v => {
      const vDate = new Date(v.scheduledDate);
      return vDate >= dateStart && vDate <= dateEnd && v.status === 'scheduled';
    }).map(v => ({ ...v, type: 'visit' as const, client: getClientDetails(v.clientId) }));

    const dayCalls = phoneCalls.filter(c => {
      const cDate = new Date(c.scheduledDate);
      return cDate >= dateStart && cDate <= dateEnd && c.status === 'scheduled';
    }).map(c => ({ ...c, type: 'phone_call' as const, client: getClientDetails(c.clientId) }));

    return [...dayVisits, ...dayCalls].sort((a, b) => {
      const urgencyOrder = { 'Extremely Urgent': 4, 'Urgent': 3, 'Moderately Urgent': 2, 'Low Urgency': 1 };
      const aUrgency = urgencyOrder[a.client?.urgencyClassification as keyof typeof urgencyOrder] || 0;
      const bUrgency = urgencyOrder[b.client?.urgencyClassification as keyof typeof urgencyOrder] || 0;
      if (bUrgency !== aUrgency) return bUrgency - aUrgency;
      return a.scheduledTime.localeCompare(b.scheduledTime);
    });
  };

  const todayTasks = getTasksForDate(today);
  const completedToday = [...visits, ...phoneCalls].filter(item => {
    const itemDate = new Date(item.scheduledDate);
    itemDate.setHours(0, 0, 0, 0);
    return itemDate.getTime() === today.getTime() && item.status === 'completed';
  }).length;

  const totalTodayTasks = todayTasks.length + completedToday;
  const progressPercent = totalTodayTasks > 0 ? (completedToday / totalTodayTasks) * 100 : 0;

  const upcomingTasks = (() => {
    const tasks: Array<{ date: Date; tasks: typeof todayTasks }> = [];
    for (let i = 1; i <= 7; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() + i);
      const dayTasks = getTasksForDate(date);
      if (dayTasks.length > 0) {
        tasks.push({ date, tasks: dayTasks });
      }
    }
    return tasks;
  })();

  const urgentCount = todayTasks.filter(t => 
    t.client?.urgencyClassification === 'Extremely Urgent' || t.client?.urgencyClassification === 'Urgent'
  ).length;

  const handleCompleteVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    setSelectedPhoneCall(null);
    setFeedback("");
    setPaymentWillingness("3");
    setFinancialSituation("3");
    setCommunicationQuality("3");
    setComplianceCooperation("3");
    setFutureOutlook("3");
    setShowFeedbackModal(true);
  };

  const handleCompletePhoneCall = (phoneCall: PhoneCall) => {
    setSelectedPhoneCall(phoneCall);
    setSelectedVisit(null);
    setFeedback("");
    setPaymentWillingness("3");
    setFinancialSituation("3");
    setCommunicationQuality("3");
    setComplianceCooperation("3");
    setFutureOutlook("3");
    setShowFeedbackModal(true);
  };

  const handleSubmitFeedback = () => {
    if (!selectedVisit && !selectedPhoneCall) return;

    const compositeScore = Math.round(
      (parseInt(paymentWillingness) * 0.30 + parseInt(financialSituation) * 0.25 +
       parseInt(communicationQuality) * 0.15 + parseInt(complianceCooperation) * 0.20 +
       parseInt(futureOutlook) * 0.10)
    );

    if (selectedVisit) {
      completeVisitMutation.mutate({
        visitId: selectedVisit.id, notes: feedback.trim() || undefined,
        clientId: selectedVisit.clientId,
        scheduledDate: new Date(selectedVisit.scheduledDate).toISOString().split('T')[0],
        feedbackScore: compositeScore, paymentWillingness: parseInt(paymentWillingness),
        financialSituation: parseInt(financialSituation), communicationQuality: parseInt(communicationQuality),
        complianceCooperation: parseInt(complianceCooperation), futureOutlook: parseInt(futureOutlook),
      });
    } else if (selectedPhoneCall) {
      const durationMatch = feedback.match(/(\d+)\s*(?:min|minute)/i);
      const duration = durationMatch ? parseInt(durationMatch[1]) : undefined;
      completePhoneCallMutation.mutate({
        phoneCallId: selectedPhoneCall.id, notes: feedback.trim() || undefined, duration,
        clientId: selectedPhoneCall.clientId,
        scheduledDate: new Date(selectedPhoneCall.scheduledDate).toISOString().split('T')[0],
        feedbackScore: compositeScore, paymentWillingness: parseInt(paymentWillingness),
        financialSituation: parseInt(financialSituation), communicationQuality: parseInt(communicationQuality),
        complianceCooperation: parseInt(complianceCooperation), futureOutlook: parseInt(futureOutlook),
      });
    }
    
    setShowFeedbackModal(false);
    setSelectedVisit(null);
    setSelectedPhoneCall(null);
    setFeedback("");
  };

  const getUrgencyStyles = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent":
        return { bg: "bg-purple-100 dark:bg-purple-900/30", border: "border-purple-300 dark:border-purple-700", text: "text-purple-700 dark:text-purple-300", badge: "bg-purple-600" };
      case "Urgent":
        return { bg: "bg-indigo-100 dark:bg-indigo-900/30", border: "border-indigo-300 dark:border-indigo-700", text: "text-indigo-700 dark:text-indigo-300", badge: "bg-indigo-600" };
      case "Moderately Urgent":
        return { bg: "bg-blue-100 dark:bg-blue-900/30", border: "border-blue-300 dark:border-blue-700", text: "text-blue-700 dark:text-blue-300", badge: "bg-blue-600" };
      default:
        return { bg: "bg-green-100 dark:bg-green-900/30", border: "border-green-300 dark:border-green-700", text: "text-green-700 dark:text-green-300", badge: "bg-green-600" };
    }
  };

  const translateUrgency = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent": return t('urgency.extremelyUrgent');
      case "Urgent": return t('urgency.urgent');
      case "Moderately Urgent": return t('urgency.moderatelyUrgent');
      default: return t('urgency.lowUrgency');
    }
  };

  const renderTaskCard = (task: typeof todayTasks[0], index: number, showDate = false) => {
    const urgencyStyles = getUrgencyStyles(task.client?.urgencyClassification || 'Low Urgency');
    const isVisit = task.type === 'visit';
    const taskDate = new Date(task.scheduledDate);

    return (
      <motion.div
        key={task.id}
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className={`group relative overflow-hidden rounded-xl border-2 ${urgencyStyles.border} ${urgencyStyles.bg} p-4 hover:shadow-lg transition-all duration-300`}
        data-testid={`task-card-${task.id}`}
      >
        <div className="absolute top-0 start-0 w-1.5 h-full bg-gradient-to-b from-indigo-500 to-purple-500" />
        
        <div className="flex items-start justify-between ps-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <div className={`p-2 rounded-lg ${isVisit ? 'bg-indigo-500' : 'bg-green-500'}`}>
                {isVisit ? <Home className="h-4 w-4 text-white" /> : <Phone className="h-4 w-4 text-white" />}
              </div>
              <div>
                <h4 className="font-semibold text-foreground">{task.client?.name || t('calendar.unknownClient')}</h4>
                <p className="text-xs text-muted-foreground">ID: {task.clientId}</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge className={`${urgencyStyles.badge} text-white text-xs`}>
                {translateUrgency(task.client?.urgencyClassification || 'Low Urgency')}
              </Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                {formatTime(task.scheduledTime)}
              </span>
              {showDate && (
                <span className="text-sm text-muted-foreground flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {taskDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
              )}
              <Badge variant="outline" className="text-xs">
                {isVisit ? t('calendar.visit') : t('calendar.phoneCall')}
              </Badge>
              {task.client?.riskScore && task.client.riskScore >= 70 && (
                <Badge variant="outline" className="text-xs border-purple-300 text-purple-600">
                  <TrendingUp className="h-3 w-3 me-1" />
                  {t('risk.high')}
                </Badge>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => isVisit ? handleCompleteVisit(task as Visit) : handleCompletePhoneCall(task as PhoneCall)}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white shadow-md"
              data-testid={`complete-task-${task.id}`}
            >
              <CheckCircle className="h-4 w-4 me-1" />
              {t('calendar.complete')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => isVisit ? deleteVisitMutation.mutate(task.id) : deletePhoneCallMutation.mutate(task.id)}
              className="text-muted-foreground hover:text-destructive"
              data-testid={`delete-task-${task.id}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
          <p className="text-muted-foreground">{t('common.loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-indigo-50/30 to-purple-50/30 dark:from-slate-950 dark:via-indigo-950/20 dark:to-purple-950/20" data-testid="calendar-page">
      <Navigation />
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
        
        <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl shadow-xl p-6 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="h-5 w-5 text-yellow-300" />
                <span className="text-indigo-200 text-sm">{today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold" data-testid="page-title">
                {t('calendar.myTasks')}
              </h1>
              <p className="text-indigo-200 mt-1">{t('calendar.taskOverview')}</p>
            </div>
            
            <div className="flex gap-2">
              <Button
                onClick={() => { setScheduleModalType("visit"); setShowScheduleModal(true); }}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                variant="outline"
                data-testid="button-schedule-visit"
              >
                <Plus className="h-4 w-4 me-1" />
                {t('calendar.newVisit')}
              </Button>
              <Button
                onClick={() => { setScheduleModalType("phone_call"); setShowScheduleModal(true); }}
                className="bg-white/20 hover:bg-white/30 text-white border-white/30"
                variant="outline"
                data-testid="button-schedule-call"
              >
                <Plus className="h-4 w-4 me-1" />
                {t('calendar.newCall')}
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-2 border-indigo-200 dark:border-indigo-800 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/50 dark:to-slate-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
                  <Target className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{todayTasks.length}</p>
                  <p className="text-xs text-muted-foreground">{t('calendar.tasksToday')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-green-200 dark:border-green-800 bg-gradient-to-br from-green-50 to-white dark:from-green-950/50 dark:to-slate-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-xl">
                  <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400">{completedToday}</p>
                  <p className="text-xs text-muted-foreground">{t('calendar.completed')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-purple-200 dark:border-purple-800 bg-gradient-to-br from-purple-50 to-white dark:from-purple-950/50 dark:to-slate-900">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-xl">
                  <AlertTriangle className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{urgentCount}</p>
                  <p className="text-xs text-muted-foreground">{t('calendar.urgentTasks')}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-blue-200 dark:border-blue-800 bg-gradient-to-br from-blue-50 to-white dark:from-blue-950/50 dark:to-slate-900">
            <CardContent className="p-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{t('calendar.progress')}</span>
                  <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-3 bg-blue-100 dark:bg-blue-900/50" />
                <p className="text-xs text-muted-foreground">{completedToday}/{totalTodayTasks} {t('calendar.tasksComplete')}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-lg">
              <Zap className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{t('calendar.todaysTasks')}</h2>
              <p className="text-sm text-muted-foreground">{t('calendar.sortedByPriority')}</p>
            </div>
          </div>
          
          {todayTasks.length === 0 ? (
            <Card className="border-2 border-dashed border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/20">
              <CardContent className="p-8 text-center">
                <div className="inline-flex p-4 bg-green-100 dark:bg-green-900/50 rounded-full mb-4">
                  <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-green-700 dark:text-green-300">{t('calendar.allCaughtUp')}</h3>
                <p className="text-sm text-green-600 dark:text-green-400 mt-1">{t('calendar.noTasksToday')}</p>
                <Button
                  onClick={() => { setScheduleModalType("visit"); setShowScheduleModal(true); }}
                  variant="outline"
                  className="mt-4 border-green-300 text-green-700 hover:bg-green-100"
                >
                  <Plus className="h-4 w-4 me-1" />
                  {t('calendar.scheduleNew')}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {todayTasks.map((task, index) => renderTaskCard(task, index))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {upcomingTasks.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-lg">
                <CalendarIcon className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-foreground">{t('calendar.comingUp')}</h2>
                <p className="text-sm text-muted-foreground">{t('calendar.nextSevenDays')}</p>
              </div>
            </div>
            
            <div className="space-y-3">
              {upcomingTasks.map(({ date, tasks }) => (
                <div key={date.toISOString()} className="space-y-2">
                  <div className="flex items-center gap-2 px-2">
                    <Badge variant="outline" className="bg-slate-100 dark:bg-slate-800">
                      {date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {tasks.length} {tasks.length === 1 ? t('calendar.task') : t('calendar.tasks')}
                    </span>
                  </div>
                  <AnimatePresence>
                    {tasks.map((task, index) => renderTaskCard(task, index, true))}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        )}

        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={() => {
            setShowScheduleModal(false);
            setPreSelectedClientId(null);
            setPreSelectedAction(null);
            setPreSelectedClientName(null);
          }}
          onScheduled={() => { refetchVisits(); refetchPhoneCalls(); }}
          type={scheduleModalType}
          preSelectedClientId={preSelectedClientId || undefined}
          preSelectedClientName={preSelectedClientName || undefined}
        />

        <Dialog open={showFeedbackModal} onOpenChange={setShowFeedbackModal}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('calendar.detailedAssessment')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {(selectedVisit || selectedPhoneCall) && (
                <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-md">
                  <strong>{t('calendar.client')}:</strong> {getClientDetails((selectedVisit || selectedPhoneCall)!.clientId)?.name || t('calendar.unknownClient')}
                  <br />
                  <strong>{t('calendar.type')}:</strong> {selectedVisit ? t('calendar.visit') : t('calendar.phoneCall')}
                </div>
              )}

              <div className="space-y-2">
                <Label>{t('calendar.paymentWillingnessLabel')}</Label>
                <Select value={paymentWillingness} onValueChange={setPaymentWillingness}>
                  <SelectTrigger data-testid="payment-willingness-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.paymentWillingness1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.paymentWillingness2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.paymentWillingness3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.paymentWillingness4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.paymentWillingness5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('calendar.financialSituationLabel')}</Label>
                <Select value={financialSituation} onValueChange={setFinancialSituation}>
                  <SelectTrigger data-testid="financial-situation-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.financialSituation1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.financialSituation2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.financialSituation3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.financialSituation4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.financialSituation5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('calendar.communicationQualityLabel')}</Label>
                <Select value={communicationQuality} onValueChange={setCommunicationQuality}>
                  <SelectTrigger data-testid="communication-quality-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.communicationQuality1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.communicationQuality2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.communicationQuality3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.communicationQuality4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.communicationQuality5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('calendar.complianceCooperationLabel')}</Label>
                <Select value={complianceCooperation} onValueChange={setComplianceCooperation}>
                  <SelectTrigger data-testid="compliance-cooperation-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.complianceCooperation1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.complianceCooperation2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.complianceCooperation3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.complianceCooperation4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.complianceCooperation5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('calendar.futureOutlookLabel')}</Label>
                <Select value={futureOutlook} onValueChange={setFutureOutlook}>
                  <SelectTrigger data-testid="future-outlook-select"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.futureOutlook1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.futureOutlook2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.futureOutlook3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.futureOutlook4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.futureOutlook5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>{t('calendar.additionalNotes')}</Label>
                <Textarea
                  placeholder={t('calendar.notesPlaceholder')}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  data-testid="feedback-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowFeedbackModal(false)}>{t('common.cancel')}</Button>
              <Button
                onClick={handleSubmitFeedback}
                disabled={completeVisitMutation.isPending || completePhoneCallMutation.isPending}
                className="bg-gradient-to-r from-green-500 to-emerald-500"
                data-testid="submit-feedback-button"
              >
                {(completeVisitMutation.isPending || completePhoneCallMutation.isPending) ? t('calendar.completing') : t('calendar.completeTask')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
