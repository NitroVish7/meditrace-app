/* MediTrace core: synthetic data, demo storage, consent/permissions, audit chain, derived medication lists.
   DEMO NOTICE: all data lives in this browser's localStorage. It is a functional prototype, not secure
   multi-user medical record storage, and the sign-in is a demo, not production authentication. */
const { useState, useEffect, useMemo, useRef, useCallback, useContext, createContext } = React;
const L = new Proxy(window.LucideReact || {}, { get: (t, k) => t[k] || (() => null) });
const { Activity, AlertTriangle, CheckCircle2, Clock, FileText, ScanText, GitCompareArrows, ClipboardCheck, ShieldAlert, ShieldCheck,
  UserRound, Users, Pill, History, ChevronRight, ChevronLeft, RotateCcw, Copy, Lock, Unlock, Link2, Stethoscope, FlaskConical, Sun, Moon,
  Sunset, Sunrise, BedDouble, Info, Send, Eye, ArrowRight, Undo2, Type, CircleDashed, PauseCircle, XCircle, MessageSquareWarning, Bell,
  BellRing, BellOff, LogOut, LogIn, Menu, X, Search, Upload, FileImage, Calendar, CalendarDays, HeartPulse, Building2, KeyRound, Mail,
  Phone, Plus, Check, AlarmClock, Flag, FolderOpen, LayoutDashboard, ListChecks, UserPlus, BadgeCheck, Timer, Trash2, Ban, HelpCircle,
  ClipboardList, Syringe, BookOpen, Inbox, FileWarning, Paperclip } = L;

const AppCtx = createContext(null);
const useApp = () => useContext(AppCtx);

/* ───────── time & ids ───────── */
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const nowISO = () => new Date().toISOString();
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (d = new Date()) => { const z = new Date(d); return `${z.getFullYear()}-${pad2(z.getMonth() + 1)}-${pad2(z.getDate())}`; };
const parseDay = (s) => { if (/^\d{4}-\d{2}-\d{2}$/.test(s || '')) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); } return new Date(s); };
const fmtDate = (s) => s ? parseDay(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtTs = (iso) => iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const fmtTime = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
const relTime = (iso, now = Date.now()) => {
  const d = Date.parse(iso) - now, a = Math.abs(d), fut = d > 0;
  const s = a < MIN ? 'moments' : a < HOUR ? `${Math.round(a / MIN)} min` : a < DAY ? `${Math.round(a / HOUR)} h` : `${Math.round(a / DAY)} d`;
  return a < MIN ? (fut ? 'in moments' : 'just now') : fut ? `in ${s}` : `${s} ago`;
};
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const ageFrom = (dob) => { if (!dob) return null; const b = parseDay(dob), n = new Date(); let a = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--; return a; };

/* ───────── hashing ───────── */
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); };
async function sha256(s) {
  try { if (window.crypto && crypto.subtle) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); } } catch (e) {}
  return 'fnv' + fnv(s) + fnv('x' + s) + fnv('y' + s);
}
const randSalt = () => { try { return [...crypto.getRandomValues(new Uint8Array(12))].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return Math.random().toString(36).slice(2); } };
const hashPw = (pw, salt) => sha256(`${salt}:${pw}`);

/* ───────── audit chain ───────── */
/* The verified identity behind an action (credential status + second factor) is part of the hashed content. */
const auditHash = (prev, e) => { const a = [e.seq, e.ts, e.actorId, e.actor, e.role, e.action, e.patientId || '', e.item, e.detail]; if (e.auth) a.push(e.auth); return fnv(prev + '|' + JSON.stringify(a)); };
function pushAudit(db, e) {
  const prev = db.log.length ? db.log[db.log.length - 1].hash : '00000000';
  const entry = { ts: nowISO(), patientId: null, item: '', ...e, seq: db.log.length + 1, prev };
  entry.hash = auditHash(prev, entry);
  db.log.push(entry);
}
function verifyChain(log) {
  let prev = '00000000';
  for (const e of log) { if (e.prev !== prev || auditHash(prev, e) !== e.hash) return { ok: false, at: e.seq }; prev = e.hash; }
  return { ok: true, n: log.length };
}
const SYS = { actorId: 'system', actor: 'MediTrace', role: 'system' };

/* ───────── users ───────── */
const userById = (db, id) => db.users.find(u => u.id === id);
const nameOf = (db, id) => id === 'system' ? 'MediTrace' : (userById(db, id)?.profile.fullName || 'Unknown user');
const orgOf = (u) => u?.profile?.practice === 'independent' ? (u.profile.practiceName || 'Private practice') : (u?.profile?.orgName || '—');
const roleLabel = (u) => !u ? '' : u.role === 'patient' ? 'Patient' : (u.profile.designation || 'Healthcare professional');
const actorOf = (u) => ({ actorId: u.id, actor: u.profile.fullName, role: u.role === 'patient' ? 'Patient' : (u.profile.designation || 'Professional'), auth: authStamp(u) });
const isPharmacist = (u) => /pharm/i.test(u?.profile?.designation || '') || /pharm/i.test(u?.profile?.specialisation || '');

/* ───────── notifications ───────── */
function notify(db, userId, n) {
  db.notifications.unshift({ id: uid('N'), userId, at: nowISO(), read: false, priority: 'normal', ...n });
  if (db.notifications.length > 400) db.notifications.length = 400;
}

/* ───────── consent & permissions ───────── */
const SCOPES = [
  { id: 'prescriptions', label: 'Prescription records', icon: FileText },
  { id: 'medications', label: 'Medication history', icon: Pill },
  { id: 'history', label: 'Medical history', icon: BookOpen },
  { id: 'visits', label: 'Previous hospital visits', icon: Building2 },
  { id: 'verified', label: 'Verified medication instructions', icon: ShieldCheck },
  { id: 'complete', label: 'Complete patient record', icon: FolderOpen },
];
const SCOPE = Object.fromEntries(SCOPES.map(s => [s.id, s]));
const DURATIONS = [
  { id: '2m', label: '2 minutes (demo: test expiry)', ms: 2 * MIN },
  { id: '24h', label: '24 hours', ms: DAY },
  { id: '7d', label: '7 days', ms: 7 * DAY },
  { id: '30d', label: '30 days', ms: 30 * DAY },
  { id: '90d', label: '90 days', ms: 90 * DAY },
];
const DURATION = Object.fromEntries(DURATIONS.map(d => [d.id, d]));
const REASONS = ['Follow-up care after discharge', 'Medication reconciliation', 'Prescription verification', 'Specialist consultation', 'Ongoing treatment of a chronic condition', 'Other'];

const grantState = (g, now = Date.now()) => (g.status === 'approved' && g.expiresAt && now >= Date.parse(g.expiresAt)) ? 'expired' : g.status;
function activeScopes(db, doctorId, patientId, now = Date.now()) {
  const s = new Set();
  db.grants.forEach(g => { if (g.doctorId === doctorId && g.patientId === patientId && grantState(g, now) === 'approved') g.scopes.forEach(x => s.add(x)); });
  if (s.has('complete')) SCOPES.forEach(x => s.add(x.id));
  return s;
}
const canAccess = (db, d, p, scope, now) => activeScopes(db, d, p, now).has(scope);
const authorisedPatients = (db, doctorId, now) => db.users.filter(u => u.role === 'patient' && activeScopes(db, doctorId, u.id, now).size > 0);
const medsAccessPatients = (db, doctorId, now) => authorisedPatients(db, doctorId, now).filter(p => { const s = activeScopes(db, doctorId, p.id, now); return s.has('medications') || s.has('prescriptions'); }).map(p => p.id);

