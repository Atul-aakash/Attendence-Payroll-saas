import { useState } from 'react';
import { Plus, Pencil, Trash2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { MONTH_NAMES, daysInMonth } from '../payroll';
import { useApp } from '../context/AppContext';

const EMPTY = { date: '', name: '', type: 'Festival', observed: true };

export default function Holidays() {
  const { holidays, setHolidays, year, userRole } = useApp();
  const isAdmin = userRole === 'admin';
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [viewMonth, setViewMonth] = useState(0);

  const byMonth = Array.from({ length: 12 }, (_, i) =>
    holidays.filter((h) => {
      const d = new Date(h.date);
      return d.getFullYear() === year && d.getMonth() === i;
    }).sort((a, b) => new Date(a.date) - new Date(b.date)),
  );

  const openNew = () => {
    setEditing({ ...EMPTY, date: `${year}-${String(viewMonth + 1).padStart(2, '0')}-01` });
    setCreating(true);
  };
  const openEdit = (h) => { setEditing({ ...h, originalDate: h.date }); setCreating(false); };
  const close = () => { setEditing(null); setCreating(false); };

  const save = () => {
    if (!editing.date) { alert('Date is required'); return; }
    if (!editing.name.trim()) { alert('Name is required'); return; }
    if (creating) {
      setHolidays([...holidays, { date: editing.date, name: editing.name, type: editing.type, observed: editing.observed }]);
    } else {
      setHolidays(holidays.map((h) =>
        h.date === editing.originalDate ? { date: editing.date, name: editing.name, type: editing.type, observed: editing.observed } : h
      ));
    }
    close();
  };

  const remove = (h) => {
    if (!confirm(`Remove holiday "${h.name}"?`)) return;
    setHolidays(holidays.filter((x) => x.date !== h.date));
  };

  const toggleObserved = (h) => {
    setHolidays(holidays.map((x) =>
      x.date === h.date ? { ...x, observed: !x.observed } : x
    ));
  };

  const observedCount = holidays.filter((h) => {
    const d = new Date(h.date);
    return d.getFullYear() === year && h.observed;
  }).length;
  const totalCount = holidays.filter((h) => new Date(h.date).getFullYear() === year).length;

  return (
    <div>
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Holiday Calendar · {year}</h2>
            <div className="panel-title-sub">
              — {observedCount} OBSERVED · {totalCount - observedCount} DISABLED · {totalCount} TOTAL
            </div>
          </div>
          {isAdmin && (
            <button className="btn btn-primary" onClick={openNew}>
              <Plus size={14} /> Add holiday
            </button>
          )}
        </div>

        <div className="info-note">
          Click a holiday to toggle whether the company <strong>observes</strong> it. Disabled holidays
          won't be counted as paid holidays in salary calculations — useful when your company works on
          a government holiday.
        </div>
      </div>

      {/* CALENDAR VIEW */}
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2 style={{ fontSize: 18 }}>{MONTH_NAMES[viewMonth]} {year}</h2>
            <div className="panel-title-sub">
              — {byMonth[viewMonth].filter((h) => h.observed).length} OBSERVED HOLIDAYS
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-sm" onClick={() => setViewMonth((m) => (m + 11) % 12)}>
              <ChevronLeft size={13} />
            </button>
            <select className="select" value={viewMonth} onChange={(e) => setViewMonth(Number(e.target.value))}>
              {MONTH_NAMES.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
            <button className="btn btn-sm" onClick={() => setViewMonth((m) => (m + 1) % 12)}>
              <ChevronRight size={13} />
            </button>
          </div>
        </div>

        <CalendarMonth
          year={year}
          monthIdx={viewMonth}
          holidays={byMonth[viewMonth]}
          onToggle={isAdmin ? toggleObserved : () => {}}
          onEdit={isAdmin ? openEdit : () => {}}
        />

        <div className="cal-legend">
          <div className="cal-legend-item">
            <span className="cal-swatch" style={{ background: 'rgba(212,160,74,0.1)', borderColor: 'var(--accent)' }}></span>
            Observed holiday
          </div>
          <div className="cal-legend-item">
            <span className="cal-swatch" style={{ background: 'rgba(212,106,90,0.08)', borderColor: 'var(--danger)' }}></span>
            Disabled (company works)
          </div>
          <div className="cal-legend-item">
            <span className="cal-swatch" style={{ background: 'var(--bg-1)', borderColor: 'var(--border)' }}></span>
            Regular day
          </div>
          <span className="faint" style={{ fontSize: 11 }}>· Click a holiday to toggle · Double-click to edit</span>
        </div>
      </div>

      {/* HOLIDAY LIST */}
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2 style={{ fontSize: 17 }}>All Holidays — {year}</h2>
            <div className="panel-title-sub">— FULL LIST</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 30 }}>#</th>
                <th>Date</th>
                <th>Holiday</th>
                <th>Type</th>
                <th>Status</th>
                <th style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {holidays
                .filter((h) => new Date(h.date).getFullYear() === year)
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map((h, i) => {
                  const d = new Date(h.date);
                  return (
                    <tr key={h.date} style={{ opacity: h.observed ? 1 : 0.5 }}>
                      <td className="faint mono">{i + 1}</td>
                      <td className="mono" style={{ fontSize: 12 }}>
                        {d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        <span className="faint" style={{ marginLeft: 6 }}>
                          {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                        </span>
                      </td>
                      <td style={{ fontWeight: 500 }}>{h.name}</td>
                      <td>
                        <span className="pill" style={{ color: h.type === 'National' ? 'var(--info)' : 'var(--accent)' }}>
                          {h.type}
                        </span>
                      </td>
                      <td>
                        <button
                          className={`pill ${h.observed ? 'yes' : 'no'}`}
                          onClick={() => isAdmin && toggleObserved(h)}
                          style={{ cursor: isAdmin ? 'pointer' : 'default', background: 'transparent' }}
                        >
                          {h.observed ? '● OBSERVED' : '○ DISABLED'}
                        </button>
                      </td>
                      <td>
                        {isAdmin && (
                          <>
                            <button className="btn btn-sm btn-ghost" onClick={() => openEdit(h)}>
                              <Pencil size={12} />
                            </button>
                            <button className="btn btn-sm btn-danger" onClick={() => remove(h)}>
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

      {editing && (
        <div className="modal-backdrop" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>{creating ? 'New Holiday' : 'Edit Holiday'}</h3>
              <button className="btn btn-ghost btn-sm" onClick={close}><X size={14} /></button>
            </div>

            <div className="field">
              <label>Date</label>
              <input
                type="date"
                value={editing.date}
                onChange={(e) => setEditing({ ...editing, date: e.target.value })}
              />
            </div>

            <div className="field">
              <label>Holiday name</label>
              <input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="e.g. Diwali"
                autoFocus
              />
            </div>

            <div className="field">
              <label>Type</label>
              <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                <option value="National">National</option>
                <option value="Festival">Festival</option>
                <option value="Company">Company</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <label className="switch-row">
              <input
                type="checkbox"
                checked={editing.observed}
                onChange={(e) => setEditing({ ...editing, observed: e.target.checked })}
              />
              <span>Observed by company <span className="faint mono" style={{ fontSize: 11 }}>(counts as paid holiday)</span></span>
            </label>

            <div className="modal-actions">
              <button className="btn" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={save}>
                {creating ? 'Add holiday' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarMonth({ year, monthIdx, holidays, onToggle, onEdit }) {
  const total = daysInMonth(year, monthIdx);
  const firstDay = new Date(year, monthIdx, 1).getDay(); // 0 = Sun
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const holidayByDay = {};
  holidays.forEach((h) => {
    const d = new Date(h.date);
    holidayByDay[d.getDate()] = h;
  });

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(<div key={`e${i}`} className="cal-day empty" />);
  for (let d = 1; d <= total; d++) {
    const date = new Date(year, monthIdx, d);
    const isSun = date.getDay() === 0;
    const h = holidayByDay[d];
    cells.push(
      <div
        key={d}
        className={`cal-day ${isSun && !h ? 'sunday' : ''} ${h ? 'holiday' : ''} ${h && !h.observed ? 'disabled' : ''}`}
        onClick={() => h && onToggle(h)}
        onDoubleClick={() => h && onEdit(h)}
        title={h ? `${h.name} · ${h.observed ? 'Click to disable' : 'Click to enable'} · double-click to edit` : isSun ? 'Sunday' : ''}
      >
        <span className="cal-day-num">{d}</span>
        {h && <span className="cal-day-name">{h.name}</span>}
      </div>
    );
  }

  return (
    <>
      <div className="cal-grid" style={{ marginBottom: 4 }}>
        {dow.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      </div>
      <div className="cal-grid">{cells}</div>
    </>
  );
}
