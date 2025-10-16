# 📱 AutoMessager - Automated WhatsApp Communication System

> **A production-ready automation that perfectly replicates the manual daily messaging workflow described in the Daily Messaging brief. Connects Salesforce tasks with WhatsApp messaging through Glassix, enabling personalized, timely customer communications at scale with 100% WhatsApp compliance.**

## 🎯 **Perfect Manual Workflow Replication**

AutoMessager **exactly replicates** the manual daily messaging workflow your team currently uses, while providing intelligent automation and WhatsApp compliance:

### **Manual Workflow → Automated System Mapping**

| **Manual Step** | **Automated System** | **Enhancement** |
|---|---|---|
| **Navigate to SFDC Report** | **Salesforce Tasks** (with `Ready_for_Automation__c = true`) | ✅ Structured automation flag |
| **Extract Contact Data** | **Polymorphic SOQL queries** with Who/What resolution | ✅ Multi-source phone resolution |
| **Glassix UI Navigation** | **Glassix API calls** with proper authentication | ✅ Modern access token flow |
| **Manual conversation creation** | **Automated conversation metadata** | ✅ Hebrew subjects + customer names |
| **Template selection** | **Intelligent template matching** | ✅ Auto-match + Excel fallback |
| **Template population** | **Pre-send validation** | ✅ Parameter validation + fail fast |
| **Message sending** | **WhatsApp template payload** | ✅ Deduplication + deterministic idempotency |
| **Audit trail logging** | **Contact/Lead audit tasks** | ✅ Complete audit trail creation |

---

## 🎯 What Does This System Do?

AutoMessager is an intelligent automation system that connects your Salesforce tasks with WhatsApp messaging, making customer communication automatic, consistent, and scalable.

### For Non-Technical Users: How It Works

Think of AutoMessager as a smart assistant that **perfectly replicates** what your team does manually:

1. **Reads your to-do list** (Salesforce tasks marked for automation) - *Just like opening SFDC reports*
2. **Checks customer details** (pulls name, phone number, account from Salesforce) - *Just like manual data extraction*
3. **Chooses the right message** (intelligent template matching + Excel fallback) - *Just like selecting templates in Glassix UI*
4. **Fills in the blanks** (replaces placeholders like `{{first_name}}` with actual customer names) - *Just like template auto-population*
5. **Sends the message** (via WhatsApp through Glassix with proper conversation metadata) - *Just like manual send*
6. **Records what happened** (updates Salesforce + creates Contact/Lead audit tasks) - *Just like manual status logging*
7. **Handles problems automatically** (retries failed messages, logs errors for review) - *Enhanced error handling*

### **9 Daily Messaging Tasks Supported**

The system supports all 9 distinct daily messaging tasks from the manual workflow:
1. **NEW_PHONE_READY** - Device ready for pickup
2. **PAYMENT_REMINDER** - Payment due reminder  
3. **TRAINING_LINK** - Training materials delivery
4. **APPOINTMENT_CONFIRMATION** - Service appointment confirmation
5. **WELCOME_MESSAGE** - New customer welcome
6. **RETURN_INSTRUCTIONS** - Device return instructions
7. **SATELLITE_CONNECTION_FINISH** - Satellite connection completion
8. **MAINTENANCE_REMINDER** - Device maintenance reminder
9. **SERVICE_FOLLOWUP** - Post-service follow-up

**Real-world example:**

Your Excel file (`messages_v1.xlsx`) contains message templates. Here's how the system matches the right message to the right customer:

```
STEP 1: SALESFORCE TASK
─────────────────────────────────────────────
Task ID: 00T1x000001
Task_Type_Key__c: "NEW_PHONE"    ← This is the matching key!
Ready_for_Automation__c: true
Contact: Daniel Cohen
  └─ FirstName: "דניאל"
  └─ Phone: "+972501234567"
  └─ Account.Name: "MAGNUS"
Device_Model__c: "S24"


STEP 2: EXCEL LOOKUP (messages_v1.xlsx)
─────────────────────────────────────────────
Excel Row where column "שם סוג משימה" = "NEW_PHONE":

| שם סוג משימה | מלל הודעה                                          | קישור                        |
|--------------|---------------------------------------------------|------------------------------|
| NEW_PHONE    | שלום {{first_name}}! חברת MAGNUS מודיעה כי        | https://magnus.co.il/devices |
|              | המכשיר {{device_model}} מוכן לאיסוף.              |                              |


STEP 3: TEMPLATE RENDERING
─────────────────────────────────────────────
System replaces placeholders with actual values:
  {{first_name}}    → "דניאל" (from Contact.FirstName)
  {{device_model}}  → "S24" (from Task.Device_Model__c)
  {{link}}          → https://magnus.co.il/devices (from Excel)
  {{date}}          → "14/10/2025" (today's date, auto-injected)


STEP 4: FINAL MESSAGE SENT
─────────────────────────────────────────────
To: +972***4567 (phone number masked in logs)

שלום דניאל! חברת MAGNUS מודיעה כי המכשיר S24 מוכן לאיסוף.
(תאריך: 14/10/2025)
https://magnus.co.il/devices
```

**How it knows which template to use:**

1. System reads `Task_Type_Key__c` field from Salesforce task (e.g., "NEW_PHONE")
2. Looks up that exact value in Excel column `שם סוג משימה` (Task Type Name)
3. Uses the message template from `מלל הודעה` column in that row
4. Fills in placeholders with customer data from Salesforce

**This ensures:**
- ✅ Each task type gets its own specific message
- ✅ Customer data automatically fills in placeholders
- ✅ Wrong template can't be sent to wrong customer
- ✅ If template missing, task is skipped (logged for review)

## 🚀 **Key Enhancements Over Manual Workflow**

### **WhatsApp Compliance & Template Intelligence**
- ✅ **100% WhatsApp Compliance**: Only uses approved Glassix templates (no free text for first messages)
- ✅ **Intelligent Template Matching**: Auto-matches Excel messages to Glassix templates using Hebrew text normalization
- ✅ **Pre-send Validation**: Validates parameter count/order against chosen template before sending
- ✅ **Daily Deduplication**: Prevents sending identical templates to same recipient within 24 hours

### **Natural Hebrew UI Integration**
- ✅ **Hebrew Subject Policy**: `"המכשיר מוכן לאיסוף · MAGNUS"` instead of `"AutoMessager: NEW_PHONE_READY"`
- ✅ **Proper Customer Names**: `"דניאל כהן"` format with intelligent fallbacks
- ✅ **Conversation Metadata**: Creates Glassix conversations indistinguishable from manual work

### **Complete Audit Trail**
- ✅ **Contact/Lead Audit Tasks**: Creates `"Glassix: NEW_PHONE_READY (auto)"` tasks on Contact/Lead records
- ✅ **Deterministic Idempotency**: `TaskId#TemplateName#VariableHash` prevents accidental duplicates
- ✅ **Error Taxonomy**: Structured error classification for operations dashboards

### **Enhanced Reliability**
- ✅ **Template Parameter Validation**: Fail fast with clear error messages
- ✅ **Hebrew Text Processing**: Normalizes niqqud and RTL punctuation for stable matching
- ✅ **Error Recovery**: Graceful degradation with comprehensive logging

## 👥 **Non-Technical User Guide: Salesforce Setup & Usage**

### **Understanding the "Ready for Automation" Checkbox**

AutoMessager uses a simple checkbox in Salesforce called `Ready_for_Automation__c` to know which tasks should be processed automatically. Think of it as a **"Send WhatsApp Message" button** - when checked, it tells the system "This task is ready to be automated."

### **🔧 Salesforce Setup (One-Time Configuration)**

Your Salesforce administrator needs to create this custom field:

#### **Step 1: Create the Custom Field**
1. **Go to Setup** → **Object Manager** → **Task**
2. **Create Custom Field**:
   - **Field Type**: Checkbox
   - **Field Name**: `Ready_for_Automation__c`
   - **Field Label**: "📱 Send WhatsApp Message"
   - **Default Value**: Unchecked
   - **Help Text**: "Check this box to automatically send WhatsApp message for this task"

#### **Alternative Setup Options**
If you prefer not to create a new field, you can configure AutoMessager to use existing fields:

**Option A: Use Task Status**
```
Task Status Values:
- "Not Started" (default)
- "Ready for Automation" ← AutoMessager processes these
- "Completed"
- "Cancelled"
```

