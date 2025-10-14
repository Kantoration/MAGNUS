# macOS Code Signing & Gatekeeper Guide

**For AutoMessager v1.0.0**

---

## 🍎 Overview

macOS includes security features (Gatekeeper) that prevent unsigned binaries from running. This guide explains how to:

1. **Ad-hoc sign** the binary for local use (free, immediate)
2. **Remove quarantine** for downloaded binaries
3. **Developer ID sign** for distribution (requires Apple Developer Program)
4. **Notarize** the binary for seamless user experience (optional, requires Developer ID)

---

## ⚡ Quick Start (For End Users)

If you downloaded `automessager-mac` and macOS is blocking it:

### Step 1: Remove Quarantine Attribute

```bash
# Navigate to the folder containing automessager-mac
cd /path/to/automessager

# Remove quarantine flag
xattr -dr com.apple.quarantine ./automessager-mac

# Verify it was removed
xattr -l ./automessager-mac
# Should show no quarantine attribute
```

### Step 2: Ad-hoc Code Sign (Optional but Recommended)

```bash
# Sign with ad-hoc signature
codesign --force --deep --sign - ./automessager-mac

# Verify signature
codesign --verify --verbose ./automessager-mac
# Should show: valid on disk

# Check signature details
codesign -dv ./automessager-mac
```

### Step 3: Run the Binary

```bash
# Make executable (if not already)
chmod +x ./automessager-mac

# Test it works
./automessager-mac version

# Run doctor to verify setup
./automessager-mac doctor
```

**Expected Output:**
```
📦 AutoMessager
Version: 1.0.0
Build Date: 2025-10-14
Node: v20.x.x
Platform: darwin (x64)
```

---

## 🔐 For Developers: Signing for Distribution

If you're building binaries to distribute to clients:

### Option 1: Ad-hoc Signing (Internal Distribution)

**Use Case:** Internal teams, trusted users

```bash
# After building the binary
npm run package:mac

# Ad-hoc sign
codesign --force --deep --sign - ./build/bin/automessager-mac

# Verify
codesign --verify --verbose ./build/bin/automessager-mac
```

**Pros:**
- ✅ Free, no Apple Developer account needed
- ✅ Immediate signing
- ✅ Satisfies basic security checks

**Cons:**
- ❌ Users still need to remove quarantine manually
- ❌ Not suitable for public distribution
- ❌ Gatekeeper warnings on first run

---

### Option 2: Developer ID Signing (Recommended for Clients)

**Use Case:** External clients, production deployment

**Prerequisites:**
- Apple Developer Program membership ($99/year)
- Developer ID Application certificate installed in Keychain

#### Step 1: Get Developer ID Certificate

