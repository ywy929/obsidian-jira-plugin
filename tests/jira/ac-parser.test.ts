import { parseAcceptanceCriteria } from '../../src/jira/ac-parser';

describe('parseAcceptanceCriteria', () => {
  it('returns empty array when description is empty or undefined', () => {
    expect(parseAcceptanceCriteria(undefined)).toEqual([]);
    expect(parseAcceptanceCriteria('')).toEqual([]);
  });

  it('returns empty array when no AC heading exists', () => {
    expect(parseAcceptanceCriteria('Just a normal description with bullets:\n* one\n* two')).toEqual([]);
  });

  it('extracts bullets under **Acceptance Criteria** bold heading', () => {
    const desc = '**Acceptance Criteria**\n\n* First criterion\n* Second criterion\n* Third criterion';
    expect(parseAcceptanceCriteria(desc)).toEqual(['First criterion', 'Second criterion', 'Third criterion']);
  });

  it('extracts bullets under ## Acceptance Criteria heading', () => {
    const desc = 'Some intro.\n\n## Acceptance Criteria\n\n* One\n* Two';
    expect(parseAcceptanceCriteria(desc)).toEqual(['One', 'Two']);
  });

  it('stops at blank line before next heading', () => {
    const desc = '**Acceptance Criteria**\n\n* AC1\n* AC2\n\n## Technical Notes\n\n* note1';
    expect(parseAcceptanceCriteria(desc)).toEqual(['AC1', 'AC2']);
  });

  it('handles - and * bullet markers', () => {
    const desc = '**Acceptance Criteria**\n\n- dash one\n- dash two';
    expect(parseAcceptanceCriteria(desc)).toEqual(['dash one', 'dash two']);
  });

  it('is case insensitive for the heading', () => {
    const desc = '**ACCEPTANCE CRITERIA**\n\n* one';
    expect(parseAcceptanceCriteria(desc)).toEqual(['one']);
  });

  it('trims whitespace from each bullet', () => {
    const desc = '**Acceptance Criteria**\n\n*   spaced out   \n*  another  ';
    expect(parseAcceptanceCriteria(desc)).toEqual(['spaced out', 'another']);
  });
});
