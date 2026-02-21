export interface SyntaxIssue {
  type: 'error' | 'warning';
  line: number;
  message: string;
}

export function checkSyntax(code: string): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];
  const lines = code.split('\n');

  // 1. Check balanced braces — strip strings and comments first
  const stripped = stripStringsAndComments(code);

  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;
  const strippedLines = stripped.split('\n');

  for (let i = 0; i < strippedLines.length; i++) {
    const line = strippedLines[i];
    for (const ch of line) {
      if (ch === '{') braceCount++;
      else if (ch === '}') braceCount--;
      else if (ch === '(') parenCount++;
      else if (ch === ')') parenCount--;
      else if (ch === '[') bracketCount++;
      else if (ch === ']') bracketCount--;

      if (braceCount < 0)
        issues.push({ type: 'error', line: i + 1, message: 'Accolade fermante en trop' });
      if (parenCount < 0)
        issues.push({ type: 'error', line: i + 1, message: 'Parenthèse fermante en trop' });
    }
  }

  if (braceCount > 0)
    issues.push({ type: 'error', line: lines.length, message: `${braceCount} accolade(s) ouvrante(s) non fermée(s)` });
  if (braceCount < 0)
    issues.push({ type: 'error', line: lines.length, message: `${Math.abs(braceCount)} accolade(s) fermante(s) en trop` });
  if (parenCount !== 0)
    issues.push({ type: 'error', line: lines.length, message: `Parenthèses déséquilibrées (${parenCount > 0 ? 'manque fermeture' : 'trop de fermetures'})` });
  if (bracketCount !== 0)
    issues.push({ type: 'error', line: lines.length, message: `Crochets déséquilibrés` });

  // 2. Check #region / #endregion balance
  let regionCount = 0;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('#region')) regionCount++;
    if (trimmed.startsWith('#endregion')) regionCount--;
    if (regionCount < 0)
      issues.push({ type: 'warning', line: i + 1, message: '#endregion sans #region correspondant' });
  }
  if (regionCount > 0)
    issues.push({ type: 'warning', line: lines.length, message: `${regionCount} #region sans #endregion` });

  return issues;
}

/**
 * Strip string literals and comments from C# code,
 * replacing their content with spaces to preserve line/column positions.
 * This prevents false positives from braces inside strings like "{0:F1}".
 */
function stripStringsAndComments(code: string): string {
  const result: string[] = [];
  let i = 0;

  while (i < code.length) {
    const ch = code[i];
    const next = i + 1 < code.length ? code[i + 1] : '';

    // Line comment //
    if (ch === '/' && next === '/') {
      // Skip to end of line
      while (i < code.length && code[i] !== '\n') {
        result.push(' ');
        i++;
      }
      continue;
    }

    // Block comment /* */
    if (ch === '/' && next === '*') {
      result.push(' ', ' ');
      i += 2;
      while (i < code.length) {
        if (code[i] === '*' && i + 1 < code.length && code[i + 1] === '/') {
          result.push(' ', ' ');
          i += 2;
          break;
        }
        result.push(code[i] === '\n' ? '\n' : ' ');
        i++;
      }
      continue;
    }

    // Verbatim string @"..."
    if (ch === '@' && next === '"') {
      result.push(' ', ' ');
      i += 2;
      while (i < code.length) {
        if (code[i] === '"') {
          if (i + 1 < code.length && code[i + 1] === '"') {
            // Escaped quote in verbatim string ""
            result.push(' ', ' ');
            i += 2;
            continue;
          }
          result.push(' ');
          i++;
          break;
        }
        result.push(code[i] === '\n' ? '\n' : ' ');
        i++;
      }
      continue;
    }

    // Regular string "..."
    if (ch === '"') {
      result.push(' ');
      i++;
      while (i < code.length && code[i] !== '\n') {
        if (code[i] === '\\') {
          result.push(' ', ' ');
          i += 2;
          continue;
        }
        if (code[i] === '"') {
          result.push(' ');
          i++;
          break;
        }
        result.push(' ');
        i++;
      }
      continue;
    }

    // Character literal '...'
    if (ch === '\'') {
      result.push(' ');
      i++;
      while (i < code.length && code[i] !== '\n') {
        if (code[i] === '\\') {
          result.push(' ', ' ');
          i += 2;
          continue;
        }
        if (code[i] === '\'') {
          result.push(' ');
          i++;
          break;
        }
        result.push(' ');
        i++;
      }
      continue;
    }

    // Regular character — keep as-is
    result.push(ch);
    i++;
  }

  return result.join('');
}
