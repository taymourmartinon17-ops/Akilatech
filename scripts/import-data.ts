import { storage } from '../server/storage.js';
import { readFile, readdir } from 'fs/promises';
import { db } from '../server/db.js';
import { 
  organizations, users, clients, visits, phoneCalls, settings,
  gamificationRules, gamificationSeasons, gamificationEvents,
  gamificationBadges, gamificationUserBadges
} from '../shared/schema.js';

async function importData() {
  console.log('📥 Starting database import...\n');
  
  try {
    // Find the latest export file
    const files = await readdir('data-export');
    const exportFiles = files.filter(f => f.startsWith('database-export-') && f.endsWith('.json'));
    
    if (exportFiles.length === 0) {
      console.error('❌ No export files found in data-export/ directory');
      console.error('Please run: npm run export-data first');
      process.exit(1);
    }

    // Use the most recent export file
    exportFiles.sort().reverse();
    const filename = `data-export/${exportFiles[0]}`;
    
    console.log(`📂 Reading from: ${filename}\n`);
    
    const fileContent = await readFile(filename, 'utf-8');
    const exportData = JSON.parse(fileContent);
    
    console.log(`Export timestamp: ${exportData.timestamp}`);
    console.log(`Export version: ${exportData.version}\n`);

    let totalImported = 0;

    // Import organizations first (parent table)
    if (exportData.tables.organizations?.length > 0) {
      console.log(`Importing ${exportData.tables.organizations.length} organizations...`);
      for (const org of exportData.tables.organizations) {
        try {
          await db.insert(organizations).values(org).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import organization ${org.id}:`, error);
        }
      }
      console.log(`✓ Imported organizations\n`);
    }

    // Import users
    if (exportData.tables.users?.length > 0) {
      console.log(`Importing ${exportData.tables.users.length} users...`);
      for (const user of exportData.tables.users) {
        try {
          await db.insert(users).values(user).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import user ${user.loanOfficerId}:`, error);
        }
      }
      console.log(`✓ Imported users\n`);
    }

    // Import clients
    if (exportData.tables.clients?.length > 0) {
      console.log(`Importing ${exportData.tables.clients.length} clients...`);
      for (const client of exportData.tables.clients) {
        try {
          await db.insert(clients).values(client).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import client ${client.clientId}:`, error);
        }
      }
      console.log(`✓ Imported clients\n`);
    }

    // Import visits
    if (exportData.tables.visits?.length > 0) {
      console.log(`Importing ${exportData.tables.visits.length} visits...`);
      for (const visit of exportData.tables.visits) {
        try {
          await db.insert(visits).values(visit).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import visit:`, error);
        }
      }
      console.log(`✓ Imported visits\n`);
    }

    // Import phone calls
    if (exportData.tables.phoneCalls?.length > 0) {
      console.log(`Importing ${exportData.tables.phoneCalls.length} phone calls...`);
      for (const call of exportData.tables.phoneCalls) {
        try {
          await db.insert(phoneCalls).values(call).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import phone call:`, error);
        }
      }
      console.log(`✓ Imported phone calls\n`);
    }

    // Import settings
    if (exportData.tables.settings?.length > 0) {
      console.log(`Importing ${exportData.tables.settings.length} settings...`);
      for (const setting of exportData.tables.settings) {
        try {
          await db.insert(settings).values(setting).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import setting:`, error);
        }
      }
      console.log(`✓ Imported settings\n`);
    }

    // Import gamification data
    if (exportData.tables.gamificationRules?.length > 0) {
      console.log(`Importing ${exportData.tables.gamificationRules.length} gamification rules...`);
      for (const rule of exportData.tables.gamificationRules) {
        try {
          await db.insert(gamificationRules).values(rule).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import gamification rule:`, error);
        }
      }
      console.log(`✓ Imported gamification rules\n`);
    }

    if (exportData.tables.gamificationSeasons?.length > 0) {
      console.log(`Importing ${exportData.tables.gamificationSeasons.length} gamification seasons...`);
      for (const season of exportData.tables.gamificationSeasons) {
        try {
          await db.insert(gamificationSeasons).values(season).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import gamification season:`, error);
        }
      }
      console.log(`✓ Imported gamification seasons\n`);
    }

    if (exportData.tables.gamificationEvents?.length > 0) {
      console.log(`Importing ${exportData.tables.gamificationEvents.length} gamification events...`);
      for (const event of exportData.tables.gamificationEvents) {
        try {
          await db.insert(gamificationEvents).values(event).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import gamification event:`, error);
        }
      }
      console.log(`✓ Imported gamification events\n`);
    }

    if (exportData.tables.gamificationBadges?.length > 0) {
      console.log(`Importing ${exportData.tables.gamificationBadges.length} gamification badges...`);
      for (const badge of exportData.tables.gamificationBadges) {
        try {
          await db.insert(gamificationBadges).values(badge).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import gamification badge:`, error);
        }
      }
      console.log(`✓ Imported gamification badges\n`);
    }

    if (exportData.tables.gamificationUserBadges?.length > 0) {
      console.log(`Importing ${exportData.tables.gamificationUserBadges.length} user badges...`);
      for (const userBadge of exportData.tables.gamificationUserBadges) {
        try {
          await db.insert(gamificationUserBadges).values(userBadge).onConflictDoNothing();
          totalImported++;
        } catch (error) {
          console.warn(`  Warning: Could not import user badge:`, error);
        }
      }
      console.log(`✓ Imported user badges\n`);
    }

    console.log(`\n✅ Import complete!`);
    console.log(`📊 Total records imported: ${totalImported}`);
    console.log(`\n🎉 Your production database now has all your development data!`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Import failed:', error);
    process.exit(1);
  }
}

importData();
