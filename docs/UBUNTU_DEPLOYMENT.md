# Ubuntu Production Deployment Guide

> **Project:** YouTube Automation Studio  
> **Target OS:** Ubuntu 22.04 LTS / 24.04 LTS (x86_64)  
> **Stack:** Node.js 22 LTS, MySQL 8.0, FFmpeg, Nginx Reverse Proxy, Let's Encrypt SSL, PM2 / Systemd

---

## 1. System Requirements & Architecture Overview

### Recommended Specifications
- **CPU:** 4 vCPUs or higher (recommended for concurrent FFmpeg transcoding)
- **RAM:** 8 GB minimum (16 GB recommended for 1080p rendering pipelines)
- **Disk:** 50 GB+ NVMe SSD (scratch storage for video generation and temporary wav/mp4 assets)
- **Network:** Outbound HTTPS access to `accounts.google.com` and `www.googleapis.com`

### Production Architecture
```
[ Internet / Browser ]
         │ (HTTPS 443 / SSL)
         ▼
[ Nginx Reverse Proxy ]
   ├── /api/*   ──────► Proxy to http://127.0.0.1:3000 (NestJS PM2 Service)
   └── /*       ──────► Serve Static Assets from apps/web/dist (SPA Routing)
                             │
                             ▼
                    [ Local MySQL 8.0 ] (Port 3306, 127.0.0.1 only)
                    [ Local FFmpeg / FFprobe ] (/usr/bin/ffmpeg)
```

---

## 2. Server Provisioning & Package Installation

### Step 2.1: Update System & Install Base Utilities
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw software-properties-common
```

### Step 2.2: Install Node.js 22 LTS
```bash
# Add NodeSource official repository for Node.js 22.x
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs

# Verify versions
node -v # Expected: v22.x.x
npm -v  # Expected: 10.x.x
```

### Step 2.3: Install FFmpeg & FFprobe
```bash
sudo apt install -y ffmpeg

# Verify binary availability and codecs
ffmpeg -version
ffprobe -version
which ffmpeg   # Output: /usr/bin/ffmpeg
which ffprobe  # Output: /usr/bin/ffprobe
```

### Step 2.4: Install MySQL 8.0 Server
```bash
sudo apt install -y mysql-server

# Secure installation
sudo mysql_secure_installation
```

---

## 3. Database & Dedicated System User Setup

### Step 3.1: Create Dedicated Linux Service User
For security, run the application under an unprivileged system user (`ytstudio`):
```bash
sudo useradd -m -s /bin/bash ytstudio
sudo usermod -aG sudo ytstudio
```

### Step 3.2: Provision MySQL Database & User
Log in to MySQL as root:
```bash
sudo mysql -u root
```

Execute the database creation and user grant queries:
```sql
CREATE DATABASE `youtube_automation` 
  DEFAULT CHARACTER SET utf8mb4 
  DEFAULT COLLATE utf8mb4_unicode_ci;

CREATE USER 'yt_app_user'@'127.0.0.1' IDENTIFIED WITH mysql_native_password BY 'YourStrongRandomPasswordHere!';

GRANT ALL PRIVILEGES ON `youtube_automation`.* TO 'yt_app_user'@'127.0.0.1';
FLUSH PRIVILEGES;
EXIT;
```

---

## 4. Repository Setup & Environment Configuration

### Step 4.1: Clone Application Repository
Switch to the `ytstudio` user and clone into `/var/www/youtube-automation`:
```bash
sudo mkdir -p /var/www/youtube-automation
sudo chown -R ytstudio:ytstudio /var/www/youtube-automation
su - ytstudio

cd /var/www/youtube-automation
git clone https://github.com/MuhammadNoumanAli/youtube-automation.git .
```

### Step 4.2: Install Monorepo Dependencies
```bash
npm install
```

### Step 4.3: Generate Cryptographic Secrets & Create `.env`
Generate a high-entropy 32-byte AES-256-GCM key for encrypting YouTube OAuth tokens:
```bash
openssl rand -hex 32
# Example output: c7e1d5a894f29107ef4c86b3e9b11a45d07812bc8e4156a29ef1325c89ab7120
```

Create `/var/www/youtube-automation/.env`:
```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Configure production values:
```dotenv
# Environment
NODE_ENV=production
PORT=3000

# Database Configuration (MySQL 8.0)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USERNAME=yt_app_user
DB_PASSWORD=YourStrongRandomPasswordHere!
DB_DATABASE=youtube_automation

# Local Storage Root
STORAGE_ROOT=/var/www/youtube-automation/storage

# FFmpeg & FFprobe Binary Paths on Ubuntu
FFMPEG_PATH=/usr/bin/ffmpeg
FFPROBE_PATH=/usr/bin/ffprobe

# YouTube Data API v3 & OAuth 2.0 Settings
# (Obtain from Google Cloud Console: APIs & Services -> Credentials)
YOUTUBE_CLIENT_ID=your-client-id.apps.googleusercontent.com
YOUTUBE_CLIENT_SECRET=GOCSPX-your-client-secret
YOUTUBE_REDIRECT_URI=https://studio.yourdomain.com/api/youtube/callback

# AES-256-GCM Key for encrypting stored OAuth refresh tokens (32 bytes hex)
YOUTUBE_TOKEN_ENCRYPTION_KEY=c7e1d5a894f29107ef4c86b3e9b11a45d07812bc8e4156a29ef1325c89ab7120

# Feature Flags & Hardened Safety Constraints
ENABLE_EXTERNAL_API_CALLS=true
ENABLE_YOUTUBE_UPLOADS=true
# MANDATORY SAFETY GUARD: Strictly false to guarantee videos are staged as private
ENABLE_PUBLIC_RELEASE=false
```

