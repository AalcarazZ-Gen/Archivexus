#!/usr/bin/env bash
#
# Builds and publishes a Foundry module release, per ADR-0006: this stays a
# manual, human-run step (nothing here touches a live Foundry world — it
# only builds, packages, and publishes a GitHub Release) but automates the
# repetitive parts of it instead of doing them by hand every time.
#
# What it does, in order:
#   1. Refuses to run with a dirty working tree (uncommitted changes would
#      end up silently baked into the build, or lost track of).
#   2. Bumps module.json's "version" (patch bump by default, or an explicit
#      version if you pass one) and commits that bump on its own.
#   3. Runs `npm run build:foundry-module`.
#   4. Packages module.json + dist/foundry/ into archivexus.zip, preserving
#      the relative path module.json's "esmodules" entry expects
#      (dist/foundry/archivexus.js) inside the archive.
#   5. Tags the commit (vX.Y.Z) and pushes the current branch + tag.
#   6. Runs `gh release create` with archivexus.zip attached, so
#      module.json's `download` URL (releases/latest/download/archivexus.zip)
#      resolves to it.
#
# Requirements: gh CLI installed and authenticated (`gh auth status`), a
# clean git working tree, network access to GitHub (run this from your own
# terminal, not through the Cowork device bridge — that VM's egress to
# GitHub is unreliable).
#
# Usage:
#   scripts/release-foundry-module.sh            # patch bump (0.1.0 -> 0.1.1)
#   scripts/release-foundry-module.sh 0.2.0       # explicit version
#
# Note on testing a release cut from a feature branch (not `dev`): Foundry's
# own "check for update" flow reads module.json's `manifest` URL, which is
# pinned to the `dev` branch — it won't see a version bumped only on a
# feature branch. To install/test THIS branch's release specifically,
# paste this branch's raw module.json URL directly into Foundry's "Install
# Module" dialog instead of relying on an update check:
#   https://raw.githubusercontent.com/AalcarazZ-Gen/Archivexus/<branch>/module.json
# The `download` URL inside it (releases/latest/download/archivexus.zip) is
# branch-independent — it always resolves to whatever release is currently
# "latest" on GitHub, so this works without merging anything to `dev` first.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) is not installed. Install it (e.g. 'brew install gh') and run 'gh auth login' first." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "error: gh is installed but not authenticated. Run 'gh auth login' first." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree is not clean. Commit or stash your changes before releasing." >&2
  git status --short >&2
  exit 1
fi

CURRENT_VERSION="$(node -p "require('./module.json').version")"

if [[ $# -ge 1 ]]; then
  NEW_VERSION="$1"
else
  NEW_VERSION="$(node -p "
    const [major, minor, patch] = '${CURRENT_VERSION}'.split('.').map(Number);
    \`\${major}.\${minor}.\${patch + 1}\`
  ")"
fi

TAG="v${NEW_VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "error: tag $TAG already exists." >&2
  exit 1
fi

BRANCH="$(git branch --show-current)"

echo "==> Releasing archivexus $CURRENT_VERSION -> $NEW_VERSION (tag $TAG) from branch '$BRANCH'"

node -e "
  const fs = require('fs');
  const path = './module.json';
  const module = JSON.parse(fs.readFileSync(path, 'utf8'));
  module.version = '${NEW_VERSION}';
  fs.writeFileSync(path, JSON.stringify(module, null, 2) + '\n');
"

git add module.json
git commit -m "chore: Bump Foundry module version to ${NEW_VERSION}"

echo "==> Building dist/foundry/archivexus.js"
npm run build:foundry-module

echo "==> Packaging archivexus.zip"
rm -f archivexus.zip
zip -r archivexus.zip module.json dist/foundry >/dev/null

echo "==> Tagging $TAG"
git tag -a "$TAG" -m "archivexus $NEW_VERSION"

echo "==> Pushing branch '$BRANCH' and tag '$TAG'"
git push origin "$BRANCH"
git push origin "$TAG"

echo "==> Creating GitHub Release $TAG"
gh release create "$TAG" archivexus.zip \
  --title "archivexus $NEW_VERSION" \
  --notes "Foundry module build $NEW_VERSION, built from branch $BRANCH." \
  --target "$BRANCH"

rm -f archivexus.zip

echo "==> Done. To install/test this exact build in Foundry, paste this into 'Install Module':"
echo "    https://raw.githubusercontent.com/AalcarazZ-Gen/Archivexus/${BRANCH}/module.json"
