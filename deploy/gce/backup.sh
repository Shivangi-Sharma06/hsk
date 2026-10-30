#!/usr/bin/env bash
set -Eeuo pipefail
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
exec 9>/run/proofbid-maintenance.lock
flock 9
mountpoint -q /srv/proofbid-data
source /etc/proofbid/app.env
source /etc/proofbid/backup.env
export DATA_DIR APP_ORIGIN PROVIDER_PROFILE API_PORT VENDOR_PORT
[[ "$BACKUP_BUCKET" =~ ^[a-z0-9][a-z0-9.-]+$ ]]
stamp=$(date -u +%Y%m%dT%H%M%SZ)
directory=/srv/proofbid-data/backups/"$stamp"
restart() { systemctl start proofbid-vendors.service proofbid-api.service; }
trap restart EXIT
systemctl stop proofbid-api.service
systemctl stop proofbid-vendors.service
cd /opt/proofbid/current
/opt/node/bin/node --import tsx scripts/db.ts backup "$directory"
restart
trap - EXIT
tar -C "$directory" -czf "$directory.tar.gz" .
python3 deploy/gce/upload-backup.py "$BACKUP_BUCKET" "$directory.tar.gz" "sqlite/$stamp.tar.gz"
# Only prune coordinated backups after an off-VM upload succeeds.
find /srv/proofbid-data/backups -mindepth 1 -maxdepth 1 -mtime +7 -type f -name '*.tar.gz' -delete
find /srv/proofbid-data/backups -mindepth 1 -maxdepth 1 -mtime +7 -type d -name '20*T*Z' -exec rm -r -- {} +
