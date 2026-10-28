# YouTube Automation Studio — Master Implementation Plan

> **Specification Reference:** `youtube-automation-studio-master-prompt.md`  
> **Target OS:** Windows 10/11 Local-First (with clean path to Ubuntu Linux deployment)  
> **Guiding Principles:** Original content, low recurring cost, modular providers, FFmpeg local rendering, safe private-only YouTube uploads, strict human approval gates.

---

## 1. Project Overview & Strategy

YouTube Automation Studio is a single-creator web application managing the entire lifecycle of original faceless YouTube videos:
from idea generation and factual source research, to script writing, narration, asset provenance verification, local FFmpeg video rendering, and private YouTube Data API v3 upload.

### Core Non-Negotiables
1. **Human Approval Gates:** No script rendering or YouTube upload without explicit approval. Public publishing remains strictly disabled in MVP.
2. **Provenance & Copyright Safety:** No scraping or unauthorized reuse of third-party videos. Every visual and audio asset must have provenance, attribution, and license details recorded.
3. **Local-First & Modular:** Runs locally on Windows directly; provider abstractions allow full testing in `mock` mode with zero external API expenses.
4. **Credential & Secret Protection:** OAuth refresh tokens encrypted with AES-256-GCM; secrets redacted from logs and never transmitted to the frontend.

---

## 2. Phase-by-Phase Roadmap

### Phase 0: Workspace Inspection & Architecture Blueprint `[CURRENT]`
- [x] Inspect local tools: Node.js (v22.12.0), npm (10.9.0), NestJS CLI (10.4.5), Git (2.40.0), FFmpeg (8.0.1-gyan).
- [x] Inspect database environment: WampServer MySQL services detected (`mysql8.0.40`, `wampmysqld64` service).
- [x] Identify tool gaps: `ffprobe.exe` requires standalone binary or path linkage; MySQL service needs database `youtube_automation` created.
- [x] Author core architectural and planning documents:
  - `PLAN.md` (this file)
  - `ARCHITECTURE.md`
  - `IMPLEMENTATION_STATUS.md`
  - `.env.example`
  - `.gitignore`
- [ ] Submit Phase 0 report and await user approval before scaffold.

---

### Phase 1: Repository Scaffold & Local Foundation
*Objective: Build the monorepo foundation with NestJS backend, React/Vite frontend, TypeORM MySQL migrations, configuration validation, and health checks.*

- **Backend (`apps/api`):**
  - Initialize NestJS app with strict TypeScript (`tsconfig.json`).
  - Install dependencies: `@nestjs/config`, `@nestjs/swagger`, `class-validator`, `class-transformer`, `typeorm`, `mysql2`.
  - Configure `ConfigModule` with strict Joi/class-validator schema validation for `.env`.
  - Implement Swagger/OpenAPI at `/api/docs`.
  - Implement `HealthModule` with `/api/health` checking database connectivity and storage directory accessibility.
  - Implement `SettingsModule` with `/api/settings/status` exposing configured/mock status of providers without exposing secrets.
  - Configure TypeORM with migrations (`src/database/migrations`) and disable auto-synchronize in production.
  - Build baseline entities: `ChannelProfile`, `VideoProject`, `AuditEvent`.
  - Create initial baseline migration.
- **Frontend (`apps/web`):**
  - Initialize React + TypeScript + Vite app.
  - Setup clean dashboard styling (CSS modules/modern design tokens).
  - Configure proxy to backend at `/api`.
  - Implement shell navigation (Dashboard, Ideas, Projects, Channels, Settings).
- **Validation & Gates:**
  - `npm run build` succeeds for both apps.
  - `npm run test` passes baseline tests.
  - Database connects and migration executes successfully.
  - Phase 1 sign-off checkpoint.

---

### Phase 2: Topics, Research, Projects & Scripting
*Objective: Implement channel profiles, idea tracking, research reference management, and modular AI/mock script generation with human approval.*

