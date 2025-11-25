import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trophy, Sparkles, Star } from "lucide-react";
import { triggerConfettiBurst } from "@/lib/confetti";

interface BadgeUnlockCelebrationProps {
  badgeName: string;
  badgeIcon: string;
  badgeDescription: string;
  pointsEarned?: number;
  onClose: () => void;
}

export function BadgeUnlockCelebration({
  badgeName,
  badgeIcon,
  badgeDescription,
  pointsEarned,
  onClose
}: BadgeUnlockCelebrationProps) {
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    // Trigger confetti when badge unlocks
    triggerConfettiBurst();
    
    // Auto-close after 5 seconds
    const timer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onClose, 300); // Wait for exit animation
    }, 5000);

    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => {
            setIsVisible(false);
            setTimeout(onClose, 300);
          }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -180, y: 100 }}
            animate={{ scale: 1, rotate: 0, y: 0 }}
            exit={{ scale: 0, rotate: 180, y: -100 }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20,
              duration: 0.6
            }}
            onClick={(e) => e.stopPropagation()}
            className="relative"
          >
            {/* Glow effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-400 rounded-2xl blur-2xl opacity-75 animate-pulse" />
            
            {/* Badge card */}
            <Card className="relative bg-gradient-to-br from-yellow-50 to-orange-50 dark:from-yellow-950/30 dark:to-orange-950/30 border-4 border-yellow-400 shadow-2xl max-w-md">
              <CardContent className="p-8 text-center space-y-6">
                {/* Floating sparkles */}
                <div className="absolute top-4 left-4 animate-bounce">
                  <Sparkles className="h-6 w-6 text-yellow-400" />
                </div>
                <div className="absolute top-4 right-4 animate-bounce delay-150">
                  <Star className="h-6 w-6 text-orange-400" />
                </div>
                <div className="absolute bottom-4 left-8 animate-bounce delay-300">
                  <Star className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="absolute bottom-4 right-8 animate-bounce delay-200">
                  <Sparkles className="h-5 w-5 text-orange-400" />
                </div>

                {/* Trophy icon */}
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 10, -10, 0]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse"
                  }}
                  className="mx-auto w-20 h-20 bg-gradient-to-br from-yellow-400 to-orange-400 rounded-full flex items-center justify-center shadow-lg"
                >
                  <Trophy className="h-10 w-10 text-white" />
                </motion.div>

                {/* Badge unlocked text */}
                <div className="space-y-2">
                  <motion.h2
                    animate={{
                      scale: [1, 1.05, 1]
                    }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                    className="text-3xl font-bold bg-gradient-to-r from-yellow-600 to-orange-600 bg-clip-text text-transparent"
                  >
                    Badge Unlocked!
                  </motion.h2>
                </div>

                {/* Badge icon and name */}
                <div className="space-y-3">
                  <motion.div
                    animate={{
                      rotate: [0, 360]
                    }}
                    transition={{
                      duration: 20,
                      repeat: Infinity,
                      ease: "linear"
                    }}
                    className="text-7xl"
                  >
                    {badgeIcon}
                  </motion.div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                    {badgeName}
                  </h3>
                  
                  <p className="text-gray-600 dark:text-gray-400">
                    {badgeDescription}
                  </p>
                </div>

                {/* Points earned */}
                {pointsEarned && (
                  <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white px-4 py-2 text-lg">
                    +{pointsEarned} Points
                  </Badge>
                )}

                {/* Tap to dismiss hint */}
                <motion.p
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="text-sm text-gray-500 dark:text-gray-400"
                >
                  Tap anywhere to continue
                </motion.p>
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
