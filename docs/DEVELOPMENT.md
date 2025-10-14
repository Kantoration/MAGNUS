# AutoMessager - Development & Implementation History

**Version:** 1.0.0  
**Last Updated:** 2025-10-14

---

## 📋 Overview

This document consolidates all implementation summaries, technical deep-dives, and development history for AutoMessager v1.0.0.

---

## 🏗️ Architecture & Core Components

### Salesforce Integration (`src/sf.ts`)

- **Authentication:** OAuth 2.0 username-password flow via jsforce
- **Query Strategy:** SOQL with TYPEOF for polymorphic Contact/Lead resolution
- **Paging Support:** queryMore() for unlimited task volumes
- **Field Probing:** describeTaskFields() to avoid INVALID_FIELD errors
- **Graceful Degradation:** Works with or without custom fields

### Glassix Integration (`src/glassix.ts`)

- **Modern Auth:** Access token flow (3h TTL, proactive refresh)
- **Legacy Support:** Direct bearer token (backward compatible)
- **Retry Logic:** Exponential backoff with jitter for 429/5xx errors
- **Rate Limiting:** 250ms between calls (4 req/sec)
- **Idempotency:** Uses Task.Id as idempotency key

### Template System (`src/templates.ts`)

- **Excel Parsing:** XLSX library with Hebrew column support
- **Worker Offloading:** Files >1MB use worker threads (no blocking)
- **Header Aliasing:** Case-insensitive, multiple variations supported
- **Placeholder System:** `{{var}}` and `{var}` syntax with whitelist
- **Caching:** mtime-based reload only when file changes
- **Timeout Protection:** 30s limit with automatic worker termination

### Phone Normalization (`src/phone.ts`)

- **Format:** E.164 (+972XXXXXXXXX)
- **Country:** Israel only (+972 country code)
- **Validation:** libphonenumber-js + custom heuristics
- **Mobile Detection:** 05X pattern recognition
- **Landline Support:** Optional via PERMIT_LANDLINES flag
- **Security:** Defensive character stripping, unicode handling

### Orchestration (`src/run.ts`)

- **Concurrency:** 5 tasks in parallel
- **Error Handling:** Centralized error types with recovery
- **Audit Trail:** Bounded to 32KB with smart truncation
- **Telemetry:** Opt-in JSONL metrics logging
- **Graceful Shutdown:** SIGTERM/SIGINT handlers with 10s timeout

---

## 🔒 Security Implementation

### Anti-Enumeration

**Error Messages:**
- User-facing: Generic ("Unable to process task: contact information unavailable.")
- Admin logs: Detailed with masked PII
- No hints about data validity, phone format, or field sources

**Test Coverage:** 67 edge case tests (unicode, hidden chars, injection)

### PII Protection

- **Phone Masking:** `+9725******67` (shows first 4 + last 2 digits)
- **Log Redaction:** 20+ paths automatically masked
- **Support Bundles:** All secrets redacted (****XXXX format)
- **Anti-Enumeration:** Generic error messages prevent data inference

### Input Validation

- **Zod Schemas:** All environment variables validated at startup
- **Template Sanitization:** Placeholder whitelist prevents injection
- **Link Validation:** HTTP/HTTPS only (no javascript: or data:)
- **Unicode Handling:** Confusable characters stripped defensively
- **SQL/XSS Prevention:** All non-digit characters removed from phone input

---

## ⚡ Performance Optimization

### Worker Offloading (v1.0.0)

**Problem:** Large Excel files (>1MB) blocked event loop during parsing

**Solution:**
- Created `src/workers/xlsx_loader.ts` worker thread
- Files >1MB automatically offloaded
- 30s timeout protection with worker termination
- TemplateManager singleton for concurrency-safe caching

**Impact:**
- Small files (<1MB): 10-50ms (inline, unchanged)
- Large files (1-10MB): 100-1000ms (non-blocking vs blocking)
- Disk savings: 92% reduction via log rotation

### Resource Management

**Log Rotation:**
- Daily files: `automessager-YYYY-MM-DD.log`
- Auto-cleanup: 30-day retention
- Pattern matching: Only deletes matching files
- Non-blocking: Async cleanup at startup

**Caching:**
- Template map cached by mtime
- Salesforce field probing once per run
- Access token cached for 3h (refreshed 5min early)

---

## 🛠️ CLI Tools Implementation

### Interactive Wizard (`src/cli/wizard.ts`)

- **Dynamic Paths:** Uses `homedir()` on Windows (no hard-coding)
- **Validation:** Checks file existence, credential format
- **Safe Defaults:** Minimal configuration required
- **.env Generation:** Complete configuration file created

### Doctor Diagnostics (`src/cli/doctor.ts`)

