# OpenMetadata Hackathon — Full Analysis

---

## 1. Hackathon Overview

- **Name:** Back to the Metadata
- **Organizer:** WeMakeDevs x OpenMetadata / Collate
- **Dates:** April 17–26, 2026 (10-day build window)
- **Format:** Online, 1–4 members, built from scratch during the window
- **URL:** https://www.wemakedevs.org/hackathons/openmetadata
- **Project Board:** https://github.com/orgs/open-metadata/projects/107/views/1

---

## 2. Prizes

| Place | Prize |
|-------|-------|
| 1st | Apple MacBook Neo |
| 2nd | Apple iPad |
| 3rd | Keychron Mechanical Keyboards |
| Contribution Track | $100 per merged PR on **good-first-issues only** |
| All top winners | Job interview at Collate |
| All participants | Certificate |

---

## 3. Rules Summary

- Project must be built from scratch during April 17–26
- Must integrate with / extend OpenMetadata (deeper = better score)
- AI tools allowed but must be disclosed
- Can use starter templates, boilerplates, open-source libraries
- Submitting a pre-existing project with minimal changes = disqualified
- GitHub repo + working demo + README required
- For GitHub contributions ($100/PR): must get issue assigned before starting work

---

## 4. Judging Criteria

1. Potential Impact
2. Creativity & Innovation
3. Technical Excellence
4. Best Use of OpenMetadata
5. User Experience
6. Presentation Quality

---

## 5. Team Profile

- 2 members, both using Claude Code to build (no hand-coding)
- Skills: TypeScript, JavaScript, Next.js, some Python
- No prior AI/LLM experience — Claude handles AI parts
- Database experience only from full-stack web projects
- Machine: 16GB RAM (~70% used normally = ~4.8GB free for Docker)
- Docker note: OpenMetadata needs ~4–6GB RAM minimum; will need to close Chrome/other apps while running

---

## 6. Two Separate Prize Tracks

| Track | What it is | Prize |
|-------|-----------|-------|
| **Build track** | Build an original project, judged on 6 criteria | MacBook / iPad / Keyboards |
| **Good First Issues** | Fix bugs in OpenMetadata's actual codebase | $100 per merged PR |

These are completely independent. You can do both simultaneously.
**Important:** The $100/PR only applies to issues tagged "good-first-issue" — NOT general bug fixes in other tracks.

---

## 7. All 6 Tracks — Overview

### Track 1: MCP Ecosystem & AI Agents (5 ideas)
| Issue | Title | Notes |
|-------|-------|-------|
| #26608 | Conversational Data Catalog Chat App | "ChatGPT for your metadata" — most obvious idea, already has a working prototype from another participant |
| #26609 | New MCP Tools | Already has open PR #27281 — skip |
| #26645 | Multi-MCP Agent Orchestrator | Cross-platform (OM + GitHub + Slack + Google Workspace MCPs) — unique but risky in 10 days |
| #26646 | Metadata AI SDK Starter Templates | Notebooks/LangChain templates — looks like docs, not a product |
| #26647 | Custom Embeddings | Needs ML/BERT fine-tuning — impossible for this team in 10 days |

### Track 2: Data Observability (6 build ideas + ~16 bug fixes)
| Issue | Title | Notes |
|-------|-------|-------|
| #26658 | Data Quality Checks Impact | Scoring model + UI — common pattern, moderate demo |
| #26659 | Human-readable DQ Explanations | RCA traces — impressive but complex |
| **#26660** | **AI-Powered DQ Recommendations** | **Shortlisted — see Section 9** |
| #26661 | Automated Fixes for Failed DQ Checks | Risky — repair logic is complex, safety concerns |
| #26662 | Extended Profiler (statistical metrics) | Pure backend, no demo value |
| #26663 | Incremental/Delta Profiler | Very complex state management, boring demo |

### Track 3: Connectors & Ingestion (5 build ideas + ~22 bug fixes)
**Skip — entirely Python. Wrong track for this team.**

