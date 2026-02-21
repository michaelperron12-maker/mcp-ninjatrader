import { buildGenerationContext, loadKnowledgeBase } from '../knowledge/loader.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function handleGenerateScript(params: {
  description: string;
  type?: string;
  instrument?: string;
  timeframe?: string;
}): { content: Array<{ type: 'text'; text: string }> } {
  const { description, type, instrument, timeframe } = params;

  if (!description || description.trim().length < 5) {
    return {
      content: [{
        type: 'text',
        text: 'Erreur: Veuillez fournir une description plus détaillée de ce que vous voulez (minimum 5 caractères).'
      }]
    };
  }

  // Determine script type from description if not specified
  const detectedType = type || detectScriptType(description);

  // Build the complete knowledge context
  const context = buildGenerationContext(description, detectedType);

  // Load the appropriate template
  const templateFile = detectedType === 'strategy' ? 'strategy.cs.template' : 'indicator.cs.template';
  let template = '';
  try {
    template = readFileSync(join(__dirname, '..', 'templates', templateFile), 'utf-8');
  } catch {
    template = '// Template non disponible';
  }

  // Build the generation instructions
  let output = `# Contexte de Génération NinjaTrader 8\n\n`;
  output += `## Demande du client\n\n`;
  output += `**Description**: ${description}\n`;
  output += `**Type**: ${detectedType}\n`;
  if (instrument) output += `**Instrument**: ${instrument}\n`;
  if (timeframe) output += `**Timeframe**: ${timeframe}\n`;
  output += `\n---\n\n`;

  // Generation instructions for Claude
  output += `## Instructions de génération\n\n`;
  output += `Génère un script NinjaTrader 8 complet en C# basé sur la demande ci-dessus.\n\n`;
  output += `**IMPORTANT — Règles obligatoires:**\n`;
  output += `1. Le code DOIT compiler sans erreur dans NT8 v8.1.6.3\n`;
  output += `2. Utiliser le namespace \`NinjaTrader.NinjaScript.${detectedType === 'strategy' ? 'Strategies' : 'Indicators'}\`\n`;
  output += `3. Toute propriété Brush DOIT avoir [XmlIgnore] + companion Serializable\n`;
  output += `4. OnStateChange DOIT avoir les 3 phases: SetDefaults, Configure, DataLoaded\n`;
  output += `5. Les indicateurs (RSI, MACD, etc.) DOIVENT être créés dans DataLoaded\n`;
  output += `6. Si multi-timeframe: ajouter BarsInProgress guard dans OnBarUpdate\n`;
  output += `7. Ajouter un panel info (Draw.TextFixed) toujours visible\n`;
  output += `8. Tags de dessin DOIVENT être uniques (ajouter CurrentBar)\n`;
  output += `9. Alertes DOIVENT vérifier State == State.Realtime\n`;
  output += `10. Si OnEachTick: ajouter protection anti-doublon\n\n`;

  if (instrument) {
    output += `**Instrument cible**: ${instrument}\n`;
  }
  if (timeframe) {
    output += `**Timeframe**: ${timeframe}\n`;
  }

  output += `\n---\n\n`;

  // Template
  output += `## Template de base\n\n`;
  output += `\`\`\`csharp\n${template}\n\`\`\`\n\n`;
  output += `Remplacer les placeholders {{...}} par le code approprié.\n\n`;

  output += `---\n\n`;

  // Full knowledge base context
  output += context;

  return {
    content: [{ type: 'text', text: output }]
  };
}

function detectScriptType(description: string): string {
  const lower = description.toLowerCase();
  const strategyKeywords = [
    'stratégie', 'strategy', 'auto-trade', 'autotrade', 'automatique',
    'entrée', 'entry', 'sortie', 'exit', 'stop loss', 'stoploss',
    'take profit', 'tp', 'sl', 'position', 'enterlong', 'entershort',
    'break-even', 'breakeven', 'lot', 'quantité', 'risque par trade'
  ];

  for (const kw of strategyKeywords) {
    if (lower.includes(kw)) return 'strategy';
  }

  return 'indicator';
}
