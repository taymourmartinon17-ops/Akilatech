# Database Migration Guide

This guide will help you migrate your development data to your production deployment.

## Prerequisites

- You have data in your development database
- You have published your app to production
- You have access to your production Replit workspace shell

## Step 1: Export Data from Development

In your **development workspace**, run:

```bash
tsx scripts/export-data.ts
```

This will:
- Export all your data to a JSON file in the `data-export/` folder
- Include: users, clients, visits, settings, gamification data, etc.
- Skip operational data (data sync logs)

You should see output like:
```
📦 Starting database export...

Exporting organizations...
✓ Exported 1 organizations
Exporting users...
✓ Exported 5 users
Exporting clients...
✓ Exported 150 clients
...

✅ Export complete!
📁 File saved to: data-export/database-export-1234567890.json
```

## Step 2: Download the Export File

1. In your development workspace file explorer
2. Navigate to the `data-export/` folder
3. Download the `database-export-XXXXX.json` file to your computer

## Step 3: Upload to Production

1. Open your **production deployment** in Replit (published app)
2. In the file explorer, create a `data-export/` folder if it doesn't exist
3. Upload the export JSON file you downloaded

## Step 4: Import Data to Production

In your **production workspace shell**, run:

```bash
tsx scripts/import-data.ts
```

This will:
- Find the latest export file in `data-export/`
- Import all data safely (won't create duplicates)
- Show progress for each table

You should see output like:
```
📥 Starting database import...

📂 Reading from: data-export/database-export-1234567890.json

Import timestamp: 2025-01-27T12:00:00.000Z
Export version: 1.0

Importing 1 organizations...
✓ Imported organizations

Importing 5 users...
✓ Imported users

Importing 150 clients...
✓ Imported clients
...

✅ Import complete!
📊 Total records imported: 312

🎉 Your production database now has all your development data!
```

## Step 5: Verify

1. Log in to your production app
2. Check that all your users, clients, and data are visible
3. Verify settings are preserved

## Notes

- **Safe to run multiple times**: The import script uses `onConflictDoNothing()` so it won't create duplicates
- **Preserves IDs**: All database IDs are preserved, so relationships stay intact
- **No downtime**: Import can be done while the app is running
- **Incremental**: You can export and import again if you make changes in development

## Troubleshooting

### "No export files found"
Make sure you uploaded the JSON file to the `data-export/` folder in production.

### "Could not import user/client"
This usually means the record already exists - it's safe to ignore these warnings.

### Database connection errors
Ensure your production database is connected and `DATABASE_URL` is set.

## Alternative: Quick Commands

If you want simpler commands, you can add these to your `.bashrc`:

```bash
alias export-db="tsx scripts/export-data.ts"
alias import-db="tsx scripts/import-data.ts"
```

Then just run:
- `export-db` in development
- `import-db` in production
