import { type User, type InsertUser, type Client, type InsertClient, type Visit, type InsertVisit, type PhoneCall, type InsertPhoneCall, type DataSync, type UpdateClientFeedback, type Settings, type InsertSettings, type UpdateSettings, type GamificationRule, type InsertGamificationRule, type GamificationSeason, type InsertGamificationSeason, type GamificationEvent, type InsertGamificationEvent, type GamificationBadge, type InsertGamificationBadge, type GamificationUserBadge, type InsertGamificationUserBadge, type PortfolioSnapshot, type InsertPortfolioSnapshot, type StreakHistory, type InsertStreakHistory } from "@shared/schema";
import { randomUUID, createHash } from "crypto";

// Compute a hash of the financial data for change detection during sync
// Only includes fields that come from Excel data (not feedback/visit data set by users)
export function computeClientDataHash(client: InsertClient): string {
  const dataToHash = {
    clientId: client.clientId,
    name: client.name,
    loanOfficerId: normalizeOfficerId(client.loanOfficerId),
    managerId: client.managerId ?? '',
    outstanding: client.outstanding ?? 0,
    outstandingAtRisk: client.outstandingAtRisk ?? 0,
    parPerLoan: client.parPerLoan ?? 0,
    lateDays: client.lateDays ?? 0,
    totalDelayedInstalments: client.totalDelayedInstalments ?? 0,
    paidInstalments: client.paidInstalments ?? 0,
    countReschedule: client.countReschedule ?? 0,
    paymentMonthly: client.paymentMonthly ?? 0,
    isAtRisk: client.isAtRisk ?? false,
    riskScore: Math.round((client.riskScore ?? 0) * 100) / 100,
    compositeUrgency: Math.round((client.compositeUrgency ?? 0) * 100) / 100,
    urgencyClassification: client.urgencyClassification ?? 'Low Urgency',
  };
  return createHash('md5').update(JSON.stringify(dataToHash)).digest('hex');
}
import { db } from "./db";
import { users, clients, visits, phoneCalls, dataSync, settings, gamificationRules, gamificationSeasons, gamificationEvents, gamificationBadges, gamificationUserBadges, portfolioSnapshots, organizations, streakHistory } from "@shared/schema";
import { eq, desc, sql, and, count } from "drizzle-orm";
import bcrypt from "bcrypt";

// Utility function to normalize loan officer IDs
export function normalizeOfficerId(loanOfficerId: string): string {
  return loanOfficerId.trim().toUpperCase();
}

// Password hashing utilities
const SALT_ROUNDS = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  return bcrypt.compare(password, hashedPassword);
}

