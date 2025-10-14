# AutoMessager v1.0.0 - Troubleshooting Guide

**Quick reference for common issues and solutions**

---

## 📞 Support Bundle

**Before reaching out for help, create a support bundle:**

```bash
automessager support-bundle
```

This creates a redacted ZIP file with:
- Configuration snapshot (secrets masked)
- Recent logs
- Excel mapping manifest (no message bodies)
- Environment diagnostics

**Share this ZIP file with support - it's safe and contains no secrets.**

---

## 🔍 Quick Diagnostics

Run these commands in order to identify issues:

### 1. Version Check
```bash
automessager version
```
**Expected:** Shows version 1.0.0, build date, and platform.

### 2. Doctor (Deep Diagnostics)
```bash
automessager doctor
```
**Expected:** All checks show PASS or WARN (no FAIL).

### 3. Quick Verify
```bash
automessager verify
```
**Expected:** Shows ✔ for all checks (Excel, Salesforce, Glassix, Phone).

### 4. Mapping Validation
```bash
automessager verify:mapping
```
**Expected:** Shows template count, sample keys, and validation summary.

---

## 🚨 Top 10 Issues

### 1. ❌ "Excel file not found"

**Symptoms:**
```
Template mapping file not found: ./massege_maping.xlsx
```

**Causes:**
- File not in the expected location
- Incorrect path in `.env`
- File name typo (common: `massege_maping.xlsx` vs `message_mapping.xlsx`)

**Solutions:**

✅ **Option 1: Place file in default location**
```bash
# Same directory as the binary or project root
cp /path/to/massege_maping.xlsx ./massege_maping.xlsx
```

✅ **Option 2: Update .env path**
```bash
# Windows (use forward slashes or double backslashes)
XSLX_MAPPING_PATH=C:/Users/User/Desktop/MAGNUS/AutoMessager/massege_maping.xlsx
# OR
XSLX_MAPPING_PATH=C:\\Users\\User\\Desktop\\MAGNUS\\AutoMessager\\massege_maping.xlsx

# macOS/Linux
XSLX_MAPPING_PATH=/Users/username/AutoMessager/massege_maping.xlsx
```

✅ **Option 3: Run init wizard**
```bash
automessager init
# Wizard will help you set the correct path
```

**Verify fix:**
```bash
automessager verify:mapping
```

---

### 2. ❌ "Salesforce login failed"

**Symptoms:**
```
INVALID_LOGIN: Invalid username, password, security token
```

**Causes:**
- Wrong credentials in `.env`
- Incorrect login URL (production vs sandbox)
- Security token expired or incorrect
- IP restrictions on Salesforce

**Solutions:**

✅ **Check credentials:**
```bash
# .env file should have:
SF_LOGIN_URL=https://login.salesforce.com  # OR https://test.salesforce.com for sandbox
SF_USERNAME=your-email@example.com
SF_PASSWORD=your-password
SF_TOKEN=your-security-token
```

✅ **Get new security token:**
1. Log into Salesforce
2. Go to **Settings** → **My Personal Information** → **Reset My Security Token**
3. Check email for new token
4. Update `SF_TOKEN` in `.env`

✅ **Check login URL:**
- **Production/Developer Edition:** `https://login.salesforce.com`
- **Sandbox:** `https://test.salesforce.com`

✅ **Test manually:**
```bash
automessager verify
# Check "Salesforce Login" row
```

**Verify fix:**
```bash
automessager doctor
# Should show PASS for Salesforce connectivity
```

---

### 3. ❌ "Glassix authentication failed"

**Symptoms:**
```
Glassix auth failed: 401 Unauthorized
```

**Causes:**
- Missing API credentials
- Wrong API key or secret
- Secure mode requires both key and secret

**Solutions:**

✅ **Modern mode (recommended):**
```bash
# .env file needs BOTH:
GLASSIX_API_KEY=your-api-key-here
GLASSIX_API_SECRET=your-api-secret-here
```

