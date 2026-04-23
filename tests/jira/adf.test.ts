import { adfToMarkdown, normalizeDescription } from '../../src/jira/adf';

describe('adfToMarkdown', () => {
  it('returns empty string for null/undefined', () => {
    expect(adfToMarkdown(null)).toBe('');
    expect(adfToMarkdown(undefined)).toBe('');
  });

  it('converts a doc with heading + bulletList into markdown', () => {
    const doc = {
      type: 'doc',
      version: 1,
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Acceptance Criteria' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Second' }] }],
            },
          ],
        },
      ],
    };
    const md = adfToMarkdown(doc);
    expect(md).toContain('## Acceptance Criteria');
    expect(md).toContain('- First');
    expect(md).toContain('- Second');
  });

  it('preserves strong, em, code, link marks', () => {
    const doc = {
      type: 'doc',
      content: [{
        type: 'paragraph',
        content: [
          { type: 'text', text: 'hello ', marks: [{ type: 'strong' }] },
          { type: 'text', text: 'world', marks: [{ type: 'link', attrs: { href: 'https://x.com' } }] },
        ],
      }],
    };
    const md = adfToMarkdown(doc);
    expect(md).toContain('**hello **');
    expect(md).toContain('[world](https://x.com)');
  });
});

describe('normalizeDescription', () => {
  it('returns undefined for null/undefined', () => {
    expect(normalizeDescription(null)).toBeUndefined();
    expect(normalizeDescription(undefined)).toBeUndefined();
  });

  it('passes through plain strings unchanged', () => {
    expect(normalizeDescription('hello')).toBe('hello');
  });

  it('converts an ADF object into markdown string', () => {
    const adf = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'body' }] }],
    };
    const result = normalizeDescription(adf);
    expect(typeof result).toBe('string');
    expect(result).toContain('body');
  });
});
