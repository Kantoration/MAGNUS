import { getLogger } from './logger.js';
import { getApprovedTemplates, type GlassixTemplate } from './glassix.js';

const logger = getLogger();

export interface TemplateMatch {
  template: GlassixTemplate;
  score: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  reason: string;
}

/**
 * Cache for Glassix templates (refreshed periodically)
 */
let templateCache: { templates: GlassixTemplate[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 3600000; // 1 hour

/**
 * Get cached templates or fetch new ones
 */
async function getCachedTemplates(): Promise<GlassixTemplate[]> {
  const now = Date.now();
  
  if (templateCache && (now - templateCache.fetchedAt) < CACHE_TTL_MS) {
    logger.debug({ count: templateCache.templates.length }, 'Using cached Glassix templates');
    return templateCache.templates;
  }
  
  const templates = await getApprovedTemplates();
  templateCache = { templates, fetchedAt: now };
  
  return templates;
}

/**
 * Find best matching Glassix template for message content
 * Returns null if no suitable match (system should skip task)
 */
export async function findBestTemplateMatch(
  messageContent: string,
  taskKey: string
): Promise<TemplateMatch | null> {
  const templates = await getCachedTemplates();
  
  if (templates.length === 0) {
    logger.warn('No Glassix templates available for matching');
    return null;
  }

  const matches: TemplateMatch[] = [];
  
  for (const template of templates) {
    const score = calculateSimilarity(messageContent, template.content, taskKey, template.name);
    
    if (score >= 0.6) { // Minimum 60% similarity required
      matches.push({
        template,
        score,
        confidence: getConfidence(score),
        reason: explainMatch(score, messageContent, template)
      });
    }
  }

  if (matches.length === 0) {
    logger.warn(
      { 
        taskKey, 
        messagePreview: messageContent.substring(0, 100),
        availableTemplates: templates.length
      }, 
      'No suitable Glassix template match found'
    );
    return null;
  }

  // Sort by score descending and return best match
  matches.sort((a, b) => b.score - a.score);
  const bestMatch = matches[0];
  
  logger.debug(
    {
      taskKey,
      templateName: bestMatch.template.name,
      score: bestMatch.score,
      confidence: bestMatch.confidence
    },
    'Template match found'
  );
  
  return bestMatch;
}

/**
 * Calculate similarity between message and template
 * Uses multiple factors: content similarity, task name match, variable compatibility
 */
function calculateSimilarity(
  messageContent: string,
  templateContent: string,
  taskKey: string,
  templateName: string
): number {
  // Normalize for comparison (remove variables, trim, lowercase)
  const normalizedMessage = normalizeForComparison(messageContent);
  const normalizedTemplate = normalizeForComparison(templateContent);
  
  // 1. Content similarity - main factor
  const contentScore = textSimilarity(normalizedMessage, normalizedTemplate);
  
  // 2. Task/template name similarity
  const nameScore = textSimilarity(
    normalizeText(taskKey),
    normalizeText(templateName)
  );
  
  // 3. Variable compatibility
  const variableScore = checkVariableCompatibility(messageContent, templateContent);
  
  // Prefer name-key clues when content is very short (some templates are short)
  const contentIsShort = normalizedTemplate.length < 80;
  const contentW = contentIsShort ? 0.55 : 0.7;
  const nameW = contentIsShort ? 0.35 : 0.2;
  const varW = 0.1;
  
  return (contentScore * contentW) + (nameScore * nameW) + (variableScore * varW);
}

/**
 * Remove Hebrew diacritics (niqqud) and punctuation marks
 */
function stripHebrewMarks(s: string): string {
  // Remove Hebrew diacritics (niqqud) and punctuation class \p{M}
  return s.normalize('NFKD').replace(/[\u0591-\u05C7]/g, '');
}

/**
 * Normalize text for comparison (remove variables, punctuation, extra spaces)
 */
function normalizeForComparison(text: string): string {
  return stripHebrewMarks(
    text
      .replace(/\{\{[^}]+\}\}/g, 'VAR') // Replace {{var}} with placeholder
      .replace(/\{[^}]+\}/g, 'VAR')     // Replace {var} with placeholder
      .replace(/[^\p{L}\p{N}\s]/gu, ' ') // Remove punctuation (Unicode-aware)
      .replace(/\s+/g, ' ')             // Normalize spaces
      .toLowerCase()
      .trim()
  );
}

