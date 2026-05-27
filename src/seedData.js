// Seed data extracted from Anushree_Electrical_Attendance_2026.xlsx
// All values are editable from the UI — edits persist in localStorage.

const NO_DOCS = { aadhar: null, pan: null };

export const SEED_EMPLOYEES = [
  // Firm 1 — Electrical Engineers
  { id: 1,  name: 'Sumit Verma',    guardian: 'Mr. Subhas Chand',    firm: 'Electrical Engineers',       salary: 17000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 2,  name: 'Sajid',          guardian: 'Mr. Sagir Ahmed',     firm: 'Electrical Engineers',       salary: 17000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 3,  name: 'Shane Allam',    guardian: 'Mohd. Ahmed',         firm: 'Electrical Engineers',       salary: 20000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 4,  name: 'Mohd. Tabrez',   guardian: 'Mohd. Anes',          firm: 'Electrical Engineers',       salary: 20000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 5,  name: 'Salman',         guardian: 'Mohd. Yatik',         firm: 'Electrical Engineers',       salary: 16000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 6,  name: 'Mohd. Shanawaz', guardian: 'Mohd. Saleem',        firm: 'Electrical Engineers',       salary: 15500, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 7,  name: 'Naeem',          guardian: 'Mohd. Saleem',        firm: 'Electrical Engineers',       salary: 15500, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 8,  name: 'Imran',          guardian: 'Mohd. Shabhuddin',    firm: 'Electrical Engineers',       salary: 15500, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 9,  name: 'Amiit',          guardian: 'Mr. Sripal',          firm: 'Electrical Engineers',       salary: 15000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 10, name: 'Anil Kumar',     guardian: 'Mr. Ram Sharan',      firm: 'Electrical Engineers',       salary: 19500, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 11, name: 'Naseeb Ahmd',    guardian: 'Mr. Vazi Ahmed',      firm: 'Electrical Engineers',       salary: 14000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 12, name: 'Sapna',          guardian: 'Mr. Lokesh Kumar',    firm: 'Electrical Engineers',       salary: 20000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 13, name: 'Maneesha Garg',  guardian: 'Mr. Vishal Garg',     firm: 'Electrical Engineers',       salary: 25000, esi: false, bonus: true,  docs: NO_DOCS },
  { id: 14, name: 'Vandana Sharma', guardian: 'Mr. Vinay Sharma',    firm: 'Electrical Engineers',       salary: 20000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 15, name: 'Nand Lal',       guardian: 'Mr. Nack Chedi',      firm: 'Electrical Engineers',       salary: 20000, esi: true,  bonus: false, docs: NO_DOCS },
  // Firm 2 — Electrical Engineers India
  { id: 16, name: 'Imran',          guardian: 'Mohd. Ifran',         firm: 'Electrical Engineers India', salary: 21000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 17, name: 'Anil',           guardian: 'Mr. Pratap Singh',    firm: 'Electrical Engineers India', salary: 21000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 18, name: 'Poonam',         guardian: 'Mr. Mukesh Singh',    firm: 'Electrical Engineers India', salary: 12150, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 19, name: 'Faeem',          guardian: 'Mohd. Haji Yaseen',   firm: 'Electrical Engineers India', salary: 16000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 20, name: 'Tej Pal',        guardian: 'Mr. Nathu Singh',     firm: 'Electrical Engineers India', salary: 13000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 21, name: 'Kapil',          guardian: 'Mr. Jay Singh',       firm: 'Electrical Engineers India', salary: 16000, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 22, name: 'Sheela',         guardian: 'Mr. Bhram Singh',     firm: 'Electrical Engineers India', salary: 12150, esi: true,  bonus: false, docs: NO_DOCS },
  { id: 23, name: 'Mohd. Sajid',    guardian: 'Mohd. Islamuddin',    firm: 'Electrical Engineers India', salary: 15000, esi: true,  bonus: false, docs: NO_DOCS },
];

export const SEED_HOLIDAYS = [
  { date: '2026-01-01', name: "New Year's Day",             type: 'National', observed: true },
  { date: '2026-01-14', name: 'Makar Sankranti',            type: 'Festival', observed: true },
  { date: '2026-01-26', name: 'Republic Day',               type: 'National', observed: true },
  { date: '2026-03-17', name: 'Holi',                       type: 'Festival', observed: true },
  { date: '2026-03-25', name: 'Shab-e-Barat',               type: 'Festival', observed: true },
  { date: '2026-03-30', name: 'Ram Navami',                 type: 'Festival', observed: true },
  { date: '2026-04-02', name: 'Good Friday',                type: 'Festival', observed: true },
  { date: '2026-04-14', name: 'Dr. Ambedkar Jayanti',       type: 'National', observed: true },
  { date: '2026-05-01', name: 'Labour Day / May Day',       type: 'National', observed: true },
  { date: '2026-05-16', name: 'Buddha Purnima',             type: 'Festival', observed: true },
  { date: '2026-06-16', name: 'Eid ul-Adha (Bakrid)',       type: 'Festival', observed: true },
  { date: '2026-08-15', name: 'Independence Day',           type: 'National', observed: true },
  { date: '2026-08-19', name: 'Janmashtami',                type: 'Festival', observed: true },
  { date: '2026-09-20', name: 'Eid-e-Milad',                type: 'Festival', observed: true },
  { date: '2026-10-02', name: 'Gandhi Jayanti',             type: 'National', observed: true },
  { date: '2026-10-20', name: 'Dussehra (Vijaya Dashami)',  type: 'Festival', observed: true },
  { date: '2026-11-09', name: 'Diwali (Deepawali)',         type: 'Festival', observed: true },
  { date: '2026-11-10', name: 'Diwali 2nd Day / Govardhan', type: 'Festival', observed: true },
  { date: '2026-11-24', name: 'Guru Nanak Jayanti',         type: 'Festival', observed: true },
  { date: '2026-12-25', name: 'Christmas Day',              type: 'Festival', observed: true },
];

// Seed: March 2026 attendance from the original sheet. Rest auto-initialises to full-present.
export const SEED_ATTENDANCE = {
  '2026-03': {
    1: 25, 2: 21, 3: 29, 4: 31, 5: 22, 6: 25, 7: 24, 8: 21, 9: 29, 10: 31,
    11: 31, 12: 29, 13: 30, 14: 30, 15: 27,
    16: 24, 17: 23, 18: 21, 19: 24, 20: 29, 21: 27, 22: 30, 23: 31,
  },
};

export const COMPANY_NAME = 'Anushree Electrical Pvt. Ltd.';
export const ESI_THRESHOLD    = 21000;   // statutory wage ceiling for ESI eligibility
export const ESI_EMPLOYEE_RATE = 0.0075; // 0.75%
export const ESI_EMPLOYER_RATE = 0.0325; // 3.25%
export const BONUS_RATE = 0.0833;        // 8.33%
export const PF_WAGE_CAP      = 15000;   // PF always calculated on salary capped at ₹15,000
export const PF_EMPLOYEE_RATE = 0.12;    // 12%

export const DEFAULT_COMPONENTS = {
  bonus: { label: 'Bonus',    type: 'per_day',    rate: 151.35, enabled: true  },
  pf:    { label: 'PF',       type: 'percentage', rate: 12, employerRate: 12, enabled: true  },
  esi:   { label: 'Emp. ESI', type: 'percentage', rate: 0.75,   enabled: true  },
  other: { label: 'Other',    type: 'percentage', rate: 0,      enabled: false },
};
