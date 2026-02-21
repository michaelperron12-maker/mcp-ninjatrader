import express from 'express';
import cors from 'cors';
import Anthropic from '@anthropic-ai/sdk';
import { loadKnowledgeBase, buildGenerationContext } from '../dist/knowledge/loader.js';
import { handleListScripts } from '../dist/tools/list-scripts.js';
import { handleGetScript } from '../dist/tools/get-script.js';
import { handleGenerateScript } from '../dist/tools/generate-script.js';
import { handleUpdateCode } from '../dist/tools/update-code.js';
import { handleAuditScript } from '../dist/tools/audit-script.js';
import { handleTestCompilation } from '../dist/tools/test-compilation.js';
import { handleDeliverScript } from '../dist/tools/deliver-script.js';
import { handleRunPipeline, handleValidateAndDeliver } from '../dist/tools/run-pipeline.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Load knowledge base at startup
const kb = loadKnowledgeBase();
console.log(`Knowledge base loaded: ${kb.scripts.length} scripts, ${kb.patterns.length} patterns`);

// Initialize Anthropic client
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

// ── Rate limiter (5 req/min per IP) ──
const chatRateLimit = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = chatRateLimit.get(ip);
  if (!entry || now > entry.resetTime) {
    chatRateLimit.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  if (entry.count >= 5) return false;
  entry.count++;
  return true;
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of chatRateLimit) {
    if (now > entry.resetTime) chatRateLimit.delete(ip);
  }
}, 300000);

// ── Serve chat page ──
app.get('/api/nt8/chat-page', (req, res) => {
  res.sendFile(join(__dirname, '..', 'chat-nt8.html'));
});

// ── Health check ──
app.get('/api/nt8/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    scripts: kb.scripts.length,
    patterns: kb.patterns.length,
    tools: 10,
    claude: anthropic ? 'connected' : 'no-key'
  });
});

// ── 10. Chat with Claude + Pipeline (SSE) ──
app.post('/api/nt8/chat', async (req, res) => {
  const { message, conversation_history } = req.body;
  if (!message || typeof message !== 'string' || message.trim().length < 3) {
    return res.status(400).json({ error: 'message requis (min 3 caracteres)' });
  }
  if (!anthropic) {
    return res.status(503).json({ error: 'Claude API non configuree. Contactez SeoAI.' });
  }

  const clientIp = req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.ip;
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Trop de demandes. Reessayez dans 1 minute.' });
  }

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });

  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    // STAGE 1: Build generation context
    send('stage', { stage: 'context', status: 'start' });
    const detectedType = detectScriptType(message);
    const context = buildGenerationContext(message, detectedType);
    send('stage', { stage: 'context', status: 'done' });

    // STAGE 2: Call Claude API with streaming
    send('stage', { stage: 'generation', status: 'start' });
    const systemPrompt = buildSystemPrompt(context, detectedType);
    const messages = buildMessages(message, conversation_history);

    let fullResponse = '';
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: messages
    });

    stream.on('text', (text) => {
      fullResponse += text;
      send('token', { text });
    });

    await stream.finalMessage();
    send('stage', { stage: 'generation', status: 'done' });

    // STAGE 3: Extract code blocks
    const codeBlocks = extractCodeBlocks(fullResponse);

    if (codeBlocks.length > 0) {
      const code = codeBlocks[0];
      const scriptName = extractClassName(code) || 'CustomScript_v1';
      send('code', { code, name: scriptName, type: detectedType });

      // STAGE 4: Run validation pipeline
      send('stage', { stage: 'audit', status: 'start' });

      try {
        const pipelineResult = handleValidateAndDeliver({
          code, name: scriptName, type: detectedType,
          description: message, auto_fix: true
        });
        const pipelineText = pipelineResult.content[0].text;

        send('stage', { stage: 'audit', status: 'done' });
        send('stage', { stage: 'test', status: 'done' });
        send('pipeline', { report: pipelineText });

        if (!pipelineText.includes('Livraison annulee') && !pipelineText.includes('Livraison annulée')) {
          send('stage', { stage: 'delivery', status: 'done' });
          send('file', { filename: `${scriptName}.cs`, name: scriptName });
        } else {
          send('stage', { stage: 'delivery', status: 'error' });
        }
      } catch (pipeErr) {
        send('stage', { stage: 'audit', status: 'error' });
        send('error', { message: 'Erreur pipeline: ' + pipeErr.message });
      }
    } else {
      // No code generated — just text response
      send('stage', { stage: 'audit', status: 'skip' });
      send('stage', { stage: 'test', status: 'skip' });
      send('stage', { stage: 'delivery', status: 'skip' });
    }

    send('done', {});
  } catch (err) {
    console.error('Chat error:', err);
    send('error', { message: err.message || 'Erreur interne' });
    send('done', {});
  }

  res.end();
});

