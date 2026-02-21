export interface PropertyIssue {
  severity: 'WARNING' | 'ERROR';
  property: string;
  line: number;
  message: string;
}

export function checkProperties(code: string): PropertyIssue[] {
  const issues: PropertyIssue[] = [];
  const lines = code.split('\n');

  // Find all public properties with { get; set; } (auto-properties)
  const propRegex = /public\s+(int|double|bool|string|Brush)\s+(\w+)\s*\{\s*get;\s*set;\s*\}/g;
  let match;

  while ((match = propRegex.exec(code)) !== null) {
    const propType = match[1];
    const propName = match[2];
    const lineNum = code.substring(0, match.index).split('\n').length;

    // Skip Serializable companions
    if (propName.endsWith('Serializable')) continue;

    // Look at context above (up to 8 lines) for attributes
    const startLine = Math.max(0, lineNum - 9);
    const contextLines = lines.slice(startLine, lineNum);
    const context = contextLines.join('\n');

    // Check [NinjaScriptProperty]
    const hasNSP = /\[NinjaScriptProperty\]/.test(context);
    if (!hasNSP && propType !== 'Brush') {
      issues.push({
        severity: 'WARNING',
        property: propName,
        line: lineNum,
        message: `Propriété "${propName}" sans [NinjaScriptProperty] — ne sera pas configurable par l'utilisateur`
      });
    }

    // Check [Display]
    const hasDisplay = /\[Display\s*\(/.test(context);
    if (!hasDisplay && propType !== 'Brush') {
      issues.push({
        severity: 'WARNING',
        property: propName,
        line: lineNum,
        message: `Propriété "${propName}" sans [Display] — pas de nom/ordre dans le UI`
      });
    }

    // Check [Range] for numeric types
    const hasRange = /\[Range\s*\(/.test(context);
    if (!hasRange && (propType === 'int' || propType === 'double')) {
      issues.push({
        severity: 'WARNING',
        property: propName,
        line: lineNum,
        message: `Propriété numérique "${propName}" (${propType}) sans [Range] — pas de validation d'entrée`
      });
    }

    // Check [Range] on non-numeric types (wrong usage)
    if (hasRange && (propType === 'bool' || propType === 'string')) {
      issues.push({
        severity: 'WARNING',
        property: propName,
        line: lineNum,
        message: `[Range] sur propriété ${propType} "${propName}" — inutile sur bool/string`
      });
    }
  }

  return issues;
}