1. Visit [Apple Developer Portal](https://developer.apple.com/account)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Create **Developer ID Application** certificate
4. Download and install in **Keychain Access**

#### Step 2: Find Your Certificate Identity

```bash
# List available signing identities
security find-identity -v -p codesigning

# Look for output like:
# 1) ABC123DEF456 "Developer ID Application: Your Name (TEAM_ID)"
```

Copy the identity string (e.g., `"Developer ID Application: Your Name (TEAM_ID)"`)

#### Step 3: Sign the Binary

```bash
# Build the binary
npm run package:mac

# Sign with Developer ID
codesign --force --deep --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --options runtime \
  --timestamp \
  ./build/bin/automessager-mac

# Verify signature
codesign --verify --deep --strict --verbose=2 ./build/bin/automessager-mac

# Check signature details
spctl -a -vv ./build/bin/automessager-mac
# Should show: accepted
```

**Important Flags:**
- `--options runtime`: Enable hardened runtime (required for notarization)
- `--timestamp`: Add secure timestamp (recommended)
- `--deep`: Sign nested code recursively

#### Step 4: Create Entitlements (If Needed)

If the binary needs specific capabilities (network, file access), create `entitlements.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

Then sign with entitlements:

```bash
codesign --force --deep --sign "Developer ID Application: Your Name (TEAM_ID)" \
  --options runtime \
  --timestamp \
  --entitlements entitlements.plist \
  ./build/bin/automessager-mac
```

---

### Option 3: Notarization (Best User Experience)

**Use Case:** Public distribution, zero friction for users

Notarization submits your binary to Apple for automated security scanning. Once notarized, macOS trusts it immediately.

#### Prerequisites

- Developer ID signed binary (from Option 2)
- Apple ID with app-specific password
- Xcode Command Line Tools installed

#### Step 1: Create App-Specific Password

1. Visit [appleid.apple.com](https://appleid.apple.com)
2. Sign in with your Apple ID
3. Navigate to **Security** → **App-Specific Passwords**
4. Generate password for "Notarization"
5. Save the password (you'll use it once)

#### Step 2: Store Credentials in Keychain

```bash
# Store notarization credentials
xcrun notarytool store-credentials "AC_PASSWORD" \
  --apple-id "your-email@example.com" \
  --team-id "YOUR_TEAM_ID" \
  --password "xxxx-xxxx-xxxx-xxxx"

# Replace:
# - your-email@example.com: Your Apple ID
# - YOUR_TEAM_ID: From Developer Portal
# - xxxx-xxxx-xxxx-xxxx: App-specific password
```

#### Step 3: Package Binary as ZIP

```bash
# Notarization requires a zip or DMG
cd build/bin
zip automessager-mac.zip automessager-mac
```

#### Step 4: Submit for Notarization

```bash
# Submit to Apple
xcrun notarytool submit automessager-mac.zip \
  --keychain-profile "AC_PASSWORD" \
  --wait

# This will:
# 1. Upload the binary to Apple
# 2. Wait for automated scanning (usually 2-5 minutes)
# 3. Show results
```

**Expected Output:**
```
Submitting automessager-mac.zip...
Submission ID: abc123-def456-ghi789
Successfully uploaded file
  id: abc123-def456-ghi789
  path: automessager-mac.zip
  
Waiting for processing...
Current status: In Progress........
Current status: Accepted

Successfully notarized: automessager-mac.zip
  id: abc123-def456-ghi789
  status: Accepted
```

#### Step 5: Staple Notarization Ticket

```bash
# Extract notarized binary
unzip -o automessager-mac.zip

# Staple the ticket (embeds proof of notarization)
xcrun stapler staple automessager-mac

# Verify stapling
xcrun stapler validate automessager-mac
# Should show: The validate action worked!

# Verify Gatekeeper acceptance
spctl -a -vv -t install automessager-mac
# Should show: accepted
```

#### Step 6: Distribute the Binary

Now users can run the binary immediately without any warnings or manual steps!

```bash
# Users can just run it
./automessager-mac version
# No quarantine warnings, no security prompts
```

---

## 🛠️ Troubleshooting

### Issue: "automessager-mac cannot be opened because the developer cannot be verified"

**Solution:**

```bash
# Remove quarantine
xattr -dr com.apple.quarantine ./automessager-mac

# Ad-hoc sign
codesign --force --deep --sign - ./automessager-mac

# Run again
./automessager-mac version
```

**Alternative (GUI):**
1. Right-click `automessager-mac` → **Open**
2. Click **Open** in security dialog
3. macOS will remember your choice

---

### Issue: "xcrun: error: invalid active developer path"

**Solution:** Install Xcode Command Line Tools

```bash
xcode-select --install
```

---

### Issue: Signature verification fails

**Check signature:**
```bash
codesign --verify --deep --strict --verbose=2 ./automessager-mac
```

**Common causes:**
- Binary was modified after signing
- Wrong signing identity
- Missing entitlements

**Solution:** Re-sign the binary

```bash
codesign --force --deep --sign - ./automessager-mac
```

---

### Issue: Notarization rejected

**View rejection details:**
```bash
xcrun notarytool log <submission-id> --keychain-profile "AC_PASSWORD"
```

**Common causes:**
- Binary not signed with Developer ID
- Missing hardened runtime flag
- Invalid entitlements
- Suspicious code detected

**Solution:** Check log, fix issues, re-sign, re-submit

---

### Issue: "The binary is not signed at all"

**Verify current signature:**
```bash
codesign -dv ./automessager-mac
```

**If output shows "code object is not signed at all":**
```bash
# Sign it
codesign --force --deep --sign - ./automessager-mac

# Verify again
codesign -dv ./automessager-mac
```

---

## 📋 Quick Reference

### Check if Binary is Signed

```bash
codesign -dv ./automessager-mac
```

### Check if Quarantine Flag Exists

```bash
xattr -l ./automessager-mac | grep quarantine
```

### Remove All Extended Attributes

```bash
xattr -cr ./automessager-mac
```

### Verify Gatekeeper Will Accept Binary

```bash
spctl -a -vv ./automessager-mac
```

### Re-sign After Modification

```bash
codesign --force --deep --sign - ./automessager-mac
```

---

## 🔗 Useful Links

- [Apple Code Signing Guide](https://developer.apple.com/library/archive/documentation/Security/Conceptual/CodeSigningGuide/Introduction/Introduction.html)
- [Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Gatekeeper and Runtime Protection](https://support.apple.com/guide/security/gatekeeper-and-runtime-protection-sec5599b66df/web)
- [Hardened Runtime Entitlements](https://developer.apple.com/documentation/security/hardened_runtime)

---

## 📞 Support

If you encounter signing issues:

1. **Check signature**: `codesign -dv ./automessager-mac`
2. **Check quarantine**: `xattr -l ./automessager-mac`
3. **Check Gatekeeper**: `spctl -a -vv ./automessager-mac`
4. **Try ad-hoc signing**: `codesign --force --deep --sign - ./automessager-mac`
5. **Create support bundle**: `./automessager-mac support-bundle`

For persistent issues, include the output of the above commands when requesting support.

---

**AutoMessager v1.0.0**  
*Production-Ready ✅*

