#!/usr/bin/env bash
# Moves an ntfy server installed from the Debian package to the Alai Podman container, reusing its
# configuration and data in place. Run as root. The package itself is left installed until you remove it.
#
#   ./migrate-from-deb.sh [path/to/alai.container]
set -euo pipefail

unit_source=${1:-"$(dirname "$0")/alai.container"}
unit_target=/etc/containers/systemd/alai.container
backup=/var/backups/ntfy-$(date +%Y%m%d-%H%M%S).tar.gz
dirs=(/etc/ntfy /var/cache/ntfy /var/lib/ntfy)

step() { printf '\n==> %s\n' "$*"; }
confirm() { read -r -p "$1 [y/N] " reply; [[ "$reply" == [yY] ]] || { echo "Aborted."; exit 1; }; }

[[ $EUID -eq 0 ]] || { echo "Run as root." >&2; exit 1; }
command -v podman >/dev/null || { echo "podman is not installed." >&2; exit 1; }
[[ -f "$unit_source" ]] || { echo "Unit file not found: $unit_source" >&2; exit 1; }

step "Current setup"
systemctl is-active --quiet ntfy && echo "ntfy.service: active" || echo "ntfy.service: not active"
grep -E '^\s*(base-url|listen-http|behind-proxy|auth-file|cache-file|attachment-cache-dir|web-push-file|firebase-key-file|upstream-base-url)\s*:' /etc/ntfy/server.yml || true
grep -E '^PublishPort=' "$unit_source"
echo
echo "The container listens on the PublishPort address above. It must match what your reverse proxy"
echo "forwards to (listen-http in server.yml today). Edit $unit_source first if it differs."
confirm "Continue?"

step "Backing up ${dirs[*]} to $backup"
existing=()
for d in "${dirs[@]}"; do [[ -e "$d" ]] && existing+=("$d"); done
tar -czf "$backup" "${existing[@]}"
echo "Backup written ($(du -h "$backup" | cut -f1))."

step "Pulling the image"
podman pull "$(sed -n 's/^Image=//p' "$unit_source")"

step "Stopping and disabling the packaged ntfy.service"
systemctl disable --now ntfy.service 2>/dev/null || true
mkdir -p /var/cache/ntfy /var/lib/ntfy

step "Installing the Quadlet unit and starting alai.service"
install -D -m 0644 "$unit_source" "$unit_target"
systemctl daemon-reload
systemctl start alai.service
systemctl enable --now podman-auto-update.timer >/dev/null 2>&1 || true

step "Checking health"
port=$(sed -n 's/^PublishPort=\(.*\):80$/\1/p' "$unit_target")
for _ in $(seq 1 30); do
  if curl -fsS "http://$port/v1/health" >/dev/null 2>&1; then
    echo "alai.service is up at http://$port."
    break
  fi
  sleep 2
done
curl -fsS "http://$port/v1/health" >/dev/null || {
  echo "Health check failed. Inspect with: journalctl -u alai.service -n 50" >&2
  echo "To roll back: systemctl stop alai.service && rm $unit_target && systemctl daemon-reload && systemctl enable --now ntfy.service" >&2
  exit 1
}

cat <<NEXT

Done. Remaining steps, once you have checked the web app and your clients:
  - Remove the package without deleting config:   apt remove ntfy   (not purge)
  - Remove its APT source from /etc/apt/sources.list.d/ so upgrades cannot reinstall the service
  - Admin commands now run in the container:       podman exec alai ntfy user list
  - Backup of the previous state:                  $backup
NEXT