**Option B: Use Task Type**
```
Task Type Values:
- "Call"
- "Email" 
- "WhatsApp Message" ← AutoMessager processes these
- "Meeting"
```

### **📱 Daily Usage: Simple 3-Step Process**

#### **Step 1: Create a Task**
1. Go to any **Contact** or **Lead** record
2. Click **"New Task"** (or **"Log a Call"**)
3. Fill in basic details:
   - **Subject**: "Send welcome message to customer"
   - **Type**: "WhatsApp Message" (optional)
   - **Due Date**: Today or tomorrow

#### **Step 2: Mark for Automation**
1. **Check the box** next to **"📱 Send WhatsApp Message"** ✅
2. **Save the Task**

#### **Step 3: Done!**
The AutoMessager system will automatically:
- ✅ Find this task
- ✅ Send the WhatsApp message using the correct template
- ✅ Mark the task as completed
- ✅ Update the task with delivery details and conversation link

### **🎯 Real-World Examples**

#### **Example 1: Customer's Phone is Ready for Pickup**

**What you do:**
1. **Open Salesforce** → Go to customer's contact record
2. **Click "New Task"**
3. **Fill out:**
   - Subject: "Phone ready - Daniel Cohen"
   - Type: "Device Ready"
   - Due Date: Today
   - **✅ Check "📱 Send WhatsApp Message"**
4. **Save**

**What happens automatically:**
- AutoMessager finds the task
- Looks up the message template for "Device Ready"
- Sends WhatsApp: *"שלום דניאל! המכשיר S24 מוכן לאיסוף"*
- Updates the task: "✅ Completed - Message sent successfully"

#### **Example 2: Payment Reminder**

**What you do:**
1. **Create Task** on customer's contact
2. **Subject**: "Payment reminder - Sarah Miller"
3. **Type**: "Payment Reminder"
4. **✅ Check "📱 Send WhatsApp Message"**
5. **Save**

**What happens automatically:**
- Sends WhatsApp: *"שלום שרה, יש לך חוב של 250 שקל. תאריך תשלום: 15/01/2025"*
- Includes payment link from your Excel template
- Marks task as completed

#### **Example 3: Training Materials**

**What you do:**
1. **Create Task** on customer's contact
2. **Subject**: "Send training link - Mike Johnson"
3. **Type**: "Training"
4. **✅ Check "📱 Send WhatsApp Message"**
5. **Save**

**What happens automatically:**
- Sends WhatsApp with training link
- Uses customer's name and device model from Salesforce
- Creates audit trail in both Task and Contact records

### **📋 Daily Operations Workflow**

#### **Morning Routine (5 minutes):**
1. **Check Salesforce** for tasks marked "📱 Send WhatsApp Message"
2. **Review** customer details and phone numbers
3. **Verify** AutoMessager is running (or run it manually)
4. **Check** delivery status in completed tasks

#### **Throughout the Day:**
1. **Create new tasks** as customers need messages
2. **Check the automation box** ✅
3. **Save** - messages send automatically!

#### **End of Day:**
1. **Review failed tasks** (if any)
2. **Handle manual follow-ups** for failed messages
3. **Check delivery reports** in Salesforce

### **💡 Best Practices**

#### **✅ Do's:**
- **Always verify** customer phone numbers before checking the box
- **Use clear, descriptive** task subjects (e.g., "Welcome message - John Smith")
- **Check the box only** when ready to send immediately
- **Review failed tasks** daily and fix issues
- **Use consistent task types** for better template matching

#### **❌ Don'ts:**
- **Don't check the box** for test messages or internal tasks
- **Don't create duplicate tasks** for the same customer
- **Don't leave tasks checked** for days without processing
- **Don't use the automation** for sensitive or urgent messages without verification

### **🔍 Understanding Task Statuses**

After AutoMessager processes your tasks, you'll see these statuses:

#### **✅ Completed Tasks:**
- **Status**: "Completed"
- **Delivery Status**: "SENT"
- **Glassix Link**: Click to view the WhatsApp conversation
- **Audit Trail**: Full history of what happened

#### **❌ Failed Tasks:**
- **Status**: "Waiting on External"
- **Failure Reason**: Clear explanation (e.g., "Invalid phone number")
- **Ready for Automation**: Still checked (for retry)

#### **⏳ Pending Tasks:**
- **Status**: "Not Started"
- **Ready for Automation**: ✅ Checked
- **Next**: Will be processed in next AutoMessager run

### **🚨 Troubleshooting Common Issues**

#### **"Message not sent" - What to check:**
1. **Phone Number**: Is it in correct format (+972501234567)?
2. **Customer Name**: Does the contact have a valid name?
3. **Template Match**: Does your Excel file have a template for this task type?
4. **Template Approval**: Is the Glassix template approved?

#### **"Task still pending" - What to check:**
1. **AutoMessager Running**: Is the system running automatically or manually?
2. **Task Type**: Does the task type match your Excel template names?
3. **Hold Queue**: Check if template needs approval (rare)

#### **"Wrong message sent" - What to check:**
1. **Task Type**: Verify the task type matches your intended template
2. **Excel Template**: Check your Excel file has the right message
3. **Template Matching**: System auto-matches - verify it chose correctly

### **📞 Getting Help**

#### **If Something Goes Wrong:**
1. **Check the task** - look at "Failure Reason" field
2. **Review logs** - contact your technical support
3. **Manual override** - uncheck the box and send manually through Glassix
4. **Contact support** - provide task ID and error details

#### **Common Support Questions:**
- **"How do I know if the message was sent?"** → Check task status and Glassix link
- **"Can I send messages manually too?"** → Yes! Uncheck the box and use Glassix directly
- **"What if I check the wrong box?"** → Uncheck it before the system runs
- **"How do I add new message templates?"** → Update your Excel file

### **🎯 Quick Reference Card**

**For Daily Use:**
1. **Create Task** on customer contact
2. **Fill Subject**: "Message type - Customer Name"
3. **Check Box**: "📱 Send WhatsApp Message" ✅
4. **Save** - Done!

**Task Types That Work:**
- Device Ready
- Payment Reminder
- Training Link
- Welcome Message
- Appointment Confirmation
- Service Follow-up

**What Happens Automatically:**
- ✅ Finds customer phone and name
- ✅ Matches message template
- ✅ Sends WhatsApp message
- ✅ Updates task with results
- ✅ Creates audit trail

---

**Remember: It's as simple as creating a task and checking one box! The system handles everything else automatically.** 🚀

### What It Does NOT Do

❌ **Does not send spam** - Only processes tasks you mark as "Ready for Automation"  
❌ **Does not guess** - If template or phone missing, it skips safely and logs why  
❌ **Does not leak data** - All phone numbers masked in logs, secrets never exposed  
❌ **Does not send duplicates** - Uses idempotency keys to prevent double-sending  

