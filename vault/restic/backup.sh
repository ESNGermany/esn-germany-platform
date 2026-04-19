#!/bin/sh
set -eu

restic backup --tag vault_vaultwarden /data
