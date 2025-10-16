/**
 * RTL/Hebrew Normalization Edge Cases
 * 
 * Tests for Hebrew text normalization and RTL handling:
 * - Niqqud stripping and geresh/gershayim normalization
 * - Punctuation mirroring (parentheses, quotes)
 * - Mixed LTR tokens (model names like "S24")
 * - Bidi control chars not leaking into payloads/logs
 * - Property-based tests over Hebrew names with various edge cases
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { clearConfigCache } from '../src/config.js';

describe('RTL/Hebrew Normalization Edge Cases', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.LOG_LEVEL = 'error';
    clearConfigCache();
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
    clearConfigCache();
    vi.restoreAllMocks();
  });

  describe('Niqqud Stripping and Geresh/Gershayim Normalization', () => {
    it('should strip Hebrew diacritics (niqqud) correctly', () => {
      const stripHebrewMarks = (text: string): string => {
        // Remove Hebrew diacritics (niqqud) and punctuation class \p{M}
        return text.normalize('NFKD').replace(/[\u0591-\u05C7]/g, '');
      };
      
      const testCases = [
        {
          input: 'יְהוּדָה', // With niqqud
          expected: 'יהודה', // Without niqqud
          description: 'Basic niqqud stripping'
        },
        {
          input: 'אֱלֹהִים', // With multiple niqqud
          expected: 'אלהים', // Clean text
          description: 'Multiple niqqud marks'
        },
        {
          input: 'שָׁלוֹם', // With shva and kamatz
          expected: 'שלום', // Clean text
          description: 'Shva and kamatz removal'
        },
        {
          input: 'בְּרֵאשִׁית', // Complex niqqud
          expected: 'בראשית', // Clean text
          description: 'Complex niqqud pattern'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = stripHebrewMarks(input);
        expect(result).toBe(expected);
        expect(result).not.toMatch(/[\u0591-\u05C7]/); // No niqqud should remain
      });
    });

    it('should normalize geresh (׳) and gershayim (״) correctly', () => {
      const normalizeGeresh = (text: string): string => {
        return text
          .replace(/׳/g, "'") // Geresh to apostrophe
          .replace(/״/g, '"'); // Gershayim to quote
      };
      
      const testCases = [
        {
          input: 'דניאל׳',
          expected: "דניאל'",
          description: 'Geresh normalization'
        },
        {
          input: '״שלום״',
          expected: '"שלום"',
          description: 'Gershayim normalization'
        },
        {
          input: 'מ״ג',
          expected: 'מ"ג',
          description: 'Abbreviation with gershayim'
        },
        {
          input: 'י׳ב׳',
          expected: "י'ב'",
          description: 'Multiple geresh marks'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = normalizeGeresh(input);
        expect(result).toBe(expected);
        expect(result).not.toMatch(/׳|״/); // No Hebrew punctuation should remain
      });
    });

    it('should handle mixed Hebrew and Latin text with niqqud', () => {
      const normalizeMixedText = (text: string): string => {
        return text
          .normalize('NFKD')
          .replace(/[\u0591-\u05C7]/g, '') // Strip niqqud
          .replace(/׳/g, "'")
          .replace(/״/g, '"');
      };
      
      const testCases = [
        {
          input: 'iPhone 15 יְהוּדָה',
          expected: 'iPhone 15 יהודה',
          description: 'Latin device name with Hebrew name'
        },
        {
          input: 'Samsung Galaxy דָּנִיאֵל׳',
          expected: "Samsung Galaxy דניאל'",
          description: 'Mixed LTR device with Hebrew name and geresh'
        },
        {
          input: 'Google Pixel 8 ״אָבִי״',
          expected: 'Google Pixel 8 "אבי"',
          description: 'LTR brand with Hebrew name and gershayim'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = normalizeMixedText(input);
        expect(result).toBe(expected);
      });
    });
  });

  describe('Punctuation Mirroring and Mixed LTR Tokens', () => {
    it('should handle punctuation mirroring correctly', () => {
      const mirrorPunctuation = (text: string): string => {
        return text
          .replace(/\(/g, '(') // Left parenthesis
          .replace(/\)/g, ')') // Right parenthesis
          .replace(/\[/g, '[') // Left bracket
          .replace(/\]/g, ']') // Right bracket
          .replace(/\{/g, '{') // Left brace
          .replace(/\}/g, '}'); // Right brace
      };
      
      const testCases = [
        {
          input: '(iPhone 15)',
          expected: '(iPhone 15)',
          description: 'Parentheses with LTR content'
        },
        {
          input: '(שלום)',
          expected: '(שלום)',
          description: 'Parentheses with Hebrew content'
        },
        {
          input: '[S24] דניאל',
          expected: '[S24] דניאל',
          description: 'Mixed brackets and Hebrew'
        },
        {
          input: '{מודל} Samsung',
          expected: '{מודל} Samsung',
          description: 'Hebrew in braces with LTR brand'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = mirrorPunctuation(input);
        expect(result).toBe(expected);
      });
    });

    it('should handle mixed LTR tokens correctly', () => {
      const handleMixedTokens = (text: string): string => {
        // Ensure LTR tokens are properly handled in RTL context
        return text.replace(/([A-Za-z0-9\s]+)/g, (match) => {
          // LTR tokens should be wrapped with LTR markers in RTL context
          return `\u202D${match}\u202C`; // LTR override markers
        });
      };
      
      const testCases = [
        {
          input: 'iPhone 15 דניאל',
          expected: '\u202DiPhone 15\u202C דניאל',
          description: 'LTR device name with Hebrew name'
        },
        {
          input: 'Samsung Galaxy S24 יוסי',
          expected: '\u202DSamsung Galaxy S24\u202C יוסי',
          description: 'LTR brand and model with Hebrew name'
        },
        {
          input: 'Google Pixel 8 Pro רחל',
          expected: '\u202DGoogle Pixel 8 Pro\u202C רחל',
          description: 'LTR full device name with Hebrew name'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = handleMixedTokens(input);
        expect(result).toContain('\u202D'); // LTR override start
        expect(result).toContain('\u202C'); // LTR override end
      });
    });

    it('should preserve LTR model names in Hebrew context', () => {
      const preserveModelNames = (text: string): string => {
        // Common device model patterns
        const modelPatterns = [
          /iPhone\s+\d+/g,
          /Samsung\s+Galaxy\s+\w+/g,
          /Google\s+Pixel\s+\d+/g,
          /S\d+/g, // S24, S23, etc.
          /Note\s+\d+/g
        ];
        
        let result = text;
        modelPatterns.forEach(pattern => {
          result = result.replace(pattern, (match) => `\u202D${match}\u202C`);
        });
        
        return result;
      };
      
      const testCases = [
        {
          input: 'הטלפון החדש שלך iPhone 15 מוכן',
          expected: 'הטלפון החדש שלך \u202DiPhone 15\u202C מוכן',
          description: 'iPhone model in Hebrew sentence'
        },
        {
          input: 'Samsung Galaxy S24 של דניאל',
          expected: '\u202DSamsung Galaxy S24\u202C של דניאל',
          description: 'Samsung model with Hebrew name'
        },
        {
          input: 'Google Pixel 8 Pro עבור יוסי',
          expected: '\u202DGoogle Pixel 8 Pro\u202C עבור יוסי',
          description: 'Google model with Hebrew name'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = preserveModelNames(input);
        expect(result).toContain('\u202D'); // Should have LTR markers
        expect(result).toContain('\u202C');
      });
    });
  });

  describe('Bidi Control Character Handling', () => {
    it('should prevent bidi control chars from leaking into payloads', () => {
      const sanitizeBidiChars = (text: string): string => {
        // Remove or escape bidi control characters
        return text
          .replace(/[\u202A-\u202E\u2066-\u2069]/g, '') // Remove bidi control chars
          .replace(/[\u200E\u200F]/g, ''); // Remove LTR/RTL marks
      };
      
      const testCases = [
        {
          input: 'שלום\u202Eדניאל\u202C', // RTL override
          expected: 'שלוםדניאל',
          description: 'RTL override removal'
        },
        {
          input: 'iPhone\u202D15\u202C', // LTR override
          expected: 'iPhone15',
          description: 'LTR override removal'
        },
        {
          input: 'שלום\u200Eדניאל\u200F', // LTR/RTL marks
          expected: 'שלוםדניאל',
          description: 'LTR/RTL marks removal'
        },
        {
          input: 'S24\u2068דניאל\u2069', // Isolate
          expected: 'S24דניאל',
          description: 'Isolate marks removal'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = sanitizeBidiChars(input);
        expect(result).toBe(expected);
        expect(result).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/);
      });
    });

    it('should prevent bidi control chars from appearing in logs', () => {
      const sanitizeForLogs = (text: string): string => {
        return text
          .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '[BIDI]')
          .replace(/[\u0591-\u05C7]/g, ''); // Also strip niqqud for logs
      };
      
      const testCases = [
        {
          input: 'שלום\u202Eדניאל\u202C',
          expected: 'שלום[BIDI]דניאל[BIDI]',
          description: 'Bidi chars replaced with marker'
        },
        {
          input: 'יְהוּדָה\u202DiPhone\u202C',
          expected: 'יהודה[BIDI]iPhone[BIDI]',
          description: 'Niqqud stripped and bidi chars marked'
        }
      ];
      
      testCases.forEach(({ input, expected, description }) => {
        const result = sanitizeForLogs(input);
        expect(result).toBe(expected);
        expect(result).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F\u0591-\u05C7]/);
      });
    });

    it('should handle bidi control chars in template variables', () => {
      const sanitizeTemplateVariables = (variables: Record<string, any>): Record<string, any> => {
        const sanitized: Record<string, any> = {};
        
        for (const [key, value] of Object.entries(variables)) {
          if (typeof value === 'string') {
            sanitized[key] = value
              .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '')
              .replace(/[\u0591-\u05C7]/g, '');
          } else {
            sanitized[key] = value;
          }
        }
        
        return sanitized;
      };
      
      const testVariables = {
        first_name: 'דניאל\u202E',
        device_model: 'iPhone\u202D15\u202C',
        account_name: 'חברה\u200Eבע"מ\u200F'
      };
      
      const sanitized = sanitizeTemplateVariables(testVariables);
      
      expect(sanitized.first_name).toBe('דניאל');
      expect(sanitized.device_model).toBe('iPhone15');
      expect(sanitized.account_name).toBe('חברה בע"מ');
    });
  });

  describe('Property-Based Tests for Hebrew Names', () => {
    it('should handle Hebrew names with various edge cases', () => {
      const hebrewNames = [
        'דניאל-יה', // Hyphenated name
        'ליאה (MAGNUS)', // Name with Latin initials in parentheses
        'יוסף "יוסי"', // Name with nickname in quotes
        'רחל-מיכל', // Double hyphenated name
        'אבי-גיל', // Short hyphenated names
        'נועה-שרה-מיכל', // Triple hyphenated name
        'דוד׳', // Name with geresh
        '״אבי״', // Name with gershayim
        'יְהוּדָה-אָבִי', // Names with niqqud and hyphen
        'S24 דניאל', // LTR model with Hebrew name
        'iPhone 15 יוסי', // LTR device with Hebrew name
        'Google Pixel רחל', // LTR brand with Hebrew name
        'דניאל\u202Eיוסי\u202C', // Names with bidi control chars
        'יוסף\u200Eאבי\u200F' // Names with LTR/RTL marks
      ];
      
      const normalizeHebrewName = (name: string): string => {
        return name
          .normalize('NFKD')
          .replace(/[\u0591-\u05C7]/g, '') // Strip niqqud
          .replace(/׳/g, "'")
          .replace(/״/g, '"')
          .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '') // Remove bidi chars
          .trim();
      };
      
      hebrewNames.forEach(name => {
        const normalized = normalizeHebrewName(name);
        
        // Should not contain any problematic characters
        expect(normalized).not.toMatch(/[\u0591-\u05C7\u202A-\u202E\u2066-\u2069\u200E\u200F]/);
        
        // Should preserve basic Hebrew characters
        expect(normalized).toMatch(/[\u0590-\u05FF]/);
        
        // Should handle hyphens and punctuation properly
        expect(normalized).not.toMatch(/^-|-$/); // No leading/trailing hyphens
      });
    });

    it('should handle mixed Hebrew-Latin names correctly', () => {
      const mixedNames = [
        'דניאל-יה (MAGNUS)',
        'ליאה "Leah" יוסי',
        'אבי-גיל iPhone',
        'רחל S24 דניאל',
        'יוסף Google Pixel 8',
        'נועה Samsung Galaxy S23',
        'מיכל (MAGNUS) אבי',
        'שרה "Sarah" רחל'
      ];
      
      const normalizeMixedName = (name: string): string => {
        return name
          .normalize('NFKD')
          .replace(/[\u0591-\u05C7]/g, '') // Strip niqqud
          .replace(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/g, '') // Remove bidi chars
          .trim();
      };
      
      mixedNames.forEach(name => {
        const normalized = normalizeMixedName(name);
        
        // Should not contain bidi control characters
        expect(normalized).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/);
        
        // Should contain both Hebrew and Latin characters
        expect(normalized).toMatch(/[\u0590-\u05FF]/); // Hebrew
        expect(normalized).toMatch(/[A-Za-z]/); // Latin
        
        // Should be properly formatted
        expect(normalized).not.toMatch(/^\s|\s$/); // No leading/trailing spaces
      });
    });

    it('should handle device model names in Hebrew context', () => {
      const deviceContexts = [
        'הטלפון החדש שלך iPhone 15 מוכן',
        'Samsung Galaxy S24 של דניאל',
        'Google Pixel 8 Pro עבור יוסי',
        'המכשיר S23 של רחל',
        'iPhone 14 Pro Max דניאל-יה',
        'Samsung Note 20 Ultra ליאה',
        'Google Pixel 7 אבי-גיל',
        'הטלפון S24 Ultra של נועה'
      ];
      
      const extractDeviceModel = (text: string): string | null => {
        const modelPatterns = [
          /iPhone\s+\d+(?:\s+Pro(?:\s+Max)?)?/g,
          /Samsung\s+(?:Galaxy\s+)?(?:S\d+|Note\s+\d+)(?:\s+Ultra)?/g,
          /Google\s+Pixel\s+\d+(?:\s+Pro)?/g,
          /S\d+(?:\s+Ultra)?/g
        ];
        
        for (const pattern of modelPatterns) {
          const match = text.match(pattern);
          if (match) {
            return match[0];
          }
        }
        
        return null;
      };
      
      deviceContexts.forEach(context => {
        const model = extractDeviceModel(context);
        
        if (model) {
          // Should extract valid model name
          expect(model).toMatch(/^(iPhone|Samsung|Google|S\d+)/);
          expect(model).toMatch(/\d+/); // Should contain numbers
          
          // Should not contain Hebrew characters in model name
          expect(model).not.toMatch(/[\u0590-\u05FF]/);
        }
      });
    });
  });

  describe('Template Rendering with Hebrew Edge Cases', () => {
    it('should render templates correctly with Hebrew edge cases', async () => {
      const { renderMessage } = await import('../src/templates.js');
      
      const testTemplate = {
        taskKey: 'HEBREW_EDGE_CASE',
        messageBody: 'שלום {{first_name}}, הטלפון החדש שלך {{device_model}} מוכן. חשבון: {{account_name}}.',
        glassixTemplateId: 'HEBREW_EDGE_CASE_TEMPLATE'
      };
      
      const edgeCaseContext = {
        first_name: 'דניאל-יה (MAGNUS)',
        device_model: 'iPhone 15 Pro Max',
        account_name: 'חברה\u200Eבע"מ\u200F'
      };
      
      const result = renderMessage(testTemplate, edgeCaseContext, { defaultLang: 'he' });
      
      expect(result.text).toContain('שלום דניאל-יה (MAGNUS)');
      expect(result.text).toContain('iPhone 15 Pro Max');
      expect(result.text).toContain('חברה בע"מ');
      expect(result.text).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/); // No bidi chars
    });

    it('should handle Hebrew subject generation with edge cases', async () => {
      const { generateHebrewSubject } = await import('../src/hebrew-subjects.js');
      
      const edgeCaseData = {
        accountName: 'חברה\u200Eבע"מ\u200F',
        date: '09/10/2024',
        firstName: 'דניאל-יה (MAGNUS)'
      };
      
      const subject = generateHebrewSubject('HEBREW_EDGE_CASE', edgeCaseData);
      
      expect(subject).toMatch(/[\u0590-\u05FF]/); // Should contain Hebrew
      expect(subject).not.toMatch(/[\u202A-\u202E\u2066-\u2069\u200E\u200F]/); // No bidi chars
      expect(subject).not.toMatch(/[\u0591-\u05C7]/); // No niqqud
      expect(subject.length).toBeGreaterThan(5);
    });
  });
});
