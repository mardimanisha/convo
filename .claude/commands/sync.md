# /sync — Rebase Current Branch onto Latest main

Run when `main` has been updated mid-session (e.g., another phase was merged).

## Steps

### 1. Stash any uncommitted changes
```bash
git stash push -m "sync-stash-$(date +%s)"
```

### 2. Fetch latest main
```bash
git fetch origin main
```

### 3. Rebase onto origin/main
```bash
git rebase origin/main
```

### 4. Handle conflicts (if any)
If rebase stops with conflicts:
1. Open each conflicted file and resolve manually.
2. Preserve the intent of BOTH sides — do not blindly accept ours or theirs.
3. After resolving:
   ```bash
   git add <resolved-file>
   git rebase --continue
   ```
4. If the conflict is too complex: `git rebase --abort` and ask for guidance.

### 5. Restore stash
```bash
git stash pop
```
If stash pop conflicts, resolve the same way as step 4.

### 6. Verify integrity after sync
```bash
npm run tsc --workspaces --if-present 2>&1 | tail -10
npm run test --workspaces --if-present 2>&1 | tail -10
```

### 7. Done
Print the new `git log --oneline -8` to confirm the branch is up to date.

**Prefer rebase over merge** — keeps the branch history linear and makes PRs easier to review.
