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
  Search,
  Calendar,
  Phone
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

  const getRiskColor = (score: number | null) => {
    if (score === null) return 'text-slate-500';
    if (score >= 75) return 'text-purple-600';
    if (score >= 50) return 'text-amber-600';
    return 'text-green-600';
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
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1">
              <Users className="h-4 w-4 ltr:mr-2 rtl:ml-2" />
              {clients.length} {t('manager.totalClients')}
            </Badge>
          </div>
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
                    <th className="text-left py-3 px-4 font-medium text-slate-600 dark:text-slate-400">{t('manager.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredClients.map((client) => (
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
                        <span className={`font-medium ${getRiskColor(client.riskScore)}`}>
                          {client.riskScore ?? '-'}
                        </span>
                      </td>
                      <td className="py-3 px-4">{getUrgencyBadge(client.urgencyClassification)}</td>
                      <td className="py-3 px-4">
                        <Button 
                          size="sm" 
                          onClick={() => handleAssignVisit(client)}
                          className="bg-indigo-600 hover:bg-indigo-700"
                          data-testid={`button-assign-${client.clientId}`}
                        >
                          {client.aiRecommendation === 'call' ? (
                            <Phone className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                          ) : (
                            <Calendar className="h-4 w-4 ltr:mr-1 rtl:ml-1" />
                          )}
                          {t('manager.assignVisit')}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