/* ───────── medication vocabulary ───────── */
const FREQ = {
  QD: { label: 'once daily', slots: ['any'] },
  QAM: { label: 'every morning', slots: ['morning'] },
  QNOON: { label: 'every afternoon', slots: ['afternoon'] },
  QPM: { label: 'every evening', slots: ['evening'] },
  QHS: { label: 'at bedtime', slots: ['bedtime'] },
  BID: { label: 'twice daily', slots: ['any', 'any'] },
  TID: { label: 'three times daily', slots: ['any', 'any', 'any'] },
  QID: { label: 'four times daily', slots: ['any', 'any', 'any', 'any'] },
  PRN: { label: 'as needed', slots: ['prn'] },
};
const ROUTE = { PO: 'by mouth', SC: 'injected under the skin', IV: 'into a vein', TOP: 'applied to the skin', INH: 'inhaled' };
const UNITS = ['mg', 'mcg', 'g', 'units', 'mEq', 'mL', '%', 'puffs', 'tablet(s)'];
const SLOTS = [
  { id: 'morning', label: 'Morning', icon: Sunrise },
  { id: 'afternoon', label: 'Afternoon', icon: Sun },
  { id: 'evening', label: 'Evening', icon: Sunset },
  { id: 'bedtime', label: 'Bedtime', icon: BedDouble },
  { id: 'any', label: 'Timing not specified', icon: Clock },
  { id: 'prn', label: 'As needed', icon: HelpCircle },
];
const SLOT = Object.fromEntries(SLOTS.map(s => [s.id, s]));
/* Timing comes only from the verified instruction. "Once/twice daily" without a stated time stays "not specified". */
function slotsFor(reg) {
  if (!reg || !reg.freq || reg.status) return [];
  if (reg.freq === 'QD' && /breakfast|morning|\bAM\b/i.test(reg.note || '')) return ['morning'];
  if (reg.freq === 'QD' && /bedtime|night/i.test(reg.note || '')) return ['bedtime'];
  return FREQ[reg.freq]?.slots || [];
}
const regText = (r) => {
  if (!r) return '—';
  if (r.status === 'stopped') return 'Discontinued';
  const parts = [r.form, `${r.dose ?? '?'} ${r.unit ?? '[unit?]'}`, r.route, r.freq ? r.freq : '[freq?]'].filter(Boolean);
  return parts.join(' · ') + (r.status === 'held' ? ' — HOLD' : '') + (r.note ? ` (${r.note})` : '');
};
const plainReg = (r) => `${r.dose} ${r.unit}${r.route ? `, ${ROUTE[r.route] || r.route}` : ''}, ${FREQ[r.freq]?.label || 'as directed'}${r.note ? `, ${r.note}` : ''}`;
const isComplete = (r) => !!(r && r.dose && r.unit && r.freq);
const normName = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const BRAND = { eliquis: 'apixaban', lantus: 'insulinglargine', protonix: 'pantoprazole', lasix: 'furosemide', lipitor: 'atorvastatin', toprol: 'metoprolol', advil: 'ibuprofen', zestril: 'lisinopril' };
const genericKey = (s) => { const n = normName(s); for (const [b, g] of Object.entries(BRAND)) if (n.startsWith(b)) return g; return n.replace(/(succinate|tartrate|er|xl)+$/, ''); };

