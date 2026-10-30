# YouTube Data API v3 & Google OAuth 2.0 Setup Guide

This guide details the exact steps to configure Google Cloud Console, obtain OAuth 2.0 credentials, set up token encryption, and test private video uploads with YouTube Automation Studio.

---

## 1. Google Cloud Project Setup

1. Open the [Google Cloud Console](https://console.cloud.google.com/).
2. Click the project dropdown at the top and select **New Project**.
3. Name your project (e.g., `youtube-automation-studio`) and click **Create**.
4. Ensure the newly created project is selected in the top bar.

---

## 2. Enable YouTube Data API v3

1. In the Google Cloud Console navigation menu, go to **APIs & Services** > **Library**.
2. In the search box, type **YouTube Data API v3**.
3. Click on **YouTube Data API v3** from the search results.
4. Click the blue **Enable** button.

---

## 3. Configure OAuth Consent Screen

1. In the left navigation menu under **APIs & Services**, select **OAuth consent screen**.
2. Select User Type:
   - For personal Google accounts, select **External**, then click **Create**.
3. Fill in the **App Information**:
   - **App name:** `YouTube Automation Studio`
   - **User support email:** Your email address
   - **Developer contact information:** Your email address
   - Click **Save and Continue**.
4. **Scopes Configuration**:
   - Click **Add or Remove Scopes**.
   - Manually enter or search for the following scopes:
     - `https://www.googleapis.com/auth/youtube.upload` (Upload YouTube videos)
     - `https://www.googleapis.com/auth/youtube.readonly` (View YouTube account details and channel metadata)
   - Click **Update** and then **Save and Continue**.
5. **Test Users Configuration** (Important for apps in "Testing" mode):
   - In the **Test users** section, click **+ Add Users**.
   - Enter the Google email address that owns or manages the YouTube channel you want to upload to.
   - Click **Save and Continue**.
   - Review your summary and click **Back to Dashboard**.

---

## 4. Create OAuth 2.0 Client Credentials

1. In the left navigation menu under **APIs & Services**, select **Credentials**.
2. Click **+ Create Credentials** at the top, and select **OAuth client ID**.
3. Select Application type: **Web application**.
4. Set the **Name** (e.g., `Studio Web Client`).
5. Under **Authorized redirect URIs**, click **+ Add URI** and enter:
   ```
   http://localhost:3000/api/youtube/oauth/callback
   ```
   *(Note: This matches `YOUTUBE_REDIRECT_URI` in `.env`).*
6. Click **Create**.
7. A dialog will display your **Client ID** and **Client Secret**.
   - Copy both values. **Never share or commit these credentials.**

---

## 5. Token Encryption Key Generation

Stored OAuth access and refresh tokens are encrypted at rest using **AES-256-GCM** authenticated encryption.

Generate a secure 32-byte (64 hex characters) encryption key by running:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character output string.

---

## 6. Configure Local Environment (`.env`)

Add the credentials and encryption key to your local `.env` file:

```env
# YouTube Data API v3 & Google OAuth 2.0
YOUTUBE_CLIENT_ID=your_client_id_here.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=your_client_secret_here
YOUTUBE_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback

# 32-byte hex-encoded key for AES-256-GCM authenticated encryption
YOUTUBE_TOKEN_ENCRYPTION_KEY=your_64_character_hex_key_here

# Enable live YouTube uploads (false = safe mock mode, true = live private uploads)
ENABLE_YOUTUBE_UPLOADS=false

# Master safety lock: public publishing is PERMANENTLY DISABLED
ENABLE_PUBLIC_RELEASE=false
```

> **Security Warning:** Never commit `.env` into version control. Ensure `.env` is listed in `.gitignore`.

---

## 7. How to Test the Integration

### Step 1: Connect YouTube Channel via Dashboard
1. Start the API and Web apps:
   ```bash
   npm run start:api
   npm run start:web
   ```
2. Navigate to `http://localhost:5173` and click the **🚀 Upload Review** tab.
3. In the **YouTube Channel Authorization** card, click **▶ Connect with Google (OAuth 2.0)**.
4. You will be redirected to Google's consent screen:
   - Select your test user Google account.
   - If prompted with "Google hasn't verified this app", click **Advanced** > **Go to YouTube Automation Studio (unsafe)**.
   - Grant permission to upload videos and view account information.
5. Google will redirect back to `http://localhost:3000/api/youtube/oauth/callback`.
6. A success page confirms the connection and returns you to the dashboard automatically (it uses `WEB_ORIGIN`).
7. The dashboard now shows **AUTHORIZED** with your channel title, channel ID and "Offline Access: Yes".

**If connecting fails, the callback page tells you why:**
- *"has no YouTube channel"* — the Google account you picked has no channel. If your channel is a Brand Account, choose that brand account on Google's account picker.
- *"youtube.upload permission was not granted"* — you unticked a permission on the consent screen. Connect again and allow all.
- *"YouTube Data API v3 is not enabled"* — enable it (section 2) in the same Google Cloud project as your OAuth client.
- *"Refresh token missing"* warning — Google only issues a refresh token on first consent. Remove the app at <https://myaccount.google.com/permissions>, then Disconnect and Connect again.

> **Testing-mode note:** while the OAuth consent screen is in **Testing** publishing status, Google expires refresh tokens after 7 days, so you will need to reconnect weekly until the app is moved to **In production**.

### Step 2: Upload a Private Video
1. Verify the 4 Pre-flight Checklist gates:
   - **1. Script Approval Gate:** Must be approved in Production Studio.
   - **2. Video Render Output:** MP4 file must exist on disk.
   - **3. FFprobe Technical Validation:** Video and audio streams verified.
   - **4. Human Upload Gate Approval:** Fill in sign-off notes and click **✓ Approve for Private Upload (Human Gate)**.
2. Review the finalized **Title**, **Description**, and **Tags**, and choose the two required creator declarations: **Made for kids** (audience) and **Altered or synthetic content**. These are never inferred automatically.
3. Notice the **YouTube Privacy Status** badge is permanently locked to **🔒 STRICTLY PRIVATE**.
4. Click **🚀 Upload Video to YouTube (Strictly Private)**.
5. In the confirmation dialog, review the target channel and private status, then click **✓ Confirm & Begin Private Upload**.
6. When complete, the dashboard displays:
   - Status: `UPLOADED_PRIVATE` — or `MOCK STAGED` if `ENABLE_YOUTUBE_UPLOADS=false` (nothing is sent to YouTube; the ID is a `mock_private_…` placeholder).
   - The real YouTube Video ID and a link to the video in YouTube Studio.
7. A render that is already on YouTube cannot be uploaded again by accident; re-render the project to upload a new version. A failed upload can be retried from the same button.

> **Going live:** set `ENABLE_YOUTUBE_UPLOADS=true` in `.env` and restart the API. Videos uploaded through an **unverified** API project are locked to private by YouTube until the project passes Google's API audit — this matches the studio's private-only policy.

---

## 8. YouTube API Quota Considerations

- **Default Daily Quota:** projects start with a daily quota (historically 10,000 units/day) that resets at midnight Pacific Time. Check your actual allocation under **APIs & Services → YouTube Data API v3 → Quotas**.
- **Quota Costs:** costs per method change over time — check the official [quota cost table](https://developers.google.com/youtube/v3/determine_quota_cost). `videos.insert` (uploads) is by far the most expensive call; `channels.list` is cheap; OAuth token refreshes do not use Data API quota.
- **Handling Quota Limits:** if quota runs out, Google responds with HTTP 403 and reason `quotaExceeded`. The studio stores that reason as the upload record's `error_code` (`quotaExceeded`), shows it in the dashboard, and keeps the render for a retry after the reset. `uploadLimitExceeded` (channel-level upload cap) is reported the same way.

---

## 9. Security Limitations & Recovery Steps

### Disconnecting
- **Disconnect & Purge Tokens** revokes the grant at Google (`oauth2.googleapis.com/revoke`) and deletes the encrypted tokens locally. If Google can't be reached, the local tokens are still deleted and the dashboard tells you to remove access manually at <https://myaccount.google.com/permissions>.

### Token Revocation & Expiration
- If credentials are revoked in Google Account permissions, the backend catches `invalid_grant` errors during token refresh, automatically purges the invalid tokens from the database, and flags the channel as disconnected.
- **Recovery:** Simply click **Connect with Google (OAuth 2.0)** to re-authorize.

### Key Rotation
- If you need to rotate the `YOUTUBE_TOKEN_ENCRYPTION_KEY`:
  1. Disconnect all connected channels in the dashboard (`POST /api/youtube/disconnect/:channelId`).
  2. Generate a new 32-byte key and update `YOUTUBE_TOKEN_ENCRYPTION_KEY` in `.env`.
  3. Reconnect channels via the OAuth flow.

### Permanent Private Policy
- The studio enforces `privacyStatus: 'private'` in the YouTube API payload. Public publishing, unlisted links, and automatic scheduling cannot be initiated through this software.
