# Deployment Guide

## Environment Variables

### Required Environment Variables

#### Production Deployment
- `SESSION_SECRET`: Secret key for session encryption (REQUIRED in production)
  - Generate with: `openssl rand -base64 32`
  - Example: `SESSION_SECRET=your-secret-here-change-me`

- `DATABASE_URL`: PostgreSQL connection string (REQUIRED)
  - Automatically provided by Replit Database
  - Format: `postgresql://user:password@host:port/database`

### Optional Environment Variables

#### Admin Configuration
- `ADMIN_PASSWORD`: Custom password for the default admin account
  - If not set, a random secure password will be generated on first startup
  - Organization ID: `mfw`
  - Loan Officer ID: `ADMIN`

#### Frontend Configuration
- `FRONTEND_URL`: URL of the frontend (for CORS configuration)
  - Default: allows same-origin requests
  - Example: `https://your-frontend-domain.com`

#### Excel Data Sync
- `EXCEL_DATA_URL`: URL to automatically sync Excel data from
  - Optional - if not set, manual upload is required
  - Example: `https://your-excel-source.com/data.xlsx`

- `DEFAULT_ORGANIZATION_ID`: Organization ID for scheduled data sync
  - Default: `mfw` (the default organization)
  - Only needed if you have multiple organizations and want scheduled sync for a specific one
  - Example: `DEFAULT_ORGANIZATION_ID=mfw`

## Security Features

### Session Management
- PostgreSQL-backed sessions for persistence across deployments
- Sessions persist through server restarts
- Automatic cleanup of expired sessions every 15 minutes

### Multi-Tenant Isolation
- All data operations filtered by `organizationId`
- WebSocket connections scoped to organization
- No data leakage between organizations

### Rate Limiting
- **Authentication endpoints**: 10 requests per 15 minutes per IP
- **File uploads**: 20 uploads per hour per IP
- **General API**: 1000 requests per 15 minutes per IP

### File Upload Security
- **File size limit**: 50MB maximum
- **File type validation**: Only Excel files (.xlsx, .xls) accepted
- **Automatic cleanup**: Uploaded files processed and removed

### Request Security
- **Body size limit**: 10MB maximum for JSON/form data
- **CORS**: Configurable origin restrictions
- **Secure cookies**: HttpOnly, SameSite=strict, Secure in production

## Health Check

The application exposes a health check endpoint:
- **Endpoint**: `GET /health`
- **No authentication required**
- **Response**: `{ "status": "healthy", "timestamp": "...", "environment": "..." }`

## Database Schema

The PostgreSQL session store automatically creates a `session` table on first startup:
- Sessions are stored in the database
- No manual migration required
- Automatic session pruning every 15 minutes

## Production Checklist

Before deploying to production:

1. ✅ Set `SESSION_SECRET` environment variable
2. ✅ Verify `DATABASE_URL` is configured
3. ✅ (Optional) Set `ADMIN_PASSWORD` for predictable admin credentials
4. ✅ (Optional) Configure `FRONTEND_URL` for CORS
5. ✅ (Optional) Set `EXCEL_DATA_URL` for automatic data sync
6. ✅ Test health endpoint: `curl https://your-domain.com/health`
7. ✅ Verify admin login works
8. ✅ Test file upload functionality
9. ✅ Verify WebSocket connections work
10. ✅ Change default admin password after first login

## Common Issues

### Sessions Lost After Restart
**Cause**: DATABASE_URL not configured
**Solution**: Ensure DATABASE_URL environment variable is set

### File Upload Fails
**Cause**: Rate limiting or file size exceeded
**Solution**: Check file size (<50MB) and upload frequency (<20/hour)

### CORS Errors
**Cause**: Frontend on different domain without FRONTEND_URL configured
**Solution**: Set FRONTEND_URL environment variable

### WebSocket Connection Failed
**Cause**: Multi-tenant organization not specified
**Solution**: WebSocket client should include organization parameter

## Architecture Notes

### Session Storage
- Production: PostgreSQL-backed (persistent)
- Development without DATABASE_URL: MemoryStore (lost on restart)

### WebSocket Multi-Tenancy
- Connections mapped by organization ID
- Broadcasts scoped to organization
- Prevents data leakage between tenants

### Password Security
- Bcrypt hashing with salt rounds
- Auto-generated secure random passwords for new users
- Token-based first-login password setup for loan officers

## Database Migration (One-Time Setup)

When publishing your application, you can migrate data from your development database to production using the built-in migration endpoints.

### Prerequisites

1. Set the `MIGRATION_SECRET` environment variable (both in dev and production)
   ```bash
   MIGRATION_SECRET=your-secure-random-string-here
   ```
   Generate a secure value: `openssl rand -base64 32`

### Migration Steps

#### Step 1: Export Development Data

**Before publishing**, export your development database:

```bash
curl "https://your-dev-domain.replit.dev/api/export-data?secret=YOUR_MIGRATION_SECRET" \
  -o migration-data.json
```

This will download a JSON file containing:
- Organizations
- Users (loan officers) - passwords excluded for security
- Clients
- Visits
- Phone calls
- Settings (weight configurations)

#### Step 2: Publish Your Application

Use Replit's publish feature to deploy to production.

#### Step 3: Import Data to Production

**After publishing**, import the data into your production database:

```bash
curl -X POST "https://your-production-domain.replit.app/api/import-data" \
  -H "Content-Type: application/json" \
  -d @migration-data.json \
  --data-urlencode "secret=YOUR_MIGRATION_SECRET"
```

Or use this format with the secret in the body:

```bash
curl -X POST "https://your-production-domain.replit.app/api/import-data" \
  -H "Content-Type: application/json" \
  -d "{\"secret\":\"YOUR_MIGRATION_SECRET\",\"data\":$(cat migration-data.json)}"
```

The import will:
- Skip existing admin user (auto-created on first startup)
- Create/update clients
- Create visits and phone calls
- Update organization settings
- Create temporary passwords for loan officers

#### Step 4: Remove Migration Endpoints (IMPORTANT!)

After successful migration, **remove the migration endpoints** for security:

1. Delete or comment out this line in `server/routes.ts`:
   ```typescript
   registerMigrationRoutes(app);
   ```

2. Optionally delete `server/migration.ts`

3. Remove `MIGRATION_SECRET` from environment variables

4. Publish again to apply the security fix

### Troubleshooting

**"Invalid or missing migration secret"**
- Ensure `MIGRATION_SECRET` is set in environment variables
- Verify the secret matches exactly between dev and production

**"Import failed" errors**
- Check the JSON file is valid
- Ensure organization 'mfw' exists in production
- Review server logs for specific error messages

**Users can't log in after migration**
- Passwords are not migrated for security
- Users need to use "forgot password" or contact admin for password reset
- Admin password is set via `ADMIN_PASSWORD` env var or auto-generated

### Security Notes

- Migration endpoints are protected by `MIGRATION_SECRET`
- User passwords are NOT migrated (security best practice)
- Remove migration endpoints after use
- The export file contains sensitive data - handle securely