// ── Chat helpers ──
function buildSystemPrompt(context, type) {
  return `Tu es un expert NinjaTrader 8 / NinjaScript C#. Tu generes des scripts complets et fonctionnels pour la plateforme NinjaTrader 8.

REGLES OBLIGATOIRES:
1. Reponds TOUJOURS en francais
2. Le code C# DOIT etre dans un seul bloc \`\`\`csharp ... \`\`\`
3. Le namespace DOIT etre NinjaTrader.NinjaScript.${type === 'strategy' ? 'Strategies' : 'Indicators'}
4. OnStateChange avec 3 etats: SetDefaults, Configure, DataLoaded
5. Proprietes Brush publiques: TOUJOURS [XmlIgnore] + companion string Serializable
6. Indicateurs (RSI, MACD, etc.) crees dans State.DataLoaded SEULEMENT
7. Tags Draw DOIVENT etre uniques (ajouter CurrentBar dans le tag)
8. Alertes DOIVENT verifier State == State.Realtime
9. Panel info Draw.TextFixed en TopRight TOUJOURS present
10. Si Calculate == OnEachTick: protection anti-doublon obligatoire
11. Toutes proprietes publiques: [NinjaScriptProperty] [Display] [Range]
12. IsOverlay = true pour les indicateurs sur le chart principal

INSTRUCTIONS:
- Analyse la demande du client (en francais)
- Genere le code C# NinjaScript COMPLET et fonctionnel
- Explique brievement ce que fait le script (2-3 lignes)
- Le code sera automatiquement valide par le pipeline (audit 12 checks + test compilation)
- Si le client pose une question (pas de demande de script), reponds normalement sans code

KNOWLEDGE BASE NT8:
${context}`;
}

function buildMessages(userMessage, history) {
  const messages = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-6)) {
      if (msg.role && msg.content) {
        messages.push({ role: msg.role, content: String(msg.content) });
      }
    }
  }
  messages.push({ role: 'user', content: userMessage });
  return messages;
}

function extractCodeBlocks(text) {
  const blocks = [];
  const regex = /```csharp\n([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    blocks.push(match[1].trim());
  }
  return blocks;
}

function extractClassName(code) {
  const match = code.match(/public\s+class\s+(\w+)\s*:\s*(Indicator|Strategy)/);
  return match ? match[1] : null;
}

function detectScriptType(description) {
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

// ── 1. List Scripts ──
app.get('/api/nt8/scripts', (req, res) => {
  const result = handleListScripts();
  res.json({ success: true, data: result.content[0].text });
});

// ── 2. Get Script ──
app.get('/api/nt8/scripts/:name', (req, res) => {
  const result = handleGetScript(req.params.name);
  res.json({ success: true, data: result.content[0].text });
});

// ── 3. Generate Script ──
app.post('/api/nt8/generate', (req, res) => {
  const { description, type, instrument, timeframe } = req.body;
  if (!description) return res.status(400).json({ error: 'description requise' });

  const result = handleGenerateScript({ description, type, instrument, timeframe });
  res.json({ success: true, data: result.content[0].text });
});

// ── 4. Update Code ──
app.post('/api/nt8/update', (req, res) => {
  const { code, script_type } = req.body;
  if (!code) return res.status(400).json({ error: 'code requis' });

  const result = handleUpdateCode({ code, script_type });
  res.json({ success: true, data: result.content[0].text });
});

// ── 5. Audit Script ──
app.post('/api/nt8/audit', (req, res) => {
  const { code, strict, auto_fix } = req.body;
  if (!code) return res.status(400).json({ error: 'code requis' });

  const result = handleAuditScript({ code, strict, auto_fix });
  res.json({ success: true, data: result.content[0].text, audit: result.auditResult });
});

// ── 6. Test Compilation ──
app.post('/api/nt8/test', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code requis' });

  const result = handleTestCompilation({ code });
  res.json({ success: true, data: result.content[0].text, test: result.testResult });
});

// ── 7. Deliver Script ──
app.post('/api/nt8/deliver', (req, res) => {
  const { code, name, type, description } = req.body;
  if (!code || !name || !type) return res.status(400).json({ error: 'code, name, type requis' });

  const result = handleDeliverScript({ code, name, type, description: description || '' });
  res.json({ success: true, data: result.content[0].text });
});

// ── 8. Run Pipeline ──
app.post('/api/nt8/pipeline', (req, res) => {
  const { description, type, instrument, timeframe, auto_fix } = req.body;
  if (!description) return res.status(400).json({ error: 'description requise' });

  const result = handleRunPipeline({ description, type, instrument, timeframe, auto_fix });
  res.json({ success: true, data: result.content[0].text });
});

// ── 9. Validate and Deliver ──
app.post('/api/nt8/validate', (req, res) => {
  const { code, name, type, description, auto_fix } = req.body;
  if (!code || !name || !type) return res.status(400).json({ error: 'code, name, type requis' });

  const result = handleValidateAndDeliver({ code, name, type, description: description || '', auto_fix });
  res.json({ success: true, data: result.content[0].text });
});

const PORT = process.env.PORT || 8921;
app.listen(PORT, '127.0.0.1', () => {
  console.log(`NinjaTrader 8 MCP API running on http://127.0.0.1:${PORT}`);
  console.log(`Claude API: ${anthropic ? 'CONNECTED' : 'NO KEY - chat disabled'}`);
});