### The Complete Workflow (Step-by-Step)

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FETCH TASKS                                              │
│    • Connects to Salesforce                                 │
│    • Finds tasks with "Ready_for_Automation__c = true"      │
│    • Pulls up to 200 tasks per batch (configurable)         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. LOAD TEMPLATES                                           │
│    • Opens your Excel file (messages_v1.xlsx)               │
│    • Reads Hebrew column headers                            │
│    • Validates templates have required placeholders         │
│    • Caches in memory for speed                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. PROCESS EACH TASK (in parallel, max 5 at once)           │
│    For each task:                                           │
│    a) Find the right template (matches TaskType field)      │
│    b) Get customer phone (from Contact or Account)          │
│    c) Validate phone (supports IL, US, GB, DE, FR)          │
│    d) Render message (fill in {{first_name}}, {{date}})     │
│    e) Send via WhatsApp                                     │
│    f) Update Salesforce with status                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. HANDLE RESULTS                                           │
│    • SUCCESS: Mark task complete, save conversation URL     │
│    • FAILURE: Log error, mark failed with reason            │
│    • SKIP: No template/phone, log why and continue          │
│    • All outcomes logged for audit trail                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. REPORT & CLEANUP                                         │
│    • Print summary (Sent: X, Failed: Y, Skipped: Z)         │
│    • Write metrics (if configured)                          │
│    • Close connections gracefully                           │
│    • Repeat for next page if more tasks exist               │
└─────────────────────────────────────────────────────────────┘
```

**In simple terms**: AutoMessager automates sending the right WhatsApp message to the right customer at the right time, based on your Salesforce workflow—safely, reliably, and at scale.

---

## 💼 Business Value

### For Sales & Customer Service Teams
- ✅ **Save time** - No manual message sending
- ✅ **Consistency** - Every customer gets the correct message
- ✅ **Scalability** - Handle hundreds of customers per day
- ✅ **Tracking** - Full audit trail in Salesforce
- ✅ **Personalization** - Each message includes customer name, dates, and relevant links

### For Management
- ✅ **Visibility** - See all communications logged in Salesforce
- ✅ **Reliability** - Automatic retries and error handling
- ✅ **Compliance** - All messages tracked and auditable
- ✅ **Metrics** - Count of sent/failed messages per run

### For IT/DevOps
- ✅ **Security** - PII masked in logs, secrets never exposed
- ✅ **Scalability** - Handles unlimited tasks with paging
- ✅ **Monitoring** - Structured logs with full context
- ✅ **Flexibility** - 17 configuration options

---

## 🆘 Quick Help

**Something not working?** Run these commands:

```bash
automessager doctor    # Diagnose all systems
automessager verify    # Quick health check
```

**Need support?** Create a safe diagnostic bundle:

```bash
automessager support-bundle
# Creates redacted ZIP with logs (no secrets)
```

**See also:** [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for top 10 issues

---

## 🚀 Quick Reference - CLI Commands

| Command | Purpose | Example |
|---------|---------|---------|
| `automessager init` | Interactive setup wizard - creates/updates .env file | First-time setup |
| `automessager verify` | Test all connections (Salesforce, Glassix, Excel, phone validation) | Pre-deployment check |
| `automessager dry-run` | Preview messages without sending (validates entire workflow) | Test before going live |
| `automessager run` | Execute normally - send messages to customers | Daily production run |
| `automessager doctor` | Deep diagnostics with prescriptive troubleshooting | When things aren't working |
| `automessager support-bundle` | Create redacted diagnostic ZIP (safe to share, no secrets) | Share with support team |
| `automessager verify:mapping` | Validate Excel templates only | Excel file troubleshooting |
| `automessager discover-templates` | Discover Glassix templates and test matching | Template discovery |
| `automessager discover-templates --why` | Show why templates don't match (top 3 candidates) | Debug template matching |
| `automessager version` | Show version, Node.js, and platform info | Check installation |

### **Testing Commands**

| Command | Purpose | Example |
|---------|---------|---------|
| `npm run smoke:glassix` | Send real template message to test number | `TEST_E164=+9725XXXXXXX npm run smoke:glassix` |
| `npm run test:e2e` | Run comprehensive E2E tests | `GLASSIX_BASE_URL=... TEST_E164=+9725XXXXXXX npm run test:e2e` |
| `npm run test:comprehensive` | Run all comprehensive test suites | `npm run test:comprehensive` |
| `npm run test:table-driven` | Run table-driven validation tests | `npm run test:table-driven` |
| `npm run test:template-contract` | Run template contract validation tests | `npm run test:template-contract` |
| `npm run test:hebrew-rtl` | Run Hebrew RTL edge case tests | `npm run test:hebrew-rtl` |
| `npm run discover` | Discover templates and test matching | `npm run discover -- --why` |

**💡 Tip:** All commands support `--help` flag for detailed options.

---

## ❓ FAQ (Frequently Asked Questions)

### Where do I put the `.env` and Excel files?

**Answer:** In the same folder as the `automessager` binary.

**For binaries:**
- Windows: Same folder as `automessager-win.exe`
- macOS: Same folder as `automessager-mac`

**For source install:**
- Project root directory

```
📁 AutoMessager/
  ├── automessager-win.exe (or automessager-mac)
  ├── .env                 ← Your config here
  ├── messages_v1.xlsx     ← Your message templates here
  └── logs/                ← Auto-created
```

### How do I schedule daily runs?

**Windows (Task Scheduler):**
```powershell
# Run as Administrator
cd scripts\windows
.\Install-Task.ps1 -Hour 9 -Minute 0

# Test it
Start-ScheduledTask -TaskName "AutoMessager"
```

**macOS/Linux (cron):**
```bash
crontab -e
# Add this line (runs at 9:00 AM daily):
0 9 * * * /path/to/automessager-mac run >> /path/to/logs/cron.log 2>&1
```

**See:** [SETUP.md](SETUP.md#step-6-schedule-daily-runs-optional) for details

### How do I change the Excel sheet name?

**Answer:** Add to your `.env` file:

```bash
# Use sheet by name
XSLX_SHEET=Sheet2

# Or by index (0-based)
XSLX_SHEET=1
```

Default: First sheet (index 0)

### Can I use legacy bearer authentication?

**Answer:** Yes, but not recommended for production.

**Legacy mode (single API key):**
```bash
# .env file
GLASSIX_API_KEY=your-api-key-here
ALLOW_LEGACY_BEARER=true
```

**Modern mode (recommended - more secure):**
```bash
# .env file
GLASSIX_API_KEY=your-api-key-here
GLASSIX_API_SECRET=your-api-secret-here
# SAFE_MODE_STRICT=true (default)
```

The modern flow uses short-lived access tokens (3 hours) for better security.

### How do I test without sending real messages?

**Answer:** Use dry-run mode:

```bash
automessager dry-run
```

This simulates everything WITHOUT actually sending WhatsApp messages or updating Salesforce.

**Output shows:**
- `Previewed: X` instead of `Sent: X`
- All processing logic runs
- Logs show what WOULD happen
- Safe for testing template changes

### What if I get "Secure authentication required" error?

**Answer:** Add `GLASSIX_API_SECRET` to your `.env`:

```bash
# Option 1: Add the secret (recommended)
GLASSIX_API_SECRET=your-api-secret-here

# Option 2: Allow legacy mode (not recommended)
ALLOW_LEGACY_BEARER=true
```

Run `automessager init` to update your configuration interactively.

### Where are the log files?

**Answer:** In the `logs/` folder:

```bash
logs/
  ├── automessager.log      # Main application log
  ├── run-20251014.log      # Daily scheduled runs
  └── cron.log              # Cron output (macOS/Linux)
```

**View recent logs:**
```bash
# Windows
Get-Content .\logs\automessager.log -Tail 50

# macOS/Linux
tail -50 ./logs/automessager.log
```

### How do I update message templates?

**Answer:** Just edit your Excel file and save:

1. Open `messages_v1.xlsx`
2. Update the `מלל הודעה` column
3. Save the file
4. Validate: `automessager verify:mapping`
5. Next run uses new templates automatically!

AutoMessager reloads templates when the file timestamp changes.

### Can I run this on multiple computers?

**Answer:** Yes! Each computer needs:

- ✅ The binary for its platform (Windows/macOS)
- ✅ Its own `.env` file with credentials
- ✅ Copy of the Excel file
- ✅ Network access to Salesforce & Glassix

**Pro tip:** Use the same `.env` and Excel on all machines, or customize per region.

### What phone number formats are supported?

**Answer:** E.164 format with Israel country code:

**✅ Valid:**
- `+972501234567`
- `+972-50-123-4567` (dashes auto-removed)

**❌ Invalid:**
- `0501234567` (missing +972)
- `050-123-4567` (missing country code)
- `+1234567890` (non-Israel, unless you modify `src/phone.ts`)

**Default:** Mobile numbers only  
**To allow landlines:** Set `PERMIT_LANDLINES=true` in `.env`

---

## 🚀 Quickstart (Binary Client - No Node.js Required)

**For end users running the standalone binary:**

### Windows

1. **Extract the client kit:**
   ```
   AutoMessager-ClientKit-v1.0.0\win\automessager-win.exe
   ```

2. **Create `.env` file** (see templates/.env.example)

3. **Add your Excel file** to the same folder

4. **Run setup:**
   ```powershell
   .\automessager-win.exe init
   ```

5. **Verify:**
   ```powershell
   .\automessager-win.exe doctor
   ```

6. **Test:**
   ```powershell
   .\automessager-win.exe dry-run
   ```

7. **Go live:**
   ```powershell
   .\automessager-win.exe run
   ```

### macOS

1. **Extract the client kit:**
   ```
   AutoMessager-ClientKit-v1.0.0/mac/automessager-mac
   ```

2. **Remove security block:**
   ```bash
   xattr -dr com.apple.quarantine ./automessager-mac
   codesign --force --deep --sign - ./automessager-mac
   ```

3. **Create `.env` file** (see templates/.env.example)

4. **Add your Excel file** to the same folder

5. **Run setup:**
   ```bash
   ./automessager-mac init
   ```

6. **Verify:**
   ```bash
   ./automessager-mac doctor
   ```

7. **Test:**
   ```bash
   ./automessager-mac dry-run
   ```

8. **Go live:**
   ```bash
   ./automessager-mac run
   ```

**See:** [docs/README-QUICKSTART.md](docs/README-QUICKSTART.md) for the complete 5-minute guide.

---

## 🚀 Quickstart (Source Install - For Developers)

This section is for developers installing and running AutoMessager from source.

### Quick Reference

| Command | Purpose |
|---------|---------|
| `automessager init` | Interactive setup wizard |
| `automessager verify` | Test all connections |
| `automessager dry-run` | Preview without sending |
| `automessager run` | Execute normally |
| `automessager doctor` | Deep diagnostics |
| `automessager support-bundle` | Create redacted support ZIP |
| `automessager verify:mapping` | Validate Excel templates |
| `automessager version` | Show version info |

### Prerequisites

- **Node.js 20+** - [Download from nodejs.org](https://nodejs.org/)
- **Salesforce account** with API access
- **Glassix account** with API credentials
- **Excel mapping file** (`massege_maping.xlsx`)

### Step 1: Installation

Clone or download this project to your local machine:

```bash
# Example Windows path
C:\Users\User\Desktop\MAGNUS\AutoMessager\

