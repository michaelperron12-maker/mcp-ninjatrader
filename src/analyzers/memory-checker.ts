export interface MemoryIssue {
  severity: 'ERROR' | 'WARNING';
  message: string;
  line: number;
}

export function checkMemory(code: string): MemoryIssue[] {
  const issues: MemoryIssue[] = [];
  const lines = code.split('\n');

  // 1. Check Series<T> initialization location
  const seriesNewRegex = /new\s+Series<\w+>\s*\(\s*this\s*\)/g;
  let match;

  while ((match = seriesNewRegex.exec(code)) !== null) {
    const beforeMatch = code.substring(0, match.index);
    const lineNum = beforeMatch.split('\n').length;

    // Check if inside DataLoaded block
    const lastDataLoaded = beforeMatch.lastIndexOf('State.DataLoaded');
    const lastSetDefaults = beforeMatch.lastIndexOf('State.SetDefaults');
    const lastOnBarUpdate = beforeMatch.lastIndexOf('OnBarUpdate');

    if (lastOnBarUpdate > lastDataLoaded) {
      issues.push({
        severity: 'ERROR',
        message: `new Series<T>(this) dans OnBarUpdate — doit être dans State.DataLoaded`,
        line: lineNum
      });
    } else if (lastSetDefaults > lastDataLoaded) {
      issues.push({
        severity: 'ERROR',
        message: `new Series<T>(this) dans SetDefaults — doit être dans State.DataLoaded`,
        line: lineNum
      });
    }
  }

  // 2. Check indicator instantiation location
  const indicatorPatterns = [
    'RSI', 'MACD', 'SMA', 'EMA', 'ATR', 'Swing', 'Bollinger', 'Stochastics',
    'VWAP', 'ADX', 'CCI', 'TEMA', 'WMA', 'OBV', 'MFI', 'DonchianChannel',
    'KeltnerChannel', 'ParabolicSAR', 'WilliamsR', 'Momentum', 'ROC'
  ];

  for (const ind of indicatorPatterns) {
    const indRegex = new RegExp(`=\\s*${ind}\\s*\\(`, 'g');
    while ((match = indRegex.exec(code)) !== null) {
      const beforeMatch = code.substring(0, match.index);
      const lineNum = beforeMatch.split('\n').length;

      const lastSetDefaults = beforeMatch.lastIndexOf('State.SetDefaults');
      const lastDataLoaded = beforeMatch.lastIndexOf('State.DataLoaded');
      const lastOnBarUpdate = beforeMatch.lastIndexOf('OnBarUpdate');

      // Skip if in a comment
      const currentLine = lines[lineNum - 1];
      if (currentLine.trim().startsWith('//') || currentLine.trim().startsWith('*')) continue;

      if (lastSetDefaults > lastDataLoaded && lastSetDefaults > lastOnBarUpdate) {
        issues.push({
          severity: 'ERROR',
          message: `Indicateur ${ind}() créé dans SetDefaults — doit être dans State.DataLoaded`,
          line: lineNum
        });
      }
    }
  }

  // 3. Check unbounded List growth (FIFO rotation)
  const listAddRegex = /(\w+)\.Add\s*\(/g;
  const listVars = new Set<string>();

  while ((match = listAddRegex.exec(code)) !== null) {
    listVars.add(match[1]);
  }

  for (const varName of listVars) {
    // Skip known safe patterns (queue, sigQueue that get cleared)
    const hasClear = new RegExp(`${varName}\\.Clear\\s*\\(`).test(code);
    const hasRemoveAt = new RegExp(`${varName}\\.RemoveAt\\s*\\(`).test(code);
    const hasCountCheck = new RegExp(`${varName}\\.Count\\s*[>>=]`).test(code);

    // Check if it's a List type
    const isListDecl = new RegExp(`List<[^>]+>\\s+${varName}`).test(code);

    if (isListDecl && !hasClear && !hasRemoveAt && !hasCountCheck) {
      issues.push({
        severity: 'WARNING',
        message: `Liste "${varName}" grandit sans limite (pas de RemoveAt/Clear/Count check) — risque mémoire sur graphiques longs`,
        line: 0
      });
    }
  }

  // 4. Check for Draw tags without CurrentBar (static tags for per-bar drawings)
  const drawRegex = /Draw\.(?:ArrowUp|ArrowDown|Text|TriangleUp|TriangleDown|Diamond|Dot|Square)\s*\(\s*this\s*,\s*"([^"]+)"/g;
  while ((match = drawRegex.exec(code)) !== null) {
    const tag = match[1];
    const lineNum = code.substring(0, match.index).split('\n').length;

    // Check if tag is static (no concatenation with CurrentBar)
    // Look at the full line for + CurrentBar or string interpolation
    const fullLine = lines[lineNum - 1];
    const hasCurrentBar = /CurrentBar|tagN|\+\+|counter/i.test(fullLine);

    // Fixed-position tags are fine (like "infoPanel")
    const isFixedTag = tag === 'infoPanel' || tag === 'info' || tag === 'status' || tag === 'waiting';

    if (!hasCurrentBar && !isFixedTag) {
      issues.push({
        severity: 'ERROR',
        message: `Draw tag statique "${tag}" — sera écrasé à chaque barre. Utiliser "${tag}" + CurrentBar`,
        line: lineNum
      });
    }
  }

  return issues;
}
