# GitHub Copilot Agents Configuration

This directory contains GitHub Copilot custom agent configurations for the Agenda Aqui project.

## Overview

The cloud agent is configured to assist with development tasks following the project's clean architecture and coding conventions.

## Files

- **`cloud-agent.yml`**: Main cloud agent configuration
- **`workspace.yml`**: Workspace-level settings and routing configuration
- **`README.md`**: This documentation file

## Cloud Agent

The cloud agent is specialized for the Agenda Aqui project and understands:

### Architecture
- Clean Architecture principles (use cases, ports, adapters)
- Next.js 14+ App Router patterns
- Multi-tenant SaaS architecture

### Stack Knowledge
- **Frontend**: Next.js, React, TypeScript
- **Backend**: Next.js API Routes, Supabase
- **Database**: PostgreSQL (via Supabase)
- **Styling**: Tailwind CSS
- **Testing**: Jest, Testing Library

### Capabilities

1. **Code Review**
   - Reviews PRs against project conventions
   - Checks adherence to clean architecture
   - Validates TypeScript strict mode compliance

2. **Code Generation**
   - Generates use cases with tests
   - Creates adapters following port interfaces
   - Scaffolds routes following thin controller pattern

3. **Testing**
   - Creates unit tests for use cases
   - Ensures test coverage for business logic
   - Validates test quality and clarity

4. **Documentation**
   - Updates technical documentation
   - Maintains schema.md for database changes
   - Documents use cases and complex features

5. **Refactoring**
   - Improves code quality
   - Extracts complex logic to use cases
   - Maintains backward compatibility

## Usage

The cloud agent is automatically invoked based on routing rules defined in `workspace.yml`:

### Automatic Delegation

The agent is automatically used for:
- Changes to `src/domain/use-cases/**`
- Database migrations in `supabase/migrations/**`
- Test files (`*.test.ts`, `*.spec.ts`)
- Complex architecture changes

### Manual Invocation

You can explicitly request the cloud agent in GitHub Copilot by:
1. Mentioning `@cloud-agent` in your prompt
2. Using scopes: `@cloud-agent review`, `@cloud-agent implement`

## Conventions Enforced

The cloud agent enforces these project conventions:

### Data Formats
- **Money**: Always centavos (number) in domain, `formatPrice()` in UI
- **Dates**: UTC in backend/database, local timezone in UI
  - **CRITICAL**: Always consult `docs/DATE-HANDLING-GUIDE.md` before manipulating dates
  - Use ONLY functions from `@/shared/utils/date-utils`
- **Phone**: Always formatted with mask `(XX) XXXXX-XXXX`

### Code Style
- **CSS**: Tailwind CSS only, no custom CSS files
- **Theme**: **Light mode PRIORITÁRIO** - NEVER use `dark:` as default, only as optional fallback
- **TypeScript**: Strict mode, no `any` types
- **Naming**: Descriptive names, no single-letter variables
- **Functions**: Small, focused, clear parameters

### Architecture Layers
- **Routes**: Thin controllers (validation + use case call)
- **Use Cases**: Pure business logic, testable
- **Services**: SSR/BFF composition with React cache
- **Adapters**: Implement ports, no business logic
- **Shared**: DTOs, validators, utilities

## Quality Gates

The agent validates:
- ✅ Build passes (`npm run build`)
- ✅ Lint passes (`npm run lint`)
- ✅ Type check passes (`npm run type-check`)
- ✅ Tests pass (`npm run test`)

## Configuration Updates

To modify the cloud agent:

1. Edit `cloud-agent.yml` for agent-specific settings
2. Edit `workspace.yml` for workspace-wide configuration
3. Commit changes to apply new configuration

## Examples

### Code Review Request
```
@cloud-agent review this PR for clean architecture compliance
```

### Implementation Request
```
@cloud-agent implement a use case for listing available time slots
```

### Refactoring Request
```
@cloud-agent refactor this route to extract business logic to a use case
```

## Monitoring

The workspace is configured to track:
- Agent delegation frequency
- Response times
- Quality metrics

See `workspace.yml` for monitoring configuration.

## Support

For issues or questions about the agent configuration:
1. Review `.github/copilot-instructions.md` for project conventions
2. Check `cloud-agent.yml` for agent capabilities
3. Consult GitHub Copilot documentation for agent features

## Version

- Cloud Agent: v1.0.0
- Workspace Configuration: v1.0.0
- Last Updated: 2025-11-20
