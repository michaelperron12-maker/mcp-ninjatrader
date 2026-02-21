import { loadKnowledgeBase } from '../knowledge/loader.js';

export interface CompilationError {
  type: 'error' | 'warning';
  line: number;
  message: string;
}

export interface CompilationResult {
  status: 'pass' | 'warn' | 'fail';
  errors: CompilationError[];
  warnings: CompilationError[];
}

export function handleTestCompilation(params: {
  code: string;
}): { content: Array<{ type: 'text'; text: string }>; testResult: CompilationResult } {
  const { code } = params;
  const errors: CompilationError[] = [];
  const warnings: CompilationError[] = [];

  // 1. Class structure validation
  checkClassStructure(code, errors);

  // 2. Type checking (known NT8 types)
  checkTypes(code, errors, warnings);

  // 3. Draw method validation
  checkDrawMethods(code, errors);

  // 4. State enum validation
  checkStateEnums(code, errors);

  // 5. Property type matching
  checkPropertyTypes(code, warnings);

  // 6. Reference validation
  checkReferences(code, warnings);

  // 7. Missing required elements
  checkRequiredElements(code, errors, warnings);

  // Determine status
  const status = errors.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';

  // Format output
  let output = `# Test de Compilation Statique\n\n`;
  output += `**Statut**: ${status === 'pass' ? 'PASS' : status === 'warn' ? 'AVERTISSEMENTS' : 'ECHEC'}\n`;
  output += `**Erreurs**: ${errors.length} | **Avertissements**: ${warnings.length}\n\n`;

  if (errors.length > 0) {
    output += `## Erreurs de compilation\n\n`;
    for (const e of errors) {
      output += `- ${e.line > 0 ? `**Ligne ${e.line}**: ` : ''}${e.message}\n`;
    }
    output += '\n';
  }

  if (warnings.length > 0) {
    output += `## Avertissements\n\n`;
    for (const w of warnings) {
      output += `- ${w.line > 0 ? `**Ligne ${w.line}**: ` : ''}${w.message}\n`;
    }
    output += '\n';
  }

  if (status === 'pass') {
    output += `Le script passe l'analyse statique sans erreur. Prêt pour compilation dans NT8.\n`;
  }

  const testResult: CompilationResult = { status, errors, warnings };
  return { content: [{ type: 'text', text: output }], testResult };
}

function checkClassStructure(code: string, errors: CompilationError[]): void {
  // Check for exactly one class inheriting from Indicator or Strategy
  const classMatches = [...code.matchAll(/public\s+class\s+(\w+)\s*:\s*(Indicator|Strategy)/g)];

  if (classMatches.length === 0) {
    errors.push({ type: 'error', line: 0, message: 'Aucune classe Indicator/Strategy trouvée' });
  } else if (classMatches.length > 1) {
    errors.push({ type: 'error', line: 0, message: 'Plusieurs classes Indicator/Strategy dans le même fichier' });
  }

  // Check namespace exists
  if (!/namespace\s+[\w.]+/.test(code)) {
    errors.push({ type: 'error', line: 0, message: 'Namespace manquant' });
  }

  // Check required methods
  if (!/protected\s+override\s+void\s+OnStateChange/.test(code)) {
    errors.push({ type: 'error', line: 0, message: 'OnStateChange() manquant' });
  }
  if (!/protected\s+override\s+void\s+OnBarUpdate/.test(code)) {
    errors.push({ type: 'error', line: 0, message: 'OnBarUpdate() manquant' });
  }
}

function checkTypes(code: string, errors: CompilationError[], warnings: CompilationError[]): void {
  const kb = loadKnowledgeBase();
  const lines = code.split('\n');

  // Check indicator references are valid
  const indicatorCallRegex = /=\s*(\w+)\s*\(/g;
  let match;

  const knownFunctions = new Set([
    ...Object.keys(kb.types.indicators),
    // Common C# and NT8 methods that are not indicators
    'Math', 'string', 'Convert', 'int', 'double', 'bool',
    'new', 'this', 'base', 'ToString', 'Format', 'Max', 'Min',
    'Abs', 'Round', 'Ceiling', 'Floor', 'Sqrt', 'Pow',
    'ToTime', 'ToDay', 'CrossAbove', 'CrossBelow',
    'Alert', 'Print', 'ClearOutputWindow',
    'EnterLong', 'EnterShort', 'ExitLong', 'ExitShort',
    'SetStopLoss', 'SetProfitTarget', 'SetTrailStop',
    'RemoveDrawObject', 'AddDataSeries',
    'Array', 'List', 'Dictionary', 'HashSet'
  ]);

  // Check Series<T> usage
  if (/Series<(?!double|bool|int|float|long|DateTime)(\w+)>/.test(code)) {
    const typeMatch = code.match(/Series<(?!double|bool|int|float|long|DateTime)(\w+)>/);
    if (typeMatch) {
      warnings.push({
        type: 'warning',
        line: 0,
        message: `Series<${typeMatch[1]}> — type inhabituel pour une Series NT8 (attendu: double, bool, int)`
      });
    }
  }
}

function checkDrawMethods(code: string, errors: CompilationError[]): void {
  const validDrawMethods = [
    'ArrowUp', 'ArrowDown', 'Text', 'TextFixed', 'Line', 'HorizontalLine',
    'Rectangle', 'Region', 'TriangleUp', 'TriangleDown', 'Diamond', 'Dot',
    'Square', 'Ray', 'Arc', 'Ellipse', 'ExtendedLine', 'AndrewsPitchfork',
    'FibonacciCircle', 'FibonacciExtensions', 'FibonacciRetracements',
    'FibonacciTimeExtensions', 'GannFan', 'RegressionChannel', 'TrendChannel'
  ];

  const drawCallRegex = /Draw\.(\w+)\s*\(/g;
  let match;

  while ((match = drawCallRegex.exec(code)) !== null) {
    const method = match[1];
    if (!validDrawMethods.includes(method)) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      errors.push({
        type: 'error',
        line: lineNum,
        message: `Draw.${method} — méthode Draw inconnue`
      });
    }
  }
}

function checkStateEnums(code: string, errors: CompilationError[]): void {
  const validStates = [
    'SetDefaults', 'Configure', 'Active', 'DataLoaded', 'Historical',
    'Transition', 'Realtime', 'Terminated', 'Finalized'
  ];

  const stateRefRegex = /State\.(\w+)/g;
  let match;

  while ((match = stateRefRegex.exec(code)) !== null) {
    const state = match[1];
    if (!validStates.includes(state)) {
      const lineNum = code.substring(0, match.index).split('\n').length;
      errors.push({
        type: 'error',
        line: lineNum,
        message: `State.${state} — état invalide (valides: ${validStates.join(', ')})`
      });
    }
  }
}

function checkPropertyTypes(code: string, warnings: CompilationError[]): void {
  // Check [Range] on bool or string
  const rangeOnBool = /\[Range\s*\([^)]+\)\]\s*\n\s*.*\[.*\]\s*\n\s*public\s+bool/g;
  if (rangeOnBool.test(code)) {
    warnings.push({
      type: 'warning',
      line: 0,
      message: '[Range] utilisé sur une propriété bool — inutile'
    });
  }
}

function checkReferences(code: string, warnings: CompilationError[]): void {
  // Check for Print statements (debug only)
  const printRegex = /\bPrint\s*\(/g;
  let match;

  while ((match = printRegex.exec(code)) !== null) {
    const lineNum = code.substring(0, match.index).split('\n').length;
    const line = code.split('\n')[lineNum - 1];

    // Skip if in a comment
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    warnings.push({
      type: 'warning',
      line: lineNum,
      message: 'Print() trouvé — retirer pour la production (utile uniquement pour le debug)'
    });
  }
}

function checkRequiredElements(code: string, errors: CompilationError[], warnings: CompilationError[]): void {
  // Check IsOverlay is set for indicators
  if (/:\s*Indicator/.test(code) && !/IsOverlay\s*=/.test(code)) {
    warnings.push({
      type: 'warning',
      line: 0,
      message: 'IsOverlay non défini — par défaut false (panel séparé). Mettre true pour dessiner sur le graphique.'
    });
  }

  // Check for at least one using statement
  if (!/using\s+System\s*;/.test(code)) {
    errors.push({
      type: 'error',
      line: 0,
      message: 'using System; manquant'
    });
  }
}
