import { useState, useMemo } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { computeMonthPayroll, MONTH_NAMES, formatINR } from '../payroll';
import { useApp } from '../context/AppContext';

function calcFirmTotals(rows) {
  return rows.reduce(
    (a, r) => {
      if (r.inactive) return a;
      a.gross      += r.employee.salary;
      a.salPresent += r.grossAfterAbsent;
      a.empEsi     += r.esiDeduct;
      a.emplEsi    += r.employerEsi;
      a.empPf      += r.employeePf;
      a.emplPf     += r.employerPf;
      a.bonus      += r.bonus;
      a.net        += r.net;
      return a;
    },
    { gross: 0, salPresent: 0, empEsi: 0, emplEsi: 0, empPf: 0, emplPf: 0, bonus: 0, net: 0 },
  );
}

const BTN = {
  background: 'none', border: 'none', cursor: 'pointer',
  color: 'var(--text-faint)', padding: '1px 3px', display: 'flex', alignItems: 'center',
  borderRadius: 3,
};

export default function PayrollComponents() {
  const {
    employees, holidays, attendance, year, monthIdx, components,
    selectedFirms, setSelectedFirms, toggleFirm, setComponents, userRole,
  } = useApp();
  const isAdmin = userRole === 'admin';

  // ── Bonus amount per present day (stored as ₹ value e.g. 51.33) ──────────
  const storedAmt      = components?.bonusAmtPerDay;
  const bonusAmtPerDay = (storedAmt != null && Number(storedAmt) >= 0)
    ? Number(storedAmt)
    : 0;

  const [editingBonus, setEditingBonus] = useState(false);
  const [bonusDraft,   setBonusDraft]   = useState('');

  const openBonusEdit = () => { setBonusDraft(bonusAmtPerDay.toFixed(2)); setEditingBonus(true); };
  const saveBonusRate = () => {
    const val = parseFloat(bonusDraft);
    if (!isNaN(val) && val >= 0) setComponents((prev) => ({ ...(prev || {}), bonusAmtPerDay: parseFloat(val.toFixed(2)) }));
    setEditingBonus(false);
  };
  const cancelBonusEdit = () => setEditingBonus(false);

  // ── Employee PF rate ──────────────────────────────────────────────────────
  const empPfRate  = components?.pf?.rate        != null ? Number(components.pf.rate)        : 12;
  const emplPfRate = components?.pf?.employerRate != null ? Number(components.pf.employerRate) : 12;

  const [editingEmpPf,  setEditingEmpPf]  = useState(false);
  const [empPfDraft,    setEmpPfDraft]    = useState('');
  const [editingEmplPf, setEditingEmplPf] = useState(false);
  const [emplPfDraft,   setEmplPfDraft]   = useState('');

  const saveEmpPfRate = () => {
    const val = parseFloat(empPfDraft);
    if (!isNaN(val) && val >= 0 && val <= 100)
      setComponents((prev) => ({ ...(prev || {}), pf: { ...(prev?.pf || {}), rate: parseFloat(val.toFixed(2)) } }));
    setEditingEmpPf(false);
  };
  const saveEmplPfRate = () => {
    const val = parseFloat(emplPfDraft);
    if (!isNaN(val) && val >= 0 && val <= 100)
      setComponents((prev) => ({ ...(prev || {}), pf: { ...(prev?.pf || {}), employerRate: parseFloat(val.toFixed(2)) } }));
    setEditingEmplPf(false);
  };

  // ── Payroll data ──────────────────────────────────────────────────────────
  const visibleFirms = selectedFirms.length === 0
    ? [...new Set((employees || []).map((e) => e.firm))]
    : selectedFirms;

  const summary = useMemo(
    () => computeMonthPayroll({ employees, attendance, holidays, year, monthIdx, components }),
    [employees, attendance, holidays, year, monthIdx, components],
  );

  const augmentedRows = useMemo(() =>
    summary.rows.map((r) => ({
      ...r,
      employeePf: r.pfDeduct,
      employerPf: r.employerPfDeduct,
      net: r.grossAfterAbsent - r.esiDeduct - r.pfDeduct,
    })),
    [summary.rows],
  );

  const grandTotal = useMemo(() => calcFirmTotals(augmentedRows), [augmentedRows]);

  // ── PF column headers ─────────────────────────────────────────────────────
  const empPfHeader = editingEmpPf ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600 }}>Employee PF</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="number" value={empPfDraft} onChange={(e) => setEmpPfDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEmpPfRate(); if (e.key === 'Escape') setEditingEmpPf(false); }}
          step="0.01" min="0" max="100" autoFocus
          style={{ width: 45, fontSize: 11, padding: '2px 5px', borderRadius: 4, border: '1px solid var(--accent)', background: 'var(--bg-1)', color: 'var(--text)', textAlign: 'right', outline: 'none' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>%</span>
        <button onClick={saveEmpPfRate}             style={{ ...BTN, color: 'var(--accent)' }} title="Save"><Check size={11} /></button>
        <button onClick={() => setEditingEmpPf(false)} style={BTN}                            title="Cancel"><X size={11} /></button>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span>Employee</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ opacity: 0.75, fontSize: 10 }}>PF</span>
        <span style={{ fontSize: 10, color: 'var(--accent)' }}>{empPfRate}%</span>
        {isAdmin && (
          <button onClick={() => { setEmpPfDraft(String(empPfRate)); setEditingEmpPf(true); }} style={BTN} title="Edit Employee PF rate">
            <Pencil size={9} />
          </button>
        )}
      </div>
    </div>
  );

  const emplPfHeader = editingEmplPf ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600 }}>Employer PF</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <input
          type="number" value={emplPfDraft} onChange={(e) => setEmplPfDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveEmplPfRate(); if (e.key === 'Escape') setEditingEmplPf(false); }}
          step="0.01" min="0" max="100" autoFocus
          style={{ width: 45, fontSize: 11, padding: '2px 5px', borderRadius: 4, border: '1px solid var(--accent)', background: 'var(--bg-1)', color: 'var(--text)', textAlign: 'right', outline: 'none' }}
        />
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>%</span>
        <button onClick={saveEmplPfRate}              style={{ ...BTN, color: 'var(--accent)' }} title="Save"><Check size={11} /></button>
        <button onClick={() => setEditingEmplPf(false)} style={BTN}                             title="Cancel"><X size={11} /></button>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span>Employer</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ opacity: 0.75, fontSize: 10 }}>PF</span>
        <span style={{ fontSize: 10, color: 'var(--accent)' }}>{emplPfRate}%</span>
        {isAdmin && (
          <button onClick={() => { setEmplPfDraft(String(emplPfRate)); setEditingEmplPf(true); }} style={BTN} title="Edit Employer PF rate">
            <Pencil size={9} />
          </button>
        )}
      </div>
    </div>
  );

  // ── Bonus column header ───────────────────────────────────────────────────
  const bonusHeader = editingBonus ? (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600 }}>Bonus</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)' }}>₹</span>
        <input
          type="number"
          value={bonusDraft}
          onChange={(e) => setBonusDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') saveBonusRate(); if (e.key === 'Escape') cancelBonusEdit(); }}
          step="0.01"
          min="0"
          autoFocus
          style={{
            width: 60, fontSize: 11, padding: '2px 5px',
            borderRadius: 4, border: '1px solid var(--accent)',
            background: 'var(--bg-1)', color: 'var(--text)',
            textAlign: 'right', outline: 'none',
          }}
        />
        <button onClick={saveBonusRate}   style={{ ...BTN, color: 'var(--accent)' }} title="Save"><Check size={11} /></button>
        <button onClick={cancelBonusEdit} style={BTN}                                title="Cancel"><X size={11} /></button>
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
      <span>Bonus</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--accent)' }}>₹{bonusAmtPerDay.toFixed(2)}/day</span>
        {isAdmin && (
          <button onClick={openBonusEdit} style={BTN} title="Edit bonus ₹ per day">
            <Pencil size={9} />
          </button>
        )}
      </div>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div>
      <div className="panel" style={{ marginBottom: 20 }}>
        <div className="panel-title">
          <div>
            <h2>Payroll Components · {MONTH_NAMES[monthIdx]} {year}</h2>
            <div className="panel-title-sub">
              — EMPLOYEE-WISE BREAKDOWN · BONUS ₹{bonusAmtPerDay.toFixed(2)}/day · ESI 0.75% / 3.25%
            </div>
          </div>
          {selectedFirms.length > 0 && (
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
              {selectedFirms.map((f) => (
                <span key={f} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  padding: '3px 8px 3px 10px',
                  background: 'rgba(212,160,74,0.15)', border: '1px solid rgba(212,160,74,0.35)',
                  borderRadius: 20, fontSize: 11, color: 'var(--accent)',
                }}>
                  {f}
                  <button onClick={() => toggleFirm(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 2px', display: 'flex', lineHeight: 1, fontSize: 14 }}>×</button>
                </span>
              ))}
              <button onClick={() => setSelectedFirms([])} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Clear</button>
            </div>
          )}
        </div>
        <div className="info-note">
          NET SALARY (WITHOUT BONUS) = Salary (Present Days &amp; PL) − (Employee ESI + Employee PF).
          Click the <Pencil size={10} style={{ verticalAlign: 'middle' }} /> next to the Bonus amount in the column header to set a custom ₹ per day rate. Auto-applied for salary ≤ ₹21,000.
        </div>
      </div>

      {visibleFirms.map((firm) => {
        const rows   = augmentedRows.filter((r) => r.employee.firm === firm);
        const totals = calcFirmTotals(rows);

        return (
          <div key={firm} className="panel">
            <div className="panel-title">
              <div>
                <h2 style={{ fontSize: 17 }}>{firm}</h2>
                <div className="panel-title-sub">
                  — {rows.length} EMPLOYEES · NET SALARY {formatINR(totals.net)}
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
                    <th className="num" style={{ fontSize: 10 }}>PRESENT DAYS<br /><span style={{ opacity: 0.75 }}>Sal &amp; PL (IF ANY)</span></th>
                    <th className="num">Employee<br /><span style={{ opacity: 0.75 }}>ESI</span></th>
                    <th className="num">Employer<br /><span style={{ opacity: 0.75 }}>ESI</span></th>
                    <th className="num">{empPfHeader}</th>
                    <th className="num">{emplPfHeader}</th>
                    <th className="num">{bonusHeader}</th>
                    <th className="num">NET Salary<br /><span style={{ opacity: 0.75 }}>(without Bonus)</span></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.employee.id} style={{ opacity: r.inactive ? 0.45 : 1 }}>
                      <td className="faint mono">{i + 1}</td>
                      <td>
                        <div style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {r.employee.name}
                          {r.inactive && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: 'rgba(212,106,90,0.18)', border: '1px solid rgba(212,106,90,0.35)', borderRadius: 10, color: '#e0806e', letterSpacing: '0.04em' }}>INACTIVE</span>
                          )}
                        </div>
                        <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{r.employee.guardian}</div>
                      </td>
                      <td className="num">{r.inactive ? '–' : formatINR(r.employee.salary)}</td>
                      <td className="num" style={{ color: 'var(--accent-2)', fontWeight: 500 }}>
                        {r.inactive ? '–' : formatINR(r.grossAfterAbsent)}
                      </td>
                      <td className="num">{r.inactive ? '–' : (r.esiDeduct   > 0 ? formatINR(r.esiDeduct)   : '–')}</td>
                      <td className="num">{r.inactive ? '–' : (r.employerEsi > 0 ? formatINR(r.employerEsi) : '–')}</td>
                      <td className="num">{r.inactive ? '–' : (r.employeePf  > 0 ? formatINR(r.employeePf)  : '–')}</td>
                      <td className="num">{r.inactive ? '–' : (r.employerPf  > 0 ? formatINR(r.employerPf)  : '–')}</td>
                      <td className="num">{r.inactive ? '–' : (r.bonus       > 0 ? formatINR(r.bonus)        : '–')}</td>
                      <td className="num" style={{ color: 'var(--accent-2)', fontWeight: 600 }}>
                        {r.inactive ? '–' : formatINR(r.net)}
                      </td>
                    </tr>
                  ))}
                  <tr className="subtotal">
                    <td colSpan={2}>SUBTOTAL – {firm}</td>
                    <td className="num">{formatINR(totals.gross)}</td>
                    <td className="num">{formatINR(totals.salPresent)}</td>
                    <td className="num">{formatINR(totals.empEsi)}</td>
                    <td className="num">{formatINR(totals.emplEsi)}</td>
                    <td className="num">{totals.empPf  > 0 ? formatINR(totals.empPf)  : '–'}</td>
                    <td className="num">{totals.emplPf > 0 ? formatINR(totals.emplPf) : '–'}</td>
                    <td className="num">{totals.bonus  > 0 ? formatINR(totals.bonus)  : '–'}</td>
                    <td className="num">{formatINR(totals.net)}</td>
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
              <div className="panel-title-sub" style={{ marginBottom: 4 }}>– GRAND TOTAL (NET SALARY WITHOUT BONUS)</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--accent-2)' }}>
                {formatINR(grandTotal.net)}
              </div>
              <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>
                Gross {formatINR(grandTotal.gross)} · Present Sal {formatINR(grandTotal.salPresent)}
                {' '}− ESI {formatINR(grandTotal.empEsi)} − PF {formatINR(grandTotal.empPf)}
                {grandTotal.bonus > 0 && <> · Bonus {formatINR(grandTotal.bonus)}</>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
