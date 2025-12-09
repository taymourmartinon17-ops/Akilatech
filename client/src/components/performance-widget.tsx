import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Trophy, TrendingUp, Award, Flame, Timer, Medal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { useTranslation } from 'react-i18next';

interface LeaderboardEntry {
  rank: number;
  loanOfficerId: string;
  name: string;
  totalPoints: number;
  currentStreak: number;
  badges: number;
  isCurrentUser?: boolean;
}

interface UserStats {
  totalPoints: number;
  currentStreak: number;
  longestStreak: number;
  currentRank: number | null;
  unlockedBadges: number;
  totalBadges: number;
  nextBadge: {
    name: string;
    description: string;
    icon: string;
    progress: number;
    remaining: number;
  } | null;
  level: number;
  pointsToNextLevel: number;
}

interface Season {
  name: string;
  endDate: string;
  daysRemaining: number;
}

export function PerformanceWidget() {
  const { user } = useAuth();
  const { t } = useTranslation();

  // Fetch user stats
  const { data: stats, isLoading: statsLoading } = useQuery<UserStats>({
    queryKey: ['/api/gamification/user-stats', user?.loanOfficerId],
    enabled: !!user,
  });

  // Fetch leaderboard
  const { data: leaderboard, isLoading: leaderboardLoading } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/gamification/leaderboard-mini'],
    enabled: !!user,
  });

  // Fetch current season
  const { data: season } = useQuery<Season>({
    queryKey: ['/api/gamification/current-season'],
    enabled: !!user,
  });

  // Calculate level from points (100 points per level)
  const level = stats ? Math.floor(stats.totalPoints / 100) + 1 : 1;
  const pointsInCurrentLevel = stats ? stats.totalPoints % 100 : 0;
  const progressToNextLevel = pointsInCurrentLevel;

  // Get rank tier
  const getRankTier = (rank: number | null) => {
    if (!rank) return { name: t('incentives.unranked'), color: "text-gray-500", icon: "🎯" };
    if (rank === 1) return { name: `🥇 ${t('gamification.gold')}`, color: "text-indigo-600", icon: "👑" };
    if (rank === 2) return { name: `🥈 ${t('gamification.silver')}`, color: "text-blue-600", icon: "⭐" };
    if (rank === 3) return { name: `🥉 ${t('gamification.bronze')}`, color: "text-purple-600", icon: "🏅" };
    if (rank <= 10) return { name: t('gamification.diamond'), color: "text-blue-600", icon: "💎" };
    if (rank <= 25) return { name: t('gamification.platinum'), color: "text-purple-600", icon: "⚡" };
    return { name: t('gamification.bronze'), color: "text-green-600", icon: "🌟" };
  };

  const rankTier = getRankTier(stats?.currentRank ?? null);

  if (statsLoading) {
    return (
      <Card className="border-2 border-indigo-600/20 bg-indigo-50/50 dark:bg-indigo-950/20">
        <CardHeader>
          <Skeleton className="h-6 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2 border-indigo-600/20 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-indigo-600" />
          {t('incentives.yourPerformance')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Points & Level */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-purple-600" />
              <span className="font-semibold">{t('incentives.levelNumber', { level })}</span>
            </div>
            <Badge variant="secondary" className="bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-600/30 text-indigo-700 dark:text-indigo-300">
              <Medal className="h-3 w-3 me-1" />
              {t('incentives.pointsDisplay', { points: stats?.totalPoints || 0 })}
            </Badge>
          </div>
          
          {/* Progress bar to next level */}
          <div className="space-y-1">
            <Progress 
              value={progressToNextLevel} 
              className="h-3 bg-indigo-100 dark:bg-indigo-900/30 [&>div]:bg-indigo-600"
            />
            <p className="text-xs text-muted-foreground text-end">
              {t('incentives.progressDisplay', { progress: progressToNextLevel, level: level + 1 })}
            </p>
          </div>
        </div>

        {/* Rank & Streak */}
        <div className="grid grid-cols-2 gap-4">
          {/* Rank */}
          <motion.div 
            className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-600/20"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-600" />
              <span className="text-xs font-medium text-muted-foreground">{t('incentives.rank')}</span>
            </div>
            <p className={`text-lg font-bold ${rankTier.color}`}>
              {stats?.currentRank ? `#${stats.currentRank}` : "—"}
            </p>
            <p className="text-xs text-muted-foreground">{rankTier.name}</p>
          </motion.div>

          {/* Streak */}
          <motion.div 
            className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-600/20"
            whileHover={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <Flame className="h-4 w-4 text-purple-600" />
              <span className="text-xs font-medium text-muted-foreground">{t('incentives.streak')}</span>
            </div>
            <p className="text-lg font-bold text-purple-600">
              {t('incentives.streakDays', { count: stats?.currentStreak || 0 })}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('incentives.bestStreak', { count: stats?.longestStreak || 0 })}
            </p>
          </motion.div>
        </div>

        {/* Next Badge Progress */}
        {stats?.nextBadge && (
          <div className="space-y-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-600/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{stats.nextBadge.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{stats.nextBadge.name}</p>
                  <p className="text-xs text-muted-foreground">{stats.nextBadge.description}</p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {t('incentives.remainingCount', { count: stats.nextBadge.remaining })}
              </Badge>
            </div>
            <Progress 
              value={stats.nextBadge.progress} 
              className="h-2 bg-green-100 dark:bg-green-900/30 [&>div]:bg-green-600"
            />
          </div>
        )}

        {/* Season Timer */}
        {season && season.daysRemaining > 0 && (
          <div className="flex items-center justify-between p-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-600/20">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-amber-600" />
              <div>
                <p className="text-xs font-medium">{season.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t('incentives.daysRemaining', { count: season.daysRemaining })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Mini Leaderboard */}
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <Trophy className="h-4 w-4 text-indigo-600" />
            {t('incentives.topPerformers')}
          </h4>
          {leaderboardLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : (
            <div className="space-y-1">
              {leaderboard?.slice(0, 5).map((entry, idx) => (
                <motion.div
                  key={entry.loanOfficerId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`flex items-center gap-2 p-2 rounded-lg transition-colors ${
                    entry.isCurrentUser 
                      ? 'bg-indigo-100 dark:bg-indigo-900/30 border border-indigo-600/30' 
                      : 'bg-muted/30 hover:bg-muted/50'
                  }`}
                >
                  <div className="flex-shrink-0 w-6 text-center">
                    {entry.rank === 1 && <span className="text-lg">🥇</span>}
                    {entry.rank === 2 && <span className="text-lg">🥈</span>}
                    {entry.rank === 3 && <span className="text-lg">🥉</span>}
                    {entry.rank > 3 && (
                      <span className="text-xs font-bold text-muted-foreground">#{entry.rank}</span>
                    )}
                  </div>
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {entry.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium truncate ${entry.isCurrentUser ? 'text-indigo-700 dark:text-indigo-300' : ''}`}>
                      {entry.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t('incentives.streakWithFire', { points: entry.totalPoints, streak: entry.currentStreak })}🔥
                    </p>
                  </div>
                  {entry.badges > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {entry.badges} 🏆
                    </Badge>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