/**
 * Normalize text (lowercase, remove punctuation)
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate text similarity using Levenshtein-based approach
 */
function textSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1.0;
  if (!str1 || !str2) return 0;
  
  // Use simpler approach for long strings
  if (str1.length > 500 || str2.length > 500) {
    return wordOverlapSimilarity(str1, str2);
  }
  
  const distance = levenshteinDistance(str1, str2);
  const maxLength = Math.max(str1.length, str2.length);
  
  return 1 - (distance / maxLength);
}

/**
 * Word-based similarity for longer texts
 */
function wordOverlapSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  
  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word)) overlap++;
  }
  
  const total = Math.max(words1.size, words2.size);
  return total === 0 ? 0 : overlap / total;
}

/**
 * Levenshtein distance implementation
 */
function levenshteinDistance(str1: string, str2: string): number {
  const matrix: number[][] = [];
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      const cost = str1[j - 1] === str2[i - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,      // deletion
        matrix[i][j - 1] + 1,      // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }
  
  return matrix[str2.length][str1.length];
}

/**
 * Check if variables in both texts are compatible
 */
function checkVariableCompatibility(message: string, template: string): number {
  const messageVars = extractVariables(message);
  const templateVars = extractVariables(template);
  
  if (templateVars.length === 0 && messageVars.length === 0) return 1.0;
  if (templateVars.length === 0) return 0.8; // Template has no vars but message does
  
  let matches = 0;
  for (const templateVar of templateVars) {
    if (messageVars.includes(templateVar)) {
      matches++;
    }
  }
  
  return templateVars.length > 0 ? matches / templateVars.length : 0;
}

/**
 * Extract variable names from text
 */
function extractVariables(text: string): string[] {
  const vars: string[] = [];
  
  // Match {{var}} and {var}
  const matches = text.match(/\{\{?([^}]+)\}\}?/g) || [];
  
  for (const match of matches) {
    const varName = match.replace(/\{|\}/g, '').trim();
    vars.push(varName);
  }
  
  return [...new Set(vars)]; // Remove duplicates
}

/**
 * Get confidence level based on score
 */
function getConfidence(score: number): 'HIGH' | 'MEDIUM' | 'LOW' {
  if (score >= 0.85) return 'HIGH';
  if (score >= 0.7) return 'MEDIUM';
  return 'LOW';
}

/**
 * Explain why this template matched
 */
function explainMatch(_score: number, message: string, template: GlassixTemplate): string {
  const reasons: string[] = [];
  
  const contentSim = textSimilarity(
    normalizeForComparison(message),
    normalizeForComparison(template.content)
  );
  
  if (contentSim >= 0.8) reasons.push('high content similarity');
  if (contentSim >= 0.6 && contentSim < 0.8) reasons.push('moderate content similarity');
  
  const varCompat = checkVariableCompatibility(message, template.content);
  if (varCompat >= 0.8) reasons.push('compatible variables');
  
  return reasons.length > 0 ? reasons.join(', ') : 'similarity score';
}

/**
 * Rank all templates by similarity (without cutoff)
 * Used for debugging why templates don't match
 */
export async function rankTemplates(
  messageContent: string,
  taskKey: string
): Promise<TemplateMatch[]> {
  const templates = await getCachedTemplates();
  
  if (templates.length === 0) {
    return [];
  }

  const matches: TemplateMatch[] = [];
  
  for (const template of templates) {
    const score = calculateSimilarity(messageContent, template.content, taskKey, template.name);
    
    matches.push({
      template,
      score,
      confidence: getConfidence(score),
      reason: explainMatch(score, messageContent, template)
    });
  }

  // Sort by score descending
  matches.sort((a, b) => b.score - a.score);
  return matches;
}

/**
 * Clear template cache (for testing or manual refresh)
 */
export function clearTemplateCache(): void {
  templateCache = null;
  logger.debug('Template cache cleared');
}
