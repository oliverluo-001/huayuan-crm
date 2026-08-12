#!/usr/bin/env bash

set -Eeuo pipefail

: "${APP_ROOT:?APP_ROOT is required}"
: "${RELEASE_ID:?RELEASE_ID is required}"
: "${DB_HOST:?DB_HOST is required}"
: "${DB_USERNAME:?DB_USERNAME is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_DATABASE:?DB_DATABASE is required}"
: "${JWT_SECRET:?JWT_SECRET is required}"

case "$RELEASE_ID" in
  *[!A-Za-z0-9._-]*|'') echo "Invalid RELEASE_ID" >&2; exit 1 ;;
esac

APP_ROOT="${APP_ROOT%/}"
DB_PORT="${DB_PORT:-3306}"
PORT="${PORT:-9528}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/huayuan-crm}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://crm.huayuanflange.com}"
CORS_ORIGINS="${CORS_ORIGINS:-$PUBLIC_BASE_URL}"
JWT_EXPIRES_IN="${JWT_EXPIRES_IN:-7d}"
CREDENTIAL_ENCRYPTION_KEY="${CREDENTIAL_ENCRYPTION_KEY:-$JWT_SECRET}"
DEEPSEEK_BASE_URL="${DEEPSEEK_BASE_URL:-https://api.deepseek.com/v1}"
CUSTOMER_ATTACHMENT_DIR="${CUSTOMER_ATTACHMENT_DIR:-$APP_ROOT/data/customer-attachments}"
PRODUCT_ASSET_DIR="${PRODUCT_ASSET_DIR:-$APP_ROOT/data/product-assets}"

RELEASES_DIR="$APP_ROOT/releases"
RELEASE_DIR="$RELEASES_DIR/$RELEASE_ID"
CURRENT_LINK="$APP_ROOT/app-current"
WEB_ROOT="${WEB_ROOT:-/var/www/huayuan-crm}"
WEB_RELEASE_DIR="$WEB_ROOT/web-releases/$RELEASE_ID"
WEB_ROLLBACK_DIR="$WEB_ROOT/web-releases/previous-$RELEASE_ID"
NGINX_CONF="${NGINX_CONF:-/etc/nginx/conf.d/huayuan-crm.conf}"
BACKUP_FILE="$BACKUP_DIR/pre-deploy-$RELEASE_ID.sql.gz"

test -d "$RELEASE_DIR"
test -f "$RELEASE_DIR/backend/dist/main.js"
test -f "$RELEASE_DIR/backend/dist/scripts/migrate.js"
test -f "$RELEASE_DIR/frontend/dist/index.html"
test -f "$RELEASE_DIR/ecosystem.config.js"
test -f "$RELEASE_DIR/nginx-huayuan-crm.conf"

