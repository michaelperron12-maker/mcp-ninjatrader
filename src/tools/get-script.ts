import { getScriptByName } from '../knowledge/loader.js';

export function handleGetScript(name: string): { content: Array<{ type: 'text'; text: string }> } {
  const script = getScriptByName(name);

  if (!script) {
    return {
      content: [{
        type: 'text',
        text: `Script "${name}" non trouvé. Utilisez list_scripts pour voir les scripts disponibles.`
      }]
    };
  }

  let output = `# ${script.className}\n\n`;
  output += `- **Type**: ${script.type}\n`;
  output += `- **Fichier**: ${script.filename}\n`;
  output += `- **Lignes**: ${script.lineCount}\n`;
  if (script.indicators.length > 0)
    output += `- **Indicateurs**: ${script.indicators.join(', ')}\n`;
  output += `\n\`\`\`csharp\n${script.code}\n\`\`\`\n`;

  return {
    content: [{ type: 'text', text: output }]
  };
}
