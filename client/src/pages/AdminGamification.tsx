import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format } from "date-fns";
import { Navigation } from "@/components/navigation";
import { AdminRoute } from "@/components/admin-route";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, Edit, Trash, Check, X, Download, Trophy, Award, Calendar as CalendarIcon, Settings, AlertCircle } from "lucide-react";
import type { GamificationRule, GamificationSeason, GamificationBadge, GamificationEvent } from "@shared/schema";
import { useTranslation } from 'react-i18next';

// Form Schemas
const ruleFormSchema = z.object({
  eventType: z.string().min(1, "Action type is required"),
  description: z.string().min(1, "Description is required"),
  pointValue: z.number().min(0, "Points must be 0 or greater"),
  autoApprovalThreshold: z.number().min(0, "Threshold must be 0 or greater"),
  isActive: z.boolean().default(true),
});

const seasonFormSchema = z.object({
  name: z.string().min(1, "Season name is required"),
  startDate: z.date({ required_error: "Start date is required" }),
  endDate: z.date({ required_error: "End date is required" }),
  isActive: z.boolean().default(false),
});

const badgeFormSchema = z.object({
  name: z.string().min(1, "Badge name is required"),
  description: z.string().min(1, "Description is required"),
  icon: z.string().min(1, "Icon is required"),
  achievementType: z.string().min(1, "Achievement type is required"),
  thresholdValue: z.number().min(1, "Threshold must be greater than 0"),
  isActive: z.boolean().default(true),
});

type RuleFormData = z.infer<typeof ruleFormSchema>;
type SeasonFormData = z.infer<typeof seasonFormSchema>;
type BadgeFormData = z.infer<typeof badgeFormSchema>;

interface LeaderboardEntry {
  loanOfficerId: string;
  name: string;
  totalPoints: number;
  currentStreak: number;
  rank: number;
  badgeCount: number;
}

function AdminGamificationContent() {
  const { t } = useTranslation();
  const { toast } = useToast();
  
  usePageTracking({ pageName: "Admin Gamification", pageRoute: "/admin/gamification" });
  
  const [activeTab, setActiveTab] = useState("rules");
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [seasonDialogOpen, setSeasonDialogOpen] = useState(false);
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<GamificationRule | null>(null);
  const [editingSeason, setEditingSeason] = useState<GamificationSeason | null>(null);
  const [editingBadge, setEditingBadge] = useState<GamificationBadge | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ id: string; type: string } | null>(null);
  const [leaderboardScope, setLeaderboardScope] = useState<'company' | 'branch'>('company');
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('');

  // Queries
  const { data: rules = [], isLoading: rulesLoading } = useQuery<GamificationRule[]>({
    queryKey: ['/api/gamification/rules'],
  });

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery<GamificationSeason[]>({
    queryKey: ['/api/gamification/seasons'],
  });

  const { data: badges = [], isLoading: badgesLoading } = useQuery<GamificationBadge[]>({
    queryKey: ['/api/gamification/badges'],
  });

  const { data: pendingEvents = [], isLoading: eventsLoading } = useQuery<GamificationEvent[]>({
    queryKey: ['/api/gamification/events/pending'],
  });

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: [`/api/gamification/leaderboard?scope=${leaderboardScope}${selectedSeasonId ? `&seasonId=${selectedSeasonId}` : ''}`],
  });

  // Forms
  const ruleForm = useForm<RuleFormData>({
    resolver: zodResolver(ruleFormSchema),
    defaultValues: {
      eventType: "",
      description: "",
      pointValue: 0,
      autoApprovalThreshold: 100,
      isActive: true,
    },
  });

  const seasonForm = useForm<SeasonFormData>({
    resolver: zodResolver(seasonFormSchema),
    defaultValues: {
      name: "",
      startDate: new Date(),
      endDate: new Date(),
      isActive: false,
    },
  });

  const badgeForm = useForm<BadgeFormData>({
    resolver: zodResolver(badgeFormSchema),
    defaultValues: {
      name: "",
      description: "",
      icon: "",
      achievementType: "",
      thresholdValue: 1,
      isActive: true,
    },
  });

  // Mutations - Rules
  const createRuleMutation = useMutation({
    mutationFn: async (data: RuleFormData) => {
      return await apiRequest('/api/gamification/rules', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/rules'] });
      toast({ title: t('common.success'), description: t('gamification.ruleCreatedSuccess') });
      setRuleDialogOpen(false);
      ruleForm.reset();
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.ruleCreateFailed'), variant: "destructive" });
    },
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<RuleFormData> }) => {
      return await apiRequest(`/api/gamification/rules/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/rules'] });
      toast({ title: t('common.success'), description: t('gamification.ruleUpdatedSuccess') });
      setRuleDialogOpen(false);
      setEditingRule(null);
      ruleForm.reset();
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.ruleUpdateFailed'), variant: "destructive" });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/gamification/rules/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/rules'] });
      toast({ title: t('common.success'), description: t('gamification.ruleDeletedSuccess') });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.ruleDeleteFailed'), variant: "destructive" });
    },
  });

  // Mutations - Seasons
  const createSeasonMutation = useMutation({
    mutationFn: async (data: SeasonFormData) => {
      return await apiRequest('/api/gamification/seasons', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/seasons'] });
      toast({ title: t('common.success'), description: t('gamification.seasonCreatedSuccess') });
      setSeasonDialogOpen(false);
      seasonForm.reset();
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.seasonCreateFailed'), variant: "destructive" });
    },
  });

  const updateSeasonMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<SeasonFormData> }) => {
      return await apiRequest(`/api/gamification/seasons/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/seasons'] });
      toast({ title: t('common.success'), description: t('gamification.seasonUpdatedSuccess') });
      setSeasonDialogOpen(false);
      setEditingSeason(null);
      seasonForm.reset();
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.seasonUpdateFailed'), variant: "destructive" });
    },
  });

  const deleteSeasonMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/gamification/seasons/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/seasons'] });
      toast({ title: t('common.success'), description: t('gamification.seasonDeletedSuccess') });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.seasonDeleteFailed'), variant: "destructive" });
    },
  });

  // Mutations - Badges
  const createBadgeMutation = useMutation({
    mutationFn: async (data: BadgeFormData) => {
      return await apiRequest('/api/gamification/badges', 'POST', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/badges'] });
      toast({ title: t('common.success'), description: t('gamification.badgeCreatedSuccess') });
      setBadgeDialogOpen(false);
      badgeForm.reset();
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.badgeCreateFailed'), variant: "destructive" });
    },
  });

  const updateBadgeMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<BadgeFormData> }) => {
      return await apiRequest(`/api/gamification/badges/${id}`, 'PATCH', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/badges'] });
      toast({ title: t('common.success'), description: t('gamification.badgeUpdatedSuccess') });
      setBadgeDialogOpen(false);
      setEditingBadge(null);
      badgeForm.reset();
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.badgeUpdateFailed'), variant: "destructive" });
    },
  });

  const deleteBadgeMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/gamification/badges/${id}`, 'DELETE');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/badges'] });
      toast({ title: t('common.success'), description: t('gamification.badgeDeletedSuccess') });
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.badgeDeleteFailed'), variant: "destructive" });
    },
  });

  const seedBadgesMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/gamification/badges/seed', 'POST');
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/badges'] });
      toast({ 
        title: 'Success', 
        description: `Created ${response.badges?.length || 25} default badges for your organization!` 
      });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to seed badges', variant: "destructive" });
    },
  });

  // Mutations - Events
  const approveEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/gamification/events/${id}/approve`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/events/pending'] });
      toast({ title: t('common.success'), description: t('gamification.eventApprovedSuccess') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.eventApproveFailed'), variant: "destructive" });
    },
  });

  const rejectEventMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/gamification/events/${id}/reject`, 'POST');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/gamification/events/pending'] });
      toast({ title: t('common.success'), description: t('gamification.eventRejectedSuccess') });
    },
    onError: () => {
      toast({ title: t('common.error'), description: t('gamification.eventRejectFailed'), variant: "destructive" });
    },
  });

  // Handlers
  const handleEditRule = (rule: GamificationRule) => {
    setEditingRule(rule);
    ruleForm.reset({
      eventType: rule.eventType,
      description: rule.description,
      pointValue: rule.pointValue,
      autoApprovalThreshold: rule.autoApprovalThreshold,
      isActive: rule.isActive,
    });
    setRuleDialogOpen(true);
  };

  const handleEditSeason = (season: GamificationSeason) => {
    setEditingSeason(season);
    seasonForm.reset({
      name: season.name,
      startDate: new Date(season.startDate),
      endDate: new Date(season.endDate),
      isActive: season.isActive,
    });
    setSeasonDialogOpen(true);
  };

  const handleEditBadge = (badge: GamificationBadge) => {
    setEditingBadge(badge);
    badgeForm.reset({
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      achievementType: badge.achievementType,
      thresholdValue: badge.thresholdValue,
      isActive: badge.isActive,
    });
    setBadgeDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (!itemToDelete) return;
    
    if (itemToDelete.type === 'rule') {
      deleteRuleMutation.mutate(itemToDelete.id);
    } else if (itemToDelete.type === 'season') {
      deleteSeasonMutation.mutate(itemToDelete.id);
    } else if (itemToDelete.type === 'badge') {
      deleteBadgeMutation.mutate(itemToDelete.id);
    }
  };

  const handleExportLeaderboard = async () => {
    try {
      const url = `/api/gamification/export/leaderboard?scope=${leaderboardScope}${selectedSeasonId ? `&seasonId=${selectedSeasonId}` : ''}`;
      const response = await fetch(url, {
        credentials: 'include',
      });
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `leaderboard-${leaderboardScope}-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      toast({ title: t('common.success'), description: t('gamification.leaderboardExportSuccess') });
    } catch (error) {
      toast({ title: t('common.error'), description: t('gamification.leaderboardExportFailed'), variant: "destructive" });
    }
  };

  const onSubmitRule = (data: RuleFormData) => {
    if (editingRule) {
      updateRuleMutation.mutate({ id: editingRule.id, data });
    } else {
      createRuleMutation.mutate(data);
    }
  };

  const onSubmitSeason = (data: SeasonFormData) => {
    if (editingSeason) {
      updateSeasonMutation.mutate({ id: editingSeason.id, data });
    } else {
      createSeasonMutation.mutate(data);
    }
  };

  const onSubmitBadge = (data: BadgeFormData) => {
    if (editingBadge) {
      updateBadgeMutation.mutate({ id: editingBadge.id, data });
    } else {
      createBadgeMutation.mutate(data);
    }
  };

  const formatActionType = (eventType: string) => {
    return eventType.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const activeSeason = seasons.find(s => s.isActive);

  return (
    <div className="min-h-screen bg-background" data-testid="page-admin-gamification">
      <Navigation />
      <div className="p-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold flex items-center gap-2" data-testid="title-gamification-management">
            <Settings className="h-8 w-8" />
            {t('gamification.systemManagement')}
          </h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} data-testid="tabs-gamification">
          <TabsList className="grid w-full grid-cols-5" data-testid="tabs-list">
            <TabsTrigger value="rules" data-testid="tab-rules">{t('gamification.rules')}</TabsTrigger>
            <TabsTrigger value="seasons" data-testid="tab-seasons">{t('gamification.seasons')}</TabsTrigger>
            <TabsTrigger value="badges" data-testid="tab-badges">{t('gamification.badges')}</TabsTrigger>
            <TabsTrigger value="approvals" data-testid="tab-approvals">
              {t('gamification.approvals')}
              {pendingEvents.length > 0 && (
                <Badge variant="destructive" className="ml-2" data-testid="badge-pending-count">
                  {pendingEvents.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="leaderboard" data-testid="tab-leaderboard">{t('gamification.leaderboard')}</TabsTrigger>
          </TabsList>

          {/* Tab 1: Point Rules Management */}
          <TabsContent value="rules" data-testid="content-rules">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle data-testid="title-rules">{t('gamification.pointRules')}</CardTitle>
                    <CardDescription data-testid="description-rules">
                      {t('gamification.managePointRules')}
                    </CardDescription>
                  </div>
                  <Dialog open={ruleDialogOpen} onOpenChange={(open) => {
                    setRuleDialogOpen(open);
                    if (!open) {
                      setEditingRule(null);
                      ruleForm.reset();
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-rule">
                        <Plus className="h-4 w-4 mr-2" />
                        {t('gamification.addNewRule')}
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-testid="dialog-rule-form">
                      <DialogHeader>
                        <DialogTitle data-testid="dialog-title-rule">
                          {editingRule ? t('gamification.editRule') : t('gamification.addNewRule')}
                        </DialogTitle>
                        <DialogDescription>
                          {t('gamification.configurePointRules')}
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...ruleForm}>
                        <form onSubmit={ruleForm.handleSubmit(onSubmitRule)} className="space-y-4">
                          <FormField
                            control={ruleForm.control}
                            name="eventType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('gamification.actionType')}</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder={t('gamification.actionTypePlaceholder')} 
                                    {...field} 
                                    data-testid="input-event-type"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={ruleForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('gamification.description')}</FormLabel>
                                <FormControl>
                                  <Textarea 
                                    placeholder={t('gamification.descriptionPlaceholder')} 
                                    {...field} 
                                    data-testid="textarea-rule-description"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={ruleForm.control}
                            name="pointValue"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('gamification.pointsAwarded')}</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                    data-testid="input-point-value"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={ruleForm.control}
                            name="autoApprovalThreshold"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>{t('gamification.autoApprovalThreshold')}</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={e => field.onChange(parseInt(e.target.value) || 0)}
                                    data-testid="input-auto-approval-threshold"
                                  />
                                </FormControl>
                                <FormDescription>
                                  {t('gamification.autoApprovalThresholdDesc')}
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={ruleForm.control}
                            name="isActive"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value} 
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-rule-active"
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0">{t('gamification.isActive')}</FormLabel>
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button 
                              type="submit" 
                              disabled={createRuleMutation.isPending || updateRuleMutation.isPending}
                              data-testid="button-submit-rule"
                            >
                              {editingRule ? t('gamification.update') : t('gamification.create')} {t('gamification.rule')}
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <div className="space-y-2" data-testid="skeleton-rules">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : rules.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="empty-rules">
                    No rules configured yet
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead data-testid="header-action-type">Action Type</TableHead>
                        <TableHead data-testid="header-points">Points Awarded</TableHead>
                        <TableHead data-testid="header-threshold">Auto-Approval Threshold</TableHead>
                        <TableHead data-testid="header-active">Active</TableHead>
                        <TableHead data-testid="header-actions">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rules.map((rule) => (
                        <TableRow key={rule.id} data-testid={`row-rule-${rule.id}`}>
                          <TableCell data-testid={`cell-action-type-${rule.id}`}>
                            {formatActionType(rule.eventType)}
                          </TableCell>
                          <TableCell data-testid={`cell-points-${rule.id}`}>
                            {rule.pointValue}
                          </TableCell>
                          <TableCell data-testid={`cell-threshold-${rule.id}`}>
                            {rule.autoApprovalThreshold}
                          </TableCell>
                          <TableCell data-testid={`cell-active-${rule.id}`}>
                            <Switch 
                              checked={rule.isActive} 
                              onCheckedChange={(checked) => {
                                updateRuleMutation.mutate({ 
                                  id: rule.id, 
                                  data: { isActive: checked } 
                                });
                              }}
                              data-testid={`switch-rule-active-${rule.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRule(rule)}
                                data-testid={`button-edit-rule-${rule.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setItemToDelete({ id: rule.id, type: 'rule' });
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`button-delete-rule-${rule.id}`}
                              >
                                <Trash className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 2: Season Management */}
          <TabsContent value="seasons" data-testid="content-seasons">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle data-testid="title-seasons">Seasons</CardTitle>
                    <CardDescription data-testid="description-seasons">
                      Manage gamification seasons and competition periods
                    </CardDescription>
                  </div>
                  <Dialog open={seasonDialogOpen} onOpenChange={(open) => {
                    setSeasonDialogOpen(open);
                    if (!open) {
                      setEditingSeason(null);
                      seasonForm.reset();
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button data-testid="button-add-season">
                        <Plus className="h-4 w-4 mr-2" />
                        Create New Season
                      </Button>
                    </DialogTrigger>
                    <DialogContent data-testid="dialog-season-form">
                      <DialogHeader>
                        <DialogTitle data-testid="dialog-title-season">
                          {editingSeason ? 'Edit Season' : 'Create New Season'}
                        </DialogTitle>
                        <DialogDescription>
                          Configure season details for gamification leaderboards
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...seasonForm}>
                        <form onSubmit={seasonForm.handleSubmit(onSubmitSeason)} className="space-y-4">
                          <FormField
                            control={seasonForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Season Name</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="e.g., Q4 2025" 
                                    {...field} 
                                    data-testid="input-season-name"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={seasonForm.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>Start Date</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className="pl-3 text-left font-normal"
                                        data-testid="button-start-date"
                                      >
                                        {field.value ? format(field.value, "PPP") : "Pick a date"}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      initialFocus
                                      data-testid="calendar-start-date"
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={seasonForm.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem className="flex flex-col">
                                <FormLabel>End Date</FormLabel>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <FormControl>
                                      <Button
                                        variant="outline"
                                        className="pl-3 text-left font-normal"
                                        data-testid="button-end-date"
                                      >
                                        {field.value ? format(field.value, "PPP") : "Pick a date"}
                                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                      </Button>
                                    </FormControl>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={field.value}
                                      onSelect={field.onChange}
                                      initialFocus
                                      data-testid="calendar-end-date"
                                    />
                                  </PopoverContent>
                                </Popover>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={seasonForm.control}
                            name="isActive"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value} 
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-season-active"
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0">Set as Active Season</FormLabel>
                                <FormDescription className="!mt-1">
                                  Only one season can be active at a time
                                </FormDescription>
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button 
                              type="submit" 
                              disabled={createSeasonMutation.isPending || updateSeasonMutation.isPending}
                              data-testid="button-submit-season"
                            >
                              {editingSeason ? 'Update' : 'Create'} Season
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {!activeSeason && seasons.length > 0 && (
                  <div className="mb-4 p-4 border border-yellow-500 bg-yellow-50 dark:bg-yellow-950 rounded-lg flex items-center gap-2" data-testid="warning-no-active-season">
                    <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    <p className="text-sm text-yellow-600 dark:text-yellow-400">
                      No active season configured. Activate a season to enable leaderboards.
                    </p>
                  </div>
                )}
                {seasonsLoading ? (
                  <div className="space-y-2" data-testid="skeleton-seasons">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : seasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="empty-seasons">
                    No seasons configured yet
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead data-testid="header-season-name">Season Name</TableHead>
                        <TableHead data-testid="header-start-date">Start Date</TableHead>
                        <TableHead data-testid="header-end-date">End Date</TableHead>
                        <TableHead data-testid="header-status">Status</TableHead>
                        <TableHead data-testid="header-season-actions">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {seasons.map((season) => (
                        <TableRow key={season.id} data-testid={`row-season-${season.id}`}>
                          <TableCell data-testid={`cell-season-name-${season.id}`}>
                            {season.name}
                          </TableCell>
                          <TableCell data-testid={`cell-start-date-${season.id}`}>
                            {format(new Date(season.startDate), "PPP")}
                          </TableCell>
                          <TableCell data-testid={`cell-end-date-${season.id}`}>
                            {format(new Date(season.endDate), "PPP")}
                          </TableCell>
                          <TableCell data-testid={`cell-status-${season.id}`}>
                            {season.isActive ? (
                              <Badge variant="default" data-testid={`badge-active-${season.id}`}>Active</Badge>
                            ) : (
                              <Badge variant="secondary" data-testid={`badge-inactive-${season.id}`}>Inactive</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditSeason(season)}
                                data-testid={`button-edit-season-${season.id}`}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {!season.isActive && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    updateSeasonMutation.mutate({ 
                                      id: season.id, 
                                      data: { isActive: true } 
                                    });
                                  }}
                                  data-testid={`button-activate-season-${season.id}`}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setItemToDelete({ id: season.id, type: 'season' });
                                  setDeleteDialogOpen(true);
                                }}
                                data-testid={`button-delete-season-${season.id}`}
                              >
                                <Trash className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 3: Badge Management */}
          <TabsContent value="badges" data-testid="content-badges">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle data-testid="title-badges">Badges</CardTitle>
                    <CardDescription data-testid="description-badges">
                      Manage achievement badges and their requirements
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    {badges.length === 0 && (
                      <Button 
                        variant="outline"
                        onClick={() => seedBadgesMutation.mutate()}
                        disabled={seedBadgesMutation.isPending}
                        data-testid="button-seed-badges"
                      >
                        <Award className="h-4 w-4 mr-2" />
                        {seedBadgesMutation.isPending ? 'Creating...' : 'Seed Default Badges'}
                      </Button>
                    )}
                    <Dialog open={badgeDialogOpen} onOpenChange={(open) => {
                      setBadgeDialogOpen(open);
                      if (!open) {
                        setEditingBadge(null);
                        badgeForm.reset();
                      }
                    }}>
                      <DialogTrigger asChild>
                        <Button data-testid="button-add-badge">
                          <Plus className="h-4 w-4 mr-2" />
                          Create New Badge
                        </Button>
                      </DialogTrigger>
                    <DialogContent data-testid="dialog-badge-form">
                      <DialogHeader>
                        <DialogTitle data-testid="dialog-title-badge">
                          {editingBadge ? 'Edit Badge' : 'Create New Badge'}
                        </DialogTitle>
                        <DialogDescription>
                          Configure badge details and unlock requirements
                        </DialogDescription>
                      </DialogHeader>
                      <Form {...badgeForm}>
                        <form onSubmit={badgeForm.handleSubmit(onSubmitBadge)} className="space-y-4">
                          <FormField
                            control={badgeForm.control}
                            name="name"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Badge Name</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="e.g., Visit Champion" 
                                    {...field} 
                                    data-testid="input-badge-name"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={badgeForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Description</FormLabel>
                                <FormControl>
                                  <Textarea 
                                    placeholder="Describe how to unlock this badge" 
                                    {...field} 
                                    data-testid="textarea-badge-description"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={badgeForm.control}
                            name="icon"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Icon (Emoji)</FormLabel>
                                <FormControl>
                                  <Input 
                                    placeholder="🏆" 
                                    {...field} 
                                    data-testid="input-badge-icon"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={badgeForm.control}
                            name="achievementType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Achievement Type</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                  <FormControl>
                                    <SelectTrigger data-testid="select-achievement-type">
                                      <SelectValue placeholder="Select achievement type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="visits_count" data-testid="option-visits-count">Visit Count</SelectItem>
                                    <SelectItem value="points_total" data-testid="option-points-total">Total Points</SelectItem>
                                    <SelectItem value="streak_days" data-testid="option-streak-days">Streak Days</SelectItem>
                                    <SelectItem value="high_nps_count" data-testid="option-high-nps-count">High NPS Count</SelectItem>
                                    <SelectItem value="risk_improvement" data-testid="option-risk-improvement">Risk Improvement</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={badgeForm.control}
                            name="thresholdValue"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Threshold Value</FormLabel>
                                <FormControl>
                                  <Input 
                                    type="number" 
                                    {...field} 
                                    onChange={e => field.onChange(parseInt(e.target.value) || 1)}
                                    data-testid="input-badge-threshold"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={badgeForm.control}
                            name="isActive"
                            render={({ field }) => (
                              <FormItem className="flex items-center space-x-2 space-y-0">
                                <FormControl>
                                  <Checkbox 
                                    checked={field.value} 
                                    onCheckedChange={field.onChange}
                                    data-testid="checkbox-badge-active"
                                  />
                                </FormControl>
                                <FormLabel className="!mt-0">Is Active</FormLabel>
                              </FormItem>
                            )}
                          />
                          <DialogFooter>
                            <Button 
                              type="submit" 
                              disabled={createBadgeMutation.isPending || updateBadgeMutation.isPending}
                              data-testid="button-submit-badge"
                            >
                              {editingBadge ? 'Update' : 'Create'} Badge
                            </Button>
                          </DialogFooter>
                        </form>
                      </Form>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
              </CardHeader>
              <CardContent>
                {badgesLoading ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="skeleton-badges">
                    {[...Array(8)].map((_, i) => (
                      <Skeleton key={i} className="h-40 w-full" />
                    ))}
                  </div>
                ) : badges.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="empty-badges">
                    No badges configured yet
                  </p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {badges.map((badge) => (
                      <Card key={badge.id} data-testid={`card-badge-${badge.id}`}>
                        <CardHeader className="pb-3">
                          <div className="text-4xl text-center mb-2" data-testid={`icon-badge-${badge.id}`}>
                            {badge.icon}
                          </div>
                          <CardTitle className="text-sm text-center" data-testid={`name-badge-${badge.id}`}>
                            {badge.name}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <p className="text-xs text-muted-foreground text-center" data-testid={`description-badge-${badge.id}`}>
                            {badge.description}
                          </p>
                          <div className="text-xs text-center space-y-1">
                            <p className="font-medium" data-testid={`requirement-type-${badge.id}`}>
                              {formatActionType(badge.achievementType)}
                            </p>
                            <p className="text-muted-foreground" data-testid={`requirement-threshold-${badge.id}`}>
                              Threshold: {badge.thresholdValue}
                            </p>
                          </div>
                          <div className="flex justify-center gap-2 pt-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditBadge(badge)}
                              data-testid={`button-edit-badge-${badge.id}`}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setItemToDelete({ id: badge.id, type: 'badge' });
                                setDeleteDialogOpen(true);
                              }}
                              data-testid={`button-delete-badge-${badge.id}`}
                            >
                              <Trash className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Pending Approvals */}
          <TabsContent value="approvals" data-testid="content-approvals">
            <Card>
              <CardHeader>
                <CardTitle data-testid="title-approvals">Pending Approvals</CardTitle>
                <CardDescription data-testid="description-approvals">
                  Review and approve gamification events
                </CardDescription>
              </CardHeader>
              <CardContent>
                {eventsLoading ? (
                  <div className="space-y-2" data-testid="skeleton-events">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : pendingEvents.length === 0 ? (
                  <div className="text-center py-8" data-testid="empty-approvals">
                    <Award className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-sm text-muted-foreground">
                      No pending approvals
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead data-testid="header-officer-id">Officer ID</TableHead>
                        <TableHead data-testid="header-event-type">Action Type</TableHead>
                        <TableHead data-testid="header-event-points">Points</TableHead>
                        <TableHead data-testid="header-details">Details</TableHead>
                        <TableHead data-testid="header-date">Date</TableHead>
                        <TableHead data-testid="header-event-actions">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingEvents.map((event) => (
                        <TableRow key={event.id} data-testid={`row-event-${event.id}`}>
                          <TableCell data-testid={`cell-officer-id-${event.id}`}>
                            {event.loanOfficerId}
                          </TableCell>
                          <TableCell data-testid={`cell-event-type-${event.id}`}>
                            {formatActionType(event.eventType)}
                          </TableCell>
                          <TableCell data-testid={`cell-points-${event.id}`}>
                            <Badge data-testid={`badge-points-${event.id}`}>
                              +{event.pointsAwarded} pts
                            </Badge>
                          </TableCell>
                          <TableCell data-testid={`cell-details-${event.id}`}>
                            {event.metadata?.clientName || 'N/A'}
                          </TableCell>
                          <TableCell data-testid={`cell-date-${event.id}`}>
                            {format(new Date(event.createdAt), "PPP")}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => approveEventMutation.mutate(event.id)}
                                disabled={approveEventMutation.isPending}
                                data-testid={`button-approve-${event.id}`}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => rejectEventMutation.mutate(event.id)}
                                disabled={rejectEventMutation.isPending}
                                data-testid={`button-reject-${event.id}`}
                              >
                                <X className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 5: Leaderboard & Export */}
          <TabsContent value="leaderboard" data-testid="content-leaderboard">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle data-testid="title-leaderboard">Leaderboard</CardTitle>
                    <CardDescription data-testid="description-leaderboard">
                      View and export leaderboard data
                    </CardDescription>
                  </div>
                  <Button 
                    onClick={handleExportLeaderboard}
                    data-testid="button-export-csv"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Scope</label>
                    <Select value={leaderboardScope} onValueChange={(v) => setLeaderboardScope(v as 'company' | 'branch')}>
                      <SelectTrigger data-testid="select-scope">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="company" data-testid="option-company">Company</SelectItem>
                        <SelectItem value="branch" data-testid="option-branch">Branch</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1">
                    <label className="text-sm font-medium mb-2 block">Season</label>
                    <Select value={selectedSeasonId} onValueChange={setSelectedSeasonId}>
                      <SelectTrigger data-testid="select-season">
                        <SelectValue placeholder="All seasons" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="" data-testid="option-all-seasons">All Seasons</SelectItem>
                        {seasons.map((season) => (
                          <SelectItem key={season.id} value={season.id} data-testid={`option-season-${season.id}`}>
                            {season.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {leaderboardLoading ? (
                  <div className="space-y-2" data-testid="skeleton-leaderboard">
                    {[...Array(10)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : leaderboard.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8" data-testid="empty-leaderboard">
                    No leaderboard data available
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead data-testid="header-lb-rank">Rank</TableHead>
                        <TableHead data-testid="header-lb-officer">Officer Name</TableHead>
                        <TableHead data-testid="header-lb-points">Total Points</TableHead>
                        <TableHead data-testid="header-lb-streak">Streak</TableHead>
                        <TableHead data-testid="header-lb-badges">Badges</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leaderboard.map((entry) => (
                        <TableRow key={entry.loanOfficerId} data-testid={`row-lb-${entry.loanOfficerId}`}>
                          <TableCell data-testid={`cell-rank-${entry.loanOfficerId}`}>
                            <div className="flex items-center gap-2">
                              {entry.rank === 1 && <Trophy className="h-5 w-5 text-yellow-500" />}
                              {entry.rank === 2 && <Trophy className="h-5 w-5 text-gray-400" />}
                              {entry.rank === 3 && <Trophy className="h-5 w-5 text-amber-600" />}
                              <span>#{entry.rank}</span>
                            </div>
                          </TableCell>
                          <TableCell data-testid={`cell-name-${entry.loanOfficerId}`}>
                            {entry.name}
                          </TableCell>
                          <TableCell data-testid={`cell-points-${entry.loanOfficerId}`}>
                            {entry.totalPoints}
                          </TableCell>
                          <TableCell data-testid={`cell-streak-${entry.loanOfficerId}`}>
                            {entry.currentStreak} days
                          </TableCell>
                          <TableCell data-testid={`cell-badges-${entry.loanOfficerId}`}>
                            {entry.badgeCount}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent data-testid="dialog-delete-confirm">
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. This will permanently delete this item.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={handleDeleteConfirm}
                data-testid="button-confirm-delete"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function AdminGamification() {
  return (
    <AdminRoute>
      <AdminGamificationContent />
    </AdminRoute>
  );
}
