# 🚀 AutoMessager - Quick Start Guide

**Get up and running in 5 minutes**

---

## What is AutoMessager?

AutoMessager automatically sends WhatsApp messages to your customers based on Salesforce tasks. It's like having a personal assistant that:

✅ Monitors your Salesforce for tasks  
✅ Finds the right message template  
✅ Personalizes each message  
✅ Sends via WhatsApp (Glassix)  
✅ Updates Salesforce with results

**No coding required - just configuration!**

---

## 📦 What You Received

Your AutoMessager Client Kit contains:

```
AutoMessager-ClientKit-v1.0.0/
├── win/
│   └── automessager-win.exe       ← Windows binary
├── mac/
│   └── automessager-mac            ← macOS binary
├── docs/
│   ├── README-QUICKSTART.md        ← This file
│   ├── SETUP.md                    ← Detailed setup
│   ├── TROUBLESHOOTING.md          ← Common issues
│   └── MACOS_SIGNING_NOTES.md      ← macOS security
├── templates/
│   ├── .env.example                ← Configuration template
│   └── massege_maping.xlsx         ← Sample Excel file
├── tools/
│   ├── verify-mapping.cmd/sh       ← Excel validator
│   └── smoke.cmd/sh                ← System test
└── scripts/
    └── windows/                    ← Automation scripts
```

---

## ⚡ 5-Minute Setup

### Step 1: Choose Your Platform

**Windows:**
```powershell
cd AutoMessager-ClientKit-v1.0.0\win
```

**macOS:**
```bash
cd AutoMessager-ClientKit-v1.0.0/mac
```

### Step 2: Prepare Configuration

**Copy the template:**

**Windows:**
```powershell
copy ..\templates\.env.example .env
```

**macOS:**
```bash
cp ../templates/.env.example .env
```

### Step 3: Run Setup Wizard

**Windows:**
```powershell
.\automessager-win.exe init
```

**macOS:**
```bash
# First time: Remove security block
xattr -dr com.apple.quarantine ./automessager-mac
codesign --force --deep --sign - ./automessager-mac

# Then run
./automessager-mac init
```

**The wizard will ask for:**

1. **Salesforce Credentials**
   - Login URL (production or sandbox)
   - Username (your email)
   - Password
   - Security token

2. **Glassix Credentials**
   - API Base URL
   - API Key
   - API Secret (recommended)

3. **Excel File Path**
   - Path to your message templates file
   - Default: `./massege_maping.xlsx`

4. **Behavior Settings**
   - Keep tasks ready on failure? (Yes)
   - Allow landline numbers? (No)
   - Default language (Hebrew)

### Step 4: Add Your Excel File

Copy your Excel file to the same folder:

**Windows:**
```powershell
copy C:\path\to\your\massege_maping.xlsx .
```

**macOS:**
```bash
cp /path/to/your/massege_maping.xlsx .
```

**Your Excel must have these columns:**
- `name` - Task type identifier
- `מלל הודעה` - Message text (Hebrew/English)
- `Link` - URL to include
- `שם הודעה מובנית בגלאסיקס` - Glassix template name (optional)

**Use the sample file in `templates/` as a reference!**

### Step 5: Run Diagnostics

**Windows:**
```powershell
.\automessager-win.exe doctor
```

**macOS:**
```bash
./automessager-mac doctor
```

**Expected Output:**
```
╔════════════════════════════════════════════════════════════╗
║         AutoMessager Diagnostic Report v1.0.0              ║
╚════════════════════════════════════════════════════════════╝

[PASS] Environment Variables
  ✓ All required variables set

[PASS] Excel Mapping
  ✓ 10 templates loaded from massege_maping.xlsx

[PASS] Salesforce
  ✓ Connected to production (orgId: 00D...)

[PASS] Glassix
  ✓ Access token obtained (expires in 179 minutes)
```

**If any check fails, see TROUBLESHOOTING.md**

### Step 6: Test with Dry-Run

Preview what will happen WITHOUT sending messages:

**Windows:**
```powershell
.\automessager-win.exe dry-run
```

**macOS:**
```bash
./automessager-mac dry-run
```

**Expected Output:**
```
🛡️  Running preflight checks...

✅ Preflight checks passed

[info] AutoMessager starting (mode: messages, DRY_RUN: true)
[info] Templates loaded (10 templates)
[info] Connected to Salesforce
[info] Processing 25 tasks...

📊 Dry-Run Summary:
  Total tasks: 25
  Previewed: 20
  Skipped: 3
  Failed: 2

✅ Success! No messages were sent (dry-run mode)
```

**Review the log file:**
```powershell
# Windows
Get-Content logs\automessager.log -Tail 50

# macOS
tail -50 logs/automessager.log
```

### Step 7: Go Live!

When ready to send messages for real:

**Windows:**
```powershell
.\automessager-win.exe run
```

**macOS:**
```bash
./automessager-mac run
```

**Expected Output:**
```
🛡️  Running preflight checks...

✅ Preflight checks passed

[info] AutoMessager starting (mode: messages)
[info] Templates loaded (10 templates)
[info] Connected to Salesforce
[info] Processing 25 tasks...
[info] Message sent (taskId: 00T..., to: +9725******67)

📊 Run Summary:
  Total tasks: 25
  Sent: 20
  Skipped: 3
  Failed: 2

✅ Complete! Check Salesforce for updated tasks.
```

---

## 🎯 What Success Looks Like

### ✅ Before Running
- [ ] `.env` file exists with all credentials
- [ ] Excel file (`massege_maping.xlsx`) in place
- [ ] `automessager doctor` shows all PASS
- [ ] `automessager verify` shows all ✔
- [ ] `automessager verify:mapping` shows templates loaded
- [ ] `automessager dry-run` completes successfully

