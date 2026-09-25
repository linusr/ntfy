# Upstream

This repository is a hard fork of [ntfy](https://github.com/binwiederhier/ntfy), split from upstream at
`4f52663d` (v2.28.0 plus one commit, 2026-09-23), tagged `fork-base`.

## Policy

- Upstream changes are cherry-picked selectively; the fork does not merge or rebase onto upstream.
- Security fixes take priority. Features are taken when they apply cleanly and fit this fork.
- An area stops taking upstream changes once a pick would need porting rather than applying; from then on
  it evolves independently.
- The HTTP API, message format and CLI stay compatible with ntfy, so ntfy clients and integrations keep working.
- Upstream authorship is preserved: cherry-picks use `git cherry-pick -x`, and licensing and credits in
  [README.md](README.md) remain.

## Review process

1. `scripts/upstream-review.sh` lists upstream commits after the `upstream-reviewed` tag, flagging
   security-related messages and commits that touch files changed on this fork.
2. Wanted commits are applied with `git cherry-pick -x <sha>` and recorded below.
3. `scripts/upstream-review.sh --mark` moves `upstream-reviewed` to the current upstream `main`.

## Log

| Date | Upstream reviewed through | Picked | Skipped (notable) |
|---|---|---|---|
| 2026-09-25 | `4f52663d` (fork base) | — | — |
