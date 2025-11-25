import { db } from '../server/db.js';
import { 
  organizations, users, clients, visits, phoneCalls, settings,
  gamificationRules, gamificationSeasons, gamificationEvents,
  gamificationBadges, gamificationUserBadges
} from '../shared/schema.js';
import { writeFile, mkdir } from 'fs/promises';

async function exportData() {
  console.log('📦 Starting database export...\n');
  
  try {
    // Create export directory
    await mkdir('data-export', { recursive: true });
    
    const exportData: any = {
      timestamp: new Date().toISOString(),
      version: '1.0',
      tables: {}
    };

    // Export all tables
    console.log('Exporting organizations...');
    exportData.tables.organizations = await db.select().from(organizations);
    console.log(`✓ Exported ${exportData.tables.organizations.length} organizations`);

    console.log('Exporting users...');
    exportData.tables.users = await db.select().from(users);
    console.log(`✓ Exported ${exportData.tables.users.length} users`);

    console.log('Exporting clients...');
    exportData.tables.clients = await db.select().from(clients);
    console.log(`✓ Exported ${exportData.tables.clients.length} clients`);

    console.log('Exporting visits...');
    exportData.tables.visits = await db.select().from(visits);
    console.log(`✓ Exported ${exportData.tables.visits.length} visits`);

    console.log('Exporting phone calls...');
    exportData.tables.phoneCalls = await db.select().from(phoneCalls);
    console.log(`✓ Exported ${exportData.tables.phoneCalls.length} phone calls`);

    console.log('Exporting settings...');
    exportData.tables.settings = await db.select().from(settings);
    console.log(`✓ Exported ${exportData.tables.settings.length} settings`);

    console.log('Exporting gamification rules...');
    exportData.tables.gamificationRules = await db.select().from(gamificationRules);
    console.log(`✓ Exported ${exportData.tables.gamificationRules.length} gamification rules`);

    console.log('Exporting gamification seasons...');
    exportData.tables.gamificationSeasons = await db.select().from(gamificationSeasons);
    console.log(`✓ Exported ${exportData.tables.gamificationSeasons.length} gamification seasons`);

    console.log('Exporting gamification events...');
    exportData.tables.gamificationEvents = await db.select().from(gamificationEvents);
    console.log(`✓ Exported ${exportData.tables.gamificationEvents.length} gamification events`);

    console.log('Exporting gamification badges...');
    exportData.tables.gamificationBadges = await db.select().from(gamificationBadges);
    console.log(`✓ Exported ${exportData.tables.gamificationBadges.length} gamification badges`);

    console.log('Exporting gamification user badges...');
    exportData.tables.gamificationUserBadges = await db.select().from(gamificationUserBadges);
    console.log(`✓ Exported ${exportData.tables.gamificationUserBadges.length} user badges`);

    // Note: dataSync is intentionally skipped - it's operational data, not user data

    // Write to file
    const filename = `data-export/database-export-${Date.now()}.json`;
    await writeFile(filename, JSON.stringify(exportData, null, 2));
    
    console.log(`\n✅ Export complete!`);
    console.log(`📁 File saved to: ${filename}`);
    console.log(`\nNext steps:`);
    console.log(`1. Download this file from your workspace`);
    console.log(`2. Upload it to your production deployment`);
    console.log(`3. Run: npm run import-data`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Export failed:', error);
    process.exit(1);
  }
}

exportData();
