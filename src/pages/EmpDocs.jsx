import { useState, useRef } from 'react';
import { FileText, Upload, ExternalLink, Trash2, Loader2, CheckCircle2, X, ChevronDown } from 'lucide-react';
import { ref as sRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';
import { useApp } from '../context/AppContext';

const DOC_TYPES = [
  { type: 'esi',      label: 'ESI Card'     },
  { type: 'passbook', label: 'Bank Passbook' },
  { type: 'aadhar',   label: 'Aadhaar Card'  },
];

function docIconStyle(empDocs) {
  const count = (empDocs?.esi ? 1 : 0) + (empDocs?.passbook ? 1 : 0) + (empDocs?.aadhar ? 1 : 0);
  if (count === 3) return { color: '#39ff14', filter: 'drop-shadow(0 0 6px #39ff14)' };
  if (count >= 1)  return { color: '#ff8c00', filter: 'drop-shadow(0 0 6px #ff8c00)' };
  return { color: 'var(--text-faint)', filter: 'none' };
}

function DocModal({ empId, employees, documents, setDocuments, companyId, canEdit, onClose }) {
  const emp     = employees.find((e) => e.id === empId);
  const empDocs = documents?.[empId] || {};

  const [pending,   setPending]   = useState({ esi: null,  passbook: null,  aadhar: null  });
  const [uploading, setUploading] = useState({ esi: false, passbook: false, aadhar: false });
  const [saved,     setSaved]     = useState({ esi: false, passbook: false, aadhar: false });
  const [errors,    setErrors]    = useState({ esi: null,  passbook: null,  aadhar: null  });

  const esiRef      = useRef(null);
  const passbookRef = useRef(null);
  const aadharRef   = useRef(null);
  const inputRefs   = { esi: esiRef, passbook: passbookRef, aadhar: aadharRef };

  if (!emp) return null;

  const docCount = (empDocs.esi ? 1 : 0) + (empDocs.passbook ? 1 : 0) + (empDocs.aadhar ? 1 : 0);

  const selectFile = (type, file) => {
    if (!file) return;
    setPending((p) => ({ ...p, [type]: file }));
    setErrors((e) => ({ ...e, [type]: null }));
  };

  const uploadDoc = async (type) => {
    const file = pending[type];
    if (!file) return;
    setUploading((u) => ({ ...u, [type]: true }));
    try {
      const fileRef = sRef(storage, `documents/${companyId}/${empId}/${type}`);
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(
          'Upload timed out. Make sure Firebase Storage is enabled and rules allow writes.'
        )), 30000)
      );
      await Promise.race([uploadBytes(fileRef, file), timeout]);
      const url   = await getDownloadURL(fileRef);
      const entry = { url, name: file.name, uploadedAt: new Date().toISOString() };
      await setDocuments({ ...documents, [empId]: { ...empDocs, [type]: entry } });
      setPending((p) => ({ ...p, [type]: null }));
      setSaved((s) => ({ ...s, [type]: true }));
      setTimeout(() => setSaved((s) => ({ ...s, [type]: false })), 3000);
    } catch (err) {
      setErrors((e) => ({ ...e, [type]: err.message }));
    }
    setUploading((u) => ({ ...u, [type]: false }));
  };

  const removeDoc = async (type) => {
    if (!confirm('Remove this document?')) return;
    try { await deleteObject(sRef(storage, `documents/${companyId}/${empId}/${type}`)); } catch { /* may not exist */ }
    await setDocuments({ ...documents, [empId]: { ...empDocs, [type]: null } });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ minWidth: 440, maxWidth: 520 }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
          <h3 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={docIconStyle(empDocs)} />
            KYC Documents
          </h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={14} /></button>
        </div>
        <div className="panel-title-sub" style={{ marginBottom: 4 }}>{emp.name}</div>
        <div style={{
          fontSize: 11, marginBottom: 16,
          color: docCount === 3 ? '#39ff14' : docCount >= 1 ? '#ff8c00' : 'var(--text-faint)',
        }}>
          {docCount === 3 ? '✓ All 3 documents on file' : docCount >= 1 ? `⚠ ${docCount} of 3 documents uploaded` : '✗ No documents uploaded yet'}
        </div>

        {DOC_TYPES.map(({ type, label }) => {
          const stored      = empDocs[type];
          const pendingFile = pending[type];
          const busy        = uploading[type];
          const justSaved   = saved[type];

          return (
            <div key={type} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '14px 16px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 13 }}>
                  <FileText size={13} style={{ color: stored ? '#39ff14' : 'var(--text-faint)', filter: stored ? 'drop-shadow(0 0 4px #39ff14)' : 'none' }} />
                  {label}
                </span>
                <span style={{ fontSize: 11, color: stored ? '#39ff14' : 'var(--text-faint)' }}>
                  {stored ? '✓ Uploaded' : '✗ Not uploaded'}
                </span>
              </div>

              {stored && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-1)', borderRadius: 6, padding: '6px 10px', marginBottom: 10, gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }}>
                    {stored.name}
                  </span>
                  <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <a href={stored.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" title="View document">
                      <ExternalLink size={11} /> View
                    </a>
                    {canEdit && (
                      <button className="btn btn-sm btn-danger" onClick={() => removeDoc(type)} title="Remove document">
                        <Trash2 size={11} />
                      </button>
                    )}
                  </span>
                </div>
              )}

              {canEdit && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button className="btn btn-sm btn-ghost" onClick={() => inputRefs[type].current?.click()} disabled={busy} style={{ flex: 1, justifyContent: 'flex-start', overflow: 'hidden' }}>
                    {pendingFile
                      ? <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📄 {pendingFile.name}</span>
                      : <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{stored ? 'Choose replacement…' : 'Choose file…'}</span>
                    }
                  </button>
                  <button className="btn btn-sm btn-primary" onClick={() => uploadDoc(type)} disabled={!pendingFile || busy} style={{ flexShrink: 0, minWidth: 155 }}>
                    {busy       ? <><Loader2 size={12} style={{ animation: 'spin 0.8s linear infinite' }} /> Uploading to Firebase…</>
                    : justSaved ? <><CheckCircle2 size={12} style={{ color: '#39ff14' }} /> Saved to Firebase!</>
                    :             <><Upload size={12} /> Upload to Firebase</>}
                  </button>
                  <input ref={inputRefs[type]} type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={(e) => { selectFile(type, e.target.files?.[0]); e.target.value = ''; }} />
                </div>
              )}

              {pendingFile && !busy && !errors[type] && (
                <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 6 }}>
                  Click "Upload to Firebase" to save this file to the database.
                </div>
              )}
              {errors[type] && (
                <div style={{ fontSize: 11, color: '#ff4d4d', marginTop: 6, lineHeight: 1.4 }}>
                  ⚠ Upload failed: {errors[type]}
                </div>
              )}
            </div>
          );
        })}

        <div className="modal-actions" style={{ marginTop: 8 }}>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default function EmpDocs() {
  const {
    employees, documents, setDocuments, companyId,
    selectedFirms, setSelectedFirms, toggleFirm, userRole,
  } = useApp();
  const canEdit = userRole !== 'viewer';

  const [docEmpId, setDocEmpId] = useState(null);
  const [kycOpen,  setKycOpen]  = useState(true);

  const visibleEmployees = selectedFirms.length === 0
    ? (employees || [])
    : (employees || []).filter((e) => selectedFirms.includes(e.firm));

  const completeCount = visibleEmployees.filter((e) => {
    const d = documents?.[e.id] || {};
    return d.esi && d.passbook && d.aadhar;
  }).length;
  const missingCount = visibleEmployees.length - completeCount;

  return (
    <div>
      <div className="panel">
        <div
          className="panel-title"
          onClick={() => setKycOpen((o) => !o)}
          style={{ cursor: 'pointer', userSelect: 'none' }}
        >
          <div>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileText size={16} style={{ color: 'var(--accent)' }} />
              KYC Document Status
            </h2>
            <div className="panel-title-sub">
              — {visibleEmployees.length} EMPLOYEES ·{' '}
              <span style={{ color: '#39ff14' }}>{completeCount} COMPLETE</span>
              {missingCount > 0 && (
                <> · <span style={{ color: '#ff8c00' }}>{missingCount} MISSING DOCS</span></>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Active firm chips */}
            {selectedFirms.length > 0 && (
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
                {selectedFirms.map((f) => (
                  <span key={f} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '3px 8px 3px 10px', background: 'rgba(212,160,74,0.15)', border: '1px solid rgba(212,160,74,0.35)', borderRadius: 20, fontSize: 11, color: 'var(--accent)' }}>
                    {f}
                    <button onClick={() => toggleFirm(f)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', padding: '0 2px', display: 'flex', lineHeight: 1, fontSize: 14 }}>×</button>
                  </span>
                ))}
                <button onClick={() => setSelectedFirms([])} style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>Clear</button>
              </div>
            )}
            <ChevronDown
              size={16}
              style={{ color: 'var(--text-faint)', transform: kycOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s', flexShrink: 0 }}
            />
          </div>
        </div>

        {kycOpen && (
          visibleEmployees.length === 0 ? (
            <div className="info-note" style={{ textAlign: 'center', padding: 32, color: 'var(--text-faint)' }}>
              No employees found for the selected firm(s).
            </div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th style={{ width: 30 }}>#</th>
                    <th>Employee</th>
                    <th>Firm</th>
                    {DOC_TYPES.map(({ label }) => (
                      <th key={label} style={{ textAlign: 'center' }}>{label}</th>
                    ))}
                    <th style={{ textAlign: 'center' }}>Status</th>
                    <th style={{ width: 36 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.map((emp, i) => {
                    const empDocs = documents?.[emp.id] || {};
                    const count   = (empDocs.esi ? 1 : 0) + (empDocs.passbook ? 1 : 0) + (empDocs.aadhar ? 1 : 0);
                    return (
                      <tr key={emp.id}>
                        <td className="faint mono">{i + 1}</td>
                        <td style={{ fontWeight: 500 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FileText size={13} style={{ flexShrink: 0, ...docIconStyle(empDocs) }} />
                            {emp.name}
                          </span>
                        </td>
                        <td className="muted" style={{ fontSize: 12 }}>{emp.firm}</td>
                        {DOC_TYPES.map(({ type }) => {
                          const docEntry = empDocs[type];
                          return (
                            <td key={type} style={{ textAlign: 'center' }}>
                              {docEntry ? (
                                <a href={docEntry.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-ghost" style={{ fontSize: 11, color: '#39ff14', gap: 3, padding: '2px 8px' }} title={docEntry.name}>
                                  <ExternalLink size={10} /> View
                                </a>
                              ) : (
                                <span style={{ color: '#ff4d4d', fontSize: 13 }}>✗</span>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: count === 3 ? '#39ff14' : count >= 1 ? '#ff8c00' : '#ff4d4d' }}>
                            {count === 3 ? '✓ Complete' : `${count} / 3`}
                          </span>
                        </td>
                        <td>
                          <button className="btn btn-sm btn-ghost" onClick={() => setDocEmpId(emp.id)} title="Upload / manage documents">
                            <Upload size={12} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {docEmpId !== null && (
        <DocModal
          empId={docEmpId}
          employees={employees || []}
          documents={documents}
          setDocuments={setDocuments}
          companyId={companyId}
          canEdit={canEdit}
          onClose={() => setDocEmpId(null)}
        />
      )}
    </div>
  );
}
