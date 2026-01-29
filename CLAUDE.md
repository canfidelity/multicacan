# Project Instructions for AI Agents

## Atomic Commits

After completing any task that modifies code, you MUST create atomic commits before ending the conversation. Do not ask for permission - just do it.

### Workflow

1. **Check for changes**: Run `git status` and `git diff` to see all modifications
2. **Skip if clean**: If there are no changes, skip the commit process
3. **Analyze changes**: Group changes by their logical purpose:
   - Feature additions
   - Bug fixes
   - Refactoring
   - Documentation
   - Tests
   - Configuration/dependencies
4. **Create atomic commits**: For each logical group, stage only the relevant files and create a separate commit

### Commit Process

For each logical group of changes:

```bash
# Stage specific files for this logical change
git add <file1> <file2>

# Commit with conventional commit message
git commit -m "<type>(<scope>): <description>"
```

### Commit Message Format

Use conventional commits:
- `feat`: New feature
- `fix`: Bug fix
- `refactor`: Code refactoring (no functional change)
- `docs`: Documentation changes
- `test`: Adding or updating tests
- `chore`: Build, config, dependencies

### Examples

If you modified:
- `src/api/user.ts` (added new endpoint)
- `src/api/user.test.ts` (tests for new endpoint)
- `src/utils/format.ts` (refactored helper)
- `README.md` (updated docs)

Create three commits:
1. `git add src/api/user.ts src/api/user.test.ts && git commit -m "feat(api): add user profile endpoint"`
2. `git add src/utils/format.ts && git commit -m "refactor(utils): simplify date formatting logic"`
3. `git add README.md && git commit -m "docs: update API documentation"`

### Rules

- Each commit should be independently meaningful and buildable
- Related test files should be committed with their implementation
- Never create empty commits
- Never combine unrelated changes in one commit
- Keep commit messages concise but descriptive
- If all changes are related to one logical unit, a single commit is fine
