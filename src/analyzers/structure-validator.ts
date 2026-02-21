export interface StructureIssue {
  type: 'error' | 'warning';
  message: string;
}

export function validateStructure(code: string): StructureIssue[] {
  const issues: StructureIssue[] = [];

  // 1. Check class declaration
  const classMatch = code.match(/public\s+class\s+(\w+)\s*:\s*(Indicator|Strategy)/);
  if (!classMatch) {
    issues.push({ type: 'error', message: 'Aucune classe héritant de Indicator ou Strategy trouvée' });
    return issues; // Can't check further without a class
  }

  const className = classMatch[1];
  const baseClass = classMatch[2];

  // 2. Check OnStateChange exists
  if (!/protected\s+override\s+void\s+OnStateChange\s*\(\s*\)/.test(code)) {
    issues.push({ type: 'error', message: 'Méthode OnStateChange() manquante (obligatoire)' });
  } else {
    // Check all 3 states
    if (!/State\s*==\s*State\.SetDefaults/.test(code))
      issues.push({ type: 'error', message: 'State.SetDefaults manquant dans OnStateChange' });
    if (!/State\s*==\s*State\.Configure/.test(code))
      issues.push({ type: 'warning', message: 'State.Configure manquant dans OnStateChange (recommandé)' });
    if (!/State\s*==\s*State\.DataLoaded/.test(code))
      issues.push({ type: 'warning', message: 'State.DataLoaded manquant dans OnStateChange (recommandé si indicateurs utilisés)' });
  }

  // 3. Check OnBarUpdate exists
  if (!/protected\s+override\s+void\s+OnBarUpdate\s*\(\s*\)/.test(code)) {
    issues.push({ type: 'error', message: 'Méthode OnBarUpdate() manquante (obligatoire)' });
  }

  // 4. Check Name is set in SetDefaults
  if (!/Name\s*=\s*"/.test(code)) {
    issues.push({ type: 'warning', message: 'Propriété Name non définie dans SetDefaults' });
  }

  // 5. Check Description is set
  if (!/Description\s*=\s*[@"]/.test(code)) {
    issues.push({ type: 'warning', message: 'Propriété Description non définie dans SetDefaults' });
  }

  // 6. Check Calculate mode is set
  if (!/Calculate\s*=\s*Calculate\.\w+/.test(code)) {
    issues.push({ type: 'warning', message: 'Calculate mode non défini (défaut: OnBarClose)' });
  }

  // 7. Check namespace
  const nsMatch = code.match(/namespace\s+([\w.]+)/);
  if (nsMatch) {
    const ns = nsMatch[1];
    if (baseClass === 'Indicator' && !ns.includes('Indicators')) {
      issues.push({ type: 'error', message: `Namespace incorrect: ${ns} (devrait contenir Indicators pour un Indicator)` });
    }
    if (baseClass === 'Strategy' && !ns.includes('Strategies')) {
      issues.push({ type: 'error', message: `Namespace incorrect: ${ns} (devrait contenir Strategies pour un Strategy)` });
    }
  } else {
    issues.push({ type: 'error', message: 'Aucun namespace déclaré' });
  }

  // 8. Strategy-specific checks
  if (baseClass === 'Strategy') {
    // Check for entry methods
    if (!/EnterLong|EnterShort/.test(code)) {
      issues.push({ type: 'warning', message: 'Aucun EnterLong/EnterShort trouvé dans la stratégie' });
    }

    // Check signal name consistency
    const enterMatches = [...code.matchAll(/(?:EnterLong|EnterShort)\s*\(\s*\d+\s*,\s*"([^"]+)"/g)];
    const stopMatches = [...code.matchAll(/SetStopLoss\s*\(\s*"([^"]+)"/g)];
    const targetMatches = [...code.matchAll(/SetProfitTarget\s*\(\s*"([^"]+)"/g)];

    const entrySignals = new Set(enterMatches.map(m => m[1]));
    for (const m of stopMatches) {
      if (!entrySignals.has(m[1])) {
        issues.push({ type: 'error', message: `SetStopLoss signal "${m[1]}" ne correspond à aucun EnterLong/Short` });
      }
    }
    for (const m of targetMatches) {
      if (!entrySignals.has(m[1])) {
        issues.push({ type: 'error', message: `SetProfitTarget signal "${m[1]}" ne correspond à aucun EnterLong/Short` });
      }
    }

    // Check OnExecutionUpdate if position management
    if (/breakEven|entryPrice|Position\.MarketPosition/.test(code)) {
      if (!/OnExecutionUpdate/.test(code)) {
        issues.push({ type: 'warning', message: 'Gestion de position détectée mais OnExecutionUpdate manquant' });
      }
    }
  }

  return issues;
}
