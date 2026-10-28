# Master Project Prompt: YouTube Automation Studio

> **Purpose:** Give this document to Claude Code as the project brief and implementation contract.
>
> **Project approach:** Build locally on Windows first, with a clean path to Ubuntu deployment later. Use original-content workflows, modular AI providers, FFmpeg rendering, YouTube Data API uploads, and manual approval before publication.

---

## 1. Role and Working Rules

You are the lead software architect and senior full-stack engineer responsible for building **YouTube Automation Studio**, a maintainable application for planning, producing, reviewing, and publishing original faceless YouTube videos.

Work incrementally. Do not attempt to generate the entire system in one response.

### Required working rules

1. Inspect the current repository before making changes. If it is empty, scaffold the project.
2. First create `PLAN.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, and `.env.example`.
3. Implement one phase at a time. At the end of each phase:
   - run relevant tests and type checks;
   - report files created or changed;
   - list commands run and their results;
   - identify configuration still needed;
   - update `IMPLEMENTATION_STATUS.md`;
   - stop and wait for approval before proceeding to the next phase.
4. Never claim that a command, test, upload, API integration, or feature succeeded unless it was actually run and verified.
5. Prefer small, well-structured modules, clear types, DTO validation, useful logs, and automated tests.
6. Do not hard-code API keys, OAuth tokens, passwords, channel IDs, file paths, or provider-specific assumptions.
7. Keep secrets out of Git, logs, API responses, screenshots, and error messages.
8. Use stable, maintained package versions compatible with the selected Node.js LTS version. Explain major package choices before adding unnecessary dependencies.
9. Make the project usable on local Windows development machines and deployable to Ubuntu Linux later. Avoid Windows-only assumptions in application logic.
10. Do not use a paid external API when a free local option is suitable. Do not assume browser ChatGPT/Claude subscriptions include API credits.
11. Never automatically download, crop, mirror, shift, reframe, or lightly modify third-party YouTube videos to evade copyright or reused-content checks.
12. Support only content that is original, user-provided, public-domain where verified, or licensed for the intended use. Record asset provenance and license notes.
13. Default to private YouTube uploads. **Never publish or schedule a public release without explicit human approval.**
14. Do not bypass YouTube API quotas, OAuth consent, platform restrictions, copyright detection, or monetization policies.
15. If information is missing, make safe, documented defaults where reasonable. Ask a question only when the missing information blocks the current phase.

---

## 2. Product Vision

Build a single-user-first web application that manages the lifecycle of original faceless YouTube videos:

1. Configure channel and niche.
2. Collect and organize video ideas.
3. Research topics and store source references.
4. Generate an original script, scene plan, and metadata using a configurable AI provider.
5. Review and edit scripts.
6. Create narration through a configurable text-to-speech provider or import a user-recorded voice track.
7. Manage original recordings, generated visuals, and licensed assets with provenance.
8. Render a finished video locally with FFmpeg.
9. Validate the output and show a preview.
10. Require human approval.
11. Upload as **private** through YouTube Data API v3.
12. Track upload status and video ID.
13. Allow the user to manage publication visibility only through an explicit approval flow.
14. Record errors, retries, costs where known, and job history.

The first release should be practical for one creator. Keep interfaces modular so multi-channel and multi-user support can be added later without building it prematurely.

### Out of scope for the first release

- Automatically scraping or reusing YouTube videos.
- Automatically publishing public videos without approval.
- Guaranteed viral growth, earnings, or monetization.
- A complex multi-tenant SaaS billing system.
- Training or hosting large AI models.
- Automatically making copyright or fair-use legal determinations.
- Automatically generating realistic synthetic depictions of real people without safeguards and required disclosures.
- Fully automated trend research dependent on unapproved scraping.

---

## 3. Target Development Environment

### Local-first

- OS: Windows 10/11.
- Runtime: supported Node.js LTS, preferably Node.js 22 or a newer supported LTS compatible with dependencies.
- Language: TypeScript with strict mode.
- Backend: NestJS.
- Database: MySQL 8.
- ORM: TypeORM, using migrations.
- Video rendering: FFmpeg and FFprobe installed locally.
- Frontend: React + TypeScript + Vite, unless the existing repository has a suitable frontend already.
- UI: clean responsive dashboard; use a maintained component library only if it materially improves delivery.
- API docs: Swagger/OpenAPI.
- Validation: class-validator/class-transformer or the project's consistent equivalent.
- Testing: Jest and Supertest, plus service-level unit tests.
- Local orchestration: optional Docker Compose for MySQL; the app and FFmpeg may run directly on Windows.
- Future deployment: Ubuntu + Nginx + PM2 or Docker, depending on documented operational tradeoffs.

Do not require Docker to run the entire app locally. Provide a straightforward non-Docker setup as well as optional Docker Compose for MySQL.

### Suggested repository layout

Use a monorepo only if it keeps the project simple. Suggested structure:

```text
youtube-automation-studio/
├── apps/
│   ├── api/                     # NestJS backend
│   └── web/                     # React + Vite dashboard
├── packages/
│   └── shared/                  # Shared types only if genuinely needed
├── storage/                     # Local development assets; ignored by Git
│   ├── projects/
│   ├── assets/
│   ├── narration/
│   ├── renders/
│   └── thumbnails/
├── docs/
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── YOUTUBE_SETUP.md
│   └── LOCAL_SETUP.md
├── .env.example
├── .gitignore
├── PLAN.md
├── IMPLEMENTATION_STATUS.md
└── README.md
```

Adapt the layout to the actual repository if needed. Never store credentials or large generated media in Git.

---

## 4. Architecture and Modules

Create well-defined NestJS modules with clear responsibilities:

- `health`: health/readiness endpoints.
- `settings`: safe configuration view and provider status (never expose secrets).
- `channels`: local channel profiles and YouTube connection status.
- `topics`: ideas, niche, target audience, and content status.
- `research`: source references, notes, publication dates, and research status.
- `ai-providers`: provider interface and implementations.
- `scripts`: script generation, versions, editing, approval.
- `assets`: asset records, file paths, source, license, creator, attribution, usage notes, checksum.
- `narration`: TTS provider interface, voice configuration, and uploaded narration.
- `rendering`: scene plans, FFmpeg command construction, render queue, FFprobe validation.
- `thumbnails`: thumbnail generation/import and metadata.
- `videos`: lifecycle orchestration and video project detail.
- `youtube`: OAuth, channel details, private upload, upload status, metadata updates.
- `approvals`: explicit approval records and state transitions.
- `jobs`: job scheduling, retries, locking, cancellation, and execution history.
- `analytics`: basic video/channel metrics where the YouTube API supports access.
- `audit`: important state changes and approval actions.

Use interfaces for providers so services can be swapped without changing business logic.

### Provider interfaces

Implement contracts similar to:

- `TextGenerationProvider.generateScript(input)`
- `TextGenerationProvider.generateMetadata(input)`
- `TextGenerationProvider.generateScenePlan(input)`
- `TextToSpeechProvider.synthesize(input)`
- `VisualAssetProvider` (optional; do not require AI video generation for MVP)
- `VideoRenderer.render(project, outputPath)`
- `YouTubePublisher.uploadPrivate(videoPath, metadata)`
- `YouTubePublisher.updateMetadata(videoId, metadata)`

Provide:
- a real adapter only when credentials and documented APIs are available;
- a mock provider for local development and tests;
- clear “not configured” status if credentials are absent;
- provider-specific error handling and rate-limit handling.

Do not pretend mock-generated output is real AI content. Clearly label mock mode in the UI and logs.

---

## 5. Database Design

Use MySQL migrations and proper foreign keys, indexes, timestamps, and deletion strategy. Avoid storing large video/audio blobs in MySQL; store files on disk or object storage and save metadata/path references.

Create at least the following entities. Exact fields can be refined during Phase 1 and documented.

### `channel_profiles`
- `id`
- `name`
- `niche`
- `target_regions` (e.g. US, UK)
- `language`
- `youtube_channel_id` nullable
- `created_at`, `updated_at`

### `video_projects`
- `id`
- `channel_profile_id`
- `title`
- `working_title`
- `topic`
- `target_audience`
- `format` (`long_form`, `short`)
- `target_duration_seconds`
- `status`
- `script_version`
- `created_at`, `updated_at`

### `research_sources`
- `id`
- `video_project_id`
- `url`
- `title`
- `publisher`
- `published_at` nullable
- `accessed_at`
- `notes`
- `claim_supported`
- `source_type`
- `verification_status`

### `scripts`
- `id`
- `video_project_id`
- `version`
- `content`
- `outline_json`
- `scene_plan_json`
- `metadata_json`
- `provider`
- `model`
- `status`
- `created_at`

### `assets`
- `id`
- `video_project_id`
- `asset_type` (`screen_recording`, `image`, `video`, `audio`, `music`, `graphic`, `other`)
- `storage_path`
- `original_filename`
- `mime_type`
- `checksum_sha256`
- `source_url` nullable
- `creator` nullable
- `license_type`
- `license_notes`
- `attribution_text` nullable
- `commercial_use_allowed`
- `proof_of_permission_path` nullable
- `created_at`

### `narrations`
- `id`
- `video_project_id`
- `script_id`
- `provider`
- `voice_id`
- `storage_path`
- `duration_seconds`
- `status`
- `created_at`

### `render_jobs`
- `id`
- `video_project_id`
- `status`
- `output_path`
- `thumbnail_path` nullable
- `ffmpeg_command_summary` (do not store secrets)
- `started_at`, `finished_at`
- `error_code`, `error_message`
- `created_at`

### `approval_records`
- `id`
- `video_project_id`
- `approval_type` (`script`, `assets`, `render`, `upload`, `public_release`)
- `decision` (`approved`, `rejected`)
- `notes`
- `approved_by`
- `created_at`

### `youtube_uploads`
- `id`
- `video_project_id`
- `youtube_video_id` nullable
- `privacy_status`
- `upload_status`
- `title`
- `description`
- `tags_json`
- `category_id` nullable
- `made_for_kids`
- `contains_synthetic_media` nullable where applicable
- `published_at` nullable
- `last_error_code` nullable
- `last_error_message` nullable
- `created_at`, `updated_at`

### `jobs`
- `id`
- `job_type`
- `reference_id`
- `status`
- `attempt_count`
- `max_attempts`
- `scheduled_at`
- `started_at`, `finished_at`
- `locked_at` nullable
- `error_message` nullable
- `created_at`, `updated_at`

### `audit_events`
- `id`
- `actor`
- `action`
- `entity_type`
- `entity_id`
- `details_json`
- `created_at`

Use database enums or validated string unions consistently. Document state transitions. Add indexes for frequently queried statuses, foreign keys, and scheduled jobs. Use migrations rather than automatic production schema synchronization.

---

## 6. Video Lifecycle and Safety Gates

Use a documented state machine. Suggested project statuses:

```text
idea
researching
script_draft
script_review
script_approved
assets_pending
ready_to_render
rendering
render_review
render_approved
ready_to_upload
uploading
uploaded_private
release_review
scheduled_or_public
failed
archived
```

Rules:

1. A script must be approved before final rendering, unless a documented local testing mode is enabled.
2. Assets must have provenance recorded. Unknown license status should block production approval unless the user explicitly records a justified, permitted basis for use.
3. Rendering must finish successfully and pass validation before upload.
4. Uploads must default to `private`.
5. An upload must not automatically become public because a job was retried.
6. Public release requires a distinct, explicit approval action and confirmation of the target channel, title, visibility, and publication time.
7. Record approvals with timestamps and audit events.
8. Use idempotency protections so retries do not create duplicate projects or duplicate uploads unintentionally.
9. Provide a dry-run mode that performs local validation without making external changes.
10. If YouTube OAuth, quota, or API access is unavailable, keep the project in a clear pending/error state; never fake success.

For initial MVP, support private uploads only. Public release and scheduling can be a later phase after the approval and API behavior are verified.

---

## 7. Script and Research Requirements

Generated scripts must be original and useful, not generic paraphrases of one existing video.

For each video, store:
- target viewer and intended takeaway;
- working title and hook;
- outline and script sections;
- scene-by-scene visual instructions;
- source list for factual claims;
- suggested on-screen text;
- CTA, if appropriate;
- description and chapters where useful;
- thumbnail concept;
- disclosure flags where relevant.

Research guidelines:
- Prefer primary sources, official documentation, reputable publications, and original demonstrations.
- Save source URLs, titles, access timestamps, and which claims each source supports.
- Distinguish verified facts from opinion and speculation.
- Never fabricate sources, quotes, statistics, experiments, or product features.
- Flag claims that could not be independently verified for human review.
- Avoid copying other creators' scripts, thumbnails, narration, or distinctive formats.
- Use brief quotations only where justified and appropriately attributed; do not reproduce articles or scripts.
- Add an editable disclaimer field where a video needs context or limitations.

---

## 8. AI Provider Configuration

Use environment variables, with safe defaults and a provider abstraction.

Example `.env.example`:

```dotenv
NODE_ENV=development
PORT=3000
WEB_ORIGIN=http://localhost:5173
API_BASE_URL=http://localhost:3000

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=youtube_app
DB_PASSWORD=change_me
DB_DATABASE=youtube_automation

