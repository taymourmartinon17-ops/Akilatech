import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useTranslation } from 'react-i18next';
import { Loader2, Users, UserCheck, ArrowLeft } from "lucide-react";

type AuthStep = 'select-role-type' | 'check-id' | 'select-role' | 'login' | 'signup' | 'set-password' | 'not-registered';

interface CheckUserResponse {
  exists: boolean;
  isRegistered: boolean;
  loanOfficerId: string;
  needsPasswordSetup?: boolean;
  hasPassword?: boolean;
  isLoanOfficer?: boolean;
  isManager?: boolean;
  currentRole?: string;
}

export default function Login() {
  const { t } = useTranslation();
  const [authStep, setAuthStep] = useState<AuthStep>('select-role-type');
  const [organizationId, setOrganizationId] = useState("");
  const [loanOfficerId, setLoanOfficerId] = useState("");
  const [password, setPasswordValue] = useState("");
  const [name, setName] = useState("");
  const [setupToken, setSetupToken] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedRole, setSelectedRole] = useState<'loan_officer' | 'manager'>('loan_officer');
  const [checkData, setCheckData] = useState<CheckUserResponse | null>(null);
  const { login, signup, setPassword: setUserPassword, isAuthenticated, user, isLoading: isAuthLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (isAuthLoading) return;
    if (isAuthenticated && user) {
      const redirectPath = user.isSuperAdmin ? '/super-admin' : 
                           user.role === 'manager' ? '/manager' : '/dashboard';
      setLocation(redirectPath);
    }
  }, [isAuthenticated, user, isAuthLoading, setLocation]);

  const handleRoleTypeSelection = (roleType: 'loan_officer' | 'manager') => {
    setSelectedRole(roleType);
    setAuthStep('check-id');
  };

  const handleCheckLoanOfficerId = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!organizationId.trim() || !loanOfficerId.trim()) return;
    
    setIsSubmitting(true);
    
    try {
      const response = await fetch(`/api/auth/check/${encodeURIComponent(loanOfficerId.trim())}?organizationId=${encodeURIComponent(organizationId.trim())}`);
      const data: CheckUserResponse = await response.json();
      setCheckData(data);
      
      if (!data.exists) {
        setAuthStep('not-registered');
        setIsSubmitting(false);
        return;
      }
      
      // Validate that the user can use the selected role
      if (selectedRole === 'manager' && !data.isManager) {
        toast({
          title: t('common.error'),
          description: t('auth.notRegisteredAsManager', { defaultValue: 'This ID is not registered as a Branch Manager.' }),
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      if (selectedRole === 'loan_officer' && !data.isLoanOfficer) {
        toast({
          title: t('common.error'),
          description: t('auth.notRegisteredAsOfficer', { defaultValue: 'This ID is not registered as a Loan Officer.' }),
          variant: "destructive",
        });
        setIsSubmitting(false);
        return;
      }
      
      if (data.isRegistered) {
        if (data.needsPasswordSetup) {
          const loginResult = await login(organizationId, loanOfficerId, "", true);
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
          setAuthStep('login');
        }
      } else {
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

    const result = await signup(organizationId, loanOfficerId, password, name, selectedRole);
    
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
    if (authStep === 'check-id') {
      setAuthStep('select-role-type');
    } else {
      setAuthStep('check-id');
    }
    setPasswordValue("");
    setName("");
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
          {authStep === 'select-role-type' && (
            <div className="space-y-4" data-testid="select-role-type-form">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t('auth.howToLogin', { defaultValue: 'How would you like to log in?' })}
                </h3>
              </div>
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full h-auto py-5 flex items-center gap-4 bg-indigo-600 hover:bg-indigo-700 text-white"
                  onClick={() => handleRoleTypeSelection('loan_officer')}
                  data-testid="button-login-officer"
                >
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <UserCheck className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-lg block">{t('auth.roleLoanOfficer', { defaultValue: 'Loan Officer' })}</span>
                    <span className="text-sm text-indigo-100">{t('auth.roleLoanOfficerDesc', { defaultValue: 'Manage your assigned clients' })}</span>
                  </div>
                </Button>
                <Button
                  type="button"
                  className="w-full h-auto py-5 flex items-center gap-4 bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => handleRoleTypeSelection('manager')}
                  data-testid="button-login-manager"
                >
                  <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="text-left">
                    <span className="font-semibold text-lg block">{t('auth.roleManager', { defaultValue: 'Branch Manager' })}</span>
                    <span className="text-sm text-purple-100">{t('auth.roleManagerDesc', { defaultValue: 'Oversee branch clients and loan officers' })}</span>
                  </div>
                </Button>
              </div>
            </div>
          )}

          {authStep === 'check-id' && (
            <form onSubmit={handleCheckLoanOfficerId} className="space-y-4" data-testid="check-id-form">
              <div className="text-center mb-4">
                <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
                  selectedRole === 'manager' 
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                }`}>
                  {selectedRole === 'manager' ? <Users className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  {selectedRole === 'manager' ? t('auth.roleManager') : t('auth.roleLoanOfficer')}
                </div>
              </div>
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
                  {selectedRole === 'manager' ? t('auth.managerId', { defaultValue: 'Manager ID' }) : t('auth.loanOfficerId')}
                </Label>
                <Input
                  type="text"
                  id="loanOfficerId"
                  placeholder={selectedRole === 'manager' ? t('auth.managerIdPlaceholder', { defaultValue: 'Enter your Manager ID' }) : t('auth.loanOfficerIdPlaceholder')}
                  value={loanOfficerId}
                  onChange={(e) => setLoanOfficerId(e.target.value)}
                  className="w-full"
                  required
                  data-testid="input-loan-officer-id"
                />
              </div>
              <Button
                type="submit"
                className={`w-full font-medium ${selectedRole === 'manager' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                disabled={isSubmitting || !organizationId.trim() || !loanOfficerId.trim()}
                data-testid="button-continue"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 me-2 animate-spin" />
                    {t('auth.checking')}
                  </>
                ) : (
                  t('common.continue')
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBack}
                data-testid="button-back-to-role"
              >
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
            </form>
          )}

          {authStep === 'select-role' && (
            <div className="space-y-4" data-testid="select-role-form">
              <div className="text-center mb-4">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {t('auth.selectRole', { defaultValue: 'Select Your Role' })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t('auth.selectRoleDescription', { defaultValue: 'Your ID is registered as both a Loan Officer and Branch Manager. Please choose how you want to log in.' })}
                </p>
              </div>
              <div className="space-y-3">
                <Button
                  type="button"
                  className="w-full h-auto py-4 flex flex-col items-center gap-2"
                  variant="outline"
                  onClick={() => {
                    setSelectedRole('loan_officer');
                    setAuthStep('signup');
                  }}
                  data-testid="button-role-officer"
                >
                  <UserCheck className="h-6 w-6 text-indigo-600" />
                  <span className="font-medium">{t('auth.roleLoanOfficer', { defaultValue: 'Loan Officer' })}</span>
                  <span className="text-xs text-muted-foreground">{t('auth.roleLoanOfficerDesc', { defaultValue: 'Manage your assigned clients' })}</span>
                </Button>
                <Button
                  type="button"
                  className="w-full h-auto py-4 flex flex-col items-center gap-2"
                  variant="outline"
                  onClick={() => {
                    setSelectedRole('manager');
                    setAuthStep('signup');
                  }}
                  data-testid="button-role-manager"
                >
                  <Users className="h-6 w-6 text-purple-600" />
                  <span className="font-medium">{t('auth.roleManager', { defaultValue: 'Branch Manager' })}</span>
                  <span className="text-xs text-muted-foreground">{t('auth.roleManagerDesc', { defaultValue: 'Oversee branch clients and loan officers' })}</span>
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={handleBack}
                data-testid="button-back-from-role"
              >
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('common.back')}
              </Button>
            </div>
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
                  className={`w-full font-medium ${selectedRole === 'manager' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  disabled={isSubmitting}
                  data-testid="button-sign-in"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      {t('auth.signingIn')}
                    </>
                  ) : (
                    t('auth.signIn')
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBack}
                  data-testid="button-back-to-id"
                >
                  <ArrowLeft className="h-4 w-4 me-2" />
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
                  className={`w-full font-medium ${selectedRole === 'manager' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  disabled={isSubmitting}
                  data-testid="button-set-password"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      {t('auth.settingPassword')}
                    </>
                  ) : (
                    t('auth.setPassword')
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBack}
                  data-testid="button-back-to-id"
                >
                  <ArrowLeft className="h-4 w-4 me-2" />
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
                <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs font-medium mt-2 ${
                  selectedRole === 'manager' 
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' 
                    : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                }`}>
                  {selectedRole === 'manager' ? <Users className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                  {selectedRole === 'manager' ? t('auth.roleManager') : t('auth.roleLoanOfficer')}
                </div>
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
                  className={`w-full font-medium ${selectedRole === 'manager' ? 'bg-purple-600 hover:bg-purple-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                  disabled={isSubmitting}
                  data-testid="button-create-account"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 me-2 animate-spin" />
                      {t('auth.creatingAccount')}
                    </>
                  ) : (
                    t('auth.createAccount')
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={handleBack}
                  data-testid="button-back-to-id"
                >
                  <ArrowLeft className="h-4 w-4 me-2" />
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
                  {selectedRole === 'manager' 
                    ? t('auth.notRegisteredManagerTitle', { defaultValue: 'Manager ID Not Found' })
                    : t('auth.notRegisteredTitle', { defaultValue: 'Loan Officer ID Not Found' })}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {selectedRole === 'manager'
                    ? t('auth.notRegisteredManagerMessage', { defaultValue: 'The Manager ID you entered is not registered in the system.' })
                    : t('auth.notRegisteredMessage', { defaultValue: 'The Loan Officer ID you entered is not registered in the system.' })}
                </p>
              </div>
              <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-2">
                  {t('auth.whatToDo', { defaultValue: 'What you can do:' })}
                </p>
                <ul className="list-disc list-inside space-y-1 ms-2">
                  <li>{t('auth.checkIdTypo', { defaultValue: 'Check if you typed your ID correctly' })}</li>
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
                <ArrowLeft className="h-4 w-4 me-2" />
                {t('auth.tryAgain', { defaultValue: 'Try Again' })}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
