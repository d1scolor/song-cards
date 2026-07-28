export const printDensityOptions = [1, 4, 9, 16] as const;
export type PrintDensity = (typeof printDensityOptions)[number];

export function printSheetColumns(cardsPerSheet: PrintDensity) {
  return Math.sqrt(cardsPerSheet);
}

export function makePrintSheets<T>(
  items: T[],
  cardsPerSheet: PrintDensity
): (T | null)[][] {
  return Array.from(
    { length: Math.ceil(items.length / cardsPerSheet) },
    (_, index) => {
      const itemsForSheet = items.slice(
        index * cardsPerSheet,
        (index + 1) * cardsPerSheet
      );
      return [
        ...itemsForSheet,
        ...Array<T | null>(cardsPerSheet - itemsForSheet.length).fill(
          null
        )
      ];
    }
  );
}

export function mirrorPrintRows<T>(
  items: (T | null)[],
  columns: number
): (T | null)[] {
  return Array.from(
    { length: items.length / columns },
    (_, row) =>
      items
        .slice(
          row * columns,
          (row + 1) * columns
        )
        .reverse()
  ).flat();
}
