# AutoMessager Security Hardening - Final Implementation

**Date:** 2025-10-14  
**Status:** ✅ **PRODUCTION-GRADE SECURITY**

---

## 🔒 Security Features Implemented

### 1. Secure Mode by Default (SAFE_MODE_STRICT)

**Feature:** Blocks legacy bearer mode unless explicitly allowed

**Configuration:**
```bash
# Default: Secure mode enabled
SAFE_MODE_STRICT=true  # Default

# Requires modern access token flow
GLASSIX_API_SECRET=your-secret  # Required

# OR explicitly opt-in to legacy mode
ALLOW_LEGACY_BEARER=true  # Not recommended
```

**Behavior:**
- ✅ **Default:** Requires `GLASSIX_API_SECRET` (modern mode)
- ✅ **Legacy:** Requires `ALLOW_LEGACY_BEARER=true` explicit opt-in
- ✅ **Startup:** Validates before any operations
- ✅ **Error:** Clear instructions with 3 options

**Error Message:**
```
Secure authentication required: GLASSIX_API_SECRET is missing.

AutoMessager requires modern access token flow in secure mode.

Options:
  1. Add GLASSIX_API_SECRET to .env (recommended)
     Run: automessager init

  2. Allow legacy bearer mode (not recommended)
     Add to .env: ALLOW_LEGACY_BEARER=true

  3. Disable strict mode (not recommended for production)
     Add to .env: SAFE_MODE_STRICT=false
```

---

### 2. Redacted Environment Snapshots

**Feature:** Safe diagnostics without exposing secrets

**Function:** `getRedactedEnvSnapshot()` in `src/config.ts`

**Masking Strategy:**
- Secrets show last 4 characters only: `****3456`
- Empty secrets show: `<not-set>`
- Short secrets show: `****`
- Non-secrets visible: URLs, usernames, settings

**Example:**
```json
{
  "SF_USERNAME": "user@example.com",
  "SF_PASSWORD": "****5678",
  "SF_TOKEN": "****1234",
  "GLASSIX_API_KEY": "****9012",
  "GLASSIX_API_SECRET": "****3456",
  "GLASSIX_BASE_URL": "https://api.glassix.com",
  "USE_ACCESS_TOKEN_FLOW": "true",
  "SAFE_MODE_STRICT": "true"
}
```

**Usage:**
- Support bundles use this automatically
- Doctor diagnostics use this
- Never exposes full secrets

---

### 3. Template Sanitization

**Feature:** Prevents template injection attacks

**Module:** `src/templates.sanitize.ts`

**Protections:**

#### **1. Placeholder Whitelist**
```typescript
PLACEHOLDER_WHITELIST = {
  'first_name', 'account_name', 'device_model', 'imei',
  'date_iso', 'date_he', 'date', 'link'
}
```

- ✅ Unknown placeholders rejected
- ✅ Prevents injection via custom fields
- ✅ Clear error messages

#### **2. Text Sanitization**
- ✅ Control characters removed (preserves newlines/tabs)
- ✅ Max length enforced (2000 chars)
- ✅ Hebrew and Unicode preserved
- ✅ Safe for all platforms

#### **3. Link Validation**
- ✅ HTTP/HTTPS only (no javascript:, data:)
- ✅ Max length 1024 chars
- ✅ Proper URL parsing
- ✅ Clear validation errors

**Example:**
```typescript
// ✅ Valid
sanitizeTemplateText('Hello {{first_name}}!');
sanitizeLink('https://example.com/order/123');

// ❌ Rejected
validatePlaceholders({ malicious_field: 'value' });
// Throws: "Unknown placeholders: malicious_field"

sanitizeLink('javascript:alert(1)');
// Throws: "Invalid link protocol: javascript:"
```

---

### 4. Anti-Enumeration Protection

**Feature:** Generic phone error messages prevent enumeration attacks

**Implementation:** `src/run.ts`

**Before:**
```
Error: "Missing/invalid phone (source: ContactMobile)"
```

**After:**
```
User-facing: "Message could not be sent to this recipient. Please verify the record's phone number."
Audit trail: "Missing/invalid phone (source: ContactMobile)" [logged with masked details]
```

