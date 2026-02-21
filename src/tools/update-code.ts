import { loadKnowledgeBase } from '../knowledge/loader.js';

interface CodeChange {
  description: string;
  before: string;
  after: string;
}

export function handleUpdateCode(params: {
  code: string;
  script_type?: string;
}): { content: Array<{ type: 'text'; text: string }> } {
  const { code, script_type } = params;
  const changes: CodeChange[] = [];
  let updated = code;

  const kb = loadKnowledgeBase();
  const detectedType = script_type || detectType(code);

  // 1. Fix namespace
  updated = fixNamespace(updated, detectedType, changes);

  // 2. Fix using statements
  updated = fixUsings(updated, changes);

  // 3. Fix deprecated Draw methods
  updated = fixDeprecatedMethods(updated, changes);

  // 4. Fix deprecated Calculate property
  updated = fixCalculateProperty(updated, changes);

  // Build result
  let output = `# Résultat de mise à jour du code\n\n`;
  output += `**Type détecté**: ${detectedType}\n`;
  output += `**Corrections appliquées**: ${changes.length}\n\n`;

  if (changes.length > 0) {
    output += `## Changements\n\n`;
    for (const change of changes) {
      output += `### ${change.description}\n`;
      if (change.before) output += `- Avant: \`${change.before}\`\n`;
      if (change.after) output += `- Après: \`${change.after}\`\n`;
      output += '\n';
    }
  } else {
    output += `Aucune correction nécessaire — le code suit déjà les best practices.\n`;
  }

  output += `\n## Code mis à jour\n\n\`\`\`csharp\n${updated}\n\`\`\`\n`;

  return {
    content: [{ type: 'text', text: output }]
  };
}

function detectType(code: string): string {
  if (/:\s*Strategy\b/.test(code)) return 'strategy';
  return 'indicator';
}

function fixNamespace(code: string, type: string, changes: CodeChange[]): string {
  const expectedNs = type === 'strategy'
    ? 'NinjaTrader.NinjaScript.Strategies'
    : 'NinjaTrader.NinjaScript.Indicators';

  const nsMatch = code.match(/namespace\s+([\w.]+)/);
  if (nsMatch && nsMatch[1] !== expectedNs) {
    const oldNs = nsMatch[1];
    changes.push({
      description: 'Namespace corrigé',
      before: oldNs,
      after: expectedNs
    });
    return code.replace(`namespace ${oldNs}`, `namespace ${expectedNs}`);
  }

  return code;
}

function fixUsings(code: string, changes: CodeChange[]): string {
  const requiredUsings = [
    'System',
    'System.ComponentModel',
    'System.ComponentModel.DataAnnotations',
    'System.Windows.Media',
    'NinjaTrader.Cbi',
    'NinjaTrader.Data',
    'NinjaTrader.Gui.NinjaScript',
    'NinjaTrader.Gui.Tools',
    'NinjaTrader.NinjaScript',
    'NinjaTrader.NinjaScript.DrawingTools',
    'NinjaTrader.NinjaScript.Indicators'
  ];

  // Conditional usings
  if (/\bBrush\b/.test(code) && !/using\s+System\.Xml\.Serialization/.test(code)) {
    requiredUsings.push('System.Xml.Serialization');
  }
  if (/\bBrush\b/.test(code) && !/using\s+NinjaTrader\.Gui;/.test(code)) {
    requiredUsings.push('NinjaTrader.Gui');
  }
  if (/\bList</.test(code) && !/using\s+System\.Collections\.Generic/.test(code)) {
    requiredUsings.push('System.Collections.Generic');
  }
  if (/\.Linq/.test(code) || /\.Select\(|\.Where\(|\.OrderBy\(/.test(code)) {
    if (!/using\s+System\.Linq/.test(code)) {
      requiredUsings.push('System.Linq');
    }
  }

  let updated = code;
  const added: string[] = [];

  for (const u of requiredUsings) {
    const usingPattern = new RegExp(`using\\s+${u.replace(/\./g, '\\.')}\\s*;`);
    if (!usingPattern.test(updated)) {
      // Find end of using block or #endregion
      const endRegion = updated.indexOf('#endregion');
      const insertPos = endRegion !== -1 ? endRegion : updated.indexOf('namespace');

      if (insertPos !== -1) {
        const usingLine = `using ${u};\n`;
        updated = updated.substring(0, insertPos) + usingLine + updated.substring(insertPos);
        added.push(u);
      }
    }
  }

  if (added.length > 0) {
    changes.push({
      description: `${added.length} using(s) ajouté(s)`,
      before: '',
      after: added.map(u => `using ${u};`).join(', ')
    });
  }

  return updated;
}

function fixDeprecatedMethods(code: string, changes: CodeChange[]): string {
  const deprecatedMap: Record<string, string> = {
    'DrawArrowUp': 'Draw.ArrowUp',
    'DrawArrowDown': 'Draw.ArrowDown',
    'DrawText': 'Draw.Text',
    'DrawLine': 'Draw.Line',
    'DrawRectangle': 'Draw.Rectangle',
    'DrawTriangleUp': 'Draw.TriangleUp',
    'DrawTriangleDown': 'Draw.TriangleDown',
    'DrawDot': 'Draw.Dot',
    'DrawDiamond': 'Draw.Diamond',
    'DrawSquare': 'Draw.Square',
    'DrawRegion': 'Draw.Region',
    'DrawHorizontalLine': 'Draw.HorizontalLine',
    'DrawRay': 'Draw.Ray'
  };

  let updated = code;

  for (const [old, replacement] of Object.entries(deprecatedMap)) {
    const regex = new RegExp(`\\b${old}\\s*\\(`, 'g');
    if (regex.test(updated)) {
      changes.push({
        description: `Méthode dépréciée remplacée`,
        before: `${old}(`,
        after: `${replacement}(`
      });
      updated = updated.replace(new RegExp(`\\b${old}\\(`, 'g'), `${replacement}(`);
    }
  }

  return updated;
}

function fixCalculateProperty(code: string, changes: CodeChange[]): string {
  let updated = code;

  // Fix old-style CalculateOnBarClose
  if (/CalculateOnBarClose\s*=\s*true/.test(updated)) {
    changes.push({
      description: 'Propriété Calculate modernisée',
      before: 'CalculateOnBarClose = true',
      after: 'Calculate = Calculate.OnBarClose'
    });
    updated = updated.replace(/CalculateOnBarClose\s*=\s*true\s*;/, 'Calculate = Calculate.OnBarClose;');
  }
  if (/CalculateOnBarClose\s*=\s*false/.test(updated)) {
    changes.push({
      description: 'Propriété Calculate modernisée',
      before: 'CalculateOnBarClose = false',
      after: 'Calculate = Calculate.OnEachTick'
    });
    updated = updated.replace(/CalculateOnBarClose\s*=\s*false\s*;/, 'Calculate = Calculate.OnEachTick;');
  }

  return updated;
}
