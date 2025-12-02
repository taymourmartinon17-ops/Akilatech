# MicroFinance Risk Assessment Dashboard

## Overview
This full-stack web application assists microfinance institutions in predicting client behavior and assessing risk. It provides loan officers with AI-powered risk scores and urgency classifications, alongside tools for visit scheduling and client management. The system integrates with Excel data sources for automatic synchronization and leverages machine learning for predictive analytics to enhance decision-making and operational efficiency.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is built with **React and TypeScript**, utilizing Vite for development. It features **Tailwind CSS with shadcn/ui** for a responsive and consistent UI, **TanStack Query** for state management, and **Wouter** for routing. Form handling uses **React Hook Form with Zod validation**. Authentication is context-based with local storage persistence. The application includes Login, Dashboard, and Calendar pages.

### Backend Architecture
The backend is an **Express.js with TypeScript** application, configured as an ESM. It provides a **RESTful API** for authentication, client management, visits, and data synchronization. A **Node.js cron-like scheduler** handles automated data synchronization. The architecture emphasizes separation of concerns, with route handlers, a storage abstraction layer, and **Python integration** for machine learning models.

### Data Storage Solutions
The application employs a **flexible storage architecture** with **Drizzle ORM** for PostgreSQL, featuring type-safe schema definitions and **Drizzle Kit** for migrations. An interface-based storage layer supports both in-memory and PostgreSQL implementations. Key entities include Users, Clients, Visits, and Data Sync records.

### Machine Learning Integration
The system integrates **Python-based machine learning** using **Scikit-learn** (Random Forest) for risk classification. It processes Excel data with **pandas** to perform feature engineering based on financial metrics, generating risk scores (0-100) and urgency classifications.

### Authentication and Authorization
The application uses **session-based authentication** with **PostgreSQL-backed sessions (connect-pg-simple)**. It features secure login with bcrypt hashing, secure cookies, and session persistence. Client data is filtered based on the authenticated loan officer, and all protected routes have authentication checks. Rate limiting is implemented for authentication, file uploads, and general API requests. Loan Officer IDs must exist in client data before account creation, and only one account per ID is permitted per organization. WebSocket connections require valid session cookies for multi-tenant isolation.

### External Service Integrations
The system integrates with **Microsoft cloud services** for data sourcing, specifically for **Excel file processing from OneDrive/SharePoint** with a 30-minute scheduled sync. File uploads include security measures like size limits, MIME type validation, and filename sanitization. Robust error handling and sync status tracking are also included.

### Production Security Features
The application includes comprehensive security hardening: **multi-tenant isolation** with all database queries filtered by `organizationId` and WebSocket connections scoped per organization. It enforces request security with body size limits, CORS configuration, and secure session encryption. Password security uses bcrypt hashing and token-based first-login setup. Monitoring includes a health check endpoint and comprehensive error logging. WebSocket connections are authenticated and isolated to prevent cross-organization data leakage. Admin password reset functionality is available.

## External Dependencies

### Core Technology Stack
- **Node.js Runtime**
- **React Ecosystem**
- **PostgreSQL** (with Neon Database serverless platform)
- **Python ML Stack** (scikit-learn, pandas, requests)

### UI and Styling
- **Tailwind CSS**
- **Radix UI**
- **shadcn/ui**
- **Lucide React**

### Development and Build Tools
- **Vite**
- **TypeScript**
- **ESBuild**
- **Drizzle Kit**

### Data Processing and Validation
- **Zod**
- **React Hook Form**
- **Date-fns**
- **Class Variance Authority**

### Cloud and External Services
- **Microsoft Office Integration** (Excel processing)
- **Connect-pg-simple** (PostgreSQL session storage)
- **WebSocket** (Multi-tenant for real-time updates)
- **Fetch API**
- **Express-rate-limit**
- **i18next** (for internationalization)