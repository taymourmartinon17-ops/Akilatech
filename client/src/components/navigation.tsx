import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { LayoutDashboard, Database, LogOut, Settings, Users, Calendar, Trophy, Flame, Menu, X } from "lucide-react";
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/language-switcher';
import { motion, AnimatePresence } from "framer-motion";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Navigation() {
  const { t } = useTranslation();
  const { user, logout, changeLoanOfficerId, isAdmin } = useAuth();
  const [location, setLocation] = useLocation();
  const [officerIdInput, setOfficerIdInput] = useState(user?.loanOfficerId || "");
  const [isEditing, setIsEditing] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();


  const handleOfficerIdChange = () => {
    if (officerIdInput.trim() && officerIdInput !== user?.loanOfficerId) {
      changeLoanOfficerId(officerIdInput.trim());
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

  useEffect(() => {
    setOfficerIdInput(user?.loanOfficerId || "");
  }, [user?.loanOfficerId]);

  const { data: streakData } = useQuery<{ currentStreak: number; longestStreak: number }>({
    queryKey: ['/api/gamification/streak'],
    enabled: !isAdmin && !!user
  });

  const currentStreak = streakData?.currentStreak || 0;
  const showStreak = !isAdmin && currentStreak > 0;

  const handleNavigation = (path: string) => {
    setLocation(path);
    setMobileMenuOpen(false);
  };

  const navItems = isAdmin ? [
    { path: '/dashboard', icon: LayoutDashboard, label: t('navigation.dashboard'), testId: 'nav-dashboard' },
    { path: '/clients', icon: Users, label: t('navigation.clients'), testId: 'nav-clients' },
    { path: '/data-sync', icon: Database, label: t('navigation.dataSync'), testId: 'nav-data-sync' },
    { path: '/settings', icon: Settings, label: t('navigation.settings'), testId: 'nav-settings' },
    { path: '/admin/gamification', icon: Trophy, label: t('navigation.gamification'), testId: 'nav-gamification' },
  ] : [
    { path: '/dashboard', icon: LayoutDashboard, label: t('navigation.dashboard'), testId: 'nav-dashboard' },
    { path: '/clients', icon: Users, label: t('navigation.clients'), testId: 'nav-clients' },
    { path: '/calendar', icon: Calendar, label: t('navigation.calendar'), testId: 'nav-calendar' },
    { path: '/incentives', icon: Trophy, label: t('navigation.incentives'), testId: 'nav-incentives' },
  ];

  const bottomNavItems = navItems.slice(0, 4);

  if (isMobile) {
    return (
      <>
        {/* Mobile Top Bar - Minimal */}
        <nav className="bg-card border-b border-border shadow-sm fixed top-0 start-0 end-0 z-40" data-testid="navigation-mobile-top">
          <div className="flex justify-between items-center h-14 px-4">
            <div className="flex items-center gap-3">
              {showStreak && (
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gradient-to-r from-orange-100 to-red-100 dark:from-orange-950/30 dark:to-red-950/30 border border-orange-300 dark:border-orange-700" data-testid="streak-counter-mobile">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    <Flame className="h-4 w-4 text-orange-500" />
                  </motion.div>
                  <span className="text-xs font-bold text-orange-700 dark:text-orange-300">
                    {currentStreak}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium text-foreground truncate max-w-[120px]" data-testid="officer-id-mobile">
                {user?.loanOfficerId}
              </span>
            </div>
            
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-11 w-11" data-testid="mobile-menu-button">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-[280px] pt-12">
                  <div className="flex flex-col gap-2">
                    <div className="px-3 py-2 mb-2 border-b border-border">
                      <p className="text-xs text-muted-foreground">{t('navigation.officer')}</p>
                      <p className="text-sm font-medium">{user?.loanOfficerId}</p>
                    </div>
                    
                    {navItems.map((item) => (
                      <Button
                        key={item.path}
                        variant={location === item.path ? 'default' : 'ghost'}
                        className="justify-start h-12 text-base"
                        onClick={() => handleNavigation(item.path)}
                        data-testid={`${item.testId}-menu`}
                      >
                        <item.icon className="h-5 w-5 me-3" />
                        {item.label}
                      </Button>
                    ))}
                    
                    <div className="border-t border-border mt-4 pt-4">
                      <Button
                        variant="ghost"
                        className="justify-start h-12 text-base w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={logout}
                        data-testid="button-logout-menu"
                      >
                        <LogOut className="h-5 w-5 me-3" />
                        {t('navigation.logout')}
                      </Button>
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </nav>

        {/* Mobile Bottom Navigation Bar */}
        <nav className="bg-card border-t border-border shadow-lg fixed bottom-0 start-0 end-0 z-40 safe-area-pb" data-testid="navigation-mobile-bottom">
          <div className="flex justify-around items-center h-16 px-2">
            {bottomNavItems.map((item) => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigation(item.path)}
                  className={`flex flex-col items-center justify-center flex-1 h-full min-w-[64px] px-2 py-2 rounded-lg transition-colors ${
                    isActive 
                      ? 'text-primary bg-primary/10' 
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }`}
                  data-testid={`${item.testId}-bottom`}
                >
                  <item.icon className={`h-6 w-6 mb-1 ${isActive ? 'text-primary' : ''}`} />
                  <span className={`text-[10px] font-medium truncate max-w-full ${isActive ? 'text-primary' : ''}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>

        {/* Spacers for fixed navigation */}
        <div className="h-14" /> {/* Top spacer */}
      </>
    );
  }

  return (
    <nav className="bg-card border-b border-border shadow-sm" data-testid="navigation">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16 gap-8">
          {/* Navigation Buttons - Left */}
          <div className="flex items-center gap-2">
            {navItems.map((item) => (
              <Button
                key={item.path}
                variant={location === item.path ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setLocation(item.path)}
                className="flex items-center gap-2"
                data-testid={item.testId}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </div>
          
          {/* User Controls - Right */}
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            
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