**Benefits:**
- ✅ Prevents phone number enumeration
- ✅ Doesn't reveal data structure
- ✅ Detailed logs for admins
- ✅ Generic messages for users

---

### 5. Typed Error System

**Feature:** Structured errors with codes and hints

**Module:** `src/errors.ts` + `src/error-handler.ts`

**Error Classes:**
- `ConfigError` - Configuration issues
- `NetworkError` - Connection problems
- `UpstreamError` - API failures (SF/Glassix)
- `ValidationError` - Data validation
- `SanitizationError` - Unsafe content
- `PhoneError` - Phone number issues
- `TemplateError` - Template problems

**Benefits:**
- ✅ Structured error codes
- ✅ Human-readable messages
- ✅ Actionable hints
- ✅ Recommended remediation steps

**Example:**
```typescript
try {
  await sendMessage();
} catch (error) {
  if (error instanceof UpstreamError) {
    console.log(printHuman(error));
    // Output: [UPSTREAM_ERROR] Glassix authentication failed
    //         Hint: Check Glassix auth. Run: automessager doctor
    
    const actions = getRecommendedAction(error);
    // ['Run: automessager doctor', 'Check Glassix API key and secret', ...]
  }
}
```

---

### 6. Centralized Error Handling

**Feature:** Consistent, safe error messages

**Module:** `src/http-error.ts`

**Functions:**
1. **`buildSafeAxiosError()`** - Safe error messages
   - Truncates to 500 chars
   - Redacts auth headers
   - Redacts bearer tokens
   - Extracts meaningful info

2. **`isRetryableStatus()`** - Smart retry logic
   - Retryable: 429, 502, 503, 504
   - Non-retryable: 400, 401, 403, 404, 500

3. **`calculateBackoff()`** - Jittered backoff
   - Exponential: `base * 2^(attempt-1)`
   - Jitter: +random(0-100ms)
   - Configurable base

**Security Guarantees:**
- ✅ No raw tokens in errors
- ✅ No auth headers in errors
- ✅ Truncated to prevent log bloat
- ✅ Case-insensitive redaction

---

### 7. Enhanced Support Bundles

**Feature:** Privacy-preserving diagnostics

**Improvements:**
- ✅ Uses `getRedactedEnvSnapshot()` for env vars
- ✅ Excel manifest includes names only (no message bodies)
- ✅ File stats included (size, modified date)
- ✅ Sheet names included
- ✅ Privacy note in manifest

**Bundle Contents:**
```
support-bundle-20251014-1230.zip
├── README.txt                   # Bundle usage guide
├── environment.txt              # Redacted env (****XXXX)
├── diagnostics.json             # Doctor results
├── automessager.log             # Last 2MB of logs
├── run-YYYYMMDD.log             # Today's run (if exists)
├── template-manifest.json       # Names only, no bodies
└── package-metadata.json        # Version info
```

**Privacy Manifest:**
```json
{
  "sampleKeys": ["NEW_PHONE", "PAYMENT_REMINDER"],
  "count": 10,
  "sheetNames": ["Sheet1"],
  "fileStats": {
    "size": 12345,
    "modified": "2025-10-14T10:00:00.000Z"
  },
  "note": "Manifest includes template names only. Message bodies and customer data are excluded for privacy."
}
```

---

## 🧪 Test Coverage

### New Test Files (3)

1. **`test/templates.sanitize.spec.ts`** - 8 test suites
   - Text sanitization (control chars, length)
   - Placeholder validation
   - Link validation (protocols, length)
   - Placeholder extraction

2. **`test/errors.spec.ts`** - 4 test suites
   - Error class creation
   - `printHuman()` formatting
   - `getRecommendedAction()` logic
   - `mapAxiosToUpstream()` conversion

3. **`test/config.security.spec.ts`** - 2 test suites
   - SAFE_MODE_STRICT enforcement
   - Redacted env snapshot masking

**Plus:**
- `test/http-error.spec.ts` - Centralized error handling
- `test/glassix.auth.spec.ts` - Token flow and config

**Total New Tests:** 25+ tests ✅