- **Data Models:**
  - Entities & Migrations for `Topic`, `ResearchSource`, `Script` (with JSON scene plans and version history).
- **AI Provider Abstraction:**
  - Define `TextGenerationProvider` interface:
    - `generateScript(input: ScriptPromptDto): Promise<ScriptResultDto>`
    - `generateScenePlan(input: ScriptDto): Promise<ScenePlanDto>`
    - `generateMetadata(input: ScriptDto): Promise<VideoMetadataDto>`
  - Implement `MockTextProvider` (returns realistic structured sample data, marked with mock badge).
  - Implement `OpenAiTextProvider` and `AnthropicTextProvider` adapters (guarded by `ENABLE_EXTERNAL_API_CALLS`).
  - Implement `AiProviderFactory` selecting provider based on `TEXT_PROVIDER` env variable.
- **Business Logic & Endpoints:**
  - Channel profiles CRUD (`/api/channels`).
  - Ideas and topics backlog (`/api/topics`).
  - Video projects lifecycle creation (`/api/projects`).
  - Research sources tracking with URL, author, verification status (`/api/projects/:id/research`).
  - Script draft generation, manual editing, and version comparison (`/api/projects/:id/scripts`).
  - Explicit script approval endpoint (`/api/scripts/:id/approve`) transitioning project from `script_review` to `script_approved`.
- **UI Views:**
  - Topic Ideation board.
  - Video Project Detail view: Script Editor, Scene Plan breakdown, and Research Sources checklist.
  - Script Approval modal with diff viewer.
- **Validation & Gates:**
  - Unit tests for script state transitions and mock provider generation.
  - Phase 2 sign-off checkpoint.

---

### Phase 3: Assets, Narration & Local FFmpeg Video Rendering
*Objective: Asset provenance management, TTS narration generation/import, safe FFmpeg video rendering, and FFprobe output validation.*

- **Asset Management:**
  - Entity & Migration for `Asset` (record checksum sha256, license type, attribution, commercial suitability, local storage path).
  - Asset upload and metadata management (`/api/projects/:id/assets`).
  - Provenance validation gate (blocks render approval if license is unverified).
- **Narration Pipeline:**
  - Define `TextToSpeechProvider` interface: `synthesize(text, voiceOptions): Promise<AudioBufferResult>`.
  - Implement `MockTtsProvider` and `ElevenLabsTtsProvider`.
  - Narration audio file upload/import endpoint for creator-recorded voiceovers.
- **FFmpeg Rendering Service:**
  - Binary detection service verifying `ffmpeg` and `ffprobe` availability and codecs.
  - Safe argument array construction (using `child_process.spawn`, avoiding shell injection).
  - Audio-visual timeline compositor:
    - Combines assets according to the approved scene plan.
    - Synchronizes narration track.
    - Adds optional ducked background music (royalty-free/licensed only).
    - Burns subtitles / exports SRT file.
    - Generates 16:9 standard and 9:16 Shorts formats.
  - FFprobe output verification: checks duration, resolution, frame rate, audio/video codecs, and file integrity.
- **Render Review UI:**
  - In-browser video player previewing rendered output.
  - Technical checks summary (duration, resolution, file size, codec compliance).
  - Provenance checklist confirmation.
  - Explicit approval/rejection buttons (`/api/projects/:id/render-approval`).
- **Validation & Gates:**
  - Unit tests for FFmpeg argument generation and license gate checks.
  - End-to-end rendering test using sample assets producing a verified MP4 file.
  - Phase 3 sign-off checkpoint.

---

### Phase 4: YouTube Data API v3 OAuth & Private Uploads
*Objective: Secure Google OAuth 2.0 flow, encrypted token storage, private video upload, and upload state tracking.*

- **Security & OAuth Architecture:**
  - Google OAuth 2.0 flow with cryptographically random `state` parameter to prevent CSRF.
  - AES-256-GCM encryption service for storing refresh/access tokens in `channel_profiles`.
  - Safe token refresh mechanism with rate limit handling.
  - Endpoint `/api/youtube/status` returning connection status without exposing tokens.