# Example macOS/Linux path
~/AutoMessager/
```

Install dependencies:

```bash
npm install
```

Build the project:

```bash
npm run build
```

### Step 2: Interactive Setup

Run the setup wizard to create your `.env` configuration file:

```bash
# Using npm script (development)
npm run cli:init

# Or using built CLI (production)
npx automessager init

# Or if installed globally
automessager init
```

The wizard will guide you through:
- **Salesforce credentials** (login URL, username, password, security token)
- **Glassix authentication** (modern access token flow or legacy mode)
- **Excel mapping file** path (auto-detected for Windows)
- **Behavior settings** (phone field name, landlines, retry policy)

**Windows Default Excel Path:**
```
C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
```

**macOS/Linux Default:**
```
./massege_maping.xlsx
```

### Step 3: Verify Configuration

Run the verification tool to test all connections:

```bash
npm run cli:verify
# or
automessager verify
```

This will check:
- ✔ **Excel Mapping** - File exists, templates loaded
- ✔ **Salesforce Login** - API access, org ID
- ✔ **Glassix Auth** - Token exchange or legacy key
- ✔ **Phone Normalization** - E.164 format conversion

**Expected Output:**
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

If any check fails, review the error details and fix the configuration.

### Step 4: Test with Dry-Run

Preview message sends without actually sending:

```bash
npm run cli:dry
# or
automessager dry-run
```

**Output:**
```
📊 Dry-Run Summary:
  Total tasks: 25
  Previewed: 20
  Skipped: 3
  Failed: 2
```

Review the logs in `./logs/automessager.log` to ensure everything works as expected.

### Step 5: Run Live

Execute the automation to send messages:

```bash
npm run cli:run
# or
automessager run
```

**Output:**
```
📊 Run Summary:
  Total tasks: 25
  Sent: 20
  Skipped: 3
  Failed: 2
```

Logs are saved to:
- **Console**: Real-time output with colors
- **File**: `./logs/automessager.log` (persistent)
- **Daily logs**: `./logs/run-YYYYMMDD.log` (when using scheduler scripts)

### Step 6: Schedule Daily Runs (Optional)

#### Windows - Task Scheduler

Open PowerShell **as Administrator** and run:

```powershell
# Install daily task (runs at 9:00 AM)
.\scripts\windows\Install-Task.ps1 -Hour 9 -Minute 0

# Verify task was created
Get-ScheduledTask -TaskName "AutoMessager"

# Test task manually
Start-ScheduledTask -TaskName "AutoMessager"

# View logs
Get-Content .\logs\run-*.log -Tail 50

# Remove task
.\scripts\windows\Uninstall-Task.ps1
```

**Advanced Options:**

```powershell
# Custom task name and schedule
.\scripts\windows\Install-Task.ps1 `
  -TaskName "AutoMessager-Morning" `
  -Hour 8 `
  -Minute 30

# Dry-run mode for testing
.\scripts\windows\Install-Task.ps1 `
  -Hour 9 `
  -Minute 0 `
  -UseDryRun
```

The task will:
- Run daily at the specified time
- Use the project's working directory
- Log output to `./logs/run-YYYYMMDD.log`
- Run even if user is not logged in
- Skip if a previous run is still active

#### macOS/Linux - Cron

Make the script executable (already done in repo):

```bash
chmod +x scripts/macos/start.sh
```

Edit your crontab:

```bash
crontab -e
```

Add a daily job (example: 9:00 AM):

```cron
# AutoMessager daily run at 9:00 AM
0 9 * * * /path/to/AutoMessager/scripts/macos/start.sh >> /path/to/AutoMessager/logs/cron.log 2>&1
```

**Dry-run mode:**

```cron
0 9 * * * /path/to/AutoMessager/scripts/macos/start.sh --dry-run >> /path/to/AutoMessager/logs/cron.log 2>&1
```

### Step 7: Packaging to Standalone Binary (Advanced)

For deployment to client machines without Node.js:

```bash
# Build Windows executable
npm run package:win
# Output: build/bin/automessager-win.exe

# Build macOS executable
npm run package:mac
# Output: build/bin/automessager-mac
```

**Running the binary:**

```powershell
# Windows
.\build\bin\automessager-win.exe init
.\build\bin\automessager-win.exe verify
.\build\bin\automessager-win.exe run

