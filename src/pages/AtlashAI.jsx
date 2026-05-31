import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Loader2, Trash2, Bot, User, AlertTriangle, KeyRound } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { callGemini, hasGeminiKeys } from '../lib/gemini';
import { computeMonthPayroll, MONTH_NAMES } from '../payroll';

// ── Greeting logic ────────────────────────────────────────────────────────────
function getGreeting(name) {
  const now   = new Date();
  const month = now.getMonth() + 1;
  const day   = now.getDate();
  const hour  = now.getHours();

  const occasions = [
    { m: 1,  d: 1,  msg: `Happy New Year, ${name}! 🎆` },
    { m: 1,  d: 26, msg: `Happy Republic Day, ${name}! 🇮🇳` },
    { m: 3,  d: 8,  msg: `Happy Women's Day, ${name}! 💐` },
    { m: 8,  d: 15, msg: `Happy Independence Day, ${name}! 🇮🇳` },
    { m: 10, d: 2,  msg: `Happy Gandhi Jayanti, ${name}!` },
    { m: 11, d: 14, msg: `Happy Children's Day, ${name}! 🎈` },
    { m: 12, d: 25, msg: `Merry Christmas, ${name}! 🎄` },
    { m: 12, d: 31, msg: `Happy New Year's Eve, ${name}! 🎉` },
  ];

  const special = occasions.find((o) => o.m === month && o.d === day);
  if (special) return special.msg;

  if (hour >= 5  && hour < 12) return `Good Morning, ${name}`;
  if (hour >= 12 && hour < 17) return `Good Afternoon, ${name}`;
  if (hour >= 17 && hour < 21) return `Good Evening, ${name}`;
  return `Good Night, ${name}`;
}

function getGreetingEmoji() {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return '☀️';
  if (h >= 12 && h < 17) return '🌤️';
  if (h >= 17 && h < 21) return '🌆';
  return '🌙';
}

// ── Build RAG system prompt ───────────────────────────────────────────────────
function buildSystemPrompt({ employees, attendance, holidays, components, companyName, year, monthIdx }) {
  const summary = computeMonthPayroll({
    employees:  employees  || [],
    attendance: attendance || {},
    holidays:   holidays   || [],
    year, monthIdx, components,
  });

  const empList = (employees || []).map((e, i) =>
    `${i + 1}. ${e.name}${e.guardian ? ` (Guardian: ${e.guardian})` : ''} | Firm: ${e.firm} | Salary: ₹${Number(e.salary).toLocaleString('en-IN')} | ESI: ${e.esi ? 'Yes' : 'No'} | PF: ${e.pf ? 'Yes' : 'No'} | Bonus: ${e.bonus ? 'Yes' : 'No'} | Paid Leave: ${e.paidLeave ? 'Yes' : 'No'}`
  ).join('\n');

  const firmBreakdown = summary.firmBreakdown.map((f) =>
    `  • ${f.firm}: ${f.headcount} employees | Gross ₹${Math.round(f.gross).toLocaleString('en-IN')} | ESI ₹${Math.round(f.esiDeduct).toLocaleString('en-IN')} | PF ₹${Math.round(f.pfDeduct).toLocaleString('en-IN')} | Bonus ₹${Math.round(f.bonus).toLocaleString('en-IN')} | Net ₹${Math.round(f.netPayable).toLocaleString('en-IN')}`
  ).join('\n');

  const holList = (holidays || [])
    .filter((h) => h.observed)
    .map((h) => `  • ${h.date}: ${h.name} (${h.type})`)
    .join('\n') || '  No observed holidays.';

  return `You are Atlash AI, an intelligent HR and payroll assistant for ${companyName}. You have real-time access to the company's live data provided below. Answer questions accurately based on this data. Be professional, concise, and helpful. Use Indian Rupee (₹) formatting with commas for amounts.

COMPANY: ${companyName}
REPORTING PERIOD: ${MONTH_NAMES[monthIdx]} ${year}
TOTAL EMPLOYEES: ${(employees || []).length}
PF RATE: ${components?.pf?.rate ?? 12}%
ESI RATES: Employee 0.75% | Employer 3.25%
BONUS RATE: 8.33%

=== EMPLOYEE MASTER ===
${empList || 'No employees on record.'}

=== ${MONTH_NAMES[monthIdx].toUpperCase()} ${year} — PAYROLL SUMMARY ===
Total Gross Salary:        ₹${Math.round(summary.totals.gross).toLocaleString('en-IN')}
Total Net Payable:         ₹${Math.round(summary.totals.netPayable).toLocaleString('en-IN')}
Employee ESI Deducted:     ₹${Math.round(summary.totals.esiDeduct).toLocaleString('en-IN')}
Employer ESI Liability:    ₹${Math.round(summary.totals.employerEsi).toLocaleString('en-IN')}
PF Deducted (Employee):    ₹${Math.round(summary.totals.pfDeduct).toLocaleString('en-IN')}
Total Bonus:               ₹${Math.round(summary.totals.bonus).toLocaleString('en-IN')}
Total Absent Days:         ${summary.totals.daysAbsent}
Public Holidays:           ${summary.publicHolidays}

=== FIRM-WISE BREAKDOWN ===
${firmBreakdown || '  No firm data.'}

=== OBSERVED HOLIDAYS ===
${holList}

=== RESPONSE RULES ===
- Answer ONLY from the data above for company-specific queries.
- For general HR/payroll law questions (ESI rules, PF regulations, gratuity, labour law), use your knowledge.
- If data is missing, say so clearly — never fabricate numbers.
- Show brief calculations when computing derived figures.
- Keep responses concise but complete. Use bullet points for lists.`;
}

