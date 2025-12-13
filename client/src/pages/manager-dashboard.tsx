import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Users, 
  Search,
  Calendar,
  Phone,
  LogOut,
  TrendingUp,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  Star,
  BarChart3,
  Trophy
} from "lucide-react";
import { AssignVisitModal } from "@/components/assign-visit-modal";
import { LanguageSwitcher } from "@/components/language-switcher";
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface ClientWithRecommendation {
  id: string;
  clientId: string;
  name: string;
  clientName: string;
  loanOfficerId: string;
  riskScore: number;
  urgencyClassification: string;
  compositeUrgency: number;
  outstanding: number;
  lastVisitDate: string | null;
  feedbackScore: number | null;
  aiRecommendation: 'visit' | 'call' | 'none';
  aiRecommendationReason: string;
  loanAmount: number | null;
  currentBalance: number | null;
  daysInArrears: number | null;
}

interface LoanOfficer {
  loanOfficerId: string;
  name: string;
  clientCount: number;
}

export default function ManagerDashboard() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const isMobile = useIsMobile();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientWithRecommendation | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [activeTab, setActiveTab] = useState("clients");
  
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [officerFilter, setOfficerFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<string>("compositeUrgency");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientWithRecommendation[]>({
    queryKey: ['/api/manager/clients'],
  });

  const { data: loanOfficers = [] } = useQuery<LoanOfficer[]>({
    queryKey: ['/api/manager/loan-officers'],
  });

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

  const formatLastVisit = (date: string | null) => {
    if (!date) return t('dashboard.never');
    const diff = Date.now() - new Date(date).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return t('dashboard.today');
    if (days === 1) return t('dashboard.oneDayAgo');
    return t('dashboard.daysAgo', { days });
  };

  const filteredAndSortedClients = clients
    .filter(client => {
      const clientName = client.name || client.clientName || '';
      const matchesSearch = clientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           client.clientId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           client.loanOfficerId.toLowerCase().includes(searchTerm.toLowerCase());
      
      const currentUrgencyClassification = getUrgencyClassificationFromScore(client.compositeUrgency || 0);
      const matchesUrgency = urgencyFilter === "all" || currentUrgencyClassification === urgencyFilter;
      
      const matchesRisk = (() => {
        if (riskFilter === "all") return true;
        const risk = client.riskScore || 0;
        switch (riskFilter) {
          case "low": return risk < 30;
          case "medium": return risk >= 30 && risk < 70;
          case "high": return risk >= 70;
          default: return true;
        }
      })();
      
      const matchesOfficer = officerFilter === "all" || client.loanOfficerId === officerFilter;
      
      return matchesSearch && matchesUrgency && matchesRisk && matchesOfficer;
    })
    .sort((a, b) => {
      let aValue: number;
      let bValue: number;
      
      switch (sortField) {
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
        default:
          aValue = a.compositeUrgency || 0;
          bValue = b.compositeUrgency || 0;
      }
      
      return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
    });

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleAssignVisit = (client: ClientWithRecommendation) => {
    setSelectedClient(client);
    setShowAssignModal(true);
  };

  const stats = {
    total: clients.length,
    filtered: filteredAndSortedClients.length,
    extremelyUrgent: clients.filter(c => getUrgencyClassificationFromScore(c.compositeUrgency || 0) === "Extremely Urgent").length,
    urgent: clients.filter(c => getUrgencyClassificationFromScore(c.compositeUrgency || 0) === "Urgent").length,
    highRisk: clients.filter(c => (c.riskScore || 0) >= 70).length,
    avgRiskScore: clients.length > 0 ? (clients.reduce((sum, c) => sum + (c.riskScore || 0), 0) / clients.length).toFixed(1) : "0.0",
  };

  const getLoanOfficerName = (officerId: string) => {
    const officer = loanOfficers.find(lo => lo.loanOfficerId === officerId);
    return officer?.name || officerId;
  };

  const renderMobileClientCard = (client: ClientWithRecommendation, index: number) => {
    const clientName = client.name || client.clientName || 'Unknown';
    const currentUrgencyClassification = getUrgencyClassificationFromScore(client.compositeUrgency || 0);
    return (
      <motion.div
        key={client.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: index * 0.05 }}
        className="bg-card border border-border rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow"
        data-testid={`mobile-card-client-${client.clientId}`}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-white">
                {clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-foreground truncate">{clientName}</p>
              <p className="text-sm text-muted-foreground">ID: {client.clientId}</p>
              <p className="text-xs text-indigo-600">{getLoanOfficerName(client.loanOfficerId)}</p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11 shrink-0">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => handleAssignVisit(client)}>
                {client.aiRecommendation === 'call' ? (
                  <Phone className="h-4 w-4 me-2" />
                ) : (
                  <Calendar className="h-4 w-4 me-2" />
                )}
                {t('manager.assignVisit')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <TrendingUp className="h-3.5 w-3.5" />
              {t('client.riskScore')}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{(client.riskScore || 0).toFixed(0)}</span>
              <div className="flex-1 bg-muted rounded-full h-2">
                <div 
                  className={`h-2 rounded-full ${getRiskColor(client.riskScore || 0)}`}
                  style={{ width: `${Math.min(client.riskScore || 0, 100)}%` }}
                />
              </div>
            </div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('dashboard.urgency')}
            </div>
            <Badge className={`${getUrgencyColor(currentUrgencyClassification)} text-xs`}>
              {translateUrgency(currentUrgencyClassification)}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center">
            <p className="text-muted-foreground text-xs">{t('client.outstanding')}</p>
            <p className="font-semibold">{(client.outstanding || 0).toLocaleString()} JOD</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">{t('client.lastVisit')}</p>
            <p className="font-semibold">{formatLastVisit(client.lastVisitDate)}</p>
          </div>
          <div className="text-center">
            <p className="text-muted-foreground text-xs">{t('dashboard.feedback')}</p>
            <div className="flex items-center justify-center gap-1">
              <Star className={`h-4 w-4 ${client.feedbackScore ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground'}`} />
              <span className="font-semibold">{client.feedbackScore || '-'}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-3 border-t border-border">
          <Button
            variant="default"
            size="sm"
            className="flex-1 h-11 bg-indigo-600 hover:bg-indigo-700"
            onClick={() => handleAssignVisit(client)}
          >
            {client.aiRecommendation === 'call' ? (
              <Phone className="h-4 w-4 me-2" />
            ) : (
              <Calendar className="h-4 w-4 me-2" />
            )}
            {t('manager.assignVisit')}
          </Button>
        </div>
      </motion.div>
    );
  };

  const renderDesktopTable = () => (
    <div className="bg-card rounded-xl border border-border overflow-hidden" data-testid="manager-clients-table">
      <div className="bg-indigo-600 px-6 py-4">
        <h2 className="text-xl font-bold text-white">{t('manager.allClients')}</h2>
        <p className="text-indigo-100 text-sm">{t('dashboard.showingClients', { filtered: filteredAndSortedClients.length, total: clients.length })}</p>
      </div>
      
      <div className="p-4 border-b border-border space-y-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              type="text"
              placeholder={t('manager.searchClients')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="ps-10"
              data-testid="input-search"
            />
          </div>
          
          <Button
            variant="outline"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-2"
          >
            <Filter className="h-4 w-4" />
            {t('dashboard.filters')}
            {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder={t('dashboard.allRiskLevels')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('dashboard.allRiskLevels')}</SelectItem>
                    <SelectItem value="low">{t('dashboard.lowRiskLabel')}</SelectItem>
                    <SelectItem value="medium">{t('dashboard.mediumRiskLabel')}</SelectItem>
                    <SelectItem value="high">{t('dashboard.highRiskLabel')}</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select value={officerFilter} onValueChange={setOfficerFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder={t('manager.allLoanOfficers')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t('manager.allLoanOfficers')}</SelectItem>
                    {loanOfficers.map(officer => (
                      <SelectItem key={officer.loanOfficerId} value={officer.loanOfficerId}>
                        {officer.name} ({officer.clientCount})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.clientName')}</th>
              <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.loanOfficer')}</th>
              <th 
                className="text-start py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort('riskScore')}
              >
                <div className="flex items-center gap-1">
                  {t('manager.riskScore')}
                  {sortField === 'riskScore' && (
                    sortDirection === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                  )}
                </div>
              </th>
              <th 
                className="text-start py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort('compositeUrgency')}
              >
                <div className="flex items-center gap-1">
                  {t('manager.urgency')}
                  {sortField === 'compositeUrgency' && (
                    sortDirection === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                  )}
                </div>
              </th>
              <th 
                className="text-start py-3 px-4 font-medium text-muted-foreground cursor-pointer hover:text-foreground"
                onClick={() => handleSort('outstanding')}
              >
                <div className="flex items-center gap-1">
                  {t('client.outstanding')}
                  {sortField === 'outstanding' && (
                    sortDirection === 'desc' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />
                  )}
                </div>
              </th>
              <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('client.lastVisit')}</th>
              <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedClients.map((client, index) => {
              const clientName = client.name || client.clientName || 'Unknown';
              const currentUrgencyClassification = getUrgencyClassificationFromScore(client.compositeUrgency || 0);
              return (
                <motion.tr
                  key={client.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: index * 0.02 }}
                  className="border-b border-border hover:bg-muted/30 transition-colors"
                  data-testid={`row-client-${client.clientId}`}
                >
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-500 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-white">
                          {clientName.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{clientName}</p>
                        <p className="text-xs text-muted-foreground">{client.clientId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-muted-foreground">{getLoanOfficerName(client.loanOfficerId)}</span>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{(client.riskScore || 0).toFixed(0)}</span>
                      <div className="w-16 bg-muted rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${getRiskColor(client.riskScore || 0)}`}
                          style={{ width: `${Math.min(client.riskScore || 0, 100)}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Badge className={`${getUrgencyColor(currentUrgencyClassification)} text-xs`}>
                      {translateUrgency(currentUrgencyClassification)}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm">{(client.outstanding || 0).toLocaleString()} JOD</span>
                  </td>
                  <td className="py-3 px-4">
                    <span className="text-sm text-muted-foreground">{formatLastVisit(client.lastVisitDate)}</span>
                  </td>
                  <td className="py-3 px-4">
                    <Button 
                      size="sm" 
                      onClick={() => handleAssignVisit(client)}
                      className="bg-indigo-600 hover:bg-indigo-700"
                      data-testid={`button-assign-${client.clientId}`}
                    >
                      {client.aiRecommendation === 'call' ? (
                        <Phone className="h-4 w-4 me-1" />
                      ) : (
                        <Calendar className="h-4 w-4 me-1" />
                      )}
                      {t('manager.assignVisit')}
                    </Button>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
        {filteredAndSortedClients.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{t('manager.noClientsFound')}</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderTeamPerformanceTab = () => (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-indigo-500 to-indigo-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-indigo-100 text-sm">{t('manager.totalLoanOfficers')}</p>
                <p className="text-2xl font-bold">{loanOfficers.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-purple-500 to-purple-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-purple-100 text-sm">{t('manager.urgentClients')}</p>
                <p className="text-2xl font-bold">{stats.extremelyUrgent + stats.urgent}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <TrendingUp className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-blue-100 text-sm">{t('manager.avgRiskScore')}</p>
                <p className="text-2xl font-bold">{stats.avgRiskScore}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-gradient-to-br from-green-500 to-green-600 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <BarChart3 className="h-8 w-8 opacity-80" />
              <div>
                <p className="text-green-100 text-sm">{t('manager.highRiskClients')}</p>
                <p className="text-2xl font-bold">{stats.highRisk}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card data-testid="card-loan-officers">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-indigo-600" />
            {t('manager.loanOfficerOverview')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.loanOfficer')}</th>
                  <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.clientCount')}</th>
                  <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.urgentClients')}</th>
                  <th className="text-start py-3 px-4 font-medium text-muted-foreground">{t('manager.avgRiskScore')}</th>
                </tr>
              </thead>
              <tbody>
                {loanOfficers.map((officer, index) => {
                  const officerClients = clients.filter(c => c.loanOfficerId === officer.loanOfficerId);
                  const urgentCount = officerClients.filter(c => {
                    const urgency = getUrgencyClassificationFromScore(c.compositeUrgency || 0);
                    return urgency === "Extremely Urgent" || urgency === "Urgent";
                  }).length;
                  const avgRisk = officerClients.length > 0
                    ? (officerClients.reduce((sum, c) => sum + (c.riskScore || 0), 0) / officerClients.length).toFixed(1)
                    : "0.0";
                  
                  return (
                    <tr 
                      key={officer.loanOfficerId}
                      className="border-b border-border hover:bg-muted/30 transition-colors"
                      data-testid={`row-officer-${officer.loanOfficerId}`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-white">
                              {officer.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-foreground">{officer.name}</p>
                            <p className="text-xs text-muted-foreground">{officer.loanOfficerId}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <Badge variant="secondary">{officer.clientCount}</Badge>
                      </td>
                      <td className="py-3 px-4">
                        {urgentCount > 0 ? (
                          <Badge className="bg-purple-100 text-purple-800">{urgentCount}</Badge>
                        ) : (
                          <Badge className="bg-green-100 text-green-800">0</Badge>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{avgRisk}</span>
                          <div className="w-16 bg-muted rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${getRiskColor(parseFloat(avgRisk))}`}
                              style={{ width: `${Math.min(parseFloat(avgRisk), 100)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {loanOfficers.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>{t('manager.noLoanOfficers')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (clientsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="animate-pulse text-muted-foreground">
          {t('common.loading')}...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir={t('direction') === 'rtl' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground" data-testid="text-page-title">
              {t('manager.dashboardTitle')}
            </h1>
            <p className="text-muted-foreground">
              {t('manager.welcomeMessage', { name: user?.name })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1">
              <Users className="h-4 w-4 me-2" />
              {clients.length} {t('manager.totalClients')}
            </Badge>
            <LanguageSwitcher />
            <Button 
              variant="outline" 
              size="sm" 
              onClick={logout}
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4 me-2" />
              {t('navigation.logout')}
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="clients" className="gap-2" data-testid="tab-clients">
              <Users className="h-4 w-4" />
              {t('manager.clientsTab')}
            </TabsTrigger>
            <TabsTrigger value="performance" className="gap-2" data-testid="tab-performance">
              <BarChart3 className="h-4 w-4" />
              {t('manager.teamPerformanceTab')}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="clients" className="space-y-4">
            {isMobile ? (
              <div className="space-y-4 pb-20">
                <div className="bg-indigo-600 rounded-xl px-4 py-3">
                  <h2 className="text-lg font-bold text-white">{t('manager.allClients')}</h2>
                  <p className="text-indigo-100 text-sm">{t('dashboard.showingClients', { filtered: filteredAndSortedClients.length, total: clients.length })}</p>
                </div>
                
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute start-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                    <Input
                      type="text"
                      placeholder={t('manager.searchClients')}
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="ps-10 h-12"
                      data-testid="input-mobile-search"
                    />
                  </div>
                  
                  {filteredAndSortedClients.length > 0 ? (
                    filteredAndSortedClients.map((client, index) => renderMobileClientCard(client, index))
                  ) : (
                    <div className="text-center py-12 text-muted-foreground">
                      <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>{t('manager.noClientsFound')}</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              renderDesktopTable()
            )}
          </TabsContent>
          
          <TabsContent value="performance">
            {renderTeamPerformanceTab()}
          </TabsContent>
        </Tabs>
      </div>

      {showAssignModal && selectedClient && (
        <AssignVisitModal
          client={selectedClient}
          loanOfficers={loanOfficers}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedClient(null);
          }}
        />
      )}
    </div>
  );
}
