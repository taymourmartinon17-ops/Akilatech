import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { User, Users, AlertTriangle, CheckCircle, Calendar, TrendingUp, Search, Eye, KeyRound, Copy, Check } from "lucide-react";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface LoanOfficerStats {
  loanOfficerId: string;
  name?: string;
  totalClients: number;
  urgentClients: number;
  highRiskClients: number;
  completedVisits: number;
  pendingVisits: number;
  averageRiskScore: number;
  lastActivityDate?: Date;
}

interface LoanOfficerDetails {
  loanOfficerId: string;
  name?: string;
  totalClients: number;
  urgentClients: number;
  highRiskClients: number;
  completedVisits: number;
  pendingVisits: number;
  averageRiskScore: number;
  recentClients: Array<{
    id: string;
    name: string;
    riskScore: number;
    urgencyClassification: string;
    compositeUrgency: number;
  }>;
  upcomingVisits: Array<{
    id: string;
    clientId: string;
    scheduledDate: string;
    scheduledTime: string;
    status: string;
  }>;
}

function OfficerCard({ officer, onViewDetails }: { 
  officer: LoanOfficerStats; 
  onViewDetails: (officerId: string) => void;
}) {
  const urgencyLevel = officer.urgentClients > 10 ? 'high' : officer.urgentClients > 5 ? 'medium' : 'low';
  const riskLevel = officer.averageRiskScore > 70 ? 'high' : officer.averageRiskScore > 50 ? 'medium' : 'low';

  return (
    <Card className="hover:shadow-xl transition-all duration-300 hover:scale-105 border-2 border-gray-100 overflow-hidden" data-testid={`card-officer-${officer.loanOfficerId}`}>
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <User className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-base text-white font-bold" data-testid={`text-officer-name-${officer.loanOfficerId}`}>
                {officer.name || `Officer ${officer.loanOfficerId}`}
              </CardTitle>
              <CardDescription className="text-blue-100 text-xs" data-testid={`text-officer-id-${officer.loanOfficerId}`}>
                ID: {officer.loanOfficerId}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => onViewDetails(officer.loanOfficerId)}
            className="bg-white/20 hover:bg-white/30 text-white border-white/30"
            data-testid={`button-view-details-${officer.loanOfficerId}`}
          >
            <Eye className="h-3.5 w-3.5 me-1" />
            Details
          </Button>
        </div>
      </div>
      
      <CardContent className="space-y-4 pt-4">
        {/* Client Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <div>
              <p className="text-sm text-gray-600">Total Clients</p>
              <p className="font-semibold" data-testid={`text-total-clients-${officer.loanOfficerId}`}>
                {officer.totalClients}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-4 w-4 ${urgencyLevel === 'high' ? 'text-red-500' : urgencyLevel === 'medium' ? 'text-yellow-500' : 'text-green-500'}`} />
            <div>
              <p className="text-sm text-gray-600">Urgent Clients</p>
              <div className="font-semibold" data-testid={`text-urgent-clients-${officer.loanOfficerId}`}>
                {officer.urgentClients}
                <Badge 
                  variant={urgencyLevel === 'high' ? 'destructive' : urgencyLevel === 'medium' ? 'secondary' : 'default'}
                  className="ms-2"
                >
                  {urgencyLevel}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {/* Risk and Visit Statistics */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <TrendingUp className={`h-4 w-4 ${riskLevel === 'high' ? 'text-red-500' : riskLevel === 'medium' ? 'text-yellow-500' : 'text-green-500'}`} />
            <div>
              <p className="text-sm text-gray-600">Avg Risk Score</p>
              <p className="font-semibold" data-testid={`text-risk-score-${officer.loanOfficerId}`}>
                {officer.averageRiskScore.toFixed(1)}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <div>
              <p className="text-sm text-gray-600">Completed Visits</p>
              <p className="font-semibold" data-testid={`text-completed-visits-${officer.loanOfficerId}`}>
                {officer.completedVisits}
              </p>
            </div>
          </div>
        </div>

        {/* High Risk and Pending Visits */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t">
          <div className="text-center">
            <p className="text-sm text-gray-600">High Risk Clients</p>
            <p className="font-semibold text-red-600" data-testid={`text-high-risk-${officer.loanOfficerId}`}>
              {officer.highRiskClients}
            </p>
          </div>
          
          <div className="text-center">
            <p className="text-sm text-gray-600">Pending Visits</p>
            <p className="font-semibold text-blue-600" data-testid={`text-pending-visits-${officer.loanOfficerId}`}>
              {officer.pendingVisits}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OfficerDetailView({ officerId, onBack }: { 
  officerId: string; 
  onBack: () => void;
}) {
  const { toast } = useToast();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: details, isLoading, error } = useQuery<LoanOfficerDetails>({
    queryKey: ['/api/admin/officers', officerId],
    enabled: !!officerId,
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (loanOfficerId: string) => {
      const response = await apiRequest('POST', `/api/admin/reset-password/${loanOfficerId}`);
      return response.json();
    },
    onSuccess: (data) => {
      setTempPassword(data.temporaryPassword);
      toast({
        title: "Password Reset Successfully",
        description: "A temporary password has been generated. Please share it securely with the loan officer.",
      });
    },
    onError: (error) => {
      toast({
        title: "Password Reset Failed",
        description: error instanceof Error ? error.message : "Failed to reset password",
        variant: "destructive",
      });
    }
  });

  const handleCopyPassword = () => {
    if (tempPassword) {
      navigator.clipboard.writeText(tempPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCloseResetDialog = () => {
    setShowResetDialog(false);
    setTempPassword(null);
    setCopied(false);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            ← Back to Officers
          </Button>
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack} data-testid="button-back">
          ← Back to Officers
        </Button>
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load officer details. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={onBack} data-testid="button-back">
            ← Back to Officers
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid={`text-detail-name-${officerId}`}>
              {details.name || `Officer ${details.loanOfficerId}`}
            </h1>
            <p className="text-gray-600" data-testid={`text-detail-id-${officerId}`}>
              Loan Officer ID: {details.loanOfficerId}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="button-reset-password">
                <KeyRound className="h-4 w-4 me-2" />
                Reset Password
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset Password</DialogTitle>
                <DialogDescription>
                  {tempPassword ? (
                    "Password has been reset. Share this temporary password securely with the loan officer."
                  ) : (
                    `Are you sure you want to reset the password for ${details.name || details.loanOfficerId}? They will need to use the temporary password to log in.`
                  )}
                </DialogDescription>
              </DialogHeader>
              
              {tempPassword ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-4 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <code className="flex-1 text-lg font-mono font-bold text-center" data-testid="text-temp-password">
                      {tempPassword}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyPassword}
                      data-testid="button-copy-password"
                    >
                      {copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      This password will only be shown once. Make sure to copy it before closing this dialog.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : null}
              
              <DialogFooter>
                {tempPassword ? (
                  <Button onClick={handleCloseResetDialog} data-testid="button-close-reset-dialog">
                    Done
                  </Button>
                ) : (
                  <>
                    <Button variant="outline" onClick={() => setShowResetDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={() => resetPasswordMutation.mutate(officerId)}
                      disabled={resetPasswordMutation.isPending}
                      data-testid="button-confirm-reset"
                    >
                      {resetPasswordMutation.isPending ? "Resetting..." : "Reset Password"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <Link to={`/dashboard/officer/${details.loanOfficerId}`}>
            <Button data-testid="button-view-clients">
              View All Clients
            </Button>
          </Link>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Clients</p>
              <p className="text-2xl font-bold" data-testid="text-detail-total-clients">
                {details.totalClients}
              </p>
            </div>
            <Users className="h-8 w-8 text-blue-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Urgent Clients</p>
              <p className="text-2xl font-bold text-red-600" data-testid="text-detail-urgent-clients">
                {details.urgentClients}
              </p>
            </div>
            <AlertTriangle className="h-8 w-8 text-red-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed Visits</p>
              <p className="text-2xl font-bold text-green-600" data-testid="text-detail-completed-visits">
                {details.completedVisits}
              </p>
            </div>
            <CheckCircle className="h-8 w-8 text-green-600" />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center justify-between p-6">
            <div>
              <p className="text-sm font-medium text-gray-600">Avg Risk Score</p>
              <p className="text-2xl font-bold text-orange-600" data-testid="text-detail-risk-score">
                {details.averageRiskScore.toFixed(1)}
              </p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-600" />
          </CardContent>
        </Card>
      </div>

      {/* Recent High Priority Clients */}
      {details.recentClients && details.recentClients.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              High Priority Clients
            </CardTitle>
            <CardDescription>
              Clients sorted by urgency score (showing top 10)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {details.recentClients.map((client) => (
                <div
                  key={client.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  data-testid={`row-client-${client.id}`}
                >
                  <div>
                    <p className="font-medium" data-testid={`text-client-name-${client.id}`}>
                      {client.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      Risk Score: {client.riskScore.toFixed(1)} • 
                      Urgency: {client.urgencyClassification}
                    </p>
                  </div>
                  <div className="text-end">
                    <Badge 
                      variant={
                        client.urgencyClassification === 'Extremely Urgent' ? 'destructive' :
                        client.urgencyClassification === 'Urgent' ? 'secondary' : 'default'
                      }
                    >
                      {client.urgencyClassification}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Upcoming Visits */}
      {details.upcomingVisits && details.upcomingVisits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Upcoming Visits
            </CardTitle>
            <CardDescription>
              Scheduled visits for this loan officer
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {details.upcomingVisits.map((visit) => (
                <div
                  key={visit.id}
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  data-testid={`row-visit-${visit.id}`}
                >
                  <div>
                    <p className="font-medium">
                      Client: {visit.clientId}
                    </p>
                    <p className="text-sm text-gray-600">
                      {new Date(visit.scheduledDate).toLocaleDateString()} at {visit.scheduledTime}
                    </p>
                  </div>
                  <Badge variant="outline">
                    {visit.status}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOfficer, setSelectedOfficer] = useState<string | null>(null);

  const { data: officers = [], isLoading, error } = useQuery<LoanOfficerStats[]>({
    queryKey: ['/api/admin/officers'],
  });

  if (selectedOfficer) {
    return (
      <OfficerDetailView 
        officerId={selectedOfficer} 
        onBack={() => setSelectedOfficer(null)} 
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-10 w-64" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Failed to load loan officer data. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Ensure officers is an array and properly typed
  const officersArray = Array.isArray(officers) ? officers as LoanOfficerStats[] : [];

  const filteredOfficers = officersArray.filter((officer: LoanOfficerStats) =>
    officer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    officer.loanOfficerId.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalClients = officersArray.reduce((sum: number, officer: LoanOfficerStats) => {
    return sum + Number(officer.totalClients || 0);
  }, 0);
  
  const totalUrgentClients = officersArray.reduce((sum: number, officer: LoanOfficerStats) => {
    return sum + Number(officer.urgentClients || 0);
  }, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl px-6 py-8 shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white" data-testid="text-admin-title">
              Loan Officer Management
            </h1>
            <p className="text-purple-100 mt-2" data-testid="text-admin-subtitle">
              Overview of all loan officers and their performance metrics
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative">
              <Search className="absolute start-3 top-3 h-4 w-4 text-purple-300" />
              <Input
                placeholder="Search officers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="ps-10 w-64 bg-white/20 border-white/30 text-white placeholder:text-purple-200 focus:bg-white/30"
                data-testid="input-search"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-2 border-blue-100 hover:shadow-lg transition-shadow overflow-hidden">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-1">
            <CardContent className="bg-white flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Loan Officers</p>
                <p className="text-3xl font-bold text-blue-600 mt-2" data-testid="text-total-officers">
                  {officers.length}
                </p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-blue-400 to-blue-600 rounded-lg flex items-center justify-center shadow-md">
                <User className="h-7 w-7 text-white" />
              </div>
            </CardContent>
          </div>
        </Card>

        <Card className="border-2 border-green-100 hover:shadow-lg transition-shadow overflow-hidden">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-1">
            <CardContent className="bg-white flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Clients</p>
                <p className="text-3xl font-bold text-green-600 mt-2" data-testid="text-summary-total-clients">
                  {totalClients.toLocaleString()}
                </p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-green-400 to-green-600 rounded-lg flex items-center justify-center shadow-md">
                <Users className="h-7 w-7 text-white" />
              </div>
            </CardContent>
          </div>
        </Card>

        <Card className="border-2 border-red-100 hover:shadow-lg transition-shadow overflow-hidden">
          <div className="bg-gradient-to-br from-red-50 to-orange-50 p-1">
            <CardContent className="bg-white flex items-center justify-between p-6">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Urgent Clients</p>
                <p className="text-3xl font-bold text-red-600 mt-2" data-testid="text-summary-urgent-clients">
                  {totalUrgentClients.toLocaleString()}
                </p>
              </div>
              <div className="w-14 h-14 bg-gradient-to-br from-red-400 to-red-600 rounded-lg flex items-center justify-center shadow-md">
                <AlertTriangle className="h-7 w-7 text-white" />
              </div>
            </CardContent>
          </div>
        </Card>
      </div>

      {/* Officers Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredOfficers.map((officer: LoanOfficerStats) => (
          <OfficerCard
            key={officer.loanOfficerId}
            officer={officer}
            onViewDetails={setSelectedOfficer}
          />
        ))}
      </div>

      {filteredOfficers.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500" data-testid="text-no-results">
            No loan officers found matching your search.
          </p>
        </div>
      )}
    </div>
  );
}