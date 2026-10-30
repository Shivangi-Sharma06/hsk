#!/usr/bin/env bash
set -Eeuo pipefail
export DEBIAN_FRONTEND=noninteractive
export PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
exec 9>/run/proofbid-bootstrap.lock
flock 9
if [[ -f /var/lib/proofbid-bootstrap-complete ]]; then exit 0; fi
trap 'echo "ProofBid bootstrap failed at line $LINENO" >&2' ERR

apt-get update -qq
apt-get install -y ca-certificates curl gnupg git xz-utils logrotate unattended-upgrades
device=/dev/disk/by-id/google-proofbid-data
udevadm settle
[[ -b "$device" ]] || { echo 'Persistent data disk is missing' >&2; exit 1; }
filesystem=$(blkid -s TYPE -o value "$device" || true)
if [[ -z "$filesystem" ]]; then mkfs.ext4 -L proofbid-data "$device"; fi
[[ $(blkid -s TYPE -o value "$device") == ext4 ]]
install -d -m 0755 /srv/proofbid-data
uuid=$(blkid -s UUID -o value "$device")
if ! grep -qF "UUID=$uuid " /etc/fstab; then
  printf 'UUID=%s /srv/proofbid-data ext4 defaults,nodev,nosuid,noexec,nofail 0 2\n' "$uuid" >> /etc/fstab
fi
systemctl daemon-reload
mountpoint -q /srv/proofbid-data || mount /srv/proofbid-data
id proofbid >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/proofbid --shell /usr/sbin/nologin proofbid
chmod 0700 /var/lib/proofbid
install -d -o proofbid -g proofbid -m 0700 /srv/proofbid-data/app
install -d -m 0700 /srv/proofbid-data/backups
install -d -m 0755 /opt/proofbid/releases /etc/proofbid

node_version=22.23.2
if [[ ! -x /opt/node-v${node_version}-linux-x64/bin/node ]]; then
  scratch=$(mktemp -d)
  (
    cd "$scratch"
    curl --fail --silent --show-error --location --retry 3 -O "https://nodejs.org/dist/v${node_version}/node-v${node_version}-linux-x64.tar.xz"
    curl --fail --silent --show-error --location --retry 3 -O "https://nodejs.org/dist/v${node_version}/SHASUMS256.txt"
    grep " node-v${node_version}-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum --check
    tar -xJf "node-v${node_version}-linux-x64.tar.xz" -C /opt
  )
  rm -r -- "$scratch"
fi
ln -sfn "/opt/node-v${node_version}-linux-x64" /opt/node
npm install --global pnpm@12.16.1 --ignore-scripts

curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --batch --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -fsSL --retry 3 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update -qq
apt-get install -y caddy
systemctl disable --now caddy

if ! command -v gcloud >/dev/null; then
  curl -fsSL --retry 3 https://packages.cloud.google.com/apt/doc/apt-key.gpg | gpg --dearmor --batch --yes -o /usr/share/keyrings/cloud-google.gpg
  printf 'deb [signed-by=/usr/share/keyrings/cloud-google.gpg] https://packages.cloud.google.com/apt cloud-sdk main\n' > /etc/apt/sources.list.d/google-cloud-sdk.list
  apt-get update -qq
  apt-get install -y google-cloud-cli
fi

install -d /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/proofbid.conf <<'CONFIG'
[Journal]
Storage=persistent
SystemMaxUse=256M
RuntimeMaxUse=64M
MaxRetentionSec=14day
CONFIG
systemctl restart systemd-journald
cat > /etc/apt/apt.conf.d/52proofbid-upgrades <<'CONFIG'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "false";
CONFIG

if [[ ! -x /opt/google-cloud-ops-agent/bin/google_cloud_ops_agent_engine ]]; then
  curl -fsSL --retry 3 https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh -o /tmp/proofbid-ops-agent.sh
  bash /tmp/proofbid-ops-agent.sh --also-install
fi
cat > /etc/google-cloud-ops-agent/config.yaml <<'CONFIG'
logging:
  receivers:
    application_journal:
      type: systemd_journald
  service:
    pipelines:
      application_logs:
        receivers: [application_journal]
CONFIG
systemctl restart google-cloud-ops-agent
touch /var/lib/proofbid-bootstrap-complete
echo 'ProofBid bootstrap complete. Ready for an application release.'
