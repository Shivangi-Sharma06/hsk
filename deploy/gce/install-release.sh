#!/usr/bin/env bash
set -Eeuo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
archive=${1:?release archive required}
checksum=${2:?SHA-256 required}
revision=${3:?commit revision required}
address=${4:?public IPv4 required}
email=${5:?ACME contact email required}
bucket=${6:?backup bucket required}
[[ "$checksum" =~ ^[a-f0-9]{64}$ && "$revision" =~ ^[a-f0-9]{40}$ ]]
[[ "$address" =~ ^[0-9.]+$ && "$email" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]]
[[ "$bucket" =~ ^[a-z0-9][a-z0-9.-]+$ ]]
[[ -f /var/lib/proofbid-bootstrap-complete ]]
mountpoint -q /srv/proofbid-data
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check
exec 9>/run/proofbid-maintenance.lock
flock 9
release=/opt/proofbid/releases/"$revision"
[[ ! -e "$release" ]] || { echo 'Release already exists; refusing to overwrite it' >&2; exit 1; }
install -d -o proofbid -g proofbid -m 0755 "$release"
tar -xzf "$archive" -C "$release" --no-same-owner
chown -R proofbid:proofbid "$release"
runuser -u proofbid -- /bin/bash -s -- "$release" <<'BUILD'
set -Eeuo pipefail
export PATH=/opt/node/bin:/usr/local/bin:/usr/bin:/bin
cd "$1"
pnpm install --frozen-lockfile
pnpm build
BUILD
chown -R root:root "$release"
cat > /etc/proofbid/app.env <<CONFIG
NODE_ENV=production
PROVIDER_PROFILE=local
APP_ORIGIN=https://$address
API_PORT=3001
VENDOR_PORT=3002
DATA_DIR=/srv/proofbid-data/app
CONFIG
printf 'BACKUP_BUCKET=%s\n' "$bucket" > /etc/proofbid/backup.env
chown root:proofbid /etc/proofbid/app.env
chmod 0640 /etc/proofbid/app.env
chmod 0600 /etc/proofbid/backup.env
systemctl stop proofbid-api.service proofbid-vendors.service 2>/dev/null || true
ln -sfn "$release" /opt/proofbid/current
install -m 0644 "$release"/deploy/gce/proofbid-*.service /etc/systemd/system/
install -m 0644 "$release"/deploy/gce/proofbid-backup.timer /etc/systemd/system/
install -d /etc/systemd/system/caddy.service.d
cat > /etc/systemd/system/caddy.service.d/proofbid.conf <<CONFIG
[Service]
Environment=SITE_ADDRESS=https://$address
Environment=ACME_EMAIL=$email
CONFIG
install -m 0644 "$release"/deploy/gce/Caddyfile /etc/caddy/Caddyfile
SITE_ADDRESS="https://$address" ACME_EMAIL="$email" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl daemon-reload
systemd-analyze verify /etc/systemd/system/proofbid-*.service /etc/systemd/system/proofbid-backup.timer
systemctl enable --now proofbid-vendors.service proofbid-api.service proofbid-backup.timer caddy.service
printf '%s\n' "$revision" > /etc/proofbid/revision
echo "Deployed $revision. HSP and real payments remain disabled."