✅ **Legacy mode (if you only have API key):**
```bash
# .env file:
GLASSIX_API_KEY=your-api-key-here
ALLOW_LEGACY_BEARER=true
```

✅ **Re-run setup wizard:**
```bash
automessager init
# Answer prompts for Glassix credentials
```

**Verify fix:**
```bash
automessager verify
# Check "Glassix Auth" row
```

---

### 4. ❌ "No templates loaded" / "Template map is empty"

**Symptoms:**
```
Template map is empty - no rows loaded
Missing required headers: מלל הודעה
```

**Causes:**
- Excel file missing required columns
- Wrong sheet selected
- All rows are empty
- Hebrew encoding issues

**Solutions:**

✅ **Check required columns:**

Excel must have these 4 columns (headers in row 1):
1. `name` (or `Name`, `Task Name`)
2. `מלל הודעה` (or `Message Text`)
3. `Link` (or `link`, `URL`)
4. `שם הודעה מובנית בגלאסיקס` (or `Glassix Template`) - *optional*

✅ **Check data rows:**
- At least one row must have data in `name` AND `מלל הודעה`
- Don't leave all rows blank

✅ **Check sheet selection:**
```bash
# .env file (optional):
XSLX_SHEET=Sheet1  # Or sheet name
# XSLX_SHEET=0      # Or sheet index (0-based)
```

✅ **Check encoding:**
- Save Excel file as `.xlsx` (not `.xls`)
- Ensure UTF-8 encoding for Hebrew text

**Verify fix:**
```bash
automessager verify:mapping
# Should show template count > 0
```

---

### 5. ❌ "Secure authentication required: GLASSIX_API_SECRET is missing"

**Symptoms:**
```
Secure authentication required: GLASSIX_API_SECRET is missing.

AutoMessager requires modern access token flow in secure mode.
```

**Causes:**
- Running in `SAFE_MODE_STRICT=true` (default) without API secret
- Only legacy API key provided

**Solutions:**

✅ **Option 1: Add API secret (recommended):**
```bash
# .env file:
GLASSIX_API_SECRET=your-api-secret-here
```

✅ **Option 2: Allow legacy mode (not recommended):**
```bash
# .env file:
ALLOW_LEGACY_BEARER=true
```

✅ **Option 3: Run init wizard:**
```bash
automessager init
# Wizard will prompt for API secret
```

**Verify fix:**
```bash
automessager verify
# Should show "Access token obtained"
```

---

### 6. ❌ "Task Scheduler not running" (Windows)

**Symptoms:**
- Task appears in Task Scheduler but doesn't run
- No logs generated at scheduled time

**Causes:**
- Task disabled
- User not logged in (task requires login)
- Incorrect working directory
- PowerShell execution policy

**Solutions:**

✅ **Check task status:**
```powershell
Get-ScheduledTask -TaskName "AutoMessager"
# State should be "Ready"
```

✅ **Check task history:**
1. Open Task Scheduler (`taskschd.msc`)
2. Find **AutoMessager** task
3. View **History** tab
4. Look for error codes

✅ **Test task manually:**
```powershell
Start-ScheduledTask -TaskName "AutoMessager"
# Then check logs
Get-Content .\logs\run-*.log -Tail 50
```

✅ **Re-install task:**
```powershell
# Run as Administrator
.\scripts\windows\Uninstall-Task.ps1
.\scripts\windows\Install-Task.ps1 -Hour 9 -Minute 0
```

**Verify fix:**
```powershell
# Test run
Start-ScheduledTask -TaskName "AutoMessager"

# Check logs
Get-Content .\logs\automessager.log -Tail 30
```

---

### 7. ❌ "Binary won't run" (macOS)

**Symptoms:**
```
"automessager-mac" cannot be opened because the developer cannot be verified
```

**Causes:**
- macOS Gatekeeper blocking unsigned binary
- Quarantine attribute on downloaded file

**Solutions:**

✅ **Remove quarantine:**
```bash
xattr -dr com.apple.quarantine ./automessager-mac
```

