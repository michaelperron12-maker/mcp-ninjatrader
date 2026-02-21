import { saveScript, generateInstallGuide } from '../utils/file-manager.js';

export function handleDeliverScript(params: {
  code: string;
  name: string;
  type: string;
  description: string;
  metadata?: Record<string, any>;
}): { content: Array<{ type: 'text'; text: string }> } {
  const { code, name, type, description, metadata } = params;

  // Clean the name for filename
  const cleanName = name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');

  if (!cleanName) {
    return {
      content: [{
        type: 'text',
        text: 'Erreur: Le nom du script est invalide. Utilisez des lettres, chiffres et underscores.'
      }]
    };
  }

  // Save the script
  const fullMetadata = {
    type,
    description,
    ...(metadata || {})
  };

  const { filePath, reportPath } = saveScript(code, cleanName, fullMetadata);

  // Generate installation guide
  const installGuide = generateInstallGuide(cleanName, type);

  // Build output
  let output = `# Script Livré avec Succès\n\n`;
  output += `**Fichier**: \`${filePath}\`\n`;
  output += `**Rapport**: \`${reportPath}\`\n`;
  output += `**Type**: ${type}\n`;
  output += `**Description**: ${description}\n\n`;
  output += `---\n\n`;
  output += installGuide;
  output += `\n---\n\n`;
  output += `## Code final\n\n\`\`\`csharp\n${code}\n\`\`\`\n`;

  return {
    content: [{ type: 'text', text: output }]
  };
}
