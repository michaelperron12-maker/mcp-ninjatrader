export interface MTFIssue {
  severity: 'ERROR' | 'WARNING';
  message: string;
  line: number;
}

export function checkMultiTimeframe(code: string): MTFIssue[] {
  const issues: MTFIssue[] = [];
  const lines = code.split('\n');

  // Check if multi-timeframe is used
  const addDataSeriesMatches = [...code.matchAll(/AddDataSeries\s*\(/g)];
  if (addDataSeriesMatches.length === 0) return issues; // Single timeframe, no checks needed

  const numSeries = addDataSeriesMatches.length;

  // 1. Check AddDataSeries is in Configure
  for (const m of addDataSeriesMatches) {
    const beforeMatch = code.substring(0, m.index);

    // Simple check: is it inside a Configure block?
    const lastConfigurePos = beforeMatch.lastIndexOf('State.Configure');
    const lastSetDefaultsPos = beforeMatch.lastIndexOf('State.SetDefaults');
    const lastDataLoadedPos = beforeMatch.lastIndexOf('State.DataLoaded');
    const lastOnBarUpdatePos = beforeMatch.lastIndexOf('OnBarUpdate');

    if (lastOnBarUpdatePos > lastConfigurePos) {
      const lineNum = beforeMatch.split('\n').length;
      issues.push({
        severity: 'ERROR',
        message: 'AddDataSeries() appelé dans OnBarUpdate au lieu de Configure',
        line: lineNum
      });
    }
  }

  // 2. Check BarsInProgress guard in OnBarUpdate
  const onBarUpdateMatch = code.match(/protected\s+override\s+void\s+OnBarUpdate\s*\(\s*\)/);
  if (onBarUpdateMatch) {
    // Find the OnBarUpdate body
    const startIdx = onBarUpdateMatch.index! + onBarUpdateMatch[0].length;
    const bodyStart = code.indexOf('{', startIdx);
    if (bodyStart !== -1) {
      // Check first 10 lines of OnBarUpdate body for BarsInProgress check
      const bodyLines = code.substring(bodyStart).split('\n').slice(0, 15).join('\n');

      if (!/BarsInProgress\s*!=\s*0/.test(bodyLines) && !/BarsInProgress\s*==\s*0/.test(bodyLines)) {
        const lineNum = code.substring(0, bodyStart).split('\n').length;
        issues.push({
          severity: 'ERROR',
          message: `${numSeries} AddDataSeries() trouvé(s) mais pas de check BarsInProgress dans OnBarUpdate — les séries secondaires vont exécuter la logique principale`,
          line: lineNum + 1
        });
      }
    }
  }

  // 3. Check CurrentBars[N] guards for each secondary series
  for (let i = 1; i <= numSeries; i++) {
    const hasCurrentBarsCheck = new RegExp(`CurrentBars\\[${i}\\]`).test(code);
    if (!hasCurrentBarsCheck) {
      // Also check generic pattern like CurrentBars[1] < 50
      const hasGenericCheck = /CurrentBars\[\d+\]\s*</.test(code);
      if (!hasGenericCheck) {
        issues.push({
          severity: 'WARNING',
          message: `Pas de vérification CurrentBars[${i}] — la série secondaire ${i} pourrait ne pas avoir assez de barres`,
          line: 0
        });
      }
    }
  }

  // 4. Check BarsArray usage in DataLoaded for indicator creation
  const hasIndicatorOnSecondary = /BarsArray\[\d+\]/.test(code);
  if (hasIndicatorOnSecondary) {
    // Check that BarsArray references are within DataLoaded
    const barsArrayMatches = [...code.matchAll(/BarsArray\[(\d+)\]/g)];
    for (const m of barsArrayMatches) {
      const idx = parseInt(m[1]);
      if (idx > numSeries) {
        const lineNum = code.substring(0, m.index).split('\n').length;
        issues.push({
          severity: 'ERROR',
          message: `BarsArray[${idx}] référence une série qui n'existe pas (seulement ${numSeries} AddDataSeries)`,
          line: lineNum
        });
      }
    }
  }

  return issues;
}
