"use client";

import Papa from "papaparse";
import type { Cell } from "@/lib/sales-import";

/** Reads a CSV or .xlsx file in the browser into rows of cells. */
export async function readSpreadsheet(file: File): Promise<Cell[][]> {
  const name = file.name.toLowerCase();

  if (name.endsWith(".csv") || name.endsWith(".txt") || file.type === "text/csv") {
    const text = await file.text();
    const result = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
    return result.data;
  }

  if (name.endsWith(".xlsx")) {
    // Loaded only when needed, so the page stays fast for CSV files.
    const { readSheet } = await import("read-excel-file/browser");
    return (await readSheet(file)) as Cell[][];
  }

  if (name.endsWith(".xls")) {
    throw new Error("Old .xls files can't be read. Open it in Excel or Google Sheets and save it as .xlsx or .csv.");
  }
  throw new Error("Choose a .csv or .xlsx file.");
}