# macOS
./build/bin/automessager-mac init
./build/bin/automessager-mac verify
./build/bin/automessager-mac run
```

**Note:** The binary still requires:
- `.env` file in the same directory
- Excel mapping file at the configured path
- Network access to Salesforce and Glassix APIs

### Troubleshooting

#### Issue: "Excel file not found"
**Solution:** Run `automessager init` again and ensure the path to `massege_maping.xlsx` is correct. On Windows, use double backslashes (`C:\\Users\\...`) or forward slashes (`C:/Users/...`).

#### Issue: "Salesforce login failed"
**Solution:** 
- Verify credentials in `.env`
- Check `SF_LOGIN_URL` (use `https://test.salesforce.com` for sandbox)
- Ensure security token is appended to password internally by the system (don't append it manually)

#### Issue: "Glassix auth failed"
**Solution:**
- For modern mode: Ensure both `GLASSIX_API_KEY` and `GLASSIX_API_SECRET` are set
- For legacy mode: Ensure only `GLASSIX_API_KEY` is set (no secret)
- Test with `automessager verify`

#### Issue: "No templates loaded"
**Solution:**
- Open Excel file and verify columns exist: `name`, `מלל הודעה`, `Link`, `שם הודעה מובנית בגלאסיקס`
- Ensure at least one row has data in both `name` and `מלל הודעה`
- Run `npm run verify:mapping` for detailed diagnostics

#### Issue: "Task Scheduler not running"
**Solution:**
- Verify task exists: `Get-ScheduledTask -TaskName "AutoMessager"`
- Check task history in Task Scheduler UI (`taskschd.msc`)
- Test manually: `Start-ScheduledTask -TaskName "AutoMessager"`
- Ensure working directory and script paths are correct

### CLI Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `automessager init` | Interactive setup wizard | `npm run cli:init` |
| `automessager verify` | Run connectivity checks | `npm run cli:verify` |
| `automessager dry-run` | Preview without sending | `npm run cli:dry` |
| `automessager run` | Execute live automation | `npm run cli:run` |
| `automessager version` | Show version info | `automessager version` |

---

## 🔄 How It Works (The Algorithm)

### Simple Explanation

Think of AutoMessager as a smart assistant that:

1. **Checks Salesforce** every time it runs for tasks marked "Ready for Automation"
2. **For each task**, it:
   - Finds the customer's phone number
   - Looks up the correct message template based on task type
   - Fills in personalization (customer name, dates, links)
   - Sends the WhatsApp message
   - Updates Salesforce with "Completed" status
3. **Handles problems** by marking tasks as "Waiting" with error details

### Detailed Flow

```
┌─────────────────────────────────────────────────────────────┐
│  1. STARTUP                                                  │
│  • Load configuration from environment                       │
│  • Connect to Salesforce                                     │
│  • Probe which custom fields exist                          │
│  • Load message templates from Excel                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  2. FETCH TASKS                                             │
│  • Query: Ready_for_Automation__c = true                    │
│  • Include: Contact/Lead info, Account name                 │
│  • Limit: 200 tasks (or use paging for more)               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  3. FOR EACH TASK (5 concurrent)                            │
│                                                              │
│  A. Get Task Type                                           │
│     • From Task_Type_Key__c field OR Subject                │
│     • Normalize: "New Phone" → NEW_PHONE                    │
│                                                              │
│  B. Find Customer Phone                                      │
│     • Priority: Task.Phone__c                               │
│     •   → Contact.MobilePhone                               │
│     •   → Contact.Phone                                     │
│     •   → Lead.MobilePhone/Phone                            │
│     • Normalize to: +972XXXXXXXXX (E.164 format)            │
│     • Skip if no valid phone found                          │
│                                                              │
│  C. Pick Message Template                                    │
│     • Match task type to Excel mapping                      │
│     • Get Hebrew/English text                               │
│     • Get optional Glassix template ID                      │
│     • Skip if template not found                            │
│                                                              │
│  D. Personalize Message                                      │
│     • Replace {{first_name}} with customer name             │
│     • Replace {{account_name}} with company                 │
│     • Replace {{date}} with today's date (09/10/2025)       │
│     • Replace {{link}} with tracking URL                    │
│     • Add any custom variables from Context_JSON__c         │
│                                                              │
│  E. Send WhatsApp                                            │
│     • Via Glassix API                                       │
│     • Rate limited: Max 4 messages/second                   │
│     • Retry up to 3x on failures (429, 502, 503, 504)      │
│     • Use Task.Id as idempotency key                        │
│     • Log masked phone (+9725******67)                      │
│                                                              │
│  F. Update Salesforce                                        │
│     • On Success:                                           │
│       - Status: "Completed"                                 │
│       - Delivery_Status__c: "SENT"                          │
│       - Append audit line to Description                    │
│       - Store Glassix conversation URL                      │
│     • On Failure:                                           │
│       - Status: "Waiting on External"                       │
│       - Store error reason                                  │
│       - Keep Ready flag for retry                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  4. COMPLETION                                              │
│  • Log summary: Total, Sent, Failed, Skipped                │
│  • Disconnect from Salesforce                               │
│  • Exit with status code                                    │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 Use Cases

### Use Case 1: New Phone Device Ready
**Scenario**: Customer ordered a new phone, device has arrived  
**Salesforce**: Task created with Subject "New Phone Ready"  
**Action**: Send personalized WhatsApp notification with pickup details  
**Result**: Customer receives message, task marked completed, Glassix link saved

### Use Case 2: Payment Reminder
**Scenario**: Customer has pending payment due today  
**Salesforce**: Task created with Subject "Payment Reminder"  
**Action**: Send WhatsApp with payment link and amount  
**Result**: Customer receives reminder, task completed

### Use Case 3: Appointment Confirmation
**Scenario**: Customer has scheduled appointment  
**Salesforce**: Task with Subject "Appointment Confirm"  
**Action**: Send confirmation with date, time, and location  
**Result**: Customer confirmed, reduces no-shows

### Use Case 4: Service Update
**Scenario**: Device repair completed  
**Salesforce**: Task "Service Complete"  
**Action**: Notify customer device is ready  
**Result**: Faster pickup, better customer satisfaction

### Use Case 5: Bulk Campaign
**Scenario**: 500 customers need monthly newsletter  
**Salesforce**: 500 tasks created in bulk  
**Action**: System processes in pages, sends to all  
**Result**: Entire campaign completed in minutes

---

## 🏗️ System Infrastructure

### Architecture Overview

```
┌──────────────────┐
│   Salesforce     │  ← Source of Truth
│   (CRM System)   │     • Customer data
│                  │     • Tasks to process
└────────┬─────────┘     • Update tracking
         │
         │ 1. Fetch Tasks
         │ (SOQL Query)
         ↓
┌──────────────────┐
│  AutoMessager    │  ← This Application
│  (Node.js App)   │     • Reads tasks
│                  │     • Loads templates
│  Components:     │     • Personalizes messages
│  • sf.ts         │     • Orchestrates flow
│  • templates.ts  │
│  • run.ts        │
└────────┬─────────┘
         │
         │ 2. Send Messages
         │ (HTTP API)
         ↓
┌──────────────────┐
│    Glassix       │  ← WhatsApp Gateway
│  (Messaging API) │     • Delivers WhatsApp
│                  │     • Provides conversation URLs
└────────┬─────────┘     • Returns delivery status
         │
         │ 3. Deliver
         │
         ↓
┌──────────────────┐
│    Customer      │  ← End User
│  (WhatsApp)      │     • Receives message
│                  │     • Can respond
└──────────────────┘
```

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Language** | TypeScript | Type safety and developer productivity |
| **Runtime** | Node.js 20+ | Server-side JavaScript execution |
| **CRM Integration** | jsforce | Salesforce API client |
| **Messaging** | Glassix API | WhatsApp message delivery |
| **Templates** | Excel (XLSX) | Business-friendly template management |
| **Validation** | Zod | Runtime type checking |
| **Logging** | Pino | High-performance structured logging |
| **Phone** | libphonenumber-js | International phone number validation |
| **Date/Time** | dayjs | Date formatting (Asia/Jerusalem TZ) |
| **Rate Limiting** | Bottleneck | API rate limit compliance |
| **Concurrency** | p-map | Parallel task processing |

### Key Features

#### 🛡️ **Reliability**
- **Automatic retries** - Exponential backoff on failures
- **Error recovery** - Graceful degradation, never crashes
- **Idempotency** - Safe to re-run without duplicates
- **Field detection** - Works with or without custom Salesforce fields
- **Process handlers** - Clean shutdown on system signals

#### ⚡ **Performance**
- **Concurrent processing** - 5 tasks in parallel
- **Paging support** - Handle thousands of tasks
- **Template caching** - Reload only when file changes
- **Rate limiting** - Respects Glassix API limits (250ms between calls)

#### 🔒 **Security**
- **PII masking** - Phone numbers never appear in logs
- **Secret redaction** - API keys and passwords automatically hidden
- **Type safety** - 100% TypeScript strict mode
- **Input validation** - All external data validated with Zod schemas

#### 🎨 **Flexibility**
- **17 configuration options** - Tune for your needs
- **DRY_RUN mode** - Preview without sending
- **Header aliasing** - Excel columns can be Name/name/NAME
- **Sheet selection** - Use any sheet in your workbook
- **Landline support** - Configurable mobile-only or include landlines

---

## 📊 Features

## Prerequisites

- Node.js 20+
- npm or yarn
- Salesforce account with API access
- Glassix account with API key
- Excel file with message templates

## Installation

```bash
npm install
```

## 🔌 Integrations Overview

AutoMessager integrates with two external systems using secure authentication flows:

### Salesforce Authentication (OAuth 2.0)
- **Method**: Username-Password OAuth flow via [jsforce](https://jsforce.github.io/)
- **Required credentials**:
  - `SF_USERNAME` - Your Salesforce username (email)
  - `SF_PASSWORD` - Your Salesforce password
  - `SF_TOKEN` - Security token from Salesforce (append to password internally)
  - `SF_LOGIN_URL` - Login endpoint (production: `https://login.salesforce.com`, sandbox: `https://test.salesforce.com`)
- **Token lifecycle**: jsforce handles session management and automatic refresh
- **Permissions needed**: Read Tasks/Contacts/Leads, Update Tasks

#### Field Detection & Graceful Degradation
- On startup, the system probes Task object fields using `describeTaskFields()` 
- Only updates fields that exist in your Salesforce org
- **Optional custom fields** (will skip if missing):
  - `Delivery_Status__c` (Text) - Set to "SENT" on success
  - `Last_Sent_At__c` (DateTime) - Timestamp of message send
  - `Glassix_Conversation_URL__c` (URL) - Link to conversation
  - `Failure_Reason__c` (Text, 1000 chars) - Truncated error on failure
  - `Ready_for_Automation__c` (Checkbox) - Kept `true` on failure when `KEEP_READY_ON_FAIL=true`
  - `Audit_Trail__c` (Long Text, 32K chars) - **Preferred** for bounded audit log
- **Fallback behavior**: If custom fields don't exist, uses standard fields (e.g., Description) and logs helpful warnings

#### Bounded Audit Trail
- Message sends append audit lines to `Audit_Trail__c` (preferred) or `Description` (fallback)
- Format: `[ISO_timestamp] WhatsApp → +9725******67 (provId=msg-123)`
- **Bounded to 32,000 characters** - old entries automatically truncated from the start
- Prevents field overflow errors in Salesforce

#### Paging Support for Large Backlogs
- **Default mode**: Single SOQL query (up to `TASKS_QUERY_LIMIT`, default 200)
- **Paged mode**: Set `PAGED=1` to enable `queryMore` paging
  - Processes tasks in batches to avoid memory issues
  - Automatically fetches additional pages until all tasks are processed
  - Ideal for backlogs of thousands of tasks
- **SOQL with TYPEOF**: Single query with polymorphic `Who` (Contact/Lead) and `What` (Account) resolution

### Glassix Authentication (Access Token Flow)
AutoMessager supports **two authentication modes** for Glassix:

#### **Modern: Access Token Flow (Recommended)**
For enhanced security, use the access token exchange mechanism:
- **Setup**: Provide both `GLASSIX_API_KEY` and `GLASSIX_API_SECRET` in your environment
- **Flow**: 
  1. On startup, exchange API Key + Secret for a temporary access token at `/access-token` endpoint
  2. Access token is valid for ~3 hours
  3. Token is cached and refreshed proactively before expiration
- **Benefits**: Secrets never transmitted with API requests; short-lived tokens limit exposure

#### **Legacy: Direct Bearer Token (Backward Compatible)**
For backward compatibility, you can still use a direct API key:
- **Setup**: Provide only `GLASSIX_API_KEY` (the legacy `GLASSIXAPIKEY` env var is still supported with a deprecation warning)
- **Flow**: API key is sent directly as `Authorization: Bearer` header on every request
- **Migration path**: When you add `GLASSIX_API_SECRET`, the system automatically switches to access token flow

### API Modes
Glassix supports two API modes via `GLASSIX_API_MODE`:
- **`messages`** (default): Standard messaging API
- **`protocols`**: Protocol-based messaging for advanced integrations

### Security Features
- **Secret redaction**: All sensitive fields (passwords, tokens, API keys) are automatically redacted from logs using Pino's redaction paths
- **PII masking**: Phone numbers are masked in logs (e.g., `+972****5678`)
- **Zod validation**: All environment variables are validated on startup
- **No plaintext dumps**: Configuration is never logged wholesale; only whitelisted safe fields appear in logs

### DRY_RUN Preview Mode
- Set `DRY_RUN=1` to preview message sends without actually sending or updating Salesforce
- Logs masked phone numbers, template keys, and message lengths
- Perfect for testing template changes or validating task selection logic
- Stats show `previewed` count instead of `sent`

---

## Configuration

1. Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

2. Fill in your credentials in `.env`:

```env
# Salesforce Configuration
SF_LOGIN_URL=https://login.salesforce.com
SF_USERNAME=your-salesforce-username@example.com
SF_PASSWORD=your-salesforce-password
SF_TOKEN=your-salesforce-security-token

# Glassix Configuration (Modern: Access Token Flow)
GLASSIX_BASE_URL=https://api.glassix.com
GLASSIX_API_KEY=your-glassix-api-key
GLASSIX_API_SECRET=your-glassix-api-secret

# Legacy (temporary compatibility - use modern flow above instead):
# GLASSIXAPIKEY=your-legacy-api-key

# Glassix API Settings
GLASSIX_API_MODE=messages
GLASSIX_TIMEOUT_MS=15000

# Salesforce Query Settings
TASKS_QUERY_LIMIT=200
TASK_CUSTOM_PHONE_FIELD=Phone__c

# Excel Mapping Configuration
XSLX_MAPPING_PATH=./massege_maping.xlsx
# XSLX_SHEET=0  # Optional: sheet name or index

# Application Behavior
KEEP_READY_ON_FAIL=true
PERMIT_LANDLINES=false
DEFAULT_LANG=he

# Retry Configuration
RETRY_ATTEMPTS=3
RETRY_BASE_MS=300

# Logging
LOG_LEVEL=info
```

**Configuration Reference:**

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SF_LOGIN_URL` | ✅ | - | Salesforce login URL (prod: `https://login.salesforce.com`, sandbox: `https://test.salesforce.com`) |
| `SF_USERNAME` | ✅ | - | Your Salesforce username (email) |
| `SF_PASSWORD` | ✅ | - | Your Salesforce password |
| `SF_TOKEN` | ✅ | - | Salesforce security token |
| `GLASSIX_BASE_URL` | ✅ | - | Glassix API base URL |
| `GLASSIX_API_KEY` | ✅* | - | Glassix API key (for direct auth or token exchange) |
| `GLASSIX_API_SECRET` | ⚠️ | - | Glassix API secret (enables access token flow) |
| `GLASSIX_API_MODE` | ❌ | `messages` | API mode: `messages` or `protocols` |
| `GLASSIX_TIMEOUT_MS` | ❌ | `15000` | API request timeout in milliseconds |
| `TASKS_QUERY_LIMIT` | ❌ | `200` | Max tasks to fetch per query |
| `TASK_CUSTOM_PHONE_FIELD` | ❌ | `Phone__c` | Custom phone field name on Task |
| `XSLX_MAPPING_PATH` | ❌ | `./massege_maping.xlsx` | Path to Excel mapping file |
| `XSLX_SHEET` | ❌ | - | Sheet name or index (0-based) |
| `KEEP_READY_ON_FAIL` | ❌ | `true` | Keep `Ready_for_Automation__c=true` on failure |
| `PERMIT_LANDLINES` | ❌ | `false` | Allow non-mobile phone numbers |
| `RETRY_ATTEMPTS` | ❌ | `3` | Number of retry attempts on failure |
| `RETRY_BASE_MS` | ❌ | `300` | Base retry delay in milliseconds (exponential backoff) |
| `LOG_LEVEL` | ❌ | `info` | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

\* Either `GLASSIX_API_KEY` alone (legacy) or `GLASSIX_API_KEY` + `GLASSIX_API_SECRET` (access token flow) required

### Excel Template File Path

By default, the app looks for `massege_maping.xlsx` in the same directory as the app.

**Option 1: Default (Recommended)**
Place your Excel file alongside the app:
```
AutoMessager/
  ├── massege_maping.xlsx  ← Place your file here
  ├── src/
  ├── package.json
  └── ...
```

**Option 2: Custom Path via Environment Variable**
Override the path in `.env` (requires proper escaping on Windows):
```env
# Windows: Use double backslashes or forward slashes
XSLX_MAPPING_PATH=C:\\Users\\User\\Desktop\\MAGNUS\\AutoMessager\\massege_maping.xlsx
# OR
XSLX_MAPPING_PATH=C:/Users/User/Desktop/MAGNUS/AutoMessager/massege_maping.xlsx

# Linux/Mac: Use absolute or relative path
XSLX_MAPPING_PATH=/home/user/templates/massege_maping.xlsx
# OR
XSLX_MAPPING_PATH=./templates/massege_maping.xlsx
```

**Important:** On Windows, backslashes in paths must be escaped (`\\`) or use forward slashes (`/`).

## 🏗️ Architecture & Technical Details

### For Developers: Big-Picture Pipeline

**What talks to what:**

```
┌──────────────────┐
│   CLI Entry      │  bin/automessager.ts
│   Points         │  ├── run (main loop)
└────────┬─────────┘  ├── init/wizard (setup)
         │            ├── doctor (diagnostics)
         ↓            └── verify:mapping (validation)
┌──────────────────────────────────────────────────────────┐
│                   CORE SERVICES                          │
├──────────────────────────────────────────────────────────┤
│ • Config (src/config.ts)                                 │
│   └─ Load/validate .env, enforce secure auth policy     │
│                                                          │
│ • Logger (src/logger.ts)                                 │
│   └─ Structured logs, PII redaction, correlation IDs    │
│                                                          │
│ • Salesforce (src/sf.ts)                                 │
│   └─ Login, SOQL fetch/update, field mapping            │
│                                                          │
│ • Glassix (src/glassix.ts)                               │
│   └─ Access token exchange, message send, rate limiting │
│                                                          │
│ • Templates (src/templates.ts)                           │
│   └─ Load/parse Excel, validate placeholders, render    │
│                                                          │
│ • Phone (src/phone.ts)                                   │
│   └─ Normalize E.164, mask PII, validate Israeli        │
│                                                          │
│ • HTTP Error Utils (src/http-error.ts)                   │
│   └─ Safe error strings, retry logic, backoff           │
│                                                          │
│ • SF Updater (src/sf-updater.ts)                         │
│   └─ Update Task fields, audit trail policy             │
│                                                          │
│ • Metrics (src/metrics.ts) [optional]                    │
│   └─ Prometheus counters/histograms, telemetry          │
└──────────────────────────────────────────────────────────┘
         ↓
┌──────────────────────────────────────────────────────────┐
│              ORCHESTRATOR (src/run.ts)                   │
│  Wires everything together:                              │
│  1. Load config & assert auth policy                     │
│  2. Connect to Salesforce                                │
│  3. Load/validate template map                           │
│  4. Pull page of Tasks (up to 200)                       │
│  5. Process Tasks in parallel (max 5, rate-limited)      │
│  6. Write updates & stats/metrics                        │
│  7. Repeat for next page (if paging enabled)             │
└──────────────────────────────────────────────────────────┘
```

### Data Flow for a Single Task

Here's what happens when processing one Salesforce task:

```
1. FETCH TASK
   ├─ Query: "SELECT Id, TaskType__c, ... FROM Task WHERE Ready_for_Automation__c = true"
   ├─ Includes: Related Contact/Account fields (phone, name)
   └─ Result: Task object with all needed data
              ↓
2. NORMALIZE PHONE
   ├─ Extract from Contact.Phone or Account.Phone
   ├─ Clean: Remove spaces, hyphens, parentheses
   ├─ Validate: Check against allowed countries (default: IL, US, GB, DE, FR)
   ├─ Format: Convert to E.164 standard (+[country][number])
   └─ Result: "+972501234567", "+12125551234", etc. (E.164 format) or NULL
              ↓
3. DERIVE TASK KEY & LOOKUP TEMPLATE
   ├─ Extract: Task_Type_Key__c from Salesforce (e.g., "NEW_PHONE")
   ├─ Normalize: Strip spaces, convert to uppercase
   ├─ Match: Find row in Excel where "שם סוג משימה" = "NEW_PHONE"
   └─ Result: Template with message body, link, Glassix template ID
              ↓
3b. BUILD CONTEXT
   ├─ Contact fields → Placeholders (first_name, account_name)
   ├─ Task custom fields → Additional data (device_model, imei)
   ├─ System → Auto-inject date ({{date}}, {{date_he}}, {{date_iso}})
   └─ Result: { first_name: "דניאל", date: "14/10/2025", device_model: "S24" }
              ↓
4. RENDER MESSAGE
   ├─ Lookup template by TaskType__c
   ├─ Replace placeholders: "{{first_name}}" → "Daniel"
   ├─ Sanitize: Remove control chars, validate links
   ├─ Append date/link if not in template
   └─ Result: "שלום Daniel! המכשיר S24 מוכן לאיסוף. (תאריך: 14/10/2025)"
              ↓
5. SEND VIA GLASSIX
   ├─ Ensure access token (or legacy bearer if allowed)
   ├─ Throttle with Bottleneck (max 4 req/sec)
   ├─ Include Idempotency-Key = Task.Id (prevent duplicates)
   ├─ POST to /v2/messages or /v3/protocols
   └─ Result: { providerId: "abc123", conversationUrl: "https://..." }
              ↓
6. UPDATE SALESFORCE
   ├─ If SUCCESS:
   │  ├─ Set Delivery_Status__c = "Sent"
   │  ├─ Set Last_Sent_At__c = now
   │  ├─ Set Glassix_Conversation_URL__c = conversationUrl
   │  ├─ Set Glassix_Provider_ID__c = providerId
   │  └─ Append to Audit_Trail__c (with smart truncation)
   ├─ If FAILURE:
   │  ├─ Set Delivery_Status__c = "Failed"
   │  └─ Set Failure_Reason__c = error message
   └─ Retry logic: 3 attempts with exponential backoff
              ↓
7. RECORD METRICS
   ├─ Increment stats.sent or stats.failed
   ├─ Track latency histogram (how long send took)
   ├─ Log correlation ID (rid) for traceability
   └─ Emit Prometheus metrics (if METRICS_PATH set)
```

### How Scripts Integrate

The **CLI** (`bin/automessager.ts`) is the entry point:

```typescript
// CLI calls orchestrator
import { runOnce } from './src/run.js';

if (command === 'run') {
  const stats = await runOnce();
  console.log(`Sent: ${stats.sent}, Failed: ${stats.failed}`);
}
```

The **Orchestrator** (`src/run.ts`) constructs all clients:

```typescript
// Initialize services
const conn = await sf.login(config);
const templateMap = await loadTemplateMap(config.XSLX_MAPPING_PATH);
const updater = new SalesforceTaskUpdater(conn, fieldMap, config);

// Process tasks
for each page of tasks:
  await pMap(tasks, async (task) => {
    await processTask(conn, task, templateMap, config, stats, isDryRun, updater);
  }, { concurrency: 5 });
```

**All stateful work** is encapsulated in service modules:
- **Glassix client** holds token cache and rate limiter
- **TemplateManager** caches Excel data (keyed by mtime)
- **SalesforceTaskUpdater** centralizes field mapping and retry logic
- **Orchestrator** just passes what's needed (Connection, config, stats)

### Concurrency Model: Controlled Parallelism

**Q: Does it "work in sync"?**  
**A: It's asynchronous with controlled concurrency + rate limiting.**

```
┌─────────────────────────────────────────────────────────┐
│  Page of 200 Tasks                                      │
├─────────────────────────────────────────────────────────┤
│  Process 5 tasks at once (configurable via p-map)       │
│                                                         │
│  Task 1 ──┐                                             │
│  Task 2 ──┼─→ [ Bottleneck Rate Limiter ]              │
│  Task 3 ──┤      ↓                                      │
│  Task 4 ──┤   Max 4 req/sec to Glassix                  │
│  Task 5 ──┘      ↓                                      │
│           ─→  [ Glassix API ]                            │
│                                                         │
│  Even if 5 tasks run concurrently, actual API calls     │
│  won't exceed rate limit (250ms between calls)          │
└─────────────────────────────────────────────────────────┘
```

**Key mechanisms:**

1. **p-map** - Process N tasks concurrently (default: 5)
2. **Bottleneck** - Global rate limiter for Glassix (250ms = 4 req/sec)
3. **Exponential backoff** - Retry with jitter (100ms, 200ms, 400ms...)
4. **Worker offloading** - Large Excel files parsed in separate thread
5. **Per-task isolation** - Failures caught and logged, don't stop others

**Why this model?**

- ✅ **Throughput** - Process many tasks quickly (5 at once)
- ✅ **Safety** - Never exceed API rate limits (Bottleneck)
- ✅ **Reliability** - Retries smooth over transient failures
- ✅ **Responsiveness** - Worker threads keep event loop free
- ✅ **Isolation** - One task failure doesn't crash the batch

### Consistency & Ordering Guarantees

**At-least-once delivery** with idempotency:

```
Glassix Idempotency-Key = Task.Id

First send:  POST /messages { "idemKey": "00T1x000001", ... }
           → Creates conversation "conv_abc123"
           
Retry send:  POST /messages { "idemKey": "00T1x000001", ... }
           → Returns SAME conversation "conv_abc123" (no duplicate)
```

**Salesforce is source of truth** after send:

- `Delivery_Status__c` = "Sent" | "Failed"
- `Glassix_Conversation_URL__c` = Link to conversation
- `Glassix_Provider_ID__c` = Glassix's internal ID
- `Last_Sent_At__c` = Timestamp of last attempt
- `Audit_Trail__c` = History of all attempts

**Correlation IDs** for traceability:

```
Every log line includes:
  rid: "abc123"  (request ID, unique per task)
  taskId: "00T1x000001"
  taskKey: "NEW_PHONE"
  
Search logs: grep "rid:abc123" → see entire task journey
```

**Rate-limit telemetry** maintains consistency:

```
Response headers:
  x-ratelimit-remaining: 95
  x-ratelimit-reset: 1697234567

If remaining < 10 → warn and slow down
If hit limit (429) → backoff and retry
```

### Where Desynchronization Could Happen (and How We Mitigate)

**Problem: Template cache staleness**
- User edits Excel while system running
- **Mitigation:**
  - Cache keyed by file `mtime` (modification time)
  - Automatic reload when file changes detected
  - Run `automessager verify:mapping` before production runs

**Problem: Token expiry during bursts**
- Access token expires mid-batch (3-hour lifetime)
- **Mitigation:**
  - Client auto-refreshes tokens (60s before expiry)
  - Token fetch wrapped in retry logic
  - Rate limiter reduces pressure on refresh endpoint

**Problem: Partial failures (send success, SF update fails)**
- WhatsApp sent but Salesforce update throws error
- **Mitigation:**
  - Updater errors are **non-fatal** (logged, not thrown)
  - Idempotency prevents duplicate sends on retry
  - Conversation URL presence indicates send succeeded
  - Reconciliation job can fix SF state later

**Problem: Phone number enumeration**
- Error messages reveal if phone exists/invalid
- **Mitigation:**
  - User-facing errors are **generic** ("Unable to process")
  - Specific reasons only in logs (with masked phone)
  - No differentiation between missing/invalid/wrong format

### TL;DR - Is It Synchronized?

**Yes, operationally:**
- The workflow is **well-coordinated and consistent** under concurrency
- **Single orchestrator** governs fetch → process → update flow
- **Bounded parallelism** for tasks (configurable)
- **Global rate limiting** for external APIs (Bottleneck)
- **Idempotent sends** (Idempotency-Key) prevent duplicates
- **Centralized updates** (SalesforceTaskUpdater) keep SF in sync
- **Comprehensive logging** (correlation IDs) for observability
- **Optional metrics** (Prometheus) for monitoring

**Intentionally asynchronous:**
- For **throughput** (process 200 tasks/minute vs 1 task/minute)
- With **safety** (rate limits, retries, isolation)
- And **consistency** (idempotency, audit trails, correlation)

---

## Usage

### Development Mode

Run the worker with hot reload:
```bash
npm run dev
```

### Build

Compile TypeScript to JavaScript:
```bash
npm run build
```

### Test

Run unit tests:
```bash
npm test
```

Watch mode:
```bash
npm run test:watch
```

### Comprehensive Test Suite

AutoMessager includes a comprehensive test suite covering production scenarios, edge cases, and compliance requirements:

#### **Table-Driven Tests**
- **Template Parity**: Validates exact parameter count/order for all 9 production tasks
- **Idempotency**: Tests deterministic key generation and duplicate prevention
- **Daily Deduplication**: Prevents duplicate sends within 24-hour windows
- **Fallbacks**: Tests graceful degradation for missing data
- **Write-back Robustness**: Ensures message sending continues despite audit failures
- **Compliance Guardrails**: Validates WhatsApp opt-in and template approval requirements
- **Rate-limit/Retry**: Tests bounded retries with exponential backoff

#### **Template Contract Tests**
- **Live Catalog Validation**: Validates against real Glassix template catalog
- **Parameter Order Validation**: Detects same count, wrong order scenarios
- **Template Version Drift**: Prevents "compiles green, deploys red" issues
- **CI Integration**: Fails builds on contract violations

#### **Hebrew RTL Edge Cases**
- **Niqqud Stripping**: Removes Hebrew diacritics for stable matching
- **Geresh/Gershayim Normalization**: Converts Hebrew punctuation correctly
- **Mixed LTR Tokens**: Handles device names like "iPhone 15" in Hebrew context
- **Bidi Control Characters**: Prevents bidirectional control chars from leaking
- **Property-Based Tests**: Tests Hebrew names with various edge cases

#### **Production Hardening**
- **Ops & Monitoring**: Dashboard metrics and SLA testing
- **Compliance & Privacy**: PII masking and audit trail validation
- **Media Templates**: URL validation and checksum verification
- **Rate Limit Backoff**: Exponential backoff with jitter testing
- **Time-zone Correctness**: Asia/Jerusalem timezone validation

#### **Run Test Suites**
```bash
# Run all comprehensive tests
npm run test:comprehensive

# Individual test suites
npm run test:table-driven          # Core functionality tests
npm run test:template-contract     # Template contract validation
npm run test:hebrew-rtl           # Hebrew RTL edge cases
npm run test:edge-cases           # Additional edge cases
npm run test:ops-monitoring       # Operations dashboard tests
npm run test:production-hardening # Production readiness tests
npm run test:runbook-acceptance   # Compliance and runbook tests
```

#### **Test Coverage**
- ✅ **Template Parity**: 9 production tasks with exact parameter validation
- ✅ **Idempotency**: Deterministic key generation and duplicate prevention
- ✅ **Daily Deduplication**: 24-hour window duplicate prevention
- ✅ **Fallbacks**: Graceful degradation for missing data
- ✅ **Write-back Robustness**: Non-fatal audit failures
- ✅ **Compliance Guardrails**: WhatsApp opt-in and template approval
- ✅ **Rate-limit/Retry**: Bounded retries with exponential backoff
- ✅ **Hebrew RTL**: Comprehensive normalization and edge cases
- ✅ **Template Contracts**: Live catalog validation and CI integration
- ✅ **Production Hardening**: Ops monitoring and compliance testing

### Lint

Check code style:
```bash
npm run lint
```

Fix linting issues:
```bash
npm run lint:fix
```

### Format

Format code with Prettier:
```bash
npm run format
```

### Verification

Verify Excel mapping system is working correctly:
```bash
npm run verify:mapping
```

This verification harness:
- Confirms the Excel file is accessible
- Validates Hebrew column parsing
- Checks that mappings are loaded correctly
- Tests message rendering with date and link injection
- Provides detailed diagnostics on failure

**Expected output:**
```
[info] mapping-path: C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
[info] mapping-mtime: 10/9/2025, 12:34:56 PM
[info] mapping-size: 10
[info] keys-sample: ["NEW_PHONE","PAYMENT_REMINDER","WELCOME",...]
[info] probe-NEW_PHONE: "שלום דניאל! חברת MAGNUS, מכשיר S24 (תאריך: 09/10/2025) https://..."
[info] verify: OK
```

**Configuration:**
The verification uses `XSLX_MAPPING_PATH` from your `.env` file, or defaults to:
```
C:\Users\User\Desktop\MAGNUS\AutoMessager\massege_maping.xlsx
```

**Failure scenarios:**
- ❌ File not found → Shows absolute path that was attempted
- ❌ Required columns missing → Indicates which Hebrew columns are needed
- ❌ Map is empty → No valid rows loaded
- ❌ Link auto-append failed → Link injection not working correctly

## Project Structure

```
src/
├── config.ts       # Environment configuration with Zod
├── logger.ts       # Pino logger singleton
├── sf.ts          # Salesforce API client (jsforce)
├── glassix.ts     # Glassix WhatsApp API client
├── templates.ts   # Excel template loader and renderer
├── phone.ts       # Phone number normalization (E.164)
├── run.ts         # Main orchestrator
├── types.ts       # TypeScript type definitions
└── utils/
    └── date.ts    # Hebrew/English date formatters

test/
├── phone.test.ts
├── templates.test.ts
└── date.test.ts
```

## Excel Template Format

The Excel file should have the following columns:

| TaskType | TemplateHe | TemplateEn | Variables |
|----------|------------|------------|-----------|
| reminder | שלום {{name}}, תזכורת לתאריך {{date}} | Hello {{name}}, reminder for {{date}} | name,date |

Variables can use either `{{var}}` or `{var}` syntax.

---

## 📚 Documentation

**Quick Navigation:**

- **[docs/README.md](docs/README.md)** - Documentation index (start here)
- **[docs/README-QUICKSTART.md](docs/README-QUICKSTART.md)** - 5-minute setup guide
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Top 10 issues and solutions
- **[SETUP.md](SETUP.md)** - Detailed configuration guide
- **[RELEASE_NOTES_v2.0.0.md](RELEASE_NOTES_v2.0.0.md)** - 🆕 Perfect Manual Workflow Replication
- **[TESTING.md](TESTING.md)** - End-to-end testing guide
- **[docs/MACOS_SIGNING_NOTES.md](docs/MACOS_SIGNING_NOTES.md)** - macOS security guide
- **[docs/SECURITY_HARDENING.md](docs/SECURITY_HARDENING.md)** - Security features
- **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)** - Technical deep-dive & history

---

## License

MIT

