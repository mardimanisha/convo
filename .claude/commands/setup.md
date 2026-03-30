# /setup — Environment Setup & Health Check

Run at the start of every worktree session before doing anything else.

## Steps

### 1. Install dependencies
```bash
npm install
```

### 2. Verify .env exists
```bash
[ -f .env ] \
  && echo "✅ .env found" \
  || (cp .env.example .env && echo "⚠️  .env created — fill in DEEPGRAM_API_KEY before Phase 2+")
```

### 3. Check Redis
```bash
docker compose ps redis 2>/dev/null | grep -q "Up" \
  && echo "✅ Redis running" \
  || (docker compose up redis -d && sleep 2 && echo "🚀 Redis started")
```
Verify connectivity:
```bash
docker compose exec redis redis-cli ping 2>/dev/null | grep -q PONG \
  && echo "✅ Redis PONG" \
  || echo "❌ Redis not responding — run: docker compose logs redis"
```

### 4. TypeScript check across workspace
```bash
npm run tsc --workspaces --if-present 2>&1 | tail -30
```
Expected: zero errors.

### 5. Print session context
```bash
echo "Branch  : $(git branch --show-current)"
echo "Worktree: $(pwd)"
echo "Dirty   : $(git status --short | wc -l | tr -d ' ') file(s)"
git log --oneline -5
```

### 6. Done
Print a ✅/❌ summary for each step. Stop and fix any ❌ before proceeding.
