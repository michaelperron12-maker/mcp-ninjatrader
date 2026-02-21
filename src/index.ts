#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { loadKnowledgeBase } from './knowledge/loader.js';
import { handleListScripts } from './tools/list-scripts.js';
import { handleGetScript } from './tools/get-script.js';
import { handleGenerateScript } from './tools/generate-script.js';
import { handleUpdateCode } from './tools/update-code.js';
import { handleAuditScript } from './tools/audit-script.js';
import { handleTestCompilation } from './tools/test-compilation.js';
import { handleDeliverScript } from './tools/deliver-script.js';
import { handleRunPipeline, handleValidateAndDeliver } from './tools/run-pipeline.js';

// Initialize knowledge base at startup
const kb = loadKnowledgeBase();
const scriptCount = kb.scripts.length;
const patternCount = kb.patterns.length;
const errorCount = kb.errors.length;

// Create MCP server
const server = new McpServer({
  name: 'NinjaTrader 8 Script Generator',
  version: '1.0.0'
});

// ═══════════════════════════════════════════════════════
// TOOL 1: list_scripts — Liste les scripts existants
// ═══════════════════════════════════════════════════════
server.tool(
  'list_scripts',
  `Liste les ${scriptCount} scripts NinjaTrader 8 disponibles avec descriptions, types et indicateurs utilisés`,
  {},
  async () => handleListScripts()
);

// ═══════════════════════════════════════════════════════
// TOOL 2: get_script — Récupère un script par nom
// ═══════════════════════════════════════════════════════
server.tool(
  'get_script',
  'Récupère le code source complet d\'un script NinjaTrader 8 existant par son nom (recherche partielle supportée)',
  {
    name: z.string().describe('Nom complet ou partiel du script (ex: "RSI", "Harmonic", "MACD")')
  },
  async ({ name }) => handleGetScript(name)
);

// ═══════════════════════════════════════════════════════
// TOOL 3: generate_script — Génère un script depuis une description
// ═══════════════════════════════════════════════════════
server.tool(
  'generate_script',
  `Assemble le knowledge base NT8 (${patternCount} patterns, ${scriptCount} scripts de référence, ${errorCount} erreurs documentées) pour générer un script NinjaTrader 8. Retourne le contexte complet pour la génération de code C#.`,
  {
    description: z.string().min(5).describe('Description en langage naturel du script voulu (français ou anglais)'),
    type: z.enum(['indicator', 'strategy']).optional().describe('Type de script (auto-détecté si non spécifié)'),
    instrument: z.string().optional().describe('Instrument cible (ex: NQ, ES, CL, GC)'),
    timeframe: z.string().optional().describe('Timeframe (ex: "512 tick", "5 min", "1 hour")')
  },
  async (params) => handleGenerateScript(params)
);

// ═══════════════════════════════════════════════════════
// TOOL 4: update_code — Met à jour le code selon les best practices
// ═══════════════════════════════════════════════════════
server.tool(
  'update_code',
  'Vérifie et corrige le code NinjaScript selon les best practices NT8: namespaces, usings, méthodes dépréciées, patterns modernes',
  {
    code: z.string().min(10).describe('Code C# NinjaScript à vérifier'),
    script_type: z.enum(['indicator', 'strategy']).optional().describe('Type de script (auto-détecté si non spécifié)')
  },
  async (params) => handleUpdateCode(params)
);

// ═══════════════════════════════════════════════════════
// TOOL 5: audit_script — Audit complet du code (12 checks)
// ═══════════════════════════════════════════════════════
server.tool(
  'audit_script',
  'Audit complet du code NinjaScript: Brush serialization, anti-doublon, panel visibility, propriétés, MTF safety, memory leaks, signal tags, alerts, structure (12 checks au total)',
  {
    code: z.string().min(10).describe('Code C# NinjaScript à auditer'),
    strict: z.boolean().optional().default(false).describe('Mode strict: les warnings deviennent des erreurs'),
    auto_fix: z.boolean().optional().default(true).describe('Auto-corriger les problèmes fixables (Brush serialization)')
  },
  async (params) => {
    const result = handleAuditScript(params);
    return { content: result.content };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 6: test_compilation — Analyse statique de compilation
// ═══════════════════════════════════════════════════════
server.tool(
  'test_compilation',
  'Analyse statique du code NinjaScript: structure de classe, types NT8, méthodes Draw valides, états valides, éléments requis',
  {
    code: z.string().min(10).describe('Code C# NinjaScript à tester')
  },
  async (params) => {
    const result = handleTestCompilation(params);
    return { content: result.content };
  }
);

// ═══════════════════════════════════════════════════════
// TOOL 7: deliver_script — Sauvegarde et livre le script
// ═══════════════════════════════════════════════════════
server.tool(
  'deliver_script',
  'Sauvegarde le script .cs final validé dans le dossier de livraison, génère un rapport et un guide d\'installation en français',
  {
    code: z.string().min(10).describe('Code C# NinjaScript final validé'),
    name: z.string().min(1).describe('Nom du script (ex: "RSI_Volume_Crossover")'),
    type: z.enum(['indicator', 'strategy']).describe('Type de script'),
    description: z.string().describe('Description courte du script')
  },
  async (params) => handleDeliverScript(params)
);

// ═══════════════════════════════════════════════════════
// TOOL 8: run_pipeline — Pipeline complet de génération
// ═══════════════════════════════════════════════════════
server.tool(
  'run_pipeline',
  'Pipeline COMPLET: assemble le knowledge base NT8 pour générer un script, puis fournit les instructions pour validation (update → audit → test → deliver). Utilisez cet outil quand le client décrit ce qu\'il veut.',
  {
    description: z.string().min(5).describe('Description en langage naturel du script voulu'),
    type: z.enum(['indicator', 'strategy']).optional().describe('Type de script'),
    instrument: z.string().optional().describe('Instrument cible'),
    timeframe: z.string().optional().describe('Timeframe'),
    auto_fix: z.boolean().optional().default(true).describe('Auto-corriger les problèmes détectés')
  },
  async (params) => handleRunPipeline(params)
);

// ═══════════════════════════════════════════════════════
// TOOL 9: validate_and_deliver — Valide et livre le code généré
// ═══════════════════════════════════════════════════════
server.tool(
  'validate_and_deliver',
  'Prend du code NinjaScript généré et le passe par le pipeline de validation complet: update best practices → audit 12 checks → test compilation → livraison. Utilisez après avoir généré le code avec generate_script ou run_pipeline.',
  {
    code: z.string().min(10).describe('Code C# NinjaScript à valider et livrer'),
    name: z.string().min(1).describe('Nom du script'),
    type: z.enum(['indicator', 'strategy']).describe('Type de script'),
    description: z.string().describe('Description du script'),
    auto_fix: z.boolean().optional().default(true).describe('Auto-corriger les problèmes')
  },
  async (params) => handleValidateAndDeliver(params)
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Erreur fatale MCP Server:', error);
  process.exit(1);
});
