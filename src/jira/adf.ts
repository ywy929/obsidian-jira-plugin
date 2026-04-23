// Minimal ADF (Atlassian Document Format) → markdown-ish text converter.
// Preserves headings and bullet lists so parseAcceptanceCriteria can find them.
// Not a full-fidelity renderer — tables, panels, smart links etc. degrade to plain text.

export function adfToMarkdown(node: any): string {
  if (node === null || node === undefined) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(adfToMarkdown).join('');

  const type = node.type;
  const children = Array.isArray(node.content) ? node.content : [];

  switch (type) {
    case 'doc':
      return children.map(adfToMarkdown).join('').trimEnd();

    case 'text': {
      let t = String(node.text ?? '');
      const marks = Array.isArray(node.marks) ? node.marks : [];
      for (const m of marks) {
        if (m.type === 'strong') t = `**${t}**`;
        else if (m.type === 'em') t = `*${t}*`;
        else if (m.type === 'code') t = '`' + t + '`';
        else if (m.type === 'link' && m.attrs?.href) t = `[${t}](${m.attrs.href})`;
      }
      return t;
    }

    case 'paragraph':
      return children.map(adfToMarkdown).join('') + '\n\n';

    case 'heading': {
      const level = Math.max(1, Math.min(6, node.attrs?.level ?? 2));
      return '#'.repeat(level) + ' ' + children.map(adfToMarkdown).join('') + '\n\n';
    }

    case 'bulletList':
      return children.map(adfToMarkdown).join('');

    case 'orderedList':
      return children.map(adfToMarkdown).join('');

    case 'listItem': {
      const inner = children.map(adfToMarkdown).join('').replace(/\n+$/, '');
      return '- ' + inner + '\n';
    }

    case 'hardBreak':
      return '\n';

    case 'codeBlock': {
      const lang = node.attrs?.language ?? '';
      return '```' + lang + '\n' + children.map(adfToMarkdown).join('') + '\n```\n\n';
    }

    case 'blockquote':
      return children.map(adfToMarkdown).join('').split('\n').map(l => l ? '> ' + l : l).join('\n');

    case 'rule':
      return '\n---\n\n';

    case 'inlineCard':
    case 'mention':
    case 'emoji':
      return node.attrs?.text ?? node.attrs?.url ?? '';

    default:
      // unknown node — recurse into children so at least the text survives
      return children.map(adfToMarkdown).join('');
  }
}

/**
 * Normalizes a Jira description field that may arrive as plain string (legacy)
 * or ADF JSON (default for /rest/api/3 responses). Returns a markdown string
 * or undefined if input is nullish.
 */
export function normalizeDescription(raw: unknown): string | undefined {
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === 'string') return raw;
  if (typeof raw === 'object') return adfToMarkdown(raw);
  return String(raw);
}
