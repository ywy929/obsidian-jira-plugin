import { parseTasksOnHand, laneForProject } from '../../src/daily/tasksOnHandParser';

const sample = `---
type: team
---

# IoT Team Tasks on Hand

## Yeow (Senior)

| Task                    | Project | Status      | Notes      |
| ----------------------- | ------- | ----------- | ---------- |
| Tram UI close-out       | Tram    | In Progress | near done  |
| GIMS docs review        | GIMS    | In Review   | awaiting PR |
| Junior dev result review | All    | Ongoing     |            |

## Junior Developer

| Task                | Project | Status      | Notes |
| ------------------- | ------- | ----------- | ----- |
| AdvanLED testing    | GIMS    | In Progress |       |

## Notes

- Some notes here
`;

describe('parseTasksOnHand', () => {
  it('returns empty array when the owner heading is missing', () => {
    expect(parseTasksOnHand(sample, 'Nonexistent Person')).toEqual([]);
  });

  it("extracts only the owner's section rows", () => {
    const items = parseTasksOnHand(sample, 'Yeow (Senior)');
    expect(items).toHaveLength(3);
    expect(items.map(i => i.task)).toEqual([
      'Tram UI close-out',
      'GIMS docs review',
      'Junior dev result review',
    ]);
    expect(items.map(i => i.project)).toEqual(['Tram', 'GIMS', 'All']);
    expect(items.map(i => i.status)).toEqual(['In Progress', 'In Review', 'Ongoing']);
  });

  it("does not leak rows from another section", () => {
    const items = parseTasksOnHand(sample, 'Yeow (Senior)');
    expect(items.find(i => i.task === 'AdvanLED testing')).toBeUndefined();
  });

  it('sets notes to undefined when the cell is empty', () => {
    const items = parseTasksOnHand(sample, 'Yeow (Senior)');
    expect(items[2].notes).toBeUndefined();
    expect(items[0].notes).toBe('near done');
  });
});

describe('laneForProject', () => {
  it('maps known project labels to lanes', () => {
    expect(laneForProject('Tram')).toBe('Tram');
    expect(laneForProject('tram')).toBe('Tram');
    expect(laneForProject('GIMS')).toBe('GIMS');
    expect(laneForProject('SL')).toBe('Smart Street Light');
    expect(laneForProject('Smart Street Light')).toBe('Smart Street Light');
  });

  it('maps All and unknown labels to Cross-cutting', () => {
    expect(laneForProject('All')).toBe('Cross-cutting');
    expect(laneForProject('CCTV')).toBe('Cross-cutting');
    expect(laneForProject('')).toBe('Cross-cutting');
  });
});
