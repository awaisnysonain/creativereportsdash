#!/bin/bash
set -e
sudo mkdir -p /var/www/creative-reports
sudo chown ubuntu:ubuntu /var/www/creative-reports
cd /var/www/creative-reports
tar -xzf ~/creative-reports.tgz
sed -i 's|@52.77.228.212:5432|@127.0.0.1:5432|g' .env.local 2>/dev/null || true
npm install
npm run db:seed || true
sudo cp scripts/creative-reports.service /etc/systemd/system/creative-reports.service
sudo systemctl daemon-reload
sudo systemctl enable creative-reports
sudo systemctl restart creative-reports
echo "Deploy done — weekly Tuesday cron starts with the server (see /api/health → scheduler)"