// ── Suggested questions ───────────────────────────────────────────────────────
const SUGGESTIONS = [
  { label: 'Payroll',   q: 'What is the total net payable this month?' },
  { label: 'HR',        q: 'How many employees are enrolled in ESI and PF?' },
  { label: 'Finance',   q: 'What is the total employer ESI liability?' },
  { label: 'Payroll',   q: 'Show the firm-wise payroll breakdown' },
  { label: 'Employees', q: 'Who are the highest paid employees?' },
  { label: 'HR',        q: 'Which employees have paid leave enabled?' },
  { label: 'Finance',   q: 'What is the total PF contribution this month?' },
  { label: 'Calendar',  q: 'What holidays are observed this month?' },
  { label: 'Employees', q: 'How many employees are in each firm?' },
  { label: 'Payroll',   q: 'What is the total bonus payout this month?' },
];

const CATEGORY_COLORS = {
  Payroll:   { bg: 'rgba(212,160,74,0.12)',  border: 'rgba(212,160,74,0.35)',  text: '#d4a04a' },
  HR:        { bg: 'rgba(106,154,212,0.12)', border: 'rgba(106,154,212,0.35)', text: '#6a9ad4' },
  Finance:   { bg: 'rgba(111,174,106,0.12)', border: 'rgba(111,174,106,0.35)', text: '#6fae6a' },
  Employees: { bg: 'rgba(180,120,200,0.12)', border: 'rgba(180,120,200,0.35)', text: '#b478c8' },
  Calendar:  { bg: 'rgba(212,106,90,0.12)',  border: 'rgba(212,106,90,0.35)',  text: '#d46a5a' },
};

