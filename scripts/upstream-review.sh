#!/usr/bin/env bash
# Lists upstream ntfy commits not yet reviewed for cherry-picking (see UPSTREAM.md).
#
#   scripts/upstream-review.sh           list unreviewed commits
#   scripts/upstream-review.sh --mark    record everything up to upstream/main as reviewed
#
# Reviewed position is the "upstream-reviewed" tag; commits are flagged when they look
# security-related or touch files this fork has changed.
set -euo pipefail

remote=${UPSTREAM_REMOTE:-upstream}
branch=${UPSTREAM_BRANCH:-main}
marker=upstream-reviewed

git fetch --quiet "$remote" "$branch"
git fetch --quiet origin "refs/tags/$marker:refs/tags/$marker" 2>/dev/null || true

if [[ "${1:-}" == "--mark" ]]; then
  git tag -f "$marker" "$remote/$branch" >/dev/null
  git push --quiet --force origin "refs/tags/$marker"
  echo "Marked $(git rev-parse --short "$remote/$branch") as reviewed."
  exit 0
fi

range="$marker..$remote/$branch"
count=$(git rev-list --count "$range")
if [[ "$count" == 0 ]]; then
  echo "No unreviewed upstream commits."
  exit 0
fi

# Files changed on this fork since it split from upstream
forked_files=$(git diff --name-only "fork-base..HEAD")

echo "$count unreviewed upstream commit(s) in $range"
echo "  [security] message mentions a vulnerability   [fork] touches a file this fork changed"
echo
git log --reverse --format='%h%x09%ad%x09%s' --date=short "$range" | while IFS=$'\t' read -r sha date subject; do
  flags=""
  if grep -qiE 'security|vulnerab|cve-|ghsa-|dos\b|denial of service|ssrf|xss|injection|bypass|leak' <<<"$subject"; then
    flags+="[security] "
  fi
  if git diff-tree --no-commit-id --name-only -r "$sha" | grep -qxF -f <(printf '%s\n' "$forked_files"); then
    flags+="[fork] "
  fi
  printf '%s  %s  %s%s\n' "$sha" "$date" "$flags" "$subject"
done
echo
echo "Cherry-pick with: git cherry-pick -x <sha>   then log it in UPSTREAM.md and run: $0 --mark"