/* ───────── synthetic handover documents (original RxContinuum dataset, preserved) ───────── */
const MARA_ID = 'MT-P-004812';
const PATIENT = { name: 'Mara Lindqvist', first: 'Mara', age: 71, sex: 'F', dob: '1955-03-14', mrn: MARA_ID, weightKg: 58, scr: 1.6, egfr: 34, allergies: ['Penicillin (rash)'], dx: ['Atrial fibrillation', 'HFrEF, recent decompensation', 'Type 2 diabetes', 'CKD stage 3b'] };
const DOCS = {
  A: { id: 'A', short: 'Visit A', title: 'Hospital Discharge Summary', source: 'Harbor General Hospital · Cardiology', date: '2026-10-28', author: 'A. Reyes, MD (Hospitalist)', format: 'EHR export · structured text', method: 'Native text parse',
    lines: ['HARBOR GENERAL HOSPITAL — DISCHARGE SUMMARY      [SYNTHETIC DEMO RECORD]', 'Patient: LINDQVIST, Mara    ID: MT-P-004812    DOB: 1955-03-14', 'Admit: 2026-10-22    Discharge: 2026-10-28    Attending: A. Reyes, MD', '', 'Principal dx: Acute on chronic HFrEF exacerbation. Hx AF, T2DM, CKD 3b.', 'Course: Diuresed IV, transitioned to PO. Cr peaked 1.9, 1.6 at discharge.', 'Wt at discharge 58 kg. ACE-i held for AKI.', '', 'DISCHARGE MEDICATIONS:', '1. Metoprolol succinate ER 50 mg PO once daily', '2. Apixaban 5 mg PO twice daily', '3. Furosemide 40 mg PO once daily (AM)', '4. Atorvastatin 40 mg PO nightly', '5. Lisinopril 10 mg PO daily — HOLD until BMP recheck; PCP to resume', '6. Insulin glargine 18 units SC at bedtime', '7. Pantoprazole 40 mg PO daily before breakfast', '', 'Follow-up: PCP within 7 days. Repeat BMP at that visit.', 'Allergies: Penicillin (rash).'] },
  B: { id: 'B', short: 'Visit B', title: 'Primary Care Follow-up Note', source: 'Eastside Family Clinic', date: '2026-11-03', author: 'J. Tanaka, NP', format: 'Faxed PDF · 1 page', method: 'OCR + entity extraction',
    lines: ['EASTSIDE FAMILY CLINIC   Progress Note        [SYNTHETIC DEMO RECORD]', 'Pt: Lindqvist, M.   DOB 03/14/1955   Visit 11/03/2026', 'Provider: J. Tanaka, NP', '', 'S: Post-hosp f/u for CHF. Some knee pain, using OTC meds. Ankles better.', 'O: Wt 57.6 kg. BP 118/70. HR 64 irreg. BMP drawn today, pending.', 'A/P: CHF stable. AF rate controlled. Continue below.', '', 'Current meds (pt-reported + reviewed):', '- Metoprolol tartrate 25 mg BID', '- Eliquis 2.5 mg BID', '- Furosemide 40 mg', '- Atorvastatin 40 mg qHS', '- Lantus 18 at night', '- Protonix 40 mg daily', '- Ibuprofen 400 mg PRN knee pain', '', 'Plan: Recheck BMP. Return 4 wks.'] },
};
const MEDS = [
  { id: 'apixaban', name: 'Apixaban', cls: 'Anticoagulant (DOAC)', highAlert: true, purpose: 'Blood thinner. Lowers the risk of stroke from an irregular heartbeat.',
    A: { line: 10, quote: 'Apixaban 5 mg PO twice daily', raw: 'Apixaban', reg: { dose: '5', unit: 'mg', route: 'PO', freq: 'BID' }, conf: { name: .99, dose: .99, unit: .99, route: .99, freq: .98 } },
    B: { line: 10, quote: 'Eliquis 2.5 mg BID', raw: 'Eliquis', reg: { dose: '2.5', unit: 'mg', route: null, freq: 'BID' }, conf: { name: .96, dose: .88, unit: .95, route: null, freq: .94 } },
    findings: ['Dose conflict', 'Brand → generic'], severity: 'critical',
    rationale: 'Visit A lists 5 mg BID; Visit B lists 2.5 mg BID. The labeled AF dose reduction applies when at least 2 of 3 are met: age ≥ 80, weight ≤ 60 kg, serum creatinine ≥ 1.5 mg/dL. This record shows age 71, weight 58 kg, SCr 1.6, so 2 criteria are met. Either value could reflect intent; the dose change is not documented in Visit B.',
    questions: ['Was the reduction to 2.5 mg an intentional prescriber decision?', 'Which strength is the patient actually taking at home?'] },
  { id: 'glargine', name: 'Insulin glargine', cls: 'Long-acting insulin', highAlert: true, purpose: 'Long-acting insulin. Helps control blood sugar.',
    A: { line: 14, quote: 'Insulin glargine 18 units SC at bedtime', raw: 'Insulin glargine', reg: { dose: '18', unit: 'units', route: 'SC', freq: 'QHS' }, conf: { name: .99, dose: .99, unit: .99, route: .98, freq: .97 } },
    B: { line: 13, quote: 'Lantus 18 at night', raw: 'Lantus', reg: { dose: '18', unit: null, route: null, freq: 'QHS' }, conf: { name: .93, dose: .64, unit: null, route: null, freq: .71 } },
    findings: ['Missing unit', 'Low OCR confidence', 'Brand → generic'], severity: 'high',
    rationale: 'Visit B reads "Lantus 18" with no unit. Insulin is a high-alert medication and the unit must be explicit. OCR confidence on the dose token is 0.64, below the 0.75 review threshold.',
    questions: ['Confirm 18 units at bedtime with the patient’s pen or pharmacy record.'] },
  { id: 'ibuprofen', name: 'Ibuprofen', cls: 'NSAID (OTC, patient-reported)', highAlert: false, purpose: 'Pain reliever (anti-inflammatory).', A: null,
    B: { line: 15, quote: 'Ibuprofen 400 mg PRN knee pain', raw: 'Ibuprofen', reg: { dose: '400', unit: 'mg', route: null, freq: 'PRN' }, conf: { name: .97, dose: .93, unit: .95, route: null, freq: .9 } },
    findings: ['New in Visit B', 'Interaction: apixaban', 'Caution: HFrEF / CKD'], severity: 'high',
    rationale: 'An NSAID appears for the first time in Visit B, reported as OTC use for knee pain. It is listed alongside an anticoagulant (added bleeding risk) in a patient with HFrEF and CKD 3b (fluid retention, renal function). It was not addressed in the Visit B plan.',
    questions: ['Was ibuprofen reviewed by the prescriber, or only recorded as patient-reported?'] },
  { id: 'furosemide', name: 'Furosemide', cls: 'Loop diuretic', highAlert: false, purpose: 'Water pill. Removes extra fluid to ease swelling and breathing.',
    A: { line: 11, quote: 'Furosemide 40 mg PO once daily (AM)', raw: 'Furosemide', reg: { dose: '40', unit: 'mg', route: 'PO', freq: 'QAM' }, conf: { name: .99, dose: .99, unit: .99, route: .99, freq: .97 } },
    B: { line: 11, quote: 'Furosemide 40 mg', raw: 'Furosemide', reg: { dose: '40', unit: 'mg', route: null, freq: null }, conf: { name: .98, dose: .95, unit: .96, route: null, freq: null } },
    findings: ['Missing frequency'], severity: 'high',
    rationale: 'Visit B lists 40 mg with no frequency. Visit A specifies once daily in the morning. Diuretic timing matters after a recent heart-failure admission.',
    questions: ['Confirm the patient still takes it once each morning.'] },
  { id: 'metoprolol', name: 'Metoprolol', cls: 'Beta-blocker', highAlert: false, purpose: 'Slows and steadies the heart rate and helps the heart pump.',
    A: { line: 9, quote: 'Metoprolol succinate ER 50 mg PO once daily', raw: 'Metoprolol succinate ER', reg: { form: 'succinate ER', dose: '50', unit: 'mg', route: 'PO', freq: 'QD' }, conf: { name: .99, dose: .99, unit: .99, route: .99, freq: .98 } },
    B: { line: 9, quote: 'Metoprolol tartrate 25 mg BID', raw: 'Metoprolol tartrate', reg: { form: 'tartrate', dose: '25', unit: 'mg', route: null, freq: 'BID' }, conf: { name: .94, dose: .92, unit: .95, route: null, freq: .93 } },
    findings: ['Formulation change', 'Frequency change'], severity: 'moderate',
    rationale: 'Succinate ER 50 mg once daily became tartrate 25 mg twice daily. Total daily milligrams match, but the two salts are different products and are not interchangeable as written. The change is not explained in Visit B.',
    questions: ['Which product is in the patient’s pill bottle?'] },
  { id: 'lisinopril', name: 'Lisinopril', cls: 'ACE inhibitor', highAlert: false, purpose: 'Lowers blood pressure and protects the heart and kidneys.',
    A: { line: 13, quote: 'Lisinopril 10 mg PO daily — HOLD until BMP recheck; PCP to resume', raw: 'Lisinopril', reg: { dose: '10', unit: 'mg', route: 'PO', freq: 'QD', status: 'held' }, conf: { name: .99, dose: .99, unit: .99, route: .99, freq: .97 } },
    B: null, findings: ['Omitted in Visit B', 'Held at discharge'], severity: 'moderate',
    rationale: 'Held at discharge pending a repeat BMP, with the PCP asked to decide on resuming. Visit B does not mention it, and the BMP from that visit is still pending. Its status (held, resumed or stopped) is not explicit.',
    questions: ['Record whether lisinopril stays on hold until the BMP result is reviewed.'] },
  { id: 'atorvastatin', name: 'Atorvastatin', cls: 'Statin', highAlert: false, purpose: 'Lowers cholesterol.',
    A: { line: 12, quote: 'Atorvastatin 40 mg PO nightly', raw: 'Atorvastatin', reg: { dose: '40', unit: 'mg', route: 'PO', freq: 'QHS' }, conf: { name: .99, dose: .99, unit: .99, route: .99, freq: .96 } },
    B: { line: 12, quote: 'Atorvastatin 40 mg qHS', raw: 'Atorvastatin', reg: { dose: '40', unit: 'mg', route: null, freq: 'QHS' }, conf: { name: .98, dose: .96, unit: .96, route: null, freq: .95 } },
    findings: ['Match'], severity: 'none', rationale: 'Same drug, dose and frequency in both visits.', questions: [] },
  { id: 'pantoprazole', name: 'Pantoprazole', cls: 'Proton pump inhibitor', highAlert: false, purpose: 'Reduces stomach acid.',
    A: { line: 15, quote: 'Pantoprazole 40 mg PO daily before breakfast', raw: 'Pantoprazole', reg: { dose: '40', unit: 'mg', route: 'PO', freq: 'QD', note: 'before breakfast' }, conf: { name: .99, dose: .99, unit: .99, route: .99, freq: .97 } },
    B: { line: 14, quote: 'Protonix 40 mg daily', raw: 'Protonix', reg: { dose: '40', unit: 'mg', route: null, freq: 'QD' }, conf: { name: .95, dose: .94, unit: .95, route: null, freq: .93 } },
    findings: ['Match', 'Brand → generic'], severity: 'none', rationale: 'Protonix normalized to pantoprazole. Same dose and frequency.', questions: [] },
].map(m => ({ ...m, patientId: MARA_ID }));
const EXTRA_OPTIONS = {
  lisinopril: [{ id: 'hold', label: 'Keep on hold until BMP reviewed', reg: { dose: '10', unit: 'mg', route: 'PO', freq: 'QD', status: 'held' } }, { id: 'stop', label: 'Discontinue', reg: { status: 'stopped' } }],
  ibuprofen: [{ id: 'stop', label: 'Discontinue', reg: { status: 'stopped' } }],
};
const SEV = {
  critical: { label: 'Critical', text: 'text-crit', bg: 'bg-crit/15', ring: 'ring-crit/40', dot: 'bg-crit', bar: 'bg-crit', order: 0 },
  high: { label: 'High', text: 'text-high', bg: 'bg-high/15', ring: 'ring-high/40', dot: 'bg-high', bar: 'bg-high', order: 1 },
  moderate: { label: 'Moderate', text: 'text-mod', bg: 'bg-mod/15', ring: 'ring-mod/40', dot: 'bg-mod', bar: 'bg-mod', order: 2 },
  none: { label: 'Match', text: 'text-ok', bg: 'bg-ok/10', ring: 'ring-ok/30', dot: 'bg-ok', bar: 'bg-ok', order: 3 },
};
const STATUS = {
  open: { label: 'Needs decision', cls: 'text-high bg-high/10 ring-high/30', icon: CircleDashed },
  decided: { label: 'Awaiting verification', cls: 'text-accent bg-accent/10 ring-accent/30', icon: Clock },
  escalated: { label: 'With prescriber', cls: 'text-info bg-info/10 ring-info/30', icon: Send },
  verified: { label: 'Verified', cls: 'text-ok bg-ok/10 ring-ok/30', icon: CheckCircle2 },
  auto: { label: 'Auto-matched', cls: 'text-ok bg-ok/10 ring-ok/30', icon: CheckCircle2 },
};
const RX_STATUS = {
  pending: { label: 'Pending doctor verification', cls: 'text-high bg-high/10 ring-high/30', icon: Clock },
  clarification: { label: 'Clarification requested', cls: 'text-info bg-info/10 ring-info/30', icon: MessageSquareWarning },
  verified: { label: 'Verified', cls: 'text-ok bg-ok/10 ring-ok/30', icon: BadgeCheck },
  rejected: { label: 'Verification rejected', cls: 'text-crit bg-crit/10 ring-crit/30', icon: XCircle },
  discrepancy: { label: 'Discrepancy under review', cls: 'text-mod bg-mod/15 ring-mod/40', icon: Flag },
  blocked: { label: 'On hold: missing critical information', cls: 'text-crit bg-crit/10 ring-crit/30', icon: Lock },
  escalated: { label: 'Escalated to clinician', cls: 'text-info bg-info/10 ring-info/30', icon: Send },
  reconciled: { label: 'In reconciliation', cls: 'text-accent bg-accent/10 ring-accent/30', icon: GitCompareArrows },
};

