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

// ── Agent System Prompts ──
const AGENT_BEST_PRACTICES_PROMPT = `Tu es l'Agent Best Practices NinjaTrader 8. Ton SEUL role est de reviewer du code NinjaScript C# et de le corriger selon les best practices NT8.

REGLES A VERIFIER ET CORRIGER:
1. Brush publiques: TOUJOURS [XmlIgnore] + companion string avec [Browsable(false)] pour serialisation
2. Indicateurs (RSI, MACD, EMA, etc.) crees UNIQUEMENT dans State.DataLoaded, JAMAIS dans SetDefaults ou OnBarUpdate
3. Tags Draw.ArrowUp/Down/Text: TOUJOURS inclure CurrentBar dans le tag pour unicite (ex: "Signal_" + CurrentBar)
4. Alertes: TOUJOURS verifier if (State == State.Realtime) avant Alert()
5. Panel info: Draw.TextFixed en TopRight TOUJOURS present avec les valeurs live
6. OnEachTick: si Calculate == Calculate.OnEachTick, OBLIGATOIRE protection anti-doublon (bool signalTriggered ou IsFirstTickOfBar)
7. Proprietes publiques: [NinjaScriptProperty] [Display(Name, GroupName, Order)] [Range(min, max)]
8. IsOverlay = true pour les indicateurs qui dessinent sur le chart principal
9. OnStateChange: 3 etats minimum (SetDefaults, Configure, DataLoaded)
10. using System; et les namespaces NinjaTrader requis
11. Pas de Print() en production (seulement debug)
12. Series<double> et Series<bool>: initialises dans State.DataLoaded avec new Series<T>(this)

SI le code a des problemes: retourne le code COMPLET corrige dans un bloc \`\`\`csharp ... \`\`\`
SI le code est deja conforme: dis "Code conforme aux best practices." SANS bloc de code.
Ne change JAMAIS la logique fonctionnelle du script, seulement les best practices.
Reponds en francais, sois BREF (2-3 lignes max + code si correction).`;

const AGENT_TESTER_PROMPT = `Tu es l'Agent Testeur NinjaTrader 8. Ton SEUL role est de trouver les BUGS et erreurs dans le code NinjaScript C# qui causeraient un crash ou un comportement incorrect.

VERIFICATIONS A FAIRE:
1. NullReferenceException: verifier que les indicateurs sont crees avant utilisation (State.DataLoaded)
2. IndexOutOfRange: verifier CurrentBar >= period avant d'acceder aux valeurs passees (Close[10] necessite CurrentBar >= 10)
3. Division par zero: verifier les denominateurs
4. State enum: State.SetDefaults, State.Configure, State.DataLoaded, State.Historical, State.Realtime, State.Terminated (PAS State.Filled, State.Rejected — ca c'est OrderState)
5. Draw methods: verifier les signatures (tag string, barsAgo int, prix double, Brush)
6. EnterLong/EnterShort: verifier qu'ils sont dans OnBarUpdate, pas dans OnStateChange
7. SetStopLoss/SetProfitTarget: verifier CalculationMode (Ticks, Price, Currency, Percent)
8. CrossAbove/CrossBelow: 3 parametres (series1, series2, lookback)
9. Verifier que OnBarUpdate a une garde CurrentBar minimum pour les indicateurs utilises
10. Multi-timeframe: BarsInProgress check si AddDataSeries est utilise

SI tu trouves des bugs: retourne le code COMPLET corrige dans un bloc \`\`\`csharp ... \`\`\`
SI aucun bug: dis "Aucun bug detecte." SANS bloc de code.
Ne change JAMAIS la logique fonctionnelle, corrige SEULEMENT les bugs.
Reponds en francais, sois BREF (2-3 lignes max + code si correction).`;

