# CRM Frontend

A minimal React + Vite + TypeScript frontend to kickstart your CRM UI. It uses a reddish-orange theme inspired by your logo and includes a left sidebar and a ticket form.

## Features
- Vite + React + TypeScript
- Reddish-orange theme via CSS variables
- Sidebar + header layout
- Ticket form with fields: Date of Service, Serial Token/RFP Number, Allotted To, Source, Priority, Status

## Prerequisites
- Node.js 18 or newer

## Run locally
```powershell
npm install
npm run dev
```
Then open the URL printed in the terminal (usually http://localhost:5173).

## Build
```powershell
npm run build
npm run preview
```

## Notes
- Sidebar buttons are placeholders for future navigation; we can wire them to a router later.
- Styling uses plain CSS; no frameworks required.