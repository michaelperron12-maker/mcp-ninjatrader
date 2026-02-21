import { checkSyntax } from '../analyzers/syntax-checker.js';
import { validateStructure } from '../analyzers/structure-validator.js';
import { checkBrushSerialization, autoFixBrushSerialization } from '../analyzers/brush-checker.js';
import { checkAntiDoublon } from '../analyzers/anti-doublon.js';
import { checkProperties } from '../analyzers/property-checker.js';
import { checkMultiTimeframe } from '../analyzers/mtf-checker.js';
import { checkMemory } from '../analyzers/memory-checker.js';

export interface AuditIssue {
  check: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  line: number;
  message: string;
  autoFixable: boolean;
}

export interface AuditResult {
  status: 'pass' | 'warn' | 'fail';
  issues: AuditIssue[];
  fixedCode?: string;
}

export function handleAuditScript(params: {
  code: string;
  strict?: boolean;
  auto_fix?: boolean;
}): { content: Array<{ type: 'text'; text: string }>; auditResult: AuditResult } {
  const { code, strict, auto_fix } = params;
  const issues: AuditIssue[] = [];

  // 1. Syntax check
  const syntaxIssues = checkSyntax(code);
  for (const si of syntaxIssues) {
    issues.push({
      check: 'syntax',
      severity: si.type === 'error' ? 'ERROR' : 'WARNING',
      line: si.line,
      message: si.message,
      autoFixable: false
    });
  }

  // 2. Structure validation
  const structIssues = validateStructure(code);
  for (const si of structIssues) {
    issues.push({
      check: 'structure',
      severity: si.type === 'error' ? 'ERROR' : 'WARNING',
      line: 0,
      message: si.message,
      autoFixable: false
    });
  }

  // 3. Brush serialization
  const brushIssues = checkBrushSerialization(code);
  for (const bi of brushIssues) {
    issues.push({
      check: 'brush_serialization',
      severity: bi.severity,
      line: bi.line,
      message: bi.message,
      autoFixable: bi.autoFixable
    });
  }

  // 4. Anti-doublon
  const doublonIssues = checkAntiDoublon(code);
  for (const di of doublonIssues) {
    issues.push({
      check: 'anti_doublon',
      severity: di.severity,
      line: di.line,
      message: di.message,
      autoFixable: false
    });
  }

  // 5. Property declarations
  const propIssues = checkProperties(code);
  for (const pi of propIssues) {
    issues.push({
      check: 'properties',
      severity: pi.severity,
      line: pi.line,
      message: pi.message,
      autoFixable: false
    });
  }

  // 6. Multi-timeframe safety
  const mtfIssues = checkMultiTimeframe(code);
  for (const mi of mtfIssues) {
    issues.push({
      check: 'multi_timeframe',
      severity: mi.severity,
      line: mi.line,
      message: mi.message,
      autoFixable: false
    });
  }

  // 7. Memory and draw tag checks
  const memIssues = checkMemory(code);
  for (const mi of memIssues) {
    issues.push({
      check: 'memory',
      severity: mi.severity,
      line: mi.line,
      message: mi.message,
      autoFixable: false
    });
  }

  // 8. Alert state check
  checkAlerts(code, issues);

  // 9. Panel visibility check
  checkPanelVisibility(code, issues);

  // Determine status
  const errors = issues.filter(i => i.severity === 'ERROR');
  const warnings = issues.filter(i => i.severity === 'WARNING');
  const infos = issues.filter(i => i.severity === 'INFO');

  let status: 'pass' | 'warn' | 'fail';
  if (errors.length > 0) {
    status = 'fail';
  } else if (warnings.length > 0) {
    status = strict ? 'fail' : 'warn';
  } else {
    status = 'pass';
  }

  // Auto-fix if requested
  let fixedCode: string | undefined;
  if (auto_fix && brushIssues.length > 0) {
    fixedCode = autoFixBrushSerialization(code, brushIssues);
  }

  // Format output
  let output = `# Résultat d'Audit NinjaScript\n\n`;
  output += `**Statut**: ${status === 'pass' ? 'PASS' : status === 'warn' ? 'AVERTISSEMENTS' : 'ECHEC'}\n`;
  output += `**Erreurs**: ${errors.length} | **Avertissements**: ${warnings.length} | **Info**: ${infos.length}\n\n`;

  if (issues.length > 0) {
    output += `## Problèmes détectés\n\n`;

    if (errors.length > 0) {
      output += `### Erreurs (doivent être corrigées)\n\n`;
      for (const e of errors) {
        output += `- **[${e.check}]** ${e.line > 0 ? `Ligne ${e.line}: ` : ''}${e.message}`;
        if (e.autoFixable) output += ' *(auto-fixable)*';
        output += '\n';
      }
      output += '\n';
    }

    if (warnings.length > 0) {
      output += `### Avertissements\n\n`;
      for (const w of warnings) {
        output += `- **[${w.check}]** ${w.line > 0 ? `Ligne ${w.line}: ` : ''}${w.message}\n`;
      }
      output += '\n';
    }

    if (infos.length > 0) {
      output += `### Information\n\n`;
      for (const i of infos) {
        output += `- **[${i.check}]** ${i.message}\n`;
      }
      output += '\n';
    }
  } else {
    output += `Aucun problème détecté. Le code est conforme aux best practices NT8.\n`;
  }

  if (fixedCode) {
    output += `\n## Code corrigé automatiquement\n\n\`\`\`csharp\n${fixedCode}\n\`\`\`\n`;
  }

  const auditResult: AuditResult = { status, issues, fixedCode };
  return { content: [{ type: 'text', text: output }], auditResult };
}

