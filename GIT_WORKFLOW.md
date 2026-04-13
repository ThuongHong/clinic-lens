# Git Workflow for Team (Member 1 + Member 3)

Để tránh xung đột mã nguồn trong hackathon tốc độ cao, hãy tuân thủ workflow này.

## Branching Strategy

```
main (only for final submission)
  ↑
  │ (pull request)
  │
dev (integration branch)
  ↑
  └─ feat/backend-sqs-upgrade (Member 1)
  └─ feat/3d-scene (Member 3)
  └─ feat/file-picker (Member 3)
```

## Member 1: Backend Work

### Create a feature branch

```bash
git checkout -b feat/backend-alibaba-setup dev
```

### Make changes

```bash
# Edit backend/server.js, .env.example, etc.
git add backend/
git commit -m "feat(backend): Robustify env loading and add health endpoint"
```

### Push and create PR

```bash
git push origin feat/backend-alibaba-setup
# Then go to GitHub and create PR against dev
# Title: "[Member 1] Backend Setup: STS + OSS + Qwen Integration"
```

### Before merging to dev

- ✅ Self-review code
- ✅ Test locally: `npm install && npm start`
- ✅ Run: `./test-backend.sh`
- 🔔 **Announce in group**: "Merging branch feat/backend-alibaba-setup to dev - no conflicts expected"
- ✅ Get review from another member if available
- ✅ Merge PR

---

## Member 3: Flutter Work

### Create feature branches (for separate concerns)

```bash
# Branch 1: UI scaffolding
git checkout -b feat/analysis-screen dev

# Branch 2: File picker
git checkout -b feat/file-picker dev

# Branch 3: 3D scene
git checkout -b feat/flutter-scene-3d dev
```

### Work on analysis screen

```bash
git checkout feat/analysis-screen
# Edit mobile/lib/screens/analysis_screen.dart
# Edit mobile/lib/widgets/body_scene_panel.dart
git add mobile/lib/screens/ mobile/lib/widgets/
git commit -m "feat(mobile): Add analysis screen and organ highlighting"
git push origin feat/analysis-screen
```

### Before merging to dev

- 🔔 **Announce in group**: "About to merge feat/analysis-screen - only touched screens/ and widgets/"
- ✅ No changes to `lib/main.dart` or `lib/models/` (shared territory)
- ✅ Run Flutter checks: `flutter format lib/` and `flutter analyze`
- ✅ Create PR and merge

### Don't touch

- **lib/main.dart** - shared with Member 1 if they need to update routing
- **lib/models/** - shared data contract (both members)
- **pubspec.yaml** - coordinate before version pinning

---

## Merging to main (Final Submission)

Only do this when the hackathon is over and everything is tested:

```bash
# On local machine
git checkout main
git pull origin main
git merge dev --no-ff -m "final(submission): Complete Smart Labs Analyzer

- Backend: STS, OSS, Qwen streaming
- Mobile: File picker, 3D highlighting
- Integration: End-to-end flow tested"
git push origin main
```

---

## If Conflict Happens

### Example: Both members edit `.env.example`

```bash
# Pull latest dev first
git fetch origin
git rebase origin/dev

# Git will tell you the conflict
# Edit the file, keep both sections, re-arrange as needed
git add .env.example
git rebase --continue
```

### Example: Both members edit `lib/main.dart`

**This should NOT happen if you follow the separation rule.** If it does:

- 🔔 **Stop and communicate in group chat immediately**
- Don't force merge; discuss who made the change and why
- One member can create a shared branch to resolve

---

## Regular Check-ins

| Time | Checklist |
|------|-----------|
| Start | Each member creates their feature branch |
| 30 min | Announce what you're working on in group |
| 1 hour | Push first draft, ask for quick review |
| 2 hours | Merge first feature to `dev` |
| 3 hours | All features should be in `dev`, do integration test |
| End | One final PR to `main` for submission |

---

## Useful Git Commands

```bash
# See all branches
git branch -a

# See what changed on your branch vs dev
git diff dev...HEAD

# Undo last commit (before push)
git reset --soft HEAD~1

# See commit history on your branch
git log dev..HEAD --oneline

# Abort a rebase if things go wrong
git rebase --abort
```

---

## .gitignore Reminder

Already set up in repo:

```
.env              # Don't commit secrets!
backend/node_modules/
mobile/.dart_tool/
mobile/build/
```

Always verify before committing:

```bash
git status
# Should NOT show: ALI_ACCESS_KEY, ALI_SECRET_KEY, DASHSCOPE_API_KEY
```

---

Good luck! 🚀
