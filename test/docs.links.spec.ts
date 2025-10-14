/**
 * Documentation Links Validation
 * Ensures all documentation links are valid and all referenced commands exist
 */

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * Extract local file links from markdown content
 */
function extractLocalLinks(content: string): string[] {
  const links: string[] = [];
  
  // Match markdown links: [text](path)
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = linkRegex.exec(content)) !== null) {
    const link = match[2];
    
    // Skip external URLs, anchors, and mailto links
    if (
      !link.startsWith('http://') &&
      !link.startsWith('https://') &&
      !link.startsWith('#') &&
      !link.startsWith('mailto:')
    ) {
      links.push(link);
    }
  }
  
  return links;
}

/**
 * Extract command references from markdown (backtick commands)
 */
function extractCommands(content: string): string[] {
  const commands: string[] = [];
  
  // Match commands like: automessager doctor, automessager verify, etc.
  const commandRegex = /`automessager\s+([a-z:-]+)`/g;
  let match;
  
  while ((match = commandRegex.exec(content)) !== null) {
    commands.push(match[1]);
  }
  
  return [...new Set(commands)]; // Deduplicate
}

/**
 * Known CLI commands from bin/automessager.ts
 */
const VALID_COMMANDS = [
  'init',
  'verify',
  'verify:mapping',
  'doctor',
  'support-bundle',
  'dry-run',
  'run',
  'version',
];

describe('Documentation Links', () => {
  const docsToCheck = [
    'README.md',
    'SETUP.md',
    'TROUBLESHOOTING.md',
    'RELEASE_NOTES_v1.0.0.md',
    'docs/README-QUICKSTART.md',
    'docs/MACOS_SIGNING_NOTES.md',
  ];
  
  for (const docPath of docsToCheck) {
    describe(docPath, () => {
      it('should exist', async () => {
        await expect(fs.access(docPath)).resolves.not.toThrow();
      });
      
      it('should have valid local file links', async () => {
        const content = await fs.readFile(docPath, 'utf-8');
        const links = extractLocalLinks(content);
        
        const invalidLinks: string[] = [];
        
        for (const link of links) {
          // Resolve relative to the doc's directory
          const docDir = path.dirname(docPath);
          const resolvedPath = path.resolve(docDir, link);
          
          try {
            await fs.access(resolvedPath);
          } catch {
            // Check if it's a known optional file or anchor link
            const optional = [
              'LICENSE',
              '.env',
              '.env.example',
              'massege_maping.xlsx',
            ];
            
            const isAnchor = link.includes('#');
            const isOptional = optional.some(o => link.includes(o));
            
            if (!isOptional && !isAnchor) {
              invalidLinks.push(`${link} -> ${resolvedPath}`);
            }
          }
        }
        
        if (invalidLinks.length > 0) {
          console.log(`Invalid links in ${docPath}:`);
          invalidLinks.forEach(l => console.log(`  - ${l}`));
        }
        
        expect(invalidLinks).toEqual([]);
      });
      
      it('should reference only valid CLI commands', async () => {
        const content = await fs.readFile(docPath, 'utf-8');
        const commands = extractCommands(content);
        
        const invalidCommands: string[] = [];
        
        for (const cmd of commands) {
          if (!VALID_COMMANDS.includes(cmd)) {
            invalidCommands.push(cmd);
          }
        }
        
        if (invalidCommands.length > 0) {
          console.log(`Invalid commands in ${docPath}:`);
          invalidCommands.forEach(c => console.log(`  - automessager ${c}`));
        }
        
        expect(invalidCommands).toEqual([]);
      });
    });
  }
});

describe('Required Files', () => {
  const requiredFiles = [
    'README.md',
    'SETUP.md',
    'TROUBLESHOOTING.md',
    'RELEASE_NOTES_v1.0.0.md',
    'package.json',
    'tsconfig.json',
    'docs/README-QUICKSTART.md',
    'docs/MACOS_SIGNING_NOTES.md',
    'tools/verify-mapping.cmd',
    'tools/verify-mapping.sh',
    'tools/smoke.cmd',
    'tools/smoke.sh',
    'scripts/windows/Create-DesktopShortcut.ps1',
    'scripts/windows/Install-Task.ps1',
    'scripts/windows/Uninstall-Task.ps1',
    'scripts/windows/Start-AutoMessager.ps1',
    'scripts/macos/start.sh',
    'scripts/package_client_kit.ts',
    'scripts/release_check.ts',
  ];
  
  for (const file of requiredFiles) {
    it(`should have ${file}`, async () => {
      await expect(fs.access(file)).resolves.not.toThrow();
    });
  }
});

describe('CLI Help Output', () => {
  it('should list all documented commands', async () => {
    // This is a sanity check to ensure we didn't forget any commands
    const readmePath = 'README.md';
    const readme = await fs.readFile(readmePath, 'utf-8');
    
    for (const cmd of VALID_COMMANDS) {
      // Skip version as it might not be in examples
      if (cmd === 'version') continue;
      
      const mentioned = readme.includes(`automessager ${cmd}`);
      expect(mentioned, `Command "${cmd}" should be documented in README`).toBe(true);
    }
  });
});

describe('Quick Reference Tables', () => {
  it('should have command reference in README-QUICKSTART', async () => {
    const quickstart = await fs.readFile('docs/README-QUICKSTART.md', 'utf-8');
    
    // Check for command reference table or list
    const hasCommandRef = 
      quickstart.includes('automessager init') &&
      quickstart.includes('automessager doctor') &&
      quickstart.includes('automessager verify') &&
      quickstart.includes('automessager dry-run') &&
      quickstart.includes('automessager run');
    
    expect(hasCommandRef, 'Quickstart should reference main commands').toBe(true);
  });
  
  it('should have top issues in TROUBLESHOOTING', async () => {
    const troubleshooting = await fs.readFile('TROUBLESHOOTING.md', 'utf-8');
    
    // Check for common issues
    const hasCommonIssues = 
      troubleshooting.includes('Excel file not found') ||
      troubleshooting.includes('Salesforce login failed') ||
      troubleshooting.includes('Glassix auth');
    
    expect(hasCommonIssues, 'Troubleshooting should cover common issues').toBe(true);
  });
});