✅ **Ad-hoc sign:**
```bash
codesign --force --deep --sign - ./automessager-mac
```

✅ **Right-click workaround:**
1. Right-click `automessager-mac` → **Open**
2. Click **Open** in the security dialog
3. macOS will remember your choice

**See full guide:** `docs/MACOS_SIGNING_NOTES.md`

**Verify fix:**
```bash
./automessager-mac version
# Should print version info
```

---

### 8. ❌ "No valid phone found" / "Missing/invalid phone"

**Symptoms:**
```
Task skipped: Missing/invalid phone (source: Task.Phone__c)
```

**Causes:**
- Phone field is empty or invalid
- Phone not in E.164 format (+972...)
- Landline number when `PERMIT_LANDLINES=false`

**Solutions:**

✅ **Check phone field priority:**

AutoMessager checks in this order:
1. `Task.Phone__c` (custom field)
2. `Contact.MobilePhone`
3. `Contact.Phone`
4. `Lead.MobilePhone`
5. `Lead.Phone`

✅ **Ensure E.164 format:**
- Must start with `+972` (Israel)
- Example: `+972501234567`
- Not: `050-1234567` or `0501234567`

✅ **Allow landlines (if needed):**
```bash
# .env file:
PERMIT_LANDLINES=true
```

✅ **Check custom phone field name:**
```bash
# .env file (default is Phone__c):
TASK_CUSTOM_PHONE_FIELD=Phone__c
```

**Verify fix:**
```bash
automessager dry-run
# Check logs for phone validation
```

---

### 9. ❌ "Message placeholders not replaced"

**Symptoms:**
```
Message sent with {{first_name}} instead of actual name
```

**Causes:**
- Placeholder syntax incorrect
- Context variable not available
- Typo in placeholder name

**Solutions:**

✅ **Use correct syntax:**
- `{{first_name}}` or `{first_name}` (both work)
- Case-sensitive: `{{First_Name}}` won't match

✅ **Supported placeholders:**
- `{{first_name}}` - Contact/Lead first name
- `{{last_name}}` - Contact/Lead last name
- `{{account_name}}` - Related account name
- `{{date}}` - Today's date (09/10/2025 or Hebrew)
- `{{link}}` - From Excel Link column or Context_JSON__c
- Custom variables from `Task.Context_JSON__c`

✅ **Test rendering:**
```bash
automessager dry-run
# Check logs for rendered message preview
```

**Verify fix:**
```bash
automessager dry-run
# Logs should show resolved placeholders
```

---

### 10. ❌ "DRY_RUN not working" / "Messages sent in test mode"

**Symptoms:**
- Messages actually sent when running dry-run
- No preview, direct execution

**Causes:**
- `DRY_RUN=1` not set in environment
- Using `run` instead of `dry-run` command
- Environment variable cleared

**Solutions:**

✅ **Use dry-run command:**
```bash
# Correct:
automessager dry-run

# Wrong:
automessager run
```

✅ **Check environment:**
```bash
# Windows PowerShell
$env:DRY_RUN
# Should be empty for dry-run command (it sets it automatically)

# macOS/Linux
echo $DRY_RUN
```

✅ **Manual DRY_RUN mode:**
```bash
# Windows
$env:DRY_RUN="1"
automessager run

# macOS/Linux
export DRY_RUN=1
./automessager-mac run
```

**Verify fix:**
```bash
automessager dry-run
# Output should say "DRY_RUN send" not "Message sent"
```

---

## 🧰 Advanced Diagnostics

### Check Configuration
```bash
automessager doctor --json > diagnostics.json
# Review diagnostics.json for detailed config
```

### View Recent Logs
```bash
# Windows
Get-Content .\logs\automessager.log -Tail 100

# macOS/Linux
tail -100 ./logs/automessager.log
```

### Test Salesforce Connection
```bash
automessager verify --json
```

### Validate Excel Mapping
```bash
automessager verify:mapping
```

### Create Support Bundle
```bash
automessager support-bundle
# Generates support/bundle-YYYYMMDD-HHMMSS.zip
```