RESOLVED_ROOT="$(realpath -m "$APP_ROOT")"
RESOLVED_RELEASE="$(realpath "$RELEASE_DIR")"
case "$RESOLVED_RELEASE/" in
  "$RESOLVED_ROOT"/releases/*/) ;;
  *) echo "Release directory escaped APP_ROOT" >&2; exit 1 ;;
esac

write_env_value() {
  local key="$1"
  local value="${2:-}"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  printf '%s="%s"\n' "$key" "$value"
}

umask 077
{
  write_env_value PORT "$PORT"
  write_env_value RELEASE_ID "$RELEASE_ID"
  write_env_value NODE_ENV production
  write_env_value DB_TYPE mysql
  write_env_value DB_HOST "$DB_HOST"
  write_env_value DB_PORT "$DB_PORT"
  write_env_value DB_USERNAME "$DB_USERNAME"
  write_env_value DB_PASSWORD "$DB_PASSWORD"
  write_env_value DB_DATABASE "$DB_DATABASE"
  write_env_value DB_SYNCHRONIZE false
  write_env_value DB_LOGGING false
  write_env_value JWT_SECRET "$JWT_SECRET"
  write_env_value CREDENTIAL_ENCRYPTION_KEY "$CREDENTIAL_ENCRYPTION_KEY"
  write_env_value JWT_EXPIRES_IN "$JWT_EXPIRES_IN"
  write_env_value SESSION_TTL_HOURS 168
  write_env_value COOKIE_SECURE true
  write_env_value TRUST_PROXY true
  write_env_value CORS_ORIGINS "$CORS_ORIGINS"
  write_env_value PUBLIC_BASE_URL "$PUBLIC_BASE_URL"
  write_env_value BACKUP_DIR "$BACKUP_DIR"
  write_env_value REGISTRATION_MODE approval
  write_env_value INITIAL_ADMIN_USERNAME "${INITIAL_ADMIN_USERNAME:-}"
  write_env_value INITIAL_ADMIN_PASSWORD "${INITIAL_ADMIN_PASSWORD:-}"
  write_env_value INITIAL_ADMIN_DISPLAY_NAME 超级管理员
  write_env_value LOGIN_MAX_ATTEMPTS 5
  write_env_value LOGIN_LOCK_MINUTES 15
  write_env_value DEEPSEEK_API_KEY "${DEEPSEEK_API_KEY:-}"
  write_env_value DEEPSEEK_BASE_URL "$DEEPSEEK_BASE_URL"
  write_env_value CUSTOMER_ATTACHMENT_DIR "$CUSTOMER_ATTACHMENT_DIR"
  write_env_value PRODUCT_ASSET_DIR "$PRODUCT_ASSET_DIR"
} > "$RELEASE_DIR/backend/.env"
chmod 600 "$RELEASE_DIR/backend/.env"
mkdir -p "$RELEASE_DIR/backend/logs"
mkdir -p "$CUSTOMER_ATTACHMENT_DIR"
mkdir -p "$PRODUCT_ASSET_DIR"

cd "$RELEASE_DIR"
npm ci --omit=dev --workspace=backend --include-workspace-root=false --no-audit --no-fund

sudo mkdir -p "$WEB_ROOT/web-releases"
if sudo test -e "$WEB_RELEASE_DIR"; then
  echo "Web release already exists: $WEB_RELEASE_DIR" >&2
  exit 1
fi
sudo mkdir "$WEB_RELEASE_DIR"
sudo cp -a "$RELEASE_DIR/frontend/dist/." "$WEB_RELEASE_DIR/"
sudo chown -R nginx:nginx "$WEB_RELEASE_DIR"

PREVIOUS_BACKEND=""
if [ -L "$CURRENT_LINK" ]; then
  PREVIOUS_BACKEND="$(readlink -f "$CURRENT_LINK")"
elif [ -L "$APP_ROOT/current" ] && [ -f "$(readlink -f "$APP_ROOT/current")/ecosystem.config.js" ]; then
  PREVIOUS_BACKEND="$(readlink -f "$APP_ROOT/current")"
elif [ -f "$APP_ROOT/ecosystem.config.js" ]; then
  PREVIOUS_BACKEND="$APP_ROOT"
fi

PREVIOUS_WEB=""
if sudo test -d "$WEB_ROOT/html"; then
  PREVIOUS_WEB="$WEB_ROOT/html"
fi

HAD_BACKEND=0
if pm2 describe huayuan-crm-backend >/dev/null 2>&1; then
  HAD_BACKEND=1
  if [ -z "$PREVIOUS_BACKEND" ] || [ ! -f "$PREVIOUS_BACKEND/ecosystem.config.js" ]; then
    echo "Cannot identify the previous backend release for rollback" >&2
    exit 1
  fi
fi

MIGRATION_STARTED=0
APP_SWITCHED=0
WEB_SWITCHED=0
OLD_WEB_MOVED=0
NGINX_CHANGED=0
NGINX_HAD_CONF=0
NGINX_ACTIVATED=0
PREVIOUS_NGINX_USES_LEGACY_LINK=0
MAINTENANCE_ENABLED=0

switch_symlink() {
  local target="$1"
  local link="$2"
  local temporary="$link.next-$RELEASE_ID"
  sudo ln -sfn "$target" "$temporary"
  sudo mv -Tf "$temporary" "$link"
}

start_backend() {
  local directory="$1"
  (
    cd "$directory"
    pm2 delete huayuan-crm-backend >/dev/null 2>&1 || true
    pm2 start "$directory/ecosystem.config.js" --only huayuan-crm-backend --update-env
  )
}

rollback() {
  local status=$?
  trap - ERR
  set +e
  echo "Deployment failed; restoring the previous release" >&2

  pm2 stop huayuan-crm-backend >/dev/null 2>&1

  if [ "$MIGRATION_STARTED" -eq 1 ] && [ -s "$BACKUP_FILE" ]; then
    gzip -dc "$BACKUP_FILE" | MYSQL_PWD="$DB_PASSWORD" mysql \
      --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USERNAME" \
      --default-character-set=utf8mb4 "$DB_DATABASE"
  fi

  if [ "$APP_SWITCHED" -eq 1 ] && [ -n "$PREVIOUS_BACKEND" ]; then
    switch_symlink "$PREVIOUS_BACKEND" "$CURRENT_LINK"
  fi
  if [ "$WEB_SWITCHED" -eq 1 ] && sudo test -d "$WEB_ROOT/html"; then
    sudo mv -T "$WEB_ROOT/html" "$WEB_RELEASE_DIR"
  fi
  if [ "$OLD_WEB_MOVED" -eq 1 ] && sudo test -d "$WEB_ROLLBACK_DIR"; then
    sudo mv -T "$WEB_ROLLBACK_DIR" "$WEB_ROOT/html"
  fi

  if [ "$NGINX_CHANGED" -eq 1 ]; then
    if [ "$NGINX_HAD_CONF" -eq 1 ]; then
      if [ "$NGINX_ACTIVATED" -eq 1 ] && [ "$PREVIOUS_NGINX_USES_LEGACY_LINK" -eq 1 ]; then
        sudo cp "$RELEASE_DIR/nginx-huayuan-crm.conf" "$NGINX_CONF"
      else
        sudo cp "$RELEASE_DIR/nginx.previous.conf" "$NGINX_CONF"
      fi
    else
      sudo rm -f "$NGINX_CONF"
    fi
    sudo nginx -t && sudo systemctl reload nginx
  fi

  if [ "$HAD_BACKEND" -eq 1 ] && [ -n "$PREVIOUS_BACKEND" ]; then
    if start_backend "$PREVIOUS_BACKEND"; then
      pm2 save
      sudo rm -f "$WEB_ROOT/deploying"
      MAINTENANCE_ENABLED=0
    fi
  elif [ "$MAINTENANCE_ENABLED" -eq 1 ]; then
    sudo rm -f "$WEB_ROOT/deploying"
  fi
  exit "$status"
}
trap rollback ERR

if sudo test -f "$NGINX_CONF"; then
  sudo cp "$NGINX_CONF" "$RELEASE_DIR/nginx.previous.conf"
  NGINX_HAD_CONF=1
  if sudo grep -Fq "root $WEB_ROOT/current;" "$NGINX_CONF"; then
    PREVIOUS_NGINX_USES_LEGACY_LINK=1
  fi
fi
sudo cp "$RELEASE_DIR/nginx-huayuan-crm.conf" "$NGINX_CONF"
NGINX_CHANGED=1
sudo nginx -t
sudo systemctl reload nginx
NGINX_ACTIVATED=1
sudo touch "$WEB_ROOT/deploying"
MAINTENANCE_ENABLED=1

if [ "$HAD_BACKEND" -eq 1 ]; then
  pm2 stop huayuan-crm-backend
fi

sudo mkdir -p "$BACKUP_DIR"
sudo chown "$(id -u):$(id -g)" "$BACKUP_DIR"
MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USERNAME" \
  --single-transaction --quick --routines --triggers --hex-blob \
  --default-character-set=utf8mb4 "$DB_DATABASE" | gzip -9 > "$BACKUP_FILE"
test -s "$BACKUP_FILE"
gzip -t "$BACKUP_FILE"

MIGRATION_STARTED=1
(
  cd "$RELEASE_DIR/backend"
  node dist/scripts/migrate.js
)

start_backend "$RELEASE_DIR"
if ! curl --retry 15 --retry-delay 2 --retry-connrefused --fail --silent --show-error \
  "http://127.0.0.1:$PORT/api/health/$RELEASE_ID" >/dev/null; then
  echo "New backend failed its release health check; collecting diagnostics" >&2
  pm2 describe huayuan-crm-backend || true
  pm2 logs huayuan-crm-backend --lines 120 --nostream || true
  if [ -f "$RELEASE_DIR/backend/logs/error.log" ]; then
    echo "--- release error.log ---" >&2
    tail -n 120 "$RELEASE_DIR/backend/logs/error.log" >&2 || true
  fi
  false
fi

switch_symlink "$RELEASE_DIR" "$CURRENT_LINK"
APP_SWITCHED=1
if [ -n "$PREVIOUS_WEB" ]; then
  sudo mv -T "$WEB_ROOT/html" "$WEB_ROLLBACK_DIR"
  OLD_WEB_MOVED=1
fi
sudo mv -T "$WEB_RELEASE_DIR" "$WEB_ROOT/html"
WEB_SWITCHED=1

sudo nginx -t
sudo systemctl reload nginx
pm2 save
sudo rm -f "$WEB_ROOT/deploying"
MAINTENANCE_ENABLED=0

trap - ERR
echo "Deployment completed: $RELEASE_ID"
echo "Database backup: $BACKUP_FILE"
