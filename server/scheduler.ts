import { storage } from "./storage";
import { type Client, type InsertClient } from "@shared/schema";
import { processExcelData, type WeightSettings } from "./excel-processor";
// Removed GROQ AI imports and Python dependency - now using only weight-based ML calculations in TypeScript

let syncInterval: NodeJS.Timeout | null = null;

export function startDataSyncScheduler() {
  // Clear any existing interval
  if (syncInterval) {
    clearInterval(syncInterval);
  }

  // Schedule sync every 30 minutes (1800000 ms)
  syncInterval = setInterval(async () => {
    await performScheduledSync();
  }, 30 * 60 * 1000);

  console.log("Data sync scheduler started - syncing every 30 minutes");
}

export function stopDataSyncScheduler() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("Data sync scheduler stopped");
  }
}

async function performScheduledSync() {
  const excelUrl = process.env.EXCEL_DATA_URL || process.env.VITE_EXCEL_DATA_URL;
  
  if (!excelUrl) {
    console.warn("No Excel data URL configured for scheduled sync");
    return;
  }

  // Concurrency guard: check if sync is already in progress
  // Use environment variable for organization ID, fallback to 'mfw' (default organization)
  const DEFAULT_ORGANIZATION_ID = process.env.DEFAULT_ORGANIZATION_ID || 'mfw';
  
  try {
    const lastSync = await storage.getLastDataSync(DEFAULT_ORGANIZATION_ID);
    if (lastSync && lastSync.status === 'in_progress') {
      // Check if sync is genuinely stuck (older than 10 minutes)
      const syncAge = new Date().getTime() - new Date(lastSync.lastSyncTime).getTime();
      const maxSyncTime = 10 * 60 * 1000; // 10 minutes
      
      if (syncAge < maxSyncTime) {
        console.log("Sync already in progress - skipping scheduled sync");
        return;
      } else {
        console.warn(`[CONCURRENCY] Detected stuck sync (${Math.floor(syncAge/60000)} minutes old) - proceeding with new sync`);
      }
    }
  } catch (error) {
    console.warn("Failed to check sync status for concurrency guard:", error);
  }

  console.log("Starting scheduled data sync...");

  try {
    // Record sync attempt
    const syncRecord = await storage.createDataSync({
      organizationId: DEFAULT_ORGANIZATION_ID,
      lastSyncTime: new Date(),
      status: 'in_progress',
      recordsProcessed: 0,
      errorMessage: null,
      progressPercentage: 0,
      currentStep: 'Starting scheduled sync...',
      provisionedUsers: null,
      provisioningErrors: null,
    });
    
    let customWeights: Partial<WeightSettings> | undefined = undefined;
    try {
      // Use organization-specific settings for scheduled sync
      const orgSettings = await storage.getOrganizationSettings(DEFAULT_ORGANIZATION_ID);
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
    
    try {
      console.log("[SCHEDULER] Processing Excel data with TypeScript processor...");
      const processedData = await processExcelData(excelUrl, DEFAULT_ORGANIZATION_ID, customWeights);
      
      if (processedData.success && processedData.clients) {
            console.log(`[SCHEDULER] Processing ${processedData.clients.length} clients`);
            
            // Auto-create loan officers from unique IDs found in data
            if (processedData.uniqueLoanOfficers && processedData.uniqueLoanOfficers.length > 0) {
              console.log(`[SCHEDULER] Auto-creating ${processedData.uniqueLoanOfficers.length} loan officers...`);
              for (const loanOfficerId of processedData.uniqueLoanOfficers) {
                try {
                  // Check if user already exists in this organization
                  const existingUser = await storage.getUserByLoanOfficerId(DEFAULT_ORGANIZATION_ID, loanOfficerId);
                  if (!existingUser) {
                    // Create new loan officer with default settings
                    await storage.createUser({
                      loanOfficerId,
                      organizationId: DEFAULT_ORGANIZATION_ID,
                      name: `Loan Officer ${loanOfficerId}`,
                      role: 'loan_officer',
                      isAdmin: false,
                      password: null,  // No password set initially - must be set on first login
                      totalPoints: 0,
                      currentStreak: 0,
                      currentRank: null,
                      branchId: null
                    });
                    console.log(`[SCHEDULER] Created loan officer: ${loanOfficerId}`);
                  }
                } catch (error) {
                  console.warn(`[SCHEDULER] Failed to create loan officer ${loanOfficerId}:`, error);
                }
              }
            }
            
            // Optimize client processing using batch operations
            const existingClients = await storage.getAllClients(DEFAULT_ORGANIZATION_ID);
            const existingClientMap = new Map(existingClients.map(c => [c.clientId, c]));
            
            let clientsToUpdate: Client[] = [];
            let clientsToCreate: InsertClient[] = [];
            const updatedOfficerIds = new Set<string>();
            
            // Smart comparison - only update records that actually changed
            // Perform intelligent change detection to avoid unnecessary database operations
            let actualChanges = 0;
            
            for (const clientData of processedData.clients) {
              const existingClient = existingClientMap.get(clientData.clientId);
              
              if (existingClient) {
                // Check if any meaningful data has changed
                const hasChanges = hasSignificantChanges(existingClient, clientData);
                
                if (hasChanges) {
                  updatedOfficerIds.add(clientData.loanOfficerId);
                  clientsToUpdate.push({
                    ...existingClient,
                    ...clientData,
                    updatedAt: new Date()
                  });
                  actualChanges++;
                }
              } else {
                // New client
                updatedOfficerIds.add(clientData.loanOfficerId);
                clientsToCreate.push(clientData);
                actualChanges++;
              }
            }
            
            console.log(`[SCHEDULER] Found ${actualChanges} changes to sync`);
            
            // OPTIMIZATION: Early termination if no meaningful changes
            if (actualChanges === 0) {
              await storage.updateDataSyncStatus(syncRecord.id, 'success', 0);
              console.log("Scheduled sync: No changes detected - database already up to date");
              return;
            }
            
            // OPTIMIZATION: Chunked processing limit to prevent overwhelming database
            const MAX_CHANGES_PER_SYNC = 10000;
            if (actualChanges > MAX_CHANGES_PER_SYNC) {
              console.log(`[WARNING] Large sync detected (${actualChanges} changes) - limiting to ${MAX_CHANGES_PER_SYNC} per cycle`);
              
              // Limit updates and creates to prevent database overload
              clientsToUpdate = clientsToUpdate.slice(0, Math.min(clientsToUpdate.length, MAX_CHANGES_PER_SYNC / 2));
              clientsToCreate = clientsToCreate.slice(0, Math.min(clientsToCreate.length, MAX_CHANGES_PER_SYNC / 2));
              
              console.log(`[SCHEDULER] Limited to ${clientsToUpdate.length} updates and ${clientsToCreate.length} creates for this cycle`);
            }

            // OPTIMIZED: Use bulkUpsertClients for both updates and creates (much faster)
            const allClientsToProcess = [...clientsToUpdate, ...clientsToCreate];
            console.log(`[SCHEDULER] Processing ${allClientsToProcess.length} clients using efficient bulk upsert (${clientsToUpdate.length} updates, ${clientsToCreate.length} creates)`);
            
            if (allClientsToProcess.length > 0) {
              await storage.bulkUpsertClients(DEFAULT_ORGANIZATION_ID, allClientsToProcess);
            }

            // Only recalculate urgency for affected loan officers (much more efficient)
            console.log(`[SCHEDULER] Recalculating urgency for ${updatedOfficerIds.size} loan officers`);
            const officerIdsArray = Array.from(updatedOfficerIds);
            for (const loanOfficerId of officerIdsArray) {
              await recalculateUrgencyClassifications(DEFAULT_ORGANIZATION_ID, loanOfficerId);
            }
            
            const totalProcessed = clientsToUpdate.length + clientsToCreate.length;

            await storage.updateDataSyncStatus(syncRecord.id, 'success', totalProcessed);

            console.log(`Scheduled sync completed successfully - processed ${totalProcessed} clients (${clientsToUpdate.length} updated, ${clientsToCreate.length} created)`);
        
        // Log quality report if there are any issues
        if (processedData.qualityReport?.hasIssues) {
          console.warn("[SCHEDULER] Data quality issues detected:");
          processedData.qualityReport.warnings.forEach(w => console.warn(`  WARNING: ${w}`));
          processedData.qualityReport.errors.forEach(e => console.error(`  ERROR: ${e}`));
        }
      } else {
        throw new Error(processedData.error || 'Processing failed');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error("Scheduled sync failed:", errorMessage);
      
      await storage.updateDataSyncStatus(syncRecord.id, 'error', 0, `Sync failed: ${errorMessage}`);
    }

  } catch (error) {
    console.error("Failed to initiate scheduled sync:", error);
    
    // Create error record for scheduler init failure
    await storage.createDataSync({
      organizationId: DEFAULT_ORGANIZATION_ID,
      lastSyncTime: new Date(),
      status: 'error',
      recordsProcessed: 0,
      errorMessage: `Failed to initiate: ${error}`,
      progressPercentage: 0,
      currentStep: 'Failed to start sync',
      provisionedUsers: null,
      provisioningErrors: null,
    });
  }
}

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
  
}

// Smart comparison function for scheduler
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