STORAGE_ROOT=./storage

TEXT_PROVIDER=mock
OPENAI_API_KEY=
OPENAI_MODEL=
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=

TTS_PROVIDER=mock
TTS_API_KEY=
TTS_VOICE_ID=

YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback
YOUTUBE_TOKEN_ENCRYPTION_KEY=

ENABLE_EXTERNAL_API_CALLS=false
ENABLE_YOUTUBE_UPLOADS=false
ENABLE_PUBLIC_RELEASE=false
```

Do not assume every provider uses the same request format, model names, audio format, or usage limits. Implement and document adapters against current official provider documentation. Validate required environment variables when a feature is enabled, not when mock mode is used.

Security requirements:
- Never commit `.env`.
- Encrypt stored OAuth tokens at rest using authenticated encryption and a key from environment configuration.
- Do not send OAuth tokens to the frontend.
- Do not log API keys, refresh tokens, authorization headers, or sensitive query strings.
- Provide a safe status endpoint that reports configured/not configured, never the secret value.
- Support token revocation/disconnection.
- Use least-privilege OAuth scopes required by the features being implemented.
- Document local OAuth callback configuration and any consent-screen requirements.

---

## 9. FFmpeg Rendering Pipeline

Create a rendering service that invokes FFmpeg with safe argument handling. Prefer `spawn` with an argument array over constructing shell commands from user-controlled strings.

MVP output:
- MP4 container;
- H.264 video and AAC audio where supported;
- 16:9 landscape default, with an option for 9:16 Shorts;
- configurable resolution and frame rate;
- subtitles burned in or provided as a separate SRT file;
- narration synchronized with scene timings;
- optional background music only when licensed and mixed at a safe level;
- a generated or imported thumbnail;
- output duration, resolution, codec and file size checked with FFprobe.

Requirements:
- Check that FFmpeg and FFprobe exist before enabling rendering.
- Capture stderr and progress without flooding logs.
- Support cancellation and clean up temporary files.
- Handle paths with spaces and Windows path separators.
- Set resource and duration limits for jobs.
- Do not allow arbitrary command execution through the API.
- Do not overwrite source assets.
- Keep intermediate files in per-project temporary directories and clean them only after a successful render and according to retention settings.
- Make templates configurable; don't hard-code a single visual style.

Start with a simple template that can combine user-provided screen recordings/images, narration, title cards, captions, and an outro. Do not require generated AI video for the first version.

---

## 10. YouTube Data API Integration

Implement the YouTube integration against the current official YouTube Data API v3 documentation.

Required flow:
1. User initiates OAuth connection from the dashboard.
2. Backend generates a secure OAuth authorization URL with state/CSRF protection.
3. Backend handles callback and validates state.
4. Backend securely stores encrypted refresh/access token data as appropriate.
5. Dashboard shows the connected channel name/ID and connection status.
6. User chooses a completed video and reviews metadata.
7. Backend uploads the video with `privacyStatus: private`.
8. Store the returned video ID and upload state.
9. Handle resumable uploads, network failures, quota errors, expired tokens, and retries appropriately.
10. Provide a link to the YouTube Studio/video details when a real video ID is available.
11. Do not mark an upload complete until the API response and status checks support that claim.

Official starting points:
- YouTube Data API: https://developers.google.com/youtube/v3
- Uploading videos: https://developers.google.com/youtube/v3/guides/uploading_a_video
- OAuth 2.0: https://developers.google.com/identity/protocols/oauth2
- YouTube API quota calculator/documentation: https://developers.google.com/youtube/v3/determine_quota_cost

Do not hard-code assumptions about API quota costs. Consult current documentation and surface quota errors clearly. New or unverified API projects may be subject to restrictions on uploads or audit requirements; document the current limitations and do not promise public uploads will work before the project and OAuth configuration are verified.

For each video, support:
- title;
- description;
- tags;
- category ID;
- language where supported;
- audience / made-for-kids setting;
- privacy status;
- synthetic/altered content disclosure where applicable and supported by the API.

The UI must ask the creator to make the appropriate audience and disclosure decisions. Never infer “not made for kids” or “no synthetic content disclosure needed” solely from an AI-generated script.

For the MVP, upload privately only. Do not implement an unattended public publishing path.

---

## 11. Frontend Requirements

Build a clean, responsive creator dashboard with these pages:

1. **Dashboard**
   - projects by status;
   - recent jobs and errors;
   - rendered videos awaiting review;
   - provider and YouTube connection status.

2. **Channel Settings**
   - channel name, niche, target regions, language;
   - provider setup status;
   - YouTube OAuth connect/disconnect;
   - safe settings validation.

3. **Ideas**
   - create/edit/archive topic;
   - priority and topic status;
   - target format and intended viewer.

4. **Video Project**
   - research sources;
   - script editor with version history;
   - scene plan;
   - asset list and license/provenance fields;
   - narration and render status;
   - generated metadata.

5. **Render Review**
   - video preview;
   - title, description, thumbnail and technical checks;
   - asset provenance checklist;
   - approve/reject with notes.

6. **Upload Review**
   - selected channel;
   - video and metadata preview;
   - visibility clearly shown as PRIVATE;
   - explicit confirmation checkbox;
   - upload progress, errors, retry controls;
   - no public release button in the MVP.

7. **Jobs and Logs**
   - queued/running/succeeded/failed;
   - attempts and timestamps;
   - safe error details;
   - retry/cancel controls where safe.

Use loading, empty, error, and success states. Ensure destructive or external actions require confirmation. Never expose server filesystem paths or secret values to ordinary frontend users.

---

## 12. API Design

Use `/api` as the base prefix and version routes if appropriate. Document endpoints in Swagger.

Suggested REST endpoints:

```text
GET    /api/health
GET    /api/settings/status