- **YouTube Publisher Service:**
  - Abstraction: `YouTubePublisher` interface (`uploadPrivate`, `updateMetadata`).
  - Implement `MockYouTubePublisher` (returns simulated video ID for automated local testing).
  - Implement `GoogleYouTubeDataApiPublisher` using `googleapis` YouTube Data API v3.
  - Upload parameters:
    - Mandatory `privacyStatus: 'private'`.
    - Made for kids flag (creator confirmation required).
    - Synthetic/altered content disclosure flag where applicable.
    - Title, description, tags, category ID.
  - Resumable upload handling for large video files.
- **Upload Review UI:**
  - Dedicated pre-upload inspection view showing thumbnail, title, description, tags, and audience settings.
  - Prominent badge: **"Upload Mode: PRIVATE ONLY"**.
  - Explicit human confirmation checkbox before initiation.
  - Direct link to YouTube Studio (`https://studio.youtube.com/video/<id>/edit`) once uploaded.
- **Validation & Gates:**
  - Token encryption unit tests (round-trip encrypt/decrypt).
  - Upload metadata validation tests (ensuring `privacyStatus === 'private'`).
  - Phase 4 sign-off checkpoint.

---

### Phase 5: Job Execution, Idempotency & System Reliability
*Objective: Persistent background job runner with locking, retry backoff, idempotency safeguards, and audit logging.*

- **Job System:**
  - Entity & Migration for `Job` and `AuditEvent`.
  - Database-backed job queue with atomic lease locks (`locked_at`, `attempt_count`, `max_attempts`).
  - Idempotency guards preventing duplicate render jobs or accidental double-uploads.
  - Job retry mechanism with exponential backoff for transient failures (e.g., network hiccups).
  - Cancel running jobs and safely terminate orphan FFmpeg processes.
- **Cleanup & Retention:**
  - Temporary rendering scratch file cleaner.
  - Storage quota monitor.
- **Audit & Jobs Dashboard:**
  - Jobs queue monitor view (active, pending, failed, completed).
  - Audit log table tracking key events (script approved, render approved, OAuth connected, upload submitted).
- **Validation & Gates:**
  - Unit tests verifying lease lock contention and retry limit handling.
  - Phase 5 sign-off checkpoint.

---

### Phase 6: Production Polish & Documentation Deliverables
*Objective: Operational hardening, analytics, comprehensive documentation, and Ubuntu deployment pathway.*

- **Analytics:**
  - Basic channel/video statistics read-only endpoint using YouTube Data API.
- **Documentation Suite:**
  - `README.md`: System overview, prerequisites, fast bootstrap instructions.
  - `docs/LOCAL_SETUP.md`: Windows local configuration, WampServer/MySQL setup, FFmpeg installation, migration steps.
  - `docs/YOUTUBE_SETUP.md`: Step-by-step Google Cloud Console setup, OAuth consent screen, quota calculations, upload troubleshooting.
  - `docs/SECURITY.md`: Secret redaction, AES-256 token encryption, network exposure warnings, file sanitization.
  - `docs/UBUNTU_DEPLOYMENT.md`: Production guide for Ubuntu 22.04/24.04 LTS (Nginx reverse proxy, PM2 process management, systemd, TLS/certbot).
  - `docker-compose.yml`: Optional local MySQL 8 container for developers not using WampServer.
- **Final Acceptance Sign-Off:**
  - Full audit against Section 14 MVP Acceptance Criteria.

---

## 3. Communication & Review Cadence
- After each phase, a detailed progress report will be delivered covering:
  1. Files created and modified (with links).
  2. Commands executed and their exact exit codes/output.
  3. Verification tests and results.
  4. Any required external credentials or actions required by the user.
  5. Updated `IMPLEMENTATION_STATUS.md`.
- No subsequent phase will be started without explicit approval.