---

## 📋 Configuration Reference

### Security Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `SAFE_MODE_STRICT` | `true` | Enforce modern auth (block legacy without opt-in) |
| `ALLOW_LEGACY_BEARER` | `false` | Allow legacy bearer mode (not recommended) |
| `GLASSIX_API_SECRET` | - | Required for modern mode |
| `GLASSIX_API_KEY` | - | Required for all modes |

### Retry & Timeout

| Variable | Default | Range | Description |
|----------|---------|-------|-------------|
| `RETRY_ATTEMPTS` | `3` | 1-10 | Max retry attempts |
| `RETRY_BASE_MS` | `300` | 100-5000 | Base backoff delay (ms) |
| `GLASSIX_TIMEOUT_MS` | `15000` | 1+ | Request timeout (ms) |

---

## 🛡️ Defense in Depth

```
Layer 1: Configuration Hardening
├─ SAFE_MODE_STRICT blocks insecure configs
├─ assertSecureAuth() validates at startup
└─ Clear error messages with remediation

Layer 2: Template Sanitization
├─ Placeholder whitelist enforcement
├─ Control character removal
├─ Link protocol validation
└─ Length limits (2000 chars, 1024 for links)

Layer 3: Error Handling
├─ Typed errors with codes
├─ buildSafeAxiosError() redacts auth
├─ printHuman() creates user-friendly messages
└─ Recommended actions for each error type

Layer 4: Anti-Enumeration
├─ Generic phone error messages
├─ Detailed audit trails (masked)
├─ No data structure leakage
└─ Privacy-preserving

Layer 5: Support Bundles
├─ Redacted env snapshots (****XXXX)
├─ Excel manifest only (no message bodies)
├─ Privacy notes included
└─ Safe to share externally
```

---

## ✅ Security Checklist

| Feature | Status | Tests | Docs |
|---------|--------|-------|------|
| Access token flow | ✅ | ✅ | ✅ |
| Token caching & refresh | ✅ | ✅ | ✅ |
| Comprehensive redaction | ✅ | ✅ | ✅ |
| SAFE_MODE_STRICT | ✅ | ✅ | ✅ |
| Redacted env snapshots | ✅ | ✅ | ✅ |
| Template sanitization | ✅ | ✅ | ✅ |
| Placeholder whitelist | ✅ | ✅ | ✅ |
| Link validation | ✅ | ✅ | ✅ |
| Anti-enumeration | ✅ | ✅ | ✅ |
| Typed errors | ✅ | ✅ | ✅ |
| Human-readable errors | ✅ | ✅ | ✅ |
| Safe error building | ✅ | ✅ | ✅ |
| Privacy-preserving bundles | ✅ | ✅ | ✅ |

**Overall: 13/13 ✅**

---

## 🚀 Deployment Guide

### Recommended Configuration

```bash
# Secure mode (default - recommended)
SAFE_MODE_STRICT=true
GLASSIX_API_KEY=your-api-key
GLASSIX_API_SECRET=your-api-secret

# Legacy mode (not recommended)
SAFE_MODE_STRICT=false
ALLOW_LEGACY_BEARER=true
GLASSIX_API_KEY=your-api-key
# No secret required
```

### Migration from Legacy

**Step 1:** Add secret to existing .env
```bash
# Add this line
GLASSIX_API_SECRET=your-api-secret
```

**Step 2:** Verify
```bash
automessager doctor
# Should show: "Mode: access_token_flow"
```

**Step 3:** Test
```bash
automessager dry-run
```

**Step 4:** Deploy
```bash
automessager run
```

---

## 📊 Summary

**Security Posture:** ✅ **ENTERPRISE-GRADE**

All requirements met:
- ✅ Modern auth enforced by default
- ✅ All secrets masked in diagnostics
- ✅ Template injection prevented
- ✅ Phone enumeration blocked
- ✅ Privacy-preserving support tools
- ✅ Comprehensive test coverage
- ✅ Production-ready

**Ready for security audit and enterprise deployment.** 🔒

---

*Security hardening by Principal DX Engineer*  
*AutoMessager v1.0.0*

