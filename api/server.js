import express from 'express';
import cors from 'cors';
import { loadKnowledgeBase } from '../dist/knowledge/loader.js';
import { handleListScripts } from '../dist/tools/list-scripts.js';
import { handleGetScript } from '../dist/tools/get-script.js';
import { handleGenerateScript } from '../dist/tools/generate-script.js';
import { handleUpdateCode } from '../dist/tools/update-code.js';
import { handleAuditScript } from '../dist/tools/audit-script.js';
import { handleTestCompilation } from '../dist/tools/test-compilation.js';
import { handleDeliverScript } from '../dist/tools/deliver-script.js';
import { handleRunPipeline, handleValidateAndDeliver } from '../dist/tools/run-pipeline.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

// Load knowledge base at startup
const kb = loadKnowledgeBase();
console.log(`Knowledge base loaded: ${kb.scripts.length} scripts, ${kb.patterns.length} patterns`);

// ── Health check ──
app.get('/api/nt8/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    scripts: kb.scripts.length,
    patterns: kb.patterns.length,
    tools: 9
  });
});

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
});
