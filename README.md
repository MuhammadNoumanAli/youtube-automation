# YouTube Automation Studio

[![Node Version](https://img.shields.io/badge/node-v22.12.0-blue.svg)](https://nodejs.org)
[![NestJS](https://img.shields.io/badge/backend-NestJS%2010-red.svg)](https://nestjs.com)
[![React](https://img.shields.io/badge/frontend-React%2018%20%2B%20Vite-61dafb.svg)](https://vitejs.dev)
[![Safety](https://img.shields.io/badge/mode-Private%20Uploads%20Only-green.svg)](#safety-governance)

A single-creator web application managing the lifecycle of original faceless YouTube videos: from idea backlog and research reference verification, to script drafting, asset provenance enforcement, local FFmpeg video rendering, and private YouTube Data API v3 upload.

---

## Key Principles & Safety Gates

1. **Strict Human Approval Gates:** Scripts, renders, and private uploads require explicit human confirmation. Public publishing remains hardcoded as disabled in the MVP.
2. **Asset Provenance & License Verification:** Third-party video scraping or unlicensed content is strictly prohibited. Every visual and audio asset records creator attribution, license type, and commercial authorization.
3. **Local-First & Low Recurring Cost:** Runs directly on Windows 10/11 (with a clean path to Ubuntu Linux deployment). All providers support full `mock` operation with zero external API fees.
4. **Token Security at Rest:** Sensitive OAuth tokens are encrypted at rest with AES-256-GCM. Secrets are redacted from logs and never transmitted to the client.

---

## Monorepo Architecture

```text
youtube-automation/
├── apps/
│   ├── api/             # NestJS 10 backend REST service
│   └── web/             # React 18 + Vite 6 creator dashboard
├── storage/             # Local development media storage (git-ignored)
│   ├── projects/        # Intermediate scratch assets
│   ├── assets/          # Raw ingested visual/audio media
│   ├── narration/       # Generated or imported voiceovers
│   ├── renders/         # Final rendered MP4 output files
│   └── thumbnails/      # Thumbnail images
├── docs/                # Architecture, setup, and deployment guides
├── .env.example         # Safe environment configuration template
├── PLAN.md              # Phased implementation roadmap
├── ARCHITECTURE.md      # Detailed system & database architecture
└── IMPLEMENTATION_STATUS.md # Live phase progress tracker
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
Make sure WampServer / MySQL is running, then create the database:
```sql
CREATE DATABASE youtube_automation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Run initial baseline migration:
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
# Run all unit tests
npm test

# Build production bundles
npm run build
```

---

## Documentation
- [LOCAL_SETUP.md](file:///d:/wamp64/www/youtube-automation/docs/LOCAL_SETUP.md) — Detailed Windows local development instructions.
- [ARCHITECTURE.md](file:///d:/wamp64/www/youtube-automation/ARCHITECTURE.md) — System design, database schema, 17-state lifecycle machine, security.
- [PLAN.md](file:///d:/wamp64/www/youtube-automation/PLAN.md) — Implementation roadmap across Phases 0 through 6.
- [IMPLEMENTATION_STATUS.md](file:///d:/wamp64/www/youtube-automation/IMPLEMENTATION_STATUS.md) — Real-time progress and acceptance checklist.
