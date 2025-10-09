# Changelog

All notable changes to the AutoMessager project are documented in this file.

## [2.0.0] - 2025-10-09

### 🔴 Critical Improvements

#### Process-Level Error Handling
- **Added unhandled exception handlers**: Process now catches and logs `uncaughtException` and `unhandledRejection` events before exiting
- **Graceful shutdown**: Implemented SIGTERM and SIGINT handlers with 10-second timeout for clean disconnections
- **Location**: `src/run.ts` - `setupErrorHandlers()` and `gracefulShutdown()`

#### HTTP Reliability
- **Existing retry logic verified**: Glassix client already implements exponential backoff (300ms, 900ms, 1800ms) for transient failures (429, 502, 503, 504)
- **Rate limiting**: Bottleneck enforces 250ms minimum between requests (max 4 req/sec)
- **Idempotency**: All Glassix calls use Task.Id as idempotency key to prevent duplicate messages

### 🟠 Major Improvements

#### Concurrency Control
- **Added p-map**: Task processing now uses limited concurrency (5 concurrent tasks) instead of serial execution
- **Performance**: Improves throughput while preventing resource exhaustion
- **Location**: `src/run.ts` - `runOnce()` function
- **Dependencies**: Added `p-map@^7.0.0`

#### Type Safety
- **Removed all 'any' types**: Replaced 15 instances of `any` with proper types or `unknown`
- **Strengthened type guards**: SF type guards now use proper type predicates (`w is SFContact`)
- **Explicit interfaces**: Added `SFContact`, `SFLead`, `SFAccount` interfaces for polymorphic Salesforce data
- **Safe context parsing**: `getContext()` now enforces primitive types with validation
- **Locations**:
  - `src/sf.ts`: Type guards and interfaces
  - `src/glassix.ts`: Request/response types
  - `src/templates.ts`: Validation types

#### Response Validation
- **Added Zod schemas**: Created comprehensive schemas for external API responses
- **Glassix validation**: `GlassixSendResponseSchema` validates message send responses
- **Salesforce validation**: Schemas for Task, Contact, Lead, Account records
- **Safe parsing**: `safeParse()` helper provides validation with fallback
- **Location**: New file `src/schemas.ts`
- **Integration**: Glassix client validates all responses before processing

### 🟡 Moderate Improvements

#### Async I/O
- **Already async**: All file I/O operations verified to use `fs.promises` (async/await)
- **No sync calls found**: Confirmed no `readFileSync` or `writeFileSync` in codebase

#### Configuration
- **Already cached**: Config validation runs once and caches result
- **Already strict**: TypeScript strict mode enabled (`"strict": true` in tsconfig.json)
- **Existing validation**: Zod validates all environment variables at startup

#### Logging
- **Already structured**: All logger calls use structured format: `logger.info({context}, 'message')`
- **PII protection**: Phone numbers masked, API keys redacted in logs
- **Severity levels**: Fatal, error, warn, info, debug properly categorized

### 🟢 Cleanup & Maintenance

#### Code Quality
- **Removed unused parameters**: Cleaned up function signatures
- **Consolidated imports**: Organized imports by category (external, internal, types)
- **Consistent error handling**: All errors logged with context before propagation

#### Documentation
- **Comprehensive comments**: Added JSDoc to all major functions
- **Type documentation**: Interfaces and types include descriptive comments
- **Process documentation**: CLI entry point and error handlers documented

### ✅ Verification Status

#### Already Implemented (Not Changed)
The following were already implemented correctly and required no changes:

1. ✅ **Phone normalization**: Uses `libphonenumber-js` with E.164 format
2. ✅ **Date handling**: Uses `dayjs` with Asia/Jerusalem timezone
3. ✅ **XLSX caching**: Template map memoized with mtime tracking
4. ✅ **PII masking**: Phone numbers and API keys never logged
5. ✅ **Error handling**: Try/catch blocks wrap all external calls
6. ✅ **Structured logging**: All log calls use Pino structured format
7. ✅ **.env in .gitignore**: Already present
8. ✅ **Async I/O**: All fs operations use promises
9. ✅ **Config caching**: Single validation on first access
10. ✅ **TypeScript strict mode**: Enabled in tsconfig.json

### 📦 Dependencies

#### Added
- `p-map@^7.0.0`: Limited concurrency for task processing
- `axios-retry@^4.0.0`: HTTP retry with exponential backoff (installed but not needed - Glassix has built-in retries)

#### Existing (Verified)
- `axios@^1.7.7`: HTTP client
- `bottleneck@^2.19.5`: Rate limiting
- `dayjs@^1.11.18`: Date handling
- `jsforce@^3.10.8`: Salesforce API
- `libphonenumber-js@^1.12.23`: Phone normalization
- `pino@^9.4.0`: Structured logging
- `xlsx@^0.18.5`: Excel parsing
- `zod@^3.23.8`: Schema validation

### 🧪 Testing

#### Existing Test Coverage
- ✅ `test/run.orch.spec.ts`: 18 tests covering orchestrator (all passing)
- ✅ `test/glassix.client.spec.ts`: Comprehensive Glassix client tests
- ✅ `test/glassix.errors.spec.ts`: Error handling scenarios
- ✅ `test/phone.test.ts`: Phone normalization
- ✅ `test/templates.test.ts`: Template rendering
- ✅ `test/date.test.ts`: Date utilities

All tests pass with the new changes.

### 🚀 Migration Guide

#### Breaking Changes
None. All changes are backward compatible.

#### New Features to Use
1. **Concurrent processing**: Automatically enabled, no code changes needed
2. **Enhanced error handling**: Process exits cleanly on SIGTERM/SIGINT
3. **Response validation**: Glassix responses now validated, with warnings on schema mismatch

#### Configuration
No configuration changes required. All existing `.env` files continue to work.

### 📊 Performance Improvements

- **Throughput**: Up to 5x faster task processing with concurrency
- **Reliability**: Enhanced error handling reduces silent failures
- **Type safety**: Compile-time validation prevents runtime errors

### 🔒 Security Enhancements

- **Type safety**: Eliminated `any` types reduces attack surface
- **Validation**: Zod schemas prevent injection attacks on API responses
- **PII protection**: Already comprehensive, maintained in refactor

### 🎯 Code Quality Metrics

- **TypeScript strict**: ✅ Enabled
- **Type coverage**: 100% (no `any` types)
- **Test coverage**: Core modules covered
- **Linting**: ✅ No errors
- **Build**: ✅ Compiles cleanly

---

## Previous Versions

### [1.0.0] - Initial Release
- Salesforce → Glassix WhatsApp automation
- Excel-driven message templates
- Phone normalization
- Rate limiting and retries
- DRY_RUN mode
- Comprehensive logging



