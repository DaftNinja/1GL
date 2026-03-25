## Packages
recharts | For visualizing financial data and technical spend
framer-motion | For smooth page transitions and loading animations
html2canvas | For generating screenshots/PDFs of the report (optional but good for export)
jspdf | For generating PDF reports

## Notes
The analysis generation (POST /api/analyze) is synchronous and may take time. The UI handles this with a polished loading state that simulates progress steps.
Images use clearbit for logos based on company domain if available.
