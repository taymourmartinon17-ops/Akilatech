import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { apiRequest } from "@/lib/queryClient";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from 'react-i18next';
import { Loader2 } from "lucide-react";

type AuthStep = 'check-id' | 'login' | 'signup' | 'set-password' | 'not-registered';

interface CheckUserResponse {
  exists: boolean;
  isRegistered: boolean;
  loanOfficerId: string;
  needsPasswordSetup?: boolean;
  hasPassword?: boolean;
}

export default function Login() {
  const { t } = useTranslation();
  const [authStep, setAuthStep] = useState<AuthStep>('check-id');
  const [organizationId, setOrganizationId] = useState("");
  const [loanOfficerId, setLoanOfficerId] = useState("");
  const [password, setPasswordValue] = useState("");
  const [name, setName] = useState("");
  const [setupToken, setSetupToken] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, signup, setPassword: setUserPassword, isAuthenticated, user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated && user) {
      // Redirect super admins to super admin panel, others to dashboard
      setLocation(user.isSuperAdmin ? '/super-admin' : '/dashboard');
    }
  }, [isAuthenticated, user, isAuthLoading, setLocation]);

  const handleCheckLoanOfficerId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId.trim() || !loanOfficerId.trim()) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/auth/check/${encodeURIComponent(loanOfficerId.trim())}?organizationId=${encodeURIComponent(organizationId.trim())}`);
      const data: CheckUserResponse = await response.json();
      
      if (!data.exists) {
        // Loan officer ID not found in client data OR user records - cannot proceed
        setAuthStep('not-registered');
        setIsSubmitting(false);
        return;
      }
      
      if (data.isRegistered) {
        // User account already exists
        if (data.needsPasswordSetup) {
          // User exists but needs to set password for first time
          const loginResult = await login(organizationId, loanOfficerId, "", true); // skipRedirect = true
          if (loginResult.needsPasswordSetup && loginResult.setupToken) {
            setSetupToken(loginResult.setupToken);
            setAuthStep('set-password');
          } else {
            toast({
              title: t('auth.setupError'),
              description: t('auth.failedToInitialize'),
              variant: "destructive",
            });
          }
        } else {
          // User has password set - go to login
          setAuthStep('login');
        }
      } else {
        // Loan officer ID exists in client data but no user account yet - allow signup
        setAuthStep('signup');
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: t('auth.failedToCheck'),
        variant: "destructive",
      });
    }
    
    setIsSubmitting(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await login(organizationId, loanOfficerId, password);
    
    if (!result.success) {
      if (result.needsPasswordSetup && result.setupToken) {
        setSetupToken(result.setupToken);
        setAuthStep('set-password');
      } else {
        toast({
          title: t('auth.loginFailed'),
          description: result.error || t('auth.invalidCredentials'),
          variant: "destructive",
        });
      }
    }
    
    setIsSubmitting(false);
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!setupToken) {
      toast({
        title: t('auth.setupTokenMissing'),
        description: t('auth.securityTokenMissing'),
        variant: "destructive",
      });
      setAuthStep('check-id');
      return;
    }

    setIsSubmitting(true);

    const success = await setUserPassword(setupToken, password);
    
    if (!success) {
      toast({
        title: t('auth.passwordSetupFailed'),
        description: t('auth.failedToSetPassword'),
        variant: "destructive",
      });
    }
    
    setIsSubmitting(false);
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const result = await signup(organizationId, loanOfficerId, password, name);
    
    if (!result.success) {
      toast({
        title: t('auth.signupFailed'), 
        description: result.error || t('auth.failedToCreate'),
        variant: "destructive",
      });
    } else {
      toast({
        title: t('auth.accountCreated'),
        description: t('auth.accountCreatedSuccess'),
        variant: "default",
      });
    }
    
    setIsSubmitting(false);
  };

  const handleBack = () => {
    setAuthStep('check-id');
    setPasswordValue("");
    setName("");
    // Keep organizationId and loanOfficerId so user doesn't have to re-enter
  };

  if (isAuthLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-primary/5 to-accent/10">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">{t('common.loading') || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 to-accent/10" data-testid="login-screen">
      <Card className="w-full max-w-md shadow-xl border border-border relative">
        <div className="absolute top-4 end-4">
          <LanguageSwitcher />
        </div>
        <CardHeader>
          <div className="text-center">
            <div className="w-16 h-16 bg-primary rounded-full flex items-center justify-center mx-auto mb-4" data-testid="logo-icon">
              <i className="fas fa-chart-line text-2xl text-primary-foreground"></i>
            </div>
            <CardTitle className="text-2xl font-bold text-foreground" data-testid="app-title">
              {t('app.title')}
            </CardTitle>
            <p className="text-muted-foreground mt-2" data-testid="app-subtitle">
              {t('app.subtitle')}
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {authStep === 'check-id' && (
            <form onSubmit={handleCheckLoanOfficerId} className="space-y-4" data-testid="check-id-form">
              <div>
                <Label htmlFor="organizationId" className="block text-sm font-medium text-foreground mb-2">
                  {t('auth.organizationId')}
                </Label>
                <Input
                  type="text"
                  id="organizationId"
                  placeholder={t('auth.organizationIdPlaceholder')}
                  value={organizationId}
                  onChange={(e) => setOrganizationId(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-organization-id"
                />
              </div>
              <div>
                <Label htmlFor="loanOfficerId" className="block text-sm font-medium text-foreground mb-2">
                  {t('auth.loanOfficerId')}
                </Label>
                <Input
                  type="text"
                  id="loanOfficerId"
                  placeholder={t('auth.loanOfficerIdPlaceholder')}
                  value={loanOfficerId}
                  onChange={(e) => setLoanOfficerId(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-loan-officer-id"
                />
              </div>
              <Button
                type="submit"
                className="w-full font-medium"
                disabled={isSubmitting || !organizationId.trim() || !loanOfficerId.trim()}
                data-testid="button-continue"
              >
                <i className="fas fa-arrow-right me-2"></i>
                {isSubmitting ? t('auth.checking') : t('common.continue')}
              </Button>
            </form>
          )}

          {authStep === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4" data-testid="login-form">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  {t('auth.welcomeBack')} <span className="font-medium text-foreground">{loanOfficerId}</span>
                </p>
              </div>
              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                  {t('auth.password')}
                </Label>
                <Input
                  type="password"
                  id="password"
                  placeholder={t('auth.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-password"
                />
              </div>
              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={isSubmitting}
                  data-testid="button-sign-in"
                >
                  <i className="fas fa-sign-in-alt me-2"></i>
                  {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBack}
                  data-testid="button-back-to-id"
                >
                  <i className="fas fa-arrow-left me-2"></i>
                  {t('common.back')}
                </Button>
              </div>
            </form>
          )}

          {authStep === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-4" data-testid="set-password-form">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  Welcome <span className="font-medium text-foreground">{loanOfficerId}</span>! {t('auth.welcomeMessage')}
                </p>
              </div>
              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                  {t('auth.newPassword')}
                </Label>
                <Input
                  type="password"
                  id="password"
                  placeholder={t('auth.newPasswordPlaceholder')}
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-new-password"
                />
              </div>
              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={isSubmitting}
                  data-testid="button-set-password"
                >
                  <i className="fas fa-key me-2"></i>
                  {isSubmitting ? t('auth.settingPassword') : t('auth.setPassword')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBack}
                  data-testid="button-back-to-id"
                >
                  <i className="fas fa-arrow-left me-2"></i>
                  {t('common.back')}
                </Button>
              </div>
            </form>
          )}

          {authStep === 'signup' && (
            <form onSubmit={handleSignup} className="space-y-4" data-testid="signup-form">
              <div className="mb-4">
                <p className="text-sm text-muted-foreground">
                  {t('auth.createAccountFor')} <span className="font-medium text-foreground">{loanOfficerId}</span>
                </p>
              </div>
              <div>
                <Label htmlFor="name" className="block text-sm font-medium text-foreground mb-2">
                  {t('auth.fullName')}
                </Label>
                <Input
                  type="text"
                  id="name"
                  placeholder={t('auth.fullNamePlaceholder')}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-full-name"
                />
              </div>
              <div>
                <Label htmlFor="password" className="block text-sm font-medium text-foreground mb-2">
                  {t('auth.password')}
                </Label>
                <Input
                  type="password"
                  id="password"
                  placeholder={t('auth.newPasswordPlaceholder')}
                  value={password}
                  onChange={(e) => setPasswordValue(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-password"
                />
              </div>
              <div className="space-y-2">
                <Button
                  type="submit"
                  className="w-full font-medium"
                  disabled={isSubmitting}
                  data-testid="button-create-account"
                >
                  <i className="fas fa-user-plus me-2"></i>
                  {isSubmitting ? t('auth.creatingAccount') : t('auth.createAccount')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBack}
                  data-testid="button-back-to-id"
                >
                  <i className="fas fa-arrow-left me-2"></i>
                  {t('common.back')}
                </Button>
              </div>
            </form>
          )}

          {authStep === 'not-registered' && (
            <div className="space-y-4" data-testid="not-registered-message">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <i className="fas fa-exclamation-triangle text-xl text-destructive"></i>
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t('auth.notRegisteredTitle', { defaultValue: 'Loan Officer ID Not Found' })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('auth.notRegisteredMessage', { defaultValue: 'The Loan Officer ID you entered is not registered in the system.' })}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">
                  {t('auth.whatToDo', { defaultValue: 'What you can do:' })}
                </p>
                <ul className="list-disc list-inside space-y-1 ms-2">
                  <li>{t('auth.checkIdTypo', { defaultValue: 'Check if you typed your Loan Officer ID correctly' })}</li>
                  <li>{t('auth.contactAdmin', { defaultValue: 'Contact your administrator to be added to the system' })}</li>
                  <li>{t('auth.waitForSync', { defaultValue: 'Wait for the next data sync if you were recently added' })}</li>
                </ul>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleBack}
                data-testid="button-try-again"
              >
                <i className="fas fa-arrow-left me-2"></i>
                {t('auth.tryAgain', { defaultValue: 'Try Again' })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
