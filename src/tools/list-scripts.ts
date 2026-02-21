import { listAllScripts, formatScriptList } from '../utils/script-catalog.js';

export function handleListScripts(): { content: Array<{ type: 'text'; text: string }> } {
  const scripts = listAllScripts();
  const formatted = formatScriptList(scripts);

  return {
    content: [{ type: 'text', text: formatted }]
  };
}