### Track 4: Developer Tooling & CI/CD (3 ideas)
| Issue | Title | Notes |
|-------|-------|-------|
| **#26650** | **VS Code / IDE Extension** | **Shortlisted — see Section 8** |
| #26648 | GitHub Action: "What Breaks If I Change This?" | 70% already built by OpenMetadata team, but in Python — rewrite needed |
| #26649 | OpenMetadata CLI | Requires Rust — hard skip |

### Track 5: Community & Communication Apps (2 ideas)
| Issue | Title | Notes |
|-------|-------|-------|
| #26651 | Slack App | OpenMetadata already ships native Slack alert forwarding — less original than it sounds |
| #26652 | Email/Notification Digest Service | Fills a real gap (no digest exists natively), but weaker demo |

### Track 6: Governance & Classification (2 build ideas + 3 bug fixes)
| Issue | Title | Notes |
|-------|-------|-------|
| #26664 | Custom Auto-Classification Recognizers | Sounds UI-friendly but requires Python/Presidio backend changes — trap for TypeScript team |
| #26665 | Auto Classify Unstructured Data | Too vague, needs ML/OCR, architecture undefined |

---

## 8. Shortlisted Option #1 — VS Code Extension (#26650)

**Track:** Developer Tooling & CI/CD
**Issue:** https://github.com/open-metadata/OpenMetadata/issues/26650

### What it is
A VS Code extension that brings OpenMetadata context into the IDE. When a developer is writing SQL or dbt models, the extension shows:
- Table descriptions, column types, and tags from OpenMetadata
- Lineage information (upstream/downstream) for the entity being referenced
- Data quality status and recent test results
- Owner information and links to the OpenMetadata UI

### Why it scores well

| Criterion | Score | Reason |
|-----------|-------|--------|
| Feasibility | 9/10 | Pure TypeScript, VS Code Extension API is well-documented and TypeScript-native |
| Uniqueness | 9/10 | Nobody has built this for OpenMetadata. Not an obvious idea for most devs |
| Demo quality | 10/10 | Hover over a table name in SQL → metadata pops up. Instantly understood by any developer judge |
| OpenMetadata integration | 8/10 | Uses search, entity details, lineage, DQ check APIs |

### Tech stack
- TypeScript (VS Code Extension API)
- OpenMetadata REST API
- React webviews for richer panels (lineage graphs, DQ status)
- No separate backend needed — extension queries OpenMetadata directly

### Rough 10-day plan
- **Days 1–2:** Extension scaffold, auth flow, connect to OpenMetadata instance
- **Days 3–4:** Hover provider — show table description + column info on hover
- **Days 5–6:** Lineage panel (upstream/downstream visualization)
- **Days 7–8:** DQ status badges + owner info + links back to OpenMetadata UI
- **Days 9–10:** Polish, demo prep, edge cases, package as .vsix

### Competition
- **1 comment** from `Pranav-s-salian` expressing interest, same TypeScript plan
- Not assigned, no code started
- Least crowded track (only 3 ideas total, 2 of which need Rust or Python)

### Risks
- VS Code webview sandboxing (CORS) — well-documented, manageable
- Need a running OpenMetadata instance for development (Docker, ~4–6GB RAM)

---

## 9. Shortlisted Option #2 — AI-Powered DQ Recommendations (#26660)

**Track:** Data Observability
**Issue:** https://github.com/open-metadata/OpenMetadata/issues/26660

### What it is
An agent (powered by Claude) that analyzes a table's profile in OpenMetadata and automatically suggests appropriate data quality tests:
- Looks at column types, names, descriptions, and sample data
- Suggests relevant test definitions from OpenMetadata's test template library
- Creates test cases with sensible default parameters
- Explains its reasoning so humans can review before enabling

### Why it scores well