// ── Simple markdown → text renderer ──────────────────────────────────────────
function MessageText({ text }) {
  return (
    <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      {text}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AtlashAI({ firebaseUser }) {
  const { employees, attendance, holidays, components, companyName, year, monthIdx, loading } = useApp();

  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const [apiError, setApiError] = useState('');

  const messagesEndRef = useRef(null);
  const inputRef       = useRef(null);

  const rawName    = firebaseUser?.displayName || firebaseUser?.email?.split('@')[0] || 'there';
  const displayName = rawName.charAt(0).toUpperCase() + rawName.slice(1);
  const greeting   = getGreeting(displayName);
  const emoji      = getGreetingEmoji();
  const keysReady  = hasGeminiKeys();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text) => {
    const userText = (text ?? input).trim();
    if (!userText || busy || !keysReady) return;

    setInput('');
    setApiError('');
    const userMsg = { text: userText, isUser: true, id: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);

    try {
      const systemPrompt = buildSystemPrompt({ employees, attendance, holidays, components, companyName, year, monthIdx });
      const history = messages.slice(-12);
      const reply = await callGemini(systemPrompt, userText, history);
      setMessages((prev) => [...prev, { text: reply, isUser: false, id: Date.now() + 1 }]);
    } catch (err) {
      setApiError(err.message || 'Failed to get a response. Please try again.');
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => { setMessages([]); setApiError(''); };

  const isEmpty = messages.length === 0 && !busy;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 8 }}>

      {/* ── Greeting header ── */}
      <div style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        padding: '28px 32px',
        marginBottom: 20,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        gap: 20,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 28, lineHeight: 1 }}>{emoji}</span>
            <h2 style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: 26,
              fontWeight: 500,
              color: 'var(--text)',
              letterSpacing: '-0.01em',
            }}>
              {greeting}
            </h2>
          </div>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            Ask me anything about <strong style={{ color: 'var(--accent)' }}>{companyName}</strong> — payroll, employees, attendance, holidays, and more.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'rgba(212,160,74,0.1)', border: '1px solid rgba(212,160,74,0.25)',
            borderRadius: 20, padding: '5px 12px',
          }}>
            <Sparkles size={12} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em', fontWeight: 600 }}>
              ATLASH AI · GEMINI FLASH
            </span>
          </div>
        </div>
      </div>

      {/* ── No API key banner ── */}
      {!keysReady && (
        <div style={{
          background: 'rgba(212,106,90,0.08)', border: '1px solid rgba(212,106,90,0.3)',
          borderRadius: 12, padding: '16px 20px', marginBottom: 16,
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <KeyRound size={16} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>Gemini API key not configured</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.6 }}>
              Add your Google Gemini API key(s) to the <code style={{ fontFamily: 'var(--font-mono)', background: 'var(--bg-2)', padding: '1px 5px', borderRadius: 4 }}>.env</code> file:
              <br />
              <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 11 }}>
                VITE_GEMINI_API_KEY_1=your_key_here
              </code>
              <br />
              <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                Add up to 3 keys (VITE_GEMINI_API_KEY_1/2/3) for automatic failover. Restart the dev server after adding.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat window ── */}
      <div style={{
        background: 'var(--bg-1)',
        border: '1px solid var(--border)',
        borderRadius: 16,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 480,
        maxHeight: 600,
      }}>
        {/* Chat header */}
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--bg-2)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bot size={15} style={{ color: 'var(--accent)' }} />
            <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Chat</span>
            {messages.length > 0 && (
              <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)' }}>
                · {messages.length} message{messages.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {messages.length > 0 && (
            <button
              onClick={clearChat}
              title="Clear chat"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-faint)', fontSize: 12, padding: '4px 8px',
                borderRadius: 6, transition: 'color 0.15s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)'; }}
            >
              <Trash2 size={12} /> Clear
            </button>
          )}
        </div>

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Empty state */}
          {isEmpty && (
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: '24px 16px',
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(212,160,74,0.1)', border: '1px solid rgba(212,160,74,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <Sparkles size={22} style={{ color: 'var(--accent)' }} />
              </div>
              <h3 style={{ margin: '0 0 6px', fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 500, color: 'var(--text)' }}>
                How can I help you today?
              </h3>
              <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--text-faint)', maxWidth: 320 }}>
                Ask me about payroll, employees, attendance, or anything about {companyName}.
              </p>
              {/* Suggested questions */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 600 }}>
                {SUGGESTIONS.map((s, i) => {
                  const c = CATEGORY_COLORS[s.label] || CATEGORY_COLORS.Payroll;
                  return (
                    <button
                      key={i}
                      onClick={() => send(s.q)}
                      disabled={!keysReady || loading}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        background: c.bg, border: `1px solid ${c.border}`,
                        borderRadius: 20, padding: '6px 12px',
                        cursor: keysReady && !loading ? 'pointer' : 'not-allowed',
                        opacity: keysReady && !loading ? 1 : 0.5,
                        transition: 'all 0.15s',
                      }}
                      onMouseEnter={(e) => { if (keysReady) e.currentTarget.style.opacity = '0.8'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = keysReady ? '1' : '0.5'; }}
                    >
                      <span style={{ fontSize: 10, color: c.text, fontFamily: 'var(--font-mono)', fontWeight: 600, letterSpacing: '0.06em' }}>
                        {s.label}
                      </span>
                      <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>{s.q}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Message bubbles */}
          {messages.map((msg) => (
            <div key={msg.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.isUser ? 'row-reverse' : 'row' }}>
              {/* Avatar */}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: msg.isUser ? 'var(--accent-dim)' : 'rgba(106,154,212,0.2)',
                border: `1px solid ${msg.isUser ? 'rgba(212,160,74,0.4)' : 'rgba(106,154,212,0.3)'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {msg.isUser
                  ? <User size={13} style={{ color: 'var(--accent)' }} />
                  : <Bot  size={13} style={{ color: '#6a9ad4' }} />}
              </div>
              {/* Bubble */}
              <div style={{
                maxWidth: '75%',
                background: msg.isUser ? 'rgba(212,160,74,0.12)' : 'var(--bg-2)',
                border: `1px solid ${msg.isUser ? 'rgba(212,160,74,0.25)' : 'var(--border)'}`,
                borderRadius: msg.isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                padding: '10px 14px',
              }}>
                <MessageText text={msg.text} />
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {busy && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(106,154,212,0.2)', border: '1px solid rgba(106,154,212,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Bot size={13} style={{ color: '#6a9ad4' }} />
              </div>
              <div style={{
                background: 'var(--bg-2)', border: '1px solid var(--border)',
                borderRadius: '4px 16px 16px 16px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: 5,
              }}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--accent)',
                    animation: `atlash-ai-pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {apiError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              background: 'rgba(212,106,90,0.08)', border: '1px solid rgba(212,106,90,0.25)',
              borderRadius: 10, padding: '10px 14px',
            }}>
              <AlertTriangle size={14} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.6 }}>{apiError}</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input form */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg-2)',
          flexShrink: 0,
        }}>
          <form
            onSubmit={(e) => { e.preventDefault(); send(); }}
            style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!keysReady || busy}
              placeholder={
                !keysReady  ? 'Add a Gemini API key to start chatting…' :
                busy        ? 'Atlash AI is thinking…' :
                              'Ask about payroll, employees, holidays…'
              }
              style={{
                flex: 1,
                background: 'var(--bg)',
                border: '1px solid var(--border-2)',
                borderRadius: 10,
                padding: '10px 14px',
                color: 'var(--text)',
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.15s',
                opacity: !keysReady ? 0.6 : 1,
              }}
              onFocus={(e)  => { e.target.style.borderColor = 'var(--accent)'; }}
              onBlur={(e)   => { e.target.style.borderColor = 'var(--border-2)'; }}
            />
            <button
              type="submit"
              disabled={!input.trim() || !keysReady || busy}
              style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: input.trim() && keysReady && !busy ? 'var(--accent)' : 'var(--bg-3)',
                border: '1px solid var(--border-2)',
                color: input.trim() && keysReady && !busy ? 'var(--bg)' : 'var(--text-faint)',
                cursor: input.trim() && keysReady && !busy ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s', flexDirection: 'column',
              }}
            >
              {busy
                ? <Loader2 size={16} style={{ animation: 'spin 0.8s linear infinite' }} />
                : <Send size={16} />}
            </button>
          </form>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text-faint)', textAlign: 'center', fontFamily: 'var(--font-mono)' }}>
            Powered by Google Gemini Flash · RAG on live {companyName} data
          </div>
        </div>
      </div>

      {/* Typing pulse animation */}
      <style>{`
        @keyframes atlash-ai-pulse {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