export interface IStorage {
  // User methods (scoped by organization, except super admin with organizationId = null)
  getUser(id: string): Promise<User | undefined>;
  getUserByLoanOfficerId(organizationId: string | null, loanOfficerId: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserPassword(userId: string, password: string): Promise<void>;
  
  // Client methods (scoped by organization)
  getAllClients(organizationId: string): Promise<Client[]>;
  getClientsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<Client[]>;
  getClient(organizationId: string, id: string): Promise<Client | undefined>;
  getClientByClientId(organizationId: string, clientId: string): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(organizationId: string, id: string, updates: Partial<Client>): Promise<Client | undefined>;
  updateClientFeedback(organizationId: string, data: UpdateClientFeedback): Promise<Client | undefined>;
  bulkUpdateClients(organizationId: string, clients: Client[]): Promise<void>;
  bulkUpsertClients(organizationId: string, clients: InsertClient[]): Promise<number>;
  getUniqueLoanOfficers(organizationId: string): Promise<{ loanOfficerId: string; clientCount: number }[]>;
  
  // Visit methods (scoped by organization)
  getVisit(organizationId: string, id: string): Promise<Visit | undefined>;
  getVisitsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<Visit[]>;
  getUpcomingVisits(organizationId: string, loanOfficerId: string): Promise<Visit[]>;
  createVisit(visit: InsertVisit): Promise<Visit>;
  updateVisit(organizationId: string, id: string, updates: Partial<Visit>): Promise<Visit | undefined>;
  deleteVisit(organizationId: string, id: string): Promise<boolean>;
  
  // Phone call methods (scoped by organization)
  getPhoneCall(organizationId: string, id: string): Promise<PhoneCall | undefined>;
  getPhoneCallsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<PhoneCall[]>;
  getUpcomingPhoneCalls(organizationId: string, loanOfficerId: string): Promise<PhoneCall[]>;
  createPhoneCall(phoneCall: InsertPhoneCall): Promise<PhoneCall>;
  updatePhoneCall(organizationId: string, id: string, updates: Partial<PhoneCall>): Promise<PhoneCall | undefined>;
  deletePhoneCall(organizationId: string, id: string): Promise<boolean>;
  
  // Settings methods (now organization-scoped)
  getOrganizationSettings(organizationId: string): Promise<Settings | undefined>;
  createOrganizationSettings(settings: Omit<InsertSettings, 'loanOfficerId'>): Promise<Settings>;
  updateOrganizationSettings(organizationId: string, updates: UpdateSettings): Promise<Settings | undefined>;
  
  // Loan officer statistics methods for admin dashboard (scoped by organization)
  getLoanOfficerStatistics(organizationId: string): Promise<Array<{
    loanOfficerId: string;
    name?: string;
    totalClients: number;
    urgentClients: number;
    highRiskClients: number;
    completedVisits: number;
    pendingVisits: number;
    averageRiskScore: number;
    lastActivityDate?: Date;
  }>>;
  getLoanOfficerDetails(organizationId: string, loanOfficerId: string): Promise<{
    loanOfficerId: string;
    name?: string;
    totalClients: number;
    urgentClients: number;
    highRiskClients: number;
    completedVisits: number;
    pendingVisits: number;
    averageRiskScore: number;
    recentClients: Client[];
    upcomingVisits: Visit[];
  } | undefined>;
  
  // Progress tracking methods
  getProgressStatus(): Promise<{ isRunning: boolean; progress: number; total: number; currentStep: string; startTime?: Date } | null>;
  setProgressStatus(isRunning: boolean, progress: number, total: number, currentStep: string, startTime?: Date): Promise<void>;
  clearProgressStatus(): Promise<void>;
  
  // Data sync methods (scoped by organization)
  getLastDataSync(organizationId: string): Promise<DataSync | undefined>;
  createDataSync(sync: Omit<DataSync, 'id'>): Promise<DataSync>;
  updateDataSyncProgress(id: string, progressPercentage: number, currentStep: string): Promise<void>;
  updateDataSyncStatus(id: string, status: string, recordsProcessed: number, errorMessage?: string | null): Promise<void>;
  
  // Gamification Rule methods (scoped by organization)
  getAllGamificationRules(organizationId: string): Promise<GamificationRule[]>;
  getGamificationRule(organizationId: string, id: string): Promise<GamificationRule | undefined>;
  getGamificationRuleByEventType(organizationId: string, eventType: string): Promise<GamificationRule | undefined>;
  createGamificationRule(rule: InsertGamificationRule): Promise<GamificationRule>;
  updateGamificationRule(organizationId: string, id: string, updates: Partial<GamificationRule>): Promise<GamificationRule | undefined>;
  deleteGamificationRule(organizationId: string, id: string): Promise<boolean>;
  
  // Gamification Season methods (scoped by organization)
  getAllGamificationSeasons(organizationId: string): Promise<GamificationSeason[]>;
  getGamificationSeason(organizationId: string, id: string): Promise<GamificationSeason | undefined>;
  getActiveGamificationSeason(organizationId: string): Promise<GamificationSeason | undefined>;
  createGamificationSeason(season: InsertGamificationSeason): Promise<GamificationSeason>;
  updateGamificationSeason(organizationId: string, id: string, updates: Partial<GamificationSeason>): Promise<GamificationSeason | undefined>;
  deleteGamificationSeason(organizationId: string, id: string): Promise<boolean>;
  
  // Gamification Event methods (scoped by organization)
  getAllGamificationEvents(organizationId: string): Promise<GamificationEvent[]>;
  getGamificationEventsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<GamificationEvent[]>;
  getPendingGamificationEvents(organizationId: string): Promise<GamificationEvent[]>;
  createGamificationEvent(event: InsertGamificationEvent): Promise<GamificationEvent>;
  approveGamificationEvent(organizationId: string, id: string, reviewedBy: string): Promise<GamificationEvent | undefined>;
  rejectGamificationEvent(organizationId: string, id: string, reviewedBy: string): Promise<GamificationEvent | undefined>;
  
  // Gamification Badge methods (scoped by organization)
  getAllGamificationBadges(organizationId: string): Promise<GamificationBadge[]>;
  getGamificationBadge(organizationId: string, id: string): Promise<GamificationBadge | undefined>;
  createGamificationBadge(badge: InsertGamificationBadge): Promise<GamificationBadge>;
  updateGamificationBadge(organizationId: string, id: string, updates: Partial<GamificationBadge>): Promise<GamificationBadge | undefined>;
  deleteGamificationBadge(organizationId: string, id: string): Promise<boolean>;
  
  // User Badge methods (scoped by organization)
  getUserBadges(organizationId: string, loanOfficerId: string): Promise<GamificationUserBadge[]>;
  unlockBadge(organizationId: string, loanOfficerId: string, badgeId: string): Promise<GamificationUserBadge | null>;
  
  // Leaderboard and user stats methods (scoped by organization)
  getLeaderboard(organizationId: string, scope: 'company' | 'branch', branchId?: string, seasonId?: string): Promise<Array<{
    loanOfficerId: string;
    name: string;
    totalPoints: number;
    currentStreak: number;
    rank: number;
    badgeCount: number;
  }>>;
  updateUserPoints(organizationId: string, loanOfficerId: string, pointsToAdd: number): Promise<void>;
  updateUserStreak(organizationId: string, loanOfficerId: string): Promise<void>;
  getUserGamificationStats(organizationId: string, loanOfficerId: string): Promise<{
    totalPoints: number;
    currentStreak: number;
    currentRank: number | null;
    badgeCount: number;
    recentEvents: GamificationEvent[];
  } | undefined>;
  
  // Enhanced gamification methods for performance widget
  getMiniLeaderboard(organizationId: string, limit?: number): Promise<Array<{
    rank: number;
    loanOfficerId: string;
    name: string;
    totalPoints: number;
    currentStreak: number;
    badges: number;
    isCurrentUser?: boolean;
  }>>;
  getDetailedUserStats(organizationId: string, loanOfficerId: string): Promise<{
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
  } | undefined>;
  updateUserLoginStreak(organizationId: string, loanOfficerId: string): Promise<void>;
  
  // Portfolio Snapshot methods (scoped by organization)
  createPortfolioSnapshot(snapshot: import("@shared/schema").InsertPortfolioSnapshot): Promise<import("@shared/schema").PortfolioSnapshot>;
  getPortfolioSnapshots(organizationId: string, loanOfficerId: string, limit?: number): Promise<import("@shared/schema").PortfolioSnapshot[]>;
  getLatestSnapshot(organizationId: string, loanOfficerId: string): Promise<import("@shared/schema").PortfolioSnapshot | undefined>;
  
  // Organization methods (super admin only)
  getUserCountByOrganization(organizationId: string): Promise<number>;
  deleteOrganization(organizationId: string): Promise<boolean>;
  
  // Daily progress and streak tracking methods
  getDailyProgress(organizationId: string, loanOfficerId: string, date: Date): Promise<{
    visitsCompleted: number;
    visitsTarget: number;
    progressPercentage: number;
  }>;
  getStreakHistory(organizationId: string, loanOfficerId: string, days: number): Promise<Array<{
    date: Date;
    targetMet: boolean;
    visitsCompleted: number;
    visitsTarget: number;
  }>>;
  upsertStreakHistory(organizationId: string, loanOfficerId: string, date: Date): Promise<void>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;
  private clients: Map<string, Client>;
  private visits: Map<string, Visit>;
  private phoneCalls: Map<string, PhoneCall>;
  private dataSyncs: Map<string, DataSync>;
  private globalSettings: Settings | undefined = undefined;
  private progressStatus: { isRunning: boolean; progress: number; total: number; currentStep: string; startTime?: Date } | null = null;

  constructor() {
    this.users = new Map();
    this.clients = new Map();
    this.visits = new Map();
    this.phoneCalls = new Map();
    this.dataSyncs = new Map();
    
    // Note: No default credentials created for security
    // Users must be created through proper registration or admin setup

    // NOTE: MemStorage is for development/testing only
    // Production uses DatabaseStorage (see export at bottom of file)
    // Sample data initialization disabled for production readiness
    // Uncomment below for local development with sample data:
    // this.initializeSampleData();
  }

  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByLoanOfficerId(organizationId: string | null, loanOfficerId: string): Promise<User | undefined> {
    const normalizedId = normalizeOfficerId(loanOfficerId);
    return Array.from(this.users.values()).find(
      (user) => user.organizationId === organizationId && normalizeOfficerId(user.loanOfficerId) === normalizedId,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const hashedPassword = insertUser.password ? await hashPassword(insertUser.password) : null;
    const user: User = { 
      ...insertUser, 
      organizationId: insertUser.organizationId ?? null, // Ensure null instead of undefined
      role: insertUser.role ?? 'loan_officer', // Ensure role has a default value
      loanOfficerId: normalizeOfficerId(insertUser.loanOfficerId),
      password: hashedPassword,
      id, 
      isAdmin: insertUser.isAdmin || false,
      isSuperAdmin: insertUser.isSuperAdmin || false,
      requiresPasswordSetup: insertUser.requiresPasswordSetup ?? false,
      setupToken: insertUser.setupToken ?? null,
      totalPoints: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastActivityDate: null,
      lastLoginDate: null,
      currentRank: null,
      branchId: null,
      dailyVisitTarget: insertUser.dailyVisitTarget ?? 10,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    const user = this.users.get(userId);
    if (user) {
      user.password = await hashPassword(password);
      user.requiresPasswordSetup = false; // Clear the flag after password is set
      this.users.set(userId, user);
    }
  }

  // Utility function to calculate urgency classification from score
  private calculateUrgencyClassification(urgencyScore: number): string {
    if (urgencyScore >= 60) {
      return 'Extremely Urgent';
    } else if (urgencyScore >= 40) {
      return 'Urgent';
    } else if (urgencyScore >= 20) {
      return 'Moderately Urgent';
    } else {
      return 'Low Urgency';
    }
  }

  // Helper function to ensure fresh urgency classifications
  private ensureFreshClassifications(clients: Client[]): Client[] {
    return clients.map(client => ({
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    }));
  }

  async getAllClients(organizationId: string): Promise<Client[]> {
    const clients = Array.from(this.clients.values())
      .filter(client => client.organizationId === organizationId);
    return this.ensureFreshClassifications(clients);
  }

  async getClientsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<Client[]> {
    const normalizedId = normalizeOfficerId(loanOfficerId);
    
    const clients = Array.from(this.clients.values())
      .filter(client => 
        client.organizationId === organizationId && 
        normalizeOfficerId(client.loanOfficerId) === normalizedId
      )
      .sort((a, b) => b.compositeUrgency - a.compositeUrgency);
    
    return this.ensureFreshClassifications(clients);
  }

  async getClient(organizationId: string, id: string): Promise<Client | undefined> {
    const client = this.clients.get(id);
    if (!client || client.organizationId !== organizationId) return undefined;
    
    return {
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    };
  }

  async getClientByClientId(organizationId: string, clientId: string): Promise<Client | undefined> {
    const client = Array.from(this.clients.values()).find(
      (client) => client.organizationId === organizationId && client.clientId === clientId,
    );
    
    if (!client) return undefined;
    
    return {
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    };
  }

  // Fix all stale urgency classifications by recalculating from scores
  async fixAllStaleClassifications(): Promise<{ updated: number, total: number }> {
    console.log('[CLASSIFICATION FIX] Starting batch update to fix stale urgency classifications...');
    
    let updated = 0;
    const total = this.clients.size;
    
    for (const [id, client] of Array.from(this.clients.entries())) {
      const correctClassification = this.calculateUrgencyClassification(client.compositeUrgency);
      
      if (client.urgencyClassification !== correctClassification) {
        updated++;
        console.log(`[CLASSIFICATION FIX] ${client.name}: ${client.urgencyClassification} → ${correctClassification} (score: ${client.compositeUrgency})`);
        
        this.clients.set(id, {
          ...client,
          urgencyClassification: correctClassification
        });
      }
    }
    
    console.log(`[CLASSIFICATION FIX] Completed! Updated ${updated} out of ${total} clients`);
    return { updated, total };
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const id = randomUUID();
    const now = new Date();
    const client: Client = { 
      outstanding: 0,
      outstandingAtRisk: 0,
      parPerLoan: 0,
      lateDays: 0,
      totalDelayedInstalments: 0,
      paidInstalments: 0,
      countReschedule: 0,
      paymentMonthly: 0,
      isAtRisk: false,
      riskScore: 0,
      lastVisitDate: null,
      lastPhoneCallDate: null,
      feedbackScore: 3,
      compositeUrgency: 0,
      urgencyClassification: "Low Urgency",
      urgencyBreakdown: null,
      actionSuggestions: null as any,
      paymentWillingness: null,
      financialSituation: null,
      communicationQuality: null,
      complianceCooperation: null,
      futureOutlook: null,
      visitNotes: null,
      snoozedUntil: null,
      snoozedBy: null,
      dataHash: null,
      ...insertClient,
      organizationId: insertClient.organizationId ?? null,
      managerId: insertClient.managerId ?? null,
      loanOfficerId: normalizeOfficerId(insertClient.loanOfficerId),
      id, 
      createdAt: now, 
      updatedAt: now 
    };
    this.clients.set(id, client);
    return client;
  }

  async updateClient(organizationId: string, id: string, updates: Partial<Client>): Promise<Client | undefined> {
    const client = this.clients.get(id);
    if (!client || client.organizationId !== organizationId) return undefined;
    
    const updatedClient = { 
      ...client, 
      ...updates, 
      updatedAt: new Date() 
    };
    this.clients.set(id, updatedClient);
    return updatedClient;
  }

  async updateClientFeedback(organizationId: string, data: UpdateClientFeedback): Promise<Client | undefined> {
    const client = Array.from(this.clients.values()).find(
      (c) => c.organizationId === organizationId && c.clientId === data.clientId,
    );
    if (!client) return undefined;

    // Prepare update object
    const updates: Partial<Client> = {
      feedbackScore: data.feedbackScore,
      // Add detailed feedback components if provided
      paymentWillingness: data.paymentWillingness,
      financialSituation: data.financialSituation,
      communicationQuality: data.communicationQuality,
      complianceCooperation: data.complianceCooperation,
      futureOutlook: data.futureOutlook,
      visitNotes: data.visitNotes,
    };

    // Update visit date if provided
    if (data.lastVisitDate) {
      updates.lastVisitDate = new Date(data.lastVisitDate);
    }

    // Update phone call date if provided
    if (data.lastPhoneCallDate) {
      updates.lastPhoneCallDate = new Date(data.lastPhoneCallDate);
    }

    // Calculate days since most recent interaction for urgency
    const lastVisitDate = updates.lastVisitDate || client.lastVisitDate;
    const lastPhoneCallDate = updates.lastPhoneCallDate || client.lastPhoneCallDate;
    
    let daysSinceLastInteraction = 30; // Default for new clients
    const dates = [];
    if (lastVisitDate) dates.push(lastVisitDate);
    if (lastPhoneCallDate) dates.push(lastPhoneCallDate);
    
    if (dates.length > 0) {
      const mostRecentDate = new Date(Math.max(...dates.map(d => d.getTime())));
      daysSinceLastInteraction = Math.floor((Date.now() - mostRecentDate.getTime()) / (1000 * 60 * 60 * 24));
    }
    
    // Recalculate composite urgency (will be recalculated properly by ML service later)
    const compositeUrgency = (client.riskScore * 0.5) + (daysSinceLastInteraction * 0.4) + (data.feedbackScore * 0.1);
    updates.compositeUrgency = compositeUrgency;
    
    return this.updateClient(organizationId, client.id, updates);
  }

  async bulkUpdateClients(organizationId: string, clients: Client[]): Promise<void> {
    clients.forEach(client => {
      // Verify organizationId matches before updating
      if (client.organizationId === organizationId) {
        this.clients.set(client.id, client);
      }
    });
  }

  async bulkUpsertClients(organizationId: string, clientsData: InsertClient[]): Promise<number> {
    let processedCount = 0;
    
    for (const clientData of clientsData) {
      try {
        // Verify organizationId matches
        if (clientData.organizationId !== organizationId) {
          console.error(`Organization ID mismatch for client ${clientData.clientId}`);
          continue;
        }
        
        // Check if client exists by clientId
        const existingClient = await this.getClientByClientId(organizationId, clientData.clientId);
        
        if (existingClient) {
          // Update existing client
          await this.updateClient(organizationId, existingClient.id, clientData as any);
        } else {
          // Create new client
          await this.createClient(clientData);
        }
        processedCount++;
      } catch (error) {
        console.error(`Error upserting client ${clientData.clientId}:`, error);
      }
    }
    
    return processedCount;
  }

  async getUniqueLoanOfficers(organizationId: string): Promise<{ loanOfficerId: string; clientCount: number }[]> {
    const officerCounts = new Map<string, number>();
    
    // Count clients for each loan officer in this organization
    for (const client of Array.from(this.clients.values())) {
      if (client.organizationId === organizationId) {
        const count = officerCounts.get(client.loanOfficerId) || 0;
        officerCounts.set(client.loanOfficerId, count + 1);
      }
    }
    
    // Convert to array format
    return Array.from(officerCounts.entries()).map(([loanOfficerId, clientCount]) => ({
      loanOfficerId,
      clientCount
    }));
  }

  async getVisit(organizationId: string, id: string): Promise<Visit | undefined> {
    const visit = this.visits.get(id);
    if (!visit || visit.organizationId !== organizationId) return undefined;
    return visit;
  }

  async getVisitsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<Visit[]> {
    return Array.from(this.visits.values())
      .filter(visit => visit.organizationId === organizationId && visit.loanOfficerId === loanOfficerId)
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }

  async getUpcomingVisits(organizationId: string, loanOfficerId: string): Promise<Visit[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day
    
    return Array.from(this.visits.values())
      .filter(visit => {
        const visitDate = new Date(visit.scheduledDate);
        visitDate.setHours(0, 0, 0, 0); // Reset to start of day
        
        return visit.organizationId === organizationId &&
               visit.loanOfficerId === loanOfficerId && 
               visitDate >= today &&
               visit.status === 'scheduled';
      })
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }

  async createVisit(insertVisit: InsertVisit): Promise<Visit> {
    const id = randomUUID();
    const visit: Visit = { 
      status: "scheduled",
      notes: null,
      completedAt: null, // Not completed yet
      ...insertVisit,
      organizationId: insertVisit.organizationId ?? null, // Ensure null instead of undefined
      id, 
      createdAt: new Date() 
    };
    this.visits.set(id, visit);
    return visit;
  }

  async updateVisit(organizationId: string, id: string, updates: Partial<Visit>): Promise<Visit | undefined> {
    const visit = this.visits.get(id);
    if (!visit || visit.organizationId !== organizationId) return undefined;
    
    const updatedVisit = { ...visit, ...updates };
    this.visits.set(id, updatedVisit);
    return updatedVisit;
  }

  async deleteVisit(organizationId: string, id: string): Promise<boolean> {
    const visit = this.visits.get(id);
    if (!visit || visit.organizationId !== organizationId) return false;
    return this.visits.delete(id);
  }

  // Phone call methods
  async getPhoneCall(organizationId: string, id: string): Promise<PhoneCall | undefined> {
    const phoneCall = this.phoneCalls.get(id);
    if (!phoneCall || phoneCall.organizationId !== organizationId) return undefined;
    return phoneCall;
  }

  async getPhoneCallsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<PhoneCall[]> {
    return Array.from(this.phoneCalls.values())
      .filter(phoneCall => phoneCall.organizationId === organizationId && phoneCall.loanOfficerId === loanOfficerId)
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }

  async getUpcomingPhoneCalls(organizationId: string, loanOfficerId: string): Promise<PhoneCall[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset to start of day
    
    return Array.from(this.phoneCalls.values())
      .filter(phoneCall => {
        const callDate = new Date(phoneCall.scheduledDate);
        callDate.setHours(0, 0, 0, 0); // Reset to start of day
        
        return phoneCall.organizationId === organizationId &&
               phoneCall.loanOfficerId === loanOfficerId && 
               callDate >= today &&
               phoneCall.status === 'scheduled';
      })
      .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime());
  }

  async createPhoneCall(insertPhoneCall: InsertPhoneCall): Promise<PhoneCall> {
    const id = randomUUID();
    const phoneCall: PhoneCall = { 
      status: "scheduled",
      callType: "follow_up",
      duration: null,
      notes: null,
      ...insertPhoneCall,
      organizationId: insertPhoneCall.organizationId ?? null, // Ensure null instead of undefined
      id, 
      createdAt: new Date() 
    };
    this.phoneCalls.set(id, phoneCall);
    return phoneCall;
  }

  async updatePhoneCall(organizationId: string, id: string, updates: Partial<PhoneCall>): Promise<PhoneCall | undefined> {
    const phoneCall = this.phoneCalls.get(id);
    if (!phoneCall || phoneCall.organizationId !== organizationId) return undefined;
    
    const updatedPhoneCall = { ...phoneCall, ...updates };
    this.phoneCalls.set(id, updatedPhoneCall);
    return updatedPhoneCall;
  }

  async deletePhoneCall(organizationId: string, id: string): Promise<boolean> {
    const phoneCall = this.phoneCalls.get(id);
    if (!phoneCall || phoneCall.organizationId !== organizationId) return false;
    return this.phoneCalls.delete(id);
  }

  async getLastDataSync(organizationId: string): Promise<DataSync | undefined> {
    const syncs = Array.from(this.dataSyncs.values())
      .filter(sync => sync.organizationId === organizationId);
    return syncs.sort((a, b) => b.lastSyncTime.getTime() - a.lastSyncTime.getTime())[0];
  }

  async createDataSync(sync: Omit<DataSync, 'id'>): Promise<DataSync> {
    const id = randomUUID();
    const dataSync: DataSync = { 
      ...sync, 
      id
    };
    this.dataSyncs.set(id, dataSync);
    return dataSync;
  }

  async updateDataSyncProgress(id: string, progressPercentage: number, currentStep: string): Promise<void> {
    const sync = this.dataSyncs.get(id);
    if (sync) {
      const updatedSync = { 
        ...sync, 
        progressPercentage, 
        currentStep 
      };
      this.dataSyncs.set(id, updatedSync);
    }
  }

  async updateDataSyncStatus(id: string, status: string, recordsProcessed: number, errorMessage?: string | null): Promise<void> {
    const sync = this.dataSyncs.get(id);
    if (sync) {
      const updatedSync = { 
        ...sync, 
        status,
        recordsProcessed,
        errorMessage: errorMessage || null,
        lastSyncTime: new Date()
      };
      this.dataSyncs.set(id, updatedSync);
    }
  }

  private async initializeSampleData() {
    const sampleClients = [
      {
        clientId: "CLT-001",
        name: "Maria Santos",
        loanOfficerId: "LO-12345",
        outstanding: 2500.00,
        outstandingAtRisk: 500.00,
        parPerLoan: 0.15,
        lateDays: 15,
        totalDelayedInstalments: 2,
        paidInstalments: 8,
        countReschedule: 1,
        paymentMonthly: 250.00,
        isAtRisk: true,
        riskScore: 75.5,
        lastVisitDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        feedbackScore: 2,
        compositeUrgency: 0,
        urgencyClassification: "Extremely Urgent"
      },
      {
        clientId: "CLT-002", 
        name: "Carlos Rodriguez",
        loanOfficerId: "LO-12345",
        outstanding: 1800.00,
        outstandingAtRisk: 0.00,
        parPerLoan: 0.05,
        lateDays: 3,
        totalDelayedInstalments: 1,
        paidInstalments: 15,
        countReschedule: 0,
        paymentMonthly: 180.00,
        isAtRisk: false,
        riskScore: 45.2,
        lastVisitDate: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), // 12 days ago
        feedbackScore: 4,
        compositeUrgency: 0,
        urgencyClassification: "Urgent"
      },
      {
        clientId: "CLT-003",
        name: "Ana Gonzalez",
        loanOfficerId: "LO-12345", 
        outstanding: 3200.00,
        outstandingAtRisk: 200.00,
        parPerLoan: 0.08,
        lateDays: 8,
        totalDelayedInstalments: 1,
        paidInstalments: 12,
        countReschedule: 0,
        paymentMonthly: 320.00,
        isAtRisk: true,
        riskScore: 62.8,
        lastVisitDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000), // 20 days ago
        feedbackScore: 3,
        compositeUrgency: 0,
        urgencyClassification: "Moderately Urgent"
      },
      {
        clientId: "CLT-004",
        name: "Luis Hernandez",
        loanOfficerId: "LO-12345",
        outstanding: 1200.00,
        outstandingAtRisk: 0.00,
        parPerLoan: 0.00,
        lateDays: 0,
        totalDelayedInstalments: 0,
        paidInstalments: 18,
        countReschedule: 0,
        paymentMonthly: 120.00,
        isAtRisk: false,
        riskScore: 22.1,
        lastVisitDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // 7 days ago
        feedbackScore: 5,
        compositeUrgency: 0,
        urgencyClassification: "Low Urgency"
      },
      {
        clientId: "CLT-005",
        name: "Elena Martinez",
        loanOfficerId: "LO-12345",
        outstanding: 4100.00,
        outstandingAtRisk: 800.00,
        parPerLoan: 0.22,
        lateDays: 25,
        totalDelayedInstalments: 3,
        paidInstalments: 6,
        countReschedule: 2,
        paymentMonthly: 410.00,
        isAtRisk: true,
        riskScore: 88.9,
        lastVisitDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
        feedbackScore: 1,
        compositeUrgency: 0,
        urgencyClassification: "Extremely Urgent"
      },
      // Sample clients for loan officer 2145
      {
        clientId: "CLT-101",
        name: "Roberto Silva",
        loanOfficerId: "2145",
        outstanding: 2800.00,
        outstandingAtRisk: 400.00,
        parPerLoan: 0.12,
        lateDays: 18,
        totalDelayedInstalments: 2,
        paidInstalments: 10,
        countReschedule: 1,
        paymentMonthly: 280.00,
        isAtRisk: true,
        riskScore: 68.3,
        lastVisitDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000), // 4 days ago
        feedbackScore: 2,
        compositeUrgency: 0,
        urgencyClassification: "Urgent"
      },
      {
        clientId: "CLT-102", 
        name: "Carmen Delgado",
        loanOfficerId: "2145",
        outstanding: 1500.00,
        outstandingAtRisk: 0.00,
        parPerLoan: 0.02,
        lateDays: 1,
        totalDelayedInstalments: 0,
        paidInstalments: 14,
        countReschedule: 0,
        paymentMonthly: 150.00,
        isAtRisk: false,
        riskScore: 28.7,
        lastVisitDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000), // 9 days ago
        feedbackScore: 4,
        compositeUrgency: 0,
        urgencyClassification: "Low Urgency"
      },
      {
        clientId: "CLT-103",
        name: "Diego Morales",
        loanOfficerId: "2145", 
        outstanding: 3600.00,
        outstandingAtRisk: 720.00,
        parPerLoan: 0.18,
        lateDays: 22,
        totalDelayedInstalments: 3,
        paidInstalments: 7,
        countReschedule: 2,
        paymentMonthly: 360.00,
        isAtRisk: true,
        riskScore: 82.1,
        lastVisitDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
        feedbackScore: 1,
        compositeUrgency: 0,
        urgencyClassification: "Extremely Urgent"
      }
    ];

    // Calculate composite urgency for each client
    for (const clientData of sampleClients) {
      const daysSinceLastVisit = clientData.lastVisitDate ? 
        Math.floor((Date.now() - clientData.lastVisitDate.getTime()) / (1000 * 60 * 60 * 24)) : 30;
      
      clientData.compositeUrgency = (clientData.riskScore * 0.5) + (daysSinceLastVisit * 0.4) + (clientData.feedbackScore * 0.1);
      
      await this.createClient(clientData);
    }

    // Recalculate urgency classifications based on composite urgency for both loan officers
    const loanOfficers = ["LO-12345", "2145"];
    const defaultOrgId = "default-org";
    
    for (const loanOfficerId of loanOfficers) {
      const clients = await this.getClientsByLoanOfficer(defaultOrgId, loanOfficerId);
      clients.sort((a, b) => b.compositeUrgency - a.compositeUrgency);
      
      for (let i = 0; i < clients.length; i++) {
        const percentile = (i / clients.length) * 100;
        let classification = 'Low Urgency';
        
        if (percentile < 10) {
          classification = 'Extremely Urgent';
        } else if (percentile < 30) {
          classification = 'Urgent';
        } else if (percentile < 60) {
          classification = 'Moderately Urgent';
        }
        
        await this.updateClient(defaultOrgId, clients[i].id, {
          urgencyClassification: classification,
        });
      }
    }
  }

  // Progress tracking methods for MemStorage
  async getProgressStatus(): Promise<{ isRunning: boolean; progress: number; total: number; currentStep: string; startTime?: Date } | null> {
    return this.progressStatus;
  }

  async setProgressStatus(isRunning: boolean, progress: number, total: number, currentStep: string, startTime?: Date): Promise<void> {
    this.progressStatus = { isRunning, progress, total, currentStep, startTime };
  }

  async clearProgressStatus(): Promise<void> {
    this.progressStatus = null;
  }

  // Organization settings methods for MemStorage
  async getOrganizationSettings(organizationId: string): Promise<Settings | undefined> {
    // For MemStorage, we only store one global settings object
    // In production DbStorage, this would filter by organizationId
    if (this.globalSettings && this.globalSettings.organizationId === organizationId) {
      return this.globalSettings;
    }
    return undefined;
  }

  async createOrganizationSettings(settings: Omit<InsertSettings, 'loanOfficerId'>): Promise<Settings> {
    const id = randomUUID();
    const globalSettings: Settings = {
      riskLateDaysWeight: 0.2,
      riskOutstandingAtRiskWeight: 0.15,
      riskParPerLoanWeight: 0.15,
      riskReschedulesWeight: 0.1,
      riskPaymentConsistencyWeight: 0.1,
      riskDelayedInstalmentsWeight: 0.1,
      urgencyRiskScoreWeight: 0.4,
      urgencyDaysSinceVisitWeight: 0.3,
      urgencyFeedbackScoreWeight: 0.3,
      feedbackPaymentWillingnessWeight: 0.25,
      feedbackFinancialSituationWeight: 0.2,
      feedbackCommunicationQualityWeight: 0.2,
      feedbackComplianceCooperationWeight: 0.2,
      feedbackFutureOutlookWeight: 0.15,
      ...settings,
      organizationId: settings.organizationId ?? null, // Ensure null instead of undefined
      id,
      loanOfficerId: 'GLOBAL',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.globalSettings = globalSettings;
    return globalSettings;
  }

  async updateOrganizationSettings(organizationId: string, updates: UpdateSettings): Promise<Settings | undefined> {
    if (!this.globalSettings || this.globalSettings.organizationId !== organizationId) return undefined;
    
    const updatedSettings = {
      ...this.globalSettings,
      ...updates,
      updatedAt: new Date()
    };
    this.globalSettings = updatedSettings;
    return updatedSettings;
  }

  // Loan officer statistics methods for MemStorage
  async getLoanOfficerStatistics(organizationId: string): Promise<Array<{
    loanOfficerId: string;
    name?: string;
    totalClients: number;
    urgentClients: number;
    highRiskClients: number;
    completedVisits: number;
    pendingVisits: number;
    averageRiskScore: number;
    lastActivityDate?: Date;
  }>> {
    const officers = new Map<string, {
      loanOfficerId: string;
      name?: string;
      totalClients: number;
      urgentClients: number;
      highRiskClients: number;
      completedVisits: number;
      pendingVisits: number;
      averageRiskScore: number;
      lastActivityDate?: Date;
    }>();

    // Process clients to gather statistics per loan officer in this organization
    for (const client of Array.from(this.clients.values())) {
      if (client.organizationId !== organizationId) continue; // Skip clients from other orgs
      
      if (!officers.has(client.loanOfficerId)) {
        officers.set(client.loanOfficerId, {
          loanOfficerId: client.loanOfficerId,
          totalClients: 0,
          urgentClients: 0,
          highRiskClients: 0,
          completedVisits: 0,
          pendingVisits: 0,
          averageRiskScore: 0,
        });
      }

      const officerStats = officers.get(client.loanOfficerId)!;
      officerStats.totalClients++;
      
      // Count urgent clients (high urgency classification)
      if (client.urgencyClassification === 'Extremely Urgent' || client.urgencyClassification === 'Urgent') {
        officerStats.urgentClients++;
      }
      
      // Count high risk clients (risk score > 70)
      if (client.riskScore > 70) {
        officerStats.highRiskClients++;
      }

      // Add to average risk score calculation
      officerStats.averageRiskScore += client.riskScore;
    }

    // Calculate visit statistics for this organization
    for (const visit of Array.from(this.visits.values())) {
      if (visit.organizationId !== organizationId) continue; // Skip visits from other orgs
      
      const officerStats = officers.get(visit.loanOfficerId);
      if (officerStats) {
        if (visit.status === 'completed') {
          officerStats.completedVisits++;
        } else if (visit.status === 'scheduled') {
          officerStats.pendingVisits++;
        }
      }
    }

    // Calculate averages and get user names
    const result: Array<{
      loanOfficerId: string;
      name?: string;
      totalClients: number;
      urgentClients: number;
      highRiskClients: number;
      completedVisits: number;
      pendingVisits: number;
      averageRiskScore: number;
      lastActivityDate?: Date;
    }> = [];

    for (const [loanOfficerId, stats] of Array.from(officers.entries())) {
      const user = Array.from(this.users.values()).find(u => u.loanOfficerId === loanOfficerId);
      
      result.push({
        ...stats,
        name: user?.name,
        averageRiskScore: stats.totalClients > 0 ? stats.averageRiskScore / stats.totalClients : 0,
      });
    }

    return result.sort((a, b) => b.urgentClients - a.urgentClients);
  }

  async getLoanOfficerDetails(organizationId: string, loanOfficerId: string): Promise<{
    loanOfficerId: string;
    name?: string;
    totalClients: number;
    urgentClients: number;
    highRiskClients: number;
    completedVisits: number;
    pendingVisits: number;
    averageRiskScore: number;
    recentClients: Client[];
    upcomingVisits: Visit[];
  } | undefined> {
    const normalizedId = normalizeOfficerId(loanOfficerId);
    const user = Array.from(this.users.values()).find(u => 
      u.organizationId === organizationId && normalizeOfficerId(u.loanOfficerId) === normalizedId
    );
    
    const officerClients = Array.from(this.clients.values()).filter(c => 
      c.organizationId === organizationId && normalizeOfficerId(c.loanOfficerId) === normalizedId
    );
    
    if (officerClients.length === 0) {
      return undefined;
    }

    const officerVisits = Array.from(this.visits.values()).filter(v => 
      v.organizationId === organizationId && normalizeOfficerId(v.loanOfficerId) === normalizedId
    );

    const urgentClients = officerClients.filter(c => 
      c.urgencyClassification === 'Extremely Urgent' || c.urgencyClassification === 'Urgent'
    ).length;

    const highRiskClients = officerClients.filter(c => c.riskScore > 70).length;
    
    const completedVisits = officerVisits.filter(v => v.status === 'completed').length;
    const pendingVisits = officerVisits.filter(v => v.status === 'scheduled').length;
    
    const averageRiskScore = officerClients.length > 0 
      ? officerClients.reduce((sum, c) => sum + c.riskScore, 0) / officerClients.length 
      : 0;

    const recentClients = officerClients
      .sort((a, b) => b.compositeUrgency - a.compositeUrgency)
      .slice(0, 10);

    const upcomingVisits = officerVisits
      .filter(v => v.status === 'scheduled')
      .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime())
      .slice(0, 10);

    return {
      loanOfficerId: normalizedId,
      name: user?.name,
      totalClients: officerClients.length,
      urgentClients,
      highRiskClients,
      completedVisits,
      pendingVisits,
      averageRiskScore,
      recentClients,
      upcomingVisits,
    };
  }

  // Gamification Rule methods - stubs for MemStorage
  async getAllGamificationRules(organizationId: string): Promise<GamificationRule[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getGamificationRule(organizationId: string, id: string): Promise<GamificationRule | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getGamificationRuleByEventType(organizationId: string, eventType: string): Promise<GamificationRule | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async createGamificationRule(rule: InsertGamificationRule): Promise<GamificationRule> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async updateGamificationRule(organizationId: string, id: string, updates: Partial<GamificationRule>): Promise<GamificationRule | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async deleteGamificationRule(organizationId: string, id: string): Promise<boolean> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  // Gamification Season methods - stubs for MemStorage
  async getAllGamificationSeasons(organizationId: string): Promise<GamificationSeason[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getGamificationSeason(organizationId: string, id: string): Promise<GamificationSeason | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getActiveGamificationSeason(organizationId: string): Promise<GamificationSeason | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async createGamificationSeason(season: InsertGamificationSeason): Promise<GamificationSeason> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async updateGamificationSeason(organizationId: string, id: string, updates: Partial<GamificationSeason>): Promise<GamificationSeason | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async deleteGamificationSeason(organizationId: string, id: string): Promise<boolean> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  // Gamification Event methods - stubs for MemStorage
  async getAllGamificationEvents(organizationId: string): Promise<GamificationEvent[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getGamificationEventsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<GamificationEvent[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getPendingGamificationEvents(organizationId: string): Promise<GamificationEvent[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async createGamificationEvent(event: InsertGamificationEvent): Promise<GamificationEvent> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async approveGamificationEvent(organizationId: string, id: string, reviewedBy: string): Promise<GamificationEvent | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async rejectGamificationEvent(organizationId: string, id: string, reviewedBy: string): Promise<GamificationEvent | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  // Gamification Badge methods - stubs for MemStorage
  async getAllGamificationBadges(organizationId: string): Promise<GamificationBadge[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getGamificationBadge(organizationId: string, id: string): Promise<GamificationBadge | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async createGamificationBadge(badge: InsertGamificationBadge): Promise<GamificationBadge> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async updateGamificationBadge(organizationId: string, id: string, updates: Partial<GamificationBadge>): Promise<GamificationBadge | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async deleteGamificationBadge(organizationId: string, id: string): Promise<boolean> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  // User Badge methods - stubs for MemStorage
  async getUserBadges(organizationId: string, loanOfficerId: string): Promise<GamificationUserBadge[]> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async unlockBadge(organizationId: string, loanOfficerId: string, badgeId: string): Promise<GamificationUserBadge | null> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  // Leaderboard and user stats methods - stubs for MemStorage
  async getLeaderboard(organizationId: string, scope: 'company' | 'branch', branchId?: string, seasonId?: string): Promise<Array<{
    loanOfficerId: string;
    name: string;
    totalPoints: number;
    currentStreak: number;
    rank: number;
    badgeCount: number;
  }>> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async updateUserPoints(organizationId: string, loanOfficerId: string, pointsToAdd: number): Promise<void> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async updateUserStreak(organizationId: string, loanOfficerId: string): Promise<void> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getUserGamificationStats(organizationId: string, loanOfficerId: string): Promise<{
    totalPoints: number;
    currentStreak: number;
    currentRank: number | null;
    badgeCount: number;
    recentEvents: GamificationEvent[];
  } | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getMiniLeaderboard(organizationId: string, limit?: number): Promise<Array<{
    rank: number;
    loanOfficerId: string;
    name: string;
    totalPoints: number;
    currentStreak: number;
    badges: number;
    isCurrentUser?: boolean;
  }>> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async getDetailedUserStats(organizationId: string, loanOfficerId: string): Promise<{
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
  } | undefined> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  async updateUserLoginStreak(organizationId: string, loanOfficerId: string): Promise<void> {
    throw new Error("Gamification not supported in MemStorage - use DatabaseStorage");
  }

  // Portfolio Snapshot methods - stubs for MemStorage
  async createPortfolioSnapshot(snapshot: InsertPortfolioSnapshot): Promise<PortfolioSnapshot> {
    throw new Error("Portfolio snapshots not supported in MemStorage - use DatabaseStorage");
  }

  async getPortfolioSnapshots(organizationId: string, loanOfficerId: string, limit?: number): Promise<PortfolioSnapshot[]> {
    throw new Error("Portfolio snapshots not supported in MemStorage - use DatabaseStorage");
  }

  async getLatestSnapshot(organizationId: string, loanOfficerId: string): Promise<PortfolioSnapshot | undefined> {
    throw new Error("Portfolio snapshots not supported in MemStorage - use DatabaseStorage");
  }

  async getUserCountByOrganization(organizationId: string): Promise<number> {
    return Array.from(this.users.values()).filter(u => u.organizationId === organizationId).length;
  }

  async deleteOrganization(organizationId: string): Promise<boolean> {
    throw new Error("Organization deletion not supported in MemStorage - use DatabaseStorage");
  }

  async getDailyProgress(organizationId: string, loanOfficerId: string, date: Date): Promise<{
    visitsCompleted: number;
    visitsTarget: number;
    progressPercentage: number;
  }> {
    throw new Error("Daily progress tracking not supported in MemStorage - use DatabaseStorage");
  }

  async getStreakHistory(organizationId: string, loanOfficerId: string, days: number): Promise<Array<{
    date: Date;
    targetMet: boolean;
    visitsCompleted: number;
    visitsTarget: number;
  }>> {
    throw new Error("Streak history not supported in MemStorage - use DatabaseStorage");
  }

  async upsertStreakHistory(organizationId: string, loanOfficerId: string, date: Date): Promise<void> {
    throw new Error("Streak history not supported in MemStorage - use DatabaseStorage");
  }
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Note: Removed auto-initialization for multi-tenant system
    // Users are now created per-organization during Excel upload or via admin provisioning
    console.log("[INIT] DatabaseStorage initialized for multi-tenant mode");
  }

  // OBSOLETE: This function is no longer used in multi-tenant system
  // Users are now created per-organization during Excel upload or via admin provisioning
  // Kept for reference but not called anywhere
  // private async initializeUsers() { ... }

  // User methods
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByLoanOfficerId(organizationId: string | null, loanOfficerId: string): Promise<User | undefined> {
    const normalizedId = normalizeOfficerId(loanOfficerId);
    const { isNull } = await import('drizzle-orm');
    
    const whereClause = organizationId === null 
      ? and(isNull(users.organizationId), eq(users.loanOfficerId, normalizedId))
      : and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, normalizedId));
    
    const [user] = await db.select().from(users).where(whereClause);
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const hashedPassword = insertUser.password ? await hashPassword(insertUser.password) : null;
    const normalizedUser = {
      ...insertUser,
      loanOfficerId: normalizeOfficerId(insertUser.loanOfficerId),
      password: hashedPassword
    };
    const [user] = await db.insert(users).values(normalizedUser).returning();
    return user;
  }

  async updateUserPassword(userId: string, password: string): Promise<void> {
    const hashedPassword = await hashPassword(password);
    await db.update(users).set({ 
      password: hashedPassword,
      requiresPasswordSetup: false // Clear the flag after password is set
    }).where(eq(users.id, userId));
  }

  // Client methods
  async getAllClients(organizationId: string): Promise<Client[]> {
    const clientsData = await db.select().from(clients)
      .where(eq(clients.organizationId, organizationId))
      .orderBy(desc(clients.compositeUrgency));
    
    // Apply fresh urgency classifications based on current scores
    return clientsData.map(client => ({
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    }));
  }

  async getClientsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<Client[]> {
    const normalizedId = normalizeOfficerId(loanOfficerId);
    
    const clientsData = await db.select().from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.loanOfficerId, normalizedId)))
      .orderBy(desc(clients.compositeUrgency));
    
    // Apply fresh urgency classifications based on current scores
    return clientsData.map(client => ({
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    }));
  }

  async getClient(organizationId: string, id: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(and(eq(clients.organizationId, organizationId), eq(clients.id, id)));
    if (!client) return undefined;
    
    return {
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    };
  }

  async getClientByClientId(organizationId: string, clientId: string): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(and(eq(clients.organizationId, organizationId), eq(clients.clientId, clientId)));
    if (!client) return undefined;
    
    return {
      ...client,
      urgencyClassification: this.calculateUrgencyClassification(client.compositeUrgency)
    };
  }

  async createClient(insertClient: InsertClient): Promise<Client> {
    const normalizedClient = {
      ...insertClient,
      loanOfficerId: normalizeOfficerId(insertClient.loanOfficerId)
    };
    const [client] = await db.insert(clients).values([normalizedClient as any]).returning();
    return client;
  }

  async updateClient(organizationId: string, id: string, updates: Partial<Client>): Promise<Client | undefined> {
    const [client] = await db.update(clients).set(updates).where(and(eq(clients.organizationId, organizationId), eq(clients.id, id))).returning();
    return client || undefined;
  }

  async updateClientFeedback(organizationId: string, data: UpdateClientFeedback): Promise<Client | undefined> {
    const updateData: any = {
      feedbackScore: data.feedbackScore,
    };

    // Only set date fields if they are provided
    if (data.lastVisitDate) {
      updateData.lastVisitDate = new Date(data.lastVisitDate);
    }
    if (data.lastPhoneCallDate) {
      updateData.lastPhoneCallDate = new Date(data.lastPhoneCallDate);
    }

    // Include detailed feedback components if provided
    if (data.paymentWillingness !== undefined) {
      updateData.paymentWillingness = data.paymentWillingness;
    }
    if (data.financialSituation !== undefined) {
      updateData.financialSituation = data.financialSituation;
    }
    if (data.communicationQuality !== undefined) {
      updateData.communicationQuality = data.communicationQuality;
    }
    if (data.complianceCooperation !== undefined) {
      updateData.complianceCooperation = data.complianceCooperation;
    }
    if (data.futureOutlook !== undefined) {
      updateData.futureOutlook = data.futureOutlook;
    }
    if (data.visitNotes !== undefined) {
      updateData.visitNotes = data.visitNotes;
    }

    const [client] = await db.update(clients)
      .set(updateData)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.clientId, data.clientId)))
      .returning();
    return client || undefined;
  }

  async bulkUpdateClients(organizationId: string, clientsToUpdate: Client[]): Promise<void> {
    if (clientsToUpdate.length === 0) return;
    
    // OPTIMIZED: Use smaller mini-batches to prevent database connection saturation
    const MINI_BATCH_SIZE = 50; // Reduced from 1000 to 50 for connection management
    console.log(`[DEBUG] Processing ${clientsToUpdate.length} client updates in mini-batches of ${MINI_BATCH_SIZE}`);
    
    let completed = 0;
    const totalBatches = Math.ceil(clientsToUpdate.length / MINI_BATCH_SIZE);
    
    for (let i = 0; i < clientsToUpdate.length; i += MINI_BATCH_SIZE) {
      const miniBatch = clientsToUpdate.slice(i, i + MINI_BATCH_SIZE);
      
      // Process mini-batch sequentially to avoid connection exhaustion
      for (const client of miniBatch) {
        try {
          // Verify organizationId matches before updating
          if (client.organizationId === organizationId) {
            await db.update(clients).set(client).where(and(eq(clients.organizationId, organizationId), eq(clients.id, client.id)));
            completed++;
          }
        } catch (error) {
          console.warn(`[WARNING] Failed to update client ${client.id}: ${error}`);
        }
      }
      
      const batchNum = Math.floor(i/MINI_BATCH_SIZE) + 1;
      console.log(`[DEBUG] Completed mini-batch ${batchNum}/${totalBatches} (${completed}/${clientsToUpdate.length} clients)`);
      
      // Add small delay between mini-batches to prevent overwhelming database
      if (batchNum % 10 === 0) { // Pause every 10 mini-batches (500 clients)
        console.log(`[DEBUG] Brief pause after ${batchNum} mini-batches...`);
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`[DEBUG] Successfully bulk updated ${completed}/${clientsToUpdate.length} clients`);
  }

  async bulkUpsertClients(organizationId: string, clientsData: InsertClient[]): Promise<number> {
    if (clientsData.length === 0) return 0;
    
    // Verify all clients belong to the same organization
    const invalidClients = clientsData.filter(c => c.organizationId !== organizationId);
    if (invalidClients.length > 0) {
      console.error(`[BULK UPSERT] ${invalidClients.length} clients have mismatched organizationId`);
      return 0;
    }
    
    const startTime = Date.now();
    console.log(`[BULK UPSERT] Processing ${clientsData.length} clients...`);
    
    // OPTIMIZATION: Fetch existing hashes to skip unchanged clients
    console.log(`[BULK UPSERT] Fetching existing client hashes for change detection...`);
    const existingHashes = await db
      .select({ clientId: clients.clientId, dataHash: clients.dataHash })
      .from(clients)
      .where(eq(clients.organizationId, organizationId));
    
    const hashMap = new Map<string, string | null>();
    for (const row of existingHashes) {
      hashMap.set(row.clientId, row.dataHash);
    }
    console.log(`[BULK UPSERT] Found ${hashMap.size} existing clients with hashes`);
    
    // Compute hashes for incoming data and filter to changed clients only
    const clientsWithHashes = clientsData.map(client => ({
      ...client,
      dataHash: computeClientDataHash(client),
      loanOfficerId: normalizeOfficerId(client.loanOfficerId)
    }));
    
    const changedClients = clientsWithHashes.filter(client => {
      const existingHash = hashMap.get(client.clientId);
      return existingHash !== client.dataHash; // New client or hash changed
    });
    
    const skippedCount = clientsData.length - changedClients.length;
    console.log(`[BULK UPSERT] ⚡ Skipping ${skippedCount} unchanged clients (${Math.round(skippedCount/clientsData.length*100)}% savings)`);
    console.log(`[BULK UPSERT] Processing ${changedClients.length} changed/new clients`);
    
    if (changedClients.length === 0) {
      const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[BULK UPSERT] ✓ No changes detected. Completed in ${totalTime}s`);
      return clientsData.length; // All clients are up-to-date
    }
    
    // OPTIMIZED: Dynamic batch sizing based on data size
    // PostgreSQL parameter limit is 65535, each client has ~25 fields
    // Smaller datasets can use larger batches, larger ones need smaller batches
    const FIELDS_PER_CLIENT = 25;
    const MAX_PARAMS = 60000; // Leave margin below 65535
    const calculatedBatchSize = Math.floor(MAX_PARAMS / FIELDS_PER_CLIENT);
    
    // For very large datasets (>5000), use smaller batches to prevent timeouts
    // For medium datasets, use calculated batch size
    // For small datasets (<500), process all at once
    let BATCH_SIZE: number;
    if (changedClients.length <= 500) {
      BATCH_SIZE = changedClients.length; // Process all at once for small datasets
    } else if (changedClients.length > 5000) {
      BATCH_SIZE = 1000; // Smaller batches for very large datasets
    } else {
      BATCH_SIZE = Math.min(calculatedBatchSize, 1500); // Dynamic sizing with cap
    }
    
    console.log(`[BULK UPSERT] Using dynamic batch size: ${BATCH_SIZE} (${changedClients.length} clients)`);
    
    let totalProcessed = 0;
    const totalBatches = Math.ceil(changedClients.length / BATCH_SIZE);
    
    for (let i = 0; i < changedClients.length; i += BATCH_SIZE) {
      const batch = changedClients.slice(i, i + BATCH_SIZE);
      
      try {
        // Use PostgreSQL's ON CONFLICT clause for efficient upserts
        await db.insert(clients)
          .values(batch as any)
          .onConflictDoUpdate({
            target: [clients.organizationId, clients.clientId],
            set: {
              name: sql.raw('excluded.name'),
              loanOfficerId: sql.raw('excluded.loan_officer_id'),
              managerId: sql.raw('excluded.manager_id'),
              outstanding: sql.raw('excluded.outstanding'),
              outstandingAtRisk: sql.raw('excluded.outstanding_at_risk'),
              parPerLoan: sql.raw('excluded.par_per_loan'),
              lateDays: sql.raw('excluded.late_days'),
              totalDelayedInstalments: sql.raw('excluded.total_delayed_instalments'),
              paidInstalments: sql.raw('excluded.paid_instalments'),
              countReschedule: sql.raw('excluded.count_reschedule'),
              paymentMonthly: sql.raw('excluded.payment_monthly'),
              isAtRisk: sql.raw('excluded.is_at_risk'),
              riskScore: sql.raw('excluded.risk_score'),
              compositeUrgency: sql.raw('excluded.composite_urgency'),
              urgencyClassification: sql.raw('excluded.urgency_classification'),
              urgencyBreakdown: sql.raw('excluded.urgency_breakdown'),
              actionSuggestions: sql.raw('excluded.action_suggestions'),
              dataHash: sql.raw('excluded.data_hash'),
              updatedAt: sql.raw('now()')
            }
          });
        
        totalProcessed += batch.length;
        const batchNum = Math.floor(i/BATCH_SIZE) + 1;
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const rate = totalProcessed > 0 ? Math.round(totalProcessed / (Date.now() - startTime) * 1000) : 0;
        console.log(`[BULK UPSERT] Batch ${batchNum}/${totalBatches}: ${totalProcessed}/${changedClients.length} (${elapsed}s, ${rate} records/s)`);
        
      } catch (error) {
        console.error(`[BULK UPSERT] Error in batch ${Math.floor(i/BATCH_SIZE) + 1}:`, error);
        
        // Fallback: process individually for this batch
        for (const clientData of batch) {
          try {
            const existing = await this.getClientByClientId(organizationId, clientData.clientId);
            if (existing) {
              await this.updateClient(organizationId, existing.id, clientData as any);
            } else {
              await this.createClient(clientData);
            }
            totalProcessed++;
          } catch (individualError) {
            console.error(`[BULK UPSERT] Failed to upsert client ${clientData.clientId}:`, individualError);
          }
        }
      }
    }
    
    const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);
    const avgRate = totalProcessed > 0 ? Math.round(totalProcessed / (Date.now() - startTime) * 1000) : 0;
    console.log(`[BULK UPSERT] ✓ Completed ${totalProcessed}/${changedClients.length} changed clients in ${totalTime}s (${avgRate} records/s, ${skippedCount} skipped)`);
    return clientsData.length; // Return total processed including skipped
  }

  async getUniqueLoanOfficers(organizationId: string): Promise<{ loanOfficerId: string; clientCount: number }[]> {
    // Use SQL GROUP BY for efficient counting - much faster than loading all clients
    const result = await db
      .select({
        loanOfficerId: clients.loanOfficerId,
        clientCount: sql<number>`count(*)`.as('clientCount')
      })
      .from(clients)
      .where(eq(clients.organizationId, organizationId))
      .groupBy(clients.loanOfficerId);
    
    return result.map(row => ({
      loanOfficerId: row.loanOfficerId,
      clientCount: Number(row.clientCount)
    }));
  }

  // Visit methods
  async getVisit(organizationId: string, id: string): Promise<Visit | undefined> {
    const [visit] = await db.select().from(visits).where(and(eq(visits.organizationId, organizationId), eq(visits.id, id)));
    return visit || undefined;
  }

  async getVisitsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<Visit[]> {
    return await db.select().from(visits).where(and(eq(visits.organizationId, organizationId), eq(visits.loanOfficerId, loanOfficerId)));
  }

  async getUpcomingVisits(organizationId: string, loanOfficerId: string): Promise<Visit[]> {
    return await db.select().from(visits).where(and(eq(visits.organizationId, organizationId), eq(visits.loanOfficerId, loanOfficerId)));
  }

  async createVisit(insertVisit: InsertVisit): Promise<Visit> {
    const [visit] = await db.insert(visits).values(insertVisit).returning();
    return visit;
  }

  async updateVisit(organizationId: string, id: string, updates: Partial<Visit>): Promise<Visit | undefined> {
    const [visit] = await db.update(visits).set(updates).where(and(eq(visits.organizationId, organizationId), eq(visits.id, id))).returning();
    return visit || undefined;
  }

  async deleteVisit(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(visits).where(eq(visits.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Phone call methods
  async getPhoneCall(organizationId: string, id: string): Promise<PhoneCall | undefined> {
    const [phoneCall] = await db.select().from(phoneCalls).where(and(eq(phoneCalls.organizationId, organizationId), eq(phoneCalls.id, id)));
    return phoneCall || undefined;
  }

  async getPhoneCallsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<PhoneCall[]> {
    return await db.select().from(phoneCalls).where(and(eq(phoneCalls.organizationId, organizationId), eq(phoneCalls.loanOfficerId, loanOfficerId)));
  }

  async getUpcomingPhoneCalls(organizationId: string, loanOfficerId: string): Promise<PhoneCall[]> {
    return await db.select().from(phoneCalls).where(and(eq(phoneCalls.organizationId, organizationId), eq(phoneCalls.loanOfficerId, loanOfficerId)));
  }

  async createPhoneCall(insertPhoneCall: InsertPhoneCall): Promise<PhoneCall> {
    const [phoneCall] = await db.insert(phoneCalls).values(insertPhoneCall).returning();
    return phoneCall;
  }

  async updatePhoneCall(organizationId: string, id: string, updates: Partial<PhoneCall>): Promise<PhoneCall | undefined> {
    const [phoneCall] = await db.update(phoneCalls).set(updates).where(and(eq(phoneCalls.organizationId, organizationId), eq(phoneCalls.id, id))).returning();
    return phoneCall || undefined;
  }

  async deletePhoneCall(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(phoneCalls).where(eq(phoneCalls.id, id));
    return (result.rowCount ?? 0) > 0;
  }

  // Data sync methods
  async getLastDataSync(organizationId: string): Promise<DataSync | undefined> {
    const [sync] = await db.select().from(dataSync).orderBy(desc(dataSync.lastSyncTime)).limit(1);
    return sync || undefined;
  }

  async createDataSync(syncData: Omit<DataSync, 'id'>): Promise<DataSync> {
    const [sync] = await db.insert(dataSync).values({
      ...syncData,
      progressPercentage: syncData.progressPercentage ?? 0,
      currentStep: syncData.currentStep ?? null
    }).returning();
    return sync;
  }

  async updateDataSyncProgress(id: string, progressPercentage: number, currentStep: string): Promise<void> {
    await db.update(dataSync)
      .set({ progressPercentage, currentStep })
      .where(eq(dataSync.id, id));
  }

  async updateDataSyncStatus(id: string, status: string, recordsProcessed: number, errorMessage?: string | null): Promise<void> {
    await db.update(dataSync)
      .set({ 
        status, 
        recordsProcessed, 
        errorMessage: errorMessage || null, 
        lastSyncTime: new Date() 
      })
      .where(eq(dataSync.id, id));
  }

  // Settings methods
  async getOrganizationSettings(organizationId: string): Promise<Settings | undefined> {
    const [settingsRecord] = await db.select().from(settings).where(eq(settings.loanOfficerId, 'GLOBAL_ADMIN'));
    return settingsRecord || undefined;
  }

  async createOrganizationSettings(settingsData: Omit<InsertSettings, 'loanOfficerId'>): Promise<Settings> {
    const [settingsRecord] = await db
      .insert(settings)
      .values({ ...settingsData, loanOfficerId: 'GLOBAL_ADMIN' })
      .returning();
    return settingsRecord;
  }

  async updateOrganizationSettings(organizationId: string, updates: UpdateSettings): Promise<Settings | undefined> {
    const [settingsRecord] = await db
      .update(settings)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(settings.loanOfficerId, 'GLOBAL_ADMIN'))
      .returning();
    return settingsRecord || undefined;
  }

  // Progress tracking methods for DatabaseStorage
  async getProgressStatus(): Promise<{ isRunning: boolean; progress: number; total: number; currentStep: string; startTime?: Date } | null> {
    // For database storage, use in-memory tracking (could be moved to Redis for distributed systems)
    return this.progressStatus;
  }

  async setProgressStatus(isRunning: boolean, progress: number, total: number, currentStep: string, startTime?: Date): Promise<void> {
    this.progressStatus = { isRunning, progress, total, currentStep, startTime };
  }

  async clearProgressStatus(): Promise<void> {
    this.progressStatus = null;
  }

  // Loan officer statistics methods for DatabaseStorage
  async getLoanOfficerStatistics(organizationId: string): Promise<Array<{
    loanOfficerId: string;
    name?: string;
    totalClients: number;
    urgentClients: number;
    highRiskClients: number;
    completedVisits: number;
    pendingVisits: number;
    averageRiskScore: number;
    lastActivityDate?: Date;
  }>> {
    // Use SQL to efficiently aggregate loan officer statistics
    const officerStats = await db
      .select({
        loanOfficerId: clients.loanOfficerId,
        totalClients: sql<number>`count(*)`.as('total_clients'),
        urgentClients: sql<number>`count(*) filter (where urgency_classification in ('Extremely Urgent', 'Urgent'))`.as('urgent_clients'),
        highRiskClients: sql<number>`count(*) filter (where risk_score > 70)`.as('high_risk_clients'),
        averageRiskScore: sql<number>`avg(risk_score)`.as('average_risk_score'),
      })
      .from(clients)
      .where(eq(clients.organizationId, organizationId))
      .groupBy(clients.loanOfficerId);

    // Get visit statistics
    const visitStats = await db
      .select({
        loanOfficerId: visits.loanOfficerId,
        completedVisits: sql<number>`count(*) filter (where status = 'completed')`.as('completed_visits'),
        pendingVisits: sql<number>`count(*) filter (where status = 'scheduled')`.as('pending_visits'),
      })
      .from(visits)
      .where(eq(visits.organizationId, organizationId))
      .groupBy(visits.loanOfficerId);

    // Get user names
    const userNames = await db
      .select({
        loanOfficerId: users.loanOfficerId,
        name: users.name,
      })
      .from(users)
      .where(eq(users.organizationId, organizationId));

    // Combine the results
    const result = officerStats.map(stats => {
      const visitStat = visitStats.find(v => v.loanOfficerId === stats.loanOfficerId);
      const userName = userNames.find(u => u.loanOfficerId === stats.loanOfficerId);
      
      return {
        loanOfficerId: stats.loanOfficerId,
        name: userName?.name,
        totalClients: stats.totalClients,
        urgentClients: stats.urgentClients,
        highRiskClients: stats.highRiskClients,
        completedVisits: visitStat?.completedVisits || 0,
        pendingVisits: visitStat?.pendingVisits || 0,
        averageRiskScore: Math.round((stats.averageRiskScore || 0) * 100) / 100,
        lastActivityDate: undefined, // Could add this by joining with visit dates
      };
    });

    return result.sort((a, b) => b.urgentClients - a.urgentClients);
  }

  async getLoanOfficerDetails(organizationId: string, loanOfficerId: string): Promise<{
    loanOfficerId: string;
    name?: string;
    totalClients: number;
    urgentClients: number;
    highRiskClients: number;
    completedVisits: number;
    pendingVisits: number;
    averageRiskScore: number;
    recentClients: Client[];
    upcomingVisits: Visit[];
  } | undefined> {
    const normalizedId = normalizeOfficerId(loanOfficerId);
    
    // Get user info
    const user = await this.getUserByLoanOfficerId(organizationId, normalizedId);
    
    // Get client statistics
    const clientStats = await db
      .select({
        totalClients: sql<number>`count(*)`.as('total_clients'),
        urgentClients: sql<number>`count(*) filter (where urgency_classification in ('Extremely Urgent', 'Urgent'))`.as('urgent_clients'),
        highRiskClients: sql<number>`count(*) filter (where risk_score > 70)`.as('high_risk_clients'),
        averageRiskScore: sql<number>`avg(risk_score)`.as('average_risk_score'),
      })
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.loanOfficerId, normalizedId)));

    if (!clientStats[0] || clientStats[0].totalClients === 0) {
      return undefined;
    }

    // Get visit statistics
    const visitStats = await db
      .select({
        completedVisits: sql<number>`count(*) filter (where status = 'completed')`.as('completed_visits'),
        pendingVisits: sql<number>`count(*) filter (where status = 'scheduled')`.as('pending_visits'),
      })
      .from(visits)
      .where(and(eq(visits.organizationId, organizationId), eq(visits.loanOfficerId, normalizedId)));

    // Get recent high-priority clients
    const recentClients = await db
      .select()
      .from(clients)
      .where(and(eq(clients.organizationId, organizationId), eq(clients.loanOfficerId, normalizedId)))
      .orderBy(desc(clients.compositeUrgency))
      .limit(10);

    // Get upcoming visits
    const upcomingVisits = await db
      .select()
      .from(visits)
      .where(and(eq(visits.organizationId, organizationId), eq(visits.loanOfficerId, normalizedId)))
      .orderBy(visits.scheduledDate)
      .limit(10);

    const stats = clientStats[0];
    const visitStat = visitStats[0];

    return {
      loanOfficerId: normalizedId,
      name: user?.name,
      totalClients: stats.totalClients,
      urgentClients: stats.urgentClients,
      highRiskClients: stats.highRiskClients,
      completedVisits: visitStat?.completedVisits || 0,
      pendingVisits: visitStat?.pendingVisits || 0,
      averageRiskScore: Math.round((stats.averageRiskScore || 0) * 100) / 100,
      recentClients,
      upcomingVisits,
    };
  }

  // Utility function to calculate urgency classification from score
  private calculateUrgencyClassification(urgencyScore: number): string {
    if (urgencyScore >= 60) {
      return 'Extremely Urgent';
    } else if (urgencyScore >= 40) {
      return 'Urgent';
    } else if (urgencyScore >= 20) {
      return 'Moderately Urgent';
    } else {
      return 'Low Urgency';
    }
  }

  // Fix all stale urgency classifications by recalculating from scores
  async fixAllStaleClassifications(): Promise<{ updated: number, total: number }> {
    console.log('[CLASSIFICATION FIX] Starting batch update to fix stale urgency classifications...');
    
    let updated = 0;
    const allClients = await db.select().from(clients);
    const total = allClients.length;
    
    for (const client of allClients) {
      const correctClassification = this.calculateUrgencyClassification(client.compositeUrgency);
      
      if (client.urgencyClassification !== correctClassification) {
        updated++;
        console.log(`[CLASSIFICATION FIX] ${client.name}: ${client.urgencyClassification} → ${correctClassification} (score: ${client.compositeUrgency})`);
        
        await db
          .update(clients)
          .set({ urgencyClassification: correctClassification })
          .where(eq(clients.id, client.id));
      }
    }
    
    console.log(`[CLASSIFICATION FIX] Completed! Updated ${updated} out of ${total} clients`);
    return { updated, total };
  }

  // Gamification Rule methods
  async getAllGamificationRules(organizationId: string): Promise<GamificationRule[]> {
    return await db.select().from(gamificationRules).where(eq(gamificationRules.organizationId, organizationId)).orderBy(desc(gamificationRules.createdAt));
  }

  async getGamificationRule(organizationId: string, id: string): Promise<GamificationRule | undefined> {
    const [rule] = await db.select().from(gamificationRules).where(and(eq(gamificationRules.organizationId, organizationId), eq(gamificationRules.id, id)));
    return rule || undefined;
  }

  async getGamificationRuleByEventType(organizationId: string, eventType: string): Promise<GamificationRule | undefined> {
    const [rule] = await db.select().from(gamificationRules).where(and(eq(gamificationRules.organizationId, organizationId), eq(gamificationRules.eventType, eventType)));
    return rule || undefined;
  }

  async createGamificationRule(rule: InsertGamificationRule): Promise<GamificationRule> {
    const [newRule] = await db.insert(gamificationRules).values(rule).returning();
    return newRule;
  }

  async updateGamificationRule(organizationId: string, id: string, updates: Partial<GamificationRule>): Promise<GamificationRule | undefined> {
    const [rule] = await db.update(gamificationRules)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(gamificationRules.organizationId, organizationId), eq(gamificationRules.id, id)))
      .returning();
    return rule || undefined;
  }

  async deleteGamificationRule(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(gamificationRules).where(and(eq(gamificationRules.organizationId, organizationId), eq(gamificationRules.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Gamification Season methods
  async getAllGamificationSeasons(organizationId: string): Promise<GamificationSeason[]> {
    return await db.select().from(gamificationSeasons).where(eq(gamificationSeasons.organizationId, organizationId)).orderBy(desc(gamificationSeasons.startDate));
  }

  async getGamificationSeason(organizationId: string, id: string): Promise<GamificationSeason | undefined> {
    const [season] = await db.select().from(gamificationSeasons).where(and(eq(gamificationSeasons.organizationId, organizationId), eq(gamificationSeasons.id, id)));
    return season || undefined;
  }

  async getActiveGamificationSeason(organizationId: string): Promise<GamificationSeason | undefined> {
    const [season] = await db.select().from(gamificationSeasons).where(and(eq(gamificationSeasons.organizationId, organizationId), eq(gamificationSeasons.isActive, true)));
    return season || undefined;
  }

  async createGamificationSeason(season: InsertGamificationSeason): Promise<GamificationSeason> {
    const [newSeason] = await db.insert(gamificationSeasons).values(season).returning();
    return newSeason;
  }

  async updateGamificationSeason(organizationId: string, id: string, updates: Partial<GamificationSeason>): Promise<GamificationSeason | undefined> {
    const [season] = await db.update(gamificationSeasons)
      .set(updates)
      .where(and(eq(gamificationSeasons.organizationId, organizationId), eq(gamificationSeasons.id, id)))
      .returning();
    return season || undefined;
  }

  async deleteGamificationSeason(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(gamificationSeasons).where(and(eq(gamificationSeasons.organizationId, organizationId), eq(gamificationSeasons.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // Gamification Event methods
  async getAllGamificationEvents(organizationId: string): Promise<GamificationEvent[]> {
    return await db.select().from(gamificationEvents).where(eq(gamificationEvents.organizationId, organizationId)).orderBy(desc(gamificationEvents.createdAt));
  }

  async getGamificationEventsByLoanOfficer(organizationId: string, loanOfficerId: string): Promise<GamificationEvent[]> {
    return await db.select().from(gamificationEvents)
      .where(and(eq(gamificationEvents.organizationId, organizationId), eq(gamificationEvents.loanOfficerId, loanOfficerId)))
      .orderBy(desc(gamificationEvents.createdAt));
  }

  async getPendingGamificationEvents(organizationId: string): Promise<GamificationEvent[]> {
    return await db.select().from(gamificationEvents)
      .where(and(eq(gamificationEvents.organizationId, organizationId), eq(gamificationEvents.status, 'pending')))
      .orderBy(desc(gamificationEvents.createdAt));
  }

  async createGamificationEvent(event: InsertGamificationEvent): Promise<GamificationEvent> {
    const [newEvent] = await db.insert(gamificationEvents).values([event as any]).returning();
    return newEvent;
  }

  async approveGamificationEvent(organizationId: string, id: string, reviewedBy: string): Promise<GamificationEvent | undefined> {
    const [event] = await db.update(gamificationEvents)
      .set({ 
        status: 'approved', 
        reviewedAt: new Date(), 
        reviewedBy 
      })
      .where(and(eq(gamificationEvents.organizationId, organizationId), eq(gamificationEvents.id, id)))
      .returning();
    return event || undefined;
  }

  async rejectGamificationEvent(organizationId: string, id: string, reviewedBy: string): Promise<GamificationEvent | undefined> {
    const [event] = await db.update(gamificationEvents)
      .set({ 
        status: 'rejected', 
        reviewedAt: new Date(), 
        reviewedBy 
      })
      .where(and(eq(gamificationEvents.organizationId, organizationId), eq(gamificationEvents.id, id)))
      .returning();
    return event || undefined;
  }

  // Gamification Badge methods
  async getAllGamificationBadges(organizationId: string): Promise<GamificationBadge[]> {
    return await db.select().from(gamificationBadges).where(eq(gamificationBadges.organizationId, organizationId)).orderBy(gamificationBadges.name);
  }

  async getGamificationBadge(organizationId: string, id: string): Promise<GamificationBadge | undefined> {
    const [badge] = await db.select().from(gamificationBadges).where(and(eq(gamificationBadges.organizationId, organizationId), eq(gamificationBadges.id, id)));
    return badge || undefined;
  }

  async createGamificationBadge(badge: InsertGamificationBadge): Promise<GamificationBadge> {
    const [newBadge] = await db.insert(gamificationBadges).values(badge).returning();
    return newBadge;
  }

  async updateGamificationBadge(organizationId: string, id: string, updates: Partial<GamificationBadge>): Promise<GamificationBadge | undefined> {
    const [badge] = await db.update(gamificationBadges)
      .set(updates)
      .where(and(eq(gamificationBadges.organizationId, organizationId), eq(gamificationBadges.id, id)))
      .returning();
    return badge || undefined;
  }

  async deleteGamificationBadge(organizationId: string, id: string): Promise<boolean> {
    const result = await db.delete(gamificationBadges).where(and(eq(gamificationBadges.organizationId, organizationId), eq(gamificationBadges.id, id)));
    return (result.rowCount ?? 0) > 0;
  }

  // User Badge methods
  async getUserBadges(organizationId: string, loanOfficerId: string): Promise<GamificationUserBadge[]> {
    return await db.select()
      .from(gamificationUserBadges)
      .innerJoin(users, eq(gamificationUserBadges.loanOfficerId, users.loanOfficerId))
      .where(and(eq(users.organizationId, organizationId), eq(gamificationUserBadges.loanOfficerId, loanOfficerId)))
      .orderBy(desc(gamificationUserBadges.unlockedAt))
      .then(rows => rows.map(row => row.gamification_user_badges));
  }

  async unlockBadge(organizationId: string, loanOfficerId: string, badgeId: string): Promise<GamificationUserBadge | null> {
    // Verify user belongs to organization
    const user = await db.select().from(users).where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId))).limit(1);
    if (!user || user.length === 0) return null;
    
    // Verify badge belongs to this organization
    const badge = await db.select().from(gamificationBadges).where(and(eq(gamificationBadges.organizationId, organizationId), eq(gamificationBadges.id, badgeId))).limit(1);
    if (!badge || badge.length === 0) return null;
    
    // Check if already unlocked (scoped to organization via user check above)
    const [existing] = await db.select()
      .from(gamificationUserBadges)
      .where(
        and(
          eq(gamificationUserBadges.organizationId, organizationId),
          eq(gamificationUserBadges.loanOfficerId, loanOfficerId),
          eq(gamificationUserBadges.badgeId, badgeId)
        )
      );

    if (existing) {
      return null;
    }

    const [userBadge] = await db.insert(gamificationUserBadges)
      .values({ organizationId, loanOfficerId, badgeId })
      .returning();
    return userBadge;
  }

  // Leaderboard and User Stats methods
  async getLeaderboard(organizationId: string, scope: 'company' | 'branch', branchId?: string, seasonId?: string): Promise<Array<{
    loanOfficerId: string;
    name: string;
    totalPoints: number;
    currentStreak: number;
    rank: number;
    badgeCount: number;
  }>> {
    let whereCondition = eq(users.organizationId, organizationId);
    
    if (scope === 'branch' && branchId) {
      whereCondition = and(eq(users.organizationId, organizationId), eq(users.branchId, branchId)) as any;
    }

    const baseQuery = db
      .select({
        loanOfficerId: users.loanOfficerId,
        name: users.name,
        totalPoints: users.totalPoints,
        currentStreak: users.currentStreak,
        badgeCount: sql<number>`(
          SELECT COUNT(*)::int 
          FROM ${gamificationUserBadges} 
          WHERE ${gamificationUserBadges.loanOfficerId} = ${users.loanOfficerId}
        )`.as('badgeCount')
      })
      .from(users)
      .where(whereCondition);

    const leaderboardData = await baseQuery.orderBy(desc(users.totalPoints));

    return leaderboardData.map((entry, index) => ({
      ...entry,
      rank: index + 1
    }));
  }

  async updateUserPoints(organizationId: string, loanOfficerId: string, pointsToAdd: number): Promise<void> {
    await db.update(users)
      .set({ 
        totalPoints: sql`${users.totalPoints} + ${pointsToAdd}` 
      })
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));
  }

  async updateUserStreak(organizationId: string, loanOfficerId: string): Promise<void> {
    const [user] = await db.select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));

    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStreak = 1;

    if (user.lastActivityDate) {
      const lastActivity = new Date(user.lastActivityDate);
      lastActivity.setHours(0, 0, 0, 0);

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (lastActivity.getTime() === yesterday.getTime()) {
        newStreak = (user.currentStreak || 0) + 1;
      } else if (lastActivity.getTime() === today.getTime()) {
        return;
      }
    }

    await db.update(users)
      .set({ 
        currentStreak: newStreak,
        lastActivityDate: new Date()
      })
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));
  }

  async getUserGamificationStats(organizationId: string, loanOfficerId: string): Promise<{
    totalPoints: number;
    currentStreak: number;
    currentRank: number | null;
    badgeCount: number;
    recentEvents: GamificationEvent[];
  } | undefined> {
    const [user] = await db.select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));

    if (!user) return undefined;

    const badgeCountResult = await db.select({ count: count() })
      .from(gamificationUserBadges)
      .where(and(eq(gamificationUserBadges.organizationId, organizationId), eq(gamificationUserBadges.loanOfficerId, loanOfficerId)));

    const badgeCount = badgeCountResult[0]?.count || 0;

    const allUsersRanked = await db.select({
      loanOfficerId: users.loanOfficerId,
      totalPoints: users.totalPoints
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(desc(users.totalPoints));

    const currentRank = allUsersRanked.findIndex(u => u.loanOfficerId === loanOfficerId) + 1;

    const recentEvents = await db.select()
      .from(gamificationEvents)
      .where(and(eq(gamificationEvents.organizationId, organizationId), eq(gamificationEvents.loanOfficerId, loanOfficerId)))
      .orderBy(desc(gamificationEvents.createdAt))
      .limit(10);

    return {
      totalPoints: user.totalPoints || 0,
      currentStreak: user.currentStreak || 0,
      currentRank: currentRank > 0 ? currentRank : null,
      badgeCount: Number(badgeCount),
      recentEvents
    };
  }

  async getMiniLeaderboard(organizationId: string, limit: number = 5): Promise<Array<{
    rank: number;
    loanOfficerId: string;
    name: string;
    totalPoints: number;
    currentStreak: number;
    badges: number;
    isCurrentUser?: boolean;
  }>> {
    // Get top users by points
    const topUsers = await db.select({
      loanOfficerId: users.loanOfficerId,
      name: users.name,
      totalPoints: users.totalPoints,
      currentStreak: users.currentStreak,
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(desc(users.totalPoints))
    .limit(limit);

    // Get badge counts for each user
    const leaderboard = await Promise.all(topUsers.map(async (user, index) => {
      const badgeCountResult = await db.select({ count: count() })
        .from(gamificationUserBadges)
        .where(and(
          eq(gamificationUserBadges.organizationId, organizationId),
          eq(gamificationUserBadges.loanOfficerId, user.loanOfficerId)
        ));

      return {
        rank: index + 1,
        loanOfficerId: user.loanOfficerId,
        name: user.name,
        totalPoints: user.totalPoints || 0,
        currentStreak: user.currentStreak || 0,
        badges: Number(badgeCountResult[0]?.count || 0),
      };
    }));

    return leaderboard;
  }

  async getDetailedUserStats(organizationId: string, loanOfficerId: string): Promise<{
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
  } | undefined> {
    const [user] = await db.select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));

    if (!user) return undefined;

    // Get unlocked badges count
    const unlockedBadgesResult = await db.select({ count: count() })
      .from(gamificationUserBadges)
      .where(and(
        eq(gamificationUserBadges.organizationId, organizationId),
        eq(gamificationUserBadges.loanOfficerId, loanOfficerId)
      ));

    const unlockedBadges = Number(unlockedBadgesResult[0]?.count || 0);

    // Get total badges available
    const totalBadgesResult = await db.select({ count: count() })
      .from(gamificationBadges)
      .where(eq(gamificationBadges.organizationId, organizationId));

    const totalBadges = Number(totalBadgesResult[0]?.count || 0);

    // Get user's unlocked badge IDs
    const unlockedBadgeIds = await db.select({ badgeId: gamificationUserBadges.badgeId })
      .from(gamificationUserBadges)
      .where(and(
        eq(gamificationUserBadges.organizationId, organizationId),
        eq(gamificationUserBadges.loanOfficerId, loanOfficerId)
      ));

    const unlockedIds = new Set(unlockedBadgeIds.map(b => b.badgeId));

    // Find next badge to unlock based on achievement type and threshold
    const allBadges = await db.select()
      .from(gamificationBadges)
      .where(and(
        eq(gamificationBadges.organizationId, organizationId),
        eq(gamificationBadges.isActive, true)
      ))
      .orderBy(gamificationBadges.thresholdValue);

    let nextBadge = null;
    for (const badge of allBadges) {
      if (unlockedIds.has(badge.id)) continue;

      // Calculate progress based on achievement type
      let currentValue = 0;
      if (badge.achievementType === 'points_total') {
        currentValue = user.totalPoints || 0;
      } else if (badge.achievementType === 'streak_days') {
        currentValue = user.currentStreak || 0;
      } else if (badge.achievementType === 'visits_count') {
        const visitsResult = await db.select({ count: count() })
          .from(visits)
          .where(and(
            eq(visits.organizationId, organizationId),
            eq(visits.loanOfficerId, loanOfficerId),
            eq(visits.status, 'completed')
          ));
        currentValue = Number(visitsResult[0]?.count || 0);
      }

      const progress = Math.min(100, (currentValue / badge.thresholdValue) * 100);
      const remaining = Math.max(0, badge.thresholdValue - currentValue);

      nextBadge = {
        name: badge.name,
        description: badge.description,
        icon: badge.icon,
        progress,
        remaining
      };
      break; // Take the first (lowest threshold) locked badge
    }

    // Get current rank
    const allUsersRanked = await db.select({
      loanOfficerId: users.loanOfficerId,
      totalPoints: users.totalPoints
    })
    .from(users)
    .where(eq(users.organizationId, organizationId))
    .orderBy(desc(users.totalPoints));

    const currentRank = allUsersRanked.findIndex(u => u.loanOfficerId === loanOfficerId) + 1;

    // Calculate level and points to next level
    const level = Math.floor((user.totalPoints || 0) / 100) + 1;
    const pointsToNextLevel = 100 - ((user.totalPoints || 0) % 100);

    return {
      totalPoints: user.totalPoints || 0,
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0,
      currentRank: currentRank > 0 ? currentRank : null,
      unlockedBadges,
      totalBadges,
      nextBadge,
      level,
      pointsToNextLevel
    };
  }

  async updateUserLoginStreak(organizationId: string, loanOfficerId: string): Promise<void> {
    const [user] = await db.select()
      .from(users)
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));

    if (!user) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStreak = 1;
    let longestStreak = user.longestStreak || 0;

    if (user.lastLoginDate) {
      const lastLogin = new Date(user.lastLoginDate);
      lastLogin.setHours(0, 0, 0, 0);

      // If already logged in today, do nothing
      if (lastLogin.getTime() === today.getTime()) {
        return;
      }

      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      // If logged in yesterday, increment streak
      if (lastLogin.getTime() === yesterday.getTime()) {
        newStreak = (user.currentStreak || 0) + 1;
      }
      // Otherwise streak breaks, reset to 1
    }

    // Update longest streak if current streak is higher
    if (newStreak > longestStreak) {
      longestStreak = newStreak;
    }

    await db.update(users)
      .set({ 
        currentStreak: newStreak,
        longestStreak: longestStreak,
        lastLoginDate: new Date()
      })
      .where(and(eq(users.organizationId, organizationId), eq(users.loanOfficerId, loanOfficerId)));
  }

  async createPortfolioSnapshot(snapshot: InsertPortfolioSnapshot): Promise<PortfolioSnapshot> {
    const [snapshotRecord] = await db
      .insert(portfolioSnapshots)
      .values(snapshot)
      .returning();
    return snapshotRecord;
  }

  async getPortfolioSnapshots(organizationId: string, loanOfficerId: string, limit: number = 12): Promise<PortfolioSnapshot[]> {
    return await db.select()
      .from(portfolioSnapshots)
      .where(and(
        eq(portfolioSnapshots.organizationId, organizationId),
        eq(portfolioSnapshots.loanOfficerId, loanOfficerId)
      ))
      .orderBy(desc(portfolioSnapshots.snapshotDate))
      .limit(limit);
  }

  async getLatestSnapshot(organizationId: string, loanOfficerId: string): Promise<PortfolioSnapshot | undefined> {
    const [snapshot] = await db.select()
      .from(portfolioSnapshots)
      .where(and(
        eq(portfolioSnapshots.organizationId, organizationId),
        eq(portfolioSnapshots.loanOfficerId, loanOfficerId)
      ))
      .orderBy(desc(portfolioSnapshots.snapshotDate))
      .limit(1);
    return snapshot;
  }

  async getUserCountByOrganization(organizationId: string): Promise<number> {
    const [result] = await db.select({ count: count() })
      .from(users)
      .where(eq(users.organizationId, organizationId));
    return result.count || 0;
  }

  async deleteOrganization(organizationId: string): Promise<boolean> {
    // Use transaction to ensure atomic deletion - all or nothing
    const result = await db.transaction(async (tx) => {
      // Cascade delete all organization data in correct order
      // Foreign key dependencies must be deleted first
      await tx.delete(portfolioSnapshots).where(eq(portfolioSnapshots.organizationId, organizationId));
      await tx.delete(gamificationUserBadges).where(eq(gamificationUserBadges.organizationId, organizationId));
      await tx.delete(gamificationEvents).where(eq(gamificationEvents.organizationId, organizationId));
      await tx.delete(gamificationBadges).where(eq(gamificationBadges.organizationId, organizationId));
      await tx.delete(gamificationSeasons).where(eq(gamificationSeasons.organizationId, organizationId));
      await tx.delete(gamificationRules).where(eq(gamificationRules.organizationId, organizationId));
      await tx.delete(settings).where(eq(settings.organizationId, organizationId));
      await tx.delete(dataSync).where(eq(dataSync.organizationId, organizationId));
      await tx.delete(phoneCalls).where(eq(phoneCalls.organizationId, organizationId));
      await tx.delete(visits).where(eq(visits.organizationId, organizationId));
      await tx.delete(clients).where(eq(clients.organizationId, organizationId));
      await tx.delete(users).where(eq(users.organizationId, organizationId));
      
      // Finally delete the organization itself and return the result
      const deletedOrgs = await tx.delete(organizations).where(eq(organizations.id, organizationId)).returning();
      return deletedOrgs;
    });
    
    // Check if organization was actually deleted
    if (result.length === 0) {
      console.log(`[SUPER ADMIN] Organization ${organizationId} not found - nothing to delete`);
      return false;
    }
    
    console.log(`[SUPER ADMIN] Successfully deleted organization ${organizationId} and all associated data`);
    return true;
  }

  async getDailyProgress(organizationId: string, loanOfficerId: string, date: Date): Promise<{
    visitsCompleted: number;
    visitsTarget: number;
    progressPercentage: number;
  }> {
    // Get user's daily visit target
    const user = await this.getUserByLoanOfficerId(organizationId, loanOfficerId);
    const visitsTarget = user?.dailyVisitTarget || 10;

    // Count visits completed on the given date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const [result] = await db
      .select({ count: count() })
      .from(visits)
      .where(
        and(
          eq(visits.organizationId, organizationId),
          eq(visits.loanOfficerId, loanOfficerId),
          eq(visits.status, 'completed'),
          sql`${visits.completedAt} >= ${startOfDay}`,
          sql`${visits.completedAt} <= ${endOfDay}`
        )
      );

    const visitsCompleted = result.count || 0;
    const progressPercentage = visitsTarget > 0 ? Math.min((visitsCompleted / visitsTarget) * 100, 100) : 0;

    return {
      visitsCompleted,
      visitsTarget,
      progressPercentage,
    };
  }

  async getStreakHistory(organizationId: string, loanOfficerId: string, days: number): Promise<Array<{
    date: Date;
    targetMet: boolean;
    visitsCompleted: number;
    visitsTarget: number;
  }>> {
    // Get user's daily visit target
    const user = await this.getUserByLoanOfficerId(organizationId, loanOfficerId);
    const defaultTarget = user?.dailyVisitTarget || 10;

    // Query all streak history records
    const history = await db
      .select()
      .from(streakHistory)
      .where(
        and(
          eq(streakHistory.organizationId, organizationId),
          eq(streakHistory.loanOfficerId, loanOfficerId)
        )
      )
      .orderBy(desc(streakHistory.date));

    // Create a map of existing records by date
    const recordMap = new Map<string, typeof history[0]>();
    history.forEach(record => {
      const dateKey = new Date(record.date).toISOString().split('T')[0];
      recordMap.set(dateKey, record);
    });

    // Generate array of last N days, filling in missing days
    const result = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < days; i++) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const dateKey = date.toISOString().split('T')[0];
      const record = recordMap.get(dateKey);

      if (record) {
        // Use existing record
        result.push({
          date: new Date(record.date),
          targetMet: record.targetMet,
          visitsCompleted: record.visitsCompleted,
          visitsTarget: record.visitsTarget,
        });
      } else {
        // Fill in missing day with default values
        result.push({
          date,
          targetMet: false,
          visitsCompleted: 0,
          visitsTarget: defaultTarget,
        });
      }
    }

    return result;
  }

  async upsertStreakHistory(organizationId: string, loanOfficerId: string, date: Date): Promise<void> {
    // Get daily progress for the date
    const progress = await this.getDailyProgress(organizationId, loanOfficerId, date);
    
    // Normalize date to start of day
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    // Check if target was met
    const targetMet = progress.visitsCompleted >= progress.visitsTarget;

    // Upsert the streak record
    await db
      .insert(streakHistory)
      .values({
        organizationId,
        loanOfficerId,
        date: normalizedDate,
        visitsCompleted: progress.visitsCompleted,
        visitsTarget: progress.visitsTarget,
        targetMet,
      })
      .onConflictDoUpdate({
        target: [streakHistory.organizationId, streakHistory.loanOfficerId, streakHistory.date],
        set: {
          visitsCompleted: progress.visitsCompleted,
          visitsTarget: progress.visitsTarget,
          targetMet,
        },
      });

    // Recalculate current streak based on consecutive days
    const history = await db
      .select()
      .from(streakHistory)
      .where(
        and(
          eq(streakHistory.organizationId, organizationId),
          eq(streakHistory.loanOfficerId, loanOfficerId),
          eq(streakHistory.targetMet, true)
        )
      )
      .orderBy(desc(streakHistory.date));

    // Calculate current streak (consecutive days from today backwards)
    let currentStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let i = 0; i < history.length; i++) {
      const recordDate = new Date(history[i].date);
      recordDate.setHours(0, 0, 0, 0);
      
      const expectedDate = new Date(today);
      expectedDate.setDate(expectedDate.getDate() - i);
      expectedDate.setHours(0, 0, 0, 0);
      
      // Check if this record is for the expected consecutive day
      if (recordDate.getTime() === expectedDate.getTime()) {
        currentStreak++;
      } else {
        break; // Streak is broken
      }
    }

    // Update user's streak counters
    const user = await this.getUserByLoanOfficerId(organizationId, loanOfficerId);
    if (user) {
      const longestStreak = Math.max(currentStreak, user.longestStreak || 0);
      
      await db
        .update(users)
        .set({
          currentStreak,
          longestStreak,
          lastActivityDate: new Date(),
        })
        .where(
          and(
            eq(users.organizationId, organizationId),
            eq(users.loanOfficerId, loanOfficerId)
          )
        );
      
      console.log(`[STREAK] Updated user streaks - current: ${currentStreak}, longest: ${longestStreak}`);
    }
  }

  private progressStatus: { isRunning: boolean; progress: number; total: number; currentStep: string; startTime?: Date } | null = null;
}

export const storage = new DatabaseStorage();
