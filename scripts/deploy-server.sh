#!/bin/bash
# Deploy Creative Reports on the production server from GitHub.
# Usage (on server): bash scripts/deploy-server.sh
set -e

APP_DIR="/var/www/creative-reports"
REPO="https://github.com/awaisnysonain/creativereportsdash.git"
ENV_BACKUP="$HOME/creative-reports.env.local.bak"

sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:ubuntu "$APP_DIR"

if [ -f "$APP_DIR/.env.local" ]; then
  cp "$APP_DIR/.env.local" "$ENV_BACKUP"
fi

if [ ! -d "$APP_DIR/.git" ]; then
  echo "Cloning repository..."
  rm -rf "$APP_DIR"/*
  git clone "$REPO" "$APP_DIR"
else
  echo "Pulling latest..."
  cd "$APP_DIR"
  git fetch origin
  git reset --hard origin/main
fi

cd "$APP_DIR"

if [ -f "$ENV_BACKUP" ]; then
  cp "$ENV_BACKUP" .env.local
fi

# Server-side env fixes (Postgres on localhost, public dashboard URL for Slack links)
if [ -f .env.local ]; then
  sed -i 's|@52.77.228.212:5432|@127.0.0.1:5432|g' .env.local
  if ! grep -q '^APP_URL=' .env.local; then
    echo 'APP_URL=http://52.77.228.212' >> .env.local
  fi
  if ! grep -q '^PORT=' .env.local; then
    echo 'PORT=3000' >> .env.local
  fi
fi

npm install
npm run db:seed || true

sudo cp scripts/creative-reports.service /etc/systemd/system/creative-reports.service
sudo cp scripts/nginx-creative-reports.conf /etc/nginx/sites-available/creative-reports 2>/dev/null || true
sudo ln -sf /etc/nginx/sites-available/creative-reports /etc/nginx/sites-enabled/creative-reports 2>/dev/null || true
sudo nginx -t 2>/dev/null && sudo systemctl reload nginx 2>/dev/null || true
sudo systemctl daemon-reload
sudo systemctl enable creative-reports
sudo systemctl restart creative-reports

sleep 3
echo "=== health ==="
curl -s http://localhost:3000/api/health | head -c 500
echo
echo "Deploy done."
