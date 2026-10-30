# Security Notes

Single-user, local-first app. This file covers what the code does today and the risks you take on if you change how it runs.

## Secrets

- All secrets live in `.env` (git-ignored). `.env.example` contains placeholders only.
- `GET /api/settings/status` reports only *configured / not configured* — never secret values.
- Never paste `.env` contents, OAuth tokens or `Authorization` headers into issues, logs or screenshots.

## YouTube OAuth tokens

- Access and refresh tokens are encrypted at rest with **AES-256-GCM** (random 12-byte IV per write, 16-byte auth tag) using `YOUTUBE_TOKEN_ENCRYPTION_KEY` (64 hex chars = 32 bytes).
- The encrypted column (`channel_profiles.encrypted_oauth_tokens`) is excluded from all normal queries (`select: false`), so tokens never reach the browser. Only `YouTubeOAuthService` loads it.
- The OAuth `state` parameter is HMAC-SHA256 signed with the same key, bound to the channel profile, and expires after 10 minutes (CSRF protection).
- Scopes are limited to `youtube.upload` and `youtube.readonly`.
- **Disconnect** revokes the grant at Google and deletes local tokens. An `invalid_grant` on refresh deletes the stored tokens automatically.
- Rotating the key makes stored tokens unreadable: disconnect channels first, rotate, then reconnect (see `docs/YOUTUBE_SETUP.md`).

## Publishing safety

- Uploads are hard-coded to `privacyStatus: private`. There is no public or scheduled publishing path.
- `ENABLE_YOUTUBE_UPLOADS=false` (default) runs a mock staging that sends nothing to YouTube.
- An upload requires an approved script, a validated render, and a fresh human upload approval recorded *after* the latest render.
- The creator must declare audience (made for kids) and altered/synthetic content before a live upload.
- The same render cannot be uploaded twice by accident.

## Network exposure

- The API binds to `HOST=127.0.0.1` by default and has **no authentication**. It is only safe bound to your own machine. Do not expose ports 3000/5173 to your LAN or the internet (no port-forwarding, no `0.0.0.0` binding on shared networks) until dashboard authentication is added (planned before any Ubuntu deployment).
- CORS allows only `WEB_ORIGIN` and the local Vite dev origins.

## Files

- Generated media lives under `STORAGE_ROOT` (git-ignored) and is never stored in MySQL.
- FFmpeg is invoked with `spawn` and an argument array, not a shell string.

## Backups

- Back up the MySQL database (`mysqldump youtube_automation > backup.sql`) **and** your `.env`. Without the same `YOUTUBE_TOKEN_ENCRYPTION_KEY`, restored tokens cannot be decrypted — you would just reconnect the channel.
- Back up `storage/` if you want to keep renders and narration.
