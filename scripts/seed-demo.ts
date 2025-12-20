import { storage } from '../server/storage.js';

const DEMO_ORG_ID = 'demo';
const DEMO_ORG_NAME = 'Demo Microfinance';

interface DemoUser {
  loanOfficerId: string;
  name: string;
  password: string;
  role: 'loan_officer' | 'manager' | 'admin';
  isAdmin: boolean;
  managerId?: string;
}

interface DemoClient {
  clientId: string;
  name: string;
  loanOfficerId: string;
  managerId: string;
  outstanding: number;
  outstandingAtRisk: number;
  parPerLoan: number;
  lateDays: number;
  totalDelayedInstalments: number;
  paidInstalments: number;
  countReschedule: number;
  paymentMonthly: number;
  isAtRisk: boolean;
  riskScore: number;
  feedbackScore: number;
  compositeUrgency: number;
  urgencyClassification: string;
  lastVisitDate?: Date;
  lastPhoneCallDate?: Date;
  visitNotes?: string;
  actionSuggestions: any[];
}

const demoUsers: DemoUser[] = [
  {
    loanOfficerId: 'MGR001',
    name: 'Sarah Johnson',
    password: 'demo123',
    role: 'manager',
    isAdmin: false,
    managerId: 'MGR001',
  },
  {
    loanOfficerId: 'LO001',
    name: 'Ahmed Hassan',
    password: 'demo123',
    role: 'loan_officer',
    isAdmin: false,
    managerId: 'MGR001',
  },
  {
    loanOfficerId: 'LO002',
    name: 'Maria Garcia',
    password: 'demo123',
    role: 'loan_officer',
    isAdmin: false,
    managerId: 'MGR001',
  },
  {
    loanOfficerId: 'LO003',
    name: 'David Chen',
    password: 'demo123',
    role: 'loan_officer',
    isAdmin: false,
    managerId: 'MGR001',
  },
  {
    loanOfficerId: 'ADMIN',
    name: 'Demo Administrator',
    password: 'admin123',
    role: 'admin',
    isAdmin: true,
  },
];

