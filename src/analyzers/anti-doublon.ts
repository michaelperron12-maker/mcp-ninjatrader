export interface DoublonIssue {
  severity: 'WARNING' | 'INFO';
  message: string;
  line: number;
}

export function checkAntiDoublon(code: string): DoublonIssue[] {
  const issues: DoublonIssue[] = [];
  const lines = code.split('\n');

  // Check if OnEachTick is used
  const onEachTick = /Calculate\s*=\s*Calculate\.OnEachTick/.test(code);
  if (!onEachTick) return issues; // OnBarClose doesn't need guards

  // Check for signal-generating code
  const hasArrows = /Draw\.Arrow(?:Up|Down)/.test(code);
  const hasAlerts = /Alert\s*\(/.test(code);
  const hasEntries = /(?:EnterLong|EnterShort)\s*\(/.test(code);

  if (!hasArrows && !hasAlerts && !hasEntries) return issues; // No signals to guard

  // Check for anti-doublon tracking variables
  const hasLastBarTracking = /(?:lastBull|lastBear|lastTick|lastSignal|lastBar)\w*\s*=\s*-?\d/.test(code);

  // Check for CurrentBar guard pattern
  const hasCurrentBarGuard = /CurrentBar\s*!=\s*(?:lastBull|lastBear|lastTick|lastSignal|lastBar)\w*/.test(code);

  if (!hasLastBarTracking || !hasCurrentBarGuard) {
    // Find lines with Draw.Arrow or Alert to report
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/Draw\.Arrow(?:Up|Down)/.test(line)) {
        // Check if there's a CurrentBar guard nearby (within 5 lines above)
        const context = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
        if (!/CurrentBar\s*!=\s*\w*(?:last|Last)\w*/.test(context)) {
          issues.push({
            severity: 'WARNING',
            message: `Draw.Arrow sur OnEachTick sans guard anti-doublon — signaux dupliqués possibles`,
            line: i + 1
          });
        }
      }
      if (/Alert\s*\(/.test(line) && !/State\.Realtime/.test(lines.slice(Math.max(0, i - 3), i + 1).join('\n'))) {
        // Alert check is separate, handled by alert checker
      }
    }

    if (issues.length === 0 && (hasArrows || hasEntries)) {
      issues.push({
        severity: 'WARNING',
        message: 'Calculate.OnEachTick détecté mais aucun pattern anti-doublon trouvé. Risque de signaux dupliqués.',
        line: 0
      });
    }
  }

  return issues;
}