GET    /api/channels
POST   /api/channels
GET    /api/channels/:id
PATCH  /api/channels/:id

GET    /api/topics
POST   /api/topics
GET    /api/topics/:id
PATCH  /api/topics/:id
DELETE /api/topics/:id

POST   /api/projects
GET    /api/projects
GET    /api/projects/:id
PATCH  /api/projects/:id

POST   /api/projects/:id/research
POST   /api/projects/:id/scripts/generate
GET    /api/projects/:id/scripts
PATCH  /api/scripts/:id
POST   /api/scripts/:id/approve

POST   /api/projects/:id/assets
GET    /api/projects/:id/assets
PATCH  /api/assets/:id

POST   /api/projects/:id/narration/generate
POST   /api/projects/:id/render
GET    /api/projects/:id/render-status
POST   /api/projects/:id/render-approval

GET    /api/youtube/connect
GET    /api/youtube/oauth/callback
GET    /api/youtube/status
POST   /api/youtube/disconnect
POST   /api/projects/:id/upload-private
GET    /api/projects/:id/upload-status

GET    /api/jobs
GET    /api/jobs/:id
POST   /api/jobs/:id/retry
POST   /api/jobs/:id/cancel
```

Refine the endpoint list as needed. Add authentication even for a local dashboard if it will bind to a non-loopback interface. For local-only MVP, bind to localhost by default and document the risk of exposing it on a network.

---

## 13. Security and Reliability

Implement:
- DTO validation and whitelist unknown fields;
- safe CORS configuration;
- rate limiting for sensitive routes;
- authentication for dashboard APIs before any network exposure;
- path traversal protection for uploaded files and asset paths;
- strict file size/type limits;
- safe FFmpeg invocation;
- secret redaction in logs;
- secure OAuth state handling;
- encrypted token storage;
- database migrations and backups documentation;
- timeouts, retry limits and exponential backoff for transient provider failures;
- idempotency protections for job creation and upload;
- file cleanup and storage quotas;
- audit events for approvals, OAuth changes, and upload actions.

Do not add a public webhook or expose local filesystem access unless required and protected.

---

## 14. Testing and Acceptance Criteria

Provide unit tests for:
- lifecycle state transitions;
- approval requirements;
- provider selection and missing configuration;
- script validation;
- asset-license/provenance gates;
- FFmpeg argument generation;
- upload metadata and privacy status;
- retry behavior and idempotency;
- OAuth state validation and token encryption helpers.

Provide integration tests using mocks for external services. Do not upload test videos to a real channel during automated tests unless a separately configured, explicitly opted-in integration test is run.

### MVP acceptance criteria

The MVP is complete only when all applicable items below are verified:

- [ ] Local setup instructions work on Windows.
- [ ] Database migrations create the schema.
- [ ] User can create a channel profile and video project.
- [ ] User can add research sources and asset license details.
- [ ] Mock mode can generate a clearly labeled sample script and scene plan.
- [ ] User can edit and approve the script.
- [ ] User can import their own narration or use a configured TTS provider.
- [ ] FFmpeg can render a sample video from supplied local assets.
- [ ] FFprobe validation reports output duration, resolution and codecs.
- [ ] User can preview the rendered video and approve/reject it.
- [ ] YouTube OAuth setup is documented and the app reports connection state correctly.
- [ ] A user can upload a test video as private after explicit confirmation.
- [ ] Upload status and returned video ID are persisted.
- [ ] API failures are visible and do not produce false success states.
- [ ] No secrets or media files are accidentally committed.
- [ ] Tests and type checks pass.
- [ ] README documents how to run, test, configure, back up, and stop the app.

If YouTube OAuth credentials or API access are unavailable, complete the mock integration and document the exact remaining configuration. Do not mark real upload acceptance criteria as complete.

---

## 15. Phased Implementation Plan

### Phase 0 — Repository inspection and design
- Inspect the repository and installed tools.
- Confirm Node.js, npm, MySQL availability, and FFmpeg/FFprobe availability.
- Write `PLAN.md`, `ARCHITECTURE.md`, `IMPLEMENTATION_STATUS.md`, and `.env.example`.
- Propose final package layout and dependencies.
- Do not implement all features yet.

### Phase 1 — Scaffold and local foundation
- Create NestJS API and React/Vite frontend.
- Configure strict TypeScript, linting, formatting, Swagger, environment validation, health check.
- Add MySQL connection, migrations, and baseline entities.
- Provide Windows setup instructions.
- Add minimal tests.

### Phase 2 — Projects, topics, research and scripts
- Implement channel profiles, topics, video projects, research sources, script versioning.
- Add provider interfaces and mock provider.
- Add one real text provider only after configuration is available.
- Build the dashboard and script review UI.

### Phase 3 — Assets, narration and rendering
- Implement asset provenance/license records.
- Add narration import and TTS abstraction.
- Implement FFmpeg/FFprobe checks and rendering.
- Build render review and approval.

### Phase 4 — YouTube OAuth and private uploads
- Implement OAuth safely.
- Add connected-channel status.
- Implement private upload and resumable upload where supported.
- Persist upload IDs and errors.
- Keep public publishing disabled.

### Phase 5 — Jobs, retries and reliability
- Add a persistent job runner with locking and safe retries.
- Prevent duplicate uploads.
- Add cancellation, cleanup, retention and audit logging.
- Add tests for failures and recovery.

### Phase 6 — Analytics and production readiness
- Add basic supported analytics.
- Improve logging, backups, configuration validation, security and documentation.
- Add optional Docker Compose and Ubuntu deployment instructions.
- Document reverse proxy, HTTPS, process manager, storage, backups and secret management.

After each phase, run tests and report status. Do not start the next phase without user approval.

---

## 16. Documentation Deliverables

Keep these files accurate as implementation progresses:

- `README.md`: project overview and quick start.
- `PLAN.md`: phases, tasks, dependencies, progress.
- `ARCHITECTURE.md`: components, data flow, state machine, key decisions.
- `IMPLEMENTATION_STATUS.md`: completed, in progress, blocked, and verified items.
- `docs/LOCAL_SETUP.md`: Windows setup, MySQL, FFmpeg, environment variables, migrations and startup.
- `docs/YOUTUBE_SETUP.md`: Google Cloud project, YouTube Data API, OAuth consent and redirect URI, token security, quota and upload troubleshooting.
- `docs/SECURITY.md`: secrets, token encryption, local network exposure, backups and file handling.
- `docs/UBUNTU_DEPLOYMENT.md`: future Ubuntu deployment.
- `.env.example`: variable names and safe placeholders only.

Do not put real credentials into documentation.

---

## 17. Start Here: Instructions for Claude Code

Begin by inspecting the current working directory and relevant files. Then:

1. Report what already exists and what tools/versions are detected.
2. Identify assumptions and major risks.
3. Create Phase 0 documentation only.
4. Propose the repository structure, package choices, initial database design and local setup.
5. Do not create the full application until Phase 0 has been reviewed and approved.

The guiding principles are **original content, low recurring cost, local-first development, modular providers, safe private uploads, verifiable progress, and a maintainable path to Ubuntu deployment**.
