import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, LineChart, Line,
} from 'recharts';
import { TrendingUp, Users, CalendarDays, Wallet, Building2 } from 'lucide-react';
import {
  computeMonthPayroll, formatINR, MONTH_NAMES, monthKey, daysInMonth,
} from '../payroll';
import { useApp } from '../context/AppContext';

const ACCENT = '#d4a04a';
const ACCENT_2 = '#e8bd78';
const INFO = '#6a9ad4';
const SUCCESS = '#6fae6a';
const DANGER = '#d46a5a';
const FIRM_COLORS = [ACCENT, INFO];

function TooltipBox({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="custom-tooltip">
      {label && <div className="label">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color }}>
          {p.name}: <strong>{formatter ? formatter(p.value) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export default function Overview() {
  const { employees, holidays, attendance, year, monthIdx, components, selectedFirms } = useApp();

  const filteredEmployees = selectedFirms.length === 0
    ? (employees || [])
    : (employees || []).filter((e) => selectedFirms.includes(e.firm));

  const summary = computeMonthPayroll({ employees: filteredEmployees, attendance, holidays, year, monthIdx, components });

  // Firm breakdown for bar chart
  const firmData = summary.firmBreakdown.map((f) => ({
    name: f.firm.replace('Electrical Engineers', 'EE').replace('India', 'Ind.'),
    fullName: f.firm,
    Gross: Math.round(f.gross),
    'Net Payable': Math.round(f.netPayable),
    ESI: Math.round(f.esiDeduct),
    Headcount: f.headcount,
  }));

  // 12-month trend (based on current employees × their salaries, using actual attendance where entered)
  const trendData = MONTH_NAMES.map((m, idx) => {
    const s = computeMonthPayroll({ employees: filteredEmployees, attendance, holidays, year, monthIdx: idx, components });
    return {
      month: m.slice(0, 3),
      Gross: Math.round(s.totals.gross),
      Net: Math.round(s.totals.netPayable),
      current: idx === monthIdx,
    };
  });

  // Firm pie
  const firmPie = summary.firmBreakdown.map((f) => ({
    name: f.firm,
    value: Math.round(f.netPayable),
  }));

  // Top 5 salary contributors
  const topEarners = [...summary.rows]
    .filter((r) => !r.inactive)
    .sort((a, b) => b.netPayable - a.netPayable)
    .slice(0, 5);

  const absenteeismRate =
    summary.totals.daysAbsent /
    (summary.headcount * summary.totalDays - summary.headcount * summary.publicHolidays) * 100;

  return (
    <div>
      {/* KPI ROW */}
      <div className="kpi-grid">
        <KpiCard
          icon={<Users size={15} />}
          label="Total Employees"
          value={summary.headcount}
          sub={`${summary.firmBreakdown.length} firms`}
        />
        <KpiCard
          icon={<CalendarDays size={15} />}
          label="Public Holidays"
          value={summary.publicHolidays}
          sub={`of ${summary.totalDays} days in ${MONTH_NAMES[monthIdx]}`}
        />
        <KpiCard
          icon={<Wallet size={15} />}
          label="Gross Salary"
          value={formatINR(summary.totals.gross)}
          sub={`Base: ${formatINR(summary.totals.grossBase)}`}
        />
        <KpiCard
          icon={<TrendingUp size={15} />}
          label="Net Payable"
          value={formatINR(summary.totals.netPayable)}
          sub={
            <>
              <span className="down">− {formatINR(summary.totals.esiDeduct)} ESI</span>{' '}
              {summary.totals.pfDeduct > 0 && (
                <span className="down">− {formatINR(summary.totals.pfDeduct)} PF</span>
              )}{' '}
              {summary.totals.bonus > 0 && (
                <span className="up">+ {formatINR(summary.totals.bonus)} bonus</span>
              )}
            </>
          }
        />
      </div>

      {/* CHARTS ROW 1 */}
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Firm-wise Payroll</h2>
              <div className="panel-title-sub">— GROSS · NET · ESI</div>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <BarChart data={firmData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e34" vertical={false} />
                <XAxis dataKey="name" axisLine={{ stroke: '#2a2e34' }} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<TooltipBox formatter={formatINR} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Bar dataKey="Gross" fill={ACCENT} radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net Payable" fill={ACCENT_2} radius={[4, 4, 0, 0]} />
                <Bar dataKey="ESI" fill={DANGER} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Net Distribution</h2>
              <div className="panel-title-sub">— BY FIRM</div>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={firmPie}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {firmPie.map((_, i) => (
                    <Cell key={i} fill={FIRM_COLORS[i % FIRM_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipBox formatter={formatINR} />} />
                <Legend verticalAlign="bottom" iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* CHARTS ROW 2 */}
      <div className="grid-2">
        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Yearly Trend</h2>
              <div className="panel-title-sub">— {year} · GROSS VS NET</div>
            </div>
          </div>
          <div className="chart-wrap">
            <ResponsiveContainer>
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2e34" vertical={false} />
                <XAxis dataKey="month" axisLine={{ stroke: '#2a2e34' }} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
                <Tooltip content={<TooltipBox formatter={formatINR} />} />
                <Legend wrapperStyle={{ paddingTop: 10 }} />
                <Line type="monotone" dataKey="Gross" stroke={ACCENT} strokeWidth={2} dot={{ r: 3, fill: ACCENT }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="Net" stroke={INFO} strokeWidth={2} dot={{ r: 3, fill: INFO }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel">
          <div className="panel-title">
            <div>
              <h2>Top Earners</h2>
              <div className="panel-title-sub">— {MONTH_NAMES[monthIdx]} · NET PAYABLE</div>
            </div>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: 30 }}>#</th>
                  <th>Employee</th>
                  <th>Firm</th>
                  <th className="num">Net</th>
                </tr>
              </thead>
              <tbody>
                {topEarners.map((r, i) => (
                  <tr key={r.employee.id}>
                    <td className="faint mono">{String(i + 1).padStart(2, '0')}</td>
                    <td>{r.employee.name}</td>
                    <td className="muted" style={{ fontSize: 12 }}>
                      {r.employee.firm.replace('Electrical Engineers', 'EE')}
                    </td>
                    <td className="num">{formatINR(r.netPayable)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* FIRM BREAKDOWN */}
      <div className="panel">
        <div className="panel-title">
          <div>
            <h2>Firm Breakdown</h2>
            <div className="panel-title-sub">— SUMMARY</div>
          </div>
          <span className="faint mono" style={{ fontSize: 11 }}>
            <Building2 size={12} style={{ verticalAlign: 'middle' }} />{' '}
            {selectedFirms.length === 0 ? `${summary.firmBreakdown.length} FIRMS` : selectedFirms.join(', ').toUpperCase()}
          </span>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Firm</th>
                <th className="num">Head-count</th>
                <th className="num">Gross (₹)</th>
                <th className="num">Employee ESI (₹)</th>
                <th className="num">Employer ESI (₹)</th>
                <th className="num">PF (₹)</th>
                <th className="num">Bonus (₹)</th>
                <th className="num">Net Payable (₹)</th>
              </tr>
            </thead>
            <tbody>
              {summary.firmBreakdown.map((f) => (
                <tr key={f.firm}>
                  <td>{f.firm}</td>
                  <td className="num">{f.headcount}</td>
                  <td className="num">{formatINR(f.gross)}</td>
                  <td className="num">{formatINR(f.esiDeduct)}</td>
                  <td className="num">{formatINR(f.employerEsi)}</td>
                  <td className="num">{formatINR(f.pfDeduct)}</td>
                  <td className="num">{formatINR(f.bonus)}</td>
                  <td className="num">{formatINR(f.netPayable)}</td>
                </tr>
              ))}
              <tr className="grand-total">
                <td>GRAND TOTAL</td>
                <td className="num">{summary.headcount}</td>
                <td className="num">{formatINR(summary.totals.gross)}</td>
                <td className="num">{formatINR(summary.totals.esiDeduct)}</td>
                <td className="num">{formatINR(summary.totals.employerEsi)}</td>
                <td className="num">{formatINR(summary.totals.pfDeduct)}</td>
                <td className="num">{formatINR(summary.totals.bonus)}</td>
                <td className="num">{formatINR(summary.totals.netPayable)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="info-note" style={{ marginTop: 16 }}>
          <strong style={{ color: 'var(--accent)' }}>Absenteeism this month:</strong>{' '}
          {summary.totals.daysAbsent} total absent-days across {summary.headcount} employees
          ({absenteeismRate.toFixed(1)}% of working capacity).
          ESI employee rate 0.75%, employer rate 3.25% — PF 12% on salary capped at ₹15,000 — bonus 8.33% on eligible employees.
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub }) {
  return (
    <div className="kpi">
      <div className="kpi-label">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--accent)' }}>
          {icon}
        </span>{' '}
        {label}
      </div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub}</div>
    </div>
  );
}
