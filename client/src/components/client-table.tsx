import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FeedbackModal } from "./feedback-modal";
import { ScoreExplanationModal } from "./score-explanation-modal";
import { ClientDetailModal } from "./client-detail-modal";
import { useAuth } from "@/lib/auth";
import type { Client } from "@shared/schema";
import { Users, AlertTriangle, TrendingUp, DollarSign, Activity, CheckCircle2, Search, Filter, X, Clock, Star, Sparkles, ChevronDown, ChevronUp } from "lucide-react";
import { motion } from "framer-motion";

interface ClientTableProps {
  clients: Client[];
  onClientUpdate: () => void;
  onSingleClientRecalculate?: (clientId: string, updatedData: Partial<Client>) => Promise<void>;
}

export function ClientTable({ clients, onClientUpdate, onSingleClientRecalculate }: ClientTableProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [outstandingFilter, setOutstandingFilter] = useState<string>("all");
  const [visitFilter, setVisitFilter] = useState<string>("all");
  const [feedbackFilter, setFeedbackFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("compositeUrgency");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [showScoreModal, setShowScoreModal] = useState(false);
  const [scoreType, setScoreType] = useState<'risk' | 'urgency' | null>(null);
  const [scoreModalClient, setScoreModalClient] = useState<Client | null>(null);
  const [showClientDetailModal, setShowClientDetailModal] = useState(false);
  const [detailModalClient, setDetailModalClient] = useState<Client | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Calculate urgency classification from current score (not stored value)
  const getUrgencyClassificationFromScore = (urgencyScore: number): string => {
    if (urgencyScore >= 60) return "Extremely Urgent";
    if (urgencyScore >= 40) return "Urgent";
    if (urgencyScore >= 20) return "Moderately Urgent";
    return "Low Urgency";
  };

  const translateUrgency = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent":
        return t('urgency.extremelyUrgent');
      case "Urgent":
        return t('urgency.urgent');
      case "Moderately Urgent":
        return t('urgency.moderatelyUrgent');
      case "Low Urgency":
        return t('urgency.lowUrgency');
      default:
        return urgency;
    }
  };

  const getUrgencyColor = (urgency: string) => {
    switch (urgency) {
      case "Extremely Urgent":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-400";
      case "Urgent":
        return "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400";
      case "Moderately Urgent":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400";
      case "Low Urgency":
        return "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-400";
    }
  };

  const getRiskColor = (score: number) => {
    if (score >= 70) return "bg-purple-500";
    if (score >= 50) return "bg-indigo-500";
    if (score >= 30) return "bg-blue-500";
    return "bg-green-500";
  };

  const formatLastVisit = (date: Date | null) => {
    if (!date) return t('dashboard.never');
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return t('dashboard.today');
    if (days === 1) return t('dashboard.oneDayAgo');
    return t('dashboard.daysAgo', { days });
  };

  const filteredAndSortedClients = clients
    .filter(client => {
      const matchesSearch = client.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           client.clientId.toLowerCase().includes(searchTerm.toLowerCase());
      const currentUrgencyClassification = getUrgencyClassificationFromScore(client.compositeUrgency || 0);
      const matchesUrgency = !urgencyFilter || urgencyFilter === "all" || currentUrgencyClassification === urgencyFilter;
      
      // Risk score filter
      const matchesRisk = (() => {
        if (!riskFilter || riskFilter === "all") return true;
        const risk = client.riskScore;
        switch (riskFilter) {
          case "low": return risk < 30;
          case "medium": return risk >= 30 && risk < 70;
          case "high": return risk >= 70;
          default: return true;
        }
      })();
      
      // Outstanding amount filter
      const matchesOutstanding = (() => {
        if (!outstandingFilter || outstandingFilter === "all") return true;
        const outstanding = client.outstanding;
        switch (outstandingFilter) {
          case "low": return outstanding < 5000;
          case "medium": return outstanding >= 5000 && outstanding < 15000;
          case "high": return outstanding >= 15000;
          default: return true;
        }
      })();
      
      // Last visit filter
      const matchesVisit = (() => {
        if (!visitFilter || visitFilter === "all") return true;
        const lastVisit = client.lastVisitDate;
        if (!lastVisit && visitFilter === "never") return true;
        if (!lastVisit) return false;
        
        const daysSince = Math.floor((Date.now() - new Date(lastVisit).getTime()) / (1000 * 60 * 60 * 24));
        switch (visitFilter) {
          case "recent": return daysSince <= 7;
          case "overdue": return daysSince > 30;
          case "month": return daysSince > 7 && daysSince <= 30;
          case "never": return false; // Already handled above
          default: return true;
        }
      })();
      
      // Feedback score filter
      const matchesFeedback = (() => {
        if (!feedbackFilter || feedbackFilter === "all") return true;
        const feedback = client.feedbackScore;
        if (!feedback && feedbackFilter === "none") return true;
        if (!feedback) return false;
        
        switch (feedbackFilter) {
          case "excellent": return feedback >= 4;
          case "good": return feedback === 3;
          case "poor": return feedback <= 2;
          case "none": return false; // Already handled above
          default: return true;
        }
      })();
      
      return matchesSearch && matchesUrgency && matchesRisk && matchesOutstanding && matchesVisit && matchesFeedback;
    })
    .sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      // Handle special sort fields
      switch (sortField) {
        case 'lastVisitDate':
          aValue = a.lastVisitDate ? new Date(a.lastVisitDate).getTime() : 0;
          bValue = b.lastVisitDate ? new Date(b.lastVisitDate).getTime() : 0;
          break;
        case 'daysSinceLastVisit':
          aValue = a.lastVisitDate ? Math.floor((Date.now() - new Date(a.lastVisitDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;
          bValue = b.lastVisitDate ? Math.floor((Date.now() - new Date(b.lastVisitDate).getTime()) / (1000 * 60 * 60 * 24)) : 999;
          break;
        case 'feedbackScore':
          aValue = a.feedbackScore || 0;
          bValue = b.feedbackScore || 0;
          break;
        case 'riskScore':
          aValue = a.riskScore || 0;
          bValue = b.riskScore || 0;
          break;
        case 'compositeUrgency':
          aValue = a.compositeUrgency || 0;
          bValue = b.compositeUrgency || 0;
          break;
        case 'outstanding':
          aValue = a.outstanding || 0;
          bValue = b.outstanding || 0;
          break;
        case 'urgencyClassification':
          // Map urgency classifications to numeric values for proper sorting
          const urgencyOrder = {
            'Extremely Urgent': 4,
            'Urgent': 3,
            'Moderately Urgent': 2,
            'Low Urgency': 1
          };
          aValue = urgencyOrder[a.urgencyClassification as keyof typeof urgencyOrder] || 0;
          bValue = urgencyOrder[b.urgencyClassification as keyof typeof urgencyOrder] || 0;
          break;
        default:
          aValue = a[sortField as keyof Client];
          bValue = b[sortField as keyof Client];
      }
      
      // Handle null/undefined values consistently
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return sortDirection === 'asc' ? -1 : 1;
      if (bValue == null) return sortDirection === 'asc' ? 1 : -1;
      
      // Convert strings to lowercase for comparison
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        aValue = aValue.toLowerCase();
        bValue = bValue.toLowerCase();
      }
      
      // Handle numeric comparison
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        if (sortDirection === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      }
      
      // Default comparison for other types
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleUpdateVisit = (client: Client) => {
    setSelectedClient(client);
    setShowFeedbackModal(true);
  };

  const handleShowScoreExplanation = (client: Client, type: 'risk' | 'urgency') => {
    setScoreModalClient(client);
    setScoreType(type);
    setShowScoreModal(true);
  };

  const handleShowClientDetail = (client: Client) => {
    setDetailModalClient(client);
    setShowClientDetailModal(true);
  };

  const stats = {
    total: filteredAndSortedClients.length,
    totalAllClients: clients.length,
    extremelyUrgent: filteredAndSortedClients.filter(c => c.urgencyClassification === "Extremely Urgent").length,
    urgent: filteredAndSortedClients.filter(c => c.urgencyClassification === "Urgent").length,
    avgRiskScore: filteredAndSortedClients.length > 0 ? (filteredAndSortedClients.reduce((sum, c) => sum + c.riskScore, 0) / filteredAndSortedClients.length).toFixed(1) : "0.0",
    avgOutstanding: filteredAndSortedClients.length > 0 ? (filteredAndSortedClients.reduce((sum, c) => sum + c.outstanding, 0) / filteredAndSortedClients.length).toFixed(0) : "0",
  };

  return (
    <div className="space-y-6" data-testid="client-table-container">
      {/* Client Risk Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden" data-testid="clients-table">
        <div className="bg-indigo-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">{t('dashboard.clientRiskAssessment')}</h2>
          <p className="text-indigo-100 text-sm mt-1">{t('dashboard.showingClients', { filtered: filteredAndSortedClients.length, total: clients.length })}</p>
        </div>

        {/* Search and Filters */}
        <div className={`bg-indigo-50 border-b border-indigo-200 transition-all duration-200 ${showFilters ? 'p-6' : 'px-6 py-4'}`}>
          <div className={`flex items-center justify-between ${showFilters ? 'mb-4' : ''}`}>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-indigo-600 rounded-lg">
                <Filter className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-800">{t('dashboard.filterSearch')}</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="hover:bg-gray-200/50 transition-colors"
              data-testid="button-toggle-filters"
            >
              {showFilters ? (
                <>
                  <ChevronUp className="h-4 w-4 me-1" />
                  {t('dashboard.hideFilters')}
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 me-1" />
                  {t('dashboard.showFilters')}
                </>
              )}
            </Button>
          </div>
          
          {showFilters && (
            <div className="flex flex-col space-y-4 animate-in fade-in duration-200">
            {/* Search Bar */}
            <div className="relative w-full">
              <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                type="text"
                placeholder={t('dashboard.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-10 w-full bg-white border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                data-testid="input-client-search"
              />
            </div>
              
              {/* Filter Row 1 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger data-testid="select-urgency-filter">
                    <SelectValue placeholder={t('dashboard.allUrgencyLevels')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dashboard.allUrgencyLevels')}</SelectItem>
                    <SelectItem value="Extremely Urgent">{t('urgency.extremelyUrgent')}</SelectItem>
                    <SelectItem value="Urgent">{t('urgency.urgent')}</SelectItem>
                    <SelectItem value="Moderately Urgent">{t('urgency.moderatelyUrgent')}</SelectItem>
                    <SelectItem value="Low Urgency">{t('urgency.lowUrgency')}</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={riskFilter} onValueChange={setRiskFilter}>
                  <SelectTrigger data-testid="select-risk-filter">
                    <SelectValue placeholder={t('dashboard.allRiskLevels')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dashboard.allRiskLevels')}</SelectItem>
                    <SelectItem value="low">{t('dashboard.lowRiskLabel')}</SelectItem>
                    <SelectItem value="medium">{t('dashboard.mediumRiskLabel')}</SelectItem>
                    <SelectItem value="high">{t('dashboard.highRiskLabel')}</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={outstandingFilter} onValueChange={setOutstandingFilter}>
                  <SelectTrigger data-testid="select-outstanding-filter">
                    <SelectValue placeholder={t('dashboard.allOutstandingAmounts')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dashboard.allOutstandingAmounts')}</SelectItem>
                    <SelectItem value="low">{t('dashboard.lowOutstandingLabel')}</SelectItem>
                    <SelectItem value="medium">{t('dashboard.mediumOutstandingLabel')}</SelectItem>
                    <SelectItem value="high">{t('dashboard.highOutstandingLabel')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* Filter Row 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select value={visitFilter} onValueChange={setVisitFilter}>
                  <SelectTrigger data-testid="select-visit-filter">
                    <SelectValue placeholder={t('dashboard.allVisitHistory')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dashboard.allVisitHistory')}</SelectItem>
                    <SelectItem value="recent">{t('dashboard.recentVisit')}</SelectItem>
                    <SelectItem value="month">{t('dashboard.monthlyVisit')}</SelectItem>
                    <SelectItem value="overdue">{t('dashboard.overdueVisit')}</SelectItem>
                    <SelectItem value="never">{t('dashboard.neverVisited')}</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={feedbackFilter} onValueChange={setFeedbackFilter}>
                  <SelectTrigger data-testid="select-feedback-filter">
                    <SelectValue placeholder={t('dashboard.allFeedbackScores')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dashboard.allFeedbackScores')}</SelectItem>
                    <SelectItem value="excellent">{t('dashboard.excellentFeedback')}</SelectItem>
                    <SelectItem value="good">{t('dashboard.goodFeedback')}</SelectItem>
                    <SelectItem value="poor">{t('dashboard.poorFeedback')}</SelectItem>
                    <SelectItem value="none">{t('dashboard.noFeedback')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
            {/* Quick Filter Presets */}
            <div className="border-t border-gray-200 pt-4 mt-2">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <p className="text-sm font-semibold text-gray-700">{t('dashboard.quickFilters')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setUrgencyFilter("Extremely Urgent");
                    setRiskFilter("all");
                    setOutstandingFilter("all");
                    setVisitFilter("all");
                    setFeedbackFilter("all");
                  }}
                  className="hover:bg-red-500 hover:text-white hover:border-transparent transition-all duration-300"
                  data-testid="preset-extremely-urgent"
                >
                  <AlertTriangle className="h-3.5 w-3.5 me-1.5" />
                  {t('urgency.extremelyUrgent')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setRiskFilter("high");
                    setUrgencyFilter("all");
                    setOutstandingFilter("all");
                    setVisitFilter("all");
                    setFeedbackFilter("all");
                  }}
                  className="hover:bg-purple-500 hover:text-white hover:border-transparent transition-all duration-300"
                  data-testid="preset-high-risk"
                >
                  <TrendingUp className="h-3.5 w-3.5 me-1.5" />
                  {t('dashboard.highRiskClients')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setVisitFilter("overdue");
                    setUrgencyFilter("all");
                    setRiskFilter("all");
                    setOutstandingFilter("all");
                    setFeedbackFilter("all");
                  }}
                  className="hover:bg-indigo-500 hover:text-white hover:border-transparent transition-all duration-300"
                  data-testid="preset-overdue-visits"
                >
                  <Clock className="h-3.5 w-3.5 me-1.5" />
                  {t('dashboard.overdueVisits')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFeedbackFilter("poor");
                    setUrgencyFilter("all");
                    setRiskFilter("all");
                    setOutstandingFilter("all");
                    setVisitFilter("all");
                  }}
                  className="hover:bg-blue-500 hover:text-white hover:border-transparent transition-all duration-300"
                  data-testid="preset-poor-feedback"
                >
                  <Star className="h-3.5 w-3.5 me-1.5" />
                  {t('dashboard.poorFeedbackFilter')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOutstandingFilter("high");
                    setUrgencyFilter("all");
                    setRiskFilter("all");
                    setVisitFilter("all");
                    setFeedbackFilter("all");
                  }}
                  className="hover:bg-indigo-500 hover:text-white hover:border-transparent transition-all duration-300"
                  data-testid="preset-high-outstanding"
                >
                  <DollarSign className="h-3.5 w-3.5 me-1.5" />
                  {t('dashboard.highOutstanding')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("");
                    setUrgencyFilter("all");
                    setRiskFilter("all");
                    setOutstandingFilter("all");
                    setVisitFilter("all");
                    setFeedbackFilter("all");
                  }}
                  className="hover:bg-gray-100 transition-all duration-300"
                  data-testid="preset-clear-all"
                >
                  <X className="h-3.5 w-3.5 me-1.5" />
                  {t('dashboard.clearAllFilters')}
                </Button>
              </div>
            </div>
          </div>
          )}
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-indigo-50 border-b-2 border-indigo-200">
              <tr>
                <th 
                  className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                  onClick={() => handleSort('name')}
                  data-testid="header-client-name"
                >
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    {t('client.name')}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                  onClick={() => handleSort('riskScore')}
                  data-testid="header-risk-score"
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    {t('client.riskScore')}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                  onClick={() => handleSort('compositeUrgency')}
                  data-testid="header-urgency"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {t('dashboard.urgency')}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                  onClick={() => handleSort('lastVisitDate')}
                  data-testid="header-last-visit"
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    {t('client.lastVisit')}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                  onClick={() => handleSort('outstanding')}
                  data-testid="header-outstanding"
                >
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    {t('client.outstanding')}
                  </div>
                </th>
                <th 
                  className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider cursor-pointer hover:bg-indigo-100/50 transition-colors"
                  onClick={() => handleSort('feedbackScore')}
                  data-testid="header-feedback"
                >
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4" />
                    {t('dashboard.feedback')}
                  </div>
                </th>
                <th className="px-6 py-4 text-start text-xs font-bold text-indigo-900 uppercase tracking-wider">
                  {t('dashboard.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {filteredAndSortedClients.length > 0 ? (
                filteredAndSortedClients.map((client, index) => (
                  <motion.tr 
                    key={client.id} 
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.03 }}
                    whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
                    className="hover:bg-indigo-50/50 transition-all duration-200 hover:shadow-sm" 
                    data-testid={`row-client-${client.clientId}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center me-3 shadow-md">
                          <span className="text-sm font-bold text-white">
                            {client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </span>
                        </div>
                        <div>
                          <button
                            className="text-sm font-medium text-foreground hover:text-primary hover:underline cursor-pointer text-start"
                            onClick={() => handleShowClientDetail(client)}
                            data-testid={`text-client-name-${client.clientId}`}
                          >
                            {client.name}
                          </button>
                          <div className="text-sm text-muted-foreground" data-testid={`text-client-id-${client.clientId}`}>
                            ID: {client.clientId}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div 
                        className="flex items-center cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                        onClick={() => handleShowScoreExplanation(client, 'risk')}
                        data-testid={`clickable-risk-score-${client.clientId}`}
                        title="Click to see detailed risk score breakdown"
                      >
                        <span className="text-lg font-bold text-foreground me-2" data-testid={`text-risk-score-${client.clientId}`}>
                          {client.riskScore.toFixed(1)}
                        </span>
                        <div className="w-16 bg-muted rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${getRiskColor(client.riskScore)}`}
                            style={{ width: `${Math.min(client.riskScore, 100)}%` }}
                          ></div>
                        </div>
                        <i className="fas fa-info-circle ms-2 text-muted-foreground text-xs"></i>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div 
                        className="inline-block cursor-pointer hover:scale-105 transition-transform"
                        onClick={() => handleShowScoreExplanation(client, 'urgency')}
                        title="Click to see detailed urgency score breakdown"
                        data-testid={`clickable-urgency-${client.clientId}`}
                      >
                        <Badge 
                          className={`${getUrgencyColor(getUrgencyClassificationFromScore(client.compositeUrgency || 0))} border-0 inline-flex items-center gap-1`}
                          data-testid={`badge-urgency-${client.clientId}`}
                        >
                          {translateUrgency(getUrgencyClassificationFromScore(client.compositeUrgency || 0))}
                          <i className="fas fa-info-circle text-xs opacity-70"></i>
                        </Badge>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-last-visit-${client.clientId}`}>
                      {formatLastVisit(client.lastVisitDate)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-foreground" data-testid={`text-outstanding-${client.clientId}`}>
                      {client.outstanding.toLocaleString()} JOD
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground" data-testid={`text-feedback-${client.clientId}`}>
                      {client.feedbackScore ? (
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{client.feedbackScore}/5</span>
                          <div className="flex gap-0.5">
                            {[1, 2, 3, 4, 5].map((star) => (
                              <i 
                                key={star}
                                className={`fas fa-star text-xs ${star <= client.feedbackScore! ? 'text-yellow-400' : 'text-gray-300'}`}
                              />
                            ))}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic">{t('dashboard.noFeedback')}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex items-center gap-2">
                        {client.actionSuggestions && client.actionSuggestions.length > 0 && (
                          <div className="relative group">
                            <button
                              onClick={() => handleShowClientDetail(client)}
                              className="text-blue-600 hover:text-blue-700 transition-colors p-1 rounded"
                              title="AI recommendations available - click to view"
                              data-testid={`button-ai-suggestions-${client.clientId}`}
                            >
                              <i className="fas fa-robot text-lg animate-pulse"></i>
                            </button>
                            <div className="absolute -top-1 -right-1 w-2 h-2 bg-purple-500 rounded-full animate-pulse"></div>
                          </div>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUpdateVisit(client)}
                          className="text-primary hover:text-primary/80"
                          data-testid={`button-update-visit-${client.clientId}`}
                        >
                          <i className="fas fa-edit me-1"></i>{t('dashboard.updateVisit')}
                        </Button>
                      </div>
                    </td>
                  </motion.tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-muted-foreground" data-testid="empty-state">
                    {searchTerm || (urgencyFilter && urgencyFilter !== "all") || (riskFilter && riskFilter !== "all") || (outstandingFilter && outstandingFilter !== "all") || (visitFilter && visitFilter !== "all") || (feedbackFilter && feedbackFilter !== "all") ? t('dashboard.noClientsMatchingCriteria') : t('dashboard.noClientsAvailable')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => setShowFeedbackModal(false)}
        client={selectedClient}
        onUpdate={onClientUpdate}
        onSingleClientRecalculate={onSingleClientRecalculate}
      />

      <ScoreExplanationModal
        isOpen={showScoreModal}
        onClose={() => setShowScoreModal(false)}
        client={scoreModalClient}
        scoreType={scoreType}
      />

      <ClientDetailModal
        isOpen={showClientDetailModal}
        onClose={() => setShowClientDetailModal(false)}
        client={detailModalClient}
      />
    </div>
  );
}