- **Environment Check:** Validates all required variables
- **Excel Check:** Verifies file, headers, templates loaded
- **Salesforce Check:** Tests login, org connectivity
- **Glassix Check:** Validates auth (modern or legacy mode)
- **Prescriptive Actions:** Specific fix recommendations

### Excel Validation (`src/cli/mapping.ts`)

- **Strict Mode:** Validates all required columns
- **Mojibake Detection:** Checks for encoding issues
- **Placeholder Analysis:** Extracts and reports all variables
- **Empty Row Detection:** Reports skipped rows
- **Detailed Output:** Shows template names, sizes, issues

### Support Bundle (`src/cli/support.ts`)

- **Redacted Config:** Secrets masked (****XXXX)
- **Recent Logs:** Last 1000 lines included
- **Excel Manifest:** Template names only (no message bodies)
- **System Info:** Platform, Node version, package version
- **ZIP Output:** Safe to share with support

---

## 🧪 Testing Strategy

### Unit Tests (300+)

- Phone normalization (edge cases, unicode, injection)
- Template rendering (placeholders, sanitization)
- Configuration validation (Zod schemas)
- Error handling (custom error types)
- Date formatting (Hebrew/English, timezone)

### Integration Tests (100+)

- Salesforce login and queries
- Glassix authentication and sending
- Excel file loading and parsing
- End-to-end task processing
- Paging with large datasets

### Security Tests (147+)

- Secret redaction in logs
- PII masking in all outputs
- Template injection prevention
- Anti-enumeration validation
- Unicode and hidden character handling
- SQL/XSS injection attempts

### CLI Tests (40+)

- All commands (init, verify, doctor, etc.)
- Wizard flow and validation
- Support bundle generation
- Mapping validation
- Documentation link integrity

---

## 📦 Build & Deployment

### Binary Packaging

**Tool:** pkg (v5.8.1)

**Targets:**
- Windows: node20-win-x64
- macOS: node20-macos-x64

**Configuration:**
- Assets: `dist/**/*.js`, `dist/**/*.json`
- Entry: `dist/bin/automessager.js`
- Output: `build/bin/`

**Features:**
- Self-contained (no Node.js required)
- Loads .env from executable directory
- Detects binary mode via `process.pkg`

### Release Process

```bash
# 1. Build TypeScript
npm run build

# 2. Package binaries
npm run package:win
npm run package:mac

# 3. Validate release
npm run release:check

# 4. Create client kit
npm run release:clientkit

# 5. Tag release
git tag -a v1.0.0 -m "Production Release v1.0.0"
```

---

## 🔄 Change Log Summary

### v1.0.0 (2025-10-14)

**Major Features:**
- Complete client onboarding package
- Worker offloading for large files
- Anti-enumeration security hardening
- Daily log rotation with auto-cleanup
- Dynamic path defaults (no hard-coding)

**Security:**
- Generic error messages (anti-enumeration)
- 67 edge case tests (unicode, hidden chars, injection)
- PII masking throughout
- Secret redaction (20+ paths)

**Performance:**
- Worker threads for files >1MB
- TemplateManager singleton (concurrency-safe)
- 30s timeout protection
- Daily log rotation (92% disk savings)

**Tooling:**
- Excel validators (Windows + macOS)
- Smoke tests (automated validation)
- Desktop shortcut script (Windows)
- Release validation automation

**Documentation:**
- README-QUICKSTART.md (5-minute setup)
- TROUBLESHOOTING.md (top 10 issues)
- MACOS_SIGNING_NOTES.md (macOS security)
- FAQ section in README
- Complete API documentation

---

## 🏗️ Technical Decisions

### Why Worker Threads for XLSX?

**Problem:** Large Excel files (>1MB) blocked the event loop for seconds

