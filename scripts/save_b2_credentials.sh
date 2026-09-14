#!/usr/bin/env bash
# Save Backblaze credentials to a file only you can read.
#
# Run this yourself. It prompts with echo off, so the key never appears on the
# screen, never enters shell history, and never appears in the process list the
# way it would as a command argument. Nothing here prints a secret back.
#
#   bash scripts/save_b2_credentials.sh [name]
#
# The optional name keeps separate keys in separate files, since the planner's
# write key and the host's read key are different credentials that live on
# different machines:
#
#   bash scripts/save_b2_credentials.sh b2-write
#   bash scripts/save_b2_credentials.sh b2-read
#   bash scripts/save_b2_credentials.sh b2-delivery
#
# Use an application key scoped to one bucket and, if you can, one filename
# prefix. Never the master key: it cannot be scoped and it can delete buckets.
set -euo pipefail

dir="${XDG_CONFIG_HOME:-$HOME/.config}/wayfinder"
file="$dir/${1:-b2}.env"

umask 077
mkdir -p "$dir"

if [ -e "$file" ]; then
  read -rp "$file exists. Replace it? [y/N] " reply
  case "$reply" in [yY]*) ;; *) echo "Left alone."; exit 0 ;; esac
fi

read -rsp 'B2 keyID: ' key_id; echo
read -rsp 'B2 applicationKey: ' app_key; echo
read -rp 'Bucket name: ' bucket
read -rp 'Key prefix, blank for none: ' prefix
read -rp 'S3 endpoint, blank for s3.ca-east-006.backblazeb2.com: ' endpoint
endpoint="${endpoint:-s3.ca-east-006.backblazeb2.com}"

[ -n "$key_id" ] && [ -n "$app_key" ] && [ -n "$bucket" ] || {
  echo "keyID, applicationKey and bucket are all required." >&2
  exit 1
}

printf 'B2_KEY_ID=%s\nB2_APP_KEY=%s\nB2_BUCKET=%s\nB2_PREFIX=%s\nB2_ENDPOINT=%s\n' \
  "$key_id" "$app_key" "$bucket" "$prefix" "$endpoint" >"$file"
chmod 600 "$file"

echo "Wrote $file, readable only by you."
echo "Nothing was echoed, and no secret entered your shell history."
