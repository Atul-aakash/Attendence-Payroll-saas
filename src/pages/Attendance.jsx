import { useState } from 'react';
import { Check, RotateCcw, Zap, CalendarDays, X } from 'lucide-react';
import {
  computeMonthPayroll, daysInMonth, monthKey, MONTH_NAMES, formatINR, formatINRExact, AEEPL_DIVISOR, isInactiveForMonth,
} from '../payroll';
import { useApp } from '../context/AppContext';

function CalendarModal({ empId, empName, paidLeaveAllowed, year, monthIdx, total, holidays, mKey, attendance, setAttendance, onClose }) {
  const absentKey = `d${empId}`;
  const otKey = `ot${empId}`;

  // Compute these before useState so they can be used in lazy initialisers
  const firstDayOfWeek = new Date(year, monthIdx, 1).getDay(); // 0=Sun … 6=Sat
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Map from day-of-month → holiday name (observed holidays only)
  const holidayMap = new Map(
    holidays
      .filter((h) => {
        if (!h.observed) return false;
        const d = new Date(h.date);
        return d.getFullYear() === year && d.getMonth() === monthIdx;
      })
      .map((h) => [new Date(h.date).getDate(), h.name]),
  );

  const plKey = `pl${empId}`;

  const [absentDays, setAbsentDays] = useState(() => {
    const savedAbsent = attendance[mKey]?.[absentKey] || [];
    // If PL eligibility was revoked, treat previously-saved PL days as absent
    const revokedPL = !paidLeaveAllowed ? (attendance[mKey]?.[plKey] || []) : [];
    const merged = [...new Set([...savedAbsent, ...revokedPL])];
    return new Set(merged.filter((d) => {
      const dow = (firstDayOfWeek + d - 1) % 7;
      return dow !== 0 && !holidayMap.has(d);
    }));
  });

  const [paidLeaveDays, setPaidLeaveDays] = useState(() => {
    if (!paidLeaveAllowed) return new Set();
    const saved = attendance[mKey]?.[plKey] || [];
    return new Set(saved.filter((d) => {
      const dow = (firstDayOfWeek + d - 1) % 7;
      return dow !== 0 && !holidayMap.has(d);
    }));
  });

  // Explicitly-present days (green). Initialised from saved data.
  // If new-format p${empId} exists → use it. If old-format (only absents saved) →
  // reconstruct present days so existing records still display correctly.
  const [presentDays, setPresentDays] = useState(() => {
    const pKey = `p${empId}`;
    const savedPresent = attendance[mKey]?.[pKey];
    if (savedPresent !== undefined) {
      return new Set(savedPresent.filter((d) => {
        const dow = (firstDayOfWeek + d - 1) % 7;
        return dow !== 0 && !holidayMap.has(d);
      }));
    }
    // Old format: reconstruct present = all workdays minus absent/PL
    const savedAbsent = attendance[mKey]?.[absentKey];
    if (savedAbsent !== undefined) {
      const absentSet = new Set(savedAbsent);
      const plSet = new Set(attendance[mKey]?.[plKey] || []);
      const ps = new Set();
      for (let d = 1; d <= total; d++) {
        const dow = (firstDayOfWeek + d - 1) % 7;
        if (dow !== 0 && !holidayMap.has(d) && !absentSet.has(d) && !plSet.has(d)) ps.add(d);
      }
      return ps;
    }
    // No saved data at all → start fully uncolored
    return new Set();
  });

  // overtimeDays: Map<dayNum, 'full'> – full-day OT only (AEEPL policy)
  const [overtimeDays, setOvertimeDays] = useState(() => {
    const saved = attendance[mKey]?.[otKey];
    return saved ? new Map(saved) : new Map();
  });

  const MAX_PAID_LEAVES = 2;

  // Full-day OT count (each adds 1 paid day on top of the 26-day base)
  const otCount = [...overtimeDays.values()].filter(t => t === 'full').length;
  const paidLeaveCount = paidLeaveDays.size;
  // actualPresent = explicitly marked green days + OT (excludes PL); used for display
  const actualPresent = presentDays.size + otCount;
  const presentCount = actualPresent;

  // Cycle: Uncolored → Present (green) → Absent (red) → Paid Leave (blue, if eligible) → Uncolored
  const toggleDay = (day) => {
    if (paidLeaveDays.has(day)) {
      // PL → Uncolored
      setPaidLeaveDays(prev => { const n = new Set(prev); n.delete(day); return n; });
    } else if (absentDays.has(day)) {
      if (paidLeaveAllowed && paidLeaveDays.size < MAX_PAID_LEAVES) {
        // Absent → PL
        setAbsentDays(prev => { const n = new Set(prev); n.delete(day); return n; });
        setPaidLeaveDays(prev => { const n = new Set(prev); n.add(day); return n; });
      } else {
        // Absent → Uncolored (PL not available or cap reached)
        setAbsentDays(prev => { const n = new Set(prev); n.delete(day); return n; });
      }
    } else if (presentDays.has(day)) {
      // Present → Absent
      setPresentDays(prev => { const n = new Set(prev); n.delete(day); return n; });
      setAbsentDays(prev => { const n = new Set(prev); n.add(day); return n; });
    } else {
      // Uncolored → Present
      setPresentDays(prev => { const n = new Set(prev); n.add(day); return n; });
    }
  };

  // Cycles: none → full → none  (no half-day for AEEPL)
  const toggleOvertime = (day) => {
    setOvertimeDays((prev) => {
      const next = new Map(prev);
      if (next.has(day)) next.delete(day);
      else next.set(day, 'full');
      return next;
    });
  };

  const handleApply = () => {
    const presentArr   = [...presentDays].sort((a, b) => a - b);
    const absentArr    = [...absentDays].sort((a, b) => a - b);
    const paidLeaveArr = [...paidLeaveDays].sort((a, b) => a - b);
    const overtimeArr  = [...overtimeDays.entries()];
    const daysPresent = presentArr.length + paidLeaveArr.length + otCount;
    setAttendance((prev) => ({
      ...prev,
      [mKey]: {
        ...(prev[mKey] || {}),
        [empId]: daysPresent,
        [`p${empId}`]: presentArr,
        [absentKey]: absentArr,
        [otKey]: overtimeArr,
        [plKey]: paidLeaveArr,
      },
    }));
    onClose();
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--bg-1)', border: '1px solid var(--border-2)', borderRadius: 14, padding: '22px 24px', width: 560, maxWidth: '96vw', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{empName}</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3, letterSpacing: '0.04em' }}>
              {MONTH_NAMES[monthIdx].toUpperCase()} {year} · CLICK DATE TO CYCLE STATUS
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-faint)', cursor: 'pointer', padding: 2, display: 'flex' }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 11, color: 'var(--text-dim)', flexWrap: 'nowrap', alignItems: 'center' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: 'transparent', border: '1px solid var(--border)', display: 'inline-block' }} />
            Not marked
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(111,174,106,0.35)', border: '1px solid rgba(111,174,106,0.55)', display: 'inline-block' }} />
            Present
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(212,106,90,0.38)', border: '1px solid rgba(212,106,90,0.6)', display: 'inline-block' }} />
            Absent
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4, opacity: paidLeaveAllowed ? 1 : 0.35 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(74,144,217,0.22)', border: '2px solid #4a90d9', boxShadow: paidLeaveAllowed ? '0 0 5px rgba(74,144,217,0.55)' : 'none', display: 'inline-block' }} />
            Paid Leave{!paidLeaveAllowed && <span style={{ fontSize: 10, marginLeft: 2 }}>(N/A)</span>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(255,149,0,0.22)', border: '2px solid #ff9500', boxShadow: '0 0 5px rgba(255,149,0,0.55)', display: 'inline-block' }} />
            Holiday / Sun (off)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 11, height: 11, borderRadius: 3, background: 'rgba(255,105,180,0.28)', border: '2.5px solid #ff69b4', boxShadow: '0 0 6px rgba(255,105,180,0.65)', display: 'inline-block' }} />
            OT (+1d)
          </span>
        </div>

        {/* hints */}
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 12, letterSpacing: '0.02em' }}>
          {paidLeaveAllowed
            ? `Click: Not marked → Present → Absent → Paid Leave (max ${MAX_PAID_LEAVES}) → Not marked · Click Sun/Holiday for OT`
            : 'Click: Not marked → Present → Absent → Not marked · Paid Leave not applicable · Click Sun/Holiday for OT'}
        </div>

        {/* Day-of-week headers + Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5, marginBottom: 16 }}>
          {/* Day name row */}
          {DAY_NAMES.map((d, i) => (
            <div
              key={d}
              style={{
                textAlign: 'center',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.04em',
                paddingBottom: 5,
                color: i === 0 ? '#ff9500' : 'var(--text-faint)',
                textShadow: i === 0 ? '0 0 8px rgba(255,149,0,0.7)' : 'none',
              }}
            >
              {d}
            </div>
          ))}

          {/* Offset blank cells */}
          {Array.from({ length: firstDayOfWeek }, (_, i) => (
            <div key={`blank-${i}`} />
          ))}

          {/* Day buttons */}
          {Array.from({ length: total }, (_, i) => i + 1).map((day) => {
            const absent = absentDays.has(day);
            const paidLeave = paidLeaveDays.has(day);
            const dayOfWeek = (firstDayOfWeek + day - 1) % 7;
            const isSun = dayOfWeek === 0;
            const isHoliday = holidayMap.has(day);
            const holidayName = holidayMap.get(day);
            const ot = overtimeDays.get(day);

            let cellStyle, onClick, title;

            if (isSun || isHoliday) {
              title = `${isHoliday ? holidayName : 'Sunday (off)'} · click to ${ot ? 'remove' : 'add'} full-day OT`;
              onClick = () => toggleOvertime(day);

              if (ot === 'full') {
                cellStyle = {
                  border: '2.5px solid #ff69b4',
                  boxShadow: '0 0 11px rgba(255,105,180,0.75), inset 0 0 5px rgba(255,105,180,0.12)',
                  background: 'rgba(255,105,180,0.27)',
                  color: '#ff69b4',
                  cursor: 'pointer',
                };
              } else {
                // Both Sunday and Holiday → same orange-neon style
                cellStyle = {
                  border: '2px solid #ff9500',
                  boxShadow: '0 0 9px rgba(255,149,0,0.7), inset 0 0 4px rgba(255,149,0,0.12)',
                  background: 'rgba(255,149,0,0.18)',
                  color: '#ffaa33',
                  cursor: 'pointer',
                };
              }
            } else {
              onClick = () => toggleDay(day);
              if (paidLeave) {
                title = 'Paid Leave · Click → Present';
                cellStyle = {
                  border: '2px solid #4a90d9',
                  boxShadow: '0 0 8px rgba(74,144,217,0.55)',
                  background: 'rgba(74,144,217,0.18)',
                  color: '#6ab0f5',
                  cursor: 'pointer',
                };
              } else if (absent) {
                title = paidLeaveAllowed && paidLeaveDays.size < MAX_PAID_LEAVES
                  ? 'Absent · Click → Paid Leave'
                  : 'Absent · Click → Not marked';
                cellStyle = {
                  border: '1.5px solid rgba(212,106,90,0.65)',
                  boxShadow: 'none',
                  background: 'rgba(212,106,90,0.32)',
                  color: '#e0806e',
                  cursor: 'pointer',
                };
              } else if (presentDays.has(day)) {
                title = 'Present · Click → Absent';
                cellStyle = {
                  border: '1.5px solid rgba(111,174,106,0.5)',
                  boxShadow: 'none',
                  background: 'rgba(111,174,106,0.25)',
                  color: '#7ec478',
                  cursor: 'pointer',
                };
              } else {
                title = 'Not marked · Click → Present';
                cellStyle = {
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-faint)',
                  cursor: 'pointer',
                };
              }
            }

            return (
              <button
                key={day}
                onClick={onClick}
                title={title}
                style={{
                  padding: '6px 0 4px',
                  borderRadius: 7,
                  fontWeight: 700,
                  fontSize: 12,
                  lineHeight: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 2,
                  transition: 'background 0.12s',
                  ...cellStyle,
                }}
              >
                <span>{day}</span>
                {ot === 'full' && (
                  <span style={{ fontSize: 8, lineHeight: 1, fontWeight: 800, letterSpacing: '0.02em' }}>+1</span>
                )}
                {isHoliday && ot !== 'full' && (
                  <span style={{ fontSize: 7, lineHeight: 1, fontWeight: 700, letterSpacing: '0.01em', maxWidth: 34, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.9 }}>
                    {holidayName}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 12 }}>
            <span style={{ color: '#e0806e', fontWeight: 600 }}>{absentDays.size} absent</span>
            <span style={{ color: 'var(--text-faint)', margin: '0 5px' }}>·</span>
            <span style={{ color: '#7ec478', fontWeight: 600 }}>{presentCount} present</span>
            {paidLeaveAllowed ? (
              <>
                <span style={{ color: 'var(--text-faint)', margin: '0 5px' }}>·</span>
                <span style={{ color: paidLeaveCount >= MAX_PAID_LEAVES ? '#ff9500' : '#6ab0f5', fontWeight: 600 }}>
                  {paidLeaveCount}/{MAX_PAID_LEAVES} paid leave
                </span>
                {paidLeaveCount >= MAX_PAID_LEAVES && (
                  <span style={{ color: '#ff9500', fontSize: 10, marginLeft: 4 }}>(max)</span>
                )}
              </>
            ) : (
              <>
                <span style={{ color: 'var(--text-faint)', margin: '0 5px' }}>·</span>
                <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>PL: N/A</span>
              </>
            )}
            {otCount > 0 && (
              <span style={{ color: '#ff69b4', fontWeight: 600, marginLeft: 5 }}>
                (+{otCount}d OT)
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => { setPresentDays(new Set()); setAbsentDays(new Set()); setPaidLeaveDays(new Set()); setOvertimeDays(new Map()); }}
              style={{ fontSize: 11 }}
            >
              Clear all
            </button>
            <button className="btn btn-sm btn-ghost" onClick={onClose}>Cancel</button>
            <button className="btn btn-sm" onClick={handleApply}>Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const calcFirmTotals = (rows) =>
  rows.reduce(
    (a, r) => {
      if (r.inactive) return a;
      a.gross += r.grossAfterAbsent;
      a.esi += r.esiDeduct;
      a.employerEsi += r.employerEsi;
      a.bonus += r.bonus;
      a.net += r.netPayable;
      a.absent += r.daysAbsent;
      return a;
    },
    { gross: 0, esi: 0, employerEsi: 0, bonus: 0, net: 0, absent: 0 },
  );

// ─── main component ───────────────────────────────────────────────────────────

export default function Attendance() {
  const { employees, holidays, attendance, setAttendance, year, monthIdx, components, selectedFirms, setSelectedFirms, toggleFirm, firms: registeredFirms, userRole } = useApp();
  const canEdit = userRole !== 'viewer';
  const [calModal, setCalModal] = useState(null);

  const mKey = monthKey(year, monthIdx);
  const total = daysInMonth(year, monthIdx);
  const publicHols = holidays.filter((h) => {
    if (!h.observed) return false;
    const d = new Date(h.date);
    return d.getFullYear() === year && d.getMonth() === monthIdx;
  }).length;

  const summary = computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components });

  // Firm options = registered firms + unique labels on existing employees
  const firms = [...new Set([
    ...(registeredFirms || []).map((f) => f.name),
    ...employees.map((e) => e.firm).filter(Boolean),
  ])];
  const visibleFirms = selectedFirms.length === 0
    ? [...new Set(employees.map((e) => e.firm))]
    : selectedFirms;

  const markAllFullAttendance = () => {
    const next = {};
    employees
      .filter((e) => !isInactiveForMonth(e, year, monthIdx))
      .forEach((e) => { next[e.id] = AEEPL_DIVISOR; });
    setAttendance((prev) => ({ ...prev, [mKey]: next }));
  };

  const resetMonth = () => {
    if (!confirm(`Clear all attendance for ${MONTH_NAMES[monthIdx]} ${year}?`)) return;
    setAttendance((prev) => {
      const c = { ...prev };
      delete c[mKey];
      return c;
    });
  };

  // ── render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-title">
          <div>
            <h2>Attendance · {MONTH_NAMES[monthIdx]} {year}</h2>
            <div className="panel-title-sub">
              – 26-DAY POLICY · {publicHols} OBSERVED HOLIDAY{publicHols !== 1 ? 'S' : ''} · PER-DAY = SALARY ÷ 26
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {selectedFirms.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                {selectedFirms.map((f) => (
                  <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px 3px 10px', background: 'rgba(212,160,74,0.15)', border: '1px solid rgba(212,160,74,0.35)', borderRadius: 20, fontSize: 11, color: 'var(--accent)' }}>
                    {f}
                    <button onClick={() => toggleFirm(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 2px', display: 'flex', lineHeight: 1, fontSize: 14 }}>×</button>
                  </span>
                ))}
                <button onClick={() => setSelectedFirms([])} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Clear</button>
              </div>
            )}
            <button className="btn btn-sm" onClick={markAllFullAttendance}>
              <Zap size={13} /> Mark all full
            </button>
            <button className="btn btn-sm btn-ghost" onClick={resetMonth}>
              <RotateCcw size={13} /> Reset month
            </button>
          </div>
        </div>

        <div className="info-note">
          Click the <CalendarDays size={12} style={{ verticalAlign: 'middle' }} /> calendar icon to mark individual absent days — <strong>Days Present</strong> is calculated automatically.
          Formula: <span className="mono">Gross Salary = (Gross Salary ÷ 26) × (26 − Absent + OT days)</span>.
          Company-observed holidays are paid; Sundays are unpaid rest — neither counts as absent.
        </div>
      </div>

      {visibleFirms.map((firm) => {
        const rows = summary.rows.filter((r) => r.employee.firm === firm);
        const firmTotals = calcFirmTotals(rows);

        return (
          <div key={firm} className="panel">
            <div className="panel-title">
              <div>
                <h2 style={{ fontSize: 17 }}>{firm}</h2>
                <div className="panel-title-sub">
                  – {rows.length} EMPLOYEES · NET {formatINR(firmTotals.net)}
                </div>
              </div>
            </div>

            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 28 }}>#</th>
                    <th>Employee</th>
                    <th className="num">Gross<br /><span style={{ opacity: 0.75 }}>Salary</span></th>
                    <th className="num">Per-day</th>
                    <th className="num" style={{ width: 110 }}>Days Present</th>
                    <th className="num">Absent</th>
                    <th className="num">
                      <span style={{ color: '#6ab0f5', textShadow: '0 0 8px rgba(74,144,217,0.7)' }}>Paid Leaves</span>
                      <br />
                      <span style={{ color: '#ffaa33', textShadow: '0 0 8px rgba(255,149,0,0.7)', fontSize: 10 }}>+ Observed Holidays</span>
                    </th>
                    <th className="num" style={{ fontSize: 10 }}>PRESENT DAYS Sal<br /><span style={{ opacity: 0.75 }}>& PL (IF ANY)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const storedPL = (attendance[mKey]?.[`pl${r.employee.id}`] || []).length;
                    const plAllowed = !!r.employee.paidLeave;
                    // If PL eligibility was revoked, stale PL days count as absent for display
                    const rowPaidLeaves = plAllowed ? storedPL : 0;
                    // Revoked PL days are added back into the absent count
                    const displayAbsent = plAllowed ? r.daysAbsent : r.daysAbsent + storedPL;
                    const displayGross = plAllowed
                      ? r.grossAfterAbsent
                      : r.perDay * Math.max(0, r.daysPresent - storedPL);
                    // Fresh calendar = no attendance saved at all → show 0
                    const hasSavedAttendance = attendance[mKey]?.[r.employee.id] != null
                      || attendance[mKey]?.[`p${r.employee.id}`] !== undefined
                      || attendance[mKey]?.[`d${r.employee.id}`] !== undefined;
                    // Use explicitly marked green days + OT so holidays are never counted
                    const savedPresentArr = attendance[mKey]?.[`p${r.employee.id}`];
                    const savedOtArr = attendance[mKey]?.[`ot${r.employee.id}`] || [];
                    const rowOtCount = savedOtArr.filter(([, t]) => t === 'full').length;
                    const rowActualPresent = hasSavedAttendance
                      ? (savedPresentArr !== undefined
                          ? savedPresentArr.length + rowOtCount
                          : Math.max(0, r.daysPresent - rowPaidLeaves - (plAllowed ? 0 : storedPL)))
                      : 0;
                    const hasCalDays = attendance[mKey]?.[r.employee.id] !== undefined
                      || (attendance[mKey]?.[`p${r.employee.id}`] || []).length > 0
                      || (attendance[mKey]?.[`d${r.employee.id}`] || []).length > 0
                      || (attendance[mKey]?.[`ot${r.employee.id}`] || []).length > 0
                      || rowPaidLeaves > 0;
                    return (
                      <tr key={r.employee.id} style={{ opacity: r.inactive ? 0.5 : 1 }}>
                        <td className="faint mono">{i + 1}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <button
                              onClick={() => !r.inactive && canEdit && setCalModal({ empId: r.employee.id, empName: r.employee.name, paidLeaveAllowed: !!r.employee.paidLeave })}
                              title={r.inactive ? 'Employee is inactive this month — attendance locked' : canEdit ? 'Open attendance calendar' : 'View-only — you do not have edit access'}
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: 3,
                                cursor: r.inactive ? 'not-allowed' : 'pointer',
                                color: r.inactive ? 'var(--text-faint)' : (hasCalDays ? 'var(--accent)' : 'var(--text-faint)'),
                                display: 'flex',
                                alignItems: 'center',
                                flexShrink: 0,
                                borderRadius: 4,
                                opacity: r.inactive ? 0.35 : 1,
                              }}
                            >
                              <CalendarDays size={15} />
                            </button>
                            <div>
                              <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                                {r.employee.name}
                                {r.inactive && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: 'rgba(212,106,90,0.18)', border: '1px solid rgba(212,106,90,0.35)', borderRadius: 10, color: '#e0806e', letterSpacing: '0.04em' }}>INACTIVE</span>
                                )}
                              </div>
                              <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>
                                {r.employee.guardian}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="num">{r.inactive ? '–' : formatINR(r.employee.salary)}</td>
                        <td className="num">{r.inactive ? '–' : formatINRExact(r.perDay)}</td>
                        <td className="num">
                          {r.inactive ? (
                            <span style={{ color: 'var(--text-faint)' }}>–</span>
                          ) : (
                            <>
                              <span className="mono">{rowActualPresent}</span>
                              <span className="faint mono" style={{ fontSize: 10, marginLeft: 4 }}>
                                /{AEEPL_DIVISOR}
                              </span>
                            </>
                          )}
                        </td>
                        <td className="num" style={{ color: !r.inactive && displayAbsent > 0 ? 'var(--danger)' : 'var(--text-faint)' }}>
                          {r.inactive ? '–' : displayAbsent}
                        </td>
                        <td className="num">
                          {r.inactive ? (
                            <span style={{ color: 'var(--text-faint)' }}>–</span>
                          ) : rowPaidLeaves === 0 && publicHols === 0 ? (
                            <span style={{ color: 'var(--text-faint)' }}>–</span>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                              {rowPaidLeaves > 0 && (
                                <span style={{ color: '#6ab0f5' }}>{rowPaidLeaves}</span>
                              )}
                              {rowPaidLeaves > 0 && publicHols > 0 && (
                                <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>+</span>
                              )}
                              {publicHols > 0 && (
                                <span style={{ color: '#ffaa33' }}>{publicHols}</span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="num" style={{ color: 'var(--accent-2)', fontWeight: 500 }}>
                          {r.inactive || !hasSavedAttendance ? <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>–</span> : formatINR(displayGross)}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="subtotal">
                    <td colSpan={5}>SUBTOTAL – {firm}</td>
                    <td className="num">
                      {rows.reduce((s, r) => {
                        const stPL = (attendance[mKey]?.[`pl${r.employee.id}`] || []).length;
                        return s + r.daysAbsent + (r.employee.paidLeave ? 0 : stPL);
                      }, 0)}
                    </td>
                    <td className="num">
                      {(() => {
                        const totalPL = rows.reduce((s, r) => s + (r.employee.paidLeave ? (attendance[mKey]?.[`pl${r.employee.id}`] || []).length : 0), 0);
                        return totalPL > 0
                          ? <span style={{ color: '#6ab0f5' }}>{totalPL}</span>
                          : '–';
                      })()}
                    </td>
                    <td className="num">
                      {formatINR(rows.reduce((s, r) => {
                        const stPL = (attendance[mKey]?.[`pl${r.employee.id}`] || []).length;
                        return s + (r.employee.paidLeave
                          ? r.grossAfterAbsent
                          : r.perDay * Math.max(0, r.daysPresent - stPL));
                      }, 0))}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}

      {selectedFirms.length === 0 && (
        <div className="panel" style={{ background: 'rgba(212,160,74,0.05)', borderColor: 'var(--accent-dim)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div>
              <div className="panel-title-sub" style={{ marginBottom: 4 }}>– GRAND TOTAL</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--accent-2)' }}>
                {formatINR(summary.totals.netPayable)}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                Gross {formatINR(summary.totals.gross)} − ESI {formatINR(summary.totals.esiDeduct)}
                {summary.totals.bonus > 0 && <> + Bonus {formatINR(summary.totals.bonus)}</>}
              </div>
            </div>
            <div>
              <span className="pill yes" style={{ fontSize: 11 }}>
                <Check size={11} style={{ verticalAlign: 'middle' }} /> AUTO-SAVED
              </span>
            </div>
          </div>
        </div>
      )}

      {calModal && (
        <CalendarModal
          empId={calModal.empId}
          empName={calModal.empName}
          paidLeaveAllowed={calModal.paidLeaveAllowed}
          year={year}
          monthIdx={monthIdx}
          total={total}
          holidays={holidays}
          mKey={mKey}
          attendance={attendance}
          setAttendance={setAttendance}
          onClose={() => setCalModal(null)}
        />
      )}
    </div>
  );
}
