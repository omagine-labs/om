---
description: Start work on a Linear task with proper git setup and planning
---

# Start Task: $ARGUMENTS

You are starting work on a Linear task. Follow this workflow precisely.

## 1. Fetch the Task from Linear

Use the Linear MCP to fetch the task with ID: `$ARGUMENTS`

**Required MCP calls:**

1. `get_issue` - Fetch the main issue details (title, description, state, priority, labels)
2. `get_issue_comments` - Fetch all comments for additional context
3. If the issue has a parent, fetch the parent issue for broader context
4. If the issue belongs to a project, note the project name and milestone

**Extract and understand:**

- Title and full description
- Acceptance criteria (if specified)
- All comments (often contain critical context)
- Labels, priority, assignee
- Parent issue or project context
- Any linked issues or dependencies

## 2. Present the Task

Summarize what you understand the task to be. Be concise.

## 3. Clarifying Questions

Ask clarifying questions to fill gaps in your understanding. Focus on:

- Acceptance criteria (what does "done" look like?)
- Scope boundaries (what's explicitly NOT included?)
- Technical constraints or preferences
- Dependencies or blockers

Continue until you have enough clarity to proceed. For small tasks, this might be 1-2 questions. Don't over-engineer.

Once clarification is complete:

1. Summarize what you learned
2. Show the user the **EXACT description update** you'll make to Linear
3. Ask explicitly: "Does this look good to update in Linear?"
4. **BLOCK** - Do NOT proceed to git setup until Linear is updated

Preserve the original description structure but enrich it with the clarified details.

## 4. Git Setup

Once clarified, execute these git commands:

```bash
git checkout production
git pull origin production
```

Then create a new branch. The branch name should be:

- Start with the task ID (lowercase): `om-123`
- Followed by a short kebab-case descriptor of the task
- Example: `om-123-fix-modal-esc-handler`

```bash
git checkout -b <branch-name>
```

## 5. Implementation Plan

Create a medium-high level implementation plan covering:

- What needs to change (which files, components, systems)
- Why this approach (brief rationale)
- Key decisions or tradeoffs
- Rough sequence of steps

**Update the Linear task** with this plan BEFORE asking user if they want to proceed. Add as a comment if description is already long, or append to description.

## 6. Review with User

Present the plan and ask if they want to:

- Proceed with detailed planning and implementation
- Adjust the approach
- Pause here (task is set up, Linear is updated, branch exists)

If proceeding, work with the user to finalize the detailed implementation plan before writing any code.

---

## Checkpoints

Before proceeding past each phase, confirm:

- [ ] After Step 3: Linear description updated with clarified requirements
- [ ] After Step 5: Linear updated with implementation plan
- [ ] After Step 6: Ready for implementation
