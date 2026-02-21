import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface NT8Pattern {
  id: number;
  name: string;
  category: string;
  description: string;
  template: string;
  rules: string[];
  critical: boolean;
}

export interface NT8Types {
  indicators: Record<string, any>;
  drawMethods: Record<string, any>;
  enums: Record<string, string[]>;
  strategyMethods: Record<string, string>;
  helperMethods: Record<string, string>;
  commonBrushes: string[];
  coreProperties: Record<string, string>;
  requiredUsings: Record<string, string[]>;
}

export interface NT8Error {
  id: string;
  severity: string;
  title: string;
  description: string;
  detection: string;
  fix: string;
  autoFixable: boolean;
}

export interface ScriptInfo {
  filename: string;
  className: string;
  type: 'indicator' | 'strategy';
  description: string;
  code: string;
  indicators: string[];
  lineCount: number;
}

export interface KnowledgeBase {
  patterns: NT8Pattern[];
  types: NT8Types;
  errors: NT8Error[];
  scripts: ScriptInfo[];
}

let _kb: KnowledgeBase | null = null;

function findScriptsDir(): string {
  // Try symlink first, then relative path, then env var
  const candidates = [
    join(__dirname, '..', '..', 'scripts'),
    join(__dirname, '..', '..', '..', 'scripts'),
    process.env['SCRIPTS_DIR'] || ''
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return '';
}

function parseScript(code: string, filename: string): ScriptInfo {
  const classMatch = code.match(/public\s+class\s+(\w+)\s*:\s*(Indicator|Strategy)/);
  const className = classMatch?.[1] || filename.replace('.cs', '');
  const type = classMatch?.[2] === 'Strategy' ? 'strategy' : 'indicator';

  const descMatch = code.match(/Description\s*=\s*@?"([^"]+)"/);
  const description = descMatch?.[1] || '';

  // Detect which indicators are used
  const knownIndicators = [
    'RSI', 'MACD', 'SMA', 'EMA', 'ATR', 'Swing', 'Bollinger', 'Stochastics',
    'VWAP', 'ADX', 'CCI', 'VOL', 'OBV', 'MFI', 'TEMA', 'WMA', 'DonchianChannel',
    'KeltnerChannel', 'ParabolicSAR', 'WilliamsR', 'Momentum', 'ROC', 'DM'
  ];
  const indicators = knownIndicators.filter(ind => {
    const regex = new RegExp(`\\b${ind}\\s*\\(`, 'g');
    return regex.test(code);
  });

  return {
    filename,
    className,
    type,
    description,
    code,
    indicators,
    lineCount: code.split('\n').length
  };
}

export function loadKnowledgeBase(): KnowledgeBase {
  if (_kb) return _kb;

  // Load JSON knowledge files
  const patternsData = JSON.parse(readFileSync(join(__dirname, 'nt8-patterns.json'), 'utf-8'));
  const typesData = JSON.parse(readFileSync(join(__dirname, 'nt8-types.json'), 'utf-8'));
  const errorsData = JSON.parse(readFileSync(join(__dirname, 'nt8-errors.json'), 'utf-8'));

  // Load production scripts
  const scripts: ScriptInfo[] = [];
  const scriptsDir = findScriptsDir();
  if (scriptsDir && existsSync(scriptsDir)) {
    const files = readdirSync(scriptsDir).filter(f => f.endsWith('.cs'));
    for (const file of files) {
      try {
        const code = readFileSync(join(scriptsDir, file), 'utf-8');
        scripts.push(parseScript(code, file));
      } catch {
        // Skip unreadable files
      }
    }
  }

  _kb = {
    patterns: patternsData.patterns as NT8Pattern[],
    types: typesData as NT8Types,
    errors: errorsData.commonErrors as NT8Error[],
    scripts
  };

  return _kb;
}

export function getPatternsByCategory(category: string): NT8Pattern[] {
  const kb = loadKnowledgeBase();
  return kb.patterns.filter(p => p.category === category);
}

export function getCriticalPatterns(): NT8Pattern[] {
  const kb = loadKnowledgeBase();
  return kb.patterns.filter(p => p.critical);
}

export function findRelevantScripts(keywords: string[]): ScriptInfo[] {
  const kb = loadKnowledgeBase();
  const lower = keywords.map(k => k.toLowerCase());

  return kb.scripts
    .map(script => {
      let score = 0;
      for (const kw of lower) {
        if (script.indicators.some(i => i.toLowerCase().includes(kw))) score += 3;
        if (script.className.toLowerCase().includes(kw)) score += 2;
        if (script.description.toLowerCase().includes(kw)) score += 1;
        if (script.code.toLowerCase().includes(kw)) score += 0.5;
      }
      return { script, score };
    })
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.script);
}

export function getScriptByName(name: string): ScriptInfo | undefined {
  const kb = loadKnowledgeBase();
  const lower = name.toLowerCase();
  return kb.scripts.find(s =>
    s.filename.toLowerCase().includes(lower) ||
    s.className.toLowerCase().includes(lower)
  );
}

export function buildGenerationContext(description: string, type?: string): string {
  const kb = loadKnowledgeBase();

  // Extract keywords from description
  const keywords = description
    .toLowerCase()
    .split(/[\s,;.!?]+/)
    .filter(w => w.length > 2);

  // Find relevant patterns
  const criticalPatterns = getCriticalPatterns();
  const relevantScripts = findRelevantScripts(keywords).slice(0, 2);

  // Build context string
  let context = `# NinjaTrader 8 NinjaScript Knowledge Base\n\n`;
  context += `## Script Type: ${type || 'indicator'}\n\n`;

  // Critical patterns
  context += `## Critical Patterns (MUST follow)\n\n`;
  for (const p of criticalPatterns) {
    context += `### ${p.name}\n${p.description}\n\nRules:\n`;
    for (const r of p.rules) context += `- ${r}\n`;
    context += `\nTemplate:\n\`\`\`csharp\n${p.template}\n\`\`\`\n\n`;
  }

  // Available indicators
  context += `## Available NT8 Built-in Indicators\n\n`;
  for (const [name, info] of Object.entries(kb.types.indicators)) {
    const ind = info as any;
    context += `- **${name}**: ${ind.constructor}\n`;
  }

  // Draw methods
  context += `\n## Draw Methods\n\n`;
  for (const [name, info] of Object.entries(kb.types.drawMethods)) {
    const dm = info as any;
    context += `- **${name}**: ${dm.signature}\n`;
  }

  // Common errors to avoid
  context += `\n## Common Errors to AVOID\n\n`;
  for (const err of kb.errors.filter(e => e.severity === 'ERROR')) {
    context += `- **${err.title}**: ${err.description}\n`;
  }

  // Reference scripts
  if (relevantScripts.length > 0) {
    context += `\n## Reference Scripts (use as structural examples)\n\n`;
    for (const script of relevantScripts) {
      context += `### ${script.className} (${script.type}, ${script.lineCount} lines)\n`;
      context += `Uses: ${script.indicators.join(', ')}\n\n`;
      context += `\`\`\`csharp\n${script.code}\n\`\`\`\n\n`;
    }
  }

  // Required usings
  context += `## Required Using Statements\n\n`;
  context += `Always include:\n`;
  for (const u of kb.types.requiredUsings.always) {
    context += `- using ${u};\n`;
  }
  if (type === 'indicator') {
    context += `\nFor indicators, also add:\n`;
    for (const u of kb.types.requiredUsings.ifIndicator) {
      context += `- using ${u};\n`;
    }
  }

  return context;
}
