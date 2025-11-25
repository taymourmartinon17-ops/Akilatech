import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLocation, useRoute } from "wouter";
import { ArrowLeft, Building2, Users, Database, UserCheck } from "lucide-react";

export default function OrganizationDetail() {
  const [, setLocation] = useLocation();
  const [, params] = useRoute("/super-admin/organization/:orgId");
  const orgId = params?.orgId;

  // Fetch organization details
  const { data: organization, isLoading: orgLoading, error: orgError } = useQuery<any>({
    queryKey: ["/api/super-admin/organizations", orgId],
    enabled: !!orgId,
  });

  // Fetch organization stats
  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery<any>({
    queryKey: ["/api/super-admin/organizations", orgId, "stats"],
    enabled: !!orgId,
  });

  const isLoading = orgLoading || statsLoading;
  const hasError = orgError || statsError;

  if (!orgId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Organization not found</p>
            <Button
              onClick={() => setLocation("/super-admin")}
              className="w-full mt-4"
            >
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md border-b-2 border-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setLocation("/super-admin")}
                data-testid="button-back"
              >
                <ArrowLeft className="w-4 h-4 me-2" />
                Back
              </Button>
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <Building2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {isLoading ? "Loading..." : organization?.name || "Organization"}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  ID: {orgId}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading organization details...</p>
          </div>
        ) : hasError ? (
          <Card className="max-w-2xl mx-auto">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-lg font-semibold text-destructive mb-2">
                  Failed to load organization
                </p>
                <p className="text-muted-foreground mb-4">
                  The organization could not be found or you don't have permission to view it.
                </p>
                <Button onClick={() => setLocation("/super-admin")}>
                  Back to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Organization Info Card */}
            <Card className="mb-8">
              <CardHeader>
                <CardTitle>Organization Information</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Organization ID</p>
                    <p className="font-mono text-lg font-semibold">{organization?.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Organization Name</p>
                    <p className="text-lg font-semibold">{organization?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Created Date</p>
                    <p className="text-lg font-semibold">
                      {organization?.createdAt 
                        ? new Date(organization.createdAt).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })
                        : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                      <p className="text-3xl font-bold">
                        {stats?.totalUsers ?? 0}
                      </p>
                    </div>
                    <Users className="w-12 h-12 text-blue-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Loan Officers</p>
                      <p className="text-3xl font-bold">
                        {stats?.loanOfficers ?? 0}
                      </p>
                    </div>
                    <UserCheck className="w-12 h-12 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Clients</p>
                      <p className="text-3xl font-bold">
                        {stats?.totalClients ?? 0}
                      </p>
                    </div>
                    <Database className="w-12 h-12 text-purple-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Admins</p>
                      <p className="text-3xl font-bold">
                        {stats?.admins ?? 0}
                      </p>
                    </div>
                    <Building2 className="w-12 h-12 text-orange-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
