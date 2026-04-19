#!/bin/sh
set -eu

restic restore --tag vault_vaultwarden latest --target /
