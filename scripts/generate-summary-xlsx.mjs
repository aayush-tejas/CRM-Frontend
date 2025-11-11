import XLSX from 'xlsx';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output Excel path at workspace root
const outputPath = path.resolve(__dirname, '..', '..', 'Project-Summary.xlsx');

function sheetFromObjects(rows) {
  return XLSX.utils.json_to_sheet(rows, { skipHeader: false });
}

const frontend = [
  { Phase: 'UI Foundation', Feature: 'Vite + React + TS scaffold', Description: 'Sidebar, header, light theme (reddish orange accents)', Status: 'Done' },
  { Phase: 'Tickets', Feature: 'Ticket form + list', Description: 'Create/Update/Delete tickets, validation & toasts, list view with actions', Status: 'Done' },
  { Phase: 'Excel I/O', Feature: 'Import and export', Description: 'SheetJS integration to import rows and export to .xlsx', Status: 'Done' },
  { Phase: 'Excel Import', Feature: 'Dedupe + replace duplicates', Description: 'Detect duplicates by Serial/RFP; UI option to replace with imported values', Status: 'Done' },
  { Phase: 'Validation & A11y', Feature: 'Field validation & ARIA', Description: 'Centralized validation, per-field blur validation, ARIA attributes', Status: 'Done' },
  { Phase: 'Model Expansion', Feature: 'Extended ticket fields', Description: 'Customer/Employee IDs & names, lead title/desc, estimated value, follow-up date', Status: 'Done' },
  { Phase: 'Customers', Feature: 'Customers form', Description: 'Validated customer info form; now posts to backend in Server mode', Status: 'Done' },
  { Phase: 'Employees', Feature: 'Employee form + panel', Description: 'Create/update/delete employees; unique Employee ID validation; server wiring', Status: 'Done' },
  { Phase: 'Auth', Feature: 'Local login/signup', Description: 'Salted SHA-256 hashing (Web Crypto), session gating, logout', Status: 'Done' },
  { Phase: 'Branding', Feature: 'Auth UI polish + logo', Description: 'Centered auth card, segmented tabs, larger VTL logo, header alignment fix', Status: 'Done' },
  { Phase: 'Collaboration', Feature: 'Activity feed', Description: 'Activity storage and feed UI for comments/updates per entity', Status: 'Done' },
  { Phase: 'Notifications', Feature: 'In-app notifications', Description: 'Bell icon, unread counts, mark read/all; auto notify for High/Urgent tickets', Status: 'Done' },
  { Phase: 'Server Toggle', Feature: 'Server mode switch', Description: 'Header toggle to switch between localStorage and backend API for Tickets/Employees/Customers', Status: 'Done' }
];

const backend = [
  { Area: 'Server', Feature: 'Node/Express + SQLite', Description: 'Express app, better-sqlite3 with WAL, migrations, CORS', Status: 'Done' },
  { Area: 'Migrations', Feature: 'Tables', Description: 'users, employees, customers, tenders', Status: 'Done' },
  { Area: 'Health', Feature: 'GET /health', Description: 'Basic healthcheck endpoint', Status: 'Done' },
  { Area: 'Tenders API', Feature: 'CRUD', Description: 'GET/POST/PUT/DELETE /api/tenders with Zod validation; camelCase JSON', Status: 'Done' },
  { Area: 'Employees API', Feature: 'CRUD', Description: 'GET/POST/PUT/DELETE /api/employees with Zod validation; camelCase JSON', Status: 'Done' },
  { Area: 'Customers API', Feature: 'CRUD', Description: 'GET/POST/PUT/DELETE /api/customers with Zod validation; camelCase JSON', Status: 'Done' }
];

const nextSteps = [
  { Priority: 'P2', Topic: 'Customers/Employees list UIs', Detail: 'Add tables for Customers similar to Employees panel to visualize server data' },
  { Priority: 'P3', Topic: 'Bulk import endpoint', Detail: 'Optional batch POST for tenders to accelerate Excel imports' },
  { Priority: 'P3', Topic: 'Server-side auth', Detail: 'Optional: move auth to backend with sessions/JWT and role-based permissions' },
  { Priority: 'P3', Topic: 'Notification deep-links', Detail: 'Clicking notifications navigates to and focuses the related entity' }
];

function main() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(frontend), 'Frontend');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(backend), 'Backend');
  XLSX.utils.book_append_sheet(wb, sheetFromObjects(nextSteps), 'Next Steps');

  // Ensure dir exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  XLSX.writeFile(wb, outputPath);
  console.log('Wrote', outputPath);
}

main();
