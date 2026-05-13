# SHIP SDLC Gate Checklist
## Quick Status Card for Non-Developers
### pylabmit | v3.0

Use this checklist to review what the AI builder delivered. You don't need to understand code — just check the status of each gate.

---

## How to Read This

| Color | Meaning | Action |
|-------|---------|--------|
| 🟢 PASS | Gate requirements met with evidence | Proceed to next gate |
| 🟡 PARTIAL | Some items met, some missing or weak | Can ship with documented limitations |
| 🔴 FAIL | Critical items missing or broken | CANNOT ship — must fix first |
| ⚪ N/A | Gate doesn't apply to this project | Skip |

## What BLOCKS Shipping (no exceptions)

- 🔴 Any security failure (API key exposed, SQL injection)
- 🔴 Fake/hardcoded data visible to users
- 🔴 Dead buttons (buttons that exist but do nothing when clicked)
- 🔴 Any core user flow that doesn't complete end-to-end
- 🔴 Data that disappears after page refresh

---

## The 12 Gates

### G0: Idea & Value
| Check | Evidence | Status |
|-------|----------|--------|
| Who is the user? | Described in docs/discovery.md | 🟢🟡🔴 |
| What problem does it solve? | Pain point documented | 🟢🟡🔴 |
| How do we know it works? | Success metric defined | 🟢🟡🔴 |
| What's MVP vs future? | Scope is clear | 🟢🟡🔴 |

### G1: Requirements
| Check | Evidence | Status |
|-------|----------|--------|
| Features listed? | docs/requirements.md exists | 🟢🟡🔴 |
| Each feature has "done when"? | Acceptance criteria per feature | 🟢🟡🔴 |
| Edge cases considered? | Bad input, empty data, duplicates | 🟢🟡🔴 |
| Test inputs exist? | 3+ sample inputs per flow | 🟢🟡🔴 |

### G2: Architecture
| Check | Evidence | Status |
|-------|----------|--------|
| Tech stack documented? | docs/architecture.md | 🟢🟡🔴 |
| Database tables defined? | CREATE TABLE statements | 🟢🟡🔴 |
| Every API endpoint defined? | docs/api-contract.md | 🟢🟡🔴 |
| .env template exists? | All variables listed | 🟢🟡🔴 |

### G3: UX / Interaction
| Check | Evidence | Status |
|-------|----------|--------|
| Every screen listed? | docs/ux-spec.md | 🟢🟡🔴 |
| Loading/empty/error states defined? | Per screen | 🟢🟡🔴 |
| Every button/card classified? | Actionable vs informational | 🟢🟡🔴 |
| No dead buttons? | All actionable elements work | 🟢🟡🔴 |

### G4: Data & API
| Check | Evidence | Status |
|-------|----------|--------|
| Database is source of truth? | Not localStorage | 🟢🟡🔴 |
| Data survives refresh? | Test: create data → F5 → still there? | 🟢🟡🔴 |
| Delete requires confirmation? | No instant-delete without warning | 🟢🟡🔴 |
| API errors handled? | 400/404/500 return friendly messages | 🟢🟡🔴 |
| Backup method exists? | Documented in data-plan.md | 🟢🟡🔴 |

### G5: Security (🔴 blocks shipping)
| Check | Evidence | Status |
|-------|----------|--------|
| No API keys in frontend? | grep returns CLEAN | 🟢🔴 |
| .env in .gitignore? | Verified | 🟢🔴 |
| CORS locked to frontend origin? | Not set to * | 🟢🔴 |
| Input validated on backend? | Required fields checked | 🟢🔴 |
| No stack traces in error responses? | Errors are user-friendly | 🟢🔴 |
| npm audit clean? | No critical/high findings | 🟢🟡🔴 |

### G6: Build Milestones
| Check | Evidence | Status |
|-------|----------|--------|
| Built milestone-by-milestone? | docs/test-log.md has per-milestone entries | 🟢🟡🔴 |
| Regression tested? | Previous features verified at each milestone | 🟢🟡🔴 |
| All milestones passed? | No unresolved failures | 🟢🟡🔴 |

### G7: Test Strategy
| Check | Evidence | Status |
|-------|----------|--------|
| Tests exist? | docs/test-plan.md + actual test files | 🟢🟡🔴 |
| Core flows tested end-to-end? | Integration test results logged | 🟢🟡🔴 |
| Dashboard click-tested? | Every actionable element verified | 🟢🟡🔴 |
| Data persistence tested? | Restart test passed | 🟢🟡🔴 |
| Security greps passed? | Logged in test-log.md | 🟢🟡🔴 |

### G8: Release Readiness
| Check | Evidence | Status |
|-------|----------|--------|
| README complete? | Install + run + .env instructions work | 🟢🟡🔴 |
| Can start from fresh clone? | npm install + npm run dev works | 🟢🟡🔴 |
| Known limitations listed? | Honest in README and ship-report | 🟢🟡🔴 |
| Version number set? | In package.json | 🟢🟡🔴 |

### G9: Customer Acceptance (🔴 blocks shipping)
| Check | Evidence | Status |
|-------|----------|--------|
| Every core flow completable? | Tested in docs/acceptance-test.md | 🟢🔴 |
| No dead buttons? | All buttons do something | 🟢🔴 |
| No fake data visible? | All data from real sources or user input | 🟢🔴 |
| No placeholder screens? | No "TODO" or "Coming soon" | 🟢🔴 |
| Primary actions obvious? | User can find them without help | 🟢🟡🔴 |

### G10: Operations
| Check | Evidence | Status |
|-------|----------|--------|
| Health endpoint works? | GET /api/health returns ok | 🟢🟡🔴 |
| Backup procedure documented? | docs/ops-runbook.md | 🟢🟡🔴 |
| Troubleshooting guide exists? | 5+ common problems with fixes | 🟢🟡🔴 |

### G11: Post-Ship Review
| Check | Evidence | Status |
|-------|----------|--------|
| Retrospective completed? | docs/post-ship-review.md | 🟢🟡🔴 |
| Next version backlog created? | v1.1 feature list | 🟢🟡🔴 |
| Lessons learned documented? | For next project | 🟢🟡🔴 |

---

## Final Verdict

| Verdict | Criteria |
|---------|----------|
| ✅ **SHIP** | All gates 🟢, no 🔴 anywhere |
| ⚠️ **SHIP WITH KNOWN ISSUES** | Some gates 🟡, no 🔴 in G5/G9, limitations documented |
| ❌ **DO NOT SHIP** | Any 🔴 in G5 (Security) or G9 (Customer Acceptance), or any core flow broken |

---

*SHIP Studio v3.0 — pylabmit*