| Criterion | Score | Reason |
|-----------|-------|--------|
| Feasibility | 9/10 | Next.js + OpenMetadata REST API + Claude API — pure web dev, no complex infra |
| Uniqueness | 8/10 | Few teams will bring an AI agent to the Observability track — unexpected angle |
| Demo quality | 9/10 | Select a table → click "Suggest Tests" → watch Claude explain what tests it recommends and why |
| OpenMetadata integration | 7/10 | Reads table metadata, column profiles, sample data; writes test case definitions |

### Tech stack
- Next.js (frontend + API routes)
- OpenMetadata REST API (read table profiles, write test case suggestions)
- Claude API (Anthropic SDK) for the recommendation agent
- Tailwind CSS + chart library for the dashboard

### Rough 10-day plan
- **Days 1–2:** Connect to OpenMetadata, fetch table profiles and test template library
- **Days 3–4:** Build Claude agent that analyzes column data and suggests tests with reasoning
- **Days 5–6:** Next.js UI — table browser, suggestion display, review/accept flow
- **Days 7–8:** Polish — confidence indicators, explanations, batch suggestions across multiple tables
- **Days 9–10:** Demo dataset prep, edge cases, presentation

### Competition
- **5 comments** — 2 people (`Gurumote` + `ayaaltayeb-ngss`) trying to team up
- Neither assigned, no code, still waiting on maintainer response
- More interest than VS Code Extension but still no real traction

### Risks
- More competitors than VS Code Extension
- "AI + recommendations" is a somewhat common hackathon pattern — needs strong UX to stand out
- OpenMetadata test template library needs to be fully understood upfront

---

## 10. Head-to-Head Comparison