### ✅ After Running
- [ ] Tasks in Salesforce marked "Completed"
- [ ] Delivery_Status__c = "SENT"
- [ ] Glassix_Conversation_URL__c populated
- [ ] Messages visible in Glassix inbox
- [ ] Customers received WhatsApp messages
- [ ] No errors in logs

---

## 📅 Schedule Daily Runs

### Windows - Task Scheduler

**Open PowerShell as Administrator:**

```powershell
# Navigate to the scripts folder
cd C:\path\to\AutoMessager-ClientKit-v1.0.0\scripts\windows

# Install task (runs daily at 9:00 AM)
.\Install-Task.ps1 -Hour 9 -Minute 0 -WorkingDirectory "C:\path\to\AutoMessager-ClientKit-v1.0.0\win"

# Test it manually
Start-ScheduledTask -TaskName "AutoMessager"

# View logs
Get-Content C:\path\to\AutoMessager-ClientKit-v1.0.0\win\logs\run-*.log -Tail 50
```

**To remove the task:**
```powershell
.\Uninstall-Task.ps1
```

### macOS/Linux - Cron

**Make script executable:**
```bash
chmod +x ../scripts/macos/start.sh
```

**Edit crontab:**
```bash
crontab -e
```

**Add this line (runs daily at 9:00 AM):**
```cron
0 9 * * * /path/to/AutoMessager-ClientKit-v1.0.0/scripts/macos/start.sh >> /path/to/logs/cron.log 2>&1
```

**Save and exit** (Ctrl+X, then Y, then Enter in nano)

---

## 🔧 Helper Tools

### Validate Excel File

**Windows:**
```powershell
..\tools\verify-mapping.cmd
```

**macOS:**
```bash
../tools/verify-mapping.sh
```

### Run Smoke Tests

**Windows:**
```powershell
..\tools\smoke.cmd
```

**macOS:**
```bash
../tools/smoke.sh
```

### Create Desktop Shortcut (Windows)

```powershell
cd ..\scripts\windows
.\Create-DesktopShortcut.ps1
```

This creates a desktop icon for quick access!

---

## ❓ Common Questions

### Q: Where should I put the `.env` and Excel files?

**A:** In the same folder as the binary (`automessager-win.exe` or `automessager-mac`).

### Q: Can I run this on multiple machines?

**A:** Yes! Each machine needs:
- The binary for that platform
- Its own `.env` file
- Copy of the Excel file
- Network access to Salesforce and Glassix

### Q: How do I update message templates?

**A:** 
1. Edit the Excel file
2. Save changes
3. Run `automessager verify:mapping` to validate
4. Next run will use the new templates (auto-reload)

### Q: What if I get an error?

**A:**
1. Run `automessager doctor` to diagnose
2. Check `TROUBLESHOOTING.md` for solutions
3. Create support bundle: `automessager support-bundle`
4. Share the bundle with support

### Q: How do I know if messages were sent?

**A:**
1. Check the run summary (shows "Sent: X")
2. Look in Salesforce - tasks marked "Completed"
3. Check Glassix inbox for conversations
4. Review `logs/automessager.log`

### Q: Can I test without sending real messages?

**A:** Yes! Use `automessager dry-run` - it simulates everything without sending.

### Q: How do I change the Excel sheet?

**A:** Add to `.env`:
```bash
XSLX_SHEET=Sheet2  # By name
# OR
XSLX_SHEET=1       # By index (0-based)
```

### Q: What if I need to use legacy Glassix auth?

**A:** Add to `.env`:
```bash
ALLOW_LEGACY_BEARER=true
```

Only set `GLASSIX_API_KEY` (not the secret).

---

## 🆘 Need Help?

### 1. Check Diagnostics
```bash
automessager doctor
```

### 2. Validate Configuration
```bash
automessager verify
automessager verify:mapping
```

### 3. Review Troubleshooting Guide
See `TROUBLESHOOTING.md` for the top 10 issues and solutions.

### 4. Create Support Bundle
```bash
automessager support-bundle
```

Generates a safe ZIP file with:
- Redacted configuration (secrets masked)
- Recent logs
- Excel manifest (no message content)
- System diagnostics

**Share this file with support - it's secure!**

---

## 📚 Additional Resources

- **SETUP.md** - Detailed step-by-step setup guide
- **TROUBLESHOOTING.md** - Solutions to common problems
- **MACOS_SIGNING_NOTES.md** - macOS security and signing
- **RELEASE_NOTES_v1.0.0.md** - What's new in this version

---

## ✅ Quick Command Reference

| Command | What It Does |
|---------|--------------|
| `automessager init` | Interactive setup wizard |
| `automessager doctor` | Deep diagnostics (use when troubleshooting) |
| `automessager verify` | Quick health check |
| `automessager verify:mapping` | Validate Excel file |
| `automessager dry-run` | Preview without sending |
| `automessager run` | Execute live (sends messages) |
| `automessager version` | Show version info |
| `automessager support-bundle` | Create support ZIP |

---

## 🎉 You're All Set!

You now have a working AutoMessager installation. Here's your workflow:

1. **Daily:** AutoMessager runs automatically (if scheduled)
2. **Monitor:** Check logs in `logs/automessager.log`
3. **Update:** Edit Excel file to change templates
4. **Validate:** Run `verify:mapping` after Excel changes
5. **Troubleshoot:** Use `doctor` if issues arise

**Welcome to automated WhatsApp messaging! 🚀**

---

**AutoMessager v1.0.0**  
*Simple. Reliable. Automated.*

