import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import cors from "cors";

declare module 'express-session' {
  interface SessionData {
    user?: {
      id: string;
      organizationId: string | null;
      loanOfficerId: string;
      name: string;
      isAdmin?: boolean;
      isSuperAdmin?: boolean;
    };
  }
}

const app = express();

// Enable trust proxy for running behind reverse proxies (Replit, etc.)
// This is needed for rate limiting and getting correct client IPs
app.set('trust proxy', 1);

// CORS configuration for production deployments
const corsOptions = {
  origin: process.env.FRONTEND_URL || true, // Allow configured origin or same-origin
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// Request body size limits to prevent memory issues
app.use(express.json({ limit: '10mb' })); // Limit JSON payloads to 10MB
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// Set up session management with production-ready security
const isProduction = process.env.NODE_ENV === 'production';

console.log('[STARTUP] Environment:', process.env.NODE_ENV);
console.log('[STARTUP] Port:', process.env.PORT || '5000');
console.log('[STARTUP] Deployment mode:', process.env.REPLIT_DEPLOYMENT === '1' ? 'Production Deployment' : 'Development');

// Enforce SESSION_SECRET in production
if (isProduction && !process.env.SESSION_SECRET) {
  console.error('[SECURITY ERROR] SESSION_SECRET environment variable is required in production!');
  console.error('[SECURITY ERROR] Please set SESSION_SECRET to a secure random string.');
  console.error('[SECURITY ERROR] Available env vars:', Object.keys(process.env).filter(k => !k.includes('PASSWORD') && !k.includes('SECRET')));
  process.exit(1);
}

// Verify database connection in production
if (isProduction) {
  const dbVars = ['DATABASE_URL', 'PGHOST', 'PGDATABASE'];
  const missingVars = dbVars.filter(v => !process.env[v]);
  if (missingVars.length > 0) {
    console.error('[DATABASE ERROR] Missing required database environment variables:', missingVars);
    console.error('[DATABASE ERROR] Please ensure your database is connected to the deployment.');
    process.exit(1);
  }
  console.log('[STARTUP] Database connection configured');
}

// Configure PostgreSQL-backed session store for production
const PgSession = connectPgSimple(session);
const sessionStore = process.env.DATABASE_URL 
  ? new PgSession({
      conString: process.env.DATABASE_URL,
      tableName: 'session', // Will auto-create table if it doesn't exist
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15 // Clean up expired sessions every 15 minutes
    })
  : undefined; // Fall back to MemoryStore only in development without DATABASE_URL

if (sessionStore) {
  console.log('[STARTUP] Using PostgreSQL session store for persistence');
} else {
  console.warn('[STARTUP WARNING] Using MemoryStore - sessions will be lost on restart');
}

app.use(session({
  store: sessionStore,
  secret: process.env.SESSION_SECRET || 'microfinance-dashboard-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction, // Enable secure cookies in production (requires HTTPS)
    httpOnly: true,
    sameSite: 'strict', // CSRF protection
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Health check endpoint (no authentication required)
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Log only slow requests (>1000ms) and errors (4xx, 5xx)
      if (duration > 1000 || res.statusCode >= 400) {
        log(`${req.method} ${path} ${res.statusCode} in ${duration}ms`);
      }
    }
  });

  next();
});