// ── Rate limiter (5 req/min per IP) ──
const chatRateLimit = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = chatRateLimit.get(ip);
  if (!entry || now > entry.resetTime) {
    chatRateLimit.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  if (entry.count >= 10) return false;
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

// ── Helper: call agent with timeout + 1 retry ──
async function callAgent(model, system, userContent, timeoutMs = 60000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await Promise.race([
        anthropic.messages.create({
          model,
          max_tokens: 16384,
          system,
          messages: [{ role: 'user', content: userContent }]
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout agent')), timeoutMs))
      ]);
      return result;
    } catch (err) {
      if (attempt === 0 && (err.message.includes('Timeout') || err.status === 529 || err.status === 500)) {
        continue; // retry once
      }
      throw err;
    }
  }
}

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

  let closed = false;
  res.on('close', () => { closed = true; });

  const send = (event, data) => {
    if (closed) return;
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { closed = true; }
  };

  // SSE keepalive — ping every 15s to prevent nginx/proxy timeout
  const keepalive = setInterval(() => {
    if (closed) { clearInterval(keepalive); return; }
    try { res.write(': keepalive\n\n'); } catch (e) { closed = true; clearInterval(keepalive); }
  }, 15000);

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
      model: 'claude-opus-4-6',
      max_tokens: 16384,
      system: systemPrompt,
      messages: messages
    });

    stream.on('text', (text) => {
      fullResponse += text;
      send('token', { text });
    });

    await stream.finalMessage();
    send('stage', { stage: 'generation', status: 'done' });

    if (closed) { clearInterval(keepalive); return res.end(); }

    // STAGE 3: Extract code blocks
    const codeBlocks = extractCodeBlocks(fullResponse);

    if (codeBlocks.length > 0) {
      let code = codeBlocks[0];
      let scriptName = extractClassName(code) || 'CustomScript_v1';
      send('code', { code, name: scriptName, type: detectedType });

      // ── AGENT 2: BEST PRACTICES REVIEWER (timeout 60s, 1 retry) ──
      send('stage', { stage: 'audit', status: 'start' });
      let agentLog = [];

      try {
        const bpResult = await callAgent(
          'claude-sonnet-4-20250514',
          AGENT_BEST_PRACTICES_PROMPT,
          `Voici le code NinjaScript a reviewer:\n\n\`\`\`csharp\n${code}\n\`\`\`\n\nType: ${detectedType}\nDescription: ${message}`
        );

        const bpText = bpResult.content[0].text;
        const bpCode = extractCodeBlocks(bpText);
        if (bpCode.length > 0) {
          code = bpCode[0];
          scriptName = extractClassName(code) || scriptName;
          agentLog.push('Best practices: corrige');
          send('code', { code, name: scriptName, type: detectedType });
        } else {
          agentLog.push('Best practices: OK');
        }
      } catch (bpErr) {
        console.error('Agent BP error:', bpErr.message);
        agentLog.push('Best practices: skip');
      }

      send('stage', { stage: 'audit', status: 'done' });

      if (closed) { clearInterval(keepalive); return res.end(); }

      // ── AGENT 3: TESTEUR (timeout 60s, 1 retry) ──
      send('stage', { stage: 'test', status: 'start' });

      try {
        const testResult = await callAgent(
          'claude-sonnet-4-20250514',
          AGENT_TESTER_PROMPT,
          `Voici le code NinjaScript a tester:\n\n\`\`\`csharp\n${code}\n\`\`\`\n\nType: ${detectedType}`
        );

        const testText = testResult.content[0].text;
        const testCode = extractCodeBlocks(testText);
        if (testCode.length > 0) {
          code = testCode[0];
          scriptName = extractClassName(code) || scriptName;
          agentLog.push('Testeur: bugs corriges');
          send('code', { code, name: scriptName, type: detectedType });
        } else {
          agentLog.push('Testeur: aucun bug');
        }
      } catch (testErr) {
        console.error('Agent Test error:', testErr.message);
        agentLog.push('Testeur: skip');
      }

      send('stage', { stage: 'test', status: 'done' });

      if (closed) { clearInterval(keepalive); return res.end(); }

      // ── STAGE 4: STATIC PIPELINE (audit + compilation + livraison) ──
      send('stage', { stage: 'delivery', status: 'start' });

      try {
        const pipelineResult = handleValidateAndDeliver({
          code, name: scriptName, type: detectedType,
          description: message, auto_fix: true
        });
        const pipelineText = pipelineResult.content[0].text;

        const agentSummary = agentLog.length > 0 ? '\n\n--- Agents AI ---\n' + agentLog.join(' | ') : '';
        send('pipeline', { report: pipelineText + agentSummary });

        if (!pipelineText.includes('Livraison annulee') && !pipelineText.includes('Livraison annulée')) {
          send('stage', { stage: 'delivery', status: 'done' });
          send('file', { filename: `${scriptName}.cs`, name: scriptName });
        } else {
          send('stage', { stage: 'delivery', status: 'error' });
        }
      } catch (pipeErr) {
        send('stage', { stage: 'delivery', status: 'error' });
        send('error', { message: 'Erreur pipeline: ' + pipeErr.message });
      }
    } else {
      // No code generated — just text response (questions, refus, etc.)
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

  clearInterval(keepalive);
  res.end();
});

