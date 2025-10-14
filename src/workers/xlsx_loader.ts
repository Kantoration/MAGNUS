/**
 * Worker thread for loading large XLSX files without blocking the event loop
 * Uses Node.js Worker Threads to offload CPU-intensive parsing
 */

import { parentPort, workerData } from 'worker_threads';
import XLSX from 'xlsx';
import { promises as fs } from 'fs';

interface WorkerInput {
  filePath: string;
  sheetSelector?: string;
}

interface WorkerOutput {
  success: boolean;
  data?: unknown[];
  sheetName?: string;
  error?: string;
}

/**
 * Worker entry point - parses XLSX file and returns data
 */
async function parseXLSX(): Promise<void> {
  if (!parentPort) {
    throw new Error('This module must be run as a Worker');
  }

  try {
    const input = workerData as WorkerInput;
    const { filePath, sheetSelector } = input;

    // Read file as buffer
    const fileBuffer = await fs.readFile(filePath);
    
    // Parse workbook (CPU-intensive operation)
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

    // Determine which sheet to use
    let targetSheet: XLSX.WorkSheet | undefined;
    let targetSheetName: string | undefined;

    if (sheetSelector) {
      // Try to parse as index first
      const sheetIndex = parseInt(sheetSelector, 10);
      
      if (!isNaN(sheetIndex)) {
        targetSheetName = workbook.SheetNames[sheetIndex];
        if (targetSheetName) {
          targetSheet = workbook.Sheets[targetSheetName];
        }
      } else {
        // Use sheet name
        targetSheetName = sheetSelector;
        targetSheet = workbook.Sheets[sheetSelector];
      }
      
      if (!targetSheet) {
        throw new Error(
          `Sheet "${sheetSelector}" not found. Available sheets: ${workbook.SheetNames.join(', ')}`
        );
      }
    } else {
      // Use first sheet by default
      targetSheetName = workbook.SheetNames[0];
      targetSheet = workbook.Sheets[targetSheetName];
    }

    if (!targetSheet) {
      throw new Error('Excel file has no sheets');
    }

    // Convert to JSON (CPU-intensive operation)
    const data = XLSX.utils.sheet_to_json(targetSheet, {
      defval: '',
    });

    const result: WorkerOutput = {
      success: true,
      data,
      sheetName: targetSheetName,
    };

    parentPort.postMessage(result);
  } catch (error: unknown) {
    const result: WorkerOutput = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    
    parentPort.postMessage(result);
  }
}

// Execute worker
parseXLSX().catch((error) => {
  if (parentPort) {
    const result: WorkerOutput = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
    parentPort.postMessage(result);
  }
});

