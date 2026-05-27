#  — Payroll & Attendance Dashboard

A Power BI–style interactive dashboard for managing monthly payroll, attendance, employees, and holidays. Built with React + Vite + Recharts.

## ✨ Features

- **Overview** — KPI cards, firm-wise bar/pie charts, 12-month yearly trend, top earners
- **Attendance** — Enter days-present per employee per month; salary, ESI, bonus, and net-payable recalculate live
- **Employees** — Add / edit / delete employees; change salaries, ESI applicability, and bonus eligibility
- **Holiday Calendar** — Interactive monthly grid; click any holiday to toggle whether the company observes it (useful when working on a public holiday)
- **Persistence** — All edits auto-save to your browser (localStorage)
- **Backup & Restore** — Export / import JSON backups
- **Excel Export** — Download the current month's payroll as a formatted .xlsx
- **Month Picker** — Switch between months/years; data scoped per-month

## 🚀 Local development

```bash
npm install
npm run dev          # dev server at http://localhost:5173
npm run build        # production build to ./dist
npm run preview      # preview the built app locally
```

## ☁️ Cloud Deployment (free)

### Netlify Drop (easiest, NO account setup needed, ~30 seconds)

1. Run `npm install && npm run build` locally — creates a `dist/` folder
2. Open https://app.netlify.com/drop
3. Drag the `dist/` folder onto the page
4. Your site is live at a `.netlify.app` URL instantly

(Create a free account afterwards to claim the site and get a nicer URL.)


## 📁 Project structure

```
src/
├── seedData.js          — employees, holidays, attendance (initial data from Excel)
├── payroll.js           — calculation engine (ESI, bonus, per-day salary, etc.)
├── App.jsx              — main app shell, tabs, state, persistence
├── index.css            — design system (amber-on-charcoal editorial theme)
└── pages/
    ├── Overview.jsx     — KPIs + charts + firm breakdown
    ├── Attendance.jsx   — monthly days-present entry
    ├── Employees.jsx    — employee CRUD
    └── Holidays.jsx     — interactive holiday calendar
```

## 🧮 Calculation formulas (unchanged from the original Excel)

- **Per-day salary** = `monthly_salary / total_days_in_month`
- **Days absent** = `total_days − days_present − public_holidays` (min 0)
- **Gross after absence** = `per_day × (total_days − days_absent)`
- **ESI employee** = `gross × 0.75%` (if ESI applicable, deducted)
- **Employer ESI** = `gross × 3.25%` (company pays)
- **Bonus** = `gross × 8.33%` (if bonus applicable)
- **Net payable** = `gross − ESI + bonus`

## 💾 Data storage

All edits are kept in `localStorage` under the key `anushree-payroll-v1`. To migrate to a new device, use the **Backup** button to download a JSON file and **Restore** on the target device.

If you ever need to wipe everything and return to the original Excel data, use **"Reset to original"** in the footer.

---

Built to replace the original `Anushree_Electrical_Attendance_2026.xlsx` workbook with a live, editable, deployable dashboard.
