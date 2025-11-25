import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { LayoutDashboard, Database, LogOut, Settings, Users, Calendar, Trophy, Flame } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/language-switcher';
import { motion } from "framer-motion";

export function Navigation() {
  const { t } = useTranslation();
  const { user, logout, changeLoanOfficerId, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();
  const [officerIdInput, setOfficerIdInput] = useState(user?.loanOfficerId || "");
  const [isEditing, setIsEditing] = useState(false);
  const queryClient = useQueryClient();


  const handleOfficerIdChange = () => {
    if (officerIdInput.trim() && officerIdInput !== user?.loanOfficerId) {
      changeLoanOfficerId(officerIdInput.trim());
      // Invalidate all client queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/clients'] });
      setIsEditing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleOfficerIdChange();
    } else if (e.key === 'Escape') {
      setOfficerIdInput(user?.loanOfficerId || "");
      setIsEditing(false);
    }
  };

  // Sync input with user changes
  useEffect(() => {
    setOfficerIdInput(user?.loanOfficerId || "");
  }, [user?.loanOfficerId]);

  // Fetch user's current streak (only for non-admin users)
  const { data: streakData } = useQuery<{ currentStreak: number; longestStreak: number }>({
    queryKey: ['/api/gamification/streak'],
    enabled: !isAdmin && !!user
  });

  const currentStreak = streakData?.currentStreak || 0;
  const showStreak = !isAdmin && currentStreak > 0;

  return (
    <nav className="bg-card border-b border-border shadow-sm" data-testid="navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-8">
          {/* Navigation Buttons - Left */}
          <div className="flex items-center gap-2">
            <Button
              variant={location === '/dashboard' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setLocation('/dashboard')}
              className="flex items-center gap-2"
              data-testid="nav-dashboard"
            >
              <LayoutDashboard className="h-4 w-4" />
              {t('navigation.dashboard')}
            </Button>
            
            <Button
              variant={location === '/clients' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setLocation('/clients')}
              className="flex items-center gap-2"
              data-testid="nav-clients"
            >
              <Users className="h-4 w-4" />
              {t('navigation.clients')}
            </Button>
            
            {!isAdmin && (
              <Button
                variant={location === '/calendar' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocation('/calendar')}
                className="flex items-center gap-2"
                data-testid="nav-calendar"
              >
                <Calendar className="h-4 w-4" />
                {t('navigation.calendar')}
              </Button>
            )}
            
            {!isAdmin && (
              <Button
                variant={location === '/incentives' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocation('/incentives')}
                className="flex items-center gap-2"
                data-testid="nav-incentives"
              >
                <Trophy className="h-4 w-4" />
                {t('navigation.incentives')}
              </Button>
            )}
            
            {isAdmin && (
              <Button
                variant={location === '/data-sync' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocation('/data-sync')}
                className="flex items-center gap-2"
                data-testid="nav-data-sync"
              >
                <Database className="h-4 w-4" />
                {t('navigation.dataSync')}
              </Button>
            )}
            
            {isAdmin && (
              <Button
                variant={location === '/settings' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocation('/settings')}
                className="flex items-center gap-2"
                data-testid="nav-settings"
              >
                <Settings className="h-4 w-4" />
                {t('navigation.settings')}
              </Button>
            )}
            
            {isAdmin && (
              <Button
                variant={location === '/admin/gamification' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocation('/admin/gamification')}
                className="flex items-center gap-2"
                data-testid="nav-gamification"
              >
                <Trophy className="h-4 w-4" />
                {t('navigation.gamification')}
              </Button>
            )}
          </div>
          
          {/* User Controls - Right */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            
            {/* Streak Counter */}
            {showStreak && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-950/30 dark:to-red-950/30 border border-orange-300 dark:border-orange-700" data-testid="streak-counter">
                <motion.div
                  animate={{
                    scale: [1, 1.2, 1],
                    rotate: [0, 5, -5, 0]
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    repeatType: "reverse"
                  }}
                >
                  <Flame className="h-5 w-5 text-orange-500 dark:text-orange-400" />
                </motion.div>
                <span className="text-sm font-bold text-orange-700 dark:text-orange-300" data-testid="streak-count">
                  {currentStreak} {t('gamification.dayStreak')}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t('navigation.officer')}</span>
              {isEditing ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="text"
                    value={officerIdInput}
                    onChange={(e) => setOfficerIdInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    onBlur={() => setIsEditing(false)}
                    className="w-24 h-6 text-xs"
                    placeholder="LO-ID"
                    autoFocus
                    data-testid="input-officer-id"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleOfficerIdChange}
                    className="h-6 w-6 p-0 text-xs"
                    data-testid="button-save-officer"
                  >
                    <i className="fas fa-check text-green-600"></i>
                  </Button>
                </div>
              ) : (
                <span 
                  className="text-sm font-medium text-foreground cursor-pointer hover:text-primary" 
                  onClick={() => setIsEditing(true)}
                  data-testid="officer-id"
                >
                  {user?.loanOfficerId}
                </span>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="text-muted-foreground hover:text-foreground flex items-center gap-2"
              data-testid="button-logout"
            >
              <LogOut className="h-4 w-4" />
              {t('navigation.logout')}
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
