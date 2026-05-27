import { createContext, useContext, useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { SEED_HOLIDAYS, DEFAULT_COMPONENTS } from '../seedData';

const UI_KEY = 'payroll-ui';
function loadUI() {
  try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; }
}

const AppContext = createContext(null);

export function AppProvider({ companyId, companyName, firms, userRole, plan, ownerUid, children }) {
  const ui = loadUI();
  const currentYear = new Date().getFullYear();
  const [year,          setYear]          = useState(ui.year     || currentYear);
  const [monthIdx,      setMonthIdx]      = useState(ui.monthIdx ?? new Date().getMonth());
  const [selectedFirms, setSelectedFirms] = useState([]);

  const [employees,  setEmpState]  = useState(null);
  const [holidays,   setHolState]  = useState(null);
  const [attendance, setAttState]  = useState(null);
  const [documents,  setDocState]  = useState(null);
  const [components, setCompState] = useState(null);
  const [loading,    setLoading]   = useState(true);

  const toggleFirm = (name) =>
    setSelectedFirms((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name],
    );

  useEffect(() => {
    const current = loadUI();
    localStorage.setItem(UI_KEY, JSON.stringify({ ...current, year, monthIdx }));
  }, [year, monthIdx]);

  useEffect(() => { setSelectedFirms([]); }, [companyId]);

  useEffect(() => {
    if (!companyId) { setLoading(false); return; }

    setLoading(true);
    setEmpState(null);
    setHolState(null);
    setAttState(null);
    setDocState(null);
    setCompState(null);

    const loaded = { emp: false, hol: false, att: false, doc: false, comp: false };
    const check = () => {
      if (loaded.emp && loaded.hol && loaded.att && loaded.doc && loaded.comp) setLoading(false);
    };

    const ref = (key) => doc(db, 'companies', companyId, 'payroll', key);

    const unsubs = [
      onSnapshot(ref('employees'), async (snap) => {
        if (snap.exists()) setEmpState(snap.data().list);
        else { await setDoc(ref('employees'), { list: [] }); setEmpState([]); }
        loaded.emp = true; check();
      }),
      onSnapshot(ref('holidays'), async (snap) => {
        if (snap.exists()) setHolState(snap.data().list);
        else { await setDoc(ref('holidays'), { list: SEED_HOLIDAYS }); setHolState(SEED_HOLIDAYS); }
        loaded.hol = true; check();
      }),
      onSnapshot(ref('attendance'), async (snap) => {
        if (snap.exists()) setAttState(snap.data().map);
        else { await setDoc(ref('attendance'), { map: {} }); setAttState({}); }
        loaded.att = true; check();
      }),
      onSnapshot(ref('documents'), async (snap) => {
        if (snap.exists()) setDocState(snap.data().map);
        else { await setDoc(ref('documents'), { map: {} }); setDocState({}); }
        loaded.doc = true; check();
      }),
      onSnapshot(ref('components'), async (snap) => {
        if (snap.exists()) setCompState(snap.data().map);
        else { await setDoc(ref('components'), { map: DEFAULT_COMPONENTS }); setCompState(DEFAULT_COMPONENTS); }
        loaded.comp = true; check();
      }),
    ];

    return () => unsubs.forEach((u) => u());
  }, [companyId]);

  const shiftMonth = (delta) => {
    let m = monthIdx + delta, y = year;
    while (m < 0)  { m += 12; y -= 1; }
    while (m > 11) { m -= 12; y += 1; }
    setMonthIdx(m); setYear(y);
  };

  const ref = (key) => doc(db, 'companies', companyId, 'payroll', key);

  const setEmployees = async (val) => {
    const next = typeof val === 'function' ? val(employees) : val;
    setEmpState(next);
    await setDoc(ref('employees'), { list: next });
  };

  const setHolidays = async (val) => {
    const next = typeof val === 'function' ? val(holidays) : val;
    setHolState(next);
    await setDoc(ref('holidays'), { list: next });
  };

  const setAttendance = async (val) => {
    const next = typeof val === 'function' ? val(attendance) : val;
    setAttState(next);
    await setDoc(ref('attendance'), { map: next });
  };

  const setDocuments = async (val) => {
    const next = typeof val === 'function' ? val(documents) : val;
    setDocState(next);
    await setDoc(ref('documents'), { map: next });
  };

  const setComponents = async (val) => {
    const next = typeof val === 'function' ? val(components) : val;
    setCompState(next);
    await setDoc(ref('components'), { map: next });
  };

  return (
    <AppContext.Provider value={{
      companyId, companyName, firms, userRole,
      plan: plan || 'free',
      ownerUid,
      selectedFirms, setSelectedFirms, toggleFirm,
      year, monthIdx, setYear, setMonthIdx, shiftMonth,
      employees,  setEmployees,
      holidays,   setHolidays,
      attendance, setAttendance,
      documents,  setDocuments,
      components, setComponents,
      loading,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