const demoClients: DemoClient[] = [
  // Critical Risk Clients (Risk Score 80-100)
  {
    clientId: 'C001',
    name: 'Ahmad Al-Rashid',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 15000,
    outstandingAtRisk: 12000,
    parPerLoan: 0.85,
    lateDays: 45,
    totalDelayedInstalments: 6,
    paidInstalments: 2,
    countReschedule: 2,
    paymentMonthly: 1500,
    isAtRisk: true,
    riskScore: 92,
    feedbackScore: 2,
    compositeUrgency: 95,
    urgencyClassification: 'Critical',
    lastVisitDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    visitNotes: 'Client facing serious financial difficulties. Needs immediate attention.',
    actionSuggestions: [{ action: 'visit', description: 'Urgent field visit required', urgency: 'immediate', reasoning: 'High risk score with extended late days' }],
  },
  {
    clientId: 'C002',
    name: 'Fatima Osman',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 22000,
    outstandingAtRisk: 18000,
    parPerLoan: 0.78,
    lateDays: 60,
    totalDelayedInstalments: 8,
    paidInstalments: 4,
    countReschedule: 3,
    paymentMonthly: 2200,
    isAtRisk: true,
    riskScore: 88,
    feedbackScore: 1,
    compositeUrgency: 91,
    urgencyClassification: 'Critical',
    visitNotes: 'Multiple rescheduling attempts. Consider loan restructuring.',
    actionSuggestions: [{ action: 'visit', description: 'Immediate escalation visit', urgency: 'immediate', reasoning: 'Critical delinquency with poor feedback' }],
  },
  {
    clientId: 'C003',
    name: 'Mohammed Khalil',
    loanOfficerId: 'LO002',
    managerId: 'MGR001',
    outstanding: 8500,
    outstandingAtRisk: 8500,
    parPerLoan: 1.0,
    lateDays: 90,
    totalDelayedInstalments: 12,
    paidInstalments: 0,
    countReschedule: 4,
    paymentMonthly: 850,
    isAtRisk: true,
    riskScore: 98,
    feedbackScore: 1,
    compositeUrgency: 99,
    urgencyClassification: 'Critical',
    lastVisitDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    visitNotes: 'Client not responding. Escalate to recovery team.',
    actionSuggestions: [{ action: 'escalate', description: 'Transfer to recovery', urgency: 'immediate', reasoning: 'Complete default status' }],
  },

  // High Risk Clients (Risk Score 60-80)
  {
    clientId: 'C004',
    name: 'Layla Mahmoud',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 12000,
    outstandingAtRisk: 6000,
    parPerLoan: 0.5,
    lateDays: 25,
    totalDelayedInstalments: 3,
    paidInstalments: 5,
    countReschedule: 1,
    paymentMonthly: 1200,
    isAtRisk: true,
    riskScore: 72,
    feedbackScore: 3,
    compositeUrgency: 75,
    urgencyClassification: 'High',
    lastVisitDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
    visitNotes: 'Temporary job loss. Expects new employment next month.',
    actionSuggestions: [{ action: 'call', description: 'Follow-up call to check employment status', urgency: 'within_3_days', reasoning: 'High risk but showing willingness to pay' }],
  },
  {
    clientId: 'C005',
    name: 'Omar Abdullah',
    loanOfficerId: 'LO002',
    managerId: 'MGR001',
    outstanding: 18000,
    outstandingAtRisk: 9000,
    parPerLoan: 0.55,
    lateDays: 30,
    totalDelayedInstalments: 4,
    paidInstalments: 6,
    countReschedule: 2,
    paymentMonthly: 1800,
    isAtRisk: true,
    riskScore: 68,
    feedbackScore: 2,
    compositeUrgency: 72,
    urgencyClassification: 'High',
    lastPhoneCallDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    visitNotes: 'Business slowdown affecting repayment. Needs payment plan revision.',
    actionSuggestions: [{ action: 'visit', description: 'Schedule field visit to assess business', urgency: 'within_3_days', reasoning: 'Need to evaluate business situation' }],
  },
  {
    clientId: 'C006',
    name: 'Nadia Hassan',
    loanOfficerId: 'LO003',
    managerId: 'MGR001',
    outstanding: 9500,
    outstandingAtRisk: 4000,
    parPerLoan: 0.42,
    lateDays: 20,
    totalDelayedInstalments: 2,
    paidInstalments: 8,
    countReschedule: 1,
    paymentMonthly: 950,
    isAtRisk: true,
    riskScore: 65,
    feedbackScore: 3,
    compositeUrgency: 68,
    urgencyClassification: 'High',
    lastVisitDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
    actionSuggestions: [{ action: 'call', description: 'Reminder call for upcoming payment', urgency: 'within_week', reasoning: 'Moderate risk with recent interaction' }],
  },

  // Medium Risk Clients (Risk Score 30-60)
  {
    clientId: 'C007',
    name: 'Yusuf Ibrahim',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 6000,
    outstandingAtRisk: 1200,
    parPerLoan: 0.2,
    lateDays: 10,
    totalDelayedInstalments: 1,
    paidInstalments: 9,
    countReschedule: 0,
    paymentMonthly: 600,
    isAtRisk: false,
    riskScore: 45,
    feedbackScore: 4,
    compositeUrgency: 48,
    urgencyClassification: 'Medium',
    lastPhoneCallDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
    visitNotes: 'Minor delay due to bank processing. Resolved.',
    actionSuggestions: [{ action: 'call', description: 'Courtesy check-in call', urgency: 'within_week', reasoning: 'Monitor for consistency' }],
  },
  {
    clientId: 'C008',
    name: 'Amira Saleh',
    loanOfficerId: 'LO002',
    managerId: 'MGR001',
    outstanding: 11000,
    outstandingAtRisk: 2200,
    parPerLoan: 0.2,
    lateDays: 12,
    totalDelayedInstalments: 2,
    paidInstalments: 8,
    countReschedule: 0,
    paymentMonthly: 1100,
    isAtRisk: false,
    riskScore: 52,
    feedbackScore: 3,
    compositeUrgency: 55,
    urgencyClassification: 'Medium',
    lastVisitDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
    actionSuggestions: [{ action: 'call', description: 'Payment reminder', urgency: 'within_week', reasoning: 'Medium risk requiring follow-up' }],
  },
  {
    clientId: 'C009',
    name: 'Khaled Nasser',
    loanOfficerId: 'LO003',
    managerId: 'MGR001',
    outstanding: 7500,
    outstandingAtRisk: 1500,
    parPerLoan: 0.18,
    lateDays: 8,
    totalDelayedInstalments: 1,
    paidInstalments: 10,
    countReschedule: 0,
    paymentMonthly: 750,
    isAtRisk: false,
    riskScore: 38,
    feedbackScore: 4,
    compositeUrgency: 42,
    urgencyClassification: 'Medium',
    lastVisitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    visitNotes: 'Good payment history. Minor seasonal variation.',
    actionSuggestions: [{ action: 'monitor', description: 'Continue monitoring', urgency: 'within_month', reasoning: 'Stable client with good track record' }],
  },
  {
    clientId: 'C010',
    name: 'Samia Farouk',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 14000,
    outstandingAtRisk: 2800,
    parPerLoan: 0.22,
    lateDays: 15,
    totalDelayedInstalments: 2,
    paidInstalments: 7,
    countReschedule: 1,
    paymentMonthly: 1400,
    isAtRisk: false,
    riskScore: 48,
    feedbackScore: 3,
    compositeUrgency: 52,
    urgencyClassification: 'Medium',
    lastPhoneCallDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    actionSuggestions: [{ action: 'call', description: 'Follow-up on payment arrangement', urgency: 'within_week', reasoning: 'Recent communication established' }],
  },

  // Low Risk Clients (Risk Score 0-30)
  {
    clientId: 'C011',
    name: 'Rania Ahmed',
    loanOfficerId: 'LO002',
    managerId: 'MGR001',
    outstanding: 5000,
    outstandingAtRisk: 0,
    parPerLoan: 0,
    lateDays: 0,
    totalDelayedInstalments: 0,
    paidInstalments: 12,
    countReschedule: 0,
    paymentMonthly: 500,
    isAtRisk: false,
    riskScore: 8,
    feedbackScore: 5,
    compositeUrgency: 12,
    urgencyClassification: 'Low',
    lastVisitDate: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
    visitNotes: 'Excellent client. Perfect payment record.',
    actionSuggestions: [{ action: 'monitor', description: 'Standard monitoring', urgency: 'within_month', reasoning: 'Low risk client' }],
  },
  {
    clientId: 'C012',
    name: 'Tariq Mansour',
    loanOfficerId: 'LO003',
    managerId: 'MGR001',
    outstanding: 8000,
    outstandingAtRisk: 0,
    parPerLoan: 0,
    lateDays: 0,
    totalDelayedInstalments: 0,
    paidInstalments: 15,
    countReschedule: 0,
    paymentMonthly: 800,
    isAtRisk: false,
    riskScore: 5,
    feedbackScore: 5,
    compositeUrgency: 8,
    urgencyClassification: 'Low',
    lastPhoneCallDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    visitNotes: 'Reliable borrower. Consider for loan increase.',
    actionSuggestions: [{ action: 'monitor', description: 'Routine check', urgency: 'within_month', reasoning: 'Excellent payment history' }],
  },
  {
    clientId: 'C013',
    name: 'Dina Kamel',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 3500,
    outstandingAtRisk: 0,
    parPerLoan: 0,
    lateDays: 2,
    totalDelayedInstalments: 0,
    paidInstalments: 10,
    countReschedule: 0,
    paymentMonthly: 350,
    isAtRisk: false,
    riskScore: 12,
    feedbackScore: 5,
    compositeUrgency: 15,
    urgencyClassification: 'Low',
    lastVisitDate: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
    actionSuggestions: [{ action: 'monitor', description: 'Continue monitoring', urgency: 'within_month', reasoning: 'Good standing client' }],
  },
  {
    clientId: 'C014',
    name: 'Hossam El-Din',
    loanOfficerId: 'LO002',
    managerId: 'MGR001',
    outstanding: 12500,
    outstandingAtRisk: 0,
    parPerLoan: 0,
    lateDays: 0,
    totalDelayedInstalments: 0,
    paidInstalments: 18,
    countReschedule: 0,
    paymentMonthly: 1250,
    isAtRisk: false,
    riskScore: 3,
    feedbackScore: 5,
    compositeUrgency: 5,
    urgencyClassification: 'Low',
    lastVisitDate: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
    visitNotes: 'Top performing client. Excellent relationship.',
    actionSuggestions: [{ action: 'monitor', description: 'Maintain relationship', urgency: 'within_month', reasoning: 'Premium client status' }],
  },
  {
    clientId: 'C015',
    name: 'Mona Saeed',
    loanOfficerId: 'LO003',
    managerId: 'MGR001',
    outstanding: 6500,
    outstandingAtRisk: 0,
    parPerLoan: 0,
    lateDays: 0,
    totalDelayedInstalments: 0,
    paidInstalments: 11,
    countReschedule: 0,
    paymentMonthly: 650,
    isAtRisk: false,
    riskScore: 7,
    feedbackScore: 4,
    compositeUrgency: 10,
    urgencyClassification: 'Low',
    lastPhoneCallDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
    actionSuggestions: [{ action: 'monitor', description: 'Standard review', urgency: 'within_month', reasoning: 'Stable payment behavior' }],
  },

  // Additional varied clients
  {
    clientId: 'C016',
    name: 'Walid Mostafa',
    loanOfficerId: 'LO001',
    managerId: 'MGR001',
    outstanding: 20000,
    outstandingAtRisk: 8000,
    parPerLoan: 0.4,
    lateDays: 22,
    totalDelayedInstalments: 3,
    paidInstalments: 6,
    countReschedule: 1,
    paymentMonthly: 2000,
    isAtRisk: true,
    riskScore: 58,
    feedbackScore: 3,
    compositeUrgency: 62,
    urgencyClassification: 'High',
    lastVisitDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000),
    visitNotes: 'Business expansion causing cash flow issues. Temporary situation.',
    actionSuggestions: [{ action: 'call', description: 'Check on business progress', urgency: 'within_3_days', reasoning: 'Active monitoring needed' }],
  },
  {
    clientId: 'C017',
    name: 'Heba Zaki',
    loanOfficerId: 'LO002',
    managerId: 'MGR001',
    outstanding: 4000,
    outstandingAtRisk: 400,
    parPerLoan: 0.1,
    lateDays: 5,
    totalDelayedInstalments: 1,
    paidInstalments: 14,
    countReschedule: 0,
    paymentMonthly: 400,
    isAtRisk: false,
    riskScore: 22,
    feedbackScore: 4,
    compositeUrgency: 25,
    urgencyClassification: 'Low',
    lastPhoneCallDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    actionSuggestions: [{ action: 'monitor', description: 'Normal monitoring', urgency: 'within_month', reasoning: 'Good payment pattern' }],
  },
  {
    clientId: 'C018',
    name: 'Bassem Adel',
    loanOfficerId: 'LO003',
    managerId: 'MGR001',
    outstanding: 16000,
    outstandingAtRisk: 11000,
    parPerLoan: 0.68,
    lateDays: 35,
    totalDelayedInstalments: 5,
    paidInstalments: 4,
    countReschedule: 2,
    paymentMonthly: 1600,
    isAtRisk: true,
    riskScore: 78,
    feedbackScore: 2,
    compositeUrgency: 82,
    urgencyClassification: 'Critical',
    lastVisitDate: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
    visitNotes: 'Personal emergency affecting payments. Needs restructuring discussion.',
    actionSuggestions: [{ action: 'visit', description: 'Urgent visit for restructuring', urgency: 'immediate', reasoning: 'High delinquency requiring intervention' }],
  },
];

