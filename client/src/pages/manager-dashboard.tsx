import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Users, 
  Phone, 
  Calendar, 
  AlertTriangle, 
  Search,
  ChevronRight,
  UserCheck,
  TrendingUp
} from "lucide-react";
import { AssignVisitModal } from "@/components/assign-visit-modal";

interface ClientWithRecommendation {
  id: string;
  clientId: string;
  clientName: string;
  loanOfficerId: string;
  riskScore: number | null;
  urgencyClassification: string;
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
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientWithRecommendation | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientWithRecommendation[]>({
    queryKey: ['/api/manager/clients'],
  });

  const { data: loanOfficers = [] } = useQuery<LoanOfficer[]>({
    queryKey: ['/api/manager/loan-officers'],
  });

  const filteredClients = clients.filter(client => 
    client.clientName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.clientId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    client.loanOfficerId?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const visitRecommendations = clients.filter(c => c.aiRecommendation === 'visit');
  const callRecommendations = clients.filter(c => c.aiRecommendation === 'call');
  const urgentClients = clients.filter(c => c.urgencyClassification === 'Urgent');

  const handleAssignVisit = (client: ClientWithRecommendation) => {
    setSelectedClient(client);
    setShowAssignModal(true);
  };

  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'Urgent':
        return <Badge className="bg-purple-600 hover:bg-purple-700" data-testid="badge-urgent">{t('urgency.urgent')}</Badge>;
      case 'High Urgency':
        return <Badge className="bg-indigo-600 hover:bg-indigo-700" data-testid="badge-high">{t('urgency.high')}</Badge>;
      case 'Medium Urgency':
        return <Badge className="bg-blue-600 hover:bg-blue-700" data-testid="badge-medium">{t('urgency.medium')}</Badge>;
      default:
        return <Badge className="bg-green-600 hover:bg-green-700" data-testid="badge-low">{t('urgency.low')}</Badge>;
    }
  };

  const getRecommendationBadge = (recommendation: string) => {
    switch (recommendation) {
      case 'visit':
        return <Badge className="bg-purple-600 hover:bg-purple-700" data-testid="badge-visit-rec">{t('manager.scheduleVisit')}</Badge>;
      case 'call':
        return <Badge className="bg-indigo-500 hover:bg-indigo-600" data-testid="badge-call-rec">{t('manager.scheduleCall')}</Badge>;
      default:
        return null;
    }
  };

  if (clientsLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50 dark:bg-slate-900">
        <div className="animate-pulse text-slate-600 dark:text-slate-400">
          {t('common.loading')}...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 p-6" dir={t('direction') === 'rtl' ? 'rtl' : 'ltr'}>
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white" data-testid="text-page-title">
              {t('manager.dashboardTitle')}
            </h1>
            <p className="text-slate-600 dark:text-slate-400">
              {t('manager.welcomeMessage', { name: user?.name })}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card data-testid="card-total-clients">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('manager.totalClients')}
              </CardTitle>
              <Users className="h-4 w-4 text-indigo-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{clients.length}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-loan-officers">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('manager.loanOfficers')}
              </CardTitle>
              <UserCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900 dark:text-white">{loanOfficers.length}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-visit-recommendations">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('manager.visitRecommendations')}
              </CardTitle>
              <Calendar className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{visitRecommendations.length}</div>
            </CardContent>
          </Card>

          <Card data-testid="card-urgent-clients">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-slate-600 dark:text-slate-400">
                {t('manager.urgentClients')}
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600">{urgentClients.length}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="lg:col-span-2" data-testid="card-ai-recommendations">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-indigo-600" />
                {t('manager.aiRecommendations')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {visitRecommendations.slice(0, 5).map((client) => (
                  <div 
                    key={client.id} 
                    className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-100 dark:border-purple-800"
                    data-testid={`card-rec-${client.clientId}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white">{client.clientName}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{client.aiRecommendationReason}</p>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => handleAssignVisit(client)}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid={`button-assign-${client.clientId}`}
                    >
                      <Calendar className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                      {t('manager.assign')}
                    </Button>
                  </div>
                ))}
                {callRecommendations.slice(0, 3).map((client) => (
                  <div 
                    key={client.id} 
                    className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800"
                    data-testid={`card-call-rec-${client.clientId}`}
                  >
                    <div className="flex-1">
                      <p className="font-medium text-slate-900 dark:text-white">{client.clientName}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{client.aiRecommendationReason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-indigo-600" />
                      <span className="text-sm text-indigo-600">{t('manager.callRecommended')}</span>
                    </div>
                  </div>
                ))}
                {visitRecommendations.length === 0 && callRecommendations.length === 0 && (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-4">
                    {t('manager.noRecommendations')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-loan-officers-list">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5 text-green-600" />
                {t('manager.teamMembers')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {loanOfficers.map((officer) => (
                  <div 
                    key={officer.loanOfficerId} 
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
                    data-testid={`card-officer-${officer.loanOfficerId}`}
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-white">{officer.name}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t('manager.clientsCount', { count: officer.clientCount })}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </div>
                ))}
                {loanOfficers.length === 0 && (
                  <p className="text-center text-slate-500 dark:text-slate-400 py-4">
                    {t('manager.noOfficers')}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <Card data-testid="card-all-clients">
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <CardTitle>{t('manager.allClients')}</CardTitle>
              <div className="relative w-full md:w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder={t('manager.searchClients')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.clientName')}</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.loanOfficer')}</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.riskScore')}</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.urgency')}</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.recommendation')}</th>
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.slice(0, 20).map((client) => (
                    <tr 
                      key={client.id} 
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      data-testid={`row-client-${client.clientId}`}
                    >
                      <td className="py-3 px-4">
                        <div>
                          <p className="font-medium text-slate-900 dark:text-white">{client.clientName}</p>
                          <p className="text-xs text-slate-500">{client.clientId}</p>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{client.loanOfficerId}</td>
                      <td className="py-3 px-4">
                        <span className={`font-medium ${(client.riskScore ?? 0) >= 75 ? 'text-red-600' : (client.riskScore ?? 0) >= 50 ? 'text-amber-600' : 'text-green-600'}`}>
                          {client.riskScore ?? '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">{getUrgencyBadge(client.urgencyClassification)}</td>
                      <td className="py-3 px-4">{getRecommendationBadge(client.aiRecommendation)}</td>
                      <td className="py-3 px-4">
                        {client.aiRecommendation === 'visit' && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleAssignVisit(client)}
                            data-testid={`button-assign-table-${client.clientId}`}
                          >
                            {t('manager.assignVisit')}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredClients.length > 20 && (
                <p className="text-center text-sm text-slate-500 dark:text-slate-400 py-4">
                  {t('manager.showingCount', { shown: 20, total: filteredClients.length })}
                </p>
              )}
              {filteredClients.length === 0 && (
                <p className="text-center text-slate-500 dark:text-slate-400 py-8">
                  {t('manager.noClientsFound')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
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
