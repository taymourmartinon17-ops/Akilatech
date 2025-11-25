import { useEffect, useState } from "react";
import { BadgeUnlockCelebration } from "./badge-unlock-celebration";
import { useToast } from "@/hooks/use-toast";
import { triggerConfettiBurst } from "@/lib/confetti";
import { Trophy, Flame, TrendingUp, Award } from "lucide-react";

interface BadgeCelebration {
  id: string;
  badgeName: string;
  badgeIcon: string;
  badgeDescription: string;
  pointsEarned?: number;
}

export function CelebrationManager() {
  const [currentBadge, setCurrentBadge] = useState<BadgeCelebration | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    // Listen for badge unlock events
    const handleBadgeUnlocked = (event: Event) => {
      const customEvent = event as CustomEvent<{
        badgeName: string;
        badgeIcon: string;
        badgeDescription: string;
        pointsEarned?: number;
      }>;
      
      setCurrentBadge({
        id: Date.now().toString(),
        ...customEvent.detail
      });
    };

    // Listen for points earned events
    const handlePointsEarned = (event: Event) => {
      const customEvent = event as CustomEvent<{
        points: number;
        reason: string;
        level?: number;
        leveledUp?: boolean;
      }>;
      
      const { points, reason, level, leveledUp } = customEvent.detail;
      
      // Trigger confetti for level ups or big point gains
      if (leveledUp || points >= 100) {
        triggerConfettiBurst();
      }
      
      // Show toast notification
      toast({
        title: leveledUp ? `🎉 Level Up! Now Level ${level}` : `+${points} Points!`,
        description: reason,
        duration: 4000,
        className: leveledUp 
          ? "bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-yellow-400"
          : "bg-gradient-to-r from-blue-500 to-purple-500 text-white border-blue-400"
      });
    };

    // Listen for streak milestone events
    const handleStreakMilestone = (event: Event) => {
      const customEvent = event as CustomEvent<{
        streak: number;
        isNewRecord?: boolean;
      }>;
      
      const { streak, isNewRecord } = customEvent.detail;
      
      triggerConfettiBurst();
      
      toast({
        title: isNewRecord ? `🔥 New Record! ${streak} Day Streak!` : `🔥 ${streak} Day Streak!`,
        description: isNewRecord 
          ? "You've beaten your personal best!"
          : "Keep it up! You're on fire!",
        duration: 5000,
        className: "bg-gradient-to-r from-orange-500 to-red-500 text-white border-orange-400"
      });
    };

    // Listen for rank changes
    const handleRankChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{
        oldRank: number;
        newRank: number;
        rankTier: string;
      }>;
      
      const { oldRank, newRank, rankTier } = customEvent.detail;
      const improved = newRank < oldRank;
      
      if (improved) {
        triggerConfettiBurst();
      }
      
      toast({
        title: improved ? `📈 Rank Up! Now #${newRank}` : `Rank: #${newRank}`,
        description: `${rankTier} tier`,
        duration: 4000,
        className: improved 
          ? "bg-gradient-to-r from-green-500 to-emerald-500 text-white border-green-400"
          : "bg-gradient-to-r from-gray-500 to-gray-600 text-white border-gray-400"
      });
    };

    // Listen for achievement completions (generic achievements)
    const handleAchievementCompleted = (event: Event) => {
      const customEvent = event as CustomEvent<{
        achievementName: string;
        achievementIcon: string;
        achievementDescription: string;
        points?: number;
      }>;
      
      triggerConfettiBurst();
      
      toast({
        title: `${customEvent.detail.achievementIcon} ${customEvent.detail.achievementName}`,
        description: customEvent.detail.achievementDescription,
        duration: 5000,
        className: "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-purple-400"
      });
    };

    // Register event listeners
    window.addEventListener('badgeUnlocked', handleBadgeUnlocked);
    window.addEventListener('pointsEarned', handlePointsEarned);
    window.addEventListener('streakMilestone', handleStreakMilestone);
    window.addEventListener('rankChanged', handleRankChanged);
    window.addEventListener('achievementCompleted', handleAchievementCompleted);

    return () => {
      window.removeEventListener('badgeUnlocked', handleBadgeUnlocked);
      window.removeEventListener('pointsEarned', handlePointsEarned);
      window.removeEventListener('streakMilestone', handleStreakMilestone);
      window.removeEventListener('rankChanged', handleRankChanged);
      window.removeEventListener('achievementCompleted', handleAchievementCompleted);
    };
  }, [toast]);

  return (
    <>
      {currentBadge && (
        <BadgeUnlockCelebration
          badgeName={currentBadge.badgeName}
          badgeIcon={currentBadge.badgeIcon}
          badgeDescription={currentBadge.badgeDescription}
          pointsEarned={currentBadge.pointsEarned}
          onClose={() => setCurrentBadge(null)}
        />
      )}
    </>
  );
}
