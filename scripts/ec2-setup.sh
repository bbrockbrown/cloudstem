#!/usr/bin/env bash
# EC2 bootstrap script for CloudStem Audio Processing Pipeline
# Frontend is deployed to Vercel — this script sets up backend + worker only.
# Usage: sudo bash ec2-setup.sh

set -euo pipefail

echo "=== CloudStem EC2 Setup ==="

# system packages
echo "[1/5] Updating system packages..."
if command -v dnf &>/dev/null; then
  # Amazon Linux 2023 / Fedora
  dnf update -y
  dnf install -y git
  # ffmpeg is not in AL2023 default repos — install static binary
  if ! command -v ffmpeg &>/dev/null; then
    echo "       Installing ffmpeg static binary..."
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz \
      | tar -xJ --wildcards --strip-components=1 -C /usr/local/bin '*/ffmpeg' '*/ffprobe'
  fi
elif command -v apt-get &>/dev/null; then
  # Ubuntu / Debian
  apt-get update -y
  apt-get install -y ffmpeg git
else
  echo "Unknown package manager. Install ffmpeg and git manually." >&2
  exit 1
fi

# Node.js 22 LTS via NodeSource
echo "[2/5] Installing Node.js 22..."
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash - 2>/dev/null || \
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
if command -v dnf &>/dev/null; then
  dnf install -y nodejs
else
  apt-get install -y nodejs
fi
node --version
npm --version

# pm2 process manager
echo "[3/5] Installing pm2..."
npm install -g pm2
pm2 --version

# clone / pull the repository
echo "[4/5] Deploying application..."
APP_DIR="/opt/cloudstem"
if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR"
  git pull origin main
else
  git clone https://github.com/bbrockbrown/cs310-final-project.git "$APP_DIR"
  cd "$APP_DIR"
fi

# install backend dependencies only (frontend is on Vercel)
echo "[5/5] Installing backend dependencies..."
cd "$APP_DIR/backend"
npm ci

# environment check
if [ ! -f "$APP_DIR/backend/.env" ]; then
  echo ""
  echo "WARNING: $APP_DIR/backend/.env not found."
  echo "Create it before starting pm2:"
  echo "  sudo nano $APP_DIR/backend/.env"
  echo "  (see backend/.env.example for required variables)"
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "Next steps:"
echo "  1. Create backend/.env:   sudo nano $APP_DIR/backend/.env"
echo "  2. Start processes:       pm2 start \"npx tsx server.ts\" --name cloudstem-server --cwd $APP_DIR/backend"
echo "                            pm2 start \"npx tsx src/services/audioProcessor.ts\" --name cloudstem-worker --cwd $APP_DIR/backend"
echo "  3. Auto-restart on boot:  pm2 startup && pm2 save"