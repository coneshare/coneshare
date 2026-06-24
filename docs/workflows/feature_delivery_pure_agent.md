# Feature Delivery Workflow (Pure Agent / Manual Markdown Management)

This document maps out the complete end-to-end feature lifecycle—from planning to deployment—when managing repository guidelines and episodic memory exclusively through conversational AI agent commands.

---

## Phase 1: Planning & Architecture Design
Before writing any code, you collaborate with the agent to plan the feature implementation details.

1. **The Boot Sweep Execution:** 
   - You launch your coding agent workspace. The agent automatically executes its **Boot Sweep**, parsing `AGENTS.md` and `./.agent/memory.md` to instantly align with your multi-service monorepo structure and active constraints.
2. **Design Mapping:** 
   - You instruct the agent: *"Plan how to enforce password protection on shared links across our Django and Go services."*
3. **Interactive Milestone Trigger (Category 4):**
   - The agent designs the cross-service handshake. Because this is a permanent structural decision, it presents a draft block before saving:
     ```markdown
     ### [2026-06-24] Session Entry
     - **Category:** Architecture Choice
     - **Context/Implication:** Secure file downloads require shared link password verification across Django and Go.
     - **Resolution/Action:** Go file service (`core/main.go`) must call a verification endpoint on the Django API (`backend/sharelinks/`) before allowing file stream downloads.
     ```
4. **The Save:** You type "yes", and the agent appends this entry to your local history log.

---

## Phase 2: Implementation & Coding Guardrails
With the plan finalized, you move into the development and code generation phase.

1. **Enforcing Static Guardrails:**
   - The agent references the rules inside `AGENTS.md` to maintain coding standards (PEP 8 for Python, `PascalCase` file naming structures inside `frontend/src/pages`).
2. **Context Leak Prevention:**
   - Thanks to your local **Boot Sweep**, the agent remembers your strict workflow policy: *Do not create Django migration files unless explicitly requested.* It alters the database models but skips file serialization, saving you from accidental migration file clutter.
3. **Manual Human Interventions:**
   - If you work independently on a file and discover a critical codebase constraint (e.g., a file system permission requirement), you manually open `./.agent/memory.md` in your text editor, scroll to the bottom, and manually log the entry to ensure the agent remembers it next time it boots.

---

## Phase 3: Testing & Interactive Overrides
Once the code is written, the feature must be validated using containerized testing environments.

1. **Targeted Test Execution:**
   - You tell the agent: *"Run the tests for the new password views."* The agent scans your memory reference files, builds the long-form container string, and targets the suite dynamically:
     ```bash
     COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q tests/sharelinks/test_views.py
     ```
2. **The Stale Memory Event & Override Flow:**
   - Suppose an infrastructure update happens mid-testing, migrating internal network URLs to an overlay mesh network. Your previous `2026-06-24` container binding rule is now obsolete.
   - You inform the agent of the change. The agent checks its history, identifies the stale entry, and generates an **Interactive Override Draft**:
     ```markdown
     ### [2026-07-08] Session Entry [SUPERSEDES 2026-06-24]
     - **Category:** Tooling Update
     - **Context/Implication:** Docker container bridge routing aliases are deprecated due to the new overlay mesh network integration.
     - **Resolution/Action:** **[OVERRIDE]** Disregard the old \`http://backend:8000/\` host binding rule. Route all cross-service container handshakes strictly through \`http://coneshare.internal\`.
     ```
3. **The Save:** You type "yes" to append the block, keeping your history accurate while pointing future boot sweeps to the new mesh endpoint.

---

## Phase 4: Reviewing & Pull Request Preparation
The feature is coded and tested. You are ready to review your workspace state and open a Pull Request.

1. **Auditing the Memory Log:**
   - Before submission, you must provide your team with precise configuration updates and test summaries. You manually open `./.agent/memory.md`. 
   - Because your logs grow chronologically, you read through the file and filter out older, superseded entries to accurately extract current active states for your team notes.
2. **The Session Wrap-Up Trigger:**
   - You declare your session finished by typing a close command (`exit` or `bye`). The agent scans the current state and drafts your final handoff context block:
     ```markdown
     ### [2026-07-08] Session Entry
     - **Category:** Architecture Choice
     - **Context/Implication:** Shared link password validation logic and mesh network routing configurations are 100% operational on the backend.
     - **Resolution/Action:** Next session must focus entirely on building the frontend React prompt components in \`frontend/src/pages/\` to capture user passwords.
     ```
3. **The Final Commit:** You review the draft, confirm the save, and shut down your terminal. Your workspace remains cleanly summarized and primed for a flawless launch tomorrow.
