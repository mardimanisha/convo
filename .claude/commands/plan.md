# /plan — Review Branch & Produce Action List

Use at the start of a work session or whenever you need to know what to do next.

## Steps

### 1. Read CLAUDE.md
Read the full `CLAUDE.md` in the repo root. Focus on the phase currently being worked on.

### 2. Check current branch and git status
```bash
git branch --show-current
git status --short
git log origin/main..HEAD --oneline
```

### 3. Identify the current phase
Map the branch name to its phase:
| Branch | Phase |
|--------|-------|
| `phase/1-backend-infra` | Phase 1 — Backend Infra & Session Management |
| `phase/2-relay-ws` | Phase 2 — Relay Service & WebSocket Gateway |
| `phase/3-frontend-data` | Phase 3 — Frontend Data & Logic Layers |
| `phase/4-frontend-ui` | Phase 4 — Frontend UI Layer |
| `phase/5-integration` | Phase 5 — Integration, Load Test & Observability |

### 4. List completed tasks
Scan existing files and tests. Mark tasks ✅ where:
- The implementation file exists AND
- Tests for it exist AND
- `tsc --noEmit` passes for that file

### 5. List remaining tasks
For each incomplete task in the current phase, output:
```
❌ P{N}-{M}: <task name>
   Files to create: <list>
   Tests to write:  <list>
   Blocked by:      <task or OQ ID, or "nothing">
```

### 6. Recommend next action
State exactly one task to work on next, with the reason.

Do not recommend tasks from a future phase. Do not recommend skipping tests.
