import { loadKnowledgeBase, type ScriptInfo } from '../knowledge/loader.js';

export function listAllScripts(): ScriptInfo[] {
  const kb = loadKnowledgeBase();
  return kb.scripts;
}

export function formatScriptList(scripts: ScriptInfo[]): string {
  if (scripts.length === 0) return 'Aucun script trouvé.';

  let output = `# Scripts NinjaTrader 8 Disponibles (${scripts.length})\n\n`;

  const indicators = scripts.filter(s => s.type === 'indicator');
  const strategies = scripts.filter(s => s.type === 'strategy');

  if (indicators.length > 0) {
    output += `## Indicateurs (${indicators.length})\n\n`;
    for (const s of indicators) {
      output += `### ${s.className}\n`;
      output += `- **Fichier**: ${s.filename}\n`;
      output += `- **Lignes**: ${s.lineCount}\n`;
      if (s.indicators.length > 0)
        output += `- **Indicateurs utilisés**: ${s.indicators.join(', ')}\n`;
      if (s.description)
        output += `- **Description**: ${s.description}\n`;
      output += '\n';
    }
  }

  if (strategies.length > 0) {
    output += `## Stratégies (${strategies.length})\n\n`;
    for (const s of strategies) {
      output += `### ${s.className}\n`;
      output += `- **Fichier**: ${s.filename}\n`;
      output += `- **Lignes**: ${s.lineCount}\n`;
      if (s.indicators.length > 0)
        output += `- **Indicateurs utilisés**: ${s.indicators.join(', ')}\n`;
      if (s.description)
        output += `- **Description**: ${s.description}\n`;
      output += '\n';
    }
  }

  return output;
}
