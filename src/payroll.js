import { ESI_THRESHOLD, ESI_EMPLOYEE_RATE, ESI_EMPLOYER_RATE, PF_WAGE_CAP, PF_EMPLOYEE_RATE } from './seedData';

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const daysInMonth = (year, monthIdx /* 0-11 */) =>
  new Date(year, monthIdx + 1, 0).getDate();

export const monthKey = (year, monthIdx) =>
  `${year}-${String(monthIdx + 1).padStart(2, '0')}`;

export const isInactiveForMonth = (employee, year, monthIdx) => {
  if (!employee.inactivePeriods || !employee.inactivePeriods.length) return false;
  const current = monthKey(year, monthIdx);
  return employee.inactivePeriods.some(({ from, to }) => current >= from && current <= to);
};

export const parseMonthKey = (key) => {
  const [y, m] = key.split('-').map(Number);
  return { year: y, monthIdx: m - 1 };
};

export const holidaysInMonth = (holidays, year, monthIdx) =>
  holidays.filter((h) => {
    if (!h.observed) return false;
    const d = new Date(h.date);
    return d.getFullYear() === year && d.getMonth() === monthIdx;
  });

export const formatINR = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '₹0';
  return '₹' + Math.round(n).toLocaleString('en-IN');
};

export const formatINRExact = (n) => {
  if (n === null || n === undefined || isNaN(n)) return '₹0.00';
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const AEEPL_DIVISOR = 26;

/**
 * Per-employee payroll.
 * bonusAmtPerDay: flat ₹ amount per present day (e.g. 51.33) — comes from computeMonthPayroll.
 * Bonus is automatic for salary ≤ ESI_THRESHOLD, no manual flag needed.
 */
export function computeEmployeePayroll({ employee, daysPresent, daysAbsent, bonusAmtPerDay = 0, pfEmployeeRate = PF_EMPLOYEE_RATE, pfEmployerRate = PF_EMPLOYEE_RATE }) {
  const perDay          = employee.salary / AEEPL_DIVISOR;
  const grossAfterAbsent = perDay * daysPresent;

  const esiEligible = employee.salary <= ESI_THRESHOLD;
  const esiDeduct   = esiEligible ? grossAfterAbsent * ESI_EMPLOYEE_RATE : 0;
  const afterEsi    = grossAfterAbsent - esiDeduct;

  const bonus       = employee.salary <= ESI_THRESHOLD ? daysPresent * bonusAmtPerDay : 0;

  // PF always calculated on fixed ₹15,000 base regardless of actual salary
  const pfDeduct       = employee.pf ? (PF_WAGE_CAP / AEEPL_DIVISOR) * daysPresent * pfEmployeeRate : 0;
  const employerPfDeduct = employee.pf ? (PF_WAGE_CAP / AEEPL_DIVISOR) * daysPresent * pfEmployerRate : 0;

  const netPayable  = afterEsi + bonus - pfDeduct;
  const employerEsi = esiEligible ? grossAfterAbsent * ESI_EMPLOYER_RATE : 0;

  return { perDay, daysAbsent, paidDays: daysPresent, grossAfterAbsent, esiDeduct, afterEsi, bonus, pfDeduct, employerPfDeduct, netPayable, employerEsi };
}

/**
 * Full-month payroll aggregate.
 * Reads bonusRatePct (a % number like 8.33) from components.bonusRatePct.
 * Falls back to BONUS_RATE (8.33%) if not set.
 */
export function computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components }) {
  const totalDays      = daysInMonth(year, monthIdx);
  const mKey           = monthKey(year, monthIdx);
  const holidayList    = holidaysInMonth(holidays, year, monthIdx);
  const publicHolidays = holidayList.length;
  const monthAtt       = attendance[mKey] || {};

  const storedAmt      = components?.bonusAmtPerDay;
  const bonusAmtPerDay = (storedAmt != null && Number(storedAmt) >= 0)
    ? Number(storedAmt)
    : 0;

  const pfEmployeeRate = (components?.pf?.rate != null && Number(components.pf.rate) > 0)
    ? Number(components.pf.rate) / 100 : PF_EMPLOYEE_RATE;
  const pfEmployerRate = (components?.pf?.employerRate != null && Number(components.pf.employerRate) > 0)
    ? Number(components.pf.employerRate) / 100 : PF_EMPLOYEE_RATE;

  const rows = employees.map((emp) => {
    if (isInactiveForMonth(emp, year, monthIdx)) {
      return {
        employee: emp, inactive: true,
        daysPresent: 0, daysAbsent: 0, paidDays: 0,
        perDay: emp.salary / AEEPL_DIVISOR,
        grossAfterAbsent: 0, esiDeduct: 0, afterEsi: 0,
        bonus: 0, pfDeduct: 0, employerPfDeduct: 0, netPayable: 0, employerEsi: 0,
      };
    }
    const presentArrSaved = monthAtt[`p${emp.id}`];
    const absentArr       = monthAtt[`d${emp.id}`];
    const plArrSaved      = monthAtt[`pl${emp.id}`] || [];
    const otArr           = monthAtt[`ot${emp.id}`] || [];
    const otCount         = otArr.filter(([, t]) => t === 'full').length;

    let daysPresent, daysAbsent;
    if (presentArrSaved !== undefined) {
      // Presence-based: only explicitly marked days count (green + PL + OT)
      daysPresent = presentArrSaved.length + plArrSaved.length + otCount;
      daysAbsent  = absentArr ? absentArr.length : 0;
    } else if (absentArr !== undefined) {
      // Legacy absence-based formula (old records without p-array)
      daysAbsent  = absentArr.length;
      daysPresent = Math.max(0, AEEPL_DIVISOR - daysAbsent + otCount);
    } else if (monthAtt[emp.id] != null) {
      daysPresent = monthAtt[emp.id];
      daysAbsent  = Math.max(0, AEEPL_DIVISOR - daysPresent);
    } else {
      daysPresent = 0;
      daysAbsent  = 0;
    }

    const calc = computeEmployeePayroll({ employee: emp, daysPresent, daysAbsent, bonusAmtPerDay, pfEmployeeRate, pfEmployerRate });
    return { employee: emp, inactive: false, daysPresent, ...calc };
  });

  const firmBreakdown = {};
  rows.forEach((r) => {
    if (r.inactive) return;
    if (!firmBreakdown[r.employee.firm]) {
      firmBreakdown[r.employee.firm] = {
        firm: r.employee.firm, headcount: 0, grossBase: 0,
        gross: 0, esiDeduct: 0, bonus: 0, pfDeduct: 0, employerPfDeduct: 0, netPayable: 0, employerEsi: 0,
      };
    }
    const f = firmBreakdown[r.employee.firm];
    f.headcount        += 1;
    f.grossBase        += r.employee.salary;
    f.gross            += r.grossAfterAbsent;
    f.esiDeduct        += r.esiDeduct;
    f.bonus            += r.bonus;
    f.pfDeduct         += r.pfDeduct;
    f.employerPfDeduct += r.employerPfDeduct;
    f.netPayable       += r.netPayable;
    f.employerEsi      += r.employerEsi;
  });

  const totals = rows.reduce(
    (acc, r) => {
      if (r.inactive) return acc;
      acc.grossBase   += r.employee.salary;
      acc.gross       += r.grossAfterAbsent;
      acc.esiDeduct        += r.esiDeduct;
      acc.bonus            += r.bonus;
      acc.pfDeduct         += r.pfDeduct;
      acc.employerPfDeduct += r.employerPfDeduct;
      acc.netPayable       += r.netPayable;
      acc.employerEsi += r.employerEsi;
      acc.daysAbsent  += r.daysAbsent;
      return acc;
    },
    { grossBase: 0, gross: 0, esiDeduct: 0, bonus: 0, pfDeduct: 0, employerPfDeduct: 0, netPayable: 0, employerEsi: 0, daysAbsent: 0 },
  );

  return { totalDays, publicHolidays, holidayList, rows, firmBreakdown: Object.values(firmBreakdown), totals, headcount: rows.filter((r) => !r.inactive).length };
}
