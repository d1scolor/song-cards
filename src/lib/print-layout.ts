export const cardsPerPrintSheet = 9;
export const printSheetColumns = 3;

export function makePrintSheets<T>(items: T[]): (T | null)[][] {
  return Array.from(
    { length: Math.ceil(items.length / cardsPerPrintSheet) },
    (_, index) => {
      const itemsForSheet = items.slice(
        index * cardsPerPrintSheet,
        (index + 1) * cardsPerPrintSheet
      );
      return [
        ...itemsForSheet,
        ...Array<T | null>(cardsPerPrintSheet - itemsForSheet.length).fill(
          null
        )
      ];
    }
  );
}

export function mirrorPrintRows<T>(items: (T | null)[]): (T | null)[] {
  return Array.from(
    { length: cardsPerPrintSheet / printSheetColumns },
    (_, row) =>
      items
        .slice(
          row * printSheetColumns,
          (row + 1) * printSheetColumns
        )
        .reverse()
  ).flat();
}