| | VS Code Extension (#26650) | AI DQ Recommendations (#26660) |
|--|---------------------------|-------------------------------|
| **Track** | Developer Tooling | Data Observability |
| **Stack fit** | Perfect (TypeScript) | Perfect (Next.js + Claude API) |
| **Feasibility** | 9/10 | 9/10 |
| **Uniqueness** | 9/10 | 8/10 |
| **Demo** | 10/10 | 9/10 |
| **Competition** | 1 person interested | 2 people trying to team up |
| **OpenMetadata depth** | 8/10 | 7/10 |
| **"Wow factor"** | Very high — visceral live demo | High — AI doing visible useful work |
| **Risk** | CORS/webview, Docker setup | More competitors, common pattern |

**Both are strong. VS Code Extension edges ahead on uniqueness, demo quality, and lower competition.**

---

## 11. Good First Issues (Side Money — $100/PR)

$100 per merged PR, good-first-issues only. Checked all 21 open good-first-issues across
the repo. Most already have multiple open competing PRs or already merged solutions.

### Full analysis — all 21 issues

| Issue | Title | Open PRs | Merged? | Verdict |
|-------|-------|----------|---------|---------|
| #24348 | ValueError: invalid literal for int() | 3 open | ✅ MERGED | Skip |
| #12787 | Add MSSQL & Oracle backends to Hive metastore | 1 open | ✅ MERGED | Skip |
| #26737 | dbt ingestion cannot remove tags | 1 open, 1 closed | ✅ MERGED (broken) | Skip |
| #25063 | Column tag filter works per page only | 0 open, 1 closed | ✅ MERGED | Skip |
| #26939 | CustomProperty shows table name not FQN | 4 open | ❌ | Too saturated |
| #26775 | Issues with QuickStart | 4 open | ❌ | Too saturated |
| #26712 | Add metadata flag for Hive partition keys | 3 open | ❌ | Too saturated |
| #27004 | omjob-operator pod names too long | 4 open | ❌ | Too saturated |
| #15627 | Profiler support for complex data types | 0 open, 3 closed | ❌ | Complex, contested |
| #26824 | Incorrect filter on Column Bulk Operations | 1 open (fresh, passing tests) | ❌ | Java, losing race |
| #26890 | Tableau embedded datasource lineage | 2 open | ❌ | Python, risky |
| #26889 | Recursive AD group membership in LDAP | 2 open | ❌ | Python, auth-sensitive |
| #26670 | QuickSight column aliases wrong in lineage | 2 open | ❌ | Python, complex |
| #21304 | Randomization of AutoClassifier sample data | 2 open, 1 closed | ❌ | Python, assigned |
| #24559 | Greenplum 7 connector partition fix | 2 open, 1 closed | ❌ | Python, behind |
| #26774 | Custom Properties in Policy Rule Conditions | 2 open | ❌ | Java, complex |
| **#27239** | **Cluster Key constraint not visible in UI** | **1 open** | ❌ | **✅ SHORTLISTED** |
| **#22399** | **Persona customization for service details** | **0 PRs** | ❌ | **✅ SHORTLISTED** |
| **#26785** | **dbt: skip compiled-only test results** | **2 open** | ❌ | **✅ SHORTLISTED** |
| #26692 | StarRocks table comments not ingested | 2 open | ❌ | Backup option |
| #21203 | Add testSuites to CreateTestCaseRequest API | 2 open | ❌ | Backup option |

---

### Shortlisted: 3 targets

#### 🥇 #27239 — Cluster Key Table Constraint not visible in UI
- **URL:** https://github.com/open-metadata/OpenMetadata/issues/27239
- **Type:** Frontend TypeScript/React
- **Fix:** `CLUSTER_KEY` constraint exists in backend but UI doesn't display it.
  Copy the exact pattern used for `SortKey`/`DistKey` across 2 files (~40 lines)
- **Files:** `Table.constants.ts` + `TableConstraintsModal.component.tsx`
- **Competition:** 1 open PR — lowest saturation of all viable issues
- **AI confidence:** 9/10
- **Why we can win:** Trivial mechanical fix, TypeScript, and the 1 existing PR
  may have quality/review issues we can beat

#### 🥈 #22399 — Persona customization for service details page
- **URL:** https://github.com/open-metadata/OpenMetadata/issues/22399
- **Type:** Frontend TypeScript/React
- **Fix:** Extend existing persona customization system (already built for Table/Data Product
  pages) to the Service Details page. Follow the same pattern. ~80-120 lines across 4 files
- **Files:** `PersonaUtils.ts`, `ServiceDetailsPage.tsx`, `CustomizePageUtils.ts`, `CustomizablePage.tsx`
- **Competition:** 0 PRs — cleanest opportunity. Assignee (RajdeepKushwaha5) has been quiet 4+ days
- **AI confidence:** 7/10
- **Why we can win:** No PRs at all. If we submit first with quality code, very likely to merge

#### 🥉 #26785 — dbt ingestion: skip compiled-only test results
- **URL:** https://github.com/open-metadata/OpenMetadata/issues/26785
- **Type:** Backend Python (dbt connector)
- **Fix:** Filter out dbt test results that compiled but never actually ran SQL
  (detected by null message field). ~30-60 lines, single conditional filter
- **Competition:** 2 open PRs — but fix is so simple we can potentially do it cleaner/faster
- **AI confidence:** 8/10
- **Why we can win:** Tiny fix, Python is manageable, and if existing PRs have issues
  in review we can slip in a cleaner solution

### Strategy
- Day 1 of hackathon (Apr 17): immediately comment on all 3 issues requesting assignment
- Implement all 3 fixes the same day — these are small enough
- Priority order: #27239 → #22399 → #26785
- Submit PRs with clean descriptions, tests, and fast review response turnaround

---

## 12. OpenMetadata Setup — No Docker Needed

A hosted sandbox is provided for hackathon participants:
- **URL:** https://sandbox.open-metadata.org/
- **Login:** Google account — no setup required
- Both teammates connect to the same instance
- Mimics a real production environment
- Docs: https://docs.open-metadata.org/v1.11.x/quick-start/sandbox

No local Docker setup needed. No RAM issues. No money spent.

---

## 13. Next Steps

1. Lock in one of the two shortlisted options
2. Both teammates log into https://sandbox.open-metadata.org/ with Google
3. Explore the sandbox — get familiar with the UI and REST API before April 17
4. Optionally: comment on a good-first-issue to reserve it for the side track
