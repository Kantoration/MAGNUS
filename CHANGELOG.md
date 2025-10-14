# Changelog

## [Unreleased] - 2025-10-14

### Security
- **Token scrubbing**: Enhanced credential redaction in all error paths
  - Paranoid scrubbing in `getAccessToken()` with multiple regex passes
  - All axios catches use `buildSafeAxiosError()` to prevent token leakage
  - Phone numbers always masked in logs using `mask()` wrapper
- **Stricter schemas**: Tightened Glassix response validation
  - `AccessTokenResponseSchema`: Non-empty accessToken required
  - `SendResponseSchema`: Valid URL format enforced for conversationUrl
  - Typed `GlassixValidationError` with Zod error details
- **Anti-enumeration consistency**: Generic user-facing error messages
  - All task processing errors return: "Unable to process task: contact information unavailable."
  - Detailed diagnostics preserved in logs and Salesforce audit trail
- **Phone validation modes**: Configurable STRICT/LENIENT validation
  - STRICT mode (default): Rejects hidden chars, format chars (ZWSP), control characters, unicode confusables, injection patterns
  - LENIENT mode: Sanitizes inputs for legacy system compatibility
  - Configure via `PHONE_STRICT_VALIDATION` env var

### Resilience
- **Shared backoff calculation**: Centralized exponential backoff with jitter
  - `calculateBackoff()` exported from `http-error.ts`
  - Used consistently in Glassix retry logic and SF updater
  - Prevents thundering herd with 0-100ms random jitter
- **Non-fatal SF updater**: Task update failures never crash batch processing
  - `markCompleted()` and `markFailed()` wrap all errors
  - Logs warnings on failure, continues processing remaining tasks
  - Message delivery is primary; SF updates are secondary
- **Per-task error isolation**: Batch continues even when individual tasks fail
  - Comprehensive try/catch in pMap task processing
  - Failed tasks logged and marked, don't block other tasks

### Performance & Operability
- **Rate-limit telemetry**: Track Glassix API rate limits
  - Reads `x-ratelimit-remaining` and `x-ratelimit-reset` headers
  - Warns when approaching limit (< 10 requests remaining)
  - Prometheus gauge `glassix_ratelimit_remaining`
- **Metrics guarded**: All metrics operations are non-fatal
  - `updateRunStats()` wrapped in try/catch with METRICS_ENABLED check
  - `writeMetrics()` fails gracefully, never crashes runs
  - Metrics server startup/shutdown failures logged as warnings

### Developer Experience
- **CLI quick reference**: Added command table to README
  - 8 common commands with descriptions
  - Located in "Quickstart" section for easy discovery
- **Metrics documentation**: Complete Prometheus setup guide
  - Added to SETUP.md with .env examples
  - `METRICS_ENABLED` and `METRICS_PORT` documented in variables table
- **Enhanced JSDoc**: Comprehensive documentation throughout
  - `extractPlaceholders()`: Security notes and deduplication strategy
  - `truncateAuditTrail()`: Audit policy, MAX_DESC enforcement, masking
  - `SalesforceTaskUpdater`: Non-fatal guarantees and retry strategy
  - Phone validation: STRICT vs LENIENT mode explanations

### Refactoring
- **Template validation**: Fixed placeholder extraction
  - Returns deduplicated array (was returning Set)
  - Strict regex: only \w characters allowed in variable names
  - Prevents validation bypass via duplicate placeholders
- **Header construction**: Corrected async spread in Glassix
  - `const headers = { ...(await authHeader()), ... }`
  - Proper modern access-token flow with legacy fallback
- **Config enhancements**: New phone validation settings
  - `PHONE_STRICT_VALIDATION`: boolean (default: true)
  - `DEFAULT_REGION`: enum 'IL' | 'US' (default: 'IL')

### Testing
- **Test alignment**: Updated expectations for refactored behavior
  - Generic error messages in orchestrator tests
  - STRICT validation mode in phone edge-case tests
  - AsyncGenerator mock for paged mode tests
  - GlassixValidationError preservation in contract tests
  - Removed UTF-8 BOM from binary XLSX test files

---

## Previous Releases

See git tags for release history.

