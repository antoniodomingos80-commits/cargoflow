---
name: create-skill
description: "Use when you need to turn a repeatable workflow into a reusable skill for this repository or your personal setup."
---

# Create a Reusable Skill

## Purpose
Turn a repeatable workflow into a reusable skill so future sessions can follow the same process consistently and with less ambiguity.

## When to use
- You have identified a multi-step workflow that should be reused.
- You want to package an investigation, implementation, review, or debugging pattern.
- You need a reusable workflow for this repository or for your personal setup.

## Workflow
1. Identify the workflow
   - Capture the goal, inputs, outputs, and constraints.
   - Note the sequence of actions and any decision points.
2. Decide the scope
   - Use workspace scope for repository-specific practices: .github/skills/<name>/SKILL.md.
   - Use user scope for cross-workspace habits: {{VSCODE_USER_PROMPTS_FOLDER}}/.
3. Draft the skill
   - Add YAML frontmatter with a clear name and description.
   - Include sections for purpose, when to use, workflow, decision points, quality criteria, and examples.
4. Validate the skill
   - Confirm the file is in the correct location.
   - Verify frontmatter syntax and make sure the description is discoverable.
   - Ensure the steps are specific enough to follow without extra interpretation.
5. Refine
   - Ask for feedback on ambiguous sections.
   - Tighten the wording and add examples when needed.

## Decision points
- If the workflow is broad and applies across most tasks, prefer instructions instead of a skill.
- If the workflow is focused and multi-step, use a skill.
- If the workflow needs isolated context or specialized tool restrictions, consider a custom agent instead.

## Completion checklist
- The skill has a clear purpose.
- The workflow is broken into actionable steps.
- The scope and storage location are explicit.
- The skill is saved in the correct customization folder.

## Example prompts
- "Create a skill for our code review checklist."
- "Package this debugging workflow into a reusable skill for this workspace."
- "Turn this implementation pattern into a skill that others can reuse."