### Step 4.4: Run Database Migrations
Apply all 13 migration versions (including background jobs queue and token encryption columns):
```bash
npm run migration:run --workspace=api
```

---

## 5. Build Applications

Compile both the NestJS backend and the Vite React frontend:
```bash
# Build NestJS API into apps/api/dist
npm run build:api

# Build React client into apps/web/dist
npm run build:web
```

---

## 6. Process Management with PM2

Install PM2 globally to ensure the NestJS service starts on boot and restarts automatically if terminated:
```bash
sudo npm install -g pm2
```

Create an `ecosystem.config.js` in the repository root:
```javascript
module.exports = {
  apps: [
    {
      name: 'youtube-api',
      script: 'apps/api/dist/main.js',
      cwd: '/var/www/youtube-automation',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

Start the application and configure system startup:
```bash
pm2 start ecosystem.config.js
pm2 save

# Register systemd startup service
sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ytstudio --hp /home/ytstudio
```

---

## 7. Alternative: Native Systemd Service Unit

If you prefer native `systemd` over PM2, create `/etc/systemd/system/youtube-studio.service`:
```ini
[Unit]
Description=YouTube Automation Studio NestJS API Service
After=network.target mysql.service

[Service]
Type=simple
User=ytstudio
WorkingDirectory=/var/www/youtube-automation
ExecStart=/usr/bin/node /var/www/youtube-automation/apps/api/dist/main.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

# Resource Limits
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Enable and start the service:
```bash
sudo systemctl daemon-reload
sudo systemctl enable youtube-studio
sudo systemctl start youtube-studio
sudo systemctl status youtube-studio
```

---

## 8. Nginx Reverse Proxy & SSL Configuration

### Step 8.1: Install Nginx
```bash
sudo apt install -y nginx
```

### Step 8.2: Create Nginx Virtual Host
Create `/etc/nginx/sites-available/youtube-automation`:
```nginx
server {
    listen 80;
    server_name studio.yourdomain.com;

    # Allow large video uploads to the media intake endpoint
    client_max_body_size 100M;

    # Static Web Frontend
    root /var/www/youtube-automation/apps/web/dist;
    index index.html;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # SPA Routing: Fall back to index.html for React Router
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Reverse Proxy to NestJS Backend
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Timeouts for heavy FFmpeg and YouTube upload requests
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/youtube-automation /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### Step 8.3: Provision Free SSL Certificate with Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d studio.yourdomain.com
```
Certbot automatically installs the SSL certificates, configures HTTPS redirects, and sets up a daily renewal timer.

---

## 9. Security Hardening & Firewall (UFW)

### Step 9.1: Configure UFW Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

### Step 9.2: Verify MySQL Port Binding
Ensure MySQL listens strictly on localhost (`127.0.0.1`) and is not exposed to the public internet:
```bash
sudo ss -tulpn | grep 3306
# Expected output shows: 127.0.0.1:3306 (NOT 0.0.0.0:3306)
```

---

## 10. Verification & Smoke Testing

### Step 10.1: Backend Health Probe
```bash
curl -f https://studio.yourdomain.com/api/health
```
Expected JSON response:
```json
{
  "status": "ok",
  "database": { "connected": true, "databaseName": "youtube_automation" },
  "storage": { "accessible": true }
}
```

### Step 10.2: Binary Tooling Validation
```bash
curl -f https://studio.yourdomain.com/api/rendering/binaries
```
Expected JSON response:
```json
{
  "ffmpeg": { "available": true, "path": "/usr/bin/ffmpeg" },
  "ffprobe": { "available": true, "path": "/usr/bin/ffprobe" }
}
```

### Step 10.3: YouTube OAuth Test
1. Navigate to `https://studio.yourdomain.com` in your web browser.
2. Go to **Upload Review** tab.
3. Click **Connect with Google (OAuth 2.0)**.
4. Authenticate your authorized YouTube channel.
5. Verify that:
   - State returns `AUTHORIZED`.
   - Access token is encrypted with AES-256-GCM.
   - Subscriber count, views, and videos appear in the **Channel Analytics** dashboard card.

---

## 11. Maintenance & Operational Runbook

### Storage Scratch Cleaner
The studio automatically registers background maintenance cleanup tasks to purge stale temporary audio and render files (`/api/jobs/maintenance/cleanup`). You can also schedule a daily cron job:
```bash
# Open crontab for ytstudio
crontab -e

# Purge rendered scratch files older than 7 days every night at 3 AM
0 3 * * * find /var/www/youtube-automation/storage/scratch -type f -mtime +7 -delete
```

### Updating to New Releases
```bash
cd /var/www/youtube-automation
git pull origin main
npm install
npm run migration:run --workspace=api
npm run build:api
npm run build:web
pm2 restart youtube-api
```
