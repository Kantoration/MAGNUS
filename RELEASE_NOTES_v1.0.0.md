# AutoMessager v1.0.0 - Release Notes

**Release Date:** 2025-10-14  
**Status:** Production Ready  
**Build:** Stable

---

## 🎉 Overview

AutoMessager v1.0.0 is the **first production release** of the automated WhatsApp messaging system for Salesforce. This release includes comprehensive security, resilience, and user experience features.

---

## ✨ Key Features

### Core Functionality
- ✅ Salesforce task fetching with polymorphic queries (Contact/Lead/Account)
- ✅ Glassix WhatsApp messaging integration
- ✅ Excel-based template management with Hebrew support
- ✅ Phone number normalization (E.164 format, Israel)
- ✅ Message personalization with variable substitution
- ✅ Concurrent processing (5 tasks in parallel)
- ✅ Paging support for unlimited task volumes

### Security Features
- ✅ **Modern Access Token Flow** - Short-lived tokens (3h TTL) with automatic refresh
- ✅ **SAFE_MODE_STRICT** - Enforces secure authentication by default
- ✅ **Comprehensive Redaction** - 20+ paths protect secrets in all logs
- ✅ **Template Sanitization** - Prevents injection via placeholder whitelist
- ✅ **Anti-Enumeration** - Generic error messages prevent data leakage
- ✅ **Privacy-Preserving Tools** - Support bundles with redacted diagnostics

### Resilience & Error Handling
- ✅ **Centralized Error System** - Typed errors with actionable hints
- ✅ **Configurable Retries** - RETRY_ATTEMPTS (1-10) with exponential backoff + jitter
- ✅ **Smart Retry Logic** - Retries only on 429/5xx, not 400/401/403
- ✅ **Timeout Configuration** - GLASSIX_TIMEOUT_MS honored everywhere
- ✅ **Rate Limiting** - 4 requests/second with debug logging
- ✅ **Idempotency** - Safe re-runs using Task.Id as key

### CLI Tools
- ✅ **Interactive Setup** - `automessager init` wizard
- ✅ **Quick Verification** - `automessager verify` health checks
- ✅ **Deep Diagnostics** - `automessager doctor` with prescriptive actions
- ✅ **Excel Validation** - `automessager verify:mapping` strict validation
- ✅ **Support Bundles** - `automessager support-bundle` creates redacted ZIP
- ✅ **Preview Mode** - `automessager dry-run` without sending
- ✅ **Preflight Guards** - Automatic verification before execution
- ✅ **Bypass Option** - `--no-guard` flag for advanced users

### Automation & Deployment
- ✅ **Windows Task Scheduler** - PowerShell scripts for daily automation
- ✅ **macOS/Linux Cron** - Bash launcher script
- ✅ **Smoke Test Suite** - Automated validation (both platforms)
- ✅ **Single-File Binaries** - No Node.js required on client machines
- ✅ **Daily Log Rotation** - Timestamped logs per run
- ✅ **Dual Logging** - Console (pretty) + file (JSON)

---

## 🖥️ Supported Platforms

| Platform | Architecture | Binary | Status |
|----------|-------------|--------|--------|
| **Windows 10/11** | x64 | `automessager-win.exe` | ✅ Tested |
| **macOS 10.15+** | x64 | `automessager-mac` | ✅ Tested |
| **Linux Ubuntu 20.04+** | x64 | `automessager-mac` | ✅ Compatible |

**Requirements:**
- Binary mode: No dependencies (self-contained)
- Source mode: Node.js 20+
- Network access to Salesforce and Glassix APIs
- Excel file (`.xlsx` format)

---

## 📋 Configuration

### Required Environment Variables

```bash
# Salesforce
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-username@example.com
SF_PASSWORD=your-password
SF_TOKEN=your-security-token

# Glassix (Modern Mode - Recommended)
GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-api-key
GLASSIX_API_SECRET=your-api-secret  # Required for secure mode

# Excel Mapping
XSLX_MAPPING_PATH=./massege_maping.xlsx
```

### Optional Security Settings

```bash
# Security (defaults shown)
SAFE_MODE_STRICT=true           # Enforce modern auth
ALLOW_LEGACY_BEARER=false       # Allow legacy mode (not recommended)
```

### Optional Performance Settings

```bash
# Retry & Timeout (defaults shown)
RETRY_ATTEMPTS=3                # Max retry attempts (1-10)
RETRY_BASE_MS=300               # Base backoff delay (100-5000ms)
GLASSIX_TIMEOUT_MS=15000        # Request timeout (milliseconds)

# Query & Processing
TASKS_QUERY_LIMIT=200           # Max tasks per query
KEEP_READY_ON_FAIL=true         # Retry failed tasks
PERMIT_LANDLINES=false          # Allow non-mobile numbers
```

---

## 🔒 Security Highlights

### Secure by Default
- **SAFE_MODE_STRICT enabled** - Requires modern access token flow
- **Legacy bearer blocked** - Must explicitly opt-in with `ALLOW_LEGACY_BEARER=true`
- **Short-lived tokens** - 3-hour TTL with proactive refresh (5 min early)
- **No secrets in requests** - API key/secret used only for token exchange

### Comprehensive Protection
- **20+ redaction paths** - All secrets masked in logs
- **Template injection prevention** - Placeholder whitelist enforcement
- **Link validation** - HTTP/HTTPS only, no javascript: or data: URLs
- **Anti-enumeration** - Generic error messages prevent data leakage
- **PII masking** - Phone numbers shown as +9725******67

