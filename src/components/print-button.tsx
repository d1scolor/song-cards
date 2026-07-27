"use client";

import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button className="print-trigger" type="button" onClick={() => window.print()}>
      <Printer size={17} />
      Print
    </button>
  );
}
