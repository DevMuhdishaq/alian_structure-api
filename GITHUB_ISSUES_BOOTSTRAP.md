# GitHub Issues Bootstrap - Good First Issues

Copy these issues to your GitHub repository to start attracting contributors. These are great first tasks that help build repository activity.

---

## Issue #1: Add missing unit tests for auth.service.ts
**Labels:** good-first-issue, testing

### Description
The `auth.service.ts` in `src/core/auth/auth.service.ts` currently has only 45% test coverage. We need to add missing unit tests to bring coverage above 80%.

### Tasks
- Add tests for `register()` method edge cases
- Add tests for `login()` with invalid credentials
- Add tests for password reset flow
- Ensure all error cases are covered

### Skills Needed
- TypeScript
- Jest testing framework
- Basic understanding of NestJS

### Files to modify
- `src/core/auth/auth.service.spec.ts`

---

## Issue #2: Improve WebSocket error handling in dashboard gateway
**Labels:** good-first-issue, bug, websockets

### Description
The WebSocket dashboard gateway in `src/dashboard/websocket/dashboard.gateway.ts` has minimal error handling. When clients disconnect abruptly, errors are not properly caught and logged.

### Tasks
- Add try-catch blocks around all WebSocket event handlers
- Implement proper error logging with context
- Add reconnection logic for dropped connections
- Update connection manager to handle edge cases

### Skills Needed
- TypeScript
- Socket.io
- Basic error handling patterns

### Files to modify
- `src/dashboard/websocket/dashboard.gateway.ts`
- `src/dashboard/websocket/services/connection-manager.service.ts`

---

## Issue #3: Add input validation to all oracle endpoints
**Labels:** good-first-issue, security, validation

### Description
The oracle controller in `src/blockchain/oracle/oracle.controller.ts` is missing comprehensive input validation using class-validator. This could lead to invalid data being processed.

### Tasks
- Add proper validation decorators to all DTOs
- Add custom validators for Ethereum address formats
- Add validation for numerical ranges on payload data
- Test validation with invalid inputs

### Skills Needed
- TypeScript
- class-validator
- Basic understanding of DTO patterns

### Files to modify
- `src/blockchain/oracle/dto/*.dto.ts`
- `src/blockchain/oracle/oracle.controller.ts`

---

## Issue #4: Update README with better development examples
**Labels:** good-first-issue, documentation

### Description
The README.md file has basic setup instructions but lacks concrete examples of how to use the API. New contributors struggle to get started quickly.

### Tasks
- Add example API calls with curl
- Add example WebSocket connection code
- Create a "5-minute quick start" guide
- Add troubleshooting section for common issues

### Skills Needed
- Markdown
- Basic understanding of REST APIs
- Good written communication

### Files to modify
- `README.md`
- `docs/DEVELOPER_QUICKSTART.md` (create new)

---

## Issue #5: Add environment variable validation
**Labels]: good-first-issue, devops, configuration

### Description
The application currently doesn't validate that all required environment variables are present before starting. This leads to cryptic runtime errors.

### Tasks
- Extend `src/config/env.validation.ts` to validate all required env vars
- Add descriptive error messages for missing variables
- Add type checking for numerical values
- Test with missing/invalid environment variables

### Skills Needed
- TypeScript
- Environment configuration patterns
- Basic error handling

### Files to modify
- `src/config/env.validation.ts`

---

## Issue #6: Implement rate limiting for all API endpoints
**Labels:** security, enhancement

### Description
While we have basic rate limiting, some API endpoints still don't have proper rate limiting configured. This could expose the API to abuse.

### Tasks
- Audit all controllers for missing rate limiting decorators
- Set appropriate rate limits based on endpoint sensitivity
- Add custom rate limit responses
- Document rate limits in API documentation

### Skills Needed
- NestJS
- Rate limiting concepts
- API security

### Files to modify
- All controller files missing @RateLimit() decorator
- `src/common/guards/throttler.guard.ts`

---

## Issue #7: Add Docker Compose for local development
**Labels:** devops, good-first-issue

### Description
We have a Dockerfile but no docker-compose.yml for local development that includes all dependencies (PostgreSQL, Redis, etc.).

### Tasks
- Create docker-compose.yml for local development
- Include PostgreSQL, Redis, and the API service
- Add hot reloading support in Docker
- Document Docker development workflow

### Skills Needed
- Docker
- Docker Compose
- Basic devops

### Files to modify
- `docker-compose.dev.yml` (create new)
- Update Dockerfile for development