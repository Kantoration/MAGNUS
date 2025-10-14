# AutoMessager Setup Guide

This guide provides detailed setup instructions for installing and configuring AutoMessager on client machines.

## Prerequisites

### For Binary Users (Recommended)
- **Windows 10+** or **macOS 10.15+** or **Linux (Ubuntu 20.04+)**
- **Salesforce account** with API access
- **Glassix account** with API credentials
- **Excel mapping file** (`massege_maping.xlsx`)

**No Node.js required** — the binary is self-contained.

### For Developers (Source Installation)
- **Node.js 20+** - [Download from nodejs.org](https://nodejs.org/)
- **Salesforce account** with API access
- **Glassix account** with API credentials
- **Excel mapping file** (`massege_maping.xlsx`)

---

## Installation Steps

### Option A: Binary Installation (Recommended — No Node.js Required)

**Best for:** End users, client machines, production deployment

1. **Download AutoMessager binary:**
   - Windows: `automessager-win.exe`
   - macOS: `automessager-mac`

2. **Create project folder:**
   ```powershell
   # Windows example
   mkdir C:\AutoMessager
   cd C:\AutoMessager
   
   # Copy binary here
   # Copy massege_maping.xlsx here
   ```

3. **Verify binary works:**
   ```powershell
   # Windows
   .\automessager-win.exe version
   
   # macOS/Linux
   ./automessager-mac version
   ```

4. **Run setup wizard:**
   ```powershell
   # Windows
   .\automessager-win.exe init
   
   # macOS/Linux
   ./automessager-mac init
   ```

   This creates a `.env` file with your configuration.

5. **Continue to "Configuration Wizard" section below.**

---

### Option B: Source Installation (For Developers)

**Best for:** Developers, customization, contributing to the project

1. **Download or clone project:**
   ```powershell
   # Windows
   cd C:\Users\User\Desktop\MAGNUS\AutoMessager\
   
   # macOS/Linux
   cd ~/AutoMessager/
   ```

2. **Install Node.js 20+:**
   
   Download from [nodejs.org](https://nodejs.org/).
   
   Verify:
   ```bash
   node --version
   # Should show v20.x.x or higher
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```

4. **Build the project:**
   ```bash
   npm run build
   ```

5. **Run setup wizard:**
   ```bash
   npx automessager init
   # or
   npm run cli:init
   ```

---

## Configuration Wizard

The setup wizard will guide you through configuration:

#### 1. Salesforce Configuration
- **Login URL**: `https://login.salesforce.com` (production) or `https://test.salesforce.com` (sandbox)
- **Username**: Your Salesforce email
- **Password**: Your Salesforce password
- **Security Token**: Get from Salesforce Settings → Personal → Reset Security Token

#### 2. Glassix Configuration
- **Base URL**: `https://api.glassix.com` (or your custom instance)
- **Authentication Mode**:

| Mode                 | Required Fields                     | Behavior                                                      |
| -------------------- | ----------------------------------- | ------------------------------------------------------------- |
| Modern (recommended) | API Key + API Secret                | Fetches short-lived access token (3h TTL), auto-refresh      |
| Legacy (deprecated)  | API Key only                        | Uses static bearer token (no refresh)                        |

> 🟢 **Recommended:** Use modern mode for better security. The system automatically handles token refresh every 3 hours.

- **API Mode**: `messages` (standard) or `protocols` (advanced)

#### 3. Excel Mapping
- **File Path**: Location of your `massege_maping.xlsx` file
  - Windows: `C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx`
  - macOS/Linux: `./massege_maping.xlsx`
  - **Important:** Use forward slashes (`/`) or double backslashes (`\\`) on Windows
- **Sheet**: Leave empty to use first sheet, or specify name/index

#### 4. Behavior Settings
- **Task Phone Field**: Custom field name (default: `Phone__c`)
- **Permit Landlines**: Allow non-mobile numbers (default: `false`)
- **Keep Ready on Fail**: Retain automation flag for retry (default: `true`)

The wizard creates a `.env` file in your project root.

---

## Verification & Testing

### 1. Verify Configuration

Test all connections:

**Binary:**
```powershell
# Windows
.\automessager-win.exe verify

# macOS/Linux
./automessager-mac verify
```

**Source:**
```bash
npx automessager verify
# or
npm run cli:verify
```

**Expected output:**
```
┌─────────────────────────┬────────┬─────────────────────────────────────┐
│ Check                   │ Status │ Message                             │
├─────────────────────────┼────────┼─────────────────────────────────────┤
│ Excel Mapping           │ ✔      │ 10 templates loaded                 │
│ Salesforce Login        │ ✔      │ Connected successfully              │
│ Glassix Auth            │ ✔      │ Access token obtained               │
│ Phone Normalization     │ ✔      │ Phone normalization working         │
└─────────────────────────┴────────┴─────────────────────────────────────┘

✅ All checks passed!
```

If any checks fail, review the error details and re-run `automessager init`.

### 2. Test with Dry-Run

Preview message sends without actually sending:

**Binary:**
```powershell
# Windows
.\automessager-win.exe dry-run

# macOS/Linux
./automessager-mac dry-run
```

**Source:**
```bash
npx automessager dry-run
# or
npm run cli:dry
```

Review logs in `./logs/automessager.log`.

### 3. Run Live

Execute the automation:

**Binary:**
```powershell
# Windows
.\automessager-win.exe run

# macOS/Linux
./automessager-mac run
```

**Source:**
```bash
npx automessager run
# or
npm run cli:run
```

---

## Scheduling Daily Runs

### Windows - Task Scheduler (Recommended)

**Prerequisites**: 
- Administrator privileges
- PowerShell scripts included in project (`scripts\windows\`)

**Steps:**

1. **Open PowerShell as Administrator**

2. **Navigate to project directory:**
   ```powershell
   cd C:\AutoMessager
   ```

3. **Install scheduled task:**
   ```powershell
   .\scripts\windows\Install-Task.ps1 -Hour 9 -Minute 0
   ```

   **Options:**
   - `-Hour` and `-Minute`: Set run time (default: 9:00 AM)
   - `-TaskName`: Custom task name (default: "AutoMessager")
   - `-UseDryRun`: Enable dry-run mode for testing

   **Example with custom time:**
   ```powershell
   .\scripts\windows\Install-Task.ps1 -Hour 8 -Minute 30
   ```

4. **Verify task created:**
   ```powershell
   Get-ScheduledTask -TaskName "AutoMessager"
   ```

5. **Test task manually:**
   ```powershell
   Start-ScheduledTask -TaskName "AutoMessager"
   ```

6. **View logs:**
   ```powershell
   Get-Content .\logs\run-*.log -Tail 50
   ```

7. **Remove task (if needed):**
   ```powershell
   .\scripts\windows\Uninstall-Task.ps1
   ```

**Task Settings:**
- Runs daily at specified time
- Works whether user is logged in or not
- Only runs if network is available
- Skips if previous instance is still running
- Logs to `.\logs\run-YYYYMMDD.log`

---

### macOS/Linux - Cron

**Steps:**

1. **Make script executable:**
   ```bash
   chmod +x scripts/macos/start.sh
   ```

2. **Edit crontab:**
   ```bash
   crontab -e
   ```

3. **Add daily job (9:00 AM):**
   ```cron
   0 9 * * * /full/path/to/AutoMessager/scripts/macos/start.sh >> /full/path/to/AutoMessager/logs/cron.log 2>&1
   ```

   **Dry-run mode:**
   ```cron
   0 9 * * * /full/path/to/AutoMessager/scripts/macos/start.sh --dry-run >> /full/path/to/AutoMessager/logs/cron.log 2>&1
   ```

4. **Verify cron job:**
   ```bash
   crontab -l
   ```

---

## .env File Reference

Your `.env` file should contain:

```bash
# ========================================
# Salesforce Configuration
# ========================================
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-username@example.com
SF_PASSWORD=your-password
SF_TOKEN=your-security-token

# ========================================
# Glassix Configuration (Modern Mode)
# ========================================
GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-api-key
GLASSIX_API_SECRET=your-api-secret

# API Settings
GLASSIX_API_MODE=messages
# Options: messages (default), protocols
GLASSIX_TIMEOUT_MS=15000

# ========================================
# Salesforce Query Settings
# ========================================
TASKS_QUERY_LIMIT=200
TASK_CUSTOM_PHONE_FIELD=Phone__c

# ========================================
# Excel Mapping Configuration
# ========================================
XSLX_MAPPING_PATH=C:/AutoMessager/massege_maping.xlsx
# Windows: Use forward slashes or double backslashes
# macOS/Linux: ./massege_maping.xlsx

# Optional: Sheet name or index (0-based)
# XSLX_SHEET=Sheet1

# ========================================
# Application Behavior
# ========================================
KEEP_READY_ON_FAIL=true
PERMIT_LANDLINES=false
DEFAULT_LANG=he

# ========================================
# Retry Configuration
# ========================================
RETRY_ATTEMPTS=3
RETRY_BASE_MS=300

# ========================================
# Logging
# ========================================
LOG_LEVEL=info
# Options: trace, debug, info, warn, error, fatal
```

### Important Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GLASSIX_API_KEY` | ✅ | - | Glassix API key |
| `GLASSIX_API_SECRET` | ⚠️ | - | Glassix API secret (enables modern token flow) |
| `GLASSIX_API_MODE` | ❌ | `messages` | API mode: `messages` or `protocols` |
| `GLASSIX_TIMEOUT_MS` | ❌ | `15000` | Request timeout in milliseconds |
| `XSLX_MAPPING_PATH` | ✅ | `./massege_maping.xlsx` | Path to Excel mapping file |
| `LOG_LEVEL` | ❌ | `info` | Logging verbosity |

### Deprecated Variables

- `PAGED` — No longer used (paging is automatic)
- `GLASSIXAPIKEY` — Use `GLASSIX_API_KEY` instead

## Troubleshooting

### Excel File Not Found

**Symptom**: "Template mapping file not found"

**Solution**:
1. Verify file exists at configured path
2. On Windows, use **forward slashes** (`C:/Users/...`) or **double backslashes** (`C:\\Users\\...`)
3. Re-run setup: `automessager init`

**Example valid paths:**
```bash
# ✅ Good (Windows)
XSLX_MAPPING_PATH=C:/AutoMessager/massege_maping.xlsx
XSLX_MAPPING_PATH=C:\\AutoMessager\\massege_maping.xlsx

# ❌ Bad (Windows - single backslashes)
XSLX_MAPPING_PATH=C:\AutoMessager\massege_maping.xlsx
```

---

### Salesforce Login Failed

**Symptom**: "Invalid username, password, security token"

**Solution**:
1. Verify credentials in `.env`
2. Use correct login URL (production vs. sandbox)
3. Reset security token if needed (Settings → Personal → Reset Security Token)
4. Ensure no extra spaces in `.env` values
5. Test with: `automessager verify`

---

### Glassix Auth Failed

**Symptom**: "Access token exchange failed" or "401 Unauthorized"

**Solution**:

**For Modern Mode (Recommended):**
1. Ensure BOTH `GLASSIX_API_KEY` and `GLASSIX_API_SECRET` are set
2. Verify credentials in Glassix dashboard
3. Check `GLASSIX_BASE_URL` is correct
4. Token auto-refreshes every 3 hours

**For Legacy Mode:**
1. Use only `GLASSIX_API_KEY` (no secret)
2. Token does NOT auto-refresh

**Migration from Legacy to Modern:**
Simply add `GLASSIX_API_SECRET` to your `.env` file. The system will automatically switch to modern mode.

---

### Glassix Token Expiration

**Symptom**: Messages fail after ~3 hours of running

**Solution**:
1. Verify you're using modern mode (both key and secret set)
2. Check logs for "Access token obtained" message
3. Token should auto-refresh 60 seconds before expiration

**Verify token flow:**
```powershell
automessager verify
# Should show: "Glassix Auth ✔ Access token obtained"
```

---

### No Templates Loaded

**Symptom**: "No templates loaded" or "Template not found"

**Solution**:
1. Open Excel file and verify headers exist:
   - `name` (or `Name`)
   - `מלל הודעה` (Message Text)
   - `Link`
   - `שם הודעה מובנית בגלאסיקס` (Glassix Template)
2. Ensure at least one row has data in `name` and `מלל הודעה`
3. Run verification:
   ```bash
   automessager verify
   ```
4. Check detailed diagnostics (source installation only):
   ```bash
   npm run verify:mapping
   ```

---

### Phone Number Issues

**Symptom**: "Invalid phone" or "Missing phone"

**Solution**:
1. Ensure `TASK_CUSTOM_PHONE_FIELD` matches your Salesforce field API name
2. Verify phone numbers are in Israeli format:
   - ✅ `050-1234567`
   - ✅ `0501234567`
   - ✅ `+972501234567`
3. Set `PERMIT_LANDLINES=true` if using landline numbers
4. Check Contact/Lead records have phone numbers populated
5. Test normalization: `automessager verify`

---

### Task Scheduler Not Running

**Symptom**: Scheduled task doesn't execute on Windows

**Solution**:
1. **Verify task exists:**
   ```powershell
   Get-ScheduledTask -TaskName "AutoMessager"
   ```

2. **Check last run status:**
   ```powershell
   Get-ScheduledTaskInfo -TaskName "AutoMessager"
   ```

3. **For binary users:** Ensure binary path in task is correct
   
4. **For source users:** Ensure project was built:
   ```bash
   npm run build
   ```

5. **Test manually:**
   ```powershell
   Start-ScheduledTask -TaskName "AutoMessager"
   ```

6. **Check logs:**
   ```powershell
   Get-Content .\logs\run-*.log -Tail 50
   ```

7. **Verify working directory** in task settings matches project location

---

### Zod Validation Errors

**Symptom**: "Configuration validation failed" or "Invalid environment configuration"

**Solution**:
1. A required variable is missing or invalid in `.env`
2. Re-run setup wizard to fix:
   ```bash
   automessager init
   ```
3. Check for typos in variable names
4. Ensure no extra quotes around values

**Example error:**
```
SF_USERNAME: Required
GLASSIX_API_KEY: String must contain at least 1 character
```

**Fix:** Add missing variables or fix invalid values in `.env`

---

## Self-Diagnosis Tools

Before contacting support, run these commands:

### 1. Comprehensive Verification
```powershell
# Binary
.\automessager-win.exe verify

# Source
npx automessager verify
```

Checks:
- ✔ Excel mapping file
- ✔ Salesforce connectivity
- ✔ Glassix authentication
- ✔ Phone normalization

### 2. Dry-Run Preview
```powershell
# Binary
.\automessager-win.exe dry-run

# Source
npx automessager dry-run
```

Shows what would happen without actually sending messages.

### 3. View Logs
```powershell
# Windows
notepad .\logs\automessager.log
Get-Content .\logs\run-*.log -Tail 100

# macOS/Linux
cat ./logs/automessager.log
tail -n 100 ./logs/run-*.log
```

### 4. Check Version
```powershell
# Binary
.\automessager-win.exe version

# Source
npx automessager version
```

Shows AutoMessager version, Node.js version, and platform info.

---

## Building Binaries (For Developers)

Package AutoMessager as a single executable (no Node.js required on target machine):

```bash
# Windows
npm run package:win
# Output: build/bin/automessager-win.exe

# macOS
npm run package:mac
# Output: build/bin/automessager-mac
```

**Distribution:**
1. Copy binary to client machine
2. Copy `scripts/` folder (for scheduler support)
3. Client runs: `.\automessager-win.exe init`
4. Client creates `.env` and provides Excel file

**Note**: Binary still requires:
- `.env` file in same directory (created by `init`)
- Excel mapping file at configured path
- Network access to Salesforce and Glassix APIs

---

## Support

For issues or questions:

1. **Run diagnostics:**
   ```bash
   automessager verify
   ```

2. **Review logs:**
   ```bash
   # Check for errors
   Get-Content .\logs\automessager.log -Tail 50
   ```

3. **Try dry-run:**
   ```bash
   automessager dry-run
   ```

4. **Check documentation:**
   - README.md — Full feature documentation
   - SETUP.md — This guide
   - DELIVERABLES.md — Implementation details

5. **Contact system administrator** with:
   - Output of `automessager verify`
   - Relevant log excerpts (with sensitive data removed)
   - Steps to reproduce the issue

---

## Quick Reference

### Common Commands

| Task | Binary (Windows) | Source |
|------|------------------|--------|
| Setup | `.\automessager-win.exe init` | `npx automessager init` |
| Verify | `.\automessager-win.exe verify` | `npx automessager verify` |
| Dry-run | `.\automessager-win.exe dry-run` | `npx automessager dry-run` |
| Run | `.\automessager-win.exe run` | `npx automessager run` |
| Version | `.\automessager-win.exe version` | `npx automessager version` |
| Install Task | `.\scripts\windows\Install-Task.ps1 -Hour 9 -Minute 0` | Same |
| Remove Task | `.\scripts\windows\Uninstall-Task.ps1` | Same |

### File Locations

| File | Location | Purpose |
|------|----------|---------|
| Configuration | `.env` | Credentials and settings |
| Excel Mapping | `massege_maping.xlsx` | Message templates |
| Logs | `logs/automessager.log` | Main log file |
| Daily Logs | `logs/run-YYYYMMDD.log` | Scheduler logs |
| Scripts | `scripts/windows/*.ps1` | Task Scheduler scripts |

---

*Last updated: 2025-10-14*

