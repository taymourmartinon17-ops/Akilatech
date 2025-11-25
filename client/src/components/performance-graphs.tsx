import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useMemo, useState, useEffect } from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Users, DollarSign, Target, ArrowUp, ArrowDown } from 'lucide-react';
import type { Client, Visit, PortfolioSnapshot } from '@shared/schema';
import { apiRequest } from '@/lib/queryClient';
import { motion } from 'framer-motion';

interface PerformanceGraphsProps {
  loanOfficerId: string;
}

export function PerformanceGraphs({ loanOfficerId }: PerformanceGraphsProps) {
  const { t } = useTranslation();
  
  // Reactive dark mode detection
  const [isDark, setIsDark] = useState(() => 
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );
  
  useEffect(() => {
    // Watch for dark mode changes
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    
    return () => observer.disconnect();
  }, []);
  
  // Theme-aware colors for charts
  const gridColor = isDark ? '#374151' : '#e5e7eb';
  const axisColor = isDark ? '#9ca3af' : '#6b7280';
  
  const { data: clients = [] } = useQuery<Client[]>({
    queryKey: ['/api/clients', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  const { data: visits = [] } = useQuery<Visit[]>({
    queryKey: ['/api/visits', loanOfficerId],
    enabled: !!loanOfficerId,
  });

  // Fetch historical portfolio snapshots
  const { data: snapshots = [] } = useQuery<PortfolioSnapshot[]>({
    queryKey: ['/api/portfolio/snapshots', loanOfficerId],
    queryFn: async () => {
      // Construct URL with loanOfficerId if it's provided and not a sentinel value
      const url = loanOfficerId && loanOfficerId !== 'all'
        ? `/api/portfolio/snapshots?loanOfficerId=${encodeURIComponent(loanOfficerId)}`
        : '/api/portfolio/snapshots';
      
      const res = await apiRequest('GET', url);
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to fetch portfolio snapshots: ${errorText || res.statusText}`);
      }
      return await res.json(); // CRITICAL: await the JSON parsing
    },
    enabled: !!loanOfficerId, // Enable for all cases including "all"
  });

  // Calculate portfolio metrics over time using real historical data
  // Falls back to simulated data if no snapshots exist
  const monthlyData = useMemo(() => {
    // If we have historical snapshots, use them
    if (snapshots.length > 0) {
      // Sort by date (oldest first) and take the last 12 months
      const sortedSnapshots = [...snapshots]
        .sort((a, b) => new Date(a.snapshotDate).getTime() - new Date(b.snapshotDate).getTime())
        .slice(-12);

      return sortedSnapshots.map(snapshot => {
        const date = new Date(snapshot.snapshotDate);
        const monthName = date.toLocaleString('en', { month: 'short' });
        
        return {
          month: monthName,
          walletSize: snapshot.totalOutstanding || 0,
          clients: snapshot.totalClients || 0,
          avgRisk: snapshot.avgRiskScore || 0,
          visits: snapshot.completedVisits || 0,
        };
      });
    }

    // Fallback: Use simulated data if no historical snapshots exist
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const currentTotalOutstanding = clients.reduce((sum, c) => sum + c.outstanding, 0);
    const currentClients = clients.length;
    const currentAvgRisk = clients.length > 0 
      ? clients.reduce((sum, c) => sum + c.riskScore, 0) / clients.length 
      : 0;

    return months.map((month, index) => {
      const growthFactor = (index + 1) / months.length;
      const variance = 0.95 + (index * 0.02); // Deterministic variance based on index
      
      return {
        month,
        walletSize: Math.round(currentTotalOutstanding * growthFactor * variance),
        clients: Math.round(currentClients * growthFactor * variance),
        avgRisk: Math.round(currentAvgRisk * (1 - growthFactor * 0.3) * variance),
        visits: Math.round((visits.length / months.length) * (index + 1) * variance),
      };
    });
  }, [clients, visits, snapshots]);

  // Calculate current metrics
  const totalWallet = clients.reduce((sum, c) => sum + c.outstanding, 0);
  const avgRisk = clients.length > 0 
    ? clients.reduce((sum, c) => sum + c.riskScore, 0) / clients.length 
    : 0;
  const highRiskClients = clients.filter(c => c.riskScore > 70).length;
  const completedVisits = visits.filter(v => v.status === 'completed').length;

  // Calculate growth percentages
  const walletGrowth = monthlyData.length >= 2 
    ? ((monthlyData[monthlyData.length - 1].walletSize - monthlyData[0].walletSize) / monthlyData[0].walletSize) * 100 
    : 0;
  const clientGrowth = monthlyData.length >= 2 
    ? ((monthlyData[monthlyData.length - 1].clients - monthlyData[0].clients) / monthlyData[0].clients) * 100 
    : 0;
  const riskReduction = monthlyData.length >= 2 
    ? ((monthlyData[0].avgRisk - monthlyData[monthlyData.length - 1].avgRisk) / monthlyData[0].avgRisk) * 100 
    : 0;

  const formatCurrency = (value: number) => {
    return `${(value / 1000).toFixed(0)}K JOD`;
  };

  // Simplified formatter for Y-axis (no currency symbol to prevent overlap)
  const formatYAxis = (value: number) => {
    return `${(value / 1000).toFixed(0)}K`;
  };

  const customTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 p-3 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-gray-100">{label}</p>
          {payload.map((entry: any, index: number) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: {entry.name.includes('Wallet') || entry.name.includes('Size') 
                ? formatCurrency(entry.value) 
                : Math.round(entry.value)}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="grid grid-cols-1 lg:grid-cols-2 gap-6"
    >
      {/* Wallet Size Growth */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="rounded-xl border border-green-200 dark:border-green-800 shadow-lg overflow-hidden" 
        data-testid="graph-wallet-growth"
      >
        <div className="bg-emerald-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <DollarSign className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t('performanceGraphs.portfolioValue')}</h3>
                <p className="text-sm text-green-100">{t('performanceGraphs.portfolioValueDesc')}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{formatCurrency(totalWallet)}</div>
              <div className={`text-sm flex items-center gap-1 justify-end ${walletGrowth >= 0 ? 'text-green-200' : 'text-purple-200'}`}>
                {walletGrowth >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                {Math.abs(walletGrowth).toFixed(1)}% {t('performanceGraphs.growth')}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 bg-white dark:bg-slate-950">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fill: axisColor }} style={{ fontSize: '12px' }} />
              <YAxis tick={{ fill: axisColor }} style={{ fontSize: '12px' }} tickFormatter={formatYAxis} tickCount={5} width={50} />
              <Tooltip content={customTooltip} />
              <Area 
                type="monotone" 
                dataKey="walletSize" 
                stroke="#059669" 
                fillOpacity={0.3} 
                fill="#059669" 
                name={t('performanceGraphs.walletSize')}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Client Portfolio Growth */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="rounded-xl border border-blue-200 dark:border-blue-800 shadow-lg overflow-hidden" 
        data-testid="graph-client-growth"
      >
        <div className="bg-indigo-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Users className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t('performanceGraphs.clientPortfolio')}</h3>
                <p className="text-sm text-blue-100">{t('performanceGraphs.clientPortfolioDesc')}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{clients.length}</div>
              <div className={`text-sm flex items-center gap-1 justify-end ${clientGrowth >= 0 ? 'text-blue-200' : 'text-indigo-200'}`}>
                {clientGrowth >= 0 ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                {Math.abs(clientGrowth).toFixed(1)}% {t('performanceGraphs.growth')}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 bg-white dark:bg-slate-950">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fill: axisColor }} style={{ fontSize: '12px' }} />
              <YAxis tick={{ fill: axisColor }} style={{ fontSize: '12px' }} tickCount={5} width={50} />
              <Tooltip content={customTooltip} />
              <Line 
                type="monotone" 
                dataKey="clients" 
                stroke="#4f46e5" 
                strokeWidth={3}
                dot={{ fill: '#4f46e5', r: 4 }}
                name={t('performanceGraphs.clients')}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* Risk Score Trend */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="rounded-xl border border-purple-200 dark:border-purple-800 shadow-lg overflow-hidden" 
        data-testid="graph-risk-trend"
      >
        <div className="bg-purple-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t('performanceGraphs.riskManagement')}</h3>
                <p className="text-sm text-purple-100">{t('performanceGraphs.riskManagementDesc')}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{avgRisk.toFixed(1)}</div>
              <div className={`text-sm flex items-center gap-1 justify-end ${riskReduction >= 0 ? 'text-green-200' : 'text-purple-200'}`}>
                {riskReduction >= 0 ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
                {Math.abs(riskReduction).toFixed(1)}% {riskReduction >= 0 ? t('performanceGraphs.reduced') : t('performanceGraphs.increased')}
              </div>
            </div>
          </div>
        </div>
        <div className="p-5 bg-white dark:bg-slate-950">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fill: axisColor }} style={{ fontSize: '12px' }} />
              <YAxis tick={{ fill: axisColor }} style={{ fontSize: '12px' }} domain={[0, 100]} tickCount={5} width={50} />
              <Tooltip content={customTooltip} />
              <Area 
                type="monotone" 
                dataKey="avgRisk" 
                stroke="#9333ea" 
                fillOpacity={0.3} 
                fill="#9333ea" 
                name={t('performanceGraphs.avgRiskScore')}
              />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-4 flex items-center justify-between text-sm">
            <div className="text-gray-600 dark:text-gray-400">
              <span className="font-semibold">{highRiskClients}</span> {t('performanceGraphs.highRiskClients')}
            </div>
            <div className="text-purple-600 dark:text-purple-400 font-medium">
              {t('performanceGraphs.target')}: &lt;50
            </div>
          </div>
        </div>
      </motion.div>

      {/* Visit Activity */}
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="rounded-xl border border-blue-200 dark:border-blue-800 shadow-lg overflow-hidden" 
        data-testid="graph-visit-activity"
      >
        <div className="bg-amber-600 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white/20 rounded-lg backdrop-blur-sm">
                <Target className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg">{t('performanceGraphs.visitActivity')}</h3>
                <p className="text-sm text-amber-100">{t('performanceGraphs.visitActivityDesc')}</p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{completedVisits}</div>
              <div className="text-sm text-amber-200">{t('performanceGraphs.completedVisits')}</div>
            </div>
          </div>
        </div>
        <div className="p-5 bg-white dark:bg-slate-950">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis dataKey="month" tick={{ fill: axisColor }} style={{ fontSize: '12px' }} />
              <YAxis tick={{ fill: axisColor }} style={{ fontSize: '12px' }} tickCount={5} width={50} />
              <Tooltip content={customTooltip} />
              <Bar 
                dataKey="visits" 
                fill="#d97706" 
                radius={[8, 8, 0, 0]}
                name={t('performanceGraphs.visits')}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </motion.div>
  );
}
