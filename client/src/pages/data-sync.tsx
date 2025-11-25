import { useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Navigation } from "@/components/navigation";
import { DataSync } from "@/components/data-sync";
import { useAuth } from "@/lib/auth";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Database, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import type { Client } from "@shared/schema";
import { useTranslation } from 'react-i18next';

export default function DataSyncPage() {
  const { t } = useTranslation();
  const { user, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();
  
  usePageTracking({ pageName: "Data Sync", pageRoute: "/data-sync" });

  useEffect(() => {
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, setLocation]);

  const { data: clients = [], refetch } = useQuery<Client[]>({
    queryKey: ['/api/clients', user?.loanOfficerId],
    enabled: !!user?.loanOfficerId,
  });

  if (!isAuthenticated || !user) {
    return null;
  }

  const totalClients = clients.length;
  const atRiskClients = clients.filter(client => client.isAtRisk).length;
  const urgentClients = clients.filter(client => 
    client.urgencyClassification === 'Extremely Urgent' || 
    client.urgencyClassification === 'Urgent'
  ).length;

  return (
    <div className="min-h-screen bg-background" data-testid="data-sync-page">
      <Navigation />
      <div className="p-6 max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-3xl font-bold text-foreground">{t('dataSync.title')}</h1>
              <p className="text-muted-foreground">{t('dataSync.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Data Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card data-testid="card-total-clients">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dataSync.totalClients')}</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold" data-testid="text-total-clients">{totalClients}</div>
              <p className="text-xs text-muted-foreground">
                {t('dataSync.activeClientRecords')}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-at-risk-clients">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dataSync.atRiskClients')}</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive" data-testid="text-at-risk-clients">{atRiskClients}</div>
              <p className="text-xs text-muted-foreground">
                {totalClients > 0 ? Math.round((atRiskClients / totalClients) * 100) : 0}{t('dataSync.ofTotalClients')}
              </p>
            </CardContent>
          </Card>

          <Card data-testid="card-urgent-clients">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{t('dataSync.urgentVisits')}</CardTitle>
              <RefreshCw className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500" data-testid="text-urgent-clients">{urgentClients}</div>
              <p className="text-xs text-muted-foreground">
                {t('dataSync.needImmediateAttention')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Data Sync Component */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              {t('dataSync.title')}
            </CardTitle>
            <CardDescription>
              {t('dataSync.syncDescription')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DataSync onSyncComplete={() => refetch()} />
          </CardContent>
        </Card>

        {/* Data Status Information */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              {t('dataSync.dataQualityStatus')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">{t('dataSync.officer')} {user.name}</h4>
                <p className="text-sm text-muted-foreground">{t('dataSync.loanOfficerId')} {user.loanOfficerId}</p>
                <p className="text-sm text-muted-foreground">
                  {t('dataSync.lastUpdated')} {clients.length > 0 ? t('dataSync.recentlySynced') : t('dataSync.noDataAvailable')}
                </p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium text-sm">{t('dataSync.dataIntegrity')}</h4>
                <p className="text-sm text-muted-foreground">
                  ✅ {t('dataSync.weightBasedMLRiskScoring')}
                </p>
                <p className="text-sm text-muted-foreground">
                  ✅ {t('dataSync.officerSpecificFiltering')}
                </p>
                <p className="text-sm text-muted-foreground">
                  ✅ {t('dataSync.autoResyncOnOfficerChange')}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}