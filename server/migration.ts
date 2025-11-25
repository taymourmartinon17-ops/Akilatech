import type { Express, Request, Response } from "express";
import { storage } from "./storage";
import crypto from "crypto";

/**
 * ONE-TIME DATABASE MIGRATION ENDPOINTS
 * 
 * These endpoints help migrate data from development to production:
 * 1. /api/export-data - Export all data from current database as JSON
 * 2. /api/import-data - Import JSON data into current database
 * 
 * USAGE:
 * 1. Before publishing: Call GET /api/export-data?secret=YOUR_SECRET to get JSON
 * 2. After publishing: Call POST /api/import-data with the JSON and secret
 * 
 * SECURITY: Requires MIGRATION_SECRET environment variable
 * 
 * REMOVE THESE ENDPOINTS AFTER MIGRATION IS COMPLETE!
 */

// Verify migration secret
function verifyMigrationSecret(req: Request): boolean {
  const secret = req.query.secret || req.body?.secret;
  const expectedSecret = process.env.MIGRATION_SECRET;
  
  if (!expectedSecret) {
    console.error('[MIGRATION] MIGRATION_SECRET not set in environment variables');
    return false;
  }
  
  return secret === expectedSecret;
}

export function registerMigrationRoutes(app: Express) {
  // Export all data from current database
  app.get("/api/export-data", async (req: Request, res: Response) => {
    try {
      // Verify secret
      if (!verifyMigrationSecret(req)) {
        return res.status(403).json({ 
          error: "Invalid or missing migration secret. Set MIGRATION_SECRET environment variable and pass it as ?secret=VALUE" 
        });
      }

      console.log('[MIGRATION] Starting data export...');

      // Export all data from all organizations
      const exportData: any = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        data: {
          organizations: [] as any[],
          users: [] as any[],
          clients: [] as any[],
          visits: [] as any[],
          phoneCalls: [] as any[],
          settings: [] as any[],
        }
      };

      // Get all organizations (for now, we'll use 'mfw' as the primary one)
      const organizations = ['mfw'];
      
      for (const orgId of organizations) {
        exportData.data.organizations.push({ id: orgId, name: orgId.toUpperCase() });

        // Export organization settings
        try {
          const settings = await storage.getOrganizationSettings(orgId);
          if (settings) {
            exportData.data.settings.push(settings);
          }
        } catch (error) {
          console.warn(`[MIGRATION] No settings found for org ${orgId}`);
        }

        // Export all clients for this organization
        try {
          const clients = await storage.getAllClients(orgId);
          exportData.data.clients.push(...clients);
          console.log(`[MIGRATION] Exported ${clients.length} clients for org ${orgId}`);
        } catch (error) {
          console.warn(`[MIGRATION] Error exporting clients for org ${orgId}:`, error);
        }

        // Get unique loan officers from clients to export their data
        const uniqueLoanOfficers = new Set<string>();
        exportData.data.clients.forEach((client: any) => {
          if (client.loanOfficerId) {
            uniqueLoanOfficers.add(client.loanOfficerId);
          }
        });

        // Export visits and phone calls for each loan officer
        for (const loanOfficerId of Array.from(uniqueLoanOfficers)) {
          try {
            const visits = await storage.getVisitsByLoanOfficer(orgId, loanOfficerId);
            exportData.data.visits.push(...visits);
          } catch (error) {
            console.warn(`[MIGRATION] Error exporting visits for ${loanOfficerId}:`, error);
          }

          try {
            const phoneCalls = await storage.getPhoneCallsByLoanOfficer(orgId, loanOfficerId);
            exportData.data.phoneCalls.push(...phoneCalls);
          } catch (error) {
            console.warn(`[MIGRATION] Error exporting phone calls for ${loanOfficerId}:`, error);
          }

          // Export user data for each loan officer
          try {
            const user = await storage.getUserByLoanOfficerId(orgId, loanOfficerId);
            if (user) {
              // Remove password hash for security
              exportData.data.users.push({
                ...user,
                password: null // Don't export password hashes
              });
            }
          } catch (error) {
            console.warn(`[MIGRATION] Error exporting user ${loanOfficerId}:`, error);
          }
        }

        console.log(`[MIGRATION] Exported ${exportData.data.visits.length} visits for org ${orgId}`);
        console.log(`[MIGRATION] Exported ${exportData.data.phoneCalls.length} phone calls for org ${orgId}`);
        console.log(`[MIGRATION] Exported ${exportData.data.users.length} users for org ${orgId}`);
      }

      console.log('[MIGRATION] Export complete:', {
        users: exportData.data.users.length,
        clients: exportData.data.clients.length,
        visits: exportData.data.visits.length,
        phoneCalls: exportData.data.phoneCalls.length,
        settings: exportData.data.settings.length
      });

      // Set filename for download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="migration-data-${Date.now()}.json"`);
      
      return res.json(exportData);

    } catch (error) {
      console.error('[MIGRATION] Export failed:', error);
      return res.status(500).json({ 
        error: "Export failed", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  // Import data into current database
  app.post("/api/import-data", async (req: Request, res: Response) => {
    try {
      // Verify secret
      if (!verifyMigrationSecret(req)) {
        return res.status(403).json({ 
          error: "Invalid or missing migration secret. Set MIGRATION_SECRET and pass it in request body" 
        });
      }

      const importData = req.body.data || req.body;
      
      if (!importData || !importData.data) {
        return res.status(400).json({ 
          error: "Invalid import data format. Expected { data: { users, clients, visits, phoneCalls, settings } }" 
        });
      }

      console.log('[MIGRATION] Starting data import...');
      console.log('[MIGRATION] Import data contains:', {
        users: importData.data.users?.length || 0,
        clients: importData.data.clients?.length || 0,
        visits: importData.data.visits?.length || 0,
        phoneCalls: importData.data.phoneCalls?.length || 0,
        settings: importData.data.settings?.length || 0
      });

      const results = {
        users: { created: 0, skipped: 0, errors: 0 },
        clients: { created: 0, updated: 0, errors: 0 },
        visits: { created: 0, errors: 0 },
        phoneCalls: { created: 0, errors: 0 },
        settings: { created: 0, updated: 0, errors: 0 }
      };

      // Import settings first
      if (importData.data.settings && importData.data.settings.length > 0) {
        for (const settings of importData.data.settings) {
          try {
            await storage.updateOrganizationSettings(settings.organizationId, settings);
            results.settings.updated++;
          } catch (error) {
            console.error('[MIGRATION] Failed to import settings:', error);
            results.settings.errors++;
          }
        }
      }

      // Import users (skip if they already exist - admin user is auto-created)
      if (importData.data.users && importData.data.users.length > 0) {
        for (const user of importData.data.users) {
          try {
            // Check if user already exists
            const existing = await storage.getUserByLoanOfficerId(user.organizationId, user.loanOfficerId);
            if (existing) {
              console.log(`[MIGRATION] User ${user.loanOfficerId} already exists, skipping`);
              results.users.skipped++;
            } else {
              // Create user with a temporary password - they'll need to reset
              await storage.createUser({
                organizationId: user.organizationId,
                loanOfficerId: user.loanOfficerId,
                name: user.name,
                password: crypto.randomBytes(32).toString('hex'), // Random temp password
                isAdmin: user.isAdmin || false,
                role: user.role || 'loan_officer'
              });
              results.users.created++;
              console.log(`[MIGRATION] Created user ${user.loanOfficerId}`);
            }
          } catch (error) {
            console.error('[MIGRATION] Failed to import user:', error);
            results.users.errors++;
          }
        }
      }

      // Import clients
      if (importData.data.clients && importData.data.clients.length > 0) {
        for (const client of importData.data.clients) {
          try {
            // Check if client already exists
            const existing = await storage.getClient(client.organizationId, client.id);
            if (existing) {
              // Update existing client
              await storage.updateClient(client.organizationId, client.id, client);
              results.clients.updated++;
            } else {
              // Create new client
              await storage.createClient(client);
              results.clients.created++;
            }
          } catch (error) {
            console.error('[MIGRATION] Failed to import client:', error);
            results.clients.errors++;
          }
        }
      }

      // Import visits
      if (importData.data.visits && importData.data.visits.length > 0) {
        for (const visit of importData.data.visits) {
          try {
            await storage.createVisit(visit);
            results.visits.created++;
          } catch (error) {
            console.error('[MIGRATION] Failed to import visit:', error);
            results.visits.errors++;
          }
        }
      }

      // Import phone calls
      if (importData.data.phoneCalls && importData.data.phoneCalls.length > 0) {
        for (const phoneCall of importData.data.phoneCalls) {
          try {
            await storage.createPhoneCall(phoneCall);
            results.phoneCalls.created++;
          } catch (error) {
            console.error('[MIGRATION] Failed to import phone call:', error);
            results.phoneCalls.errors++;
          }
        }
      }

      console.log('[MIGRATION] Import complete:', results);

      return res.json({ 
        success: true,
        message: 'Data imported successfully',
        results 
      });

    } catch (error) {
      console.error('[MIGRATION] Import failed:', error);
      return res.status(500).json({ 
        error: "Import failed", 
        details: error instanceof Error ? error.message : String(error) 
      });
    }
  });

  console.log('[MIGRATION] Migration routes registered');
  console.log('[MIGRATION] WARNING: Remember to remove these endpoints after migration is complete!');
}
