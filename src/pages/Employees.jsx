import { useState } from 'react';
import { Plus, Pencil, Trash2, X, FileText, PauseCircle, CreditCard } from 'lucide-react';
import { formatINR, isInactiveForMonth, MONTH_NAMES, monthKey } from '../payroll';
import { ESI_THRESHOLD } from '../seedData';
import { useApp } from '../context/AppContext';
import { canAddEmployee, getUpgradeMessage, getPlanLimits } from '../lib/planLimits';

const EMPTY = {
  id: null, name: '', guardian: '', firm: '', salary: 15000, esi: true, bonus: false, pf: false, paidLeave: false,
};

function InactivePeriodsModal({ emp, employees, setEmployees, currentYear, currentMonthIdx, onClose }) {
  const YEAR_OPTS = Array.from({ length: 7 }, (_, i) => currentYear - 1 + i);
  const [fromMonth, setFromMonth] = useState(currentMonthIdx);
  const [fromYear,  setFromYear]  = useState(currentYear);
  const [toMonth,   setToMonth]   = useState(currentMonthIdx);
  const [toYear,    setToYear]    = useState(currentYear);

  const periods = emp.inactivePeriods || [];

  const updateEmp = (updated) => setEmployees(employees.map((e) => (e.id === emp.id ? updated : e)));

  const addPeriod = () => {
    const from = monthKey(fromYear, fromMonth);
    const to   = monthKey(toYear, toMonth);
    if (to < from) { alert('End month must be the same as or after the start month.'); return; }
    updateEmp({ ...emp, inactivePeriods: [...periods, { from, to }] });
  };

  const removePeriod = (idx) =>
    updateEmp({ ...emp, inactivePeriods: periods.filter((_, i) => i !== idx) });

  const fmtPeriod = ({ from, to }) => {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    const a = `${MONTH_NAMES[fm - 1]} ${fy}`;
    const b = `${MONTH_NAMES[tm - 1]} ${ty}`;
    return from === to ? a : `${a} – ${b}`;
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <h3 style={{ margin: 0 }}>Inactive Periods</h3>
            <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 3 }}>{emp.name}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>

        <div style={{ marginBottom: 16, minHeight: 20 }}>
          {periods.length === 0 ? (
            <div style={{ padding: '10px 0', fontSize: 13, color: 'var(--text-faint)' }}>
              No inactive periods set — employee is active all months.
            </div>
          ) : (
            periods.map((p, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(212,106,90,0.18)', border: '1px solid rgba(212,106,90,0.35)', borderRadius: 10, color: '#e0806e', letterSpacing: '0.04em' }}>INACTIVE</span>
                  <span style={{ fontSize: 13 }}>{fmtPeriod(p)}</span>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => removePeriod(i)}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-faint)', marginBottom: 12 }}>ADD INACTIVE PERIOD</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11 }}>From</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={fromMonth} onChange={(e) => setFromMonth(Number(e.target.value))} style={{ flex: 1, fontSize: 12 }}>
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m.slice(0, 3)}</option>)}
                </select>
                <select value={fromYear} onChange={(e) => setFromYear(Number(e.target.value))} style={{ fontSize: 12 }}>
                  {YEAR_OPTS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label style={{ fontSize: 11 }}>To</label>
              <div style={{ display: 'flex', gap: 4 }}>
                <select value={toMonth} onChange={(e) => setToMonth(Number(e.target.value))} style={{ flex: 1, fontSize: 12 }}>
                  {MONTH_NAMES.map((m, i) => <option key={i} value={i}>{m.slice(0, 3)}</option>)}
                </select>
                <select value={toYear} onChange={(e) => setToYear(Number(e.target.value))} style={{ fontSize: 12 }}>
                  {YEAR_OPTS.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>
          <button className="btn btn-primary" style={{ marginTop: 12, width: '100%' }} onClick={addPeriod}>
            <Plus size={13} /> Mark Inactive
          </button>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

export default function Employees() {
  const { employees, setEmployees, attendance, setAttendance, documents, firms: registeredFirms, companyName, selectedFirms, setSelectedFirms, toggleFirm, year, monthIdx, userRole, plan, onUpgrade } = useApp();
  const canEdit = userRole !== 'viewer';
  const [editing,       setEditing]       = useState(null);
  const [creating,      setCreating]      = useState(false);
  const [inactiveModal, setInactiveModal] = useState(null);
  const [showUpgrade,   setShowUpgrade]   = useState(false);

  // Firm names from registered firms, supplemented by any free-text names already in use
  const registeredNames = (registeredFirms || []).map((f) => f.name);
  const existingNames   = [...new Set(employees.map((e) => e.firm))];
  const firmOptions     = [...new Set([...registeredNames, ...existingNames])].filter(Boolean);

  const firms = [...new Set(employees.map((e) => e.firm))];
  const firmCountMap = Object.fromEntries(firms.map((f) => [f, employees.filter((e) => e.firm === f).length]));

  // Apply global firm filter to the visible employee list
  const visibleEmps  = selectedFirms.length === 0 ? employees : employees.filter((e) => selectedFirms.includes(e.firm));
  const visibleFirms = selectedFirms.length === 0 ? firms     : firms.filter((f) => selectedFirms.includes(f));

  const byFirm = visibleFirms.map((f) => ({
    firm: f,
    list: visibleEmps.filter((e) => e.firm === f),
    totalSalary: visibleEmps.filter((e) => e.firm === f).reduce((s, e) => s + e.salary, 0),
  }));

  const defaultFirm = registeredNames[0] || companyName || '';
  const openNew  = () => { setEditing({ ...EMPTY, firm: defaultFirm }); setCreating(true); };
  const openEdit = (emp) => { setEditing({ ...emp }); setCreating(false); };
  const close    = () => { setEditing(null); setCreating(false); };

  const save = () => {
    if (!editing.name.trim())                   { alert('Name is required');   return; }
    if (!editing.firm.trim())                   { alert('Firm is required');   return; }
    if (!editing.salary || editing.salary <= 0) { alert('Salary must be > 0'); return; }

    if (creating) {
      if (!canAddEmployee(plan, employees.length)) {
        setShowUpgrade(true);
        return;
      }
      const nextId = Math.max(0, ...employees.map((e) => e.id)) + 1;
      setEmployees([...employees, { ...editing, id: nextId }]);
    } else {
      setEmployees(employees.map((e) => (e.id === editing.id ? editing : e)));
    }
    close();
  };

  const remove = (emp) => {
    if (!confirm(`Remove ${emp.name}? All attendance records for this employee will also be deleted.`)) return;
    setEmployees(employees.filter((e) => e.id !== emp.id));
    setAttendance((prev) => {
      const next = {};
      for (const mk of Object.keys(prev)) {
        const { [emp.id]: _drop, ...rest } = prev[mk];
        next[mk] = rest;
      }
      return next;
    });
  };

  return (
    <div>
      {/* Plan limit upgrade prompt */}
      {showUpgrade && (
        <div className="modal-backdrop" onClick={() => setShowUpgrade(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
            <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
              <CreditCard size={28} style={{ color: 'var(--accent)', marginBottom: 12 }} />
              <h3 style={{ margin: '0 0 8px' }}>Employee limit reached</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.6 }}>
                {getUpgradeMessage(plan, 'employees')}
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowUpgrade(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: 'center' }}
                  onClick={() => setShowUpgrade(false)}
                >
                  View Plans
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Employee Master</h2>
            <div className="panel-title-sub">
              — {visibleEmps.length} EMPLOYEES · {visibleFirms.length} FIRMS ·{' '}
              TOTAL PAYROLL BASE {formatINR(visibleEmps.reduce((s, e) => s + e.salary, 0))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
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
            {canEdit && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  if (!canAddEmployee(plan, employees.length)) { setShowUpgrade(true); return; }
                  openNew();
                }}
              >
                <Plus size={14} /> Add employee
              </button>
            )}
          </div>
        </div>
        <div className="info-note">
          Edit an employee's salary, ESI/bonus eligibility, or remove them. Click the{' '}
          <FileText size={12} style={{ verticalAlign: 'middle' }} /> icon to upload KYC documents
          (ESI Card, Bank Passbook &amp; Aadhaar) — stored in Firebase.
        </div>
      </div>

      {byFirm.map(({ firm, list, totalSalary }) => (
        <div key={firm} className="panel">
          <div className="panel-title">
            <div>
              <h2 style={{ fontSize: 17 }}>{firm}</h2>
              <div className="panel-title-sub">
                — {list.length} EMPLOYEES · BASE {formatINR(totalSalary)}
              </div>
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Name</th>
                  <th>Guardian</th>
                  <th className="num">Salary</th>
                  <th>ESI</th>
                  <th>Bonus</th>
                  <th>PF</th>
                  <th>Paid Leave</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {list.map((emp, i) => {
                  const empDocs = documents?.[emp.id];
                  const isCurrentlyInactive = isInactiveForMonth(emp, year, monthIdx);
                  return (
                    <tr key={emp.id} style={{ opacity: isCurrentlyInactive ? 0.65 : 1 }}>
                      <td className="faint mono">{i + 1}</td>
                      <td style={{ fontWeight: 500 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <FileText
                            size={13}
                            style={{
                              flexShrink: 0,
                              color: (() => { const d = documents?.[emp.id]; const c = (d?.esi ? 1 : 0) + (d?.passbook ? 1 : 0) + (d?.aadhar ? 1 : 0); return c === 3 ? '#39ff14' : c >= 1 ? '#ff8c00' : 'var(--text-faint)'; })(),
                            }}
                            title={`KYC: ESI ${empDocs?.esi ? '✓' : '✗'} · Passbook ${empDocs?.passbook ? '✓' : '✗'} · Aadhaar ${empDocs?.aadhar ? '✓' : '✗'}`}
                          />
                          {emp.name}
                          {isCurrentlyInactive && (
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', background: 'rgba(212,106,90,0.18)', border: '1px solid rgba(212,106,90,0.35)', borderRadius: 10, color: '#e0806e', letterSpacing: '0.04em' }}>
                              INACTIVE
                            </span>
                          )}
                        </span>
                      </td>
                      <td className="muted">{emp.guardian}</td>
                      <td className="num">{formatINR(emp.salary)}</td>
                      <td>
                        <span className={`pill ${emp.salary <= ESI_THRESHOLD ? 'yes' : 'no'}`}>
                          {emp.salary <= ESI_THRESHOLD ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${emp.salary <= ESI_THRESHOLD ? 'yes' : 'no'}`}>
                          {emp.salary <= ESI_THRESHOLD ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${emp.pf ? 'yes' : 'no'}`}>
                          {emp.pf ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td>
                        <span className={`pill ${emp.paidLeave ? 'yes' : 'no'}`}>
                          {emp.paidLeave ? 'YES' : 'NO'}
                        </span>
                      </td>
                      <td>
                        {canEdit && (
                          <>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setInactiveModal(emp)}
                              title="Manage inactive periods"
                              style={{ color: (emp.inactivePeriods || []).length > 0 ? '#e0806e' : undefined }}
                            >
                              <PauseCircle size={12} />
                            </button>
                            <button className="btn btn-sm btn-ghost" onClick={() => openEdit(emp)}>
                              <Pencil size={12} />
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(emp)}>
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {inactiveModal && (
        <InactivePeriodsModal
          emp={inactiveModal}
          employees={employees}
          setEmployees={setEmployees}
          currentYear={year}
          currentMonthIdx={monthIdx}
          onClose={() => setInactiveModal(null)}
        />
      )}

      {/* Add / Edit employee modal */}
      {editing && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{creating ? 'New Employee' : 'Edit Employee'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={close}><X size={14} /></button>
            </div>

            <div className="field">
              <label>Employee name</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Rahul Kumar"
                autoFocus
              />
            </div>

            <div className="field">
              <label>Father / Husband name</label>
              <input
                value={editing.guardian}
                onChange={(e) => setEditing({ ...editing, guardian: e.target.value })}
                placeholder="e.g. Mr. Ram Kumar"
              />
            </div>

            <div className="field">
              <label>Firm</label>
              {firmOptions.length > 0 ? (
                <select
                  value={editing.firm}
                  onChange={(e) => setEditing({ ...editing, firm: e.target.value })}
                >
                  {firmOptions.map((f) => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={editing.firm}
                  onChange={(e) => setEditing({ ...editing, firm: e.target.value })}
                  placeholder="Firm name"
                />
              )}
            </div>

            <div className="field">
              <label>Monthly salary (₹)</label>
              <input
                type="number"
                value={editing.salary}
                onChange={(e) => {
                  const salary = Number(e.target.value);
                  setEditing({ ...editing, salary, esi: salary <= ESI_THRESHOLD });
                }}
                min={0}
                step={100}
              />
            </div>

            <label className="switch-row" style={{ opacity: 0.7, cursor: 'default' }}>
              <input
                type="checkbox"
                checked={editing.salary <= ESI_THRESHOLD}
                readOnly
                style={{ pointerEvents: 'none' }}
              />
              <span>
                ESI applicable{' '}
                <span className="faint mono" style={{ fontSize: 11 }}>
                  (auto: salary ≤ ₹21,000 → 0.75% deducted)
                </span>
              </span>
            </label>

            <label className="switch-row" style={{ opacity: 0.7, cursor: 'default' }}>
              <input
                type="checkbox"
                checked={editing.salary <= ESI_THRESHOLD}
                readOnly
                style={{ pointerEvents: 'none' }}
              />
              <span>
                Bonus applicable{' '}
                <span className="faint mono" style={{ fontSize: 11 }}>
                  (auto: salary ≤ ₹21,000 → bonus added)
                </span>
              </span>
            </label>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={editing.pf}
                onChange={(e) => setEditing({ ...editing, pf: e.target.checked })}
              />
              <span>PF applicable <span className="faint mono" style={{ fontSize: 11 }}>(salary ≤ ₹21,000 → 12% deducted)</span></span>
            </label>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={editing.paidLeave}
                onChange={(e) => setEditing({ ...editing, paidLeave: e.target.checked })}
              />
              <span>Paid Leave applicable <span className="faint mono" style={{ fontSize: 11 }}>PL upto 2</span></span>
            </label>

            <div className="modal-actions">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>
                {creating ? 'Add employee' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
