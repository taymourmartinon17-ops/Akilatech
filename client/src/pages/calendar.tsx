import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from 'react-i18next';
import { motion } from "framer-motion";
import { Navigation } from "@/components/navigation";
import { ScheduleModal } from "@/components/schedule-modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Trash2, CheckCircle, Clock, Phone, Home } from "lucide-react";
import type { Visit, PhoneCall, Client } from "@shared/schema";
import { triggerConfettiBurst } from "@/lib/confetti";
import { useToast } from "@/hooks/use-toast";

export default function Calendar() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  usePageTracking({ pageName: "Calendar", pageRoute: "/calendar" });
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleModalType, setScheduleModalType] = useState<"visit" | "phone_call">("visit");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [selectedPhoneCall, setSelectedPhoneCall] = useState<PhoneCall | null>(null);
  const [feedback, setFeedback] = useState("");
  const [feedbackScore, setFeedbackScore] = useState("3");
  // Detailed feedback state  
  const [paymentWillingness, setPaymentWillingness] = useState("3");
  const [financialSituation, setFinancialSituation] = useState("3");
  const [communicationQuality, setCommunicationQuality] = useState("3");
  const [complianceCooperation, setComplianceCooperation] = useState("3");
  const [futureOutlook, setFutureOutlook] = useState("3");
  // Pre-selected client state from URL params
  const [preSelectedClientId, setPreSelectedClientId] = useState<string | null>(null);
  const [preSelectedAction, setPreSelectedAction] = useState<string | null>(null);
  const [preSelectedClientName, setPreSelectedClientName] = useState<string | null>(null);
  
  const { toast } = useToast();

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  // Listen for visit completion events from WebSocket
  useEffect(() => {
    const handleVisitCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{ visitId: string; clientId: string; clientName: string; loanOfficerId: string }>;
      const { clientName, loanOfficerId } = customEvent.detail;
      
      // Only trigger confetti if it's for this loan officer
      if (loanOfficerId === user?.loanOfficerId) {
        triggerConfettiBurst();
        
        toast({
          title: t('calendar.visitCompletedTitle'),
          description: t('calendar.visitCompletedDesc', { clientName }),
          duration: 5000,
        });
        
        // Refresh visits to update the calendar
        refetchVisits();
      }
    };

    window.addEventListener('visitCompleted', handleVisitCompleted);
    
    return () => {
      window.removeEventListener('visitCompleted', handleVisitCompleted);
    };
  }, [user?.loanOfficerId, toast]);

  // Parse URL parameters for pre-selected client
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const clientId = urlParams.get('client');
    const action = urlParams.get('action');
    const clientName = urlParams.get('name');
    
    if (clientId && action) {
      setPreSelectedClientId(clientId);
      setPreSelectedAction(action);
      setPreSelectedClientName(clientName);
      
      // Auto-open schedule modal with the right type
      setScheduleModalType(action === 'call' ? 'phone_call' : 'visit');
      setShowScheduleModal(true);
      
      // Clear URL parameters after processing
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
      visitId: string; 
      notes?: string; 
      clientId: string; 
      scheduledDate: string; 
      feedbackScore: number;
      paymentWillingness: number;
      financialSituation: number;
      communicationQuality: number;
      complianceCooperation: number;
      futureOutlook: number;
    }) => {
      // Complete the visit first
      await apiRequest('PATCH', `/api/visits/${visitId}/complete`, { notes });
      
      // Then update client feedback with detailed components
      await apiRequest('POST', '/api/clients/feedback', {
        clientId,
        lastVisitDate: scheduledDate,
        feedbackScore,
        paymentWillingness,
        financialSituation,
        communicationQuality,
        complianceCooperation,
        futureOutlook,
        visitNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/visits', user?.loanOfficerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', user?.loanOfficerId] });
    },
  });

  const completePhoneCallMutation = useMutation({
    mutationFn: async ({ phoneCallId, notes, duration, clientId, scheduledDate, feedbackScore, paymentWillingness, financialSituation, communicationQuality, complianceCooperation, futureOutlook }: { 
      phoneCallId: string; 
      notes?: string; 
      duration?: number;
      clientId: string; 
      scheduledDate: string; 
      feedbackScore: number;
      paymentWillingness: number;
      financialSituation: number;
      communicationQuality: number;
      complianceCooperation: number;
      futureOutlook: number;
    }) => {
      // Complete the phone call first
      await apiRequest('PATCH', `/api/phone-calls/${phoneCallId}/complete`, { notes, duration });
      
      // Then update client feedback with detailed components
      await apiRequest('POST', '/api/clients/feedback', {
        clientId,
        lastPhoneCallDate: scheduledDate,
        feedbackScore,
        paymentWillingness,
        financialSituation,
        communicationQuality,
        complianceCooperation,
        futureOutlook,
        visitNotes: notes,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/phone-calls', user?.loanOfficerId] });
      queryClient.invalidateQueries({ queryKey: ['/api/clients', user?.loanOfficerId] });
    },
  });

  const upcomingVisits = visits.filter(visit => {
    const visitDate = new Date(visit.scheduledDate);
    const today = new Date();
    
    // Compare just the date part, not the time
    visitDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    return visitDate >= today && visit.status === 'scheduled';
  }).slice(0, 5);

  const upcomingPhoneCalls = phoneCalls.filter(phoneCall => {
    const callDate = new Date(phoneCall.scheduledDate);
    const today = new Date();
    
    // Compare just the date part, not the time
    callDate.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    
    return callDate >= today && phoneCall.status === 'scheduled';
  }).slice(0, 5);

  // Combine and sort upcoming interactions
  const upcomingInteractions = [
    ...upcomingVisits.map(v => ({ ...v, type: 'visit' as const })),
    ...upcomingPhoneCalls.map(c => ({ ...c, type: 'phone_call' as const }))
  ].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()).slice(0, 10);

  const completedVisits = visits.filter(visit => visit.status === 'completed')
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
    .slice(0, 3);

  const completedPhoneCalls = phoneCalls.filter(phoneCall => phoneCall.status === 'completed')
    .sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime())
    .slice(0, 3);

  // Combine and sort completed interactions
  const completedInteractions = [
    ...completedVisits.map(v => ({ ...v, type: 'visit' as const })),
    ...completedPhoneCalls.map(c => ({ ...c, type: 'phone_call' as const }))
  ].sort((a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()).slice(0, 5);

  const handleCompleteVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    setSelectedPhoneCall(null);
    setFeedback("");
    setFeedbackScore("3");
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
    setFeedbackScore("3");
    setPaymentWillingness("3");
    setFinancialSituation("3");
    setCommunicationQuality("3");
    setComplianceCooperation("3");
    setFutureOutlook("3");
    setShowFeedbackModal(true);
  };

  const handleSubmitFeedback = () => {
    if (!selectedVisit && !selectedPhoneCall) return;

    // Calculate composite score from detailed feedback
    const compositeScore = Math.round(
      (parseInt(paymentWillingness) * 0.30 +
       parseInt(financialSituation) * 0.25 +
       parseInt(communicationQuality) * 0.15 +
       parseInt(complianceCooperation) * 0.20 +
       parseInt(futureOutlook) * 0.10)
    );

    if (selectedVisit) {
      completeVisitMutation.mutate({
        visitId: selectedVisit.id,
        notes: feedback.trim() || undefined,
        clientId: selectedVisit.clientId,
        scheduledDate: new Date(selectedVisit.scheduledDate).toISOString().split('T')[0],
        feedbackScore: compositeScore,
        paymentWillingness: parseInt(paymentWillingness),
        financialSituation: parseInt(financialSituation),
        communicationQuality: parseInt(communicationQuality),
        complianceCooperation: parseInt(complianceCooperation),
        futureOutlook: parseInt(futureOutlook),
      });
    } else if (selectedPhoneCall) {
      // Parse duration from feedback if provided (expecting "15 minutes" format)
      const durationMatch = feedback.match(/(\d+)\s*(?:min|minute)/i);
      const duration = durationMatch ? parseInt(durationMatch[1]) : undefined;

      completePhoneCallMutation.mutate({
        phoneCallId: selectedPhoneCall.id,
        notes: feedback.trim() || undefined,
        duration,
        clientId: selectedPhoneCall.clientId,
        scheduledDate: new Date(selectedPhoneCall.scheduledDate).toISOString().split('T')[0],
        feedbackScore: compositeScore,
        paymentWillingness: parseInt(paymentWillingness),
        financialSituation: parseInt(financialSituation),
        communicationQuality: parseInt(communicationQuality),
        complianceCooperation: parseInt(complianceCooperation),
        futureOutlook: parseInt(futureOutlook),
      });
    }
    
    setShowFeedbackModal(false);
    setSelectedVisit(null);
    setSelectedPhoneCall(null);
    setFeedback("");
    setFeedbackScore("3");
    setPaymentWillingness("3");
    setFinancialSituation("3");
    setCommunicationQuality("3");
    setComplianceCooperation("3");
    setFutureOutlook("3");
  };

  const getClientDetails = (clientId: string) => {
    return clients.find(client => client.clientId === clientId);
  };

  const getUrgencyColor = (urgency: string) => {
    const extremelyUrgent = t('urgency.extremelyUrgent');
    const urgent = t('urgency.urgent');
    const moderatelyUrgent = t('urgency.moderatelyUrgent');
    const lowUrgency = t('urgency.lowUrgency');
    
    switch (urgency) {
      case extremelyUrgent:
      case "Extremely Urgent":
        return "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400";
      case urgent:
      case "Urgent":
        return "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-400";
      case moderatelyUrgent:
      case "Moderately Urgent":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400";
      case lowUrgency:
      case "Low Urgency":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTime = (time: string) => {
    return new Date(`2000-01-01T${time}`).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  };

  // Generate calendar days for current month
  const generateCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    const current = new Date(startDate);

    for (let i = 0; i < 42; i++) {
      const dayVisits = visits.filter(visit => {
        const visitDate = new Date(visit.scheduledDate);
        return visitDate.toDateString() === current.toDateString();
      });

      const dayPhoneCalls = phoneCalls.filter(phoneCall => {
        const callDate = new Date(phoneCall.scheduledDate);
        return callDate.toDateString() === current.toDateString();
      });

      days.push({
        date: new Date(current),
        isCurrentMonth: current.getMonth() === month,
        isToday: current.toDateString() === new Date().toDateString(),
        visits: dayVisits,
        phoneCalls: dayPhoneCalls,
      });

      current.setDate(current.getDate() + 1);
    }

    return days;
  };

  const calendarDays = generateCalendarDays();

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const previousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/20 dark:to-pink-950/20" data-testid="calendar-page">
      <Navigation />
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header Section with Gradient */}
        <div className="bg-pink-600 bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-700 dark:to-pink-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Clock className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white" data-testid="page-title">{t('calendar.interactionCalendar')}</h2>
                <p className="text-purple-100 mt-1">
                  {preSelectedClientName ? 
                    `${preSelectedAction === 'call' ? t('calendar.schedulingCallFor') : t('calendar.schedulingVisitFor')} ${preSelectedClientName}` :
                    t('calendar.scheduleManageText')
                  }
                </p>
              </div>
            </div>
            <div className="flex gap-2 mt-4 lg:mt-0">
              <Button
                onClick={() => {
                  setScheduleModalType("visit");
                  setShowScheduleModal(true);
                }}
                className="bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-700 dark:to-indigo-800 hover:from-blue-700 hover:to-indigo-700 dark:hover:from-blue-800 dark:hover:to-indigo-900 text-white shadow-md hover:shadow-lg transition-all"
                data-testid="button-schedule-visit"
              >
                <Home className="h-4 w-4 me-2" />
                {t('calendar.scheduleVisit')}
              </Button>
              <Button
                onClick={() => {
                  setScheduleModalType("phone_call");
                  setShowScheduleModal(true);
                }}
                className="bg-gradient-to-r from-green-600 to-emerald-600 dark:from-green-700 dark:to-emerald-800 hover:from-green-700 hover:to-emerald-700 dark:hover:from-green-800 dark:hover:to-emerald-900 text-white shadow-md hover:shadow-lg transition-all"
                data-testid="button-schedule-call"
              >
                <Phone className="h-4 w-4 me-2" />
                {t('calendar.scheduleCall')}
              </Button>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 shadow-md overflow-hidden" data-testid="calendar-container">
          <div className="px-6 py-4 border-b border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100" data-testid="calendar-month">
                {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={previousMonth}
                  className="hover:bg-purple-100 dark:hover:bg-purple-950/50"
                  data-testid="button-previous-month"
                >
                  <i className="fas fa-chevron-left"></i>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={nextMonth}
                  className="hover:bg-purple-100 dark:hover:bg-purple-950/50"
                  data-testid="button-next-month"
                >
                  <i className="fas fa-chevron-right"></i>
                </Button>
              </div>
            </div>
          </div>
          
          <div className="p-6">
            {/* Calendar Grid */}
            <div className="grid grid-cols-7 gap-1 mb-4">
              {[t('calendar.sun'), t('calendar.mon'), t('calendar.tue'), t('calendar.wed'), t('calendar.thu'), t('calendar.fri'), t('calendar.sat')].map(day => (
                <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.01 }}
                  className={`
                    p-3 text-center text-sm cursor-pointer hover:bg-muted/50 rounded relative min-h-[50px]
                    ${day.isCurrentMonth ? 'text-foreground' : 'text-muted-foreground'}
                    ${day.isToday ? 'bg-primary text-primary-foreground font-semibold' : ''}
                  `}
                  data-testid={`calendar-day-${day.date.getDate()}`}
                  whileHover={{ scale: 1.05 }}
                >
                  {day.date.getDate()}
                  {(day.visits.length > 0 || day.phoneCalls.length > 0) && (
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex gap-1">
                      {/* Visit indicators (solid circles) */}
                      {day.visits.slice(0, 2).map((visit, visitIndex) => {
                        const client = getClientDetails(visit.clientId);
                        const urgencyColor = client?.urgencyClassification === "Extremely Urgent" ? "bg-purple-500" :
                                           client?.urgencyClassification === "Urgent" ? "bg-indigo-500" :
                                           client?.urgencyClassification === "Moderately Urgent" ? "bg-blue-500" :
                                           "bg-green-500";
                        
                        return (
                          <div
                            key={`visit-${visitIndex}`}
                            className={`w-2 h-2 ${urgencyColor} rounded-full`}
                            data-testid={`visit-indicator-${visit.id}`}
                          ></div>
                        );
                      })}
                      {/* Phone call indicators (triangles) */}
                      {day.phoneCalls.slice(0, Math.min(2, 3 - day.visits.length)).map((phoneCall, callIndex) => {
                        const client = getClientDetails(phoneCall.clientId);
                        const urgencyColor = client?.urgencyClassification === "Extremely Urgent" ? "border-purple-500" :
                                           client?.urgencyClassification === "Urgent" ? "border-indigo-500" :
                                           client?.urgencyClassification === "Moderately Urgent" ? "border-blue-500" :
                                           "border-green-500";
                        
                        return (
                          <div
                            key={`call-${callIndex}`}
                            className={`w-0 h-0 border-l-[3px] border-r-[3px] border-b-[4px] border-transparent ${urgencyColor.replace('border-', 'border-b-')}`}
                            data-testid={`call-indicator-${phoneCall.id}`}
                          ></div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Upcoming Visits */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 shadow-md" data-testid="upcoming-visits">
          <div className="px-6 py-4 border-b border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">{t('calendar.upcomingVisits')}</h3>
          </div>
          <div className="p-6">
            {upcomingVisits.length === 0 ? (
              <div className="text-center text-muted-foreground py-8" data-testid="no-visits">
                {t('calendar.noUpcomingVisits')}
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingVisits.map((visit) => {
                  const client = getClientDetails(visit.clientId);
                  const visitDate = new Date(visit.scheduledDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const visitDay = new Date(visitDate);
                  visitDay.setHours(0, 0, 0, 0);
                  const diffDays = Math.floor((visitDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const dateLabel = diffDays === 0 ? t('calendar.today') : diffDays === 1 ? t('calendar.tomorrow') : diffDays < 7 ? t('calendar.inDays', { days: diffDays }) : visitDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  return (
                    <div
                      key={visit.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 hover:bg-purple-50 dark:hover:bg-purple-950/20"
                      data-testid={`upcoming-visit-${visit.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-700 dark:to-pink-800 text-white border-0" data-testid={`visit-date-badge-${visit.id}`}>
                            {dateLabel}
                          </Badge>
                          <div className="text-sm text-muted-foreground mt-1" data-testid={`visit-month-${visit.id}`}>
                            {formatDate(visitDate)}
                          </div>
                        </div>
                        <div className="w-3 h-8 border-l-2 border-gradient-to-b from-purple-500 to-pink-500 me-2 bg-gradient-to-b from-purple-500 to-pink-500 dark:from-purple-700 dark:to-pink-800"></div>
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-2" data-testid={`visit-client-name-${visit.id}`}>
                            <div className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-blue-700 dark:to-indigo-800 rounded-lg">
                              <Home className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span>{client?.name || t('calendar.unknownClient')}</span>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span data-testid={`visit-time-${visit.id}`}>
                              {formatTime(visit.scheduledTime)}
                            </span>
                            <span>•</span>
                            <span className="text-xs font-medium">{t('calendar.visit')}</span>
                            <span>•</span>
                            {client && (
                              <Badge 
                                className={`${getUrgencyColor(client.urgencyClassification)} border-0 text-xs`}
                                data-testid={`visit-urgency-${visit.id}`}
                              >
                                {client.urgencyClassification === 'Extremely Urgent' ? t('urgency.extremelyUrgent') :
                                 client.urgencyClassification === 'Urgent' ? t('urgency.urgent') :
                                 client.urgencyClassification === 'Moderately Urgent' ? t('urgency.moderatelyUrgent') :
                                 t('urgency.lowUrgency')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCompleteVisit(visit)}
                          disabled={completeVisitMutation.isPending}
                          className="text-green-600 hover:text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                          data-testid={`complete-visit-${visit.id}`}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteVisitMutation.mutate(visit.id)}
                          disabled={deleteVisitMutation.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`delete-visit-${visit.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Phone Calls */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 shadow-md" data-testid="upcoming-phone-calls">
          <div className="px-6 py-4 border-b border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">{t('calendar.upcomingPhoneCalls')}</h3>
          </div>
          <div className="p-6">
            {upcomingPhoneCalls.length === 0 ? (
              <div className="text-center text-muted-foreground py-8" data-testid="no-phone-calls">
                {t('calendar.noUpcomingCalls')}
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingPhoneCalls.map((phoneCall) => {
                  const client = getClientDetails(phoneCall.clientId);
                  const callDate = new Date(phoneCall.scheduledDate);
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const callDay = new Date(callDate);
                  callDay.setHours(0, 0, 0, 0);
                  const diffDays = Math.floor((callDay.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const dateLabel = diffDays === 0 ? t('calendar.today') : diffDays === 1 ? t('calendar.tomorrow') : diffDays < 7 ? t('calendar.inDays', { days: diffDays }) : callDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                  
                  return (
                    <div
                      key={phoneCall.id}
                      className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 hover:shadow-lg hover:-translate-y-1 transition-all duration-200 hover:bg-purple-50 dark:hover:bg-purple-950/20"
                      data-testid={`upcoming-phone-call-${phoneCall.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <Badge className="bg-gradient-to-r from-purple-500 to-pink-500 dark:from-purple-700 dark:to-pink-800 text-white border-0" data-testid={`call-date-badge-${phoneCall.id}`}>
                            {dateLabel}
                          </Badge>
                          <div className="text-sm text-muted-foreground mt-1" data-testid={`phone-call-month-${phoneCall.id}`}>
                            {formatDate(callDate)}
                          </div>
                        </div>
                        <div className="w-3 h-8 border-l-2 border-gradient-to-b from-purple-500 to-pink-500 me-2 bg-gradient-to-b from-purple-500 to-pink-500 dark:from-purple-700 dark:to-pink-800"></div>
                        <div>
                          <div className="font-medium text-foreground flex items-center gap-2" data-testid={`phone-call-client-name-${phoneCall.id}`}>
                            <div className="p-1.5 bg-gradient-to-r from-green-500 to-emerald-500 dark:from-green-700 dark:to-emerald-800 rounded-lg">
                              <Phone className="h-3.5 w-3.5 text-white" />
                            </div>
                            <span>{client?.name || t('calendar.unknownClient')}</span>
                          </div>
                          <div className="text-sm text-muted-foreground flex items-center gap-2">
                            <span data-testid={`phone-call-time-${phoneCall.id}`}>
                              {formatTime(phoneCall.scheduledTime)}
                            </span>
                            <span>•</span>
                            <span className="text-xs font-medium">{t('calendar.phoneCall')}</span>
                            {'callType' in phoneCall && (
                              <>
                                <span>•</span>
                                <span className="text-xs">
                                  {phoneCall.callType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </span>
                              </>
                            )}
                            <span>•</span>
                            {client && (
                              <Badge 
                                className={`${getUrgencyColor(client.urgencyClassification)} border-0 text-xs`}
                                data-testid={`phone-call-urgency-${phoneCall.id}`}
                              >
                                {client.urgencyClassification === 'Extremely Urgent' ? t('urgency.extremelyUrgent') :
                                 client.urgencyClassification === 'Urgent' ? t('urgency.urgent') :
                                 client.urgencyClassification === 'Moderately Urgent' ? t('urgency.moderatelyUrgent') :
                                 t('urgency.lowUrgency')}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCompletePhoneCall(phoneCall)}
                          disabled={completePhoneCallMutation.isPending}
                          className="text-green-600 hover:text-green-600 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                          data-testid={`complete-phone-call-${phoneCall.id}`}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deletePhoneCallMutation.mutate(phoneCall.id)}
                          disabled={deletePhoneCallMutation.isPending}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          data-testid={`delete-phone-call-${phoneCall.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Completed Interactions */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-lg border border-purple-200 dark:border-purple-800 shadow-md" data-testid="completed-interactions">
          <div className="px-6 py-4 border-b border-purple-200 dark:border-purple-800 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-950/30 dark:to-pink-950/30">
            <h3 className="text-lg font-semibold text-purple-900 dark:text-purple-100">{t('calendar.recentCompletedInteractions')}</h3>
          </div>
          <div className="p-6">
            {completedInteractions.length === 0 ? (
              <div className="text-center text-muted-foreground py-8" data-testid="no-completed-interactions">
                {t('calendar.noCompletedInteractions')}
              </div>
            ) : (
              <div className="space-y-4">
                {completedInteractions.map((interaction) => {
                  const client = getClientDetails(interaction.clientId);
                  const interactionDate = new Date(interaction.scheduledDate);
                  const isPhoneCall = interaction.type === 'phone_call';
                  
                  return (
                    <div
                      key={interaction.id}
                      className="flex items-center justify-between p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
                      data-testid={`completed-${interaction.type}-${interaction.id}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <div className="text-lg font-bold text-green-700 dark:text-green-300" data-testid={`completed-${interaction.type}-day-${interaction.id}`}>
                            {interactionDate.getDate().toString().padStart(2, '0')}
                          </div>
                          <div className="text-sm text-green-600 dark:text-green-400" data-testid={`completed-${interaction.type}-month-${interaction.id}`}>
                            {formatDate(interactionDate).split(' ')[0]}
                          </div>
                        </div>
                        <div>
                          <div className="font-medium text-green-800 dark:text-green-200 flex items-center gap-2" data-testid={`completed-${interaction.type}-client-name-${interaction.id}`}>
                            {isPhoneCall ? (
                              <div className="p-1.5 bg-gradient-to-r from-green-500 to-emerald-500 dark:from-green-700 dark:to-emerald-800 rounded-lg">
                                <Phone className="h-3.5 w-3.5 text-white" />
                              </div>
                            ) : (
                              <div className="p-1.5 bg-gradient-to-r from-blue-500 to-indigo-500 dark:from-blue-700 dark:to-indigo-800 rounded-lg">
                                <Home className="h-3.5 w-3.5 text-white" />
                              </div>
                            )}
                            <span>{client?.name || t('calendar.unknownClient')}</span>
                          </div>
                          <div className="text-sm text-green-600 dark:text-green-400 flex items-center space-x-2">
                            <span data-testid={`completed-${interaction.type}-time-${interaction.id}`}>
                              {formatTime(interaction.scheduledTime)}
                            </span>
                            <span>•</span>
                            <span className="text-xs font-medium">
                              {isPhoneCall ? t('calendar.phoneCall') : t('calendar.visit')}
                            </span>
                            {isPhoneCall && 'duration' in interaction && interaction.duration && (
                              <>
                                <span>•</span>
                                <span className="text-xs">
                                  {interaction.duration} {t('calendar.min')}
                                </span>
                              </>
                            )}
                            {client?.feedbackScore && (
                              <>
                                <span>•</span>
                                <span className="font-medium" data-testid={`completed-${interaction.type}-score-${interaction.id}`}>
                                  {t('calendar.score')}: {client.feedbackScore}/5
                                </span>
                              </>
                            )}
                            {interaction.notes && (
                              <>
                                <span>•</span>
                                <span className="italic" data-testid={`completed-${interaction.type}-notes-${interaction.id}`}>
                                  "{interaction.notes}"
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <ScheduleModal
          isOpen={showScheduleModal}
          onClose={() => {
            setShowScheduleModal(false);
            setPreSelectedClientId(null);
            setPreSelectedAction(null);
            setPreSelectedClientName(null);
          }}
          onScheduled={() => {
            refetchVisits();
            refetchPhoneCalls();
          }}
          type={scheduleModalType}
          preSelectedClientId={preSelectedClientId || undefined}
          preSelectedClientName={preSelectedClientName || undefined}
        />

        {/* Enhanced Feedback Modal */}
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
                  <br />
                  <strong>{t('calendar.date')}:</strong> {new Date((selectedVisit || selectedPhoneCall)!.scheduledDate).toLocaleDateString()}
                  <br />
                  <strong>{t('calendar.time')}:</strong> {formatTime((selectedVisit || selectedPhoneCall)!.scheduledTime)}
                  {selectedPhoneCall && 'callType' in selectedPhoneCall && (
                    <>
                      <br />
                      <strong>{t('calendar.callType')}:</strong> {selectedPhoneCall.callType.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </>
                  )}
                </div>
              )}

              {/* Payment Willingness Assessment */}
              <div className="space-y-2">
                <Label className="block text-sm font-medium text-foreground">
                  {t('calendar.paymentWillingnessLabel')}
                </Label>
                <Select value={paymentWillingness} onValueChange={setPaymentWillingness}>
                  <SelectTrigger data-testid="payment-willingness-select">
                    <SelectValue placeholder={t('calendar.paymentWillingnessPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.paymentWillingness1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.paymentWillingness2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.paymentWillingness3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.paymentWillingness4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.paymentWillingness5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Financial Situation Assessment */}
              <div className="space-y-2">
                <Label className="block text-sm font-medium text-foreground">
                  {t('calendar.financialSituationLabel')}
                </Label>
                <Select value={financialSituation} onValueChange={setFinancialSituation}>
                  <SelectTrigger data-testid="financial-situation-select">
                    <SelectValue placeholder={t('calendar.financialSituationPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.financialSituation1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.financialSituation2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.financialSituation3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.financialSituation4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.financialSituation5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Communication Quality Assessment */}
              <div className="space-y-2">
                <Label className="block text-sm font-medium text-foreground">
                  {t('calendar.communicationQualityLabel')}
                </Label>
                <Select value={communicationQuality} onValueChange={setCommunicationQuality}>
                  <SelectTrigger data-testid="communication-quality-select">
                    <SelectValue placeholder={t('calendar.communicationQualityPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.communicationQuality1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.communicationQuality2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.communicationQuality3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.communicationQuality4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.communicationQuality5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Compliance & Cooperation Assessment */}
              <div className="space-y-2">
                <Label className="block text-sm font-medium text-foreground">
                  {t('calendar.complianceCooperationLabel')}
                </Label>
                <Select value={complianceCooperation} onValueChange={setComplianceCooperation}>
                  <SelectTrigger data-testid="compliance-cooperation-select">
                    <SelectValue placeholder={t('calendar.complianceCooperationPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.complianceCooperation1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.complianceCooperation2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.complianceCooperation3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.complianceCooperation4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.complianceCooperation5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Future Payment Outlook Assessment */}
              <div className="space-y-2">
                <Label className="block text-sm font-medium text-foreground">
                  {t('calendar.futureOutlookLabel')}
                </Label>
                <Select value={futureOutlook} onValueChange={setFutureOutlook}>
                  <SelectTrigger data-testid="future-outlook-select">
                    <SelectValue placeholder={t('calendar.futureOutlookPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">{t('calendar.futureOutlook1')}</SelectItem>
                    <SelectItem value="2">{t('calendar.futureOutlook2')}</SelectItem>
                    <SelectItem value="3">{t('calendar.futureOutlook3')}</SelectItem>
                    <SelectItem value="4">{t('calendar.futureOutlook4')}</SelectItem>
                    <SelectItem value="5">{t('calendar.futureOutlook5')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Visit Notes */}
              <div className="space-y-2">
                <Label htmlFor="feedback">{t('calendar.visitNotesOptional')}</Label>
                <Textarea
                  id="feedback"
                  placeholder={t('calendar.visitNotesPlaceholder')}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  className="min-h-[80px]"
                  data-testid="visit-feedback-textarea"
                />
              </div>

              {/* Calculated Score Display */}
              <div className="bg-muted/30 p-3 rounded-md">
                <Label className="block text-sm font-medium text-foreground mb-2">
                  {t('calendar.calculatedScore')}
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
                  {t('calendar.scoreUsageText')}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowFeedbackModal(false)}
                data-testid="cancel-feedback-button"
              >
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleSubmitFeedback}
                disabled={completeVisitMutation.isPending}
                data-testid="submit-feedback-button"
              >
                {completeVisitMutation.isPending ? t('calendar.completing') : t('calendar.completeVisit')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
