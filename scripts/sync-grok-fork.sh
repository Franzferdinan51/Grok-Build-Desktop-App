#!/usr/bin/env bash
set -euo pipefail

# Keeps the maintained backend fork current without coupling desktop releases
# to xAI's branch. Requires GitHub CLI authentication with fork write access.
gh repo sync Franzferdinan51/grok-build --source xai-org/grok-build --branch main
echo "Franzferdinan51/grok-build is synced with xai-org/grok-build:main"
