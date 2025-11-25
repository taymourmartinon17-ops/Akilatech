// Utility functions for triggering celebration events

export function triggerBadgeUnlock(
  badgeName: string,
  badgeIcon: string,
  badgeDescription: string,
  pointsEarned?: number
) {
  const event = new CustomEvent('badgeUnlocked', {
    detail: { badgeName, badgeIcon, badgeDescription, pointsEarned }
  });
  window.dispatchEvent(event);
}

export function triggerPointsEarned(
  points: number,
  reason: string,
  level?: number,
  leveledUp?: boolean
) {
  const event = new CustomEvent('pointsEarned', {
    detail: { points, reason, level, leveledUp }
  });
  window.dispatchEvent(event);
}

export function triggerStreakMilestone(
  streak: number,
  isNewRecord?: boolean
) {
  const event = new CustomEvent('streakMilestone', {
    detail: { streak, isNewRecord }
  });
  window.dispatchEvent(event);
}

export function triggerRankChanged(
  oldRank: number,
  newRank: number,
  rankTier: string
) {
  const event = new CustomEvent('rankChanged', {
    detail: { oldRank, newRank, rankTier }
  });
  window.dispatchEvent(event);
}

export function triggerAchievementCompleted(
  achievementName: string,
  achievementIcon: string,
  achievementDescription: string,
  points?: number
) {
  const event = new CustomEvent('achievementCompleted', {
    detail: { achievementName, achievementIcon, achievementDescription, points }
  });
  window.dispatchEvent(event);
}