### Privacy-Preserving Diagnostics
- **Support bundles** - Secrets redacted (****XXXX)
- **Excel manifests** - Template names only, no message bodies
- **Env snapshots** - Last 4 chars visible for verification

---

## ⚠️ Known Limitations

### Geographic Scope
- **Israel only** - Phone numbers must be +972 (Israeli format)
- Future: Extensible country logic in `src/phone.ts` for easy expansion

### Glassix API Support
- **Messages mode** - Standard API (default)
- **Protocols mode** - Advanced API (configurable)

### Salesforce Fields
- **Optional custom fields** - System works without them, enhanced functionality with them
- **Required fields**: Task (standard), Contact/Lead (standard)
- **Optional fields**: Delivery_Status__c, Last_Sent_At__c, Glassix_Conversation_URL__c, etc.

### Excel Format
- **UTF-8 encoding** - Recommended for Hebrew text
- **Required columns**: name, מלל הודעה, Link, שם הודעה מובנית בגלאסיקס
- **Header aliases** - Case-insensitive, multiple formats supported

---

## 🔄 Upgrade Notes

### From Pre-1.0 Versions

**Breaking Changes:**
1. **Secure mode now default** - Add `GLASSIX_API_SECRET` or set `ALLOW_LEGACY_BEARER=true`
2. **PAGED removed** - Paging is now automatic (no config needed)

**Migration Steps:**
```bash
# 1. Add API secret (recommended)
automessager init
# Wizard will prompt for GLASSIX_API_SECRET

# OR allow legacy mode (not recommended)
echo "ALLOW_LEGACY_BEARER=true" >> .env

# 2. Verify configuration
automessager doctor

# 3. Test
automessager dry-run

# 4. Deploy
automessager run
```

### New Environment Variables
- `SAFE_MODE_STRICT` (default: true)
- `ALLOW_LEGACY_BEARER` (default: false)
- `GLASSIX_API_SECRET` (required for modern mode)
- `GLASSIX_TIMEOUT_MS` (default: 15000)

---

## 📚 Documentation

### User Guides
- `README.md` - Complete system documentation
- `SETUP.md` - Step-by-step setup guide
- `WORKSPACE_ORGANIZATION.md` - Project structure

### Developer Resources
- `docs/implementation/` - Implementation summaries
- `docs/SECURITY_HARDENING.md` - Security features guide
- `docs/project_export.txt` - Complete code export (15,330 lines)

### Commands Reference
```bash
automessager --help             # List all commands
automessager init              # Interactive setup
automessager doctor            # Deep diagnostics
automessager verify            # Quick health check
automessager verify:mapping    # Excel validation
automessager support-bundle    # Create support ZIP
automessager dry-run           # Preview mode
automessager run               # Live execution
automessager version           # Version info
```

---

## 🐛 Bug Fixes & Improvements

### From Beta/Preview
- Fixed: Excel header aliasing now case-insensitive
- Fixed: Token refresh happens 5 min early (prevents expiration)
- Fixed: Retry logic excludes 400/401/403 (non-retryable)
- Fixed: Timeout configuration honored in all API calls
- Improved: Error messages are human-readable with hints
- Improved: Support bundles exclude message bodies (privacy)
- Improved: Preflight checks prevent bad runs

---

## 🧪 Testing

**Test Coverage:**
- 50+ unit tests
- Integration tests for Salesforce and Glassix
- Security tests (redaction, auth, sanitization)
- CLI tests (all commands)
- Smoke test suite (automated validation)

**Quality Metrics:**
- ✅ Zero TypeScript errors
- ✅ Zero linter warnings
- ✅ 100% build success rate
- ✅ Strict mode enabled

---

## 🚀 Getting Started

### Quick Start (5 Minutes)

```bash
# 1. Setup
automessager init

# 2. Diagnose
automessager doctor

# 3. Verify
automessager verify

# 4. Test
automessager dry-run

# 5. Run
automessager run
```

### Schedule Daily Runs

**Windows:**
```powershell
.\scripts\windows\Install-Task.ps1 -Hour 9 -Minute 0
```

**macOS/Linux:**
```bash
crontab -e
# Add: 0 9 * * * /path/to/AutoMessager/scripts/macos/start.sh
```

---

## 📞 Support & Troubleshooting

### Self-Diagnosis
```bash
automessager doctor            # Deep diagnostics
automessager verify:mapping    # Excel issues
automessager support-bundle    # Create support ZIP
```

### Common Issues
- **Secure auth error** → Add `GLASSIX_API_SECRET` or enable `ALLOW_LEGACY_BEARER`
- **Excel not found** → Check path, use forward slashes on Windows
- **Salesforce login fails** → Verify credentials, check login URL
- **Glassix auth fails** → Verify both key and secret are set
- **No templates loaded** → Run `verify:mapping` for details

---

## 🎯 What's Next

### Planned for v1.1
- Multi-country support (expand beyond Israel)
- Optional OS keychain integration for secrets
- Adaptive timeout based on latency
- Metrics output (JSONL format)
- OpenTelemetry hooks (opt-in)

### Feedback Welcome
- Report issues or suggestions
- Security concerns: High priority
- Feature requests: Evaluated for future releases

---

## 📄 License

MIT License - See LICENSE file for details

---

## 🙏 Credits

**Developed by:** Principal DX Engineer  
**Architecture:** Modern TypeScript, Node.js 20+  
**Testing:** Vitest, comprehensive coverage  
**Documentation:** Markdown, 15,000+ lines

---

**Thank you for using AutoMessager!**

*Transform your customer communications with secure, reliable WhatsApp automation.*

---

*AutoMessager v1.0.0*  
*Released: 2025-10-14*  
*Production-Ready ✅*

