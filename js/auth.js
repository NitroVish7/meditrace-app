/* Welcome, registration, sign-in and password reset. DEMO authentication: accounts and salted SHA-256 password hashes
   are kept in this browser's localStorage. This is not production-grade security. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const digits = (s) => (s || '').replace(/\D/g, '');
const pwProblem = (pw) => pw.length < 8 ? 'Use at least 8 characters.' : !/[A-Za-z]/.test(pw) || !/\d/.test(pw) ? 'Include at least one letter and one number.' : null;
const findByLogin = (db, ident) => { const s = ident.trim().toLowerCase(); const d = digits(s); return db.users.find(u => u.email.toLowerCase() === s || (d.length >= 7 && u.phone === d)); };
const DEMO_ACCOUNTS = [
  { email: 'mara.demo@meditrace.test', label: 'Mara Lindqvist', sub: 'Patient · full demo record', role: 'patient' },
  { email: 'daniel.demo@meditrace.test', label: 'Daniel Okafor', sub: 'Patient · no doctors yet', role: 'patient' },
  { email: 'lea.moreau.demo@meditrace.test', label: 'Dr. Léa Moreau', sub: 'Attending Physician', role: 'doctor' },
  { email: 'r.osei.demo@meditrace.test', label: 'R. Osei, PharmD', sub: 'Clinical Pharmacist', role: 'doctor' },
  { email: 'sam.reyes.demo@meditrace.test', label: 'Dr. Sam Reyes', sub: 'Licence flagged · blocked actions', role: 'doctor' },
];

function AuthShell({ children }) {
  return (
    <div className="min-h-screen grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[rgb(17_56_104)] text-white gutter py-10">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[rgb(13_128_140)] opacity-40 blur-3xl"></div>
        <div className="absolute -left-10 bottom-0 h-64 w-64 rounded-full bg-[rgb(62_196_204)] opacity-20 blur-3xl"></div>
        <div className="relative"><Logo imgClass="w-[300px]" className="shadow-lg" /></div>
        <div className="relative max-w-md">
          <h2 className="font-display text-[30px] font-extrabold leading-tight">Medication continuity across every handover.</h2>
          <ul className="mt-5 grid gap-3 text-[14.5px] text-white/85">
            {[[Link2, 'Every medicine traced to the document it came from'], [GitCompareArrows, 'Conflicts between visits flagged for professional review'], [KeyRound, 'Patients decide which professionals see which records'], [ListChecks, 'Daily checklist built only from verified instructions']].map(([I, t]) => <li key={t} className="flex items-start gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/10"><I size={15} /></span>{t}</li>)}
          </ul>
        </div>
        <p className="relative text-[12px] text-white/60">Hackathon prototype · synthetic data only · decision support, not a prescribing tool.</p>
      </aside>
      <main className="gutter py-8 sm:py-12 flex items-start lg:items-center justify-center">
        <div className="w-full max-w-[560px]">
          <div className="lg:hidden mb-6 flex justify-center"><Logo imgClass="w-[260px]" /></div>
          {children}
        </div>
      </main>
    </div>
  );
}

function AuthScreen({ onAuthed, notice }) {
  const { mutate } = useApp();
  const [mode, setMode] = useState('welcome');
  const [role, setRole] = useState('patient');
  const [created, setCreated] = useState(null);
  const [pending, setPending] = useState(null);
  // Password accepted. Clinical users (and patients who turned MFA on) must pass a second factor before any record opens.
  const afterPassword = (u) => { if (mfaRequired(u) || u.mfa?.enrolled) { setPending(u.id); setMode('mfa'); } else onAuthed(u.id, completeSignIn(mutate, u.id, 'password')); };
  return (
    <AuthShell>
      {notice && mode !== 'mfa' && <div role="status" className="mb-4 flex items-start gap-2 rounded-xl border border-info/40 bg-info/5 px-3 py-2.5 text-[13px]" id="auth-notice"><Timer size={15} className="mt-0.5 shrink-0 text-info" /><span>{notice}</span></div>}
      {mode === 'welcome' && <Welcome onPick={(r, m) => { setRole(r); setMode(m); }} />}
      {mode === 'login' && <Login role={role} onPassword={afterPassword} onRegister={() => setMode('register')} onForgot={() => setMode('forgot')} onBack={() => setMode('welcome')} />}
      {mode === 'mfa' && pending && <MfaFlow userId={pending} onDone={onAuthed} onCancel={() => { setPending(null); setMode('login'); }} />}
      {mode === 'register' && <Register role={role} setRole={setRole} onDone={(u) => { setCreated(u); setMode('done'); }} onLogin={() => setMode('login')} onBack={() => setMode('welcome')} />}
      {mode === 'forgot' && <Forgot onBack={() => setMode('login')} />}
      {mode === 'done' && created && <Registered user={created} onContinue={() => afterPassword(created)} />}
    </AuthShell>
  );
}

function Welcome({ onPick }) {
  const [role, setRole] = useState(null);
  const R = [
    { id: 'patient', icon: UserRound, t: 'Patient', d: 'Keep your prescriptions, medical history and daily checklist in one place, and decide who can see them.' },
    { id: 'doctor', icon: Stethoscope, t: 'Doctor / Healthcare professional', d: 'Request patient access, verify prescriptions and reconcile medicines across care transitions.' },
  ];
  return (
    <div className="pop grid gap-5">
      <div><div className="eyebrow">Welcome to MediTrace</div><h1 className="font-display text-[28px] font-extrabold leading-tight">How will you use MediTrace?</h1><p className="text-muted mt-1">Connected Medications. Continuity of Care.</p></div>
      <div className="grid gap-3" role="radiogroup" aria-label="Account type">
        {R.map(({ id, icon: I, t, d }) => (
          <button key={id} role="radio" aria-checked={role === id} onClick={() => setRole(id)} className={`flex items-start gap-4 rounded-2xl border-2 p-4 text-left transition ${role === id ? 'border-accent bg-accent/5' : 'border-line bg-surface hover:border-accent/40'} card-shadow`}>
            <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${role === id ? 'bg-accent text-white dark:text-bg' : 'bg-raised text-navy'}`}><I size={20} /></span>
            <span className="min-w-0"><span className="block font-display text-[16px] font-bold">{t}</span><span className="block text-[13px] text-muted">{d}</span></span>
            <span className={`ml-auto mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 ${role === id ? 'border-accent bg-accent text-white' : 'border-line'}`}>{role === id && <Check size={12} />}</span>
          </button>))}
      </div>
      <div className="grid sm:grid-cols-2 gap-2">
        <Btn kind="primary" size="lg" disabled={!role} onClick={() => onPick(role, 'register')}><UserPlus size={16} />Create {role === 'doctor' ? 'professional' : role === 'patient' ? 'patient' : 'an'} account</Btn>
        <Btn size="lg" disabled={!role} onClick={() => onPick(role, 'login')}><LogIn size={16} />Sign in</Btn>
      </div>
      <DemoNote>Demo authentication: accounts are stored only in this browser. Don’t enter real personal or medical information.</DemoNote>
    </div>
  );
}

function Login({ role, onPassword, onRegister, onForgot, onBack }) {
  const { db, mutate } = useApp();
  const [ident, setIdent] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setErr('');
    if (!ident.trim() || !pw) return setErr('Enter your email or phone number and your password.');
    setBusy(true);
    const u = findByLogin(db, ident);
    const ok = u && (await hashPw(pw, u.salt)) === u.pwHash;
    setBusy(false);
    if (!ok) { mutate(n => pushAudit(n, { ...SYS, action: 'LOGIN_FAILED', item: ident.trim().slice(0, 3) + '…', detail: 'Sign-in attempt with an unknown login or wrong password.' })); return setErr('That email/phone and password don’t match an account. Check them and try again.'); }
    mutate(n => pushAudit(n, { ...actorOf(u), action: 'PASSWORD_OK', patientId: u.role === 'patient' ? u.id : null, item: u.id, detail: mfaRequired(u) || u.mfa?.enrolled ? 'Password accepted; second factor required before access.' : 'Password accepted.' }), { silent: true });
    onPassword(u);
  };
  return (
    <form onSubmit={submit} className="pop grid gap-4" noValidate>
      <button type="button" onClick={onBack} className="justify-self-start text-[13px] text-muted hover:text-fg inline-flex items-center gap-1"><ChevronLeft size={14} />Back</button>
      <div><div className="eyebrow">{role === 'doctor' ? 'Professional sign-in' : 'Patient sign-in'}</div><h1 className="font-display text-[26px] font-extrabold">Sign in to MediTrace</h1></div>
      <div className="rounded-2xl border border-line bg-surface card-shadow p-5 grid gap-3">
        <Field label="Email or phone number" id="login-ident" required><input id="login-ident" autoComplete="username" className={inputCls} value={ident} onChange={e => setIdent(e.target.value)} placeholder="you@example.com or 555 010 0100" /></Field>
        <Field label="Password" id="login-pw" required><input id="login-pw" type="password" autoComplete="current-password" className={inputCls} value={pw} onChange={e => setPw(e.target.value)} /></Field>
        {err && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Btn kind="link" onClick={onForgot}>Forgot password?</Btn>
          <Btn kind="primary" size="lg" disabled={busy} onClick={submit}><LogIn size={16} />{busy ? 'Checking…' : 'Sign in'}</Btn>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><div className="font-semibold text-[13.5px]">Synthetic demo accounts</div><div className="text-[12px] text-muted">Password for all: <span className="font-mono text-fg">{DEMO_PASSWORD}</span></div></div>
        <div className="mt-2 grid sm:grid-cols-2 gap-2">{DEMO_ACCOUNTS.map(a => (
          <button type="button" key={a.email} onClick={() => { setIdent(a.email); setPw(DEMO_PASSWORD); setErr(''); }} className="flex items-center gap-2.5 rounded-xl border border-line p-2.5 text-left hover:border-accent/50 hover:bg-raised/50">
            <Avatar name={a.label} tone={a.role === 'doctor' ? 'navy' : 'accent'} size={32} /><span className="min-w-0"><span className="block text-[13px] font-semibold truncate">{a.label}</span><span className="block text-[11.5px] text-muted truncate">{a.sub}</span></span></button>))}</div>
        <p className="mt-2 text-[11.5px] text-muted">Selecting one fills the form; then choose Sign in. Professional accounts then ask for a 6-digit authenticator code (a demo authenticator is shown on that step).</p>
      </div>
      <p className="text-center text-[13.5px] text-muted">New to MediTrace? <Btn kind="link" onClick={onRegister}>Create an account</Btn></p>
    </form>
  );
}

const PRACTICE = [['independent', 'Independent / Private Practitioner'], ['hospital', 'Working in a Hospital'], ['clinic', 'Working in a Clinic'], ['other', 'Other Healthcare Organisation']];

function Register({ role, setRole, onDone, onLogin, onBack }) {
  const { db, mutate } = useApp();
  const [f, setF] = useState({ fullName: '', phone: '', email: '', password: '', confirm: '', dob: '', gender: '', blood: '', address: '', emergency: '', regNo: '', specialisation: '', designation: '', practice: '', orgName: '', department: '', orgAddress: '', practiceName: '', practiceAddress: '', hours: '', agree: false });
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e && e.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const doc = role === 'doctor';
  const validate = () => {
    const e = {};
    if (f.fullName.trim().length < 3) e.fullName = 'Enter your full name.';
    const ph = digits(f.phone); if (ph.length < 7 || ph.length > 15) e.phone = 'Enter a phone number with 7–15 digits.'; else if (db.users.some(u => u.phone === ph)) e.phone = 'An account already uses this phone number.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email address.'; else if (db.users.some(u => u.email.toLowerCase() === f.email.trim().toLowerCase())) e.email = 'An account already uses this email. Sign in instead.';
    const pp = pwProblem(f.password); if (pp) e.password = pp; if (f.confirm !== f.password) e.confirm = 'Passwords don’t match.';
    if (!doc) { if (!f.dob) e.dob = 'Enter your date of birth.'; else { const a = ageFrom(f.dob); if (parseDay(f.dob) > new Date()) e.dob = 'Date of birth can’t be in the future.'; else if (a > 125) e.dob = 'Check the year.'; } }
    if (doc) {
      if (!f.regNo.trim()) e.regNo = 'Enter your medical registration number.';
      if (!f.specialisation.trim()) e.specialisation = 'Enter your specialisation.';
      if (!f.designation.trim()) e.designation = 'Enter your professional designation.';
      if (!f.practice) e.practice = 'Choose how you practise.';
      if (f.practice === 'independent') { if (!f.practiceName.trim()) e.practiceName = 'Enter your practice or clinic name.'; if (!f.practiceAddress.trim()) e.practiceAddress = 'Enter the practice address.'; }
      if (f.practice && f.practice !== 'independent') { if (!f.orgName.trim()) e.orgName = 'Enter the organisation name.'; if (!f.department.trim()) e.department = 'Enter your department.'; if (!f.orgAddress.trim()) e.orgAddress = 'Enter the organisation address.'; }
    }
    if (!f.agree) e.agree = 'Confirm you understand this is a demo.';
    return e;
  };
  const submit = async (ev) => {
    ev.preventDefault(); const e = validate(); setErrs(e);
    if (Object.keys(e).length) { setTimeout(() => document.querySelector('[data-err="1"]')?.focus(), 0); return; }
    setBusy(true);
    const salt = randSalt(); const pwHash = await hashPw(f.password, salt);
    let id; do { id = (doc ? 'MT-D-' : 'MT-P-') + String(Math.floor(100000 + Math.random() * 899999)); } while (db.users.some(u => u.id === id));
    const profile = doc
      ? { fullName: f.fullName.trim(), regNo: f.regNo.trim(), specialisation: f.specialisation.trim(), designation: f.designation.trim(), practice: f.practice, credential: 'pending',
          ...(f.practice === 'independent' ? { practiceName: f.practiceName.trim(), practiceAddress: f.practiceAddress.trim(), hours: f.hours.trim() } : { orgName: f.orgName.trim(), department: f.department.trim(), orgAddress: f.orgAddress.trim() }) }
      : { fullName: f.fullName.trim(), dob: f.dob, gender: f.gender, blood: f.blood, address: f.address.trim(), emergency: f.emergency.trim() };
    const user = { id, role: doc ? 'doctor' : 'patient', email: f.email.trim().toLowerCase(), phone: digits(f.phone), salt, pwHash, createdAt: nowISO(), profile };
    mutate(n => {
      n.users.push(user);
      if (!doc) { n.records[id] = { allergies: [], conditions: [], treatments: [], visits: [] }; n.adherence[id] = []; n.reminders[id] = JSON.parse(JSON.stringify(DEFAULT_REMINDERS)); }
      pushAudit(n, { ...actorOf(user), action: 'REGISTER', patientId: doc ? null : id, item: id, detail: doc ? `Professional account created. Registration number (${profile.regNo}) self-reported; licence status: PENDING VERIFICATION.` : 'Patient account created.' });
      notify(n, id, { type: 'welcome', title: 'Welcome to MediTrace', body: doc ? 'Your licence is PENDING VERIFICATION. Open Credential verification to check it against the registry; critical actions unlock once verified.' : `Your MediTrace ID is ${id}. Share it with a doctor so they can request access.`, link: doc ? 'credentials' : 'profile' });
    });
    setBusy(false); onDone(user);
  };
  const E = (k) => errs[k];
  const inp = (k, props = {}) => <input id={`reg-${k}`} data-err={E(k) ? '1' : undefined} aria-invalid={!!E(k)} className={inputCls + (E(k) ? ' border-crit' : '')} value={f[k]} onChange={set(k)} {...props} />;
  return (
    <form onSubmit={submit} className="pop grid gap-4" noValidate>
      <button type="button" onClick={onBack} className="justify-self-start text-[13px] text-muted hover:text-fg inline-flex items-center gap-1"><ChevronLeft size={14} />Back</button>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><div className="eyebrow">Create account</div><h1 className="font-display text-[26px] font-extrabold">{doc ? 'Healthcare professional registration' : 'Patient registration'}</h1></div>
        <Segmented label="Account type" value={role} onChange={(r) => { setRole(r); setErrs({}); }} options={[['patient', 'Patient'], ['doctor', 'Professional']]} />
      </div>
      <div className="rounded-2xl border border-line bg-surface card-shadow p-5 grid gap-4">
        <div className="eyebrow">Account</div>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Full name" id="reg-fullName" required error={E('fullName')} className="sm:col-span-2">{inp('fullName', { autoComplete: 'name', placeholder: doc ? 'Dr. Jane Doe' : 'Jane Doe' })}</Field>
          <Field label="Phone number" id="reg-phone" required error={E('phone')}>{inp('phone', { type: 'tel', autoComplete: 'tel', placeholder: '555 010 0199' })}</Field>
          <Field label="Email address" id="reg-email" required error={E('email')}>{inp('email', { type: 'email', autoComplete: 'email', placeholder: 'you@example.com' })}</Field>
          <Field label="Password" id="reg-password" required error={E('password')} hint="8+ characters with a letter and a number.">{inp('password', { type: 'password', autoComplete: 'new-password' })}</Field>
          <Field label="Confirm password" id="reg-confirm" required error={E('confirm')}>{inp('confirm', { type: 'password', autoComplete: 'new-password' })}</Field>
        </div>
        {!doc && <>
          <div className="eyebrow mt-1">About you</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Date of birth" id="reg-dob" required error={E('dob')}>{inp('dob', { type: 'date', max: ymd() })}</Field>
            <Field label="Gender" id="reg-gender" optional><select id="reg-gender" className={inputCls} value={f.gender} onChange={set('gender')}><option value="">Prefer not to say</option>{['Female', 'Male', 'Non-binary', 'Other'].map(g => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Blood group" id="reg-blood" optional><select id="reg-blood" className={inputCls} value={f.blood} onChange={set('blood')}><option value="">Unknown</option>{['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(g => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Emergency contact" id="reg-emergency" optional>{inp('emergency', { placeholder: 'Name, relationship, phone' })}</Field>
            <Field label="Address" id="reg-address" optional className="sm:col-span-2">{inp('address', { autoComplete: 'street-address' })}</Field>
          </div>
        </>}
        {doc && <>
          <div className="eyebrow mt-1">Professional details</div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Medical registration number" id="reg-regNo" required error={E('regNo')}>{inp('regNo', { placeholder: 'e.g. MC-123456' })}</Field>
            <Field label="Specialisation" id="reg-specialisation" required error={E('specialisation')}>{inp('specialisation', { placeholder: 'e.g. Internal Medicine' })}</Field>
            <Field label="Professional designation" id="reg-designation" required error={E('designation')} className="sm:col-span-2">{inp('designation', { placeholder: 'e.g. Consultant Physician, Clinical Pharmacist' })}</Field>
          </div>
          <Field label="How do you practise?" id="reg-practice" required error={E('practice')}>
            <div className="grid sm:grid-cols-2 gap-2" role="radiogroup" id="reg-practice">
              {PRACTICE.map(([k, l]) => <label key={k} className={`flex items-center gap-2 rounded-xl border p-2.5 cursor-pointer text-[13.5px] ${f.practice === k ? 'border-accent bg-accent/5 font-semibold' : 'border-line hover:bg-raised/50'}`}><input type="radio" name="practice" className="accent-[rgb(var(--c-accent))]" checked={f.practice === k} onChange={() => setF(s => ({ ...s, practice: k }))} />{l}</label>)}
            </div>
          </Field>
          {f.practice === 'independent' && <div className="pop grid sm:grid-cols-2 gap-3 rounded-xl bg-raised/50 p-3">
            <Field label="Practice or clinic name" id="reg-practiceName" required error={E('practiceName')}>{inp('practiceName')}</Field>
            <Field label="Consultation hours" id="reg-hours" optional>{inp('hours', { placeholder: 'Mon–Fri 9:00–17:00' })}</Field>
            <Field label="Practice address" id="reg-practiceAddress" required error={E('practiceAddress')} className="sm:col-span-2">{inp('practiceAddress')}</Field>
          </div>}
          {f.practice && f.practice !== 'independent' && <div className="pop grid sm:grid-cols-2 gap-3 rounded-xl bg-raised/50 p-3">
            <Field label={f.practice === 'hospital' ? 'Hospital name' : f.practice === 'clinic' ? 'Clinic name' : 'Organisation name'} id="reg-orgName" required error={E('orgName')}>{inp('orgName')}</Field>
            <Field label="Department" id="reg-department" required error={E('department')}>{inp('department', { placeholder: 'e.g. Cardiology' })}</Field>
            <Field label="Organisation address" id="reg-orgAddress" required error={E('orgAddress')} className="sm:col-span-2">{inp('orgAddress')}</Field>
          </div>}
          <div className="flex items-start gap-2 rounded-xl border border-info/30 bg-info/5 p-3 text-[12.5px]"><BadgeCheck size={15} className="mt-0.5 shrink-0 text-info" /><span>Registration details are self-reported and are <b>not</b> proof of credentials. Next you’ll set up <b>multi-factor authentication</b> (required for clinicians), then verify your licence against the provider registry. Until it shows <b>[VERIFIED CLINICIAN - ACTIVE]</b>, critical actions are blocked and patient identifiers are masked.</span></div>
        </>}
        <label className="flex items-start gap-2 text-[13px]"><input id="reg-agree" type="checkbox" data-err={E('agree') ? '1' : undefined} className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={f.agree} onChange={set('agree')} /><span>I understand this is a demo that stores data only in this browser, and I won’t enter real medical information.</span></label>
        {E('agree') && <span className="text-[12px] text-crit -mt-2">{E('agree')}</span>}
        {Object.keys(errs).length > 0 && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">Fix the {Object.keys(errs).length} highlighted field{Object.keys(errs).length > 1 ? 's' : ''} to continue.</div>}
        <Btn kind="primary" size="lg" disabled={busy} onClick={submit}><UserPlus size={16} />{busy ? 'Creating account…' : 'Create account'}</Btn>
      </div>
      <p className="text-center text-[13.5px] text-muted">Already registered? <Btn kind="link" onClick={onLogin}>Sign in</Btn></p>
    </form>
  );
}

function Registered({ user, onContinue }) {
  const doc = user.role === 'doctor';
  return (
    <div className="pop grid gap-4 text-center justify-items-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ok/15 text-ok"><CheckCircle2 size={28} /></span>
      <h1 className="font-display text-[26px] font-extrabold">Account created</h1>
      <p className="text-muted max-w-[46ch]">{doc ? 'Your professional profile is ready. Next: set up multi-factor authentication. Your licence status is PENDING VERIFICATION until the registry check passes.' : 'Your personal dashboard is ready. Share your MediTrace ID with a doctor so they can ask for access. Nothing is shared until you approve it.'}</p>
      <div className="rounded-2xl border border-line bg-surface card-shadow px-6 py-4"><div className="eyebrow">Your MediTrace ID</div><div className="font-mono text-[24px] font-semibold tracking-wide text-navy">{user.id}</div><div className="mt-2"><CopyBtn text={user.id} label="Copy ID" /></div></div>
      <Btn kind="primary" size="lg" onClick={onContinue}>{doc ? <>Set up multi-factor authentication <Fingerprint size={16} /></> : <>Go to my dashboard <ArrowRight size={16} /></>}</Btn>
    </div>
  );
}

function Forgot({ onBack }) {
  const { db, mutate } = useApp();
  const [step, setStep] = useState(1);
  const [ident, setIdent] = useState('');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState(''), [pw2, setPw2] = useState('');
  const [err, setErr] = useState(''), [issued, setIssued] = useState(null), [done, setDone] = useState(false);
  const request = (e) => {
    e.preventDefault(); setErr('');
    const u = findByLogin(db, ident);
    if (!u) return setErr('No account uses that email or phone number.');
    const c = String(Math.floor(100000 + Math.random() * 899999));
    mutate(n => { n.resets = n.resets.filter(r => r.userId !== u.id); n.resets.push({ userId: u.id, code: c, exp: Date.now() + 10 * MIN }); pushAudit(n, { ...actorOf(u), action: 'PASSWORD_RESET_REQUESTED', patientId: u.role === 'patient' ? u.id : null, item: u.id, detail: 'Reset code issued (demo inbox).' }); });
    setIssued({ code: c, to: u.email }); setStep(2);
  };
  const reset = async (e) => {
    e.preventDefault(); setErr('');
    const u = findByLogin(db, ident); const r = u && db.resets.find(x => x.userId === u.id);
    if (!r || r.exp < Date.now()) return setErr('This code has expired. Request a new one.');
    if (code.trim() !== r.code) return setErr('That code is not correct.');
    const pp = pwProblem(pw); if (pp) return setErr(pp); if (pw !== pw2) return setErr('Passwords don’t match.');
    const salt = randSalt(); const h = await hashPw(pw, salt);
    mutate(n => { const x = n.users.find(y => y.id === u.id); x.salt = salt; x.pwHash = h; n.resets = n.resets.filter(y => y.userId !== u.id); pushAudit(n, { ...actorOf(u), action: 'PASSWORD_RESET', patientId: u.role === 'patient' ? u.id : null, item: u.id, detail: 'Password changed using a reset code.' }); });
    setDone(true);
  };
  return (
    <div className="pop grid gap-4">
      <button type="button" onClick={onBack} className="justify-self-start text-[13px] text-muted hover:text-fg inline-flex items-center gap-1"><ChevronLeft size={14} />Back to sign in</button>
      <div><div className="eyebrow">Account recovery</div><h1 className="font-display text-[26px] font-extrabold">Reset your password</h1></div>
      {done ? <div className="rounded-2xl border border-ok/30 bg-ok/5 p-5 grid gap-3"><div className="flex items-center gap-2 font-semibold text-ok"><CheckCircle2 size={18} />Password updated</div><Btn kind="primary" onClick={onBack}>Sign in with your new password</Btn></div> :
      <form onSubmit={step === 1 ? request : reset} className="rounded-2xl border border-line bg-surface card-shadow p-5 grid gap-3" noValidate>
        {step === 1 && <Field label="Email or phone number" id="fp-ident" required><input id="fp-ident" className={inputCls} value={ident} onChange={e => setIdent(e.target.value)} /></Field>}
        {step === 2 && <>
          <div className="rounded-xl border border-mod/40 bg-mod/10 p-3 text-[13px]"><div className="font-semibold flex items-center gap-1.5"><Mail size={14} />Demo inbox</div>This prototype can’t send email. In a real deployment this code would go to <b>{issued?.to}</b>. Your code: <span className="font-mono text-[15px] font-semibold tracking-widest">{issued?.code}</span> (valid 10 minutes)</div>
          <Field label="6-digit code" id="fp-code" required><input id="fp-code" inputMode="numeric" className={inputCls + ' font-mono tracking-widest'} value={code} onChange={e => setCode(e.target.value)} /></Field>
          <Field label="New password" id="fp-pw" required hint="8+ characters with a letter and a number."><input id="fp-pw" type="password" autoComplete="new-password" className={inputCls} value={pw} onChange={e => setPw(e.target.value)} /></Field>
          <Field label="Confirm new password" id="fp-pw2" required><input id="fp-pw2" type="password" autoComplete="new-password" className={inputCls} value={pw2} onChange={e => setPw2(e.target.value)} /></Field>
        </>}
        {err && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
        <Btn kind="primary" size="lg" onClick={step === 1 ? request : reset}>{step === 1 ? 'Send reset code' : 'Update password'}</Btn>
      </form>}
    </div>
  );
}
