import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Building2, Users, Database, Settings, LogOut, Plus, BarChart as BarChartIcon, Clock, Activity, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export default function SuperAdminDashboard() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newOrgId, setNewOrgId] = useState("");
  const [newOrgName, setNewOrgName] = useState("");
  const [newAdminName, setNewAdminName] = useState("");
  const [createdOrgResult, setCreatedOrgResult] = useState<{
    orgId: string;
    orgName: string;
    adminLoanOfficerId: string;
    adminName: string;
  } | null>(null);
  const [isCredentialsDialogOpen, setIsCredentialsDialogOpen] = useState(false);
  const [deleteOrgId, setDeleteOrgId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const handleLogout = () => {
    logout();
  };

  // Fetch all organizations with user counts
  const { data: organizations, isLoading } = useQuery<any[]>({
    queryKey: ["/api/super-admin/organizations"],
  });

  // Fetch user counts for each organization
  const { data: organizationStats } = useQuery<Record<string, { totalUsers: number, admins: number, loanOfficers: number, totalClients: number }>>({
    queryKey: ["/api/super-admin/organizations/stats"],
    queryFn: async () => {
      if (!organizations || organizations.length === 0) return {};
      
      const stats: Record<string, any> = {};
      await Promise.all(
        organizations.map(async (org) => {
          const response = await fetch(`/api/super-admin/organizations/${org.id}/stats`, {
            credentials: "include",
          });
          if (response.ok) {
            stats[org.id] = await response.json();
          }
        })
      );
      return stats;
    },
    enabled: !!organizations && organizations.length > 0,
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<any>({
    queryKey: ["/api/super-admin/analytics"],
  });

  // Create organization mutation
  const createOrgMutation = useMutation({
    mutationFn: async ({ id, name, adminName }: { id: string; name: string; adminName: string }) => {
      console.log('[DEBUG] Creating organization with:', { id, name, adminName });
      const response = await apiRequest("POST", "/api/super-admin/organizations", { id, name, adminName: adminName || undefined });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/organizations"] });
      setIsCreateDialogOpen(false);
      setNewOrgId("");
      setNewOrgName("");
      setNewAdminName("");
      
      // Show credentials dialog if admin was created
      if (data.adminUser) {
        setCreatedOrgResult({
          orgId: data.id,
          orgName: data.name,
          adminLoanOfficerId: data.adminUser.loanOfficerId,
          adminName: data.adminUser.name
        });
        setIsCredentialsDialogOpen(true);
      } else {
        toast({
          title: "Success",
          description: data.adminUserError || "Organization created successfully",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    },
  });

  // Delete organization mutation
  const deleteOrgMutation = useMutation({
    mutationFn: async (orgId: string) => {
      const response = await apiRequest("DELETE", `/api/super-admin/organizations/${orgId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/organizations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/super-admin/organizations/stats"] });
      toast({
        title: "Success",
        description: "Organization and all associated data deleted successfully",
      });
      setIsDeleteDialogOpen(false);
      setDeleteOrgId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete organization",
        variant: "destructive",
      });
    },
  });

  const handleCreateOrg = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('[DEBUG] Form submit - newOrgId:', newOrgId, 'newOrgName:', newOrgName, 'newAdminName:', newAdminName);
    if (!newOrgId.trim() || !newOrgName.trim()) {
      console.log('[DEBUG] Validation failed - org ID or name is empty');
      return;
    }
    createOrgMutation.mutate({ id: newOrgId, name: newOrgName, adminName: newAdminName });
  };

  const handleDeleteOrg = (orgId: string, orgName: string) => {
    setDeleteOrgId(orgId);
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (deleteOrgId) {
      deleteOrgMutation.mutate(deleteOrgId);
    }
  };

  // Get organization to delete for confirmation dialog
  const orgToDelete = organizations?.find((org) => org.id === deleteOrgId);
  const orgStats = deleteOrgId && organizationStats ? organizationStats[deleteOrgId] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-md border-b-2 border-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center">
                <i className="fas fa-shield-alt text-white"></i>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Super Admin Portal
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Platform Management
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={handleLogout}
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4 me-2" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Tabs defaultValue="organizations" className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="organizations">
              <Building2 className="w-4 h-4 me-2" />
              Organizations
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChartIcon className="w-4 h-4 me-2" />
              User Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="organizations" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Organizations</p>
                      <p className="text-3xl font-bold">
                        {organizations?.length || 0}
                      </p>
                    </div>
                    <Building2 className="w-12 h-12 text-purple-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                      <p className="text-3xl font-bold">-</p>
                    </div>
                    <Users className="w-12 h-12 text-blue-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Clients</p>
                      <p className="text-3xl font-bold">-</p>
                    </div>
                    <Database className="w-12 h-12 text-green-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">System Status</p>
                      <p className="text-xl font-bold text-green-600">Active</p>
                    </div>
                    <Settings className="w-12 h-12 text-gray-600 opacity-20" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Organizations Table */}
            <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Organizations</CardTitle>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-create-organization">
                    <Plus className="w-4 h-4 me-2" />
                    Create Organization
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create New Organization</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleCreateOrg} className="space-y-4">
                    <div>
                      <Label htmlFor="orgId">Organization ID</Label>
                      <Input
                        id="orgId"
                        value={newOrgId}
                        onChange={(e) => setNewOrgId(e.target.value.toUpperCase())}
                        placeholder="e.g., ACME, MFW, BANK_01"
                        required
                        data-testid="input-org-id"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Unique identifier for the organization. Users will use this to log in.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="orgName">Organization Name</Label>
                      <Input
                        id="orgName"
                        value={newOrgName}
                        onChange={(e) => setNewOrgName(e.target.value)}
                        placeholder="Enter organization name"
                        required
                        data-testid="input-org-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="adminName">Administrator Name (optional)</Label>
                      <Input
                        id="adminName"
                        value={newAdminName}
                        onChange={(e) => setNewAdminName(e.target.value)}
                        placeholder="Enter administrator name"
                        data-testid="input-admin-name"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        An admin account will be created automatically. They will set their own password on first login.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full"
                      disabled={createOrgMutation.isPending}
                      data-testid="button-submit-org"
                    >
                      {createOrgMutation.isPending ? "Creating..." : "Create Organization"}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading organizations...</div>
            ) : organizations && organizations.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Users</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {organizations.map((org: any) => {
                    const stats = organizationStats?.[org.id];
                    return (
                      <TableRow key={org.id}>
                        <TableCell className="font-mono text-sm">{org.id}</TableCell>
                        <TableCell className="font-medium">{org.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-muted-foreground" />
                            <span className="font-semibold">{stats?.totalUsers ?? 0}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {new Date(org.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => setLocation(`/super-admin/organization/${org.id}`)}
                              data-testid={`button-view-details-${org.id}`}
                            >
                              View Details
                            </Button>
                            {org.id !== 'AKILA' && (
                              <Button 
                                variant="destructive" 
                                size="sm"
                                onClick={() => handleDeleteOrg(org.id, org.name)}
                                data-testid={`button-delete-${org.id}`}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No organizations found. Create your first organization to get started.
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>

          <TabsContent value="analytics" className="space-y-6">
            {analyticsLoading ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">Loading analytics data...</p>
              </div>
            ) : analytics ? (
              <>
                {/* Most Visited Pages Chart */}
                <Card>
                  <CardHeader>
                    <CardTitle>Most Visited Pages</CardTitle>
                    <CardDescription>Page visit counts across all loan officers</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={analytics.pageStats || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="pageName" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="visitCount" fill="#8b5cf6" name="Visits" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Average Time Per Page */}
                <Card>
                  <CardHeader>
                    <CardTitle>Average Time Spent Per Page</CardTitle>
                    <CardDescription>How long loan officers spend on each page (in seconds)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={analytics.pageStats || []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="pageName" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="avgTime" fill="#3b82f6" name="Avg Time (seconds)" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Organization Breakdown */}
                <Card>
                  <CardHeader>
                    <CardTitle>Usage by Organization</CardTitle>
                    <CardDescription>Page views and active users per organization</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Organization</TableHead>
                          <TableHead>Page Views</TableHead>
                          <TableHead>Total Time (min)</TableHead>
                          <TableHead>Active Users</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.orgStats && analytics.orgStats.length > 0 ? (
                          analytics.orgStats.map((org: any) => (
                            <TableRow key={org.organizationId}>
                              <TableCell className="font-medium">
                                {org.organizationName || org.organizationId}
                              </TableCell>
                              <TableCell>{org.visitCount}</TableCell>
                              <TableCell>{Math.round(org.totalTime / 60)}</TableCell>
                              <TableCell>{org.uniqueUsers}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No analytics data available yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Most Active Users */}
                <Card>
                  <CardHeader>
                    <CardTitle>Most Active Loan Officers</CardTitle>
                    <CardDescription>Top 10 most active users by page views</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Loan Officer ID</TableHead>
                          <TableHead>Organization</TableHead>
                          <TableHead>Page Views</TableHead>
                          <TableHead>Total Time (min)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {analytics.activeUsers && analytics.activeUsers.length > 0 ? (
                          analytics.activeUsers.map((user: any, index: number) => (
                            <TableRow key={`${user.loanOfficerId}-${index}`}>
                              <TableCell className="font-medium">{user.loanOfficerId}</TableCell>
                              <TableCell>{user.organizationId}</TableCell>
                              <TableCell>{user.visitCount}</TableCell>
                              <TableCell>{Math.round(user.totalTime / 60)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No user activity data available yet
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="text-center py-12">
                <p className="text-muted-foreground">No analytics data available</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Organization</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this organization? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {orgToDelete && (
            <div className="my-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm font-semibold mb-2">Organization Details:</p>
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">ID:</span> {orgToDelete.id}</p>
                <p><span className="font-medium">Name:</span> {orgToDelete.name}</p>
                <p><span className="font-medium">Users:</span> {orgStats?.totalUsers ?? 0}</p>
                <p><span className="font-medium">Clients:</span> {orgStats?.totalClients ?? 0}</p>
              </div>
              <p className="mt-3 text-xs text-red-700 dark:text-red-400 font-semibold">
                ⚠️ All users, clients, visits, and associated data will be permanently deleted.
              </p>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteOrgMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteOrgMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
              data-testid="button-confirm-delete"
            >
              {deleteOrgMutation.isPending ? "Deleting..." : "Delete Organization"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Admin Credentials Dialog */}
      <Dialog open={isCredentialsDialogOpen} onOpenChange={setIsCredentialsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-green-600 flex items-center gap-2">
              <i className="fas fa-check-circle"></i>
              Organization Created Successfully
            </DialogTitle>
          </DialogHeader>
          {createdOrgResult && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                A new organization has been created with an administrator account. Share these login credentials with the organization admin.
              </p>
              
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Organization ID</Label>
                  <p className="font-mono text-lg font-bold">{createdOrgResult.orgId}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Loan Officer ID</Label>
                  <p className="font-mono text-lg font-bold">{createdOrgResult.adminLoanOfficerId}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Administrator Name</Label>
                  <p className="font-medium">{createdOrgResult.adminName}</p>
                </div>
              </div>
              
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  🔐 First Login Instructions
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                  The admin should log in with their Organization ID and Loan Officer ID (no password). They will be prompted to create their own secure password.
                </p>
              </div>
              
              <Button 
                className="w-full" 
                onClick={() => setIsCredentialsDialogOpen(false)}
                data-testid="button-close-credentials"
              >
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
