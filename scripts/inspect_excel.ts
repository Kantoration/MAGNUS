/**
 * Quick script to inspect Excel file contents
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
  const data = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

  console.log(`📊 Total Rows: ${data.length}\n`);
  console.log(`📝 Headers: ${Object.keys(data[0] || {}).join(', ')}\n`);

  console.log(`📌 Templates Found:\n`);
  for (const row of data) {
    const rowData = row as Record<string, any>;
    const taskType = rowData['שם סוג משימה'] || rowData['Task Type'] || rowData['name'];
    const messagePreview = (rowData['מלל הודעה'] || rowData['Message'] || rowData['message'] || '').substring(0, 50);
    const link = rowData['קישור'] || rowData['Link'] || rowData['link'] || '';
    const glassixTemplate = rowData['שם הודעה מובנית בגלאסיקס'] || rowData['Glassix Template'] || '';

    console.log(`  • ${taskType}`);
    console.log(`    Message: ${messagePreview}${messagePreview.length >= 50 ? '...' : ''}`);
    if (link) console.log(`    Link: ${link}`);
    if (glassixTemplate) console.log(`    Glassix Template: ${glassixTemplate}`);
    console.log('');
  }
}

inspectExcel().catch(console.error);