function checkAlerts(code: string, issues: AuditIssue[]): void {
  const lines = code.split('\n');
  const alertRegex = /Alert\s*\(/g;
  let match;

  while ((match = alertRegex.exec(code)) !== null) {
    const lineNum = code.substring(0, match.index).split('\n').length;
    // Check if State.Realtime is checked within 5 lines above
    const startLine = Math.max(0, lineNum - 6);
    const context = lines.slice(startLine, lineNum).join('\n');

    if (!/State\s*==\s*State\.Realtime/.test(context) && !/State\.Realtime/.test(context)) {
      issues.push({
        check: 'alert_realtime',
        severity: 'WARNING',
        line: lineNum,
        message: 'Alert() sans vérification State.Realtime — va déclencher pendant le backtest',
        autoFixable: false
      });
    }
  }
}

function checkPanelVisibility(code: string, issues: AuditIssue[]): void {
  // Check if there's a panel (Draw.TextFixed)
  const hasPanel = /Draw\.TextFixed/.test(code);
  if (!hasPanel) {
    issues.push({
      check: 'panel_visibility',
      severity: 'INFO',
      line: 0,
      message: 'Pas de panel info (Draw.TextFixed) — recommandé pour afficher le statut en temps réel',
      autoFixable: false
    });
    return;
  }

  // Check if panel is inside OnBarUpdate
  const onBarUpdateStart = code.indexOf('void OnBarUpdate()');
  if (onBarUpdateStart === -1) return;

  const textFixedPos = code.indexOf('Draw.TextFixed', onBarUpdateStart);
  if (textFixedPos === -1) return;

  // Check if there are return statements before the TextFixed
  const onBarBody = code.substring(onBarUpdateStart, textFixedPos);
  const returnStatements = (onBarBody.match(/\breturn\s*;/g) || []).length;

  if (returnStatements > 2) {
    issues.push({
      check: 'panel_visibility',
      severity: 'INFO',
      line: 0,
      message: `Panel Draw.TextFixed après ${returnStatements} return statements — risque de ne pas s'afficher dans certaines conditions`,
      autoFixable: false
    });
  }
}
