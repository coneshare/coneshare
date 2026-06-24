# Feature Delivery Workflow (With agent-mem CLI Script)

This document describes the optimized end-to-end feature lifecycle—from planning to deployment—using `AGENTS.md`, local episodic memory (`./.agent/memory.md`), and the `./agent-mem` terminal script to eliminate manual file management and context overhead.

---

## Phase 1: Planning & Architecture Design
Before writing code, you collaborate with the agent to plan the implementation details of a new feature (e.g., *"Enforcing password protection on shared links"*).

1. **The Boot Sweep Execution:** 
   - You launch your coding agent workspace. The agent automatically executes its **Boot Sweep**, parsing `AGENTS.md` and `./.agent/memory.md` to instantly align with your multi-service monorepo structure and active constraints.
2. **Interactive Milestone Trigger (Category 4):**
   - The agent designs the cross-service handshake. Because this is a permanent structural decision, it presents a draft block before saving:
     ```markdown
     ### [2026-06-24] Session Entry
     - **Category:** Architecture Choice
     - **Context/Implication:** Secure file downloads require shared link password verification across Django and Go.
     - **Resolution/Action:** Go file service (`core/main.go`) must call a verification endpoint on the Django API (`backend/sharelinks/`) before allowing file stream downloads.
     ```
3. **The Save:** You type "yes", and the agent appends this entry to your local history log.

---

## Phase 2: Coding & Rapid Knowledge Capture
You close your heavy AI agent tool to focus and manually program or refactor files yourself.

* **The Pure Agent Missing Case:** If you discover a critical codebase constraint (e.g., a file system permission quirk) while coding independently, you are forced to stop your work, open a text editor, navigate to `.agent/memory.md`, scroll to the bottom, and manually write out markdown tables by hand to keep the agent updated for its next session.
* **How `agent-mem` Fixes It:** You never leave your active terminal screen or break your coding momentum. You instantly log the constraint using a one-line terminal shortcut:
  ```bash
  ./agent-mem add "Gotcha" "The Go file service container crashes unless permissions on the local uploads mount are set to 755."
  ```
* **Result:** The script automatically generates the markdown schema, applies the current date timestamp, and appends it to your memory background layer in less than two seconds.

---

## Phase 3: Testing & Dynamic Overrides
Once the code is written, the feature must be validated using containerized testing environments.

1. **Targeted Test Execution:**
   - You tell the agent: *"Run the tests for the new password views."* The agent scans your memory reference files, builds the long-form container string, and targets the suite dynamically:
     ```bash
     COMPOSE_PROJECT_NAME=coneshare docker-compose exec backend pytest -q tests/sharelinks/test_views.py
     ```
2. **The Stale Memory Event & Override Flow:**
   - Mid-testing, the infrastructure is upgraded to an overlay mesh network, rendering your older `2026-06-24` container binding rule obsolete. 
   - You inform the agent of the change. The agent executes its **Override Flow**, appending a `[SUPERSEDES]` block to update its technical bounds without deleting historical records:
     ```markdown
     ### [2026-07-08] Session Entry [SUPERSEDES 2026-06-24]
     - **Category:** Tooling Update
     - **Context/Implication:** Docker container bridge routing aliases are deprecated due to the new overlay mesh network integration.
     - **Resolution/Action:** **[OVERRIDE]** Disregard the old \`http://backend:8000/\` host binding rule. Route all cross-service container handshakes strictly through \`http://coneshare.internal\`.
     ```
3. **The Save:** You confirm the draft, and the agent commits the override block.

---

## Phase 4: Reviewing & Pull Request Preparation
The feature is coded and tested. You are ready to review your workspace state and open a Pull Request.

* **The Pure Agent Missing Case:** Before opening a shared GitHub Pull Request, you must provide your team with precise configuration updates and test summaries. In a pure agent flow, you have to open a massive, months-old markdown log file and manually read through extensive text to mentally filter out obsolete history and isolate what is currently active.
* **How `agent-mem` Fixes It:** You execute a single terminal command:
  ```bash
  ./agent-mem active
  ```
* **Result:** The script uses an optimized processing loop to instantly strip out all old, overridden, and superseded historical records. It prints a clean, high-density terminal layout displaying *only* current valid system configurations and testing triggers, ready to be copy-pasted into your Git PR notes.

---

## Phase 5: Handoff State Logging
You declare your session finished by typing a close command (`exit` or `bye`). The agent runs its **Session Wrap-Up Trigger**, summarizing overall feature health and outlining next steps:

```markdown
### [2026-07-08] Session Entry
- **Category:** Architecture Choice
- **Context/Implication:** Shared link password validation logic and mesh network routing configurations are 100% operational on the backend.
- **Resolution/Action:** Next session must focus entirely on building the frontend React prompt components in \`frontend/src/pages/\` to capture user passwords.
```

You approve the final block, and your workspace remains cleanly summarized and primed for a flawless launch tomorrow.
