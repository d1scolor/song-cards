export function parseCardRange(input: string, cardCount: number): number[] {
  const normalized = input.trim();
  if (!normalized) return [];

  const selected = new Set<number>();
  for (const segment of normalized.split(",")) {
    const match = segment.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) {
      throw new Error("Use numbers and ranges such as 1-3, 7-10.");
    }

    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > cardCount) {
      throw new Error(
        `Choose numbers between 1 and ${cardCount}, with the lower number first.`
      );
    }
    for (let index = start; index <= end; index += 1) {
      selected.add(index);
    }
  }
  return [...selected].sort((left, right) => left - right);
}

export function formatCardRange(indices: number[]): string {
  const sorted = [...new Set(indices)].sort((left, right) => left - right);
  const ranges: string[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const start = sorted[index];
    let end = start;
    while (
      index + 1 < sorted.length &&
      sorted[index + 1] === end + 1
    ) {
      index += 1;
      end = sorted[index];
    }
    ranges.push(start === end ? String(start) : `${start}-${end}`);
  }

  return ranges.join(", ");
}
