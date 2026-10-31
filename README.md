# YouTube Automation Studio

[![Node Version](https://img.shields.io/badge/node-v22.12.0-blue.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/backend-NestJS%2010-red.svg)](https://nestjs.com)
[![React](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite-61dafb.svg)](https://vitejs.dev)
[![Tests](https://img.shields.io/badge/tests-65%20passed%20%2F%2011%20suites-brightgreen.svg)](https://jestjs.io)
[![Safety](https://img.shields.io/badge/mode-Private%20Uploads%20Only-green.svg)](#safety-governance)
[![Status](https://img.shields.io/badge/phases-Phase%200%20to%206%20Complete-success.svg)](IMPLEMENTATION_STATUS.md)

A local-first, single-creator web application managing the entire end-to-end lifecycle of original faceless YouTube videos: from idea backlog and research reference verification, to script drafting, asset provenance enforcement, local FFmpeg video rendering, database-backed background jobs, strictly private YouTube Data API v3 staging, and live read-only channel analytics.

---

## Key Principles & Safety Gates

1. **Strict Human Approval Gates:** Scripts, renders, and private uploads require explicit human confirmation. Public publishing remains permanently disabled (`ENABLE_PUBLIC_RELEASE=false`) in the MVP.
2. **Asset Provenance & License Verification:** Third-party video scraping or unlicensed content is strictly prohibited. Every visual and audio asset records SHA-256 digests, creator attribution, license type, and commercial authorization.
3. **Local-First & Low Recurring Cost:** Runs directly on Windows 10/11 with zero external cloud dependencies (using Windows SAPI natural speech for offline voiceover and local FFmpeg for rendering). Supports full `mock` operation with zero external API fees.
4. **Token Security at Rest:** Sensitive Google OAuth refresh and access tokens are encrypted at rest with AES-256-GCM. Secrets are redacted from logs and never transmitted to the client.
5. **Database-Backed Asynchronous Jobs:** Long-running renders, uploads, and maintenance cleanup run through an atomic lease-locked job queue with idempotency keys, exponential backoff retries, and an immutable audit trail.
6. **Live Channel Analytics:** Read-only YouTube Data API v3 channel performance metrics (subscribers, views, video counts) surfaced on the dashboard.

---

## Monorepo Architecture

```text
youtube-automation/
├── apps/
│   ├── api/             # NestJS 10 backend REST service & TypeORM database models
│   └── web/             # React 18 + Vite 6 creator dashboard & staging studio
├── storage/             # Local development media storage (git-ignored)
│   ├── projects/        # Intermediate scratch assets
│   ├── assets/          # Raw ingested visual/audio media (with SHA-256 provenance)
│   ├── narration/       # Generated (Windows SAPI / TTS) or imported voiceovers
│   ├── renders/         # Final rendered MP4 output files
│   └── scratch/         # Temporary worker scratch files
├── docs/                # Architecture, setup, and deployment guides
│   ├── LOCAL_SETUP.md   # Windows 10/11 local development runbook
│   ├── SECURITY.md      # Security model, encryption, and threat analysis
│   ├── YOUTUBE_SETUP.md # Google Cloud Console OAuth 2.0 configuration guide
│   └── UBUNTU_DEPLOYMENT.md # Ubuntu 22.04/24.04 LTS Nginx, SSL & PM2 production guide
├── docker-compose.yml   # Containerized MySQL 8.0 with volume persistence
├── .env.example         # Safe environment configuration template
├── PLAN.md              # Phased implementation roadmap
├── ARCHITECTURE.md      # Detailed system & database architecture
└── IMPLEMENTATION_STATUS.md # Live phase progress tracker & acceptance criteria
```

---

## Quick Start (Local Windows)

### 1. Setup Environment
```powershell
Copy-Item .env.example .env
```

### 2. Install Dependencies
```powershell
npm install
```

### 3. Initialize MySQL Database
Make sure local MySQL / WampServer is running, or start via Docker:
```bash
# Option A: Local WampServer / MySQL
# Create database: CREATE DATABASE youtube_automation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

# Option B: Docker Compose
docker compose up -d mysql
```

Run database migrations:
```powershell
npm run migration:run --workspace=api
```

### 4. Start Development Servers
In separate terminals:
```powershell
# Backend API (http://localhost:3000/api and Swagger at http://localhost:3000/api/docs)
npm run start:api

# Frontend Dashboard (http://localhost:5173)
npm run start:web
```

---

## Testing & Quality Assurance

```powershell
# Run all 65 unit tests across 11 test suites
npm test

# Build production bundles for API and Web
npm run build
```

---

## Production Deployment (Ubuntu 22.04 / 24.04 LTS)

For deploying to production servers with Nginx reverse proxy, Let's Encrypt SSL, PM2 process management, and automated scratch disk cleaners, refer to:
- [UBUNTU_DEPLOYMENT.md](file:///d:/wamp64/www/youtube-automation/docs/UBUNTU_DEPLOYMENT.md)

---

## Documentation Index
- [LOCAL_SETUP.md](file:///d:/wamp64/www/youtube-automation/docs/LOCAL_SETUP.md) — Windows local development instructions.
- [YOUTUBE_SETUP.md](file:///d:/wamp64/www/youtube-automation/docs/YOUTUBE_SETUP.md) — Google Cloud OAuth 2.0 & YouTube Data API v3 setup.
- [SECURITY.md](file:///d:/wamp64/www/youtube-automation/docs/SECURITY.md) — AES-256-GCM token encryption, CSRF protection, and audit logging.
- [UBUNTU_DEPLOYMENT.md](file:///d:/wamp64/www/youtube-automation/docs/UBUNTU_DEPLOYMENT.md) — Comprehensive Ubuntu production deployment guide.
- [ARCHITECTURE.md](file:///d:/wamp64/www/youtube-automation/ARCHITECTURE.md) — System design, database schema, 17-state lifecycle machine, security.
- [IMPLEMENTATION_STATUS.md](file:///d:/wamp64/www/youtube-automation/IMPLEMENTATION_STATUS.md) — Acceptance criteria checklist and audit log.