(async () => {
  // Auto-create organization and admin user on first startup (development and production)
  try {
    console.log('[STARTUP] Initializing organization and admin user...');
    const { storage } = await import('./storage.js');
    const { db } = await import('./db.js');
    const { organizations } = await import('../shared/schema.js');
    
    // Step 1: Ensure organizations "mfw" and "AKILA" exist (safe - won't duplicate)
    try {
      await db.insert(organizations).values({
        id: 'mfw',
        name: 'MFW Organization',
        adminUserId: null
      }).onConflictDoNothing();
      console.log('[STARTUP] Organization "mfw" initialized');
    } catch (orgError: any) {
      console.error('[STARTUP ERROR] Could not create organization mfw:', orgError?.message || orgError);
    }
    
    try {
      await db.insert(organizations).values({
        id: 'AKILA',
        name: 'AKILA Organization',
        adminUserId: null
      }).onConflictDoNothing();
      console.log('[STARTUP] Organization "AKILA" initialized');
    } catch (orgError: any) {
      console.error('[STARTUP ERROR] Could not create organization AKILA:', orgError?.message || orgError);
    }
    
    // Step 2: Check if admin user exists for organization "mfw"
    const existingAdmin = await storage.getUserByLoanOfficerId('mfw', 'ADMIN');
    
    if (!existingAdmin) {
      console.log('[STARTUP] No admin user found - creating default admin for organization "mfw"...');
      
      // Create default admin for organization "mfw" with password setup required
      try {
        await storage.createUser({
          organizationId: 'mfw',
          loanOfficerId: 'ADMIN',
          password: null, // No password - admin will set it on first login
          name: 'MFW Administrator',
          role: 'admin',
          isAdmin: true,
          requiresPasswordSetup: true, // Flag for first-time password setup
          totalPoints: 0,
          currentStreak: 0,
          currentRank: null,
          branchId: null
        });
        
        console.log('✅ [STARTUP] Admin user created successfully!');
        console.log('   Organization ID: mfw');
        console.log('   Loan Officer ID: ADMIN');
        console.log('   🔐 Password: Admin will set their own password on first login');
      } catch (userError: any) {
        console.error('[STARTUP ERROR] Failed to create admin user:', userError?.message || userError);
        console.error('[STARTUP ERROR] This is a critical error - admin login will not work!');
      }
    } else {
      console.log('[STARTUP] Admin user already exists for organization "mfw"');
    }
    
    // Step 3: Migrate any existing super admin with null org, then ensure AKILA super admin exists
    try {
      // First, check for legacy super admin with null organizationId (query DB directly)
      const { sql } = await import('drizzle-orm');
      const { users } = await import('../shared/schema.js');
      const { eq, and, isNull } = await import('drizzle-orm');
      
      const legacySuperAdmins = await db.select().from(users).where(
        and(isNull(users.organizationId), eq(users.isSuperAdmin, true))
      );
      
      if (legacySuperAdmins.length > 0) {
        console.log('[STARTUP] Found legacy super admin(s) with null organizationId - removing...');
        await db.execute(sql`DELETE FROM users WHERE organization_id IS NULL AND is_super_admin = true`);
        console.log('[STARTUP] Legacy super admin(s) removed');
      }
    } catch (migrationError: any) {
      console.error('[STARTUP ERROR] Super admin migration error:', migrationError?.message || migrationError);
    }
    
    // Now ensure AKILA super admin exists
    const existingSuperAdmin = await storage.getUserByLoanOfficerId('AKILA', 'SUPER_ADMIN');
    
    if (!existingSuperAdmin) {
      console.log('[STARTUP] No super admin found - creating platform super administrator...');
      
      try {
        await storage.createUser({
          organizationId: 'AKILA', // Super admin belongs to AKILA organization
          loanOfficerId: 'SUPER_ADMIN',
          password: null, // No password - super admin will set it on first login
          name: 'Platform Administrator',
          role: 'super_admin',
          isAdmin: true, // Also has admin privileges
          isSuperAdmin: true,
          requiresPasswordSetup: true, // Flag for first-time password setup
          totalPoints: 0,
          currentStreak: 0,
          currentRank: null,
          branchId: null
        });
        
        console.log('✅ [STARTUP] Super admin user created successfully!');
        console.log('   Organization ID: AKILA');
        console.log('   Loan Officer ID: SUPER_ADMIN');
        console.log('   Access: Both Organization Dashboard & Super Admin Panel');
        console.log('   🔐 Password: Super admin will set their own password on first login');
      } catch (superAdminError: any) {
        console.error('[STARTUP ERROR] Failed to create super admin:', superAdminError?.message || superAdminError);
      }
    } else {
      console.log('[STARTUP] Super admin user already exists');
    }
    
  } catch (error: any) {
    console.error('[STARTUP ERROR] Critical failure in startup initialization:', error?.message || error);
    // Don't fail startup, but log prominently
  }
  
  const server = await registerRoutes(app);

  // Error handling middleware - must be after routes
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    
    // Log error for debugging
    console.error('[ERROR]', status, message, err.stack);
    
    // Send error response without re-throwing (prevents unhandled promise rejections)
    res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    console.log('[STARTUP] Server successfully started and listening');
    console.log('[STARTUP] Host: 0.0.0.0');
    console.log('[STARTUP] Port:', port);
    if (isProduction) {
      console.log('[STARTUP] Production mode - all checks passed');
    }
  });

  // Catch any uncaught errors during startup
  server.on('error', (error: any) => {
    console.error('[STARTUP ERROR] Server failed to start:', error);
    console.error('[STARTUP ERROR] Error code:', error.code);
    console.error('[STARTUP ERROR] Error message:', error.message);
    process.exit(1);
  });
})().catch((error) => {
  console.error('[FATAL ERROR] Application initialization failed:', error);
  console.error('[FATAL ERROR] Stack trace:', error.stack);
  process.exit(1);
});
