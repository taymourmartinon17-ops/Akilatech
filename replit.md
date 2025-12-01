# MicroFinance Risk Assessment Dashboard

## Overview

This is a full-stack web application designed for microfinance institutions to predict client behavior and assess risk. The application provides loan officers with AI-powered risk scores and urgency classifications for their clients, along with tools for visit scheduling and client management. The system integrates with Excel data sources for automatic synchronization and uses machine learning models to generate predictive analytics.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built using **React with TypeScript** and follows a modern component-based architecture:

- **UI Framework**: React with Vite as the build tool for fast development and optimized production builds
- **Styling**: Tailwind CSS with shadcn/ui component library for consistent, accessible UI components
- **State Management**: TanStack Query (React Query) for server state management and caching
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation for type-safe form management
- **Authentication**: Context-based authentication system with local storage persistence

The frontend implements a responsive design with three main pages:
- **Login**: Secure authentication using Loan Officer ID and password
- **Dashboard**: Client list with risk scores, urgency classifications, search, and sorting capabilities
- **Calendar**: Visit scheduling interface with client selection and calendar visualization

### Backend Architecture
The backend uses **Express.js with TypeScript** in an ESM configuration:

- **Server Framework**: Express.js with custom middleware for logging and error handling
- **API Design**: RESTful API with endpoints for authentication, client management, visits, and data synchronization
- **Data Processing**: Python integration for machine learning model execution
- **Scheduling**: Node.js cron-like scheduler for automated data synchronization every 30 minutes

The server implements a clean separation of concerns with:
- **Route handlers** for API endpoints
- **Storage abstraction layer** supporting both in-memory and database implementations
- **ML service integration** via Python subprocess execution
- **Automatic data sync** with external Excel sources

### Data Storage Solutions
The application uses a **flexible storage architecture**:

- **Database ORM**: Drizzle ORM configured for PostgreSQL with type-safe schema definitions
- **Schema Management**: Centralized schema definitions in TypeScript with Zod validation
- **Storage Abstraction**: Interface-based storage layer allowing multiple implementations (in-memory for development, PostgreSQL for production)
- **Migration Support**: Drizzle Kit for database schema migrations

Key data entities include:
- **Users**: Loan officer authentication and identification
- **Clients**: Complete client profiles with financial metrics and risk assessments
- **Visits**: Scheduled client visits with status tracking
- **Data Sync**: Audit trail for external data synchronization operations

### Machine Learning Integration
The system incorporates **Python-based machine learning** for predictive analytics:

- **ML Framework**: Scikit-learn for risk classification using Random Forest algorithms
- **Data Pipeline**: Automated processing of Excel data sources with pandas
- **Feature Engineering**: Financial metrics processing including PAR calculations, payment history analysis, and risk indicators
- **Model Output**: Risk scores (0-100) and urgency classifications (Extremely Urgent, Urgent, Moderately Urgent, Low Urgency)

The ML service processes multiple financial indicators:
- Outstanding loan amounts and at-risk percentages
- Payment history and delinquency patterns
- Reschedule frequency and installment compliance
- Days past due and payment consistency metrics

### Authentication and Authorization
The application implements **production-grade session-based authentication**:

- **Login System**: Loan Officer ID and password verification with bcrypt hashing
- **Session Management**: PostgreSQL-backed sessions (connect-pg-simple) for persistence across restarts
- **Secure Cookies**: HttpOnly, SameSite=strict, Secure flag in production
- **Session Persistence**: Sessions survive server restarts and deployments
- **Auto-cleanup**: Expired sessions pruned every 15 minutes
- **Data Filtering**: Automatic filtering of client data based on authenticated loan officer
- **Route Protection**: All protected routes have authentication checks with proper error handling
- **Rate Limiting**: 
  - Authentication endpoints: 10 requests per 15 minutes per IP
  - File uploads: 20 uploads per hour per IP
  - General API: 1000 requests per 15 minutes per IP

### External Service Integrations
The system integrates with **Microsoft cloud services** for data sourcing:

- **Excel Integration**: Automatic downloading and processing of Excel files from OneDrive/SharePoint
- **Scheduled Sync**: 30-minute interval synchronization with external data sources
- **File Upload Security**: 
  - 50MB maximum file size
  - MIME type validation (Excel files only)
  - Filename sanitization to prevent path traversal
  - Automatic cleanup after processing
  - Rate limiting (20 uploads per hour per IP)
- **Error Handling**: Robust error handling for network issues and data format problems
- **Sync Status Tracking**: Real-time sync status display with last update timestamps

### Production Security Features
The application includes **comprehensive security hardening** for production deployments:

- **Multi-Tenant Isolation**: 
  - All database queries filtered by organizationId
  - WebSocket connections scoped per organization
  - Zero data leakage between tenants
- **Request Security**:
  - Body size limits (10MB max for JSON/form data)
  - CORS configuration with environment-based origin restrictions
  - Secure session encryption with SESSION_SECRET
- **Password Security**:
  - Bcrypt hashing with salt rounds
  - Auto-generated secure random passwords for admin accounts
  - Token-based first-login password setup for loan officers
- **Monitoring**:
  - Health check endpoint at /health (no auth required)
  - Comprehensive error logging
  - Session store status tracking

## External Dependencies

### Core Technology Stack
- **Node.js Runtime**: ESM module support with TypeScript compilation
- **React Ecosystem**: React 18+ with modern hooks and concurrent features
- **Database**: PostgreSQL with Neon Database serverless platform (@neondatabase/serverless)
- **Python ML Stack**: Python 3 with scikit-learn, pandas, and requests libraries

