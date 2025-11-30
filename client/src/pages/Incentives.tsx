import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { usePageTracking } from "@/hooks/use-page-tracking";
import { Navigation } from "@/components/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Trophy, Award, TrendingUp, Star, Lock, CheckCircle, Medal, Flame, Target, Zap, Calendar, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import type { GamificationBadge, GamificationUserBadge } from "@shared/schema";
import { useTranslation } from 'react-i18next';
import { useLocation } from "wouter";
import { useEffect } from "react";

interface UserStats {
  totalPoints: number;
  currentStreak: number;
  currentRank: number | null;
  badgeCount: number;
}

interface LeaderboardEntry {
  loanOfficerId: string;
  name: string;
  totalPoints: number;
  currentStreak: number;
  rank: number;
  badgeCount: number;
}

export default function Incentives() {
  const { t } = useTranslation();
  const { user, isAuthenticated, isLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setLocation('/');
    }
  }, [isAuthenticated, isLoading, setLocation]);

  usePageTracking({ pageName: "Incentives", pageRoute: "/incentives" });

  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/gamification/stats'],
  });

  const { data: allBadges = [], isLoading: badgesLoading } = useQuery<GamificationBadge[]>({
    queryKey: ['/api/gamification/badges'],
  });

  const { data: userBadges = [], isLoading: userBadgesLoading } = useQuery<GamificationUserBadge[]>({
    queryKey: ['/api/gamification/badges/user'],
  });

  const { data: leaderboard = [], isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: [`/api/gamification/leaderboard?scope=company`],
  });

  const { data: dailyProgress, isLoading: dailyProgressLoading } = useQuery<{
    visitsCompleted: number;
    visitsTarget: number;
    progressPercentage: number;
  }>({
    queryKey: ['/api/gamification/daily-progress'],
  });

  const { data: streakHistory = [], isLoading: streakHistoryLoading } = useQuery<Array<{
    date: Date;
    targetMet: boolean;
    visitsCompleted: number;
    visitsTarget: number;
  }>>({
    queryKey: ['/api/gamification/streak-history', 7],
  });

  const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));

  const getTierInfo = (points: number) => {
    if (points >= 10000) return { 
      tier: t('gamification.diamond'), 
      color: 'bg-red-600',
      textColor: 'text-red-600',
      bgColor: 'bg-red-50',
      nextTier: null,
      nextTierPoints: null,
      icon: '💎'
    };
    if (points >= 5000) return { 
      tier: t('gamification.platinum'), 
      color: 'bg-orange-600',
      textColor: 'text-orange-600',
      bgColor: 'bg-orange-50',
      nextTier: t('gamification.diamond'),
      nextTierPoints: 10000,
      icon: '🔮'
    };
    if (points >= 2500) return { 
      tier: t('gamification.gold'), 
      color: 'bg-amber-500',
      textColor: 'text-amber-600',
      bgColor: 'bg-amber-50',
      nextTier: t('gamification.platinum'),
      nextTierPoints: 5000,
      icon: '🏆'
    };
    if (points >= 1000) return { 
      tier: t('gamification.silver'), 
      color: 'bg-gray-400',
      textColor: 'text-gray-600',
      bgColor: 'bg-gray-50',
      nextTier: t('gamification.gold'),
      nextTierPoints: 2500,
      icon: '🥈'
    };
    return { 
      tier: t('gamification.bronze'), 
      color: 'bg-amber-700',
      textColor: 'text-amber-700',
      bgColor: 'bg-amber-50',
      nextTier: t('gamification.silver'),
      nextTierPoints: 1000,
      icon: '🥉'
    };
  };

  const currentTier = getTierInfo(stats?.totalPoints || 0);
  const tierProgress = currentTier.nextTierPoints 
    ? ((stats?.totalPoints || 0) / currentTier.nextTierPoints) * 100 
    : 100;

  // Real backend data for daily progress and streak tracking
  const todayProgress = dailyProgress?.progressPercentage || 0;
  const todayTarget = dailyProgress?.visitsTarget || 10;
  const todayCompleted = dailyProgress?.visitsCompleted || 0;

  // Real backend data for streak history (last 7 days)
  const streakDays = streakHistory.map(record => record.targetMet);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          <p className="text-slate-600 dark:text-slate-400">{t('common.loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900" data-testid="page-incentives">
      <Navigation />
      
      {/* Hero Header */}
      <div className="bg-orange-500 dark:bg-orange-600 shadow-xl">
        <div className="max-w-7xl mx-auto p-8">
          <div className="flex items-center justify-between">
            <div>
              <motion.h1 
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-4xl font-bold text-white mb-2" 
                data-testid="title-incentives"
              >
                {t('incentives.pageTitle')}
              </motion.h1>
              <motion.p 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-orange-50 text-lg"
              >
                {t('incentives.heroMessage')}
              </motion.p>
            </div>
            <motion.div
              animate={{ 
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0]
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="text-6xl"
            >
              {currentTier.icon}
            </motion.div>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Row 1: Today's Progress Hero + Streak Tracker */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Today's Progress - Large Hero Card */}
          <Card className="lg:col-span-2 border-amber-300 dark:border-amber-700 shadow-xl overflow-hidden" data-testid="card-today-progress">
            <div className="bg-amber-500 dark:bg-amber-600 p-6 text-white">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold">{t('incentives.todayPerformance')}</h2>
                  <p className="text-amber-50">{t('incentives.todayMessage')}</p>
                </div>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                >
                  <Target className="h-12 w-12 text-white/80" />
                </motion.div>
              </div>
              
              {/* Circular Progress */}
              <div className="flex items-center justify-center py-8">
                <motion.div 
                  className="relative"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 100 }}
                >
                  <svg className="w-48 h-48" viewBox="0 0 200 200">
                    {/* Background circle */}
                    <circle
                      cx="100"
                      cy="100"
                      r="85"
                      fill="none"
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth="20"
                    />
                    {/* Progress circle */}
                    <motion.circle
                      cx="100"
                      cy="100"
                      r="85"
                      fill="none"
                      stroke="#F97316"
                      strokeWidth="20"
                      strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 85}`}
                      strokeDashoffset={`${2 * Math.PI * 85 * (1 - todayProgress / 100)}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 85 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 85 * (1 - todayProgress / 100) }}
                      transition={{ duration: 1.5, ease: "easeOut" }}
                      transform="rotate(-90 100 100)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.div 
                      className="text-5xl font-bold"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      {todayProgress}%
                    </motion.div>
                    <div className="text-sm text-white/80 mt-1">{t('incentives.ofTarget')}</div>
                  </div>
                </motion.div>
              </div>

              {/* Progress Stats */}
              <div className="grid grid-cols-2 gap-4 mt-6">
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-sm text-amber-50">{t('incentives.completed')}</div>
                  <div className="text-2xl font-bold">{todayCompleted}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-lg p-4">
                  <div className="text-sm text-amber-50">{t('incentives.target')}</div>
                  <div className="text-2xl font-bold">{todayTarget}</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Streak Tracker - Duolingo Style */}
          <Card className="border-orange-300 dark:border-orange-700 shadow-xl" data-testid="card-streak">
            <CardHeader className="bg-orange-50 dark:bg-orange-950/40 pb-3">
              <CardTitle className="flex items-center gap-2 text-orange-900 dark:text-orange-100">
                <motion.div
                  animate={{ 
                    scale: [1, 1.2, 1],
                  }}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  <Flame className="h-6 w-6 text-orange-500" />
                </motion.div>
                {t('incentives.streak')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {statsLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="space-y-4">
                  {/* Big Streak Number */}
                  <div className="text-center">
                    <motion.div 
                      className="text-6xl font-bold text-orange-500 dark:text-orange-400"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      {stats?.currentStreak || 0}
                    </motion.div>
                    <div className="text-sm text-muted-foreground mt-1">{t('incentives.dayStreak')}</div>
                  </div>

                  {/* Calendar Dots */}
                  <div className="flex justify-center gap-2">
                    {streakDays.map((completed, index) => (
                      <motion.div
                        key={index}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: index * 0.1 }}
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          completed 
                            ? 'bg-orange-500 text-white shadow-lg' 
                            : 'bg-gray-200 dark:bg-gray-700 text-gray-400'
                        }`}
                      >
                        {completed ? '✓' : '○'}
                      </motion.div>
                    ))}
                  </div>

                  <div className="text-xs text-center text-muted-foreground">
                    {t('incentives.last7Days')}
                  </div>

                  {/* Motivational Message */}
                  <div className="bg-orange-100 dark:bg-orange-900/20 rounded-lg p-3 text-center">
                    <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                      {t('incentives.dontBreakChain')} 🔥
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 2: Level/Tier Display + Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tier Progress */}
          <Card className="lg:col-span-2 border-amber-300 dark:border-amber-700 shadow-xl" data-testid="card-tier">
            <CardHeader className="bg-amber-50 dark:bg-amber-950/40">
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Trophy className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {t('incentives.yourLevelTier')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {statsLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <div className="space-y-6">
                  {/* Current Tier Badge */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <motion.div
                        animate={{ rotate: [0, 360] }}
                        transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                        className={`w-20 h-20 rounded-full ${currentTier.color} flex items-center justify-center text-4xl shadow-xl`}
                      >
                        {currentTier.icon}
                      </motion.div>
                      <div>
                        <div className="text-3xl font-bold">{currentTier.tier}</div>
                        <div className="text-sm text-muted-foreground">{t('incentives.currentTier')}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-4xl font-bold text-amber-600 dark:text-amber-400">
                        {stats?.totalPoints || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">{t('incentives.totalPoints')}</div>
                    </div>
                  </div>

                  {/* Progress to Next Tier */}
                  {currentTier.nextTier && (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">{t('incentives.progressTo', { tier: currentTier.nextTier })}</span>
                        <span className="text-muted-foreground">
                          {stats?.totalPoints || 0} / {currentTier.nextTierPoints}
                        </span>
                      </div>
                      <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <motion.div
                          className="absolute top-0 left-0 h-full bg-amber-500 rounded-full"
                          initial={{ width: 0 }}
                          animate={{ width: `${tierProgress}%` }}
                          transition={{ duration: 1.5, ease: "easeOut" }}
                        />
                      </div>
                      <p className="text-xs text-center text-muted-foreground">
                        {t('incentives.pointsToNextTier', { points: currentTier.nextTierPoints! - (stats?.totalPoints || 0) })}
                      </p>
                    </div>
                  )}

                  {/* Milestone Celebration */}
                  {tierProgress > 90 && currentTier.nextTier && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-amber-100 dark:bg-amber-900/20 rounded-lg p-4 text-center"
                    >
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        {t('incentives.almostThere', { tier: currentTier.nextTier })} 🎯
                      </p>
                    </motion.div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Leaderboard Position */}
          <Card className="border-amber-300 dark:border-amber-700 shadow-xl" data-testid="card-leaderboard-position">
            <CardHeader className="bg-amber-50 dark:bg-amber-950/40">
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <TrendingUp className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {t('incentives.yourRank')}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6">
              {statsLoading || leaderboardLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : (
                <div className="space-y-4">
                  <div className="text-center">
                    <motion.div 
                      className="text-6xl font-bold text-amber-600 dark:text-amber-400"
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: "spring", stiffness: 200 }}
                    >
                      #{stats?.currentRank || '--'}
                    </motion.div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t('incentives.outOf', { total: leaderboard.length })}
                    </div>
                  </div>

                  {stats?.currentRank && stats.currentRank <= 3 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-amber-100 dark:bg-amber-900/20 rounded-lg p-3 text-center"
                    >
                      <p className="text-lg font-bold text-amber-800 dark:text-amber-200">
                        {stats.currentRank === 1 ? `🏆 ${t('incentives.youAreNumber1')}` : stats.currentRank === 2 ? `🥈 ${t('incentives.almostToTop')}` : `🥉 ${t('incentives.topThree')}`}
                      </p>
                    </motion.div>
                  )}

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('incentives.points')}</span>
                      <span className="font-semibold">{stats?.totalPoints || 0}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>{t('incentives.badges')}</span>
                      <span className="font-semibold">{stats?.badgeCount || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Row 3: Compact Badges + Mini Leaderboard */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Compact Badges - Top 6 only */}
          <Card className="border-amber-300 dark:border-amber-700 shadow-xl" data-testid="card-achievements">
            <CardHeader className="bg-amber-50 dark:bg-amber-950/40">
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {t('incentives.achievements')}
              </CardTitle>
              <CardDescription>{t('incentives.unlockBadgesChallenge')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {badgesLoading || userBadgesLoading ? (
                <div className="grid grid-cols-3 gap-4">
                  {[...Array(6)].map((_, i) => (
                    <Skeleton key={i} className="h-24 w-full" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {allBadges.slice(0, 6).map((badge) => {
                    const isEarned = earnedBadgeIds.has(badge.id);
                    return (
                      <motion.div
                        key={badge.id}
                        initial={{ opacity: 0, scale: 0 }}
                        animate={{ opacity: 1, scale: 1 }}
                        whileHover={{ scale: 1.1 }}
                        className={`relative p-4 border-2 rounded-xl transition-all duration-300 ${
                          isEarned
                            ? 'bg-amber-50 dark:bg-amber-900/40 border-amber-500 dark:border-amber-600 shadow-lg'
                            : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 opacity-50 grayscale'
                        }`}
                        data-testid={`badge-${badge.id}`}
                      >
                        {isEarned && (
                          <motion.div
                            initial={{ scale: 0, rotate: -180 }}
                            animate={{ scale: 1, rotate: 0 }}
                            transition={{ type: "spring", stiffness: 200 }}
                          >
                            <CheckCircle 
                              className="absolute -top-2 -right-2 h-6 w-6 text-green-500 bg-white dark:bg-gray-900 rounded-full" 
                              data-testid={`badge-earned-${badge.id}`}
                            />
                          </motion.div>
                        )}
                        {!isEarned && (
                          <Lock 
                            className="absolute top-2 right-2 h-4 w-4 text-gray-400" 
                            data-testid={`badge-locked-${badge.id}`}
                          />
                        )}
                        <div className="text-4xl mb-2 text-center" data-testid={`badge-icon-${badge.id}`}>
                          {badge.icon}
                        </div>
                        <h4 className="font-semibold text-xs text-center leading-tight" data-testid={`badge-name-${badge.id}`}>
                          {badge.name}
                        </h4>
                      </motion.div>
                    );
                  })}
                </div>
              )}
              {allBadges.length > 6 && (
                <p className="text-xs text-center text-muted-foreground mt-4">
                  {t('incentives.moreToUnlock', { count: allBadges.length - 6 })}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Mini Leaderboard - Top 5 */}
          <Card className="border-amber-300 dark:border-amber-700 shadow-xl" data-testid="card-leaderboard">
            <CardHeader className="bg-amber-50 dark:bg-amber-950/40">
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Medal className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {t('incentives.topPerformers')}
              </CardTitle>
              <CardDescription>{t('incentives.companyLeaderboard')}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              {leaderboardLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {leaderboard.slice(0, 5).map((entry, index) => {
                    const isCurrentUser = entry.loanOfficerId === user?.loanOfficerId;
                    return (
                      <motion.div
                        key={entry.loanOfficerId}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
                          isCurrentUser 
                            ? 'bg-amber-100 dark:bg-amber-900/40 shadow-md border-2 border-amber-500' 
                            : 'bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-950/20'
                        }`}
                        data-testid={`leaderboard-row-${entry.loanOfficerId}`}
                      >
                        {/* Rank Badge */}
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold ${
                          entry.rank === 1 ? 'bg-amber-500 text-white shadow-lg' :
                          entry.rank === 2 ? 'bg-gray-400 text-white shadow-md' :
                          entry.rank === 3 ? 'bg-amber-700 text-white shadow-md' :
                          'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                          {entry.rank}
                        </div>

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold truncate">
                            {entry.name}
                            {isCurrentUser && (
                              <Badge variant="outline" className="ms-2 border-amber-600 text-amber-700 dark:border-amber-400 dark:text-amber-300 text-xs">
                                {t('incentives.you')}
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.totalPoints} {t('incentives.pts')} • {entry.badgeCount} {t('incentives.badges').toLowerCase()}
                          </div>
                        </div>

                        {/* Medal for top 3 */}
                        {entry.rank <= 3 && (
                          <motion.div
                            animate={{ rotate: [0, 5, -5, 0] }}
                            transition={{ duration: 2, repeat: Infinity }}
                          >
                            {entry.rank === 1 && <span className="text-2xl">🏆</span>}
                            {entry.rank === 2 && <span className="text-2xl">🥈</span>}
                            {entry.rank === 3 && <span className="text-2xl">🥉</span>}
                          </motion.div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
