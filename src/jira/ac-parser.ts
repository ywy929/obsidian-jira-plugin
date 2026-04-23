const HEADING_REGEX = /^(?:\*\*acceptance criteria\*\*|#{1,3}\s*acceptance criteria)\s*$/im;
const BULLET_REGEX = /^[\s]*[*-]\s+(.+?)\s*$/;

export function parseAcceptanceCriteria(description: string | undefined): string[] {
  if (!description) return [];
  if (typeof description !== 'string') return [];

  const lines = description.split(/\r?\n/);
  const headingIndex = lines.findIndex(line => HEADING_REGEX.test(line.trim()));
  if (headingIndex === -1) return [];

  const bullets: string[] = [];
  let sawFirstBullet = false;

  for (let i = headingIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // skip leading blank lines before bullets start
    if (!sawFirstBullet && trimmed === '') continue;

    // stop on blank line after bullets, or on next heading
    if (sawFirstBullet && trimmed === '') break;
    if (trimmed.startsWith('#') || /^\*\*[^*]+\*\*\s*$/.test(trimmed)) break;

    const match = BULLET_REGEX.exec(line);
    if (match) {
      bullets.push(match[1].trim());
      sawFirstBullet = true;
    } else if (sawFirstBullet) {
      // non-bullet line after bullets started — end of AC section
      break;
    }
  }

  return bullets;
}