// ── Chat helpers ──
function buildSystemPrompt(context, type) {
  return `Expert NinjaTrader 8 / NinjaScript C#. Scripts complets pour NT8 seulement.

STYLE OBLIGATOIRE:
- CONCIS. Phrases courtes. Va droit au but. Chaque mot doit etre utile.
- JAMAIS lire ou expliquer le code ligne par ligne. Le client est un trader, pas un developpeur.
- JAMAIS reciter ce que le code fait ("cette ligne cree un RSI", "ici on verifie le croisement...") — INUTILE.
- Apres generation: dis SEULEMENT le nom du script + 1 phrase de resume + "Teste-le sur ton chart."
- Si le client demande des explications, la il peut expliquer. Sinon, NON.

REGLE #1 — INSTRUMENTS SUPPORTES:
Futures: NQ, ES, CL, YM, GC, SI, RTY, ZB, NKD, 6E, 6J | Micros: MNQ, MES, MCL, MYM, MGC | Actions US | Forex
PAS supporte: Crypto, Options, CFDs → refuse poliment et suggere un future.

REGLE #2 — COMPRENDRE LE BUT AVANT DE CODER:
JAMAIS de bloc \`\`\`csharp sans confirmation du client.

ETAPE 1 — COMPRENDRE LE BUT:
La question #1 est TOUJOURS: "C'est quoi ton objectif avec ce script?"
Le client a une IDEE DE TRADING en tete. Tu dois la comprendre:
- Quel probleme il veut regler? (rater des entrees? pas de SL? trop de faux signaux?)
- Quelle est sa logique de trading? (croisement EMA? breakout? reversion?)
- C'est pour du scalping, du swing, ou du day trading?
Ensuite, pose 2-3 questions COURTES et SPECIFIQUES au contexte (pas une liste generique):
- Instrument + timeframe
- Parametres cles (periodes, niveaux, SL/TP si strategie)
- Alertes ou signaux visuels souhaites

ETAPE 2 — CONFIRMER:
Resume en 3-5 lignes MAX:
- But: [ce que le client veut accomplir]
- Logique: [la mecanique du script]
- Params: [instrument, timeframe, periodes, etc.]
"On est bon? Je genere."

ETAPE 3 — GENERER (apres "oui/ok/go/genere/c'est bon"):
Code COMPLET et fonctionnel.

REGLES TECHNIQUES:
1. Francais toujours
2. Un seul bloc \`\`\`csharp\`\`\`
3. Namespace: NinjaTrader.NinjaScript.${type === 'strategy' ? 'Strategies' : 'Indicators'}
4. OnStateChange: SetDefaults, Configure, DataLoaded
5. Brush publiques: [XmlIgnore] + companion string [Browsable(false)]
6. Indicateurs crees dans State.DataLoaded seulement
7. Tags Draw: inclure CurrentBar pour unicite
8. Alertes: verifier State == State.Realtime
9. Panel info: Draw.TextFixed TopRight toujours
10. OnEachTick: anti-doublon obligatoire
11. Proprietes: [NinjaScriptProperty] [Display] [Range]
12. IsOverlay = true si overlay chart

GENERER DIRECTEMENT (sans questions):
- Client dit "oui/ok/go/genere" apres confirmation
- Client colle un script pour audit/amelioration
- Modification d'un script deja genere dans la conversation

NE PAS GENERER:
- Nouvelle demande → comprendre + confirmer d'abord
- Instrument non supporte → refuser
- Question generale → repondre sans code

KNOWLEDGE BASE:
${context}`;
}

function buildMessages(userMessage, history) {
  const messages = [];
  if (history && Array.isArray(history)) {
    for (const msg of history.slice(-20)) {
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
