# GitHub Copilot Cloud Agent - Integration Guide

## Overview

This guide explains how the GitHub Copilot cloud agent is integrated into the Agenda Aqui project.

## Configuration Files

The cloud agent setup consists of three main files:

1. **`cloud-agent.yml`** - Agent definition and capabilities
2. **`workspace.yml`** - Workspace routing and shared context
3. **`README.md`** - Documentation and usage examples

## How It Works

### 1. Agent Initialization

When GitHub Copilot is invoked in this repository, it:
1. Reads the workspace configuration from `.github/agents/workspace.yml`
2. Loads the cloud agent definition from `.github/agents/cloud-agent.yml`
3. Applies routing rules to determine when to use the cloud agent

### 2. Automatic Delegation

The cloud agent is automatically invoked for:

```yaml
# Use cases - complex business logic
src/domain/use-cases/**/*

# Database migrations - schema changes
supabase/migrations/**/*

# Tests - quality assurance
**/*.test.ts
**/*.spec.ts
```

### 3. Manual Invocation

You can explicitly request the cloud agent:

```bash
# In GitHub Copilot Chat
@cloud-agent review this code for clean architecture compliance

# For specific scopes
@cloud-agent implement a new use case for booking validation
@cloud-agent refactor this route to follow thin controller pattern
```

## Integration Points

### With GitHub Pull Requests

The cloud agent automatically:
- Reviews PRs when opened or updated
- Checks code against project conventions
- Validates architecture compliance
- Ensures quality gates pass

### With Development Workflow

```bash
# 1. Developer writes code
git add src/domain/use-cases/create-booking.ts

# 2. Agent automatically reviews changes
# - Checks conventions
# - Validates tests exist
# - Ensures TypeScript strict mode

# 3. Developer commits with confidence
git commit -m "feat(booking): add create booking use case"
```

### With CI/CD

The agent configuration defines quality gates:
```yaml
quality_gates:
  - build: required      # npm run build
  - lint: required       # npm run lint
  - type-check: required # npm run type-check
  - tests: required      # npm run test
```

## Project-Specific Rules

The cloud agent understands and enforces:

### Architecture
- **Routes**: Thin controllers only
- **Use Cases**: Pure, testable business logic
- **Adapters**: Port implementations, no business logic
- **Services**: SSR/BFF composition with React cache

### Data Formats
- **Money**: Centavos (number) in domain, `formatPrice()` in UI
- **Dates**: UTC in backend/database, local timezone in UI
  - **ALWAYS** consult `docs/DATE-HANDLING-GUIDE.md` before manipulating dates
  - Use ONLY functions from `@/shared/utils/date-utils`
  - NEVER create Date directly or concatenate date strings
- **Phone**: Format with mask `(XX) XXXXX-XXXX`

### Code Style
- **CSS**: Tailwind only, no custom CSS files
- **Theme**: **Light mode PRIORITÁRIO** - NEVER use `dark:` as default, only as optional fallback
- **TypeScript**: Strict mode, no `any` types
- **Naming**: Descriptive, no single-letter variables

## Verification

### 1. Check Agent is Loaded

```bash
# The agent should appear in GitHub Copilot's agent list
# when working in this repository
```

### 2. Test Auto-Delegation

Create a use case file and the agent should automatically:
- Suggest creating a test file
- Validate naming conventions
- Check for proper error handling

### 3. Test Manual Invocation

```bash
# In GitHub Copilot Chat
@cloud-agent what are the conventions for this project?
```

## Monitoring

The workspace is configured to track:
- Number of agent invocations
- Response times
- Quality metrics
- Delegation patterns

## Troubleshooting

### Agent Not Responding

1. **Check File Location**
   ```bash
   ls .github/agents/
   # Should show: cloud-agent.yml, workspace.yml, README.md
   ```

2. **Validate YAML Syntax**
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('.github/agents/cloud-agent.yml'))"
   python3 -c "import yaml; yaml.safe_load(open('.github/agents/workspace.yml'))"
   ```

3. **Check GitHub Copilot Settings**
   - Ensure GitHub Copilot is enabled for the repository
   - Verify you have access to GitHub Copilot agents

### Agent Provides Wrong Guidance

1. **Update Instructions**
   - Edit `.github/agents/cloud-agent.yml`
   - Update the `instructions` section
   - Commit and push changes

2. **Adjust Routing Rules**
   - Edit `.github/agents/workspace.yml`
   - Modify the `routing` section
   - Commit and push changes

## Updates and Maintenance

### Updating Agent Instructions

1. Edit `.github/agents/cloud-agent.yml`
2. Update the `instructions` section with new rules
3. Increment the `version` field
4. Commit and push

### Updating Routing Rules

1. Edit `.github/agents/workspace.yml`
2. Modify the `routing` section
3. Commit and push

### Adding New Capabilities

1. Edit `.github/agents/cloud-agent.yml`
2. Add to the `capabilities` list
3. Update `scopes` if needed
4. Document in `README.md`
5. Commit and push

## Best Practices

1. **Keep Instructions Concise**
   - Focus on key conventions
   - Link to detailed docs when needed

2. **Test Changes**
   - Verify YAML syntax
   - Test with real code examples
   - Check quality gates still pass

3. **Document Updates**
   - Update README.md
   - Note version changes
   - Document new capabilities

4. **Monitor Performance**
   - Track response times
   - Review delegation patterns
   - Optimize routing rules

## Examples

### Example 1: Create Use Case

```typescript
// Developer creates: src/domain/use-cases/list-bookings.ts
// Agent suggests:
// 1. Create test file: list-bookings.test.ts
// 2. Define input/output types
// 3. Add error handling
// 4. Document in list-bookings.md
```

### Example 2: Database Migration

```sql
-- Developer creates: supabase/migrations/20251120_add_bookings.sql
-- Agent suggests:
-- 1. Create rollback: supabase/rollback/20251120_rollback_add_bookings.sql
-- 2. Update schema.md
-- 3. Document in CHANGELOG.md
-- 4. Test locally first
```

### Example 3: Route Refactoring

```typescript
// Developer creates fat controller
// Agent suggests:
// 1. Extract business logic to use case
// 2. Keep route thin (validation + call)
// 3. Add proper error handling
// 4. Apply cache headers
```

## Support

For questions or issues:
1. Review this integration guide
2. Check `.github/agents/README.md`
3. Consult `.github/copilot-instructions.md`
4. Check GitHub Copilot documentation

## Version History

- **v1.0.0** (2025-11-20)
  - Initial cloud agent setup
  - Basic capabilities and routing
  - Project-specific conventions
