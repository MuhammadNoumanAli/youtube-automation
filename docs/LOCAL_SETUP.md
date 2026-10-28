# Local Windows Development Setup Guide

> **Project:** YouTube Automation Studio  
> **Environment:** Windows 10/11 Local-First

---

## 1. Prerequisites Audit

Ensure the following tools are installed:
- **Node.js**: v22.x LTS (detected: `v22.12.0`)
- **npm**: >= 10.x (detected: `10.9.0`)
- **MySQL**: MySQL 8.x (WampServer MySQL 8.0.40 installed on system)
- **FFmpeg**: Modern build with H.264 & AAC support (detected: `8.0.1-gyan.dev` in `C:\WINDOWS\system32\ffmpeg.exe`)
- **FFprobe**: Place `ffprobe.exe` in PATH or configure `FFPROBE_PATH` in `.env` before Phase 3.

---

## 2. Database Initialization (WampServer MySQL)

### Step 2.1: Start MySQL Service
If WampServer is not currently running in the system tray, start the MySQL service via PowerShell (Run as Administrator):
```powershell
Start-Service wampmysqld64
```
Alternatively, launch WampServer from your desktop or start menu.

### Step 2.2: Create Application Database
Log in to MySQL using the WampServer MySQL client or Command Prompt:
```cmd
"D:\wamp64\bin\mysql\mysql8.0.40\bin\mysql.exe" -u root -p
```
*(Press Enter if your local root password is empty)*

Execute the database creation SQL:
```sql
CREATE DATABASE IF NOT EXISTS `youtube_automation`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;
```

---

## 3. Environment Configuration

Copy the `.env.example` template to `.env`:
```powershell
Copy-Item .env.example .env
```

Verify the database credentials match your local WampServer settings:
```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=
DB_DATABASE=youtube_automation
```

All external AI, TTS, and YouTube upload flags remain safely in `mock` mode:
```dotenv
TEXT_PROVIDER=mock
TTS_PROVIDER=mock
ENABLE_EXTERNAL_API_CALLS=false
ENABLE_YOUTUBE_UPLOADS=false
ENABLE_PUBLIC_RELEASE=false
```

---

## 4. Run Database Migrations

Apply the Phase 1 baseline schema (`channel_profiles`, `video_projects`, `audit_events`):
```powershell
npm run migration:run --workspace=api
```

To revert if needed:
```powershell
npm run migration:revert --workspace=api
```

---

## 5. Running the Application

### Start Backend API (NestJS):
```powershell
npm run start:api
```
- Base API: `http://localhost:3000/api`
- Swagger OpenAPI Docs: `http://localhost:3000/api/docs`
- Health Probe: `http://localhost:3000/api/health`
- Settings Status: `http://localhost:3000/api/settings/status`

### Start Frontend Dashboard (React + Vite):
In a separate terminal:
```powershell
npm run start:web
```
- Dashboard: `http://localhost:5173`

---

## 6. Running Checks & Tests

Execute test suite:
```powershell
npm test
```

Execute full build check:
```powershell
npm run build
```
