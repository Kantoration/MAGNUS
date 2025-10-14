/**
 * Inspect Excel file - show raw structure
 */
import XLSX from 'xlsx';
import { promises as fs } from 'fs';

const filePath = process.argv[2] || 'messages_v1.xlsx';

async function inspectExcel() {
  console.log(`📋 Inspecting: ${filePath}\n`);

  const fileBuffer = await fs.readFile(filePath);
  const workbook = XLSX.read(fileBuffer, { type: 'buffer' });

  console.log(`📄 Sheets: ${workbook.SheetNames.join(', ')}\n`);

  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  
  // Get raw sheet data (includes all cells)
  const range = XLSX.utils.decode_range(firstSheet['!ref'] || 'A1');
  
  console.log(`📐 Range: ${firstSheet['!ref']}\n`);
  console.log(`📊 First 5 rows (raw):\n`);
  
  for (let row = range.s.r; row <= Math.min(range.s.r + 10, range.e.r); row++) {
    const rowData: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = firstSheet[cellAddress];
      const value = cell ? String(cell.v) : '';
      rowData.push(value || '(empty)');
    }
    console.log(`Row ${row + 1}: ${rowData.join(' | ')}`);
  }
  
  console.log('\n📋 Parsed as JSON (with defval):\n');
  const data = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });
  console.log(JSON.stringify(data.slice(0, 5), null, 2));
}

inspectExcel().catch(console.error);

