export interface BrushIssue {
  severity: 'ERROR' | 'WARNING';
  property: string;
  line: number;
  message: string;
  autoFixable: boolean;
}

export function checkBrushSerialization(code: string): BrushIssue[] {
  const issues: BrushIssue[] = [];
  const lines = code.split('\n');

  // Find all public Brush properties
  const brushPropRegex = /public\s+Brush\s+(\w+)\s*\{/g;
  let match;

  while ((match = brushPropRegex.exec(code)) !== null) {
    const propName = match[1];

    // Skip if it's the Serializable companion itself
    if (propName.endsWith('Serializable')) continue;

    // Find line number
    const beforeMatch = code.substring(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    // Check for [XmlIgnore] before the property
    // Look up to 5 lines above for the attribute
    const startSearchLine = Math.max(0, lineNum - 6);
    const contextBefore = lines.slice(startSearchLine, lineNum).join('\n');

    const hasXmlIgnore = /\[XmlIgnore\]/.test(contextBefore);

    // Check for companion Serializable property
    const companionPattern = new RegExp(
      `public\\s+string\\s+${propName}Serializable\\s*\\{`,
      'g'
    );
    const hasCompanion = companionPattern.test(code);

    // Check companion uses correct serialization methods
    const serializePattern = new RegExp(
      `Serialize\\.BrushToString\\(${propName}\\)`,
      'g'
    );
    const deserializePattern = new RegExp(
      `Serialize\\.StringToBrush\\(value\\)`,
      'g'
    );

    if (!hasXmlIgnore) {
      issues.push({
        severity: 'ERROR',
        property: propName,
        line: lineNum,
        message: `Propriété Brush "${propName}" sans [XmlIgnore] — causera un crash NT8 au save/load`,
        autoFixable: true
      });
    }

    if (!hasCompanion) {
      issues.push({
        severity: 'ERROR',
        property: propName,
        line: lineNum,
        message: `Propriété Brush "${propName}" sans companion "${propName}Serializable" — sérialisation cassée`,
        autoFixable: true
      });
    } else if (!serializePattern.test(code)) {
      issues.push({
        severity: 'ERROR',
        property: propName,
        line: lineNum,
        message: `Companion "${propName}Serializable" ne contient pas Serialize.BrushToString(${propName})`,
        autoFixable: false
      });
    }
  }

  return issues;
}

export function autoFixBrushSerialization(code: string, issues: BrushIssue[]): string {
  let fixed = code;

  for (const issue of issues.filter(i => i.autoFixable)) {
    const propName = issue.property;

    // Add [XmlIgnore] if missing
    if (issue.message.includes('[XmlIgnore]')) {
      const propPattern = new RegExp(
        `(\\[Display[^\\]]*\\]\\s*\\n\\s*)(public\\s+Brush\\s+${propName})`,
        'g'
      );
      if (propPattern.test(fixed)) {
        fixed = fixed.replace(propPattern, `[XmlIgnore]\n        $1$2`);
      } else {
        // No Display attribute, add before public
        const simplePattern = new RegExp(`(\\s*)(public\\s+Brush\\s+${propName})`, 'g');
        fixed = fixed.replace(simplePattern, `$1[XmlIgnore]\n$1$2`);
      }
    }

    // Add companion if missing
    if (issue.message.includes('companion')) {
      const propEndPattern = new RegExp(
        `(public\\s+Brush\\s+${propName}\\s*\\{\\s*get;\\s*set;\\s*\\})`,
        'g'
      );
      const companion = `\n\n        [Browsable(false)]\n        public string ${propName}Serializable\n        {\n            get { return Serialize.BrushToString(${propName}); }\n            set { ${propName} = Serialize.StringToBrush(value); }\n        }`;

      fixed = fixed.replace(propEndPattern, `$1${companion}`);
    }
  }

  return fixed;
}