/* The original record is never edited. Facts confirmed by a human during an escalation are layered on top, with provenance. */
function effectiveReg(rx, i) {
  const base = rx.meds[i].reg, c = rx.clarifications || {};
  return c[`${i}.route`] ? { ...base, route: c[`${i}.route`].value } : base;
}
const RX_ON_HOLD = ['blocked', 'escalated'];

/* Every reconcilable medicine across patients: the static handover set plus items flagged from uploaded prescriptions. */
const reconMedsFor = (db, pids) => [...(pids.includes(MARA_ID) ? MEDS : []), ...db.recon.flagged.filter(f => pids.includes(f.patientId))];
const getMed = (db, id) => MEDS.find(m => m.id === id) || db.recon.flagged.find(f => f.id === id);

/* Only professionally verified, released instructions reach the patient's list and checklist. */
function verifiedMeds(db, pid) {
  const released = [], pending = [];
  const items = db.recon.items;
  const pushRecon = (m) => {
    const it = items[m.id]; if (!it) return;
    if (['verified', 'auto'].includes(it.status) && it.decision?.reg) released.push({ key: m.id, name: m.name, purpose: m.purpose, reg: it.decision.reg, highAlert: m.highAlert,
      source: m.rxId ? 'Flagged prescription, resolved in professional review' : 'Discharge ↔ follow-up reconciliation', prescriber: m.prescriber || null,
      verifiedBy: it.status === 'auto' ? 'Auto-matched across both visits' : `${nameOf(db, it.decidedBy)} → ${nameOf(db, it.verifiedBy)}`, verifiedAt: it.verifiedAt || null });
    else pending.push({ key: m.id, name: m.name, purpose: m.purpose, reason: it.status === 'escalated' ? 'Waiting for the prescriber' : 'Under professional review' });
  };
  if (pid === MARA_ID) MEDS.forEach(pushRecon);
  db.recon.flagged.filter(f => f.patientId === pid).forEach(pushRecon);
  db.prescriptions.filter(r => r.patientId === pid && r.kind !== 'handover').forEach(r => {
    const flagged = new Set(r.flaggedIdx || []);
    r.meds.forEach((md, i) => {
      if (flagged.has(i)) return;
      const key = `${r.id}:${i}`;
      if (r.status === 'verified') released.push({ key, name: md.name, purpose: md.purpose || 'From your verified prescription', reg: effectiveReg(r, i), source: `Prescription dated ${fmtDate(r.date)}`, prescriber: r.prescriber.name,
        verifiedBy: r.verification?.byName, verifiedAt: r.verification?.at, rxId: r.id });
      else if (['pending', 'clarification', 'discrepancy', ...RX_ON_HOLD].includes(r.status)) pending.push({ key, name: md.name, purpose: md.purpose || (r.kind === 'transfer' ? 'From your transfer of care' : 'From your uploaded prescription'), reason: RX_ON_HOLD.includes(r.status) ? 'On hold while a clinician confirms how this medicine should be given' : r.status === 'clarification' ? 'Your doctor asked for clarification' : 'Awaiting doctor verification', rxId: r.id });
    });
  });
  return { released, pending };
}
function dosesFor(released) {
  const out = [];
  released.filter(m => !m.reg.status).forEach(m => { slotsFor(m.reg).forEach((slot, i, arr) => out.push({ key: `${m.key}#${i}`, medKey: m.key, name: m.name, reg: m.reg, slot, idx: i, count: arr.length, highAlert: m.highAlert })); });
  return out;
}
const adherenceEvents = (db, pid) => db.adherence[pid] || [];
function doseState(events, date, key) {
  let last = null; for (const e of events) if (e.date === date && e.doseKey === key) last = e;
  return last && last.status !== 'pending' ? last : null;
}
function dayStats(db, pid, date, doses) {
  const ev = adherenceEvents(db, pid); const sched = doses.filter(d => d.slot !== 'prn');
  let taken = 0, skipped = 0; sched.forEach(d => { const s = doseState(ev, date, d.key); if (s?.status === 'taken') taken++; else if (s?.status === 'skipped') skipped++; });
  return { total: sched.length, taken, skipped, pending: sched.length - taken - skipped, pct: sched.length ? Math.round(taken / sched.length * 100) : null };
}
const DEFAULT_REMINDERS = { enabled: true, browser: false, slotTimes: { morning: '08:00', afternoon: '13:00', evening: '18:00', bedtime: '21:30' }, doseTimes: {}, snoozes: {}, fired: {}, history: [] };
const reminderTimeFor = (rem, dose) => dose.slot === 'any' ? rem.doseTimes[dose.key] || null : dose.slot === 'prn' ? null : rem.slotTimes[dose.slot];

/* ───────── synthetic prescription image (canvas) ───────── */
function makeRxImage({ clinic, address, doctor, reg, patient, pid, date, lines, note }) {
  try {
    const W = 900, H = 1120, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
    x.fillStyle = '#fbfaf6'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#123868'; x.fillRect(0, 0, W, 120);
    x.fillStyle = '#ffffff'; x.font = '700 34px Georgia, serif'; x.fillText(clinic, 48, 62);
    x.font = '400 18px Helvetica, Arial, sans-serif'; x.fillText(address, 48, 94);
    x.fillStyle = '#1c2b3a'; x.font = '600 20px Helvetica, Arial, sans-serif'; x.fillText(doctor, 48, 170);
    x.font = '400 16px Helvetica, Arial, sans-serif'; x.fillStyle = '#4a5866'; x.fillText(`Reg. no. ${reg}`, 48, 196);
    x.fillText(`Date: ${date}`, W - 230, 170);
    x.strokeStyle = '#c9cfd6'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(48, 222); x.lineTo(W - 48, 222); x.stroke();
    x.fillStyle = '#1c2b3a'; x.font = '400 18px Helvetica, Arial, sans-serif'; x.fillText(`Patient: ${patient}    ID: ${pid}`, 48, 260);
    x.font = 'italic 700 64px Georgia, serif'; x.fillStyle = '#123868'; x.fillText('℞', 48, 350);
    x.fillStyle = '#18324d'; x.font = '400 27px "Segoe Script", "Bradley Hand", "Comic Sans MS", cursive';
    lines.forEach((t, i) => x.fillText(t, 120, 340 + i * 64));
    if (note) { x.font = '400 18px Helvetica, Arial, sans-serif'; x.fillStyle = '#4a5866'; x.fillText(note, 48, 340 + lines.length * 64 + 40); }
    x.strokeStyle = '#18324d'; x.lineWidth = 2; x.beginPath(); x.moveTo(W - 330, 980); x.bezierCurveTo(W - 280, 930, W - 230, 1010, W - 170, 960); x.bezierCurveTo(W - 140, 940, W - 110, 985, W - 80, 965); x.stroke();
    x.font = '400 15px Helvetica, Arial, sans-serif'; x.fillStyle = '#4a5866'; x.fillText('Signature', W - 330, 1010);
    x.save(); x.translate(W / 2, H / 2); x.rotate(-0.5); x.fillStyle = 'rgba(196,30,48,0.13)'; x.font = '800 70px Helvetica, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('SYNTHETIC DEMO', 0, 0); x.restore();
    return c.toDataURL('image/jpeg', 0.82);
  } catch (e) { return null; }
}