### UI and Styling
- **Tailwind CSS**: Utility-first CSS framework with custom design system
- **Radix UI**: Headless UI components (@radix-ui/*) for accessibility and behavior
- **shadcn/ui**: Pre-built component library with consistent design patterns
- **Lucide React**: Icon library for modern, consistent iconography

### Development and Build Tools
- **Vite**: Fast build tool with hot module replacement and optimized production builds
- **TypeScript**: Type safety across frontend, backend, and shared schemas
- **ESBuild**: Fast JavaScript bundler for server-side code compilation
- **Drizzle Kit**: Database schema management and migration tools

### Data Processing and Validation
- **Zod**: Runtime type validation and schema definition
- **React Hook Form**: Form state management with validation integration
- **Date-fns**: Date manipulation and formatting utilities
- **Class Variance Authority**: Type-safe CSS class management

### Cloud and External Services
- **Microsoft Office Integration**: Excel file processing from cloud storage
- **Session Management**: Connect-pg-simple for PostgreSQL session storage with automatic table creation
- **WebSocket**: Multi-tenant WebSocket server for real-time weight update broadcasts
- **HTTP Client**: Fetch API for external data source connections
- **Error Tracking**: Comprehensive error logging and monitoring capabilities
- **Rate Limiting**: Express-rate-limit for DDoS protection and abuse prevention

## Environment Variables

See DEPLOYMENT.md for comprehensive deployment documentation.

### Required (Production)
- `SESSION_SECRET`: Secret key for session encryption (required in production)
- `DATABASE_URL`: PostgreSQL connection string (automatically provided by Replit)

### Optional
- `ADMIN_PASSWORD`: Custom admin password (if not set, generates secure random password)
- `FRONTEND_URL`: Frontend URL for CORS configuration
- `EXCEL_DATA_URL`: URL for automatic Excel data synchronization
- `DEFAULT_ORGANIZATION_ID`: Organization ID for scheduled sync (default: 'mfw')

## Recent Updates (October 28, 2025)

### Production Deployment Security Hardening
- ✅ Implemented PostgreSQL-backed session store for persistence across deployments
- ✅ Fixed WebSocket multi-tenant isolation to prevent data leakage
- ✅ Added comprehensive file upload security (size limits, MIME validation, sanitization)
- ✅ Implemented rate limiting on authentication and upload endpoints
- ✅ Added CORS configuration and request body size limits
- ✅ Created /health endpoint for monitoring
- ✅ Fixed all 79 TypeScript errors in server/routes.ts
- ✅ Enhanced admin password generation with crypto.randomBytes
- ✅ Created DEPLOYMENT.md with comprehensive setup documentation

### Excel Processing Robustness (October 28, 2025)
- ✅ Added comprehensive Excel workbook validation to prevent crashes:
  - Empty workbook detection (no sheets)
  - Empty worksheet validation
  - Missing data rows detection
  - Invalid header format validation
  - Blank/auto-generated header detection ("__EMPTY", "Column1", etc.)
- ✅ Improved error messages with clear, actionable guidance for non-technical users
- ✅ Verified all client-side null checks for urgencyBreakdown and date fields
- ✅ Confirmed WebSocket JSON parsing has proper try-catch error handling
- ✅ Application is production-ready with zero TypeScript errors

### Production Publishing Readiness (October 29, 2025)
- ✅ Fixed TypeScript errors in scheduler.ts (missing DataSync fields)
- ✅ Replaced hardcoded organization ID with configurable environment variable
- ✅ Disabled sample data initialization in MemStorage for production safety
- ✅ Updated DEPLOYMENT.md with new environment variable documentation
- ✅ Zero TypeScript errors - ready for publishing

### Sync Performance Optimization (November 26, 2025)
- ✅ Added hash-based change detection for client sync
  - New `dataHash` field stores MD5 hash of financial data
  - Sync now skips unchanged clients (typically 80-95% savings)
  - First sync after update will compute hashes, subsequent syncs are much faster
- ✅ Hash includes: clientId, name, loanOfficerId, managerId, outstanding, outstandingAtRisk, parPerLoan, lateDays, totalDelayedInstalments, paidInstalments, countReschedule, paymentMonthly, isAtRisk, riskScore, compositeUrgency, urgencyClassification
- ✅ Hash excludes user-generated data: lastVisitDate, lastPhoneCallDate, feedback scores, snooze fields (these don't trigger re-sync)

### RTL (Right-to-Left) Arabic Language Support (December 1, 2025)
- ✅ **i18n Infrastructure**: Complete Arabic/English translation system using i18next
  - LanguageSwitcher component with Globe icon dropdown menu
  - Integrated in navigation bar and login page
  - Automatic direction switching between LTR and RTL
- ✅ **CSS Logical Properties**: Converted 50+ directional CSS classes to logical properties using Tailwind 3.4.17:
  - `ml-*` → `ms-*` (margin-start)
  - `mr-*` → `me-*` (margin-end)
  - `pl-*` → `ps-*` (padding-start)
  - `pr-*` → `pe-*` (padding-end)
  - `left-*` → `start-*` (inset-inline-start)
  - `right-*` → `end-*` (inset-inline-end)
  - `text-left` → `text-start`
  - `text-right` → `text-end`
- ✅ **RTL CSS Utilities in index.css**:
  - Icon flipping for directional icons (chevrons, arrows)
  - Table alignment rules for RTL
  - Form input alignment
  - Sidebar positioning
  - Modal and dialog positioning
- ✅ **Arabic Font Support**: Added Noto Sans Arabic, Cairo, Tajawal with system fallbacks
- ✅ **Components Updated**: client-table, navigation, login, calendar, admin-dashboard, score-explanation-modal, data-sync, performance-widget, AdminGamification, settings, dashboard-previews, badge-unlock-celebration, Incentives