import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage, verifyPassword } from "./storage";
import { insertUserSchema, updateClientFeedbackSchema, insertVisitSchema, insertPhoneCallSchema, updateSettingsSchema, insertGamificationRuleSchema, insertGamificationSeasonSchema, insertGamificationBadgeSchema, type Client, type InsertClient } from "@shared/schema";
import path from "path";
import multer from "multer";
import crypto from "crypto";
import fs from "fs";
import rateLimit from "express-rate-limit";
// Removed GROQ AI and Python imports - now using only TypeScript-based weight calculations
import { startDataSyncScheduler } from "./scheduler";
import { processExcelData, type WeightSettings } from "./excel-processor";
import { registerMigrationRoutes } from "./migration";

// Rate limiter for authentication endpoints to prevent brute force attacks
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Limit each IP to 10 requests per windowMs
  message: "Too many authentication attempts, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for file uploads to prevent abuse
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 uploads per hour
  message: "Too many file uploads, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter for general API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per 15 minutes
  message: "Too many requests, please try again later",
  standardHeaders: true,
  legacyHeaders: false,
});

// Multi-tenant WebSocket connections - map of organizationId -> Set of WebSocket connections
const wsConnectionsByOrg = new Map<string, Set<any>>();

// Function to broadcast weight updates to loan officers in a specific organization
function broadcastWeightUpdate(organizationId: string, settings: any) {
  const message = JSON.stringify({
    type: 'weight_update',
    data: {
      riskLateDaysWeight: settings.riskLateDaysWeight,
      riskOutstandingAtRiskWeight: settings.riskOutstandingAtRiskWeight,
      riskParPerLoanWeight: settings.riskParPerLoanWeight,
      riskReschedulesWeight: settings.riskReschedulesWeight,
      riskPaymentConsistencyWeight: settings.riskPaymentConsistencyWeight,
      riskDelayedInstalmentsWeight: settings.riskDelayedInstalmentsWeight,
      urgencyRiskScoreWeight: settings.urgencyRiskScoreWeight,
      urgencyDaysSinceVisitWeight: settings.urgencyDaysSinceVisitWeight,
      urgencyFeedbackScoreWeight: settings.urgencyFeedbackScoreWeight,
      feedbackPaymentWillingnessWeight: settings.feedbackPaymentWillingnessWeight,
      feedbackFinancialSituationWeight: settings.feedbackFinancialSituationWeight,
      feedbackCommunicationQualityWeight: settings.feedbackCommunicationQualityWeight,
      feedbackComplianceCooperationWeight: settings.feedbackComplianceCooperationWeight,
      feedbackFutureOutlookWeight: settings.feedbackFutureOutlookWeight
    }
  });

  const orgConnections = wsConnectionsByOrg.get(organizationId);
  if (!orgConnections) {
    console.log(`[WEBSOCKET] No connections found for organization ${organizationId}`);
    return;
  }

  console.log(`[WEBSOCKET] Broadcasting weight update to ${orgConnections.size} loan officers in organization ${organizationId}`);
  
  orgConnections.forEach((ws) => {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      } else {
        // Remove dead connections
        orgConnections.delete(ws);
      }
    } catch (error) {
      console.error('[WEBSOCKET] Error sending message:', error);
      orgConnections.delete(ws);
    }
  });

  // Clean up empty organization sets
  if (orgConnections.size === 0) {
    wsConnectionsByOrg.delete(organizationId);
  }
}