/* Uploaded images are downscaled before storing so several fit in browser storage. */
function readUpload(file) {
  return new Promise((resolve, reject) => {
    const okType = /^image\/(png|jpe?g|webp|gif)$/.test(file.type) || file.type === 'application/pdf';
    if (!okType) return reject(new Error('Choose a JPG, PNG, WebP or PDF file.'));
    if (file.type === 'application/pdf' && file.size > 1.5 * 1024 * 1024) return reject(new Error('PDFs must be 1.5 MB or smaller in this demo (browser storage limit).'));
    if (file.size > 12 * 1024 * 1024) return reject(new Error('Files must be 12 MB or smaller.'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('The file could not be read.'));
    fr.onload = () => {
      if (file.type === 'application/pdf') return resolve({ dataUrl: fr.result, type: 'pdf', name: file.name, size: file.size });
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, 1400 / Math.max(img.width, img.height)); const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        const out = c.toDataURL('image/jpeg', 0.8); resolve({ dataUrl: out, type: 'image', name: file.name, size: Math.round(out.length * 0.75) });
      };
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ───────── demo storage ───────── */
const DB_KEY = 'meditrace-db-v1', SESSION_KEY = 'meditrace-session', SESSION_MS = 8 * HOUR;
const DEMO_PASSWORD = 'demo1234';
function saveDb(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); return true; } catch (e) { return false; } }
async function loadDb() {
  try { const s = JSON.parse(localStorage.getItem(DB_KEY)); if (s && s.version === 3 && s.users) return s; } catch (e) {}
  const db = await seedDb(); saveDb(db); return db;
}
const readSession = () => { try { const s = JSON.parse(localStorage.getItem(SESSION_KEY)); if (s && s.userId && s.exp > Date.now()) return s; } catch (e) {} return null; };
const writeSession = (s) => { try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch (e) {} };

async function seedDb() {
  const now = Date.now(), iso = (ms) => new Date(ms).toISOString(), day = (o) => ymd(now + o * DAY);
  const mkUser = async (id, role, email, phone, profile, createdOffsetDays, mfa) => { const salt = randSalt(); return { id, role, email, phone, salt, pwHash: await hashPw(DEMO_PASSWORD, salt), createdAt: iso(now - createdOffsetDays * DAY), demo: true, profile, ...(mfa ? { mfa: { enrolled: true, method: 'totp', secret: mfa, enrolledAt: iso(now - (createdOffsetDays - 1) * DAY), lastStep: 0, failed: 0, devices: [] } } : {}) }; };
  // Synthetic registry checks for the seeded professionals (see REGISTRY in security.js).
  const vrec = (idValue, legalName, specialty, affiliation, outcome, ago, fail) => ({ idType: 'npi', idValue, legalName, specialty, affiliation, doc: { name: 'licence-photo.jpg', size: 184000, type: 'image' }, outcome, at: iso(now - ago), registry: 'Synthetic provider registry (simulated NPPES / medical council API)',
    steps: [['format', 'NPI format & check digit', '10 digits; Luhn check digit is valid.'], ['lookup', 'Registry record found', 'Matched a registry record.'], ['name', 'Legal name matches registry', 'Name matches.'], ['license', 'Licence active and in date', fail || 'Active.'], ['specialty', 'Board certification / specialty', 'Matches.'], ['affiliation', 'Practice / hospital affiliation', 'Matches.'], ['unique', 'Not linked to another account', 'No other account uses this licence.'], ['document', 'Licence / identity document', 'Stored for administrator spot-check.']].map(([key, label, detail]) => ({ key, label, detail, state: key === 'license' && fail ? 'fail' : 'pass' })) });
  const users = [
    await mkUser(MARA_ID, 'patient', 'mara.demo@meditrace.test', '5550100100', { fullName: 'Mara Lindqvist', dob: '1955-03-14', gender: 'Female', blood: 'A+', address: '14 Alder Row, Harbor City (synthetic)', emergency: 'Erik Lindqvist (son) · 555 010 0101' }, 200),
    await mkUser('MT-P-007730', 'patient', 'daniel.demo@meditrace.test', '5550100200', { fullName: 'Daniel Okafor', dob: '1982-07-09', gender: 'Male', blood: 'O+', address: '', emergency: '' }, 12),
    await mkUser('MT-D-001021', 'doctor', 'lea.moreau.demo@meditrace.test', '5550100300', { fullName: 'Dr. Léa Moreau', regNo: 'SYN-MC-55821', specialisation: 'Internal Medicine', designation: 'Attending Physician', practice: 'clinic', orgName: 'Eastside Family Clinic', department: 'Primary Care', orgAddress: '220 Eastside Ave, Harbor City (synthetic)', credential: 'verified', npi: '1992401178', verification: vrec('1992401178', 'Léa Moreau', 'Internal Medicine', 'Eastside Family Clinic', 'verified', 299 * DAY) }, 300, 'MTLEAMOREAUDEMO2'),
    await mkUser('MT-D-001044', 'doctor', 'r.osei.demo@meditrace.test', '5550100400', { fullName: 'R. Osei, PharmD', regNo: 'SYN-PH-20417', specialisation: 'Clinical Pharmacy', designation: 'Clinical Pharmacist', practice: 'hospital', orgName: 'Harbor General Hospital', department: 'Pharmacy', orgAddress: '1 Harbor Way, Harbor City (synthetic)', credential: 'verified', npi: '1992401251', verification: vrec('1992401251', 'R. Osei', 'Clinical Pharmacy', 'Harbor General Hospital', 'verified', 279 * DAY) }, 280, 'MTROSEIPHARMDEM3'),
    await mkUser('MT-D-001090', 'doctor', 'sam.reyes.demo@meditrace.test', '5550100500', { fullName: 'Dr. Sam Reyes', regNo: 'SYN-MC-61190', specialisation: 'Emergency Medicine', designation: 'Emergency Physician', practice: 'hospital', orgName: 'Harbor General Hospital', department: 'Emergency', orgAddress: '1 Harbor Way, Harbor City (synthetic)', credential: 'flagged', npi: '1992401335',
      verification: vrec('1992401335', 'Sam Reyes', 'Emergency Medicine', 'Harbor General Hospital', 'flagged', 2 * DAY, 'Status SUSPENDED. Suspended by the (synthetic) state medical board on 2026-11-02.'), verificationHistory: [{ at: iso(now - 150 * DAY), outcome: 'verified', idValue: '1992401335' }, { at: iso(now - 2 * DAY), outcome: 'flagged', idValue: '1992401335' }] }, 150, 'MTSAMREYESDEMOX4'),
  ];
  const grants = [
    { id: 'G-1', doctorId: 'MT-D-001021', patientId: MARA_ID, scopes: ['complete'], reason: 'Follow-up care after discharge', note: 'Post-discharge medication reconciliation', durationId: '30d', requestedAt: iso(now - 3 * DAY), status: 'approved', decidedAt: iso(now - 3 * DAY + HOUR), expiresAt: iso(now + 27 * DAY) },
    { id: 'G-2', doctorId: 'MT-D-001044', patientId: MARA_ID, scopes: ['prescriptions', 'medications', 'verified'], reason: 'Medication reconciliation', note: 'Pharmacist review of discharge medicines', durationId: '30d', requestedAt: iso(now - 3 * DAY), status: 'approved', decidedAt: iso(now - 3 * DAY + 2 * HOUR), expiresAt: iso(now + 27 * DAY) },
    { id: 'G-4', doctorId: 'MT-D-001090', patientId: MARA_ID, scopes: ['prescriptions', 'medications'], reason: 'Medication reconciliation', note: 'Emergency department follow-up', durationId: '30d', requestedAt: iso(now - 6 * DAY), status: 'approved', decidedAt: iso(now - 6 * DAY + HOUR), expiresAt: iso(now + 24 * DAY) },
    { id: 'G-3', doctorId: 'MT-D-001044', patientId: MARA_ID, scopes: ['history', 'visits'], reason: 'Specialist consultation', note: 'Check prior admissions for renal dosing history', durationId: '7d', requestedAt: iso(now - 5 * HOUR), status: 'pending' },
  ];
  const rxImg = makeRxImage({ clinic: 'Lakeside Skin Clinic', address: '9 Lakeside Rd, Harbor City', doctor: 'Dr. P. Anand, Dermatology', reg: 'SYN-MC-71230', patient: 'Mara Lindqvist', pid: MARA_ID, date: fmtDate(day(-4)), lines: ['Hydrocortisone 1% cream', 'Apply thin layer to rash twice daily', 'for 7 days. Topical.'], note: 'Review in 2 weeks if not improving.' });
  const vitImg = makeRxImage({ clinic: 'Eastside Family Clinic', address: '220 Eastside Ave, Harbor City', doctor: 'Dr. Léa Moreau, Internal Medicine', reg: 'SYN-MC-55821', patient: 'Mara Lindqvist', pid: MARA_ID, date: fmtDate('2026-06-12'), lines: ['Cholecalciferol (Vitamin D3)', '1000 units by mouth once daily'], note: '' });
  const prescriptions = [
    { id: 'RX-A', kind: 'handover', docKey: 'A', patientId: MARA_ID, date: '2026-10-28', prescriber: { name: 'A. Reyes, MD', org: 'Harbor General Hospital' }, title: 'Discharge medication list', status: 'reconciled', uploadedBy: 'system', uploadedAt: iso(now - 2 * DAY), meds: [], reviews: [] },
    { id: 'RX-B', kind: 'handover', docKey: 'B', patientId: MARA_ID, date: '2026-11-03', prescriber: { name: 'J. Tanaka, NP', org: 'Eastside Family Clinic' }, title: 'Clinic follow-up medication list', status: 'reconciled', uploadedBy: 'system', uploadedAt: iso(now - 2 * DAY), meds: [], reviews: [] },
    { id: 'RX-VITD', kind: 'upload', patientId: MARA_ID, date: '2026-06-12', title: 'Vitamin D prescription', file: { type: 'image', name: 'vitamin-d-rx.jpg', dataUrl: vitImg, size: vitImg ? Math.round(vitImg.length * .75) : 0 },
      prescriber: { name: 'Dr. Léa Moreau', org: 'Eastside Family Clinic', regNo: 'SYN-MC-55821' }, problem: 'Low vitamin D on routine bloods.',
      meds: [{ name: 'Cholecalciferol (Vitamin D3)', strength: '1000 units', reg: { dose: '1000', unit: 'units', route: 'PO', freq: 'QD' }, instructions: '1000 units by mouth once daily', purpose: 'Vitamin D supplement for bone health.', source: 'patient-transcribed' }],
      status: 'verified', uploadedBy: MARA_ID, uploadedAt: iso(now - 140 * DAY),
      verification: { by: 'MT-D-001044', byName: 'R. Osei, PharmD', byReg: 'SYN-PH-20417', byDesignation: 'Clinical Pharmacist', byOrg: 'Harbor General Hospital', at: iso(now - 138 * DAY) },
      reviews: [{ at: iso(now - 138 * DAY), by: 'MT-D-001044', byName: 'R. Osei, PharmD', action: 'VERIFIED', comment: 'Matches document. Prescriber details recorded as on the prescription.' }] },
    { id: 'RX-DERM', kind: 'upload', patientId: MARA_ID, date: day(-4), title: 'Skin rash prescription', file: { type: 'image', name: 'skin-clinic-rx.jpg', dataUrl: rxImg, size: rxImg ? Math.round(rxImg.length * .75) : 0 },
      prescriber: { name: 'Dr. P. Anand', org: 'Lakeside Skin Clinic', regNo: 'SYN-MC-71230' }, problem: 'Itchy red rash on both forearms for about a week.',
      meds: [{ name: 'Hydrocortisone 1% cream', strength: '1 %', reg: { dose: '1', unit: '%', route: 'TOP', freq: 'BID' }, instructions: 'Apply a thin layer to the rash twice daily for 7 days', purpose: 'Mild steroid cream for skin inflammation and itching.', source: 'patient-transcribed' }],
      status: 'pending', uploadedBy: MARA_ID, uploadedAt: iso(now - 1 * DAY), reviews: [] },
  ];
  const tDate = day(-1);
  prescriptions.push({ id: 'RX-TRANSFER', kind: 'transfer', patientId: MARA_ID, date: tDate, title: 'Rehabilitation unit transfer of care', source: 'External transfer · faxed summary, re-keyed',
    prescriber: { name: 'Dr. R. Calloway', org: 'Northgate Rehabilitation Unit', regNo: 'SYN-MC-30984' }, problem: 'Transferred home after a 6-day inpatient rehabilitation stay following the heart-failure admission.',
    lines: ['NORTHGATE REHABILITATION UNIT — TRANSFER OF CARE      [SYNTHETIC DEMO RECORD]', 'Patient: LINDQVIST, Mara    ID: MT-P-004812    DOB: 1955-03-14', `Transfer date: ${tDate}    Destination: home, community nursing follow-up`, 'Responsible clinician: Dr. R. Calloway', '', 'MEDICINES STARTED DURING STAY:', '1. Paracetamol 1 g PO four times daily (max 4 g in 24 h)', '2. Senna 15 mg PO at night', '3. Morphine 10 mg every 4 hours as needed for pain', '', 'Renal function: see attached labs (attachment not received)', 'Continue all other medicines as per discharge summary 28/10.'],
    meds: [
      { name: 'Paracetamol', strength: '1 g', line: 6, reg: { dose: '1', unit: 'g', route: 'PO', freq: 'QID' }, instructions: 'four times daily, max 4 g in 24 h', purpose: 'Pain reliever.', source: 'transfer' },
      { name: 'Senna', strength: '15 mg', line: 7, reg: { dose: '15', unit: 'mg', route: 'PO', freq: 'QHS' }, instructions: 'at night', purpose: 'Laxative. Helps prevent constipation.', source: 'transfer' },
      { name: 'Morphine', strength: '10 mg', line: 8, reg: { dose: '10', unit: 'mg', route: null, freq: 'PRN' }, instructions: 'every 4 hours as needed for pain', purpose: 'Strong pain reliever.', source: 'transfer' },
    ],
    status: 'blocked', uploadedBy: 'system', uploadedAt: iso(now - 20 * HOUR), reviews: [], clarifications: {} });
  const records = {
    [MARA_ID]: {
      labs: [{ id: 'LAB-1', test: 'eGFR', value: 34, unit: 'mL/min/1.73m²', date: '2026-10-28', source: 'Harbor General discharge summary' }],
      allergies: [{ id: 'AL-1', substance: 'Penicillin', reaction: 'Rash', source: 'professional', sourceLabel: 'Harbor General discharge summary', recordedAt: '2026-10-28', by: 'A. Reyes, MD' }],
      conditions: [
        { id: 'C-1', name: 'Type 2 diabetes', diagnosed: '2014-05-02', status: 'current', doctor: 'Dr. H. Lin', facility: 'Eastside Family Clinic', notes: 'On basal insulin since 2021.', source: 'patient', by: MARA_ID },
        { id: 'C-2', name: 'Atrial fibrillation', diagnosed: '2019-09-17', status: 'current', doctor: 'Dr. K. Mbeki', facility: 'Harbor General Hospital', notes: 'Rate controlled. Anticoagulated.', source: 'professional', by: 'MT-D-001021' },
        { id: 'C-3', name: 'Heart failure with reduced ejection fraction (HFrEF)', diagnosed: '2023-04-12', status: 'current', doctor: 'Dr. K. Mbeki', facility: 'Harbor General Hospital', notes: 'EF 35% at diagnosis.', source: 'professional', by: 'MT-D-001021' },
        { id: 'C-4', name: 'Chronic kidney disease, stage 3b', diagnosed: '2025-02-20', status: 'current', doctor: 'Dr. Léa Moreau', facility: 'Eastside Family Clinic', notes: 'eGFR 34 in Oct 2026.', source: 'professional', by: 'MT-D-001021' },
        { id: 'C-5', name: 'Contact dermatitis (forearms)', diagnosed: day(-4), status: 'current', doctor: 'Dr. P. Anand', facility: 'Lakeside Skin Clinic', notes: '', source: 'patient', by: MARA_ID },
      ],
      treatments: [
        { id: 'T-1', name: 'Inpatient IV diuresis', conditionId: 'C-3', facility: 'Harbor General Hospital', doctor: 'A. Reyes, MD', start: '2026-10-22', end: '2026-10-28', outcome: 'Improved, discharged home', source: 'professional', by: 'MT-D-001021', visitId: 'V-2' },
        { id: 'T-2', name: 'Cardiac rehabilitation programme', conditionId: 'C-3', facility: 'Harbor General Hospital', doctor: 'Dr. K. Mbeki', start: '2023-06-01', end: '2023-08-24', outcome: 'Completed 12 sessions', source: 'patient', by: MARA_ID, visitId: '' },
      ],
      visits: [
        { id: 'V-1', hospital: 'Harbor General Hospital', visitDate: '2023-04-11', admission: '2023-04-11', discharge: '2023-04-16', reason: 'Breathlessness; new diagnosis of HFrEF', doctor: 'Dr. K. Mbeki (Cardiology)', summary: 'Admitted with fluid overload. Echo EF 35%. Started on beta-blocker and diuretic.', rxIds: [], treatmentIds: [], source: 'patient', by: MARA_ID },
        { id: 'V-2', hospital: 'Harbor General Hospital', visitDate: '2026-10-22', admission: '2026-10-22', discharge: '2026-10-28', reason: 'Acute on chronic HFrEF exacerbation', doctor: 'A. Reyes, MD (Hospitalist)', summary: 'Diuresed IV, transitioned to oral. ACE inhibitor held for acute kidney injury. Discharge list issued.', rxIds: ['RX-A'], treatmentIds: ['T-1'], source: 'professional', by: 'MT-D-001021' },
        { id: 'V-3', hospital: 'Eastside Family Clinic', visitDate: '2026-11-03', admission: '', discharge: '', reason: 'Post-discharge follow-up (outpatient)', doctor: 'J. Tanaka, NP', summary: 'Heart failure stable. BMP drawn. Medication list recorded from patient report.', rxIds: ['RX-B'], treatmentIds: [], source: 'professional', by: 'MT-D-001021' },
      ],
    },
    'MT-P-007730': { labs: [], allergies: [], conditions: [{ id: 'C-D1', name: 'Asthma', diagnosed: '2001-03-10', status: 'current', doctor: '', facility: '', notes: 'Uses reliever inhaler occasionally.', source: 'patient', by: 'MT-P-007730' }], treatments: [], visits: [] },
  };
  const items = {};
  MEDS.forEach(m => { items[m.id] = m.severity === 'none' ? { status: 'auto', decision: { optionId: 'A', reg: m.A.reg }, decidedBy: 'system' } : { status: 'open' }; });
  items.metoprolol = { status: 'decided', decision: { optionId: 'A', reg: MEDS.find(m => m.id === 'metoprolol').A.reg, rationale: 'HFrEF regimen at discharge was succinate ER; tartrate likely from older home supply. Confirmed bottle label by phone.' }, decidedBy: 'MT-D-001044', decidedAt: iso(now - 20 * HOUR) };

  // Synthetic past adherence for medicines that were already verified (separate from prescription data).
  const adherence = { [MARA_ID]: [] };
  const pastDoses = [{ key: 'atorvastatin#0', slot: 'bedtime' }, { key: 'pantoprazole#0', slot: 'morning' }, { key: 'RX-VITD:0#0', slot: 'any' }];
  for (let o = 13; o >= 1; o--) pastDoses.forEach((d, j) => {
    const date = day(-o), skip = (o * 7 + j * 3) % 11 === 0, miss = (o * 5 + j) % 13 === 0;
    if (miss) return;
    const t = parseDay(date); t.setHours(d.slot === 'morning' ? 8 : d.slot === 'bedtime' ? 21 : 12, 10 + j * 7);
    adherence[MARA_ID].push({ id: uid('AD'), date, doseKey: d.key, status: skip ? 'skipped' : 'taken', at: t.toISOString(), reason: skip ? 'Away from home' : '', synthetic: true });
  });

  const db = { version: 3, createdAt: iso(now), escalations: [], surge: { demand: 3, capacity: 50, actions: {}, published: null }, users, grants, prescriptions, records, recon: { items, flagged: [] }, adherence, reminders: { [MARA_ID]: { ...DEFAULT_REMINDERS, doseTimes: { 'RX-VITD:0#0': '12:00' } } }, notifications: [], log: [], resets: [] };
  const at = (ms) => iso(now - ms);
  const L_ = (e) => pushAudit(db, { ...e, ...(String(e.actorId).startsWith('MT-D') ? { auth: 'VERIFIED CLINICIAN - ACTIVE · Authenticator app (TOTP)' } : String(e.actorId).startsWith('MT-P') ? { auth: 'Patient · Password only' } : {}) });
  L_({ ...SYS, ts: at(200 * DAY), action: 'REGISTER', patientId: MARA_ID, item: MARA_ID, detail: 'Patient account created (synthetic demo account).' });
  L_({ ...SYS, ts: at(140 * DAY), action: 'UPLOAD', patientId: MARA_ID, item: 'RX-VITD', detail: 'Patient uploaded prescription: Vitamin D prescription (image).' });
  L_({ actorId: 'MT-D-001044', actor: 'R. Osei, PharmD', role: 'Clinical Pharmacist', ts: at(138 * DAY), action: 'RX_VERIFIED', patientId: MARA_ID, item: 'RX-VITD', detail: 'Verified uploaded prescription against document. Original prescriber: Dr. Léa Moreau. Reviewing professional: R. Osei, PharmD.' });
  L_({ actorId: 'MT-D-001021', actor: 'Dr. Léa Moreau', role: 'Attending Physician', ts: at(3 * DAY), action: 'ACCESS_REQUEST', patientId: MARA_ID, item: 'G-1', detail: 'Requested: Complete patient record · 30 days. Reason: Follow-up care after discharge.' });
  L_({ actorId: MARA_ID, actor: 'Mara Lindqvist', role: 'Patient', ts: at(3 * DAY - HOUR), action: 'ACCESS_APPROVED', patientId: MARA_ID, item: 'G-1', detail: 'Granted Dr. Léa Moreau: Complete patient record until ' + fmtDate(grants[0].expiresAt) + '.' });
  L_({ actorId: 'MT-D-001044', actor: 'R. Osei, PharmD', role: 'Clinical Pharmacist', ts: at(3 * DAY), action: 'ACCESS_REQUEST', patientId: MARA_ID, item: 'G-2', detail: 'Requested: Prescription records, Medication history, Verified medication instructions · 30 days.' });
  L_({ actorId: MARA_ID, actor: 'Mara Lindqvist', role: 'Patient', ts: at(3 * DAY - 2 * HOUR), action: 'ACCESS_APPROVED', patientId: MARA_ID, item: 'G-2', detail: 'Granted R. Osei, PharmD: Prescription records, Medication history, Verified medication instructions.' });
  L_({ ...SYS, ts: at(2 * DAY), action: 'INGEST', patientId: MARA_ID, item: 'doc:A', detail: 'Discharge summary received (EHR export, 19 lines).' });
  L_({ ...SYS, ts: at(2 * DAY - 3000), action: 'INGEST', patientId: MARA_ID, item: 'doc:B', detail: 'Clinic note received (fax, OCR applied).' });
  L_({ ...SYS, ts: at(2 * DAY - 9000), action: 'EXTRACT', patientId: MARA_ID, item: 'doc:A+B', detail: '15 medication entities extracted, 1 below confidence threshold.' });
  L_({ ...SYS, ts: at(2 * DAY - 10000), action: 'RECONCILE', patientId: MARA_ID, item: 'patient', detail: '8 medicines matched across visits: 6 discrepancies, 2 exact matches.' });
  L_({ ...SYS, ts: at(2 * DAY - 10000), action: 'ENQUEUE', patientId: MARA_ID, item: 'queue', detail: '6 items routed to review (1 critical, 3 high, 2 moderate).' });
  L_({ actorId: 'MT-D-001044', actor: 'R. Osei, PharmD', role: 'Clinical Pharmacist', ts: at(20 * HOUR), action: 'DECIDE', patientId: MARA_ID, item: 'metoprolol', detail: 'Selected Visit A: succinate ER · 50 mg · PO · QD. Rationale: HFrEF regimen at discharge was succinate ER; tartrate likely from older home supply. Confirmed bottle label by phone.' });
  L_({ actorId: MARA_ID, actor: 'Mara Lindqvist', role: 'Patient', ts: at(1 * DAY), action: 'UPLOAD', patientId: MARA_ID, item: 'RX-DERM', detail: 'Patient uploaded prescription: Skin rash prescription (image). Status: Pending doctor verification.' });
  L_({ actorId: 'MT-D-001044', actor: 'R. Osei, PharmD', role: 'Clinical Pharmacist', ts: at(5 * HOUR), action: 'ACCESS_REQUEST', patientId: MARA_ID, item: 'G-3', detail: 'Requested: Medical history, Previous hospital visits · 7 days. Reason: Specialist consultation.' });

  L_({ actorId: 'MT-D-001090', actor: 'Dr. Sam Reyes', role: 'Emergency Physician', ts: at(6 * DAY), action: 'ACCESS_REQUEST', patientId: MARA_ID, item: 'G-4', detail: 'Requested: Prescription records, Medication history · 30 days. Reason: Medication reconciliation.' });
  L_({ actorId: MARA_ID, actor: 'Mara Lindqvist', role: 'Patient', ts: at(6 * DAY - HOUR), action: 'ACCESS_APPROVED', patientId: MARA_ID, item: 'G-4', detail: 'Granted Dr. Sam Reyes: Prescription records, Medication history.' });
  L_({ ...SYS, actor: 'Registry check (simulated)', ts: at(2 * DAY), action: 'CREDENTIAL_FLAGGED', item: 'MT-D-001090', detail: 'Scheduled re-check: Dr. Sam Reyes FLAGGED / UNVERIFIED. Failed: Licence active and in date (SUSPENDED). Patient consent stays on record, but critical actions and full identifiers are blocked.' });
  const N = (userId, n, ago, read = false) => db.notifications.push({ id: uid('N'), userId, at: at(ago), read, priority: 'normal', ...n });
  L_({ ...SYS, ts: at(20 * HOUR), action: 'INGEST', patientId: MARA_ID, item: 'RX-TRANSFER', detail: 'External transfer of care received from Northgate Rehabilitation Unit (3 medicines).' });
  L_({ ...SYS, ts: at(20 * HOUR - 4000), action: 'UNCERTAINTY_BLOCK', patientId: MARA_ID, item: 'RX-TRANSFER', detail: 'Blocked: Morphine route not stated (route-critical); no renal function result within 72 h of transfer (morphine is renally sensitive). Approval deferred until a clinician confirms.' });
  N('MT-D-001044', { type: 'escalation', title: 'Transfer on hold: missing critical information', body: 'Mara Lindqvist · Morphine route and current renal function not stated.', priority: 'high', link: 'verify', ref: 'RX-TRANSFER' }, 20 * HOUR);
  N('MT-D-001021', { type: 'escalation', title: 'Transfer on hold: missing critical information', body: 'Mara Lindqvist · Morphine route and current renal function not stated.', priority: 'high', link: 'verify', ref: 'RX-TRANSFER' }, 20 * HOUR);
  N(MARA_ID, { type: 'history', title: 'A medicine from your transfer is on hold', body: 'Your care team is confirming how morphine should be given. Nothing has changed in your current instructions.', link: 'prescriptions', ref: 'RX-TRANSFER' }, 20 * HOUR);
  N(MARA_ID, { type: 'access-request', title: 'New access request from R. Osei, PharmD', body: 'Asks for Medical history and Previous hospital visits for 7 days.', priority: 'high', link: 'access' }, 5 * HOUR);
  N(MARA_ID, { type: 'rx-uploaded', title: 'Prescription uploaded', body: 'Skin rash prescription is waiting for doctor verification.', link: 'prescriptions', ref: 'RX-DERM' }, DAY, true);
  N(MARA_ID, { type: 'rx-verified', title: 'Prescription verified', body: 'Vitamin D prescription was verified by R. Osei, PharmD.', link: 'prescriptions', ref: 'RX-VITD' }, 138 * DAY, true);
  N('MT-D-001021', { type: 'rx-awaiting', title: 'Prescription awaiting verification', body: 'Mara Lindqvist uploaded “Skin rash prescription”.', priority: 'high', link: 'verify', ref: 'RX-DERM' }, DAY);
  N('MT-D-001021', { type: 'discrepancy', title: '6 medication discrepancies to review', body: 'Mara Lindqvist · 1 critical (apixaban dose conflict).', priority: 'high', link: 'review' }, 2 * DAY);
  N('MT-D-001044', { type: 'access-approved', title: 'Mara Lindqvist approved your access', body: 'Prescription records, Medication history, Verified medication instructions · 30 days.', link: 'patients', ref: MARA_ID }, 3 * DAY - 2 * HOUR, true);
  N('MT-D-001044', { type: 'rx-awaiting', title: 'Prescription awaiting verification', body: 'Mara Lindqvist uploaded “Skin rash prescription”.', priority: 'high', link: 'verify', ref: 'RX-DERM' }, DAY);
  N('MT-D-001090', { type: 'credentials', title: 'Licence check flagged your account', body: 'Registry shows your licence as SUSPENDED. Clinical actions are blocked until verification passes.', priority: 'high', link: 'credentials' }, 2 * DAY);
  db.notifications.sort((a, b) => b.at.localeCompare(a.at));
  return db;
}
