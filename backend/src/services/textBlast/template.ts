/** Column/placeholder keys match loosely: "First Name", "first-name" and "first_name" are the same. */
export function normKey(k: string): string {
  return (k ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const TOKEN_RE = /\{\{|\}\}|\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}/g;

/**
 * Fill {field} and {field|fallback}; {{ and }} give literal braces. `values` is keyed by normKey.
 * An empty value without a fallback is a problem (the person is held back, so nobody gets "Hi !").
 */
export function renderTemplate(template: string, values: Record<string, string>): { text: string; problems: string[] } {
  const problems: string[] = [];
  const text = template.replace(TOKEN_RE, (tok, label: string | undefined, fallback: string | undefined) => {
    if (tok === '{{') return '{';
    if (tok === '}}') return '}';
    const key = normKey(label!);
    if (!(key in values)) {
      problems.push(`no column called {${label}}`);
      return tok;
    }
    const v = (values[key] ?? '').trim();
    if (!v) {
      if (fallback !== undefined) return fallback;
      problems.push(`{${label}} is empty (or use {${label}|fallback})`);
      return tok;
    }
    return v;
  });
  return { text, problems: [...new Set(problems)] };
}

export function cleanText(s: string): string {
  return s
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