async function seedDemoData() {
  console.log('🚀 Starting demo data seeding...\n');

  try {
    // Step 1: Create or get demo organization
    console.log('📁 Setting up demo organization...');
    try {
      await storage.ensureOrganization(DEMO_ORG_ID, DEMO_ORG_NAME);
      console.log(`   ✅ Organization initialized: ${DEMO_ORG_NAME} (${DEMO_ORG_ID})`);
    } catch (orgError: any) {
      console.log(`   ℹ️  Organization may already exist: ${orgError?.message || 'unknown error'}`);
    }

    // Step 2: Create demo users
    console.log('\n👥 Creating demo users...');
    for (const user of demoUsers) {
      const existingUser = await storage.getUserByLoanOfficerId(DEMO_ORG_ID, user.loanOfficerId);
      if (!existingUser) {
        await storage.createUser({
          organizationId: DEMO_ORG_ID,
          loanOfficerId: user.loanOfficerId,
          password: user.password,
          name: user.name,
          role: user.role,
          isAdmin: user.isAdmin,
          managerId: user.managerId,
        });
        console.log(`   ✅ Created user: ${user.name} (${user.loanOfficerId}) - ${user.role}`);
      } else {
        console.log(`   ℹ️  User already exists: ${user.name} (${user.loanOfficerId})`);
      }
    }

    // Step 3: Create demo clients
    console.log('\n📋 Creating demo clients...');
    for (const client of demoClients) {
      const existingClient = await storage.getClientByClientId(DEMO_ORG_ID, client.clientId);
      if (!existingClient) {
        await storage.createClient({
          organizationId: DEMO_ORG_ID,
          clientId: client.clientId,
          name: client.name,
          loanOfficerId: client.loanOfficerId,
          managerId: client.managerId,
          outstanding: client.outstanding,
          outstandingAtRisk: client.outstandingAtRisk,
          parPerLoan: client.parPerLoan,
          lateDays: client.lateDays,
          totalDelayedInstalments: client.totalDelayedInstalments,
          paidInstalments: client.paidInstalments,
          countReschedule: client.countReschedule,
          paymentMonthly: client.paymentMonthly,
          isAtRisk: client.isAtRisk,
          riskScore: client.riskScore,
          feedbackScore: client.feedbackScore,
          compositeUrgency: client.compositeUrgency,
          urgencyClassification: client.urgencyClassification,
          lastVisitDate: client.lastVisitDate,
          lastPhoneCallDate: client.lastPhoneCallDate,
          visitNotes: client.visitNotes,
          actionSuggestions: client.actionSuggestions,
        });
        console.log(`   ✅ Created client: ${client.name} (${client.clientId}) - Risk: ${client.riskScore}, Urgency: ${client.urgencyClassification}`);
      } else {
        console.log(`   ℹ️  Client already exists: ${client.name} (${client.clientId})`);
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Demo data seeding completed!\n');
    console.log('📋 DEMO CREDENTIALS:');
    console.log('='.repeat(60));
    console.log('Organization ID: demo');
    console.log('');
    console.log('👤 Branch Manager:');
    console.log('   Loan Officer ID: MGR001');
    console.log('   Password: demo123');
    console.log('');
    console.log('👤 Loan Officers:');
    console.log('   LO001 (Ahmed Hassan) - Password: demo123');
    console.log('   LO002 (Maria Garcia) - Password: demo123');
    console.log('   LO003 (David Chen) - Password: demo123');
    console.log('');
    console.log('👤 Administrator:');
    console.log('   Loan Officer ID: ADMIN');
    console.log('   Password: admin123');
    console.log('');
    console.log('📊 Client Portfolio Summary:');
    console.log('   - Critical Risk (80-100): 3 clients');
    console.log('   - High Risk (60-80): 4 clients');
    console.log('   - Medium Risk (30-60): 4 clients');
    console.log('   - Low Risk (0-30): 7 clients');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding demo data:', error);
    process.exit(1);
  }
}

seedDemoData();