// Function to auto-provision missing loan officer user accounts
async function provisionMissingUsers(organizationId: string): Promise<{
  createdUsers: Array<{ loanOfficerId: string; defaultPassword: string; name: string }>;
  errors: string[];
}> {
  const createdUsers = [];
  const errors = [];
  
  try {
    const officerStats = await storage.getUniqueLoanOfficers(organizationId);
    const missingUsers = [];
    
    // Find officers without user accounts
    for (const officer of officerStats) {
      const officerId = officer.loanOfficerId;
      const existingUser = await storage.getUserByLoanOfficerId(organizationId, officerId);
      if (!existingUser) {
        missingUsers.push(officerId);
      }
    }
    
    console.log(`[PROVISION] Found ${missingUsers.length} loan officers without user accounts in organization ${organizationId}`);
    
    // Create user accounts for missing officers
    for (const officerId of missingUsers) {
      try {
        // Generate a secure random password
        const defaultPassword = crypto.randomBytes(8).toString('hex'); // 16 character hex password
        const officerName = `Loan Officer ${officerId}`;
        
        const newUser = await storage.createUser({
          loanOfficerId: officerId,
          password: defaultPassword,
          name: officerName,
          isAdmin: false,
          organizationId
        });
        
        createdUsers.push({
          loanOfficerId: newUser.loanOfficerId,
          defaultPassword: defaultPassword,
          name: newUser.name
        });
        
        console.log(`[PROVISION] Created user account for ${officerId}`);
        
      } catch (error) {
        console.error(`[PROVISION] Failed to create user for ${officerId}:`, error);
        errors.push(`Failed to create account for ${officerId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } catch (error) {
    console.error(`[PROVISION] Error during provisioning:`, error);
    errors.push(`Provisioning error: ${error instanceof Error ? error.message : String(error)}`);
  }
  
  return { createdUsers, errors };
}

// Function to broadcast visit completion to all connected clients
function broadcastVisitCompletion(visitData: { visitId: string; clientId: string; clientName: string; loanOfficerId: string }, organizationId: string) {
  const message = JSON.stringify({
    type: 'visit_completed',
    data: visitData
  });

  const orgConnections = wsConnectionsByOrg.get(organizationId);
  if (!orgConnections) {
    console.log(`[WEBSOCKET] No connections found for organization ${organizationId}`);
    return;
  }

  console.log(`[WEBSOCKET] Broadcasting visit completion to ${orgConnections.size} connected users in organization ${organizationId}`);
  
  orgConnections.forEach((ws) => {
    try {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      } else {
        // Remove dead connections
        orgConnections.delete(ws);
      }
    } catch (error) {
      console.error('[WEBSOCKET] Error sending message:', error);
      orgConnections.delete(ws);
    }
  });

  // Clean up empty organization sets
  if (orgConnections.size === 0) {
    wsConnectionsByOrg.delete(organizationId);
  }
}

// Helper function to check and unlock badges based on user achievements
async function checkAndUnlockBadges(organizationId: string, loanOfficerId: string): Promise<void> {
  try {
    // 1. Get all active badges
    const allBadges = await storage.getAllGamificationBadges(organizationId);
    const activeBadges = allBadges.filter(badge => badge.isActive);
    
    if (activeBadges.length === 0) {
      return;
    }

    // 2. Get user's current badges
    const userBadges = await storage.getUserBadges(organizationId, loanOfficerId);
    const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));

    // 3. Get user stats
    const stats = await storage.getUserGamificationStats(organizationId, loanOfficerId);
    if (!stats) {
      return;
    }

    // 4. Count user's achievements
    const visits = await storage.getVisitsByLoanOfficer(organizationId, loanOfficerId);
    const completedVisits = visits.filter(v => v.status === 'completed').length;
    
    const events = await storage.getGamificationEventsByLoanOfficer(organizationId, loanOfficerId);
    const approvedEvents = events.filter(e => e.status === 'approved');
    const highNpsCount = approvedEvents.filter(e => e.eventType === 'high_nps_score').length;

    // 5. Check each badge and unlock if threshold met
    for (const badge of activeBadges) {
      // Skip if already earned
      if (earnedBadgeIds.has(badge.id)) {
        continue;
      }

      let shouldUnlock = false;
      let achievementValue = 0;

      // Check based on achievement type
      switch (badge.achievementType) {
        case 'visits_count':
          achievementValue = completedVisits;
          shouldUnlock = completedVisits >= badge.thresholdValue;
          break;
        case 'points_total':
          achievementValue = stats.totalPoints;
          shouldUnlock = stats.totalPoints >= badge.thresholdValue;
          break;
        case 'streak_days':
          achievementValue = stats.currentStreak;
          shouldUnlock = stats.currentStreak >= badge.thresholdValue;
          break;
        case 'high_nps_count':
          achievementValue = highNpsCount;
          shouldUnlock = highNpsCount >= badge.thresholdValue;
          break;
        case 'rank_achievement':
          achievementValue = stats.currentRank || 999;
          shouldUnlock = stats.currentRank !== null && stats.currentRank <= badge.thresholdValue;
          break;
        default:
          console.log(`[BADGE] Unknown achievement type: ${badge.achievementType}`);
          continue;
      }

      // Unlock badge if threshold met
      if (shouldUnlock) {
        await storage.unlockBadge(organizationId, loanOfficerId, badge.id);
        console.log(`[BADGE] Unlocked badge for ${loanOfficerId}: ${badge.name} (${achievementValue} >= ${badge.thresholdValue})`);
      }
    }

  } catch (error) {
    console.error(`[BADGE] Error checking badges for ${loanOfficerId}:`, error);
    // Don't fail the main action if badge checking fails
  }
}

// Helper function to award points automatically when officers complete actions
async function awardPointsForAction(
  organizationId: string,
  loanOfficerId: string,
  actionType: string,
  details: string,
  metadata?: Record<string, any>
): Promise<void> {
  try {
    // 1. Check if there's an active season
    const activeSeason = await storage.getActiveGamificationSeason(organizationId);
    if (!activeSeason) {
      console.log(`[GAMIFICATION] No active season - skipping points for ${actionType}`);
      return;
    }

    // 2. Get the rule for this event type
    const rule = await storage.getGamificationRuleByEventType(organizationId, actionType);
    if (!rule || !rule.isActive) {
      console.log(`[GAMIFICATION] No active rule for ${actionType} - skipping points`);
      return;
    }

    // 3. Calculate points based on rule
    const pointsEarned = rule.pointValue;

    // 4. Determine if auto-approval is needed
    const requiresApproval = pointsEarned > rule.autoApprovalThreshold;
    const status = requiresApproval ? 'pending' : 'approved';

    // 5. Create gamification event
    const event = await storage.createGamificationEvent({
      organizationId,
      loanOfficerId,
      eventType: actionType,
      pointsAwarded: pointsEarned,
      status,
      metadata: metadata ? { ...metadata as any, details } : { details } as any,
      seasonId: activeSeason.id,
      reviewedBy: requiresApproval ? null : 'SYSTEM'
    });

    console.log(`[GAMIFICATION] Created ${status} event for ${loanOfficerId}: ${actionType} = ${pointsEarned} points`);

    // 6. If auto-approved, update user points immediately
    if (!requiresApproval) {
      await storage.updateUserPoints(organizationId, loanOfficerId, pointsEarned);
      console.log(`[GAMIFICATION] Auto-awarded ${pointsEarned} points to ${loanOfficerId}`);
      
      // Check for badge unlocks after points awarded
      await checkAndUnlockBadges(organizationId, loanOfficerId);
    } else {
      console.log(`[GAMIFICATION] Event pending admin approval (${pointsEarned} > ${rule.autoApprovalThreshold})`);
    }

  } catch (error) {
    console.error(`[GAMIFICATION] Error awarding points for ${actionType}:`, error);
    // Don't fail the main action if gamification fails
  }
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Authentication middleware
  const requireAuth = (req: any, res: any, next: any) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    next();
  };

  // Store for one-time password setup tokens (expires after 10 minutes)
  const passwordSetupTokens = new Map<string, { userId: string, loanOfficerId: string, expires: number }>();

  // Clean up expired tokens every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [token, data] of Array.from(passwordSetupTokens.entries())) {
      if (data.expires < now) {
        passwordSetupTokens.delete(token);
      }
    }
  }, 5 * 60 * 1000);

  const requireAdmin = (req: any, res: any, next: any) => {
    if (!req.session?.user?.isAdmin) {
      return res.status(403).json({ message: "Admin access required" });
    }
    next();
  };
  
  // Middleware to ensure user has an organization (super admin with org can access)
  const requireOrganization = (req: any, res: any, next: any) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "Authentication required" });
    }
    if (!req.session.user.organizationId) {
      return res.status(403).json({ message: "This route requires an organization context" });
    }
    next();
  };
  
  // Middleware to require super admin access
  const requireSuperAdmin = (req: any, res: any, next: any) => {
    if (!req.session?.user?.isSuperAdmin) {
      return res.status(403).json({ message: "Super admin access required" });
    }
    next();
  };
  
  // Authentication routes
  
  // Check if loan officer exists
  app.get("/api/auth/check/:loanOfficerId", async (req, res) => {
    try {
      const { loanOfficerId } = req.params;
      const { organizationId } = req.query;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      if (!organizationId || typeof organizationId !== 'string') {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      
      const user = await storage.getUserByLoanOfficerId(organizationId, loanOfficerId);
      
      res.json({ 
        exists: !!user,
        loanOfficerId: loanOfficerId,
        needsPasswordSetup: user ? !user.password : false
      });
    } catch (error) {
      console.error("Check user error:", error);
      res.status(500).json({ message: "Failed to check user" });
    }
  });

  // Signup route (with rate limiting)
  app.post("/api/auth/signup", authLimiter, async (req, res) => {
    try {
      const { loanOfficerId, password, name, organizationId } = req.body;
      
      if (!loanOfficerId || !password || !name || !organizationId) {
        return res.status(400).json({ message: "Loan Officer ID, password, name, and organization ID are required" });
      }
      
      // Block reserved admin identifiers from signup
      if (loanOfficerId.toUpperCase() === 'ADMIN' || loanOfficerId.toUpperCase() === 'ADMINISTRATOR') {
        return res.status(400).json({ message: "Reserved identifier cannot be used for signup" });
      }
      
      // Check if user already exists in this organization
      const existingUser = await storage.getUserByLoanOfficerId(organizationId, loanOfficerId);
      if (existingUser) {
        return res.status(409).json({ message: "Loan Officer ID already exists in this organization" });
      }
      
      const user = await storage.createUser({
        loanOfficerId,
        password,
        name,
        organizationId
      });
      
      // Create session after signup
      req.session.user = {
        id: user.id,
        organizationId: user.organizationId,
        loanOfficerId: user.loanOfficerId,
        name: user.name,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin
      };
      
      res.status(201).json({ 
        user: { 
          id: user.id, 
          organizationId: user.organizationId,
          loanOfficerId: user.loanOfficerId, 
          name: user.name,
          isAdmin: user.isAdmin,
          isSuperAdmin: user.isSuperAdmin
        } 
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ message: "Signup failed" });
    }
  });

  // Login route (with rate limiting)
  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const { loanOfficerId, password, organizationId } = req.body;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      
      const user = await storage.getUserByLoanOfficerId(organizationId, loanOfficerId);
      if (!user) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Check if user needs to set up password for the first time
      if (!user.password) {
        // Generate a secure one-time setup token
        const setupToken = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + (10 * 60 * 1000); // 10 minutes
        
        passwordSetupTokens.set(setupToken, {
          userId: user.id,
          loanOfficerId: user.loanOfficerId,
          expires
        });
        
        return res.status(423).json({ 
          message: "Password setup required", 
          needsPasswordSetup: true,
          setupToken
        });
      }
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      if (!user.password || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Create session
      req.session.user = {
        id: user.id,
        organizationId: user.organizationId,
        loanOfficerId: user.loanOfficerId,
        name: user.name,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin
      };
      
      // Update login streak (don't fail login if this fails)
      try {
        if (user.organizationId) {
          await storage.updateUserLoginStreak(user.organizationId, user.loanOfficerId);
        }
      } catch (streakError) {
        console.error("Error updating login streak:", streakError);
      }
      
      res.json({ 
        user: { 
          id: user.id, 
          organizationId: user.organizationId,
          loanOfficerId: user.loanOfficerId, 
          name: user.name,
          isAdmin: user.isAdmin,
          isSuperAdmin: user.isSuperAdmin
        } 
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Super Admin Login route (with rate limiting) - now uses organization login
  app.post("/api/auth/super-admin-login", authLimiter, async (req, res) => {
    try {
      const { loanOfficerId, password, organizationId } = req.body;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      if (!password) {
        return res.status(400).json({ message: "Password is required" });
      }
      
      if (!organizationId) {
        return res.status(400).json({ message: "Organization ID is required" });
      }
      
      // Super admin lookup with AKILA organization
      const user = await storage.getUserByLoanOfficerId(organizationId, loanOfficerId);
      if (!user || !user.isSuperAdmin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      if (!user.password || !(await verifyPassword(password, user.password))) {
        return res.status(401).json({ message: "Invalid credentials" });
      }
      
      // Create session for super admin with organization context
      req.session.user = {
        id: user.id,
        organizationId: user.organizationId,
        loanOfficerId: user.loanOfficerId,
        name: user.name,
        isAdmin: user.isAdmin,
        isSuperAdmin: true
      };
      
      // Update login streak (don't fail login if this fails)
      try {
        if (user.organizationId) {
          await storage.updateUserLoginStreak(user.organizationId, user.loanOfficerId);
        }
      } catch (streakError) {
        console.error("Error updating login streak:", streakError);
      }
      
      res.json({ 
        user: { 
          id: user.id, 
          organizationId: user.organizationId,
          loanOfficerId: user.loanOfficerId, 
          name: user.name,
          isAdmin: user.isAdmin,
          isSuperAdmin: true
        } 
      });
    } catch (error) {
      console.error("Super admin login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Set password for first-time login (secured with setup token, with rate limiting)
  app.post("/api/auth/set-password", authLimiter, async (req, res) => {
    try {
      const { setupToken, password } = req.body;
      
      if (!setupToken || !password) {
        return res.status(400).json({ message: "Setup token and password are required" });
      }
      
      // Validate setup token
      const tokenData = passwordSetupTokens.get(setupToken);
      if (!tokenData) {
        return res.status(401).json({ message: "Invalid or expired setup token" });
      }
      
      // Check if token is expired
      if (tokenData.expires < Date.now()) {
        passwordSetupTokens.delete(setupToken);
        return res.status(401).json({ message: "Setup token has expired" });
      }
      
      const user = await storage.getUser(tokenData.userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Only allow password setting if user doesn't have a password yet
      if (user.password) {
        passwordSetupTokens.delete(setupToken);
        return res.status(409).json({ message: "Password already set. Use login instead." });
      }
      
      // Update user password
      await storage.updateUserPassword(user.id, password);
      
      // Delete the used token
      passwordSetupTokens.delete(setupToken);
      
      // Create session automatically after setting password
      req.session.user = {
        id: user.id,
        organizationId: user.organizationId,
        loanOfficerId: user.loanOfficerId,
        name: user.name,
        isAdmin: user.isAdmin,
        isSuperAdmin: user.isSuperAdmin
      };
      
      res.json({ 
        user: { 
          id: user.id, 
          organizationId: user.organizationId,
          loanOfficerId: user.loanOfficerId, 
          name: user.name,
          isAdmin: user.isAdmin,
          isSuperAdmin: user.isSuperAdmin
        } 
      });
    } catch (error) {
      console.error("Set password error:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Logout route
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Logout error:", err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.clearCookie('connect.sid');
      res.json({ message: "Logged out successfully" });
    });
  });

  // Get current user session (validate session)
  app.get("/api/auth/me", (req, res) => {
    if (!req.session?.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    
    res.json({ user: req.session.user });
  });

  // Debug route to show available loan officer IDs (Admin only)
  app.get("/api/loan-officers", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const officerStats = await storage.getUniqueLoanOfficers(organizationId);
      const totalClients = officerStats.reduce((sum, officer) => sum + officer.clientCount, 0);
      
      res.json({
        totalClients,
        availableOfficers: officerStats
      });
    } catch (error) {
      console.error("Error fetching loan officers:", error);
      res.status(500).json({ message: "Failed to fetch loan officers" });
    }
  });

  // Diagnostic route to show loan officer account status (Admin only)
  app.get("/api/loan-officers/status", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const officerStats = await storage.getUniqueLoanOfficers(organizationId);
      
      const officerStatus = [];
      let usersPresent = 0;
      let usersMissing = 0;
      let totalClients = 0;
      
      for (const officer of officerStats) {
        const user = await storage.getUserByLoanOfficerId(organizationId, officer.loanOfficerId);
        const hasUser = !!user;
        
        officerStatus.push({
          loanOfficerId: officer.loanOfficerId,
          hasUser,
          clientCount: officer.clientCount,
          userName: hasUser ? user.name : null
        });
        
        totalClients += officer.clientCount;
        
        if (hasUser) {
          usersPresent++;
        } else {
          usersMissing++;
        }
      }
      
      // Separate arrays for easier processing
      const withUser = officerStatus.filter(o => o.hasUser);
      const withoutUser = officerStatus.filter(o => !o.hasUser);
      
      res.json({
        summary: {
          totalOfficers: officerStats.length,
          usersPresent,
          usersMissing,
          totalClients
        },
        officers: officerStatus,
        withUser,
        withoutUser
      });
    } catch (error) {
      console.error("Error fetching loan officer status:", error);
      res.status(500).json({ message: "Failed to fetch loan officer status" });
    }
  });

  // Admin endpoint to auto-provision missing user accounts
  app.post("/api/auth/provision-missing-users", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const officerStats = await storage.getUniqueLoanOfficers(organizationId);
      
      // Use the reusable provisioning function
      const { createdUsers, errors } = await provisionMissingUsers(organizationId);
      
      res.json({
        success: true,
        summary: {
          totalOfficers: officerStats.length,
          previouslyMissing: createdUsers.length,
          successfullyCreated: createdUsers.length,
          errors: errors.length
        },
        createdUsers: createdUsers, // Contains temporary passwords - handle securely!
        errors: errors
      });
      
    } catch (error) {
      console.error("Error provisioning users:", error);
      res.status(500).json({ message: "Failed to provision user accounts" });
    }
  });

  // Clean action suggestions (remove old multi-suggestion data)
  app.post("/api/clean-suggestions/:loanOfficerId", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      const allClients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
      let cleanedCount = 0;
      
      for (const client of allClients) {
        await storage.updateClient(organizationId, client.id, {
          actionSuggestions: [] // Clear all existing suggestions
        });
        cleanedCount++;
      }
      
      res.json({
        message: `Cleaned action suggestions for ${cleanedCount} clients`,
        cleaned: cleanedCount
      });
    } catch (error) {
      console.error("Clean suggestions error:", error);
      res.status(500).json({ message: "Failed to clean suggestions" });
    }
  });

  // AI Suggestions route - Dynamic weight-based algorithm
  app.post("/api/generate-suggestions/:loanOfficerId", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      // Get loan officer's current weight settings
      const settings = await storage.getOrganizationSettings(organizationId);
      
      // Get clients for this loan officer
      const allClients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
      
      if (allClients.length === 0) {
        return res.json({ message: "No clients found for this loan officer", updated: 0 });
      }
      
      // Dynamic weight variables from settings (match ML service defaults: 25/50/25)
      const feedbackWeight = settings?.urgencyFeedbackScoreWeight || 25;
      const riskWeight = settings?.urgencyRiskScoreWeight || 25;
      const daysWeight = settings?.urgencyDaysSinceVisitWeight || 50;
      
      // Calculate dynamic thresholds based on weights
      const feedbackInfluence = feedbackWeight / 100; // 0.25 default
      const riskInfluence = riskWeight / 100; // 0.25 default
      
      // Dynamic thresholds: higher feedback weight = more calls, higher risk weight = more visits
      const callThreshold = 3.5 - (feedbackInfluence * 1.0); // 2.5-3.5 range (lower = easier to get calls)
      const visitThreshold = 2.5 - (feedbackInfluence * 0.5); // 2.0-2.5 range
      const riskThreshold = 70 - (riskInfluence * 20); // 50-70 range
      
      console.log(`[DYNAMIC WEIGHTS] Officer ${loanOfficerId} - Feedback: ${feedbackWeight}%, Risk: ${riskWeight}%, Days: ${daysWeight}%`);
      console.log(`[DYNAMIC THRESHOLDS] Call: ${callThreshold.toFixed(1)}, Visit: ${visitThreshold.toFixed(1)}, Risk: ${riskThreshold.toFixed(0)}`);
      
      // Generate sophisticated AI suggestions for most urgent clients using dynamic weights
      let updatedCount = 0;
      // Focus on the 20 most urgent clients (sorted by urgency score)
      const sortedByUrgency = allClients.sort((a, b) => (b.compositeUrgency || 0) - (a.compositeUrgency || 0));
      const clientsToUpdate = sortedByUrgency.slice(0, 20);
      
      for (const client of clientsToUpdate) {
        const feedbackScore = client.feedbackScore || 3;
        let singleSuggestion = null; // Only ONE suggestion per client
        
        // Helper function to determine urgency based on composite urgency score
        const getUrgencyTiming = (urgencyScore: number): 'immediate' | 'within_3_days' | 'within_week' | 'within_month' => {
          if (urgencyScore >= 80) return 'immediate';
          if (urgencyScore >= 60) return 'within_3_days';
          if (urgencyScore >= 40) return 'within_week';
          return 'within_month';
        };
        
        const clientUrgency = client.compositeUrgency || 0;
        const urgencyTiming = getUrgencyTiming(clientUrgency);
        
        // DYNAMIC FEEDBACK-FIRST CONTACT METHOD - ONE CLEAR RECOMMENDATION
        if (feedbackScore >= callThreshold) {
          // High feedback: Phone call sufficient (threshold based on feedback weight)
          singleSuggestion = {
            action: 'call' as const,
            description: 'Phone call sufficient - client responsive to communication',
            urgency: urgencyTiming,
            reasoning: `High feedback score (${feedbackScore}/5, threshold: ${callThreshold.toFixed(1)}) indicates cooperative client - phone contact effective for payment follow-up. Urgency: ${urgencyTiming} (score: ${clientUrgency.toFixed(1)}/100). Weight settings favor communication-based approach (${feedbackWeight}% feedback influence).`
          };
        } else if (feedbackScore <= visitThreshold) {
          // Low feedback: Visit required (threshold based on feedback weight)
          singleSuggestion = {
            action: 'visit' as const,
            description: 'In-person visit required - difficult client contact',
            urgency: urgencyTiming,
            reasoning: `Low feedback score (${feedbackScore}/5, threshold: ${visitThreshold.toFixed(1)}) indicates poor communication - face-to-face meeting needed. Urgency: ${urgencyTiming} (score: ${clientUrgency.toFixed(1)}/100, ${client.lateDays} days overdue). Weight settings emphasize personal contact for low-feedback clients.`
          };
        } else {
          // Medium feedback: Risk-based tiebreaker using dynamic risk threshold
          if (client.riskScore > riskThreshold || client.lateDays > 45) {
            singleSuggestion = {
              action: 'visit' as const,
              description: 'High-risk client requires in-person assessment',
              urgency: urgencyTiming,
              reasoning: `Medium feedback score (${feedbackScore}/5) with high risk (${client.riskScore.toFixed(0)} > ${riskThreshold.toFixed(0)}) or extended delays (${client.lateDays} days) requires personal consultation. Urgency: ${urgencyTiming} (score: ${clientUrgency.toFixed(1)}/100). Risk weight (${riskWeight}%) influences visit recommendation.`
            };
          } else {
            singleSuggestion = {
              action: 'call' as const,
              description: 'Phone call recommended for moderate-risk follow-up',
              urgency: urgencyTiming,
              reasoning: `Medium feedback score (${feedbackScore}/5) with moderate risk (${client.riskScore.toFixed(0)} ≤ ${riskThreshold.toFixed(0)}) allows phone contact. Urgency: ${urgencyTiming} (score: ${clientUrgency.toFixed(1)}/100, ${client.lateDays} days overdue). Current weight settings support call-first approach.`
            };
          }
        }
        
        // Update client with single clear suggestion
        await storage.updateClient(organizationId, client.id, {
          actionSuggestions: singleSuggestion ? [singleSuggestion] : []
        });
        updatedCount++;
      }
      
      res.json({ 
        message: `Generated AI suggestions for ${updatedCount} most urgent clients using dynamic weights (F:${feedbackWeight}% R:${riskWeight}% D:${daysWeight}%)`,
        updated: updatedCount,
        total: allClients.length,
        mostUrgentProcessed: Math.min(20, allClients.length),
        thresholds: {
          callThreshold: callThreshold.toFixed(1),
          visitThreshold: visitThreshold.toFixed(1), 
          riskThreshold: riskThreshold.toFixed(0)
        }
      });
    } catch (error) {
      console.error("Generate suggestions error:", error);
      res.status(500).json({ message: "Failed to generate AI suggestions" });
    }
  });

  // Client routes
  // Get single client by clientId (must be before the loan officer route to avoid conflicts)
  app.get("/api/client/:clientId", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { clientId } = req.params;
      
      if (!clientId) {
        return res.status(400).json({ message: "Client ID is required" });
      }
      
      const client = await storage.getClientByClientId(organizationId, clientId);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      res.json(client);
    } catch (error) {
      console.error("Error fetching client:", error);
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  app.get("/api/clients/:loanOfficerId", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      const user = req.session.user;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      // If user is an ADMIN, return all clients in the organization
      // Otherwise, return clients for the specific loan officer
      let clients;
      if (user.isAdmin) {
        console.log(`[ADMIN] Fetching all clients for organization ${organizationId}`);
        clients = await storage.getAllClients(organizationId);
      } else {
        console.log(`[LOAN OFFICER] Fetching clients for officer ${loanOfficerId}`);
        clients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
      }
      
      console.log(`[DEBUG] Clients found for ${loanOfficerId} (isAdmin: ${user.isAdmin}): ${clients.length}`);
      
      res.json(clients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  app.post("/api/clients/feedback", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const validatedData = updateClientFeedbackSchema.parse(req.body);
      const updatedClient = await storage.updateClientFeedback(organizationId, validatedData);
      
      if (!updatedClient) {
        return res.status(404).json({ message: "Client not found" });
      }

      console.log(`[FEEDBACK UPDATE] Client ${updatedClient.name} feedback updated - recalculating urgency scores`);

      // Get current settings for this organization to use dynamic weights
      console.log(`[FEEDBACK UPDATE] Looking up settings for organization ${organizationId}`);
      const settings = await storage.getOrganizationSettings(organizationId);
      
      if (settings) {
        // Recalculate urgency scores with current weights since feedback changed
        await recalculateUrgencyScoresWithWeightsGlobal(settings);
        console.log(`[FEEDBACK UPDATE] Urgency scores recalculated for officer ${updatedClient.loanOfficerId}`);
      } else {
        // Fallback to classification-only update if settings not found
        console.warn(`[FEEDBACK UPDATE] No settings found for organization ${organizationId}, using classification fallback`);
        await recalculateUrgencyClassifications(organizationId, updatedClient.loanOfficerId);
      }

      // Award points for high NPS feedback (feedbackScore >= 4 = NPS promoter)
      if (updatedClient.feedbackScore && updatedClient.feedbackScore >= 4) {
        await awardPointsForAction(
          organizationId,
          updatedClient.loanOfficerId,
          'high_nps_score',
          `Received high NPS feedback (${updatedClient.feedbackScore}/5) from client ${updatedClient.name}`,
          { clientId: updatedClient.id, clientName: updatedClient.name, npsScore: updatedClient.feedbackScore }
        );
      }
      
      // Return the updated client with fresh urgency score
      const refreshedClient = await storage.getClient(organizationId, updatedClient.id);
      res.json(refreshedClient);
    } catch (error) {
      console.error("Error updating client feedback:", error);
      res.status(400).json({ message: "Failed to update client feedback" });
    }
  });

  // Update client urgency score endpoint
  app.patch("/api/clients/:clientId/urgency", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { clientId } = req.params;
      const { urgencyScore, urgencyClassification } = req.body;
      
      if (!clientId || urgencyScore === undefined) {
        return res.status(400).json({ message: "Client ID and urgency score are required" });
      }
      
      // Find client by clientId
      const allClients = await storage.getAllClients(organizationId);
      const client = allClients.find(c => c.clientId === clientId);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Determine classification based on score if not provided
      let classification = urgencyClassification;
      if (!classification) {
        if (urgencyScore >= 60) {
          classification = 'Extremely Urgent';
        } else if (urgencyScore >= 40) {
          classification = 'Urgent';
        } else if (urgencyScore >= 20) {
          classification = 'Moderately Urgent';
        } else {
          classification = 'Low Urgency';
        }
      }
      
      // Update urgency score and classification
      const updatedClient = await storage.updateClient(organizationId, client.id, {
        compositeUrgency: urgencyScore,
        urgencyClassification: classification
      });
      
      if (!updatedClient) {
        return res.status(500).json({ message: "Failed to update client urgency" });
      }
      
      console.log(`[URGENCY SYNC] Updated ${clientId}: score ${urgencyScore.toFixed(1)}, classification "${classification}"`);
      
      res.json({ 
        message: "Urgency score updated successfully",
        client: updatedClient
      });
    } catch (error) {
      console.error("Error updating client urgency:", error);
      res.status(500).json({ message: "Failed to update client urgency" });
    }
  });

  // General client update endpoint for recalculation
  app.put("/api/clients/:id", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      const updateData = req.body;
      
      if (!id) {
        return res.status(400).json({ message: "Client ID is required" });
      }
      
      // Update client with provided data (risk score, urgency score, classification, etc.)
      const updatedClient = await storage.updateClient(organizationId, id, updateData);
      
      if (!updatedClient) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      console.log(`[CLIENT UPDATE] Updated client ${id} with recalculated scores`);
      
      res.json(updatedClient);
    } catch (error) {
      console.error("Error updating client:", error);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // Admin dashboard routes for loan officer statistics  
  app.get("/api/admin/officers", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const statistics = await storage.getLoanOfficerStatistics(organizationId);
      res.json(statistics);
    } catch (error) {
      console.error("Error fetching loan officer statistics:", error);
      res.status(500).json({ message: "Failed to fetch loan officer statistics" });
    }
  });

  app.get("/api/admin/officers/:loanOfficerId", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      const details = await storage.getLoanOfficerDetails(organizationId, loanOfficerId);
      
      if (!details) {
        return res.status(404).json({ message: "Loan officer not found or has no clients" });
      }
      
      res.json(details);
    } catch (error) {
      console.error("Error fetching loan officer details:", error);
      res.status(500).json({ message: "Failed to fetch loan officer details" });
    }
  });

  // Visit routes
  app.get("/api/visits/:loanOfficerId", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      const visits = await storage.getVisitsByLoanOfficer(organizationId, loanOfficerId);
      res.json(visits);
    } catch (error) {
      console.error("Error fetching visits:", error);
      res.status(500).json({ message: "Failed to fetch visits" });
    }
  });

  app.get("/api/visits/:loanOfficerId/upcoming", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      const visits = await storage.getUpcomingVisits(organizationId, loanOfficerId);
      res.json(visits);
    } catch (error) {
      console.error("Error fetching upcoming visits:", error);
      res.status(500).json({ message: "Failed to fetch upcoming visits" });
    }
  });

  app.post("/api/visits", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      // Check if scheduledDate exists
      if (!req.body.scheduledDate) {
        return res.status(400).json({ message: "scheduledDate is required" });
      }
      
      // Convert scheduledDate to Date object before validation
      const requestData = {
        ...req.body,
        scheduledDate: new Date(req.body.scheduledDate),
      };
      
      const validatedData = insertVisitSchema.parse(requestData);
      const visit = await storage.createVisit({ ...validatedData, organizationId });
      res.json(visit);
    } catch (error) {
      console.error("Error creating visit:", error);
      res.status(400).json({ message: "Failed to create visit" });
    }
  });

  app.patch("/api/visits/:id/complete", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      const { notes } = req.body;
      
      if (!id) {
        return res.status(400).json({ message: "Visit ID is required" });
      }
      
      // First get the visit details to find the client
      const existingVisit = await storage.getVisit(organizationId, id);
      if (!existingVisit) {
        return res.status(404).json({ message: "Visit not found" });
      }
      
      const visit = await storage.updateVisit(organizationId, id, {
        status: "completed",
        notes: notes || null,
        completedAt: new Date(), // Record when the visit was actually completed
      });
      
      if (!visit) {
        return res.status(404).json({ message: "Visit not found" });
      }
      
      // Update client's lastVisitDate to current timestamp
      console.log(`[VISIT COMPLETED] Updating lastVisitDate for client ${visit.clientId}`);
      await storage.updateClient(organizationId, visit.clientId, {
        lastVisitDate: new Date()
      });
      
      // Get client to find their loan officer
      const client = await storage.getClient(organizationId, visit.clientId);
      if (client) {
        console.log(`[VISIT COMPLETED] Recalculating urgency for loan officer ${client.loanOfficerId}, client: ${client.name}`);
        
        // Get current settings for this organization
        console.log(`[VISIT COMPLETED] Looking up settings for organization ${organizationId}`);
        const settings = await storage.getOrganizationSettings(organizationId);
        
        if (settings) {
          try {
            // Recalculate urgency scores with current weights
            await recalculateUrgencyScoresWithWeightsGlobal(settings);
            
            // Regenerate action suggestions since urgency may have changed
            await regenerateActionSuggestions(organizationId, client.loanOfficerId);
            
            // Get updated client to verify changes
            const updatedClient = await storage.getClient(organizationId, visit.clientId);
            console.log(`[VISIT COMPLETED] Updated urgency scores and action suggestions for officer ${client.loanOfficerId}`);
            console.log(`[VISIT COMPLETED] Client ${client.name} urgency: ${updatedClient?.compositeUrgency?.toFixed(1)} (${updatedClient?.urgencyClassification})`);
          } catch (error) {
            console.error(`[VISIT COMPLETED] Failed to recalculate urgency for officer ${client.loanOfficerId}:`, error);
            // Don't fail the visit completion if urgency calculation fails
          }
        } else {
          console.warn(`[VISIT COMPLETED] No settings found for organization ${organizationId} - urgency scores may not be updated with custom weights`);
        }

        // Award points for visit completion
        await awardPointsForAction(
          organizationId,
          client.loanOfficerId,
          'visit_completed',
          `Completed visit for client ${client.name}`,
          { clientId: client.id, clientName: client.name, visitId: visit.id }
        );

        // Update daily streak history
        try {
          await storage.upsertStreakHistory(organizationId, client.loanOfficerId, new Date());
          console.log(`[STREAK] Updated streak history for officer ${client.loanOfficerId}`);
        } catch (error) {
          console.error(`[STREAK] Failed to update streak history:`, error);
          // Don't fail visit completion if streak update fails
        }
        
        // Broadcast visit completion to all connected clients for real-time updates
        broadcastVisitCompletion({
          visitId: visit.id,
          clientId: client.id,
          clientName: client.name,
          loanOfficerId: client.loanOfficerId
        }, organizationId);
      }
      
      res.json(visit);
    } catch (error) {
      console.error("Error completing visit:", error);
      res.status(500).json({ message: "Failed to complete visit" });
    }
  });

  app.delete("/api/visits/:id", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Visit ID is required" });
      }
      
      const success = await storage.deleteVisit(organizationId, id);
      
      if (!success) {
        return res.status(404).json({ message: "Visit not found" });
      }
      
      res.json({ message: "Visit deleted successfully" });
    } catch (error) {
      console.error("Error deleting visit:", error);
      res.status(500).json({ message: "Failed to delete visit" });
    }
  });

  // Phone call routes
  app.get("/api/phone-calls/:loanOfficerId", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      const phoneCalls = await storage.getPhoneCallsByLoanOfficer(organizationId, loanOfficerId);
      res.json(phoneCalls);
    } catch (error) {
      console.error("Error fetching phone calls:", error);
      res.status(500).json({ message: "Failed to fetch phone calls" });
    }
  });

  app.get("/api/phone-calls/:loanOfficerId/upcoming", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      if (!loanOfficerId) {
        return res.status(400).json({ message: "Loan Officer ID is required" });
      }
      
      const phoneCalls = await storage.getUpcomingPhoneCalls(organizationId, loanOfficerId);
      res.json(phoneCalls);
    } catch (error) {
      console.error("Error fetching upcoming phone calls:", error);
      res.status(500).json({ message: "Failed to fetch upcoming phone calls" });
    }
  });

  app.post("/api/phone-calls", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      // Check if scheduledDate exists
      if (!req.body.scheduledDate) {
        return res.status(400).json({ message: "scheduledDate is required" });
      }
      
      // Convert scheduledDate to Date object before validation
      const requestData = {
        ...req.body,
        scheduledDate: new Date(req.body.scheduledDate),
      };
      
      const validatedData = insertPhoneCallSchema.parse(requestData);
      const phoneCall = await storage.createPhoneCall({ ...validatedData, organizationId });
      res.json(phoneCall);
    } catch (error) {
      console.error("Error creating phone call:", error);
      res.status(400).json({ message: "Failed to create phone call" });
    }
  });

  app.patch("/api/phone-calls/:id/complete", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      const { notes, duration } = req.body;
      
      if (!id) {
        return res.status(400).json({ message: "Phone call ID is required" });
      }
      
      // First get the phone call details to find the client
      const existingCall = await storage.getPhoneCall(organizationId, id);
      if (!existingCall) {
        return res.status(404).json({ message: "Phone call not found" });
      }
      
      const phoneCall = await storage.updatePhoneCall(organizationId, id, {
        status: "completed",
        notes: notes || null,
        duration: duration || null,
      });
      
      if (!phoneCall) {
        return res.status(404).json({ message: "Phone call not found" });
      }
      
      // Update client's lastPhoneCallDate to current timestamp
      console.log(`[CALL COMPLETED] Updating lastPhoneCallDate for client ${phoneCall.clientId}`);
      await storage.updateClient(organizationId, phoneCall.clientId, {
        lastPhoneCallDate: new Date()
      });
      
      // Get client to find their loan officer
      const client = await storage.getClient(organizationId, phoneCall.clientId);
      if (client) {
        console.log(`[CALL COMPLETED] Recalculating urgency for loan officer ${client.loanOfficerId}, client: ${client.name}`);
        
        // Get current settings for this organization
        console.log(`[CALL COMPLETED] Looking up settings for organization ${organizationId}`);
        const settings = await storage.getOrganizationSettings(organizationId);
        
        if (settings) {
          try {
            // Recalculate urgency scores with current weights
            await recalculateUrgencyScoresWithWeightsGlobal(settings);
            
            // Regenerate action suggestions since urgency may have changed
            await regenerateActionSuggestions(organizationId, client.loanOfficerId);
            
            // Get updated client to verify changes
            const updatedClient = await storage.getClient(organizationId, phoneCall.clientId);
            console.log(`[CALL COMPLETED] Updated urgency scores and action suggestions for officer ${client.loanOfficerId}`);
            console.log(`[CALL COMPLETED] Client ${client.name} urgency: ${updatedClient?.compositeUrgency?.toFixed(1)} (${updatedClient?.urgencyClassification})`);
          } catch (error) {
            console.error(`[CALL COMPLETED] Failed to recalculate urgency for officer ${client.loanOfficerId}:`, error);
            // Don't fail the call completion if urgency calculation fails
          }
        } else {
          console.warn(`[CALL COMPLETED] No settings found for organization ${organizationId} - urgency scores may not be updated with custom weights`);
        }
      }
      
      res.json(phoneCall);
    } catch (error) {
      console.error("Error completing phone call:", error);
      res.status(500).json({ message: "Failed to complete phone call" });
    }
  });

  app.delete("/api/phone-calls/:id", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Phone call ID is required" });
      }
      
      const success = await storage.deletePhoneCall(organizationId, id);
      
      if (!success) {
        return res.status(404).json({ message: "Phone call not found" });
      }
      
      res.json({ message: "Phone call deleted successfully" });
    } catch (error) {
      console.error("Error deleting phone call:", error);
      res.status(500).json({ message: "Failed to delete phone call" });
    }
  });

  // Reset stuck sync status
  app.post("/api/sync/reset", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      // Clear any stuck sync status
      const lastSync = await storage.getLastDataSync(organizationId);
      if (lastSync && lastSync.status === 'in_progress') {
        await storage.updateDataSyncStatus(lastSync.id, 'error', 0, 'Reset by user - was stuck in progress');
        console.log("[DEBUG] Reset stuck sync status");
      }
      res.json({ message: "Sync status reset successfully" });
    } catch (error) {
      console.error("Error resetting sync:", error);
      res.status(500).json({ message: "Failed to reset sync status" });
    }
  });

  // Fix stale urgency classifications (Admin only)
  app.post("/api/admin/fix-classifications", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[CLASSIFICATION FIX] Admin requested urgency classification fix");
      const result = await storage.fixAllStaleClassifications();
      
      res.json({
        message: "Successfully fixed stale urgency classifications",
        ...result
      });
    } catch (error) {
      console.error("Error fixing classifications:", error);
      res.status(500).json({ message: "Failed to fix urgency classifications" });
    }
  });

  // Officer-specific data sync route (authenticated users only)
  app.post("/api/sync/officer-change", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      // Use authenticated user's loanOfficerId instead of client-supplied value
      const loanOfficerId = req.session.user.loanOfficerId;
      
      console.log(`[DEBUG] Starting officer-specific sync for: ${loanOfficerId}`);
      
      // Create a sync record for this officer
      const syncRecord = await storage.createDataSync({
        organizationId,
        lastSyncTime: new Date(),
        status: 'in_progress' as const,
        errorMessage: null,
        recordsProcessed: 0,
        progressPercentage: 0,
        currentStep: 'Preparing officer-specific sync...',
        provisionedUsers: null,
        provisioningErrors: null
      });
      
      // Run officer-specific sync in background
      setTimeout(async () => {
        try {
          await performOfficerSpecificSync(organizationId, loanOfficerId, syncRecord.id);
        } catch (error) {
          console.error('Officer-specific sync failed:', error);
          await storage.updateDataSyncStatus(syncRecord.id, 'error', 0);
        }
      }, 100);
      
      res.json({ 
        message: `Officer-specific sync started for ${loanOfficerId}`, 
        syncId: syncRecord.id 
      });
    } catch (error) {
      console.error("Officer sync error:", error);
      res.status(500).json({ message: "Officer sync failed", error: (error as Error).message });
    }
  });

  // Data sync routes
  // Configure multer for Excel file uploads
  const upload = multer({ 
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
      // Accept Excel files
      const allowedTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
        'application/vnd.ms-excel' // .xls
      ];
      
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    limits: {
      fileSize: 50 * 1024 * 1024 // 50MB limit
    }
  });

  // Excel file upload endpoint with rate limiting
  app.post("/api/sync/upload", requireAuth, requireOrganization, uploadLimiter, upload.single('excelFile'), async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      
      if (!req.file) {
        return res.status(400).json({ message: "No Excel file provided" });
      }

      const filePath = req.file.path;
      console.log(`[EXCEL UPLOAD] Processing uploaded file: ${req.file.originalname}`);

      // Record sync attempt with progress tracking
      const syncRecord = await storage.createDataSync({
        organizationId,
        lastSyncTime: new Date(),
        status: 'in_progress',
        recordsProcessed: 0,
        errorMessage: null,
        progressPercentage: 0,
        currentStep: 'Processing uploaded Excel file...',
        provisionedUsers: null,
        provisioningErrors: null
      });

      // Get organization settings to pass weights to TypeScript processor
      let customWeights: Partial<WeightSettings> | undefined = undefined;
      try {
        const orgSettings = await storage.getOrganizationSettings(organizationId);
        if (orgSettings) {
          customWeights = {
            riskLateDaysWeight: orgSettings.riskLateDaysWeight,
            riskOutstandingAtRiskWeight: orgSettings.riskOutstandingAtRiskWeight,
            riskParPerLoanWeight: orgSettings.riskParPerLoanWeight,
            riskReschedulesWeight: orgSettings.riskReschedulesWeight,
            riskPaymentConsistencyWeight: orgSettings.riskPaymentConsistencyWeight,
            riskDelayedInstalmentsWeight: orgSettings.riskDelayedInstalmentsWeight,
            urgencyRiskScoreWeight: orgSettings.urgencyRiskScoreWeight,
            urgencyDaysSinceVisitWeight: orgSettings.urgencyDaysSinceVisitWeight,
            urgencyFeedbackScoreWeight: orgSettings.urgencyFeedbackScoreWeight
          };
        }
      } catch (error) {
        console.log("Using default weights for calculations", error);
      }

      // Respond immediately with 202 Accepted
      res.status(202).json({
        success: true,
        message: 'Excel file upload started',
        filename: req.file.originalname,
        syncId: syncRecord.id
      });
      
      // Process Excel file with TypeScript in background
      (async () => {
        try {
          console.log("[EXCEL UPLOAD] Processing with TypeScript processor...");
          const result = await processExcelData(filePath, organizationId, customWeights);
          
          // Clean up uploaded file
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[EXCEL UPLOAD] Cleaned up uploaded file: ${filePath}`);
          }

          if (!result.success || !result.clients) {
            throw new Error(result.error || 'Processing failed');
          }

          // Log data quality report
          if (result.qualityReport) {
            const dq = result.qualityReport;
            console.log(`[DATA QUALITY] Upload - Errors: ${dq.errors?.length || 0}, Warnings: ${dq.warnings?.length || 0}`);
            if (dq.errors?.length > 0) {
              console.error('[DATA QUALITY ERRORS] Upload:', dq.errors);
            }
            if (dq.warnings?.length > 0) {
              console.warn('[DATA QUALITY WARNINGS] Upload:', dq.warnings);
            }
          }
          
          // Process clients using bulk operations
          const totalClients = result.clients.length;
          console.log(`[EXCEL UPLOAD] Processing ${totalClients} clients`);

          const processedCount = await storage.bulkUpsertClients(organizationId, result.clients);
          await storage.setProgressStatus(true, processedCount, totalClients, `Completed: ${processedCount}/${totalClients} clients processed`);
          
          console.log(`[EXCEL UPLOAD] Upload successful! Processed ${totalClients} clients`);
          
          // Automatically provision loan officer accounts for any new officers
          console.log(`[EXCEL UPLOAD] Auto-provisioning loan officer accounts...`);
          const { createdUsers, errors: provisioningErrors } = await provisionMissingUsers(organizationId);
          
          if (createdUsers.length > 0) {
            console.log(`[EXCEL UPLOAD] Auto-provisioned ${createdUsers.length} loan officer accounts`);
          }
          if (provisioningErrors.length > 0) {
            console.error(`[EXCEL UPLOAD] Provisioning errors:`, provisioningErrors);
          }
          
          // Build completion message including provisioning results
          let completionMessage = `Upload completed: ${totalClients} clients processed`;
          if (createdUsers.length > 0) {
            completionMessage += `. Auto-provisioned ${createdUsers.length} loan officer account(s)`;
          }
          if (provisioningErrors.length > 0) {
            completionMessage += `. ${provisioningErrors.length} provisioning error(s)`;
          }
          
          // Final success update with provisioning info
          await storage.createDataSync({
            organizationId,
            lastSyncTime: new Date(),
            status: 'success',
            recordsProcessed: totalClients,
            errorMessage: provisioningErrors.length > 0 ? provisioningErrors.join('; ') : null,
            progressPercentage: 100,
            currentStep: completionMessage,
            provisionedUsers: createdUsers.length > 0 ? createdUsers : null,
            provisioningErrors: provisioningErrors.length > 0 ? provisioningErrors : null,
          });
        } catch (error) {
          console.error("Excel upload processing error:", error);
          await storage.createDataSync({
            organizationId,
            lastSyncTime: new Date(),
            status: 'error',
            recordsProcessed: 0,
            errorMessage: `Processing error: ${error}`,
            progressPercentage: 0,
            currentStep: 'Error processing uploaded file',
            provisionedUsers: null,
            provisioningErrors: null
          });
        }
      })();

    } catch (error) {
      console.error("Excel upload error:", error);
      
      // Clean up uploaded file if error occurs
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      
      const organizationId = req.session.user?.organizationId || null;
      await storage.createDataSync({
        organizationId,
        lastSyncTime: new Date(),
        status: 'error',
        recordsProcessed: 0,
        errorMessage: `Upload failed: ${error}`,
        progressPercentage: 0,
        currentStep: 'Failed to process upload',
        provisionedUsers: null,
        provisioningErrors: null
      });
      
      res.status(500).json({ message: "Failed to process Excel upload" });
    }
  });

  // Manual sync endpoint - now uses TypeScript processor
  app.post("/api/sync", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { excelUrl } = req.body;
      const urlToProcess = excelUrl || process.env.EXCEL_DATA_URL || process.env.VITE_EXCEL_DATA_URL;
      
      if (!urlToProcess) {
        await storage.createDataSync({
          organizationId,
          lastSyncTime: new Date(),
          status: 'error',
          recordsProcessed: 0,
          errorMessage: 'No Excel data URL provided',
          progressPercentage: 0,
          currentStep: 'Error: No Excel URL provided',
          provisionedUsers: null,
          provisioningErrors: null
        });
        return res.status(400).json({ message: "Excel data URL is required" });
      }

      // Record sync attempt
      const syncRecord = await storage.createDataSync({
        organizationId,
        lastSyncTime: new Date(),
        status: 'in_progress',
        recordsProcessed: 0,
        errorMessage: null,
        progressPercentage: 0,
        currentStep: 'Starting data processing...',
        provisionedUsers: null,
        provisioningErrors: null
      });

      // Get organization settings for weights
      let customWeights: Partial<WeightSettings> | undefined = undefined;
      try {
        const orgSettings = await storage.getOrganizationSettings(organizationId);
        if (orgSettings) {
          customWeights = {
            riskLateDaysWeight: orgSettings.riskLateDaysWeight,
            riskOutstandingAtRiskWeight: orgSettings.riskOutstandingAtRiskWeight,
            riskParPerLoanWeight: orgSettings.riskParPerLoanWeight,
            riskReschedulesWeight: orgSettings.riskReschedulesWeight,
            riskPaymentConsistencyWeight: orgSettings.riskPaymentConsistencyWeight,
            riskDelayedInstalmentsWeight: orgSettings.riskDelayedInstalmentsWeight,
            urgencyRiskScoreWeight: orgSettings.urgencyRiskScoreWeight,
            urgencyDaysSinceVisitWeight: orgSettings.urgencyDaysSinceVisitWeight,
            urgencyFeedbackScoreWeight: orgSettings.urgencyFeedbackScoreWeight
          };
        }
      } catch (error) {
        console.log("Using default weights for calculations", error);
      }

      // Respond immediately
      res.status(202).json({
        message: "Data sync started",
        syncId: syncRecord.id
      });

      // Process in background
      (async () => {
        try {
          console.log("[MANUAL SYNC] Processing with TypeScript processor...");
          const result = await processExcelData(urlToProcess, organizationId, customWeights);
          
          if (!result.success || !result.clients) {
            throw new Error(result.error || 'Processing failed');
          }

          console.log(`[MANUAL SYNC] Processing ${result.clients.length} clients`);
          
          const processedCount = await storage.bulkUpsertClients(organizationId, result.clients);
          
          await storage.createDataSync({
            organizationId,
            lastSyncTime: new Date(),
            status: 'success',
            recordsProcessed: processedCount,
            errorMessage: null,
            progressPercentage: 100,
            currentStep: 'Sync completed successfully',
            provisionedUsers: null,
            provisioningErrors: null
          });

          console.log(`[MANUAL SYNC] Completed successfully: ${processedCount} clients`);
        } catch (error) {
          console.error("Manual sync processing error:", error);
          await storage.createDataSync({
            organizationId,
            lastSyncTime: new Date(),
            status: 'error',
            recordsProcessed: 0,
            errorMessage: `Processing error: ${error}`,
            progressPercentage: 0,
            currentStep: 'Error processing data',
            provisionedUsers: null,
            provisioningErrors: null
          });
        }
      })();

    } catch (error) {
      console.error("Error initiating data sync:", error);
      
      await storage.createDataSync({
        organizationId: req.session.user?.organizationId || null,
        lastSyncTime: new Date(),
        status: 'error',
        recordsProcessed: 0,
        errorMessage: `Failed to initiate sync: ${error}`,
        progressPercentage: 0,
        currentStep: 'Failed to start sync',
        provisionedUsers: null,
        provisioningErrors: null
      });
      
      res.status(500).json({ message: "Failed to initiate data sync" });
    }
  });

  app.get("/api/sync/status", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const lastSync = await storage.getLastDataSync(organizationId);
      res.json(lastSync || {
        lastSyncTime: null,
        status: 'never_synced',
        recordsProcessed: 0,
        errorMessage: 'No sync performed yet'
      });
    } catch (error) {
      console.error("Error getting sync status:", error);
      res.status(500).json({ message: "Failed to get sync status" });
    }
  });

  // Settings endpoints
  app.get("/api/settings", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      let settings = await storage.getOrganizationSettings(organizationId);
      
      // If no settings found, create default organization settings
      if (!settings) {
        settings = await storage.createOrganizationSettings({ organizationId });
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error fetching global settings:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Progress tracking endpoint
  app.get("/api/settings/progress", async (req, res) => {
    try {
      const progressStatus = await storage.getProgressStatus();
      res.json(progressStatus || { isRunning: false, progress: 0, total: 0, currentStep: '', startTime: null });
    } catch (error) {
      console.error("Error getting progress status:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  app.put("/api/settings", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const updateData = updateSettingsSchema.parse(req.body);
      
      // Validate that weights for each category sum to 100
      const riskWeights = [
        updateData.riskLateDaysWeight,
        updateData.riskOutstandingAtRiskWeight,
        updateData.riskParPerLoanWeight,
        updateData.riskReschedulesWeight,
        updateData.riskPaymentConsistencyWeight,
        updateData.riskDelayedInstalmentsWeight
      ].filter(w => w !== undefined);
      
      const urgencyWeights = [
        updateData.urgencyRiskScoreWeight,
        updateData.urgencyDaysSinceVisitWeight,
        updateData.urgencyFeedbackScoreWeight
      ].filter(w => w !== undefined);
      
      const feedbackWeights = [
        updateData.feedbackPaymentWillingnessWeight,
        updateData.feedbackFinancialSituationWeight,
        updateData.feedbackCommunicationQualityWeight,
        updateData.feedbackComplianceCooperationWeight,
        updateData.feedbackFutureOutlookWeight
      ].filter(w => w !== undefined);
      
      // Check if any complete category is being updated and validate it sums to 100
      if (riskWeights.length === 6) {
        const sum = riskWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.01) {
          return res.status(400).json({ error: "Risk score weights must sum to 100%" });
        }
      }
      
      if (urgencyWeights.length === 3) {
        const sum = urgencyWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.01) {
          return res.status(400).json({ error: "Urgency score weights must sum to 100%" });
        }
      }
      
      if (feedbackWeights.length === 5) {
        const sum = feedbackWeights.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 0.01) {
          return res.status(400).json({ error: "Feedback score weights must sum to 100%" });
        }
      }
      
      const settings = await storage.updateOrganizationSettings(organizationId, updateData);
      if (!settings) {
        return res.status(404).json({ error: "Settings not found" });
      }
      
      // Check if ANY weights were updated (risk, urgency, or feedback)
      const allWeightKeys = [
        'riskLateDaysWeight', 'riskOutstandingAtRiskWeight', 'riskParPerLoanWeight', 
        'riskReschedulesWeight', 'riskPaymentConsistencyWeight', 'riskDelayedInstalmentsWeight',
        'urgencyRiskScoreWeight', 'urgencyDaysSinceVisitWeight', 'urgencyFeedbackScoreWeight',
        'feedbackPaymentWillingnessWeight', 'feedbackFinancialSituationWeight', 
        'feedbackCommunicationQualityWeight', 'feedbackComplianceCooperationWeight', 'feedbackFutureOutlookWeight'
      ];
      const anyWeightsChanged = allWeightKeys.some(key => key in updateData);
      
      console.log(`[SETTINGS] Checking if any weights changed:`, { anyWeightsChanged, updateData });
      
      if (anyWeightsChanged) {
        console.log(`[SETTINGS] Weight settings changed. Broadcasting to all connected loan officers and triggering server-side recalculation...`);
        
        // Broadcast weight update to all connected loan officers via WebSocket (organization-specific)
        broadcastWeightUpdate(organizationId, settings);
        
        // ALSO trigger server-side recalculation for all clients to ensure scores are updated
        console.log(`[SETTINGS] Starting server-side recalculation with new weights...`);
        setTimeout(async () => {
          try {
            await recalculateUrgencyScoresWithWeightsGlobal(settings);
            console.log(`[SETTINGS] Server-side recalculation completed with new weights`);
          } catch (error) {
            console.error(`[SETTINGS] Server-side recalculation failed:`, error);
          }
        }, 100); // Small delay to ensure response is sent first
        
        console.log(`[SETTINGS] Hybrid processing: Both client-side (via WebSocket) and server-side recalculation triggered.`);
      }
      
      res.json(settings);
    } catch (error) {
      console.error("Error updating settings:", error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Helper function to get all clients (for internal use)
  async function getAllClients() {
    const memStorage = storage as any;
    return Array.from(memStorage.clients.values());
  }


  // Admin endpoint to recalculate scores for a specific loan officer
  app.post("/api/admin/recalculate/:loanOfficerId", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { loanOfficerId } = req.params;
      
      console.log(`[ADMIN] Starting score recalculation for loan officer: ${loanOfficerId}`);
      
      // Get current settings
      const settings = await storage.getOrganizationSettings(organizationId);
      if (!settings) {
        return res.status(500).json({ error: "Unable to retrieve current settings" });
      }
      
      // Get all clients for this specific loan officer
      const clients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
      
      if (clients.length === 0) {
        return res.json({ 
          message: `No clients found for loan officer ${loanOfficerId}`,
          clientsUpdated: 0
        });
      }
      
      console.log(`[ADMIN] Found ${clients.length} clients for officer ${loanOfficerId} - starting recalculation`);
      
      // Prepare weight settings for calculation
      const urgencyWeights = {
        risk_score: settings.urgencyRiskScoreWeight,
        days_since_interaction: settings.urgencyDaysSinceVisitWeight,
        feedback_score: settings.urgencyFeedbackScoreWeight
      };
      
      const totalWeight = urgencyWeights.risk_score + urgencyWeights.days_since_interaction + urgencyWeights.feedback_score;
      const normalizedWeights = {
        risk_score: urgencyWeights.risk_score / totalWeight,
        days_since_interaction: urgencyWeights.days_since_interaction / totalWeight,
        feedback_score: urgencyWeights.feedback_score / totalWeight
      };
      
      let updatedCount = 0;
      
      // Process each client and recalculate scores
      for (const client of clients) {
        try {
          // Calculate risk score using client-side logic (simplified for admin use)
          const riskFactors = [
            { value: client.lateDays || 0, maxThreshold: 90, weight: settings.riskLateDaysWeight / 100 },
            { value: client.outstandingAtRisk || 0, maxThreshold: 10000, weight: settings.riskOutstandingAtRiskWeight / 100 },
            { value: client.parPerLoan || 0, maxThreshold: 1.0, weight: settings.riskParPerLoanWeight / 100 },
            { value: client.countReschedule || 0, maxThreshold: 5, weight: settings.riskReschedulesWeight / 100 },
            { value: client.paidInstalments || 0, maxThreshold: 50, weight: settings.riskPaymentConsistencyWeight / 100, inverse: true },
            { value: client.totalDelayedInstalments || 0, maxThreshold: 20, weight: settings.riskDelayedInstalmentsWeight / 100 }
          ];
          
          let riskScore = 0;
          for (const factor of riskFactors) {
            const normalizedValue = Math.min(factor.value / factor.maxThreshold, 1);
            const sigmoid = 1 / (1 + Math.exp(-6 * (normalizedValue - 0.5)));
            const scaledValue = factor.inverse ? (1 - sigmoid) * 100 : sigmoid * 100;
            riskScore += scaledValue * factor.weight;
          }
          riskScore = Math.max(0, Math.min(100, riskScore));
          
          // Calculate urgency score
          const daysSinceLastInteraction = client.lastVisitDate 
            ? Math.floor((Date.now() - new Date(client.lastVisitDate).getTime()) / (1000 * 60 * 60 * 24))
            : 30; // default
          
          const riskUrgency = Math.max(0, Math.min(100, riskScore));
          const daysUrgency = Math.min(100, (daysSinceLastInteraction / 180) * 100);
          const feedbackUrgency = Math.max(0, Math.min(100, (5 - (client.feedbackScore || 3)) * 25));
          
          const compositeUrgency = 
            (riskUrgency * normalizedWeights.risk_score) +
            (daysUrgency * normalizedWeights.days_since_interaction) +
            (feedbackUrgency * normalizedWeights.feedback_score);
          
          const finalUrgencyScore = Math.max(0, Math.min(100, Math.round(compositeUrgency * 10) / 10));
          
          // Determine urgency classification
          let urgencyClassification = "Low Urgency";
          if (finalUrgencyScore >= 60) urgencyClassification = "Extremely Urgent";
          else if (finalUrgencyScore >= 40) urgencyClassification = "Urgent";
          else if (finalUrgencyScore >= 20) urgencyClassification = "Moderately Urgent";
          
          // Update client with new scores
          await storage.updateClient(organizationId, client.id, {
            riskScore,
            compositeUrgency: finalUrgencyScore,
            urgencyClassification,
            urgencyBreakdown: {
              riskScore: {
                value: riskScore,
                scaledValue: riskUrgency,
                weight: settings.urgencyRiskScoreWeight,
                normalizedWeight: normalizedWeights.risk_score * 100,
                contribution: riskUrgency * normalizedWeights.risk_score
              },
              daysSinceInteraction: {
                value: daysSinceLastInteraction,
                scaledValue: daysUrgency,
                weight: settings.urgencyDaysSinceVisitWeight,
                normalizedWeight: normalizedWeights.days_since_interaction * 100,
                contribution: daysUrgency * normalizedWeights.days_since_interaction
              },
              feedbackScore: {
                value: client.feedbackScore || 3,
                scaledValue: feedbackUrgency,
                weight: settings.urgencyFeedbackScoreWeight,
                normalizedWeight: normalizedWeights.feedback_score * 100,
                contribution: feedbackUrgency * normalizedWeights.feedback_score
              }
            }
          });
          
          updatedCount++;
          
        } catch (error) {
          console.error(`[ADMIN] Error updating client ${client.id}:`, error);
        }
      }
      
      console.log(`[ADMIN] Successfully recalculated scores for ${updatedCount} clients for officer ${loanOfficerId}`);
      
      res.json({
        message: `Successfully recalculated scores for loan officer ${loanOfficerId}`,
        clientsUpdated: updatedCount,
        totalClients: clients.length
      });
      
    } catch (error) {
      console.error(`[ADMIN] Error recalculating scores for officer:`, error);
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Helper function to recalculate urgency scores AND classifications with custom weights for ALL officers
  async function recalculateUrgencyScoresWithWeightsGlobal(settings: any) {
    const organizationId = settings.organizationId || 'mfw'; // Get org ID from settings or use default
    const clients = await storage.getAllClients(organizationId);
    
    if (clients.length === 0) {
      console.log(`[WEIGHTS] No clients found - skipping global recalculation`);
      return;
    }
    
    console.log(`[WEIGHTS] Starting global recalculation: ${clients.length} clients across ALL officers with new weights`);
    console.log(`[WEIGHTS] Settings received:`, Object.keys(settings));
    
    // Initialize progress tracking
    await storage.setProgressStatus(true, 0, clients.length, 'Starting urgency recalculation...', new Date());
    
    try {
      // Recalculate urgency scores directly using the same formula as ML service
      const weights = {
        risk_score: settings.urgencyRiskScoreWeight || 25,
        days_since_interaction: settings.urgencyDaysSinceVisitWeight || 50,
        feedback_score: settings.urgencyFeedbackScoreWeight || 25
      };

      // Normalize weights to sum to 1.0 (same as ML service)
      const totalWeight = weights.risk_score + weights.days_since_interaction + weights.feedback_score;
      const normalizedWeights = {
        risk_score: weights.risk_score / totalWeight,
        days_since_interaction: weights.days_since_interaction / totalWeight,
        feedback_score: weights.feedback_score / totalWeight
      };

      console.log(`[WEIGHTS] Using normalized weights: Risk ${(normalizedWeights.risk_score * 100).toFixed(1)}%, Days ${(normalizedWeights.days_since_interaction * 100).toFixed(1)}%, Feedback ${(normalizedWeights.feedback_score * 100).toFixed(1)}%`);

      // Update clients with recalculated urgency scores in batches for progress tracking
      const batchSize = 100; // Process 100 clients at a time
      let processedCount = 0;
      
      for (let i = 0; i < clients.length; i += batchSize) {
        const batch = clients.slice(i, i + batchSize);
        
        // Update progress
        const currentStep = `Processing clients ${i + 1} to ${Math.min(i + batchSize, clients.length)} of ${clients.length}`;
        await storage.setProgressStatus(true, processedCount, clients.length, currentStep);
        
        let riskScoreRecalculations = 0;
        let urgencyScoreRecalculations = 0;
        let classificationChanges = 0;
        
        for (const client of batch) {
        // FIRST: Recalculate risk score with new risk weights if risk weights changed
        let newRiskScore = client.riskScore; // Default to existing score
        
        const riskWeightsProvided = [
          'riskLateDaysWeight', 'riskOutstandingAtRiskWeight', 'riskParPerLoanWeight',
          'riskReschedulesWeight', 'riskPaymentConsistencyWeight', 'riskDelayedInstalmentsWeight'
        ].some(key => key in settings);
        
        if (riskWeightsProvided) {
          // Recalculate risk score using new risk weights (same logic as client-side calculation)
          const riskWeights = {
            late_days: (settings.riskLateDaysWeight || 25) / 100,
            outstanding_at_risk: (settings.riskOutstandingAtRiskWeight || 20) / 100,
            par_per_loan: (settings.riskParPerLoanWeight || 20) / 100,
            reschedules: (settings.riskReschedulesWeight || 15) / 100,
            payment_consistency: (settings.riskPaymentConsistencyWeight || 10) / 100,
            delayed_instalments: (settings.riskDelayedInstalmentsWeight || 10) / 100
          };

          const riskFactors = {
            late_days_score: {
              value: client.lateDays || 0,
              weight: riskWeights.late_days,
              max_threshold: 90,
              inverse: false
            },
            outstanding_risk_score: {
              value: client.outstandingAtRisk || 0,
              weight: riskWeights.outstanding_at_risk,
              max_threshold: 10000,
              inverse: false
            },
            par_score: {
              value: client.parPerLoan || 0,
              weight: riskWeights.par_per_loan,
              max_threshold: 1.0,
              inverse: false
            },
            reschedule_score: {
              value: client.countReschedule || 0,
              weight: riskWeights.reschedules,
              max_threshold: 5,
              inverse: false
            },
            payment_consistency_score: {
              value: client.paidInstalments || 0,
              weight: riskWeights.payment_consistency,
              max_threshold: 50,
              inverse: true // Lower paid instalments = higher risk
            },
            delayed_instalments_score: {
              value: client.totalDelayedInstalments || 0,
              weight: riskWeights.delayed_instalments,
              max_threshold: 20,
              inverse: false
            }
          };

          let totalRiskScore = 0;
          Object.entries(riskFactors).forEach(([key, factor]) => {
            let normalizedValue = Math.min(factor.value, factor.max_threshold) / factor.max_threshold;
            
            if (factor.inverse) {
              normalizedValue = 1 - normalizedValue;
            }
            
            // Apply sigmoid transformation for smoother distribution (matching client-side logic)
            const sigmoidValue = 1 / (1 + Math.exp(-6 * (normalizedValue - 0.5)));
            const componentScore = sigmoidValue * 100 * factor.weight;
            totalRiskScore += componentScore;
          });

          newRiskScore = Math.max(1, Math.min(99, Math.round(totalRiskScore)));
          
          if (newRiskScore !== client.riskScore) {
            riskScoreRecalculations++;
          }
        }
        
        // Calculate days since last interaction (visits OR phone calls)
        const now = new Date();
        let daysSinceLastInteraction = 30; // Default for new clients
        
        const dates = [];
        if (client.lastVisitDate) dates.push(new Date(client.lastVisitDate));
        if (client.lastPhoneCallDate) dates.push(new Date(client.lastPhoneCallDate));
        
        if (dates.length > 0) {
          const mostRecent = new Date(Math.max(...dates.map(d => d.getTime())));
          daysSinceLastInteraction = Math.max(0, Math.floor((now.getTime() - mostRecent.getTime()) / (1000 * 60 * 60 * 24)));
        }

        // Scale components to 0-100 where 100 = most urgent (same as ML service)
        const riskUrgency = Math.min(Math.max(newRiskScore, 0), 100);
        const daysUrgency = Math.min(Math.max((daysSinceLastInteraction / 180.0) * 100, 0), 100);
        const feedbackUrgency = Math.min(Math.max((5 - client.feedbackScore) * 25, 0), 100);

        // Calculate weighted average (same formula as ML service)
        const newUrgencyScore = (
          riskUrgency * normalizedWeights.risk_score + 
          daysUrgency * normalizedWeights.days_since_interaction + 
          feedbackUrgency * normalizedWeights.feedback_score
        );

        // Calculate contributions for breakdown
        const riskContribution = riskUrgency * normalizedWeights.risk_score;
        const daysContribution = daysUrgency * normalizedWeights.days_since_interaction;
        const feedbackContribution = feedbackUrgency * normalizedWeights.feedback_score;

        // Create urgency breakdown data
        const urgencyBreakdown = {
          riskScore: {
            value: newRiskScore, // Use recalculated risk score
            scaledValue: riskUrgency,
            weight: weights.risk_score,
            normalizedWeight: normalizedWeights.risk_score * 100, // Show as percentage
            contribution: riskContribution
          },
          daysSinceInteraction: {
            value: daysSinceLastInteraction,
            scaledValue: daysUrgency,
            weight: weights.days_since_interaction,
            normalizedWeight: normalizedWeights.days_since_interaction * 100, // Show as percentage
            contribution: daysContribution
          },
          feedbackScore: {
            value: client.feedbackScore,
            scaledValue: feedbackUrgency,
            weight: weights.feedback_score,
            normalizedWeight: normalizedWeights.feedback_score * 100, // Show as percentage
            contribution: feedbackContribution
          }
        };

        // Determine classification based on new score (fixed thresholds)
        let classification = 'Low Urgency';
        if (newUrgencyScore >= 60) {
          classification = 'Extremely Urgent';
        } else if (newUrgencyScore >= 40) {
          classification = 'Urgent';
        } else if (newUrgencyScore >= 20) {
          classification = 'Moderately Urgent';
        }
        
        // Track changes for statistics
        if (Math.abs(newUrgencyScore - (client.compositeUrgency || 0)) > 0.1) {
          urgencyScoreRecalculations++;
        }
        
        if (client.urgencyClassification !== classification) {
          classificationChanges++;
          console.log(`[URGENCY FIX] ${client.name}: ${client.urgencyClassification} → ${classification} (score: ${newUrgencyScore.toFixed(1)})`);
        }
        
          await storage.updateClient(organizationId, client.id, {
            riskScore: newRiskScore, // Save recalculated risk score
            compositeUrgency: Math.round(newUrgencyScore * 10) / 10, // Round to 1 decimal
            urgencyClassification: classification,
            urgencyBreakdown: urgencyBreakdown,
          });
          
          processedCount++;
        }
        
        // Log batch statistics
        console.log(`[WEIGHTS] Batch ${Math.floor(i/batchSize) + 1}: Risk scores updated: ${riskScoreRecalculations}, Urgency scores updated: ${urgencyScoreRecalculations}, Classifications changed: ${classificationChanges}`);
        
        // Update progress after each batch
        await storage.setProgressStatus(true, processedCount, clients.length, currentStep);
      }
      
      // Final progress update
      await storage.setProgressStatus(true, clients.length, clients.length, 'Urgency recalculation completed!');
      console.log(`[WEIGHTS] Successfully recalculated urgency scores for ${clients.length} clients`);
      
      // Clear progress after completion
      setTimeout(async () => {
        await storage.clearProgressStatus();
      }, 3000); // Clear after 3 seconds
      
    } catch (error) {
      console.error(`[WEIGHTS] Error recalculating urgency scores:`, error);
      // Clear progress on error
      await storage.clearProgressStatus();
      // Fallback to classification-only update if ML service fails
      await recalculateUrgencyClassificationsGlobal(organizationId);
    }
  }

  // Helper function to recalculate urgency classifications globally (fallback)
  async function recalculateUrgencyClassificationsGlobal(organizationId: string) {
    const clients = await storage.getAllClients(organizationId);
    
    if (clients.length === 0) return;
    
    console.log(`[URGENCY FALLBACK] Recalculating urgency classifications for ${clients.length} clients using fixed thresholds`);
    
    // Use fixed thresholds (same as all other classification logic)
    let updates = { extremely: 0, urgent: 0, moderate: 0, low: 0 };
    
    for (const client of clients) {
      const urgencyScore = client.compositeUrgency || 0;
      let classification = 'Low Urgency';
      
      // Fixed thresholds: ≥60, ≥40, ≥20 (matches ML service, client-side, and all other functions)
      if (urgencyScore >= 60) {
        classification = 'Extremely Urgent';
        updates.extremely++;
      } else if (urgencyScore >= 40) {
        classification = 'Urgent';
        updates.urgent++;
      } else if (urgencyScore >= 20) {
        classification = 'Moderately Urgent';
        updates.moderate++;
      } else {
        classification = 'Low Urgency';
        updates.low++;
      }
      
      await storage.updateClient(organizationId, client.id, {
        urgencyClassification: classification,
      });
    }
    
    console.log(`[URGENCY FALLBACK] Completed: ${updates.extremely} Extremely Urgent, ${updates.urgent} Urgent, ${updates.moderate} Moderately Urgent, ${updates.low} Low Urgency (total: ${clients.length})`);
  }

  // Helper function to recalculate urgency classifications (fallback)
  async function recalculateUrgencyClassifications(organizationId: string, loanOfficerId: string) {
    const clients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
    
    if (clients.length === 0) return;
    
    // Sort by composite urgency (highest first)
    clients.sort((a, b) => b.compositeUrgency - a.compositeUrgency);
    
    // Assign classifications based on fixed urgency score thresholds 
    let updates = { extremely: 0, urgent: 0, moderate: 0, low: 0 };
    
    for (const client of clients) {
      const urgencyScore = client.compositeUrgency;
      let classification = 'Low Urgency';
      
      if (urgencyScore >= 60) {
        classification = 'Extremely Urgent';
        updates.extremely++;
      } else if (urgencyScore >= 40) {
        classification = 'Urgent';
        updates.urgent++;
      } else if (urgencyScore >= 20) {
        classification = 'Moderately Urgent';
        updates.moderate++;
      } else {
        classification = 'Low Urgency';
        updates.low++;
      }
      
      await storage.updateClient(organizationId, client.id, {
        urgencyClassification: classification,
      });
    }
    
    // Simplified logging - urgency classifications working properly
  }

  // Helper function to regenerate action suggestions with new weights for ALL officers
  async function regenerateActionSuggestionsGlobal(organizationId: string) {
    try {
      console.log(`[ACTION REGEN GLOBAL] Starting action suggestion regeneration for ALL officers in org ${organizationId}`);
      
      // Get all unique loan officer IDs for this organization
      const allClients = await storage.getAllClients(organizationId);
      const uniqueOfficerIds = Array.from(new Set(allClients.map(client => client.loanOfficerId)));
      
      console.log(`[ACTION REGEN GLOBAL] Found ${uniqueOfficerIds.length} unique officers to update`);
      
      // Process each officer
      for (const officerId of uniqueOfficerIds) {
        try {
          await regenerateActionSuggestions(organizationId, officerId);
          console.log(`[ACTION REGEN GLOBAL] Completed action suggestions for officer ${officerId}`);
        } catch (error) {
          console.error(`[ACTION REGEN GLOBAL] Failed for officer ${officerId}:`, error);
          // Continue with other officers even if one fails
        }
      }
      
      console.log(`[ACTION REGEN GLOBAL] Completed action suggestion regeneration for all officers`);
    } catch (error) {
      console.error(`[ACTION REGEN GLOBAL] Global action regeneration failed:`, error);
    }
  }

  // Helper function to regenerate action suggestions with new weights
  async function regenerateActionSuggestions(organizationId: string, loanOfficerId: string) {
    try {
      console.log(`[ACTION REGEN] Starting action suggestion regeneration for officer ${loanOfficerId}`);
      
      // Get current organization settings
      const settings = await storage.getOrganizationSettings(organizationId);
      const allClients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
      
      if (allClients.length === 0) {
        console.log(`[ACTION REGEN] No clients found for officer ${loanOfficerId}`);
        return;
      }
      
      // Dynamic weight variables from settings (match ML service defaults: 25/50/25)
      const feedbackWeight = settings?.urgencyFeedbackScoreWeight || 25;
      const riskWeight = settings?.urgencyRiskScoreWeight || 25;
      const daysWeight = settings?.urgencyDaysSinceVisitWeight || 50;
      
      // Calculate dynamic thresholds based on weights
      const feedbackInfluence = feedbackWeight / 100;
      const riskInfluence = riskWeight / 100;
      
      const callThreshold = 3.5 - (feedbackInfluence * 1.0); // 2.5-3.5 range (lower = easier to get calls)
      const visitThreshold = 2.5 - (feedbackInfluence * 0.5);
      const riskThreshold = 70 - (riskInfluence * 20);
      
      console.log(`[ACTION REGEN] Using dynamic thresholds - Call: ${callThreshold.toFixed(1)}, Visit: ${visitThreshold.toFixed(1)}, Risk: ${riskThreshold.toFixed(0)}`);
      
      // Focus on the 20 most urgent clients (sorted by urgency score)
      const sortedByUrgency = allClients.sort((a, b) => (b.compositeUrgency || 0) - (a.compositeUrgency || 0));
      const clientsToUpdate = sortedByUrgency.slice(0, 20);
      
      console.log(`[ACTION REGEN] Updating ${clientsToUpdate.length} most urgent clients out of ${allClients.length} total`);
      
      let updatedCount = 0;
      
      for (const client of clientsToUpdate) {
        const feedbackScore = client.feedbackScore || 3;
        let singleSuggestion = null; // Only ONE suggestion per client
        
        // DYNAMIC FEEDBACK-FIRST CONTACT METHOD - ONE CLEAR RECOMMENDATION
        if (feedbackScore >= callThreshold) {
          singleSuggestion = {
            action: 'call' as const,
            description: 'Phone call sufficient - client responsive to communication',
            urgency: client.lateDays > 30 ? 'immediate' as const : 'within_3_days' as const,
            reasoning: `High feedback score (${feedbackScore}/5, threshold: ${callThreshold.toFixed(1)}) indicates cooperative client - phone contact effective for payment follow-up. Weight settings favor communication-based approach (${feedbackWeight}% feedback influence).`
          };
        } else if (feedbackScore <= visitThreshold) {
          singleSuggestion = {
            action: 'visit' as const,
            description: 'In-person visit required - difficult client contact',
            urgency: client.lateDays > 30 ? 'within_3_days' as const : 'within_week' as const,
            reasoning: `Low feedback score (${feedbackScore}/5, threshold: ${visitThreshold.toFixed(1)}) indicates poor communication - face-to-face meeting needed for ${client.lateDays} days overdue. Weight settings emphasize personal contact for low-feedback clients.`
          };
        } else {
          // Medium feedback: Risk-based tiebreaker using dynamic risk threshold
          if (client.riskScore > riskThreshold || client.lateDays > 45) {
            singleSuggestion = {
              action: 'visit' as const,
              description: 'High-risk client requires in-person assessment',
              urgency: 'within_3_days' as const,
              reasoning: `Medium feedback score (${feedbackScore}/5) with high risk (${client.riskScore.toFixed(0)} > ${riskThreshold.toFixed(0)}) or extended delays (${client.lateDays} days) requires personal consultation. Risk weight (${riskWeight}%) influences visit recommendation.`
            };
          } else {
            singleSuggestion = {
              action: 'call' as const,
              description: 'Phone call recommended for moderate-risk follow-up',
              urgency: client.lateDays > 30 ? 'immediate' as const : 'within_3_days' as const,
              reasoning: `Medium feedback score (${feedbackScore}/5) with moderate risk (${client.riskScore.toFixed(0)} ≤ ${riskThreshold.toFixed(0)}) allows phone contact for ${client.lateDays} days overdue. Current weight settings support call-first approach.`
            };
          }
        }
        
        // Update client with single clear suggestion
        await storage.updateClient(organizationId, client.id, {
          actionSuggestions: singleSuggestion ? [singleSuggestion] : []
        });
        updatedCount++;
      }
      
      console.log(`[ACTION REGEN] Successfully regenerated ${updatedCount} action suggestions for most urgent clients with new weights (F:${feedbackWeight}% R:${riskWeight}% D:${daysWeight}%)`);
    } catch (error) {
      console.error(`[ACTION REGEN] Error regenerating action suggestions for officer ${loanOfficerId}:`, error);
    }
  }

  // Fast parallel urgency recalculation
  async function fastGlobalUrgencyRecalculation(organizationId: string) {
    try {
      console.log(`[DEBUG] Starting FAST parallel urgency recalculation for org ${organizationId}...`);
      
      // Get all unique loan officer IDs for this organization
      const allClients = await storage.getAllClients(organizationId);
      const loanOfficerIds = Array.from(new Set(allClients.map(client => client.loanOfficerId)));
      
      console.log(`[DEBUG] Processing ${loanOfficerIds.length} loan officers in parallel batches of 20`);
      
      // Process officers in parallel batches for speed
      const batchSize = 20;
      for (let i = 0; i < loanOfficerIds.length; i += batchSize) {
        const batch = loanOfficerIds.slice(i, i + batchSize);
        console.log(`[DEBUG] Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(loanOfficerIds.length/batchSize)} (${batch.length} officers)`);
        
        await Promise.all(batch.map(async (loanOfficerId) => {
          await recalculateUrgencyClassifications(organizationId, loanOfficerId);
        }));
        
        console.log(`[DEBUG] Completed batch ${Math.floor(i/batchSize) + 1}`);
      }
      
      console.log("[DEBUG] FAST parallel urgency recalculation completed!");
    } catch (error) {
      console.error("Error in fast urgency recalculation:", error);
    }
  }

  // Clean up temporary debugging code - urgency is now automatically handled during data sync

  // Start the data sync scheduler
  startDataSyncScheduler();

  // Snooze management endpoints
  app.put("/api/clients/:id/snooze", requireAuth, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      const { duration, loanOfficerId } = req.body; // duration in days: 1, 7, 30
      
      if (!id || !duration || !loanOfficerId) {
        return res.status(400).json({ message: "Client ID, duration, and loan officer ID are required" });
      }
      
      const snoozedUntil = new Date();
      snoozedUntil.setDate(snoozedUntil.getDate() + duration);
      
      const client = await storage.updateClient('mfw', id, {
        snoozedUntil: snoozedUntil,
        snoozedBy: loanOfficerId
      });
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      console.log(`[SNOOZE] Client ${client.name} snoozed for ${duration} days by officer ${loanOfficerId} until ${snoozedUntil.toISOString()}`);
      
      res.json(client);
    } catch (error) {
      console.error("Error snoozing client:", (error as Error).message);
      res.status(500).json({ message: "Failed to snooze client" });
    }
  });

  app.delete("/api/clients/:id/snooze", requireAuth, requireOrganization, async (req, res) => {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({ message: "Client ID is required" });
      }
      
      const client = await storage.updateClient('mfw', id, {
        snoozedUntil: null,
        snoozedBy: null
      });
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      console.log(`[UNSNOOZE] Client ${client.name} unsnoozed`);
      
      res.json(client);
    } catch (error) {
      console.error("Error unsnoozing client:", (error as Error).message);
      res.status(500).json({ message: "Failed to unsnooze client" });
    }
  });

  // =============================================================================
  // GAMIFICATION ROUTES
  // =============================================================================

  // Gamification Rules (Officers can view, Admin can modify)
  app.get("/api/gamification/rules", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Fetching all gamification rules");
      const rules = await storage.getAllGamificationRules(organizationId);
      res.json(rules);
    } catch (error) {
      console.error("Error fetching gamification rules:", error);
      res.status(500).json({ message: "Failed to fetch gamification rules" });
    }
  });

  app.post("/api/gamification/rules", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Creating new gamification rule");
      const validatedData = insertGamificationRuleSchema.parse(req.body);
      const rule = await storage.createGamificationRule({ ...validatedData, organizationId });
      console.log(`[GAMIFICATION] Created rule: ${rule.eventType} (${rule.pointValue} points)`);
      res.status(201).json(rule);
    } catch (error) {
      console.error("Error creating gamification rule:", error);
      if ((error as any)?.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid rule data", errors: (error as any).errors });
      }
      res.status(500).json({ message: "Failed to create gamification rule" });
    }
  });

  app.patch("/api/gamification/rules/:id", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Updating gamification rule ${id}`);
      
      const rule = await storage.updateGamificationRule(organizationId, id, req.body);
      
      if (!rule) {
        return res.status(404).json({ message: "Gamification rule not found" });
      }
      
      console.log(`[GAMIFICATION] Updated rule: ${rule.eventType}`);
      res.json(rule);
    } catch (error) {
      console.error("Error updating gamification rule:", error);
      res.status(500).json({ message: "Failed to update gamification rule" });
    }
  });

  app.delete("/api/gamification/rules/:id", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Deleting gamification rule ${id}`);
      
      const deleted = await storage.deleteGamificationRule(organizationId, id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Gamification rule not found" });
      }
      
      console.log(`[GAMIFICATION] Deleted rule ${id}`);
      res.json({ message: "Gamification rule deleted successfully" });
    } catch (error) {
      console.error("Error deleting gamification rule:", error);
      res.status(500).json({ message: "Failed to delete gamification rule" });
    }
  });

  // Gamification Seasons (Admin Only)
  app.get("/api/gamification/seasons", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Fetching all gamification seasons");
      const seasons = await storage.getAllGamificationSeasons(organizationId);
      res.json(seasons);
    } catch (error) {
      console.error("Error fetching gamification seasons:", error);
      res.status(500).json({ message: "Failed to fetch gamification seasons" });
    }
  });

  app.get("/api/gamification/seasons/active", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Fetching active gamification season");
      const season = await storage.getActiveGamificationSeason(organizationId);
      
      if (!season) {
        return res.status(404).json({ message: "No active gamification season found" });
      }
      
      res.json(season);
    } catch (error) {
      console.error("Error fetching active gamification season:", error);
      res.status(500).json({ message: "Failed to fetch active gamification season" });
    }
  });

  app.post("/api/gamification/seasons", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Creating new gamification season");
      const validatedData = insertGamificationSeasonSchema.parse(req.body);
      const season = await storage.createGamificationSeason({ ...validatedData, organizationId });
      console.log(`[GAMIFICATION] Created season: ${season.name}`);
      res.status(201).json(season);
    } catch (error) {
      console.error("Error creating gamification season:", error);
      if ((error as any)?.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid season data", errors: (error as any).errors });
      }
      res.status(500).json({ message: "Failed to create gamification season" });
    }
  });

  app.patch("/api/gamification/seasons/:id", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Updating gamification season ${id}`);
      
      const season = await storage.updateGamificationSeason(organizationId, id, req.body);
      
      if (!season) {
        return res.status(404).json({ message: "Gamification season not found" });
      }
      
      console.log(`[GAMIFICATION] Updated season: ${season.name}`);
      res.json(season);
    } catch (error) {
      console.error("Error updating gamification season:", error);
      res.status(500).json({ message: "Failed to update gamification season" });
    }
  });

  app.delete("/api/gamification/seasons/:id", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Deleting gamification season ${id}`);
      
      const deleted = await storage.deleteGamificationSeason(organizationId, id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Gamification season not found" });
      }
      
      console.log(`[GAMIFICATION] Deleted season ${id}`);
      res.json({ message: "Gamification season deleted successfully" });
    } catch (error) {
      console.error("Error deleting gamification season:", error);
      res.status(500).json({ message: "Failed to delete gamification season" });
    }
  });

  // Gamification Events
  app.get("/api/gamification/events", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Fetching gamification events");
      
      if (req.session.user.isAdmin) {
        const events = await storage.getAllGamificationEvents(organizationId);
        console.log(`[GAMIFICATION] Admin fetched ${events.length} total events`);
        res.json(events);
      } else {
        const events = await storage.getGamificationEventsByLoanOfficer(organizationId, req.session.user.loanOfficerId);
        console.log(`[GAMIFICATION] Officer ${req.session.user.loanOfficerId} fetched ${events.length} personal events`);
        res.json(events);
      }
    } catch (error) {
      console.error("Error fetching gamification events:", error);
      res.status(500).json({ message: "Failed to fetch gamification events" });
    }
  });

  app.get("/api/gamification/events/pending", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Fetching pending gamification events");
      const events = await storage.getPendingGamificationEvents(organizationId);
      console.log(`[GAMIFICATION] Found ${events.length} pending events`);
      res.json(events);
    } catch (error) {
      console.error("Error fetching pending gamification events:", error);
      res.status(500).json({ message: "Failed to fetch pending gamification events" });
    }
  });

  app.post("/api/gamification/events/:id/approve", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Approving gamification event ${id}`);
      
      const event = await storage.approveGamificationEvent(organizationId, id, req.session.user.loanOfficerId);
      
      if (!event) {
        return res.status(404).json({ message: "Gamification event not found" });
      }
      
      console.log(`[GAMIFICATION] Approved event ${id} for officer ${event.loanOfficerId}`);
      
      // Check for badge unlocks after event approval
      await checkAndUnlockBadges(organizationId, event.loanOfficerId);
      
      res.json(event);
    } catch (error) {
      console.error("Error approving gamification event:", error);
      res.status(500).json({ message: "Failed to approve gamification event" });
    }
  });

  app.post("/api/gamification/events/:id/reject", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Rejecting gamification event ${id}`);
      
      const event = await storage.rejectGamificationEvent(organizationId, id, req.session.user.loanOfficerId);
      
      if (!event) {
        return res.status(404).json({ message: "Gamification event not found" });
      }
      
      console.log(`[GAMIFICATION] Rejected event ${id} for officer ${event.loanOfficerId}`);
      res.json(event);
    } catch (error) {
      console.error("Error rejecting gamification event:", error);
      res.status(500).json({ message: "Failed to reject gamification event" });
    }
  });

  // Gamification Badges (Officers can view, Admin can modify)
  app.get("/api/gamification/badges", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Fetching all gamification badges");
      const badges = await storage.getAllGamificationBadges(organizationId);
      res.json(badges);
    } catch (error) {
      console.error("Error fetching gamification badges:", error);
      res.status(500).json({ message: "Failed to fetch gamification badges" });
    }
  });

  app.post("/api/gamification/badges", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log("[GAMIFICATION] Creating new gamification badge");
      const validatedData = insertGamificationBadgeSchema.parse(req.body);
      const badge = await storage.createGamificationBadge({ ...validatedData, organizationId });
      console.log(`[GAMIFICATION] Created badge: ${badge.name}`);
      res.status(201).json(badge);
    } catch (error) {
      console.error("Error creating gamification badge:", error);
      if ((error as any)?.name === 'ZodError') {
        return res.status(400).json({ message: "Invalid badge data", errors: (error as any).errors });
      }
      res.status(500).json({ message: "Failed to create gamification badge" });
    }
  });

  app.patch("/api/gamification/badges/:id", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Updating gamification badge ${id}`);
      
      const badge = await storage.updateGamificationBadge(organizationId, id, req.body);
      
      if (!badge) {
        return res.status(404).json({ message: "Gamification badge not found" });
      }
      
      console.log(`[GAMIFICATION] Updated badge: ${badge.name}`);
      res.json(badge);
    } catch (error) {
      console.error("Error updating gamification badge:", error);
      res.status(500).json({ message: "Failed to update gamification badge" });
    }
  });

  app.delete("/api/gamification/badges/:id", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const { id } = req.params;
      console.log(`[GAMIFICATION] Deleting gamification badge ${id}`);
      
      const deleted = await storage.deleteGamificationBadge(organizationId, id);
      
      if (!deleted) {
        return res.status(404).json({ message: "Gamification badge not found" });
      }
      
      console.log(`[GAMIFICATION] Deleted badge ${id}`);
      res.json({ message: "Gamification badge deleted successfully" });
    } catch (error) {
      console.error("Error deleting gamification badge:", error);
      res.status(500).json({ message: "Failed to delete gamification badge" });
    }
  });

  // Seed default badges for an organization
  app.post("/api/gamification/badges/seed", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log(`[GAMIFICATION] Seeding default badges for organization ${organizationId}`);
      
      // Check if organization already has badges (idempotence)
      const existingBadges = await storage.getAllGamificationBadges(organizationId);
      if (existingBadges.length > 0) {
        console.log(`[GAMIFICATION] Organization ${organizationId} already has ${existingBadges.length} badges - skipping seed`);
        return res.status(200).json({ 
          message: `Organization already has ${existingBadges.length} badges. No action needed.`,
          badges: existingBadges 
        });
      }
      
      const defaultBadges = [
        // Visit-based badges
        { name: "First Steps", description: "Complete your first client visit", icon: "👣", achievementType: "visits_count", thresholdValue: 1 },
        { name: "Getting Started", description: "Complete 5 client visits", icon: "🚀", achievementType: "visits_count", thresholdValue: 5 },
        { name: "Regular Visitor", description: "Complete 25 client visits", icon: "🎯", achievementType: "visits_count", thresholdValue: 25 },
        { name: "Frequent Flyer", description: "Complete 50 client visits", icon: "✈️", achievementType: "visits_count", thresholdValue: 50 },
        { name: "Visit Master", description: "Complete 100 client visits", icon: "🏆", achievementType: "visits_count", thresholdValue: 100 },
        { name: "Road Warrior", description: "Complete 250 client visits", icon: "🦸", achievementType: "visits_count", thresholdValue: 250 },
        
        // Points-based badges
        { name: "Point Collector", description: "Earn your first 100 points", icon: "⭐", achievementType: "points_total", thresholdValue: 100 },
        { name: "Rising Star", description: "Earn 500 points", icon: "🌟", achievementType: "points_total", thresholdValue: 500 },
        { name: "High Achiever", description: "Earn 1,000 points", icon: "💎", achievementType: "points_total", thresholdValue: 1000 },
        { name: "Point Master", description: "Earn 2,500 points", icon: "👑", achievementType: "points_total", thresholdValue: 2500 },
        { name: "Elite Performer", description: "Earn 5,000 points", icon: "🎖️", achievementType: "points_total", thresholdValue: 5000 },
        { name: "Legend", description: "Earn 10,000 points", icon: "🔥", achievementType: "points_total", thresholdValue: 10000 },
        
        // Streak-based badges
        { name: "Consistent", description: "Maintain a 3-day streak", icon: "📅", achievementType: "streak_days", thresholdValue: 3 },
        { name: "Dedicated", description: "Maintain a 7-day streak", icon: "📆", achievementType: "streak_days", thresholdValue: 7 },
        { name: "Committed", description: "Maintain a 14-day streak", icon: "🔥", achievementType: "streak_days", thresholdValue: 14 },
        { name: "Unstoppable", description: "Maintain a 30-day streak", icon: "⚡", achievementType: "streak_days", thresholdValue: 30 },
        { name: "Marathon Runner", description: "Maintain a 60-day streak", icon: "🏃", achievementType: "streak_days", thresholdValue: 60 },
        
        // NPS-based badges
        { name: "Client Favorite", description: "Receive 5 high NPS scores", icon: "😊", achievementType: "high_nps_count", thresholdValue: 5 },
        { name: "Customer Champion", description: "Receive 15 high NPS scores", icon: "❤️", achievementType: "high_nps_count", thresholdValue: 15 },
        { name: "Service Excellence", description: "Receive 30 high NPS scores", icon: "🌈", achievementType: "high_nps_count", thresholdValue: 30 },
        { name: "Client Hero", description: "Receive 50 high NPS scores", icon: "🦸‍♂️", achievementType: "high_nps_count", thresholdValue: 50 },
        
        // Rank-based badges
        { name: "Top 10", description: "Reach top 10 in the leaderboard", icon: "🥉", achievementType: "rank_achievement", thresholdValue: 10 },
        { name: "Top 5", description: "Reach top 5 in the leaderboard", icon: "🥈", achievementType: "rank_achievement", thresholdValue: 5 },
        { name: "Top 3", description: "Reach top 3 in the leaderboard", icon: "🥇", achievementType: "rank_achievement", thresholdValue: 3 },
        { name: "Champion", description: "Reach #1 in the leaderboard", icon: "👑", achievementType: "rank_achievement", thresholdValue: 1 },
      ];
      
      const createdBadges = [];
      for (const badgeData of defaultBadges) {
        const badge = await storage.createGamificationBadge({
          ...badgeData,
          organizationId,
          isActive: true
        });
        createdBadges.push(badge);
      }
      
      console.log(`[GAMIFICATION] Created ${createdBadges.length} default badges for organization ${organizationId}`);
      res.status(201).json({ 
        message: `Successfully created ${createdBadges.length} default badges`,
        badges: createdBadges 
      });
    } catch (error) {
      console.error("Error seeding gamification badges:", error);
      res.status(500).json({ message: "Failed to seed gamification badges" });
    }
  });

  // Leaderboard & User Stats (Authenticated Users)
  app.get("/api/gamification/leaderboard", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const scope = (req.query.scope as 'company' | 'branch') || 'company';
      const seasonId = req.query.seasonId as string | undefined;
      
      let branchId: string | undefined = undefined;
      
      if (scope === 'branch') {
        if (req.session?.user?.isAdmin && req.query.branchId) {
          branchId = req.query.branchId as string;
        } else {
          branchId = (req.session?.user as any)?.branchId || undefined;
        }
      }
      
      console.log(`[GAMIFICATION] Fetching leaderboard - scope: ${scope}, branchId: ${branchId}, seasonId: ${seasonId}`);
      
      const leaderboard = await storage.getLeaderboard(organizationId, scope, branchId, seasonId);
      
      console.log(`[GAMIFICATION] Retrieved ${leaderboard.length} leaderboard entries`);
      res.json(leaderboard);
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
  });

  app.get("/api/gamification/stats", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log(`[GAMIFICATION] Fetching stats for officer ${req.session.user.loanOfficerId}`);
      
      const stats = await storage.getUserGamificationStats(organizationId, req.session.user.loanOfficerId);
      
      if (!stats) {
        return res.status(404).json({ message: "User gamification stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching user gamification stats:", error);
      res.status(500).json({ message: "Failed to fetch user gamification stats" });
    }
  });

  // Performance Widget Endpoints
  app.get("/api/gamification/user-stats", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const loanOfficerId = req.query.loanOfficerId as string || req.session.user.loanOfficerId;
      
      console.log(`[GAMIFICATION] Fetching detailed user stats for officer ${loanOfficerId}`);
      
      const stats = await storage.getDetailedUserStats(organizationId, loanOfficerId);
      
      if (!stats) {
        return res.status(404).json({ message: "User stats not found" });
      }
      
      res.json(stats);
    } catch (error) {
      console.error("Error fetching detailed user stats:", error);
      res.status(500).json({ message: "Failed to fetch detailed user stats" });
    }
  });

  app.get("/api/gamification/leaderboard-mini", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const limit = parseInt(req.query.limit as string) || 5;
      
      console.log(`[GAMIFICATION] Fetching mini leaderboard (top ${limit})`);
      
      const leaderboard = await storage.getMiniLeaderboard(organizationId, limit);
      
      // Mark current user
      const currentUserId = req.session.user.loanOfficerId;
      const leaderboardWithCurrentUser = leaderboard.map(entry => ({
        ...entry,
        isCurrentUser: entry.loanOfficerId === currentUserId
      }));
      
      res.json(leaderboardWithCurrentUser);
    } catch (error) {
      console.error("Error fetching mini leaderboard:", error);
      res.status(500).json({ message: "Failed to fetch mini leaderboard" });
    }
  });

  app.get("/api/gamification/current-season", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      
      console.log("[GAMIFICATION] Fetching current season for performance widget");
      
      const season = await storage.getActiveGamificationSeason(organizationId);
      
      if (!season) {
        return res.json(null); // Return null instead of 404 - no season is valid
      }
      
      // Calculate days remaining
      const now = new Date();
      const endDate = new Date(season.endDate);
      const daysRemaining = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      res.json({
        name: season.name,
        endDate: season.endDate,
        daysRemaining: Math.max(0, daysRemaining)
      });
    } catch (error) {
      console.error("Error fetching current season:", error);
      res.status(500).json({ message: "Failed to fetch current season" });
    }
  });

  // Streak endpoint for navigation header
  app.get("/api/gamification/streak", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const loanOfficerId = req.session.user.loanOfficerId;
      
      console.log(`[GAMIFICATION] Fetching streak data for officer ${loanOfficerId}`);
      
      const user = await storage.getUserByLoanOfficerId(organizationId, loanOfficerId);
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json({
        currentStreak: user.currentStreak,
        longestStreak: user.longestStreak
      });
    } catch (error) {
      console.error("Error fetching streak data:", error);
      res.status(500).json({ message: "Failed to fetch streak data" });
    }
  });

  // Daily progress endpoint for Incentives page
  app.get("/api/gamification/daily-progress", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const loanOfficerId = req.session.user.loanOfficerId;
      
      console.log(`[GAMIFICATION] Fetching daily progress for officer ${loanOfficerId}`);
      
      const today = new Date();
      const progress = await storage.getDailyProgress(organizationId, loanOfficerId, today);
      
      res.json(progress);
    } catch (error) {
      console.error("Error fetching daily progress:", error);
      res.status(500).json({ message: "Failed to fetch daily progress" });
    }
  });

  // Streak history endpoint for Incentives page
  app.get("/api/gamification/streak-history", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const loanOfficerId = req.session.user.loanOfficerId;
      const days = parseInt(req.query.days as string) || 7;
      
      console.log(`[GAMIFICATION] Fetching streak history (${days} days) for officer ${loanOfficerId}`);
      
      const history = await storage.getStreakHistory(organizationId, loanOfficerId, days);
      
      res.json(history);
    } catch (error) {
      console.error("Error fetching streak history:", error);
      res.status(500).json({ message: "Failed to fetch streak history" });
    }
  });

  app.get("/api/gamification/badges/user", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      console.log(`[GAMIFICATION] Fetching earned badges for officer ${req.session.user.loanOfficerId}`);
      
      const badges = await storage.getUserBadges(organizationId, req.session.user.loanOfficerId);
      
      console.log(`[GAMIFICATION] Officer has ${badges.length} earned badges`);
      res.json(badges);
    } catch (error) {
      console.error("Error fetching user badges:", error);
      res.status(500).json({ message: "Failed to fetch user badges" });
    }
  });

  // CSV Export (Admin Only)
  app.get("/api/gamification/export/leaderboard", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      const organizationId = req.session.user.organizationId!;
      const scope = (req.query.scope as 'company' | 'branch') || 'company';
      const seasonId = req.query.seasonId as string | undefined;
      
      let branchId: string | undefined = undefined;
      
      if (scope === 'branch' && req.query.branchId) {
        branchId = req.query.branchId as string;
      }
      
      console.log(`[GAMIFICATION] Exporting leaderboard CSV - scope: ${scope}, branchId: ${branchId}, seasonId: ${seasonId}`);
      
      const leaderboard = await storage.getLeaderboard(organizationId, scope, branchId, seasonId);
      
      // Convert to CSV
      const csvHeader = 'Rank,Officer ID,Name,Total Points,Current Streak,Badges\n';
      const csvRows = leaderboard.map(entry => 
        `${entry.rank},"${entry.loanOfficerId}","${entry.name}",${entry.totalPoints},${entry.currentStreak},${entry.badgeCount}`
      ).join('\n');
      
      const csv = csvHeader + csvRows;
      
      // Set CSV headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="leaderboard.csv"');
      
      console.log(`[GAMIFICATION] Exported ${leaderboard.length} leaderboard entries to CSV`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting leaderboard CSV:", error);
      res.status(500).json({ message: "Failed to export leaderboard CSV" });
    }
  });

  // ============================================================================
  // PORTFOLIO SNAPSHOT ROUTES (Historical Performance Tracking)
  // ============================================================================

  // Get portfolio snapshots for current user or specified officer (super admin)
  app.get("/api/portfolio/snapshots", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const organizationId = req.session.user.organizationId!;
      const sessionOfficerId = req.session.user.loanOfficerId;
      const requestedOfficerId = req.query.loanOfficerId as string | undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 12;
      
      // Case 1: No specific officer requested or requesting own data - use session officer
      if (!requestedOfficerId || requestedOfficerId === sessionOfficerId) {
        console.log(`[PORTFOLIO] Fetching snapshots for session officer ${sessionOfficerId}`);
        const snapshots = await storage.getPortfolioSnapshots(organizationId, sessionOfficerId, limit);
        return res.json(snapshots);
      }
      
      // Case 2: "all" sentinel - super admin viewing aggregate (return empty for now, UI handles fallback)
      if (requestedOfficerId === 'all') {
        if (!req.session.user.isSuperAdmin) {
          return res.status(403).json({ message: "Forbidden: Only super admins can view aggregate data" });
        }
        console.log(`[PORTFOLIO] Super admin requested aggregate view - returning empty for UI fallback`);
        // Return empty array so UI shows simulated aggregate data
        return res.json([]);
      }
      
      // Case 3: Specific officer requested - validate super admin and organization membership
      if (!req.session.user.isSuperAdmin) {
        return res.status(403).json({ message: "Forbidden: Only super admins can view other officers' snapshots" });
      }
      
      // CRITICAL SECURITY: Verify officer belongs to caller's organization BEFORE any data access
      // This prevents cross-tenant data leakage even if officer has snapshots but no user record
      const officerUser = await storage.getUserByLoanOfficerId(organizationId, requestedOfficerId);
      if (!officerUser) {
        // Officer not found in this organization's users table
        // Reject immediately without accessing snapshot data to prevent enumeration attacks
        console.log(`[PORTFOLIO] Access denied: officer ${requestedOfficerId} not found in org ${organizationId}`);
        return res.status(404).json({ message: "Officer not found in your organization" });
      }
      
      // Officer validated and belongs to the caller's organization
      // Safe to fetch snapshots - storage layer provides additional org+officer filtering
      console.log(`[PORTFOLIO] Fetching snapshots for validated officer ${requestedOfficerId} in org ${organizationId}`);
      const snapshots = await storage.getPortfolioSnapshots(organizationId, requestedOfficerId, limit);
      
      // Return snapshots (may be empty array if officer has no historical data yet)
      res.json(snapshots);
      
    } catch (error) {
      console.error("Error fetching portfolio snapshots:", error);
      res.status(500).json({ message: "Failed to fetch portfolio snapshots" });
    }
  });

  // Get latest portfolio snapshot for current user
  app.get("/api/portfolio/snapshots/latest", requireAuth, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const organizationId = req.session.user.organizationId!;
      const loanOfficerId = req.session.user.loanOfficerId;
      
      const snapshot = await storage.getLatestSnapshot(organizationId, loanOfficerId);
      
      if (!snapshot) {
        return res.status(404).json({ message: "No snapshots found" });
      }
      
      res.json(snapshot);
    } catch (error) {
      console.error("Error fetching latest snapshot:", error);
      res.status(500).json({ message: "Failed to fetch latest snapshot" });
    }
  });

  // Create a new portfolio snapshot (Admin only, for manual triggers)
  app.post("/api/portfolio/snapshots", requireAuth, requireAdmin, requireOrganization, async (req, res) => {
    try {
      if (!req.session.user) {
        return res.status(401).json({ message: "Not authenticated" });
      }
      
      const organizationId = req.session.user.organizationId!;
      const loanOfficerId = req.body.loanOfficerId || req.session.user.loanOfficerId;
      
      console.log(`[PORTFOLIO] Creating snapshot for officer ${loanOfficerId}`);
      
      // Calculate current metrics
      const clients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
      const visits = await storage.getVisitsByLoanOfficer(organizationId, loanOfficerId);
      
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      
      const totalClients = clients.length;
      const totalOutstanding = clients.reduce((sum, c) => sum + (c.outstanding || 0), 0);
      const avgRiskScore = totalClients > 0 
        ? clients.reduce((sum, c) => sum + (c.riskScore || 0), 0) / totalClients 
        : 0;
      const highRiskClients = clients.filter(c => (c.riskScore || 0) >= 70).length;
      const totalVisits = visits.length;
      const completedVisits = visits.filter(v => v.status === 'completed').length;
      
      const snapshot = await storage.createPortfolioSnapshot({
        organizationId,
        loanOfficerId,
        snapshotDate: now,
        month,
        totalClients,
        totalOutstanding,
        avgRiskScore,
        totalVisits,
        completedVisits,
        highRiskClients
      });
      
      console.log(`[PORTFOLIO] Created snapshot: ${JSON.stringify(snapshot)}`);
      res.status(201).json(snapshot);
    } catch (error) {
      console.error("Error creating portfolio snapshot:", error);
      res.status(500).json({ message: "Failed to create portfolio snapshot" });
    }
  });

  // Create HTTP server
  const httpServer = createServer(app);

  // Only setup WebSocket server in development mode to avoid conflicts with Vite
  if (process.env.NODE_ENV === 'development') {
    console.log('[WEBSOCKET] Setting up WebSocket server for weight updates');
    
    // Setup WebSocket server on a different path to avoid conflicts
    const wss = new WebSocketServer({ 
      server: httpServer,
      path: '/ws-admin'
    });
    
    wss.on('connection', (ws, req) => {
      console.log('[WEBSOCKET] New connection from loan officer');
      
      // Extract organizationId from query params or default to 'mfw' for backward compatibility
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      const organizationId = url.searchParams.get('org') || 'mfw';
      
      // Add connection to organization-specific set
      if (!wsConnectionsByOrg.has(organizationId)) {
        wsConnectionsByOrg.set(organizationId, new Set());
      }
      wsConnectionsByOrg.get(organizationId)!.add(ws);
      console.log(`[WEBSOCKET] Connection added to organization ${organizationId}`);
      
      ws.on('close', () => {
        console.log('[WEBSOCKET] Loan officer disconnected');
        const orgSet = wsConnectionsByOrg.get(organizationId);
        if (orgSet) {
          orgSet.delete(ws);
          if (orgSet.size === 0) {
            wsConnectionsByOrg.delete(organizationId);
          }
        }
      });
      
      ws.on('error', (error) => {
        console.error('[WEBSOCKET] Connection error:', error);
        const orgSet = wsConnectionsByOrg.get(organizationId);
        if (orgSet) {
          orgSet.delete(ws);
        }
      });
    });
  }

  // Classification fix completed successfully - removed to prevent startup delays

  // Super Admin Routes - require super admin authentication
  
  // Get all organizations
  app.get("/api/super-admin/organizations", requireSuperAdmin, async (req, res) => {
    try {
      const { db } = await import('./db.js');
      const { organizations } = await import('../shared/schema.js');
      const allOrgs = await db.select().from(organizations);
      res.json(allOrgs);
    } catch (error) {
      console.error("Error fetching organizations:", error);
      res.status(500).json({ message: "Failed to fetch organizations" });
    }
  });

  // Create new organization
  app.post("/api/super-admin/organizations", requireSuperAdmin, async (req, res) => {
    try {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ message: "Organization name is required" });
      }
      
      const { db } = await import('./db.js');
      const { organizations } = await import('../shared/schema.js');
      
      const [newOrg] = await db.insert(organizations).values({
        name,
        adminUserId: null
      }).returning();
      
      console.log(`[SUPER ADMIN] Created new organization: ${newOrg.id} - ${newOrg.name}`);
      res.json(newOrg);
    } catch (error) {
      console.error("Error creating organization:", error);
      res.status(500).json({ message: "Failed to create organization" });
    }
  });

  // Get single organization by ID
  app.get("/api/super-admin/organizations/:orgId", requireSuperAdmin, async (req, res) => {
    try {
      const { orgId } = req.params;
      const { db } = await import('./db.js');
      const { organizations } = await import('../shared/schema.js');
      const { eq } = await import('drizzle-orm');
      
      const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
      
      if (!org) {
        return res.status(404).json({ message: "Organization not found" });
      }
      
      res.json(org);
    } catch (error) {
      console.error("Error fetching organization:", error);
      res.status(500).json({ message: "Failed to fetch organization" });
    }
  });

  // Get organization stats
  app.get("/api/super-admin/organizations/:orgId/stats", requireSuperAdmin, async (req, res) => {
    try {
      const { orgId } = req.params;
      const { db } = await import('./db.js');
      const { users, clients } = await import('../shared/schema.js');
      const { eq, count, and } = await import('drizzle-orm');
      
      // Count total users
      const [totalUsersResult] = await db.select({ count: count() })
        .from(users)
        .where(eq(users.organizationId, orgId));
      
      // Count admins
      const [adminsResult] = await db.select({ count: count() })
        .from(users)
        .where(and(eq(users.organizationId, orgId), eq(users.isAdmin, true)));
      
      // Count loan officers (unique loanOfficerIds)
      const loanOfficersResult = await db.selectDistinct({ loanOfficerId: users.loanOfficerId })
        .from(users)
        .where(eq(users.organizationId, orgId));
      
      // Count total clients
      const [totalClientsResult] = await db.select({ count: count() })
        .from(clients)
        .where(eq(clients.organizationId, orgId));
      
      res.json({
        totalUsers: totalUsersResult.count || 0,
        admins: adminsResult.count || 0,
        loanOfficers: loanOfficersResult.length || 0,
        totalClients: totalClientsResult.count || 0
      });
    } catch (error) {
      console.error("Error fetching organization stats:", error);
      res.status(500).json({ message: "Failed to fetch organization stats" });
    }
  });

  // Get all users across all organizations
  app.get("/api/super-admin/users", requireSuperAdmin, async (req, res) => {
    try {
      const { db } = await import('./db.js');
      const { users } = await import('../shared/schema.js');
      const allUsers = await db.select().from(users);
      res.json(allUsers);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get all clients across all organizations  
  app.get("/api/super-admin/clients", requireSuperAdmin, async (req, res) => {
    try {
      const { db } = await import('./db.js');
      const { clients } = await import('../shared/schema.js');
      const allClients = await db.select().from(clients);
      res.json(allClients);
    } catch (error) {
      console.error("Error fetching clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // Delete organization (with cascade deletion of all associated data)
  app.delete("/api/super-admin/organizations/:orgId", requireSuperAdmin, async (req, res) => {
    try {
      const { orgId } = req.params;
      
      // Prevent deletion of AKILA organization (super admin's organization)
      if (orgId === 'AKILA') {
        return res.status(403).json({ message: "Cannot delete the super admin organization (AKILA)" });
      }
      
      // Prevent super admins from deleting their own organization
      if (req.session.user?.organizationId === orgId) {
        return res.status(403).json({ message: "Cannot delete your own organization" });
      }
      
      // Attempt deletion - storage layer throws on errors, returns false only for not found
      const success = await storage.deleteOrganization(orgId);
      
      if (success) {
        res.json({ message: "Organization and all associated data deleted successfully" });
      } else {
        // False returned = organization not found (not a server error)
        res.status(404).json({ message: "Organization not found" });
      }
    } catch (error) {
      // Exception thrown = actual server/database error
      console.error("Error deleting organization:", error);
      res.status(500).json({ message: "Failed to delete organization" });
    }
  });

  // Submit page view analytics
  app.post("/api/analytics/page-view", requireAuth, async (req, res) => {
    try {
      const { organizationId, userId, loanOfficerId, pageName, pageRoute, timeSpent, sessionId } = req.body;
      
      if (!organizationId || !userId || !loanOfficerId || !pageName || !pageRoute || timeSpent === undefined) {
        return res.status(400).json({ message: "Missing required fields" });
      }
      
      const { db } = await import('./db.js');
      const { pageAnalytics } = await import('../shared/schema.js');
      
      await db.insert(pageAnalytics).values({
        organizationId,
        userId,
        loanOfficerId,
        pageName,
        pageRoute,
        timeSpent,
        sessionId,
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error submitting page analytics:", error);
      res.status(500).json({ message: "Failed to submit analytics" });
    }
  });

  // Get aggregated analytics for super admin
  app.get("/api/super-admin/analytics", requireSuperAdmin, async (req, res) => {
    try {
      const { orgId, startDate, endDate } = req.query;
      const { db } = await import('./db.js');
      const { pageAnalytics, organizations } = await import('../shared/schema.js');
      const { eq, and, gte, lte, sql, desc } = await import('drizzle-orm');
      
      let whereClause = [];
      
      if (orgId) {
        whereClause.push(eq(pageAnalytics.organizationId, orgId as string));
      }
      
      if (startDate) {
        whereClause.push(gte(pageAnalytics.createdAt, new Date(startDate as string)));
      }
      
      if (endDate) {
        whereClause.push(lte(pageAnalytics.createdAt, new Date(endDate as string)));
      }
      
      // Get page visit counts and total time per page
      const pageStats = await db
        .select({
          pageName: pageAnalytics.pageName,
          pageRoute: pageAnalytics.pageRoute,
          visitCount: sql<number>`count(*)::int`,
          totalTime: sql<number>`sum(${pageAnalytics.timeSpent})::int`,
          avgTime: sql<number>`avg(${pageAnalytics.timeSpent})::int`,
        })
        .from(pageAnalytics)
        .where(whereClause.length > 0 ? and(...whereClause) : undefined)
        .groupBy(pageAnalytics.pageName, pageAnalytics.pageRoute)
        .orderBy(desc(sql`count(*)`));
      
      // Get stats by organization
      const orgStats = await db
        .select({
          organizationId: pageAnalytics.organizationId,
          organizationName: organizations.name,
          visitCount: sql<number>`count(*)::int`,
          totalTime: sql<number>`sum(${pageAnalytics.timeSpent})::int`,
          uniqueUsers: sql<number>`count(distinct ${pageAnalytics.userId})::int`,
        })
        .from(pageAnalytics)
        .leftJoin(organizations, eq(pageAnalytics.organizationId, organizations.id))
        .where(whereClause.length > 0 ? and(...whereClause) : undefined)
        .groupBy(pageAnalytics.organizationId, organizations.name)
        .orderBy(desc(sql`count(*)`));
      
      // Get most active users
      const activeUsers = await db
        .select({
          loanOfficerId: pageAnalytics.loanOfficerId,
          organizationId: pageAnalytics.organizationId,
          visitCount: sql<number>`count(*)::int`,
          totalTime: sql<number>`sum(${pageAnalytics.timeSpent})::int`,
        })
        .from(pageAnalytics)
        .where(whereClause.length > 0 ? and(...whereClause) : undefined)
        .groupBy(pageAnalytics.loanOfficerId, pageAnalytics.organizationId)
        .orderBy(desc(sql`count(*)`))
        .limit(10);
      
      res.json({
        pageStats,
        orgStats,
        activeUsers,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
      res.status(500).json({ message: "Failed to fetch analytics" });
    }
  });

  // Register one-time migration routes for data export/import
  // WARNING: These should be removed after migration is complete for security
  registerMigrationRoutes(app);

  return httpServer;
}

// Officer-specific sync function (much more efficient)
async function performOfficerSpecificSync(organizationId: string, loanOfficerId: string, syncId: string): Promise<void> {
  try {
    console.log(`[DEBUG] Starting targeted sync for officer: ${loanOfficerId}`);
    
    await storage.updateDataSyncProgress(syncId, 10, 'Fetching officer clients...');
    
    // Get only this officer's clients
    const officerClients = await storage.getClientsByLoanOfficer(organizationId, loanOfficerId);
    console.log(`[DEBUG] Found ${officerClients.length} existing clients for officer ${loanOfficerId}`);
    
    await storage.updateDataSyncProgress(syncId, 30, 'Checking for data updates...');
    
    // Simple check - if officer has clients, we're good
    if (officerClients.length > 0) {
      await storage.updateDataSyncProgress(syncId, 70, 'Validating officer data...');
      
      // Note: Removed GROQ AI overrides to preserve proper weight-based calculations
      console.log(`[DEBUG] Officer ${loanOfficerId} has ${officerClients.length} clients with weight-based risk scores`);
      
      // Recalculate urgency classifications using proper weight-based logic
      await storage.updateDataSyncProgress(syncId, 90, 'Validating classifications...');
      // Note: Urgency classifications are calculated on-the-fly based on risk scores
      
      console.log(`[DEBUG] Completed data validation for officer ${loanOfficerId} using proper weight-based calculations`);
    }
    
  } catch (error) {
    console.error(`[ERROR] Officer sync failed for ${loanOfficerId}:`, (error as Error).message);
    await storage.updateDataSyncStatus(syncId, 'error', 0);
    throw error;
  }
}

// Smart comparison function to detect significant changes
function hasSignificantChanges(existing: any, incoming: any): boolean {
  const significantFields = [
    'outstanding', 'outstandingAtRisk', 'parPerLoan', 'lateDays',
    'totalDelayedInstalments', 'paidInstalments', 'countReschedule', 
    'paymentMonthly', 'isAtRisk', 'riskScore'
  ];
  
  for (const field of significantFields) {
    const existingValue = existing[field];
    const incomingValue = incoming[field];
    
    // Handle numeric comparisons with tolerance for floating point
    if (typeof existingValue === 'number' && typeof incomingValue === 'number') {
      if (Math.abs(existingValue - incomingValue) > 0.01) {
        return true;
      }
    } else if (existingValue !== incomingValue) {
      return true;
    }
  }
  
  return false;
}