---

## 🔧 Configuration Issues

### Issue: Path with spaces or special characters

**Solution:**
```bash
# Windows - use quotes in .env:
XSLX_MAPPING_PATH="C:/Users/User Name/Desktop/file.xlsx"

# macOS/Linux:
XSLX_MAPPING_PATH="/Users/user name/Documents/file.xlsx"
```

### Issue: Environment variables not loading

**Solutions:**
1. Ensure `.env` file is in same directory as binary
2. Check for typos in variable names (case-sensitive)
3. No spaces around `=` in `.env`
4. Restart terminal after `.env` changes

### Issue: Wrong timezone for dates

**Solution:**
```bash
# Dates use Asia/Jerusalem timezone by default
# To verify:
automessager dry-run
# Check logs for date formatting
```

---

## 📊 Performance Issues

### Issue: Slow processing

**Causes:**
- Large task volume
- Network latency
- Rate limiting

**Solutions:**

✅ **Enable paging for large batches:**
```bash
# .env file:
PAGED=true
TASKS_QUERY_LIMIT=200
```

✅ **Adjust retry settings:**
```bash
# .env file:
RETRY_ATTEMPTS=3  # Reduce for faster fails
RETRY_BASE_MS=300 # Increase for rate-limited APIs
```

✅ **Monitor concurrency:**
- Default: 5 tasks in parallel
- Hardcoded in `src/run.ts`
- Increase only if API supports it

---

## 🔒 Security Issues

### Issue: Secrets exposed in logs

**Should NOT happen** - All secrets are auto-redacted.

**If you see secrets:**
1. Create support bundle immediately
2. Report security issue
3. Rotate exposed credentials

### Issue: Support bundle contains sensitive data

**Support bundles are safe:**
- All secrets masked (****XXXX)
- Phone numbers masked (+972****1234)
- Message bodies excluded
- Only template names included

**Contents:**
- Redacted `.env` snapshot
- Logs (with PII redaction)
- Excel manifest (no message text)
- System info

---

## 📞 Getting Help

### 1. Self-Diagnosis
```bash
automessager doctor
automessager verify
automessager verify:mapping
```

### 2. Create Support Bundle
```bash
automessager support-bundle
```

### 3. Check Documentation
- `README.md` - Full system documentation
- `SETUP.md` - Step-by-step setup
- `docs/MACOS_SIGNING_NOTES.md` - macOS binary signing
- `RELEASE_NOTES_v1.0.0.md` - Release information

### 4. Review Logs
- `./logs/automessager.log` - Main application log
- `./logs/run-YYYYMMDD.log` - Daily scheduled run logs

### 5. Test Commands

**Version:**
```bash
automessager version
```

**Doctor:**
```bash
automessager doctor
```

**Verify:**
```bash
automessager verify
```

**Mapping:**
```bash
automessager verify:mapping
```

**Dry-Run:**
```bash
automessager dry-run
```

---

## ✅ Success Indicators

You'll know everything is working when:

✅ **Version command works:**
```
📦 AutoMessager
Version: 1.0.0
Build Date: 2025-10-14
```

✅ **Doctor shows all PASS:**
```
[PASS] Environment Variables
[PASS] Excel Mapping (10 templates)
[PASS] Salesforce (connected)
[PASS] Glassix (access token obtained)
```

✅ **Verify shows all ✔:**
```
✔ Excel Mapping - 10 templates loaded
✔ Salesforce Login - Connected successfully
✔ Glassix Auth - Access token obtained
✔ Phone Normalization - Working correctly
```

✅ **Dry-run completes:**
```
📊 Dry-Run Summary:
  Total tasks: 25
  Previewed: 20
  Skipped: 3
  Failed: 2
```

✅ **Live run succeeds:**
```
📊 Run Summary:
  Total tasks: 25
  Sent: 20
  Skipped: 3
  Failed: 2
```

---

**AutoMessager v1.0.0**  
*Production-Ready ✅*