**Alternatives Considered:**
1. Streaming parser (complex, limited library support)
2. Limit file size (not user-friendly)
3. Warn user (doesn't solve problem)

**Chosen:** Worker threads with timeout
- Non-blocking for large files
- Graceful fallback for small files
- Timeout prevents hangs
- Transparent to users

### Why Defensive Stripping for Phone Input?

**Problem:** Users copy-paste with extra formatting, unicode, etc.

**Alternatives Considered:**
1. Strict rejection (bad UX, blocks valid users)
2. Accept anything (security risk)
3. Whitelist characters (complex, fragile)

**Chosen:** Defensive stripping (`.replace(/\D/g, '')`)
- User-friendly (handles copy-paste)
- Secure (removes all injection vectors)
- Simple (one line of code)
- Validated (libphonenumber-js + isAllowedE164)

### Why Anti-Enumeration?

**Problem:** Error messages could reveal if phone numbers exist/are valid

**Risk:** Attackers enumerate database by probing with different inputs

**Solution:**
- Generic user errors ("contact information unavailable")
- Detailed admin logs (masked PII)
- No differentiation between missing/invalid/wrong format

**Impact:** Prevents information disclosure while preserving debuggability

---

## 📊 Performance Benchmarks

### XLSX Parsing

| File Size | Method | Time | Blocking |
|-----------|--------|------|----------|
| <1MB | Inline | 10-50ms | Yes (acceptable) |
| 1-10MB | Worker | 100-1000ms | No ✅ |
| >10MB | Worker + timeout | 30s max | No ✅ |

### Concurrency

- **Tasks processed:** 5 in parallel
- **Rate limit:** 250ms between Glassix calls
- **Throughput:** ~240 messages/minute (within API limits)

### Disk Usage

| Duration | Before (single file) | After (daily rotation) | Savings |
|----------|---------------------|------------------------|---------|
| 1 month | 30 MB | 30 MB | 0% |
| 3 months | 90 MB | 30 MB | 67% |
| 1 year | 365 MB | 30 MB | 92% |

---

## 🔗 Related Documentation

### External Resources

- [jsforce Documentation](https://jsforce.github.io/)
- [Glassix API Docs](https://api.glassix.com/docs)
- [libphonenumber-js](https://github.com/catamphetamine/libphonenumber-js)
- [Pino Logger](https://getpino.io/)
- [Zod Validation](https://zod.dev/)

### Internal Exports

- `docs/project_export.txt` - Complete source code export
- `logs/Project Source Code Export.txt` - Alternative export location

---

## 📝 Development Notes

### Directory Structure

```
src/
├── cli/          # CLI commands (init, verify, doctor, support, mapping)
├── workers/      # Worker threads (xlsx_loader)
├── utils/        # Utilities (date formatting)
├── verify/       # Verification harnesses
├── types/        # TypeScript type definitions
├── config.ts     # Environment configuration (Zod)
├── logger.ts     # Pino logger setup
├── sf.ts         # Salesforce API client
├── glassix.ts    # Glassix WhatsApp API client
├── templates.ts  # Excel template loader
├── phone.ts      # Phone normalization
├── run.ts        # Main orchestrator
└── ...

test/
├── *.spec.ts     # Unit tests
├── *.test.ts     # Integration tests
└── e2e/          # End-to-end tests

scripts/
├── windows/      # Windows automation scripts
├── macos/        # macOS/Linux scripts
├── package_client_kit.ts    # Client kit packager
└── release_check.ts          # Release validation

tools/
├── verify-mapping.{cmd,sh}   # Excel validators
└── smoke.{cmd,sh}            # Smoke tests
```

### Key Design Patterns

1. **Singleton Pattern:** TemplateManager for concurrency-safe caching
2. **Factory Pattern:** Config and logger creation
3. **Strategy Pattern:** Multiple authentication modes (modern vs legacy)
4. **Observer Pattern:** Metrics collection (Prometheus)
5. **Worker Pattern:** Offload CPU-intensive operations

---

## 🎯 Future Enhancements

### Potential Roadmap

1. **Multi-Country Support**
   - Expand beyond Israel (+972)
   - Country-specific phone patterns
   - Configurable country code

2. **Configurable Timeouts**
   - Via environment variables
   - Per-operation timeouts
   - Adaptive based on latency

3. **Worker Pool**
   - Reuse workers instead of creating new ones
   - Better performance for multiple large files
   - Resource pooling

4. **Metrics Dashboard**
   - Web UI for Prometheus metrics
   - Real-time monitoring
   - Historical trends

5. **Optional OS Keychain**
   - Store secrets in system keychain
   - No plaintext credentials
   - Platform-specific implementation

---

## 📚 Implementation History

### Phase 1: Core System (Early Development)

- Salesforce client with jsforce
- Glassix API integration
- Excel template loader
- Basic orchestration loop
- Phone normalization for Israel

### Phase 2: Resilience & Error Handling

- Centralized error types
- Retry logic with exponential backoff
- Field detection (graceful degradation)
- Bounded audit trail (32KB limit)
- Idempotency support

### Phase 3: CLI & User Experience

- Interactive setup wizard
- Doctor diagnostics
- Excel validation tool
- Support bundle generator
- Preflight guards

### Phase 4: Security Hardening

- Access token flow (modern auth)
- Secret redaction (20+ paths)
- Template sanitization
- Anti-enumeration
- PII masking

### Phase 5: Production Ready (v1.0.0)

- Client onboarding package
- Worker offloading (performance)
- Daily log rotation (operations)
- Dynamic path defaults
- Release automation

---

## 🔧 Configuration Management

### Environment Variables (17 total)

**Required (7):**
- SF_LOGIN_URL, SF_USERNAME, SF_PASSWORD, SF_TOKEN
- GLASSIX_BASE_URL, GLASSIX_API_KEY
- GLASSIX_API_SECRET (for modern auth)

**Optional (10):**
- GLASSIX_API_MODE, GLASSIX_TIMEOUT_MS
- TASKS_QUERY_LIMIT, TASK_CUSTOM_PHONE_FIELD
- XSLX_MAPPING_PATH, XSLX_SHEET
- KEEP_READY_ON_FAIL, PERMIT_LANDLINES
- LOG_LEVEL, RETRY_ATTEMPTS, RETRY_BASE_MS
- SAFE_MODE_STRICT, ALLOW_LEGACY_BEARER
- PAGED, METRICS_PATH

### Validation

- **Schema:** Zod-based validation at startup
- **Fail Fast:** Invalid config prevents startup
- **Clear Errors:** Specific guidance on what's wrong
- **Defaults:** Safe defaults for all optional values

---

## 📖 API Reference

### Main Entry Points

```typescript
// src/run.ts
export async function runOnce(): Promise<RunStats>

// src/templates.ts
export async function loadTemplateMap(path?: string): Promise<Map<...>>
export function pickTemplate(taskKey: string, map: Map<...>): NormalizedMapping | null
export function renderMessage(mapping, context, opts): { text, viaGlassixTemplate? }
export function extractPlaceholders(text: string): string[]

// src/sf.ts
export async function login(): Promise<Connection>
export async function fetchPendingTasks(conn): Promise<STask[]>
export async function* fetchPendingTasksPaged(conn): AsyncGenerator<STask[]>
export function deriveTaskKey(task): string
export function resolveTarget(task): TargetResolution

// src/phone.ts
export function normalizeE164(phone: string): string | null
export function isAllowedE164(e164: string): boolean
export function mask(e164: string): string
```

---

## 🧪 Testing Philosophy

### Test Pyramid

```
       /\
      /E2E\          ← End-to-end (few, slow, high value)
     /______\
    /        \
   /Integration\     ← API integration (moderate, medium speed)
  /__________  \
 /              \
/  Unit Tests    \   ← Unit tests (many, fast, focused)
/__________________\
```

**Distribution:**
- Unit: 300+ tests (60%)
- Integration: 100+ tests (25%)
- E2E: 50+ tests (15%)

### Testing Principles

1. **Isolation:** Mock external dependencies (SF, Glassix, filesystem)
2. **Determinism:** No random values, fixed timestamps in tests
3. **Coverage:** Focus on error paths and edge cases
4. **Security:** Test anti-enumeration, PII masking, injection prevention
5. **Performance:** Test timeout paths, worker offloading

---

## 📚 Documentation Philosophy

### For Clients (Non-Technical)

- **Quick Start:** 5-minute setup guide
- **Troubleshooting:** Top 10 issues with copy-paste solutions
- **Platform Specific:** macOS security guide
- **Visual:** ASCII art, example outputs
- **Plain Language:** No jargon, clear instructions

### For Developers (Technical)

- **Architecture:** Component design and interactions
- **API Reference:** Function signatures and usage
- **Testing:** Coverage and test categories
- **Security:** Threat model and mitigations
- **Performance:** Benchmarks and optimization

### For IT/Operations

- **Setup Guide:** Detailed configuration options
- **Scheduling:** Task Scheduler and cron integration
- **Logging:** Structure, rotation, retention
- **Metrics:** Optional telemetry and monitoring
- **Support:** Diagnostic tools and bundle creation

---

## 🎯 Known Limitations

### Geographic Scope

- **Israel only:** Phone numbers must be +972
- **Expansion:** `src/phone.ts` and `src/phone-countries.ts` designed for easy country addition

### Salesforce Fields

- **Optional fields:** System works without custom fields
- **Degradation:** Falls back to standard fields (Description, Status)
- **Warning:** Logs helpful messages when fields missing

### Excel Format

- **UTF-8 encoding:** Recommended for Hebrew text
- **XLSX only:** .xls not supported
- **Size limit:** Files >10MB may timeout (configurable)

---

## 🔗 Useful Links

### Internal

- [README](../README.md) - Main documentation
- [SETUP](../SETUP.md) - Detailed setup guide
- [TROUBLESHOOTING](../TROUBLESHOOTING.md) - Common issues
- [SECURITY_HARDENING](SECURITY_HARDENING.md) - Security features

### External

- [jsforce API](https://jsforce.github.io/)
- [Glassix API](https://api.glassix.com/)
- [Node.js Workers](https://nodejs.org/api/worker_threads.html)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

---

**AutoMessager v1.0.0**  
*Development documentation consolidated*  
*Ready for production deployment*

