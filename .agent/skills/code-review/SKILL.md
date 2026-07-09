---
name: code-reviewer
description: Reviews the codebase against security guidelines, project documentation, and historical error logs. Only appends verified issues to long-term memory after explicit user approval.
---

# Code Reviewer Skill

## Prerequisites
- **Project Context Path:** Look into the root `/docs` folder and `/plans` for architectural guidelines before starting.
- **Memory Retention Path:** Look at `/docs/tech_stack_guidelines.md` for the historical error log.

## Process Steps
1. **Read Project Context & History:** Before analyzing any code, search and read related markdown files inside the `/docs` folder, `/plans` folder, and explicitly read the historical log at `/docs/tech_stack_guidelines.md`.
2. **Extract Rules:** Extract architecture constraints, design decisions, system requirements, and historical prevention rules from those documents.
3. **Audit Code Changes:** Audit the requested files against the general standards, specific folder context, and past project failures to ensure historical bugs are not reintroduced.
4. **Enforce General Standards:**
   - Check for hardcoded API keys.
   - Ensure input validation is present on all forms.
   - Validate that variables use camelCase.
5. **Output Feedback:** Highlight any code that violates general standards, folder specifications, or past prevention rules.
6. **Propose Memory Updates (Gated Memory Hook):** If you discover issues during this review, create a tentative list of new defects. Do NOT write them to disk yet. Instead, present them to the user in the following format:
```
# Proposed Additions to Long-Term Memory
[ ] Issue: [Describe what went wrong]
Prevention Rule: [Instruction for next time]
```
7. **Await Human Approval:** Explicitly ask the user: *"Should I commit these prevention rules to your tech_stack_guidelines.md log?"* Only use your file-writing capabilities to append the data if the user explicitly responds with a confirmation (e.g., "yes", "approve", "go ahead"). Discard any items the user flags as a false positive.
