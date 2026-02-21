import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getOutputDir(): string {
  return process.env['OUTPUT_DIR'] || join(__dirname, '..', '..', 'generated');
}

export function saveScript(code: string, name: string, metadata: Record<string, any>): { filePath: string; reportPath: string } {
  const outDir = getOutputDir();
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  // Auto-version if file exists
  let version = 1;
  let filename = `${name}_v${version}.cs`;
  while (existsSync(join(outDir, filename))) {
    version++;
    filename = `${name}_v${version}.cs`;
  }

  const filePath = join(outDir, filename);
  writeFileSync(filePath, code, 'utf-8');

  // Save report
  const reportName = filename.replace('.cs', '.report.md');
  const reportPath = join(outDir, reportName);
  const report = generateReport(filename, metadata);
  writeFileSync(reportPath, report, 'utf-8');

  // Update manifest
  updateManifest(filename, metadata);

  return { filePath, reportPath };
}

function generateReport(filename: string, metadata: Record<string, any>): string {
  const now = new Date().toISOString();
  let report = `# Rapport de Génération - ${filename}\n\n`;
  report += `**Date**: ${now}\n`;
  report += `**Type**: ${metadata.type || 'indicator'}\n`;
  report += `**Description**: ${metadata.description || 'N/A'}\n\n`;

  if (metadata.updateChanges?.length > 0) {
    report += `## Mises à jour appliquées\n\n`;
    for (const change of metadata.updateChanges) {
      report += `- ${change}\n`;
    }
    report += '\n';
  }

  if (metadata.auditResult) {
    report += `## Résultat d'audit\n\n`;
    report += `**Statut**: ${metadata.auditResult.status}\n\n`;
    if (metadata.auditResult.issues?.length > 0) {
      for (const issue of metadata.auditResult.issues) {
        report += `- [${issue.severity}] ${issue.message}\n`;
      }
    } else {
      report += `Aucun problème détecté.\n`;
    }
    report += '\n';
  }

  if (metadata.testResult) {
    report += `## Résultat de compilation statique\n\n`;
    report += `**Statut**: ${metadata.testResult.status}\n\n`;
    if (metadata.testResult.errors?.length > 0) {
      for (const err of metadata.testResult.errors) {
        report += `- [ERREUR] ${err.message}\n`;
      }
    }
    if (metadata.testResult.warnings?.length > 0) {
      for (const warn of metadata.testResult.warnings) {
        report += `- [AVERT] ${warn.message}\n`;
      }
    }
    if (!metadata.testResult.errors?.length && !metadata.testResult.warnings?.length) {
      report += `Aucune erreur.\n`;
    }
  }

  return report;
}

function updateManifest(filename: string, metadata: Record<string, any>): void {
  const outDir = getOutputDir();
  const manifestPath = join(outDir, 'manifest.json');

  let manifest: any = { scripts: [] };
  if (existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    } catch { /* start fresh */ }
  }

  manifest.scripts.push({
    name: filename.replace('.cs', ''),
    generated_at: new Date().toISOString(),
    description: metadata.description || '',
    type: metadata.type || 'indicator',
    pipeline_status: metadata.pipelineStatus || 'unknown',
    file: filename
  });

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

export function generateInstallGuide(name: string, type: string, properties?: any[]): string {
  const folder = type === 'strategy' ? 'Strategies' : 'Indicators';

  let guide = `## Installation dans NinjaTrader 8\n\n`;
  guide += `### Méthode 1 : Import direct\n`;
  guide += `1. Ouvrir NinjaTrader 8\n`;
  guide += `2. Menu : **Tools** > **NinjaScript Editor**\n`;
  guide += `3. Clic droit dans le panneau gauche > **Import NinjaScript...**\n`;
  guide += `4. Sélectionner le fichier \`${name}.cs\`\n`;
  guide += `5. Cliquer **Compile** (F5)\n\n`;

  guide += `### Méthode 2 : Copie manuelle\n`;
  guide += `1. Copier le fichier \`.cs\` dans :\n`;
  guide += `   \`Documents\\NinjaTrader 8\\bin\\Custom\\${folder}\\${name}.cs\`\n`;
  guide += `2. Ouvrir NinjaTrader 8\n`;
  guide += `3. Menu : **Tools** > **NinjaScript Editor**\n`;
  guide += `4. Cliquer **Compile** (F5)\n\n`;

  guide += `### Utilisation\n`;
  if (type === 'strategy') {
    guide += `1. Ouvrir un graphique (ex: NQ 512 ticks)\n`;
    guide += `2. Clic droit > **Strategies** > Trouver **${name}**\n`;
    guide += `3. Configurer les paramètres > **Enable**\n`;
  } else {
    guide += `1. Ouvrir un graphique (ex: NQ 512 ticks)\n`;
    guide += `2. Clic droit > **Indicators** > Trouver **${name}**\n`;
    guide += `3. Configurer les paramètres > **OK**\n`;
  }

  if (properties && properties.length > 0) {
    guide += `\n### Paramètres configurables\n\n`;
    guide += `| Paramètre | Défaut | Description |\n`;
    guide += `|-----------|--------|-------------|\n`;
    for (const prop of properties) {
      guide += `| ${prop.name} | ${prop.default} | ${prop.description} |\n`;
    }
  }

  return guide;
}
