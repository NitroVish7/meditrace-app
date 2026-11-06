/* MediTrace security & trust layer.
   - Multi-factor sign-in: TOTP (RFC 6238, works with Google / Microsoft Authenticator) or email / SMS one-time codes.
   - Device recognition, lockout after repeated wrong codes, replay protection, idle session lock.
   - Clinician credential verification against a SYNTHETIC provider registry (simulates an NPPES / medical council API).
   - One access-control enforcer for critical actions, patient-identifier masking for unverified professionals,
     and identity-stamped entries in the hash-chained audit log.
   HONEST LIMITS: everything runs in this browser. Codes are checked client-side, data at rest is plain localStorage,
   email/SMS are shown in an on-screen demo inbox, and no real registry is contacted. See SECURITY_ROWS. */
const { Smartphone, Fingerprint, EyeOff, RefreshCw, Server, LockKeyhole, Globe, ScanLine, ShieldOff, QrCode, Hourglass, MonitorSmartphone } = L;

/* ───────── SHA-1, HMAC-SHA1, base32, HOTP/TOTP (synchronous, no dependencies) ───────── */
function sha1(msg) {
  const ml = msg.length, len = ((ml + 9 + 63) >> 6) << 6, b = new Uint8Array(len); b.set(msg); b[ml] = 0x80;
  const dv = new DataView(b.buffer), bits = ml * 8; dv.setUint32(len - 4, bits >>> 0); dv.setUint32(len - 8, Math.floor(bits / 4294967296));
  let h0 = 0x67452301, h1 = 0xEFCDAB89, h2 = 0x98BADCFE, h3 = 0x10325476, h4 = 0xC3D2E1F0; const w = new Uint32Array(80);
  for (let off = 0; off < len; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) { const t = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]; w[i] = (t << 1) | (t >>> 31); }
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const f = i < 20 ? (bb & c) | (~bb & d) : i < 40 ? bb ^ c ^ d : i < 60 ? (bb & c) | (bb & d) | (c & d) : bb ^ c ^ d;
      const k = i < 20 ? 0x5A827999 : i < 40 ? 0x6ED9EBA1 : i < 60 ? 0x8F1BBCDC : 0xCA62C1D6;
      const t = (((a << 5) | (a >>> 27)) + f + e + k + w[i]) >>> 0; e = d; d = c; c = ((bb << 30) | (bb >>> 2)) >>> 0; bb = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20), o = new DataView(out.buffer); [h0, h1, h2, h3, h4].forEach((h, i) => o.setUint32(i * 4, h)); return out;
}
function hmacSha1(key, msg) {
  if (key.length > 64) key = sha1(key);
  const k = new Uint8Array(64); k.set(key); const ip = new Uint8Array(64 + msg.length), op = new Uint8Array(84);
  for (let i = 0; i < 64; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
  ip.set(msg, 64); op.set(sha1(ip), 64); return sha1(op);
}
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function b32decode(s) { s = String(s).replace(/[\s=-]/g, '').toUpperCase(); let bits = 0, val = 0; const out = []; for (const ch of s) { const i = B32.indexOf(ch); if (i < 0) throw new Error('Invalid base32'); val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return new Uint8Array(out); }
function b32encode(bytes) { let bits = 0, val = 0, s = ''; for (const x of bytes) { val = (val << 8) | x; bits += 8; while (bits >= 5) { s += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) s += B32[(val << (5 - bits)) & 31]; return s; }
const newTotpSecret = () => { const r = new Uint8Array(20); try { crypto.getRandomValues(r); } catch (e) { for (let i = 0; i < 20; i++) r[i] = Math.floor(Math.random() * 256); } return b32encode(r); };
function hotp(key, counter) {
  const m = new Uint8Array(8); let c = counter; for (let i = 7; i >= 0; i--) { m[i] = c & 255; c = Math.floor(c / 256); }
  const h = hmacSha1(key, m), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1000000).padStart(6, '0');
}
const TOTP_STEP = 30;
const totpAt = (secret, ms = Date.now()) => hotp(b32decode(secret), Math.floor(ms / 1000 / TOTP_STEP));
/* Accepts the current 30-second step and one either side (clock drift). A step already used can't be used again. */
function checkTotp(secret, code, lastStep = 0, ms = Date.now()) {
  const step = Math.floor(ms / 1000 / TOTP_STEP), key = b32decode(secret);
  for (const d of [0, -1, 1]) { const s = step + d; if (hotp(key, s) === code) return s <= lastStep ? { ok: false, replay: true } : { ok: true, step: s }; }
  return { ok: false };
}
const otpauthUri = (u, secret) => `otpauth://totp/${encodeURIComponent('MediTrace:' + u.email)}?secret=${secret}&issuer=MediTrace&algorithm=SHA1&digits=6&period=${TOTP_STEP}`;
const groupKey = (s) => s.replace(/(.{4})/g, '$1 ').trim();

/* ───────── identity, MFA and session state ───────── */
const MFA_LABEL = { totp: 'Authenticator app (TOTP)', email: 'Email one-time code', sms: 'SMS one-time code', password: 'Password only' };
const MFA_SHORT = { totp: 'Authenticator app', email: 'Email code', sms: 'SMS code', password: 'Password only' };
const isClinical = (u) => u?.role === 'doctor';
const mfaRequired = (u) => isClinical(u);
const MFA_MAX_TRIES = 5, MFA_LOCK_MS = 5 * MIN, OTP_TTL = 5 * MIN;
const MFA_METHODS = ['totp', 'email', 'sms'];
let CURRENT_AUTH = null; // { userId, method, deviceId } for the signed-in session; stamped onto audit entries.
const setCurrentAuth = (s) => { CURRENT_AUTH = s && s.userId ? { userId: s.userId, ...(s.auth || {}) } : null; };

const credStatus = (u) => !u || u.role !== 'doctor' ? null : ['verified', 'verified-demo'].includes(u.profile.credential) ? 'verified' : u.profile.credential === 'flagged' ? 'flagged' : 'pending';
const isVerifiedClinician = (u) => credStatus(u) === 'verified';
const CRED_META = {
  verified: { label: 'VERIFIED CLINICIAN - ACTIVE', short: 'Verified clinician', cls: 'text-ok bg-ok/10 ring-ok/40', icon: BadgeCheck },
  pending: { label: 'PENDING VERIFICATION', short: 'Pending verification', cls: 'text-high bg-high/10 ring-high/40', icon: Clock },
  flagged: { label: 'FLAGGED / UNVERIFIED', short: 'Flagged / unverified', cls: 'text-crit bg-crit/10 ring-crit/40', icon: ShieldAlert },
};
function authStamp(u) {
  const mine = CURRENT_AUTH && CURRENT_AUTH.userId === u.id ? CURRENT_AUTH : null;
  const m = mine ? MFA_LABEL[mine.method] || 'Signed in' : 'no verified session';
  return u.role === 'patient' ? `Patient · ${m}` : `${CRED_META[credStatus(u)].label} · ${m}`;
}
const CredentialBadge = ({ u, className = '' }) => { const s = credStatus(u); if (!s) return null; const M = CRED_META[s]; const I = M.icon; return <span className={`inline-flex items-center gap-1 rounded-md ring-1 px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wide whitespace-nowrap ${M.cls} ${className}`}><I size={12} />[{M.label}]</span>; };

const DEVICE_KEY = 'meditrace-device';
function thisDevice() {
  let id = 'DEV-ephemeral';
  try { id = localStorage.getItem(DEVICE_KEY); if (!id) { id = uid('DEV'); localStorage.setItem(DEVICE_KEY, id); } } catch (e) {}
  const ua = navigator.userAgent || '';
  const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'macOS' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'unknown OS';
  return { id, label: `${br} on ${os}` };
}

/* Idle lock. The last-activity time is kept in storage too, so reloading the page doesn't reset the clock. */
const IDLE_KEY = 'meditrace-idle';
const IDLE_OPTS = [['2m', 2 * MIN, '2 minutes (demo)'], ['5m', 5 * MIN, '5 minutes'], ['15m', 15 * MIN, '15 minutes'], ['30m', 30 * MIN, '30 minutes']];
const idleMsFor = (u) => (IDLE_OPTS.find(o => o[0] === u?.security?.idle) || IDLE_OPTS.find(o => o[0] === (isClinical(u) ? '15m' : '30m')))[1];
const IDLE = { last: Date.now(), warn: 60 * 1000, saved: 0 };
const readIdle = () => { try { return +localStorage.getItem(IDLE_KEY) || 0; } catch (e) { return 0; } };
function touchIdle(force) { IDLE.last = Date.now(); if (force || IDLE.last - IDLE.saved > 5000) { IDLE.saved = IDLE.last; try { localStorage.setItem(IDLE_KEY, String(IDLE.last)); } catch (e) {} } }
const fmtClock = (ms) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${pad2(s % 60)}`; };

/* Finishes a sign-in: records the device, the second factor and the login in the audit trail. Returns the session auth. */
function completeSignIn(mutate, userId, method, opts = {}) {
  const dev = thisDevice(); const at = nowISO();
  mutate(n => {
    const x = n.users.find(y => y.id === userId);
    let isNew = false;
    if (method !== 'password') {
      x.mfa = { ...(x.mfa || {}), failed: 0, lockUntil: null, ...(opts.step ? { lastStep: opts.step } : {}) };
      const list = x.mfa.devices || (x.mfa.devices = []);
      let d = list.find(z => z.id === dev.id); isNew = !d;
      if (!d && opts.remember !== false) { d = { id: dev.id, label: dev.label, firstSeen: at }; list.push(d); }
      if (d) d.lastUsed = at;
    }
    CURRENT_AUTH = { userId, method, deviceId: dev.id };
    const pid = x.role === 'patient' ? x.id : null;
    if (method !== 'password') pushAudit(n, { ...actorOf(x), action: 'MFA_VERIFIED', patientId: pid, item: x.id, detail: `Second factor verified: ${MFA_LABEL[method]} on ${dev.label}${isNew ? ' (new device)' : ' (recognised device)'}.` });
    pushAudit(n, { ...actorOf(x), action: 'LOGIN', patientId: pid, item: x.id, detail: `Signed in (${x.role === 'patient' ? 'patient portal' : 'professional portal'}) with ${MFA_LABEL[method].toLowerCase()}.` });
    if (isNew && method !== 'password') notify(n, x.id, { type: 'security', title: 'New device signed in', body: `${dev.label} · ${fmtTs(at)}. If this wasn’t you, remove the device in Profile → Security and change your password.`, priority: 'high', link: 'profile' });
  }, { silent: true });
  return { method, deviceId: dev.id, deviceLabel: dev.label, at };
}

/* ───────── small UI pieces ───────── */
function QrBox({ text, size = 172 }) {
  const svg = useMemo(() => { try { if (!window.qrcode) return null; const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag(4, 2); } catch (e) { return null; } }, [text]);
  if (!svg) return <div className="grid place-items-center rounded-xl border border-dashed border-line p-3 text-center text-[12px] text-muted" style={{ width: size, height: size }}>QR code unavailable. Enter the setup key instead.</div>;
  return <div className="qr rounded-xl bg-white p-2 ring-1 ring-line" style={{ width: size, height: size }} role="img" aria-label="QR code to add MediTrace to an authenticator app" dangerouslySetInnerHTML={{ __html: svg }} />;
}

function DemoAuthenticator({ secret, email }) {
  const [t, setT] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setT(Date.now()), 500); return () => clearInterval(i); }, []);
  const code = totpAt(secret, t); const left = TOTP_STEP - Math.floor(t / 1000) % TOTP_STEP;
  return (
    <div className="rounded-xl border border-mod/40 bg-mod/10 p-3 grid gap-1.5" id="demo-totp-box">
      <div className="flex items-center gap-1.5 text-[12.5px] font-semibold"><Smartphone size={14} className="text-mod" />Demo authenticator</div>
      <div className="flex items-center gap-3"><span id="demo-totp" className="font-mono text-[22px] font-semibold tracking-[.18em] text-fg tnum">{code.slice(0, 3)} {code.slice(3)}</span>
        <span className="flex items-center gap-1 text-[11.5px] text-muted tnum"><Hourglass size={12} />{left}s</span></div>
      <p className="text-[11.5px] text-muted">Shows what a phone app would show for <span className="font-mono">{email}</span>. Demo helper only: a real deployment never displays the code on the sign-in screen.</p>
    </div>
  );
}

function DemoInbox({ issued }) {
  if (!issued) return null;
  return <div className="rounded-xl border border-mod/40 bg-mod/10 p-3 text-[13px]" id="demo-inbox">
    <div className="font-semibold flex items-center gap-1.5">{issued.channel === 'sms' ? <Phone size={14} /> : <Mail size={14} />}Demo {issued.channel === 'sms' ? 'SMS' : 'inbox'}</div>
    This prototype can’t send {issued.channel === 'sms' ? 'text messages' : 'email'}. In a real deployment the code goes to <b>{issued.to}</b>. Code: <span id="demo-otp" className="font-mono text-[15px] font-semibold tracking-widest">{issued.code}</span> · expires in 5 minutes.</div>;
}

const maskPhone = (p) => p ? `••• ••• ${String(p).slice(-4)}` : 'your phone';
const maskEmail = (e) => (e || '').replace(/^(.)[^@]*(@.*)$/, '$1•••$2');

function CodeInput({ value, onChange, onComplete, disabled, id = 'mfa-code', label = '6-digit code' }) {
  return <Field label={label} id={id} required>
    <input id={id} inputMode="numeric" autoComplete="one-time-code" maxLength={7} disabled={disabled} autoFocus
      className={inputCls + ' font-mono text-[22px] tracking-[.45em] text-center py-2.5'} placeholder="••••••" value={value}
      onChange={e => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); onChange(v); if (v.length === 6 && onComplete) onComplete(v); }} />
  </Field>;
}

/* ───────── MFA enrolment (mandatory for clinical users; optional for patients) ───────── */
function MfaEnroll({ user, onEnrolled, onCancel, embedded }) {
  const { mutate } = useApp();
  const [method, setMethod] = useState('totp');
  const [secret] = useState(newTotpSecret);
  const [code, setCode] = useState(''), [err, setErr] = useState(''), [issued, setIssued] = useState(null), [tries, setTries] = useState(0), [helper, setHelper] = useState(!!user.demo);
  const choose = (m) => { setMethod(m); setCode(''); setErr(''); setIssued(null); };
  const send = () => { const c = String(Math.floor(100000 + Math.random() * 900000)); setIssued({ channel: method, code: c, to: method === 'sms' ? maskPhone(user.phone) : user.email, exp: Date.now() + OTP_TTL }); setCode(''); setErr('');
    mutate(n => pushAudit(n, { ...actorOf(user), action: 'MFA_CODE_SENT', patientId: user.role === 'patient' ? user.id : null, item: user.id, detail: `Enrolment code sent by ${method === 'sms' ? 'SMS' : 'email'} (demo inbox).` }), { silent: true }); };
  const verify = (v = code) => {
    if (v.length !== 6) return setErr('Enter all 6 digits.');
    let ok = false, step;
    if (method === 'totp') { const r = checkTotp(secret, v, 0); ok = r.ok; step = r.step; }
    else ok = !!issued && issued.exp > Date.now() && v === issued.code;
    if (!ok) { const t = tries + 1; setTries(t); setCode(''); return setErr(method !== 'totp' && issued && issued.exp <= Date.now() ? 'That code expired. Send a new one.' : `That code isn’t right. ${method === 'totp' ? 'Check the code currently shown in your authenticator app.' : 'Check the latest code.'}`); }
    onEnrolled({ method, secret: method === 'totp' ? secret : null, step });
  };
  const opts = [['totp', Smartphone, 'Authenticator app', 'Google or Microsoft Authenticator, 1Password… Recommended.'], ['email', Mail, 'Email code', `Sent to ${user.email}`], ['sms', Phone, 'SMS code', `Sent to ${maskPhone(user.phone)}`]];
  return (
    <div className="grid gap-4">
      {!embedded && <div><div className="eyebrow">{isClinical(user) ? 'Required for clinical accounts' : 'Extra protection'}</div><h1 className="font-display text-[26px] font-extrabold leading-tight">Set up multi-factor authentication</h1>
        <p className="text-muted mt-1 text-[13.5px]">{isClinical(user) ? 'Physicians, pharmacists and nurses must verify a second factor at every sign-in before any patient record opens.' : 'Ask for a code as well as your password when you sign in.'}</p></div>}
      <div className="grid sm:grid-cols-3 gap-2" role="radiogroup" aria-label="Second factor">{opts.map(([k, I, t, d]) => (
        <button key={k} type="button" role="radio" aria-checked={method === k} onClick={() => choose(k)} className={`flex items-start gap-2.5 rounded-xl border-2 p-3 text-left transition ${method === k ? 'border-accent bg-accent/5' : 'border-line hover:border-accent/40'}`}>
          <I size={17} className={method === k ? 'text-accent mt-0.5' : 'text-muted mt-0.5'} /><span className="min-w-0"><span className="block text-[13.5px] font-semibold">{t}</span><span className="block text-[11.5px] text-muted break-words">{d}</span></span></button>))}</div>
      <div className="rounded-2xl border border-line bg-surface card-shadow p-4 grid gap-3">
        {method === 'totp' ? <>
          <div className="flex flex-wrap items-start gap-4">
            <QrBox text={otpauthUri(user, secret)} />
            <ol className="min-w-0 flex-1 grid gap-2 text-[13px] list-decimal pl-4">
              <li>Open your authenticator app and choose <b>Add account → Scan QR code</b>.</li>
              <li>Can’t scan? Enter this setup key (time-based, 6 digits, 30 s):<div className="mt-1 flex flex-wrap items-center gap-2"><code id="mfa-secret" className="rounded-lg bg-raised px-2 py-1 font-mono text-[12.5px] tracking-wider break-all">{groupKey(secret)}</code><CopyBtn text={secret} label="Copy key" /></div></li>
              <li>Enter the 6-digit code the app shows to confirm.</li>
            </ol>
          </div>
          {helper ? <DemoAuthenticator secret={secret} email={user.email} /> : <Btn kind="link" className="justify-self-start text-[12.5px]" onClick={() => setHelper(true)}>No phone handy? Show the demo authenticator</Btn>}
        </> : <>
          <p className="text-[13px]">We’ll send a 6-digit code to <b>{method === 'sms' ? maskPhone(user.phone) : user.email}</b>. Codes expire after 5 minutes.</p>
          <Btn className="justify-self-start" onClick={send}><Send size={14} />{issued ? 'Send a new code' : 'Send code'}</Btn>
          <DemoInbox issued={issued} />
        </>}
        {(method === 'totp' || issued) && <CodeInput value={code} onChange={(v) => { setCode(v); setErr(''); }} onComplete={verify} />}
        {err && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
        <div className="flex flex-wrap gap-2">{(method === 'totp' || issued) && <Btn kind="primary" size="lg" onClick={() => verify()}><ShieldCheck size={16} />Confirm and turn on</Btn>}{onCancel && <Btn size="lg" onClick={onCancel}>Cancel</Btn>}</div>
      </div>
    </div>
  );
}

/* ───────── MFA challenge: "Verify device & enter 6-digit code" ───────── */
function MfaChallenge({ user, onVerified, onCancel }) {
  const { db, mutate, now } = useApp();
  const u = userById(db, user.id) || user;
  const m = u.mfa || {};
  const dev = useMemo(thisDevice, []);
  const known = (m.devices || []).find(d => d.id === dev.id);
  const [channel, setChannel] = useState(m.method);
  const [code, setCode] = useState(''), [err, setErr] = useState(''), [issued, setIssued] = useState(null), [remember, setRemember] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => { const i = setInterval(() => setTick(x => x + 1), 1000); return () => clearInterval(i); }, []);
  const lockedMs = m.lockUntil ? Date.parse(m.lockUntil) - Date.now() : 0;
  const locked = lockedMs > 0;
  const pid = u.role === 'patient' ? u.id : null;
  const send = (ch) => { const c = String(Math.floor(100000 + Math.random() * 900000)); setChannel(ch); setCode(''); setErr('');
    setIssued({ channel: ch, code: c, to: ch === 'sms' ? maskPhone(u.phone) : u.email, exp: Date.now() + OTP_TTL });
    mutate(n => pushAudit(n, { ...actorOf(u), action: 'MFA_CODE_SENT', patientId: pid, item: u.id, detail: `Sign-in code sent by ${ch === 'sms' ? 'SMS' : 'email'} (demo inbox) for ${dev.label}.` }), { silent: true }); };
  useEffect(() => { if (m.method !== 'totp' && !locked) send(m.method); }, []);
  const fail = (why) => {
    let lockedNow = false;
    mutate(n => { const x = n.users.find(y => y.id === u.id); x.mfa.failed = (x.mfa.failed || 0) + 1;
      pushAudit(n, { ...actorOf(x), action: 'MFA_FAILED', patientId: pid, item: x.id, detail: `Wrong second-factor code (${why}) on ${dev.label}. Attempt ${x.mfa.failed} of ${MFA_MAX_TRIES}.` });
      if (x.mfa.failed >= MFA_MAX_TRIES) { lockedNow = true; x.mfa.lockUntil = new Date(Date.now() + MFA_LOCK_MS).toISOString(); x.mfa.failed = 0;
        pushAudit(n, { ...actorOf(x), action: 'MFA_LOCKED', patientId: pid, item: x.id, detail: `Sign-in locked for ${MFA_LOCK_MS / MIN} minutes after ${MFA_MAX_TRIES} wrong codes.` });
        notify(n, x.id, { type: 'security', title: 'Sign-in locked after wrong codes', body: `${MFA_MAX_TRIES} incorrect codes were entered on ${dev.label}. If this wasn’t you, change your password.`, priority: 'high', link: 'profile' }); } }, { silent: true });
    const left = MFA_MAX_TRIES - ((m.failed || 0) + 1);
    setCode(''); setErr(lockedNow ? `Too many wrong codes. Sign-in is locked for ${MFA_LOCK_MS / MIN} minutes.` : why === 'reused' ? `That code was already used. Wait for the next code in your app. ${left} attempt${left === 1 ? '' : 's'} left.` : `That code isn’t right. ${left} attempt${left === 1 ? '' : 's'} left.`);
  };
  const verify = (v = code) => {
    if (locked) return; if (v.length !== 6) return setErr('Enter all 6 digits.');
    if (channel === 'totp') { const r = checkTotp(m.secret, v, m.lastStep || 0); if (!r.ok) return fail(r.replay ? 'reused' : 'incorrect'); return onVerified(completeSignIn(mutate, u.id, 'totp', { step: r.step, remember })); }
    if (!issued || issued.exp <= Date.now()) { setCode(''); return setErr('That code expired. Send a new one.'); }
    if (v !== issued.code) return fail('incorrect');
    onVerified(completeSignIn(mutate, u.id, channel, { remember }));
  };
  const alt = MFA_METHODS.filter(x => x !== channel && x !== 'totp');
  return (
    <div className="pop grid gap-4">
      <button type="button" onClick={onCancel} className="justify-self-start text-[13px] text-muted hover:text-fg inline-flex items-center gap-1"><ChevronLeft size={14} />Use a different account</button>
      <div><div className="eyebrow">Step 2 of 2 · Multi-factor authentication</div><h1 className="font-display text-[26px] font-extrabold leading-tight">Verify device &amp; enter 6-digit code</h1>
        <p className="text-muted mt-1 text-[13.5px]">{isClinical(u) ? 'Patient records stay closed until your second factor is verified.' : 'Your account asks for a code as well as your password.'}</p></div>
      <div className="rounded-2xl border border-line bg-surface card-shadow p-4 grid gap-3">
        <div className={`flex items-start gap-3 rounded-xl border p-3 ${known ? 'border-ok/30 bg-ok/5' : 'border-high/40 bg-high/5'}`} id="mfa-device">
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${known ? 'bg-ok/15 text-ok' : 'bg-high/15 text-high'}`}><MonitorSmartphone size={17} /></span>
          <div className="min-w-0 text-[13px]"><div className="font-semibold">{dev.label}</div>
            <div className="text-muted">{known ? `Recognised device · first seen ${fmtDate(known.firstSeen)} · last used ${relTime(known.lastUsed, now)}` : 'New device for this account. You’ll get a security notification after signing in.'}</div>
            <div className="font-mono text-[11px] text-muted/80">Device ID {dev.id}</div></div>
        </div>
        <div className="flex items-center gap-2 text-[13px]"><span className="text-muted">Signing in as</span><b>{u.profile.fullName}</b>{isClinical(u) && <CredentialBadge u={u} />}</div>
        {locked ? <div role="alert" className="rounded-xl border border-crit/40 bg-crit/5 p-3 text-[13px] text-crit flex items-start gap-2"><Lock size={15} className="mt-0.5 shrink-0" /><span><b>Sign-in locked.</b> Too many wrong codes. Try again in <span className="font-mono tnum">{fmtClock(lockedMs)}</span>. The attempts were recorded in the audit log.</span></div> : <>
          {channel === 'totp' ? <p className="text-[13.5px] flex items-start gap-2"><Smartphone size={16} className="mt-0.5 shrink-0 text-accent" /><span>Open your authenticator app and enter the current code for <b className="break-all">MediTrace: {u.email}</b>.</span></p>
            : <p className="text-[13.5px] flex items-start gap-2">{channel === 'sms' ? <Phone size={16} className="mt-0.5 shrink-0 text-accent" /> : <Mail size={16} className="mt-0.5 shrink-0 text-accent" />}<span>We sent a code to <b className="break-all">{channel === 'sms' ? maskPhone(u.phone) : u.email}</b>.</span></p>}
          {channel === 'totp' && u.demo && <DemoAuthenticator secret={m.secret} email={u.email} />}
          {channel !== 'totp' && <DemoInbox issued={issued} />}
          <CodeInput value={code} onChange={(v) => { setCode(v); setErr(''); }} onComplete={verify} />
          <Check2 id="mfa-remember" checked={remember} onChange={setRemember} label="Remember this device" desc="It will show as recognised next time. You’ll still need a code at every sign-in." />
          {err && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
          <div className="flex flex-wrap items-center gap-2">
            <Btn kind="primary" size="lg" onClick={() => verify()}><ShieldCheck size={16} />Verify and continue</Btn>
            {channel !== 'totp' && <Btn onClick={() => send(channel)}><RefreshCw size={14} />Resend code</Btn>}
            {channel !== m.method && m.method === 'totp' && <Btn kind="link" onClick={() => { setChannel('totp'); setIssued(null); setCode(''); setErr(''); }}>Use authenticator app</Btn>}
            {alt.map(a => <Btn key={a} kind="link" onClick={() => send(a)}>{a === 'sms' ? 'Text me a code instead' : 'Email me a code instead'}</Btn>)}
          </div>
        </>}
      </div>
      <DemoNote>Codes are checked in this browser for the demo. Production checks them on the server with rate limiting, and sends email or SMS through a provider.</DemoNote>
    </div>
  );
}

/* Login step 2: enrol first (mandatory for clinicians), otherwise challenge. */
function MfaFlow({ userId, onDone, onCancel }) {
  const { db, mutate } = useApp();
  const u = userById(db, userId);
  if (!u) return null;
  if (!u.mfa?.enrolled) return <div className="pop"><MfaEnroll user={u} onCancel={onCancel} onEnrolled={({ method, secret, step }) => {
    mutate(n => { const x = n.users.find(y => y.id === userId); x.mfa = { ...(x.mfa || {}), enrolled: true, method, secret, enrolledAt: nowISO(), lastStep: step || 0, failed: 0, devices: x.mfa?.devices || [] };
      pushAudit(n, { ...actorOf(x), action: 'MFA_ENROLLED', patientId: x.role === 'patient' ? x.id : null, item: x.id, detail: `Multi-factor authentication turned on: ${MFA_LABEL[method]}.` }); }, { silent: true });
    onDone(userId, completeSignIn(mutate, userId, method, { step }));
  }} /></div>;
  return <MfaChallenge user={u} onVerified={(auth) => onDone(userId, auth)} onCancel={onCancel} />;
}

/* ───────── session timer + security & compliance banner ───────── */
function SessionTimer({ idleMs, onTimeout }) {
  const [, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT(x => x + 1), 1000); return () => clearInterval(i); }, []);
  const rem = idleMs - (Date.now() - IDLE.last);
  const out = rem <= 0, warn = !out && rem <= IDLE.warn;
  useEffect(() => { if (out) onTimeout(); }, [out]);
  return <>
    <span id="session-timer" className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 tnum ${warn ? 'bg-crit/10 text-crit ring-crit/40' : 'bg-raised text-muted ring-line'}`} title="The session locks after this much inactivity">
      <Timer size={12} />Auto-lock {fmtClock(rem)}</span>
    <Modal open={warn} onClose={() => touchIdle(true)} title="Are you still there?" footer={<Btn kind="primary" onClick={() => touchIdle(true)}>Stay signed in</Btn>}>
      <div className="grid gap-2 text-[13.5px]" role="alert"><p>For patient privacy, MediTrace signs you out after {Math.round(idleMs / MIN)} minutes without activity.</p>
        <p className="font-display text-[28px] font-extrabold text-crit tnum" id="idle-countdown">{fmtClock(rem)}</p><p className="text-muted text-[12.5px]">Unsaved form entries will be lost when the session locks.</p></div>
    </Modal>
  </>;
}

const SECURITY_ROWS = [
  ['Encryption in transit', (c) => c.tls ? 'HTTPS is active for this page. The TLS version is set by the hosting server.' : 'This page is not served over HTTPS.', 'TLS 1.3 only, HSTS, certificate pinning on mobile apps.'],
  ['Encryption at rest', () => 'Not encrypted. Records sit in this browser’s localStorage as plain JSON.', 'AES-256-GCM on the database and backups, keys in a managed KMS/HSM, field-level encryption for identifiers.'],
  ['Authentication', (c) => `Password plus ${c.method ? MFA_LABEL[c.method].toLowerCase() : 'second factor'}. TOTP codes follow RFC 6238; 5 wrong codes lock sign-in for 5 minutes; a used code can’t be reused.`, 'Same flows checked on the server, plus SSO/SAML with the hospital identity provider and phishing-resistant keys (WebAuthn).'],
  ['Session', (c) => `Idle lock after ${Math.round(c.idleMs / MIN)} minutes with a 60-second warning; 8-hour maximum session. Survives page reloads.`, 'Server-side sessions with secure, HttpOnly cookies and re-authentication for high-risk actions.'],
  ['Access control (RBAC)', () => 'Role (patient / professional) + patient consent scopes + verified-licence gate on critical actions. Unverified professionals see masked identifiers.', 'Same rules enforced by the API, not the browser, with break-glass access that is reviewed afterwards.'],
  ['Audit logging', (c) => `${c.chain.ok ? 'Chain intact' : 'Chain broken'} · ${c.chain.n || c.chain.at} entries. Each entry stores who, when, verified identity and action, linked by hash (FNV-1a, demo strength).`, 'Write-once storage, SHA-256 hash chain anchored externally, retained for 6+ years (HIPAA).'],
  ['Credential verification', () => 'Checked against a synthetic provider registry built into this page. No external registry is contacted.', 'NPPES NPI registry and state medical board / medical council APIs, re-checked on a schedule.'],
  ['Compliance', () => 'Designed with HIPAA and GDPR principles in mind. Not certified, no BAA, synthetic data only.', 'Formal risk assessment, BAA/DPA with every processor, data residency, breach-notification process.'],
];

function SecurityBar({ session, idleMs, onTimeout }) {
  const { db, me } = useApp();
  const [open, setOpen] = useState(false);
  const chain = useMemo(() => verifyChain(realLog(db)), [db.log]);
  const tls = location.protocol === 'https:';
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  const method = session?.auth?.method;
  const cs = credStatus(me);
  const tone = { ok: 'bg-ok/10 text-ok ring-ok/30', mod: 'bg-mod/15 text-mod ring-mod/40', crit: 'bg-crit/10 text-crit ring-crit/40', muted: 'bg-raised text-muted ring-line' };
  const items = [
    [Lock, tls ? 'ok' : 'mod', tls ? 'TLS in transit (HTTPS)' : local ? 'Local preview · no TLS' : 'No TLS'],
    [LockKeyhole, 'muted', 'AES-256 at rest: production only'],
    [Fingerprint, method && method !== 'password' ? 'ok' : 'mod', method && method !== 'password' ? `MFA · ${MFA_SHORT[method]}` : 'Password only · MFA off'],
    [Users, me.role === 'patient' ? 'ok' : cs === 'verified' ? 'ok' : 'crit', me.role === 'patient' ? 'RBAC · Patient' : cs === 'verified' ? 'RBAC · Verified clinician' : 'RBAC · Restricted (unverified)'],
    [History, chain.ok ? 'ok' : 'crit', chain.ok ? `HIPAA-style audit log on · chain intact` : `Audit chain broken at #${chain.at}`],
  ];
  return (
    <div className="border-t border-line/70 bg-bg/70" role="region" aria-label="Security and compliance status" id="security-bar">
      <div className="gutter mx-auto max-w-7xl flex items-center gap-1.5 py-1.5 overflow-x-auto">
        <ShieldCheck size={14} className="shrink-0 text-accent" />
        {items.map(([I, t, l]) => <span key={l} className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${tone[t]}`}><I size={12} />{l}</span>)}
        <span className="shrink-0"><SessionTimer idleMs={idleMs} onTimeout={onTimeout} /></span>
        <button onClick={() => setOpen(true)} className="ml-auto shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-accent hover:underline">Security details</button>
      </div>
      <Modal open={open} onClose={() => setOpen(false)} wide title="Security & compliance" footer={<Btn onClick={() => setOpen(false)}>Close</Btn>}>
        <div className="grid gap-3">
          <p className="text-[13px] text-muted">What this prototype actually does, next to what a production deployment handling real PHI needs. Nothing here makes the demo safe for real patient data.</p>
          <div className="scroll-x -mx-1"><table className="w-full min-w-[640px] text-[12.5px]"><thead><tr className="text-left border-b border-line">{['Control', 'This prototype (live)', 'Production requirement'].map(h => <th key={h} className="px-2 py-2 eyebrow">{h}</th>)}</tr></thead>
            <tbody>{SECURITY_ROWS.map(([k, live, prod]) => <tr key={k} className="border-b border-line/60 align-top"><td className="px-2 py-2 font-semibold whitespace-nowrap">{k}</td><td className="px-2 py-2">{live({ tls, method, idleMs, chain })}</td><td className="px-2 py-2 text-muted">{prod}</td></tr>)}</tbody></table></div>
          {session?.auth?.deviceLabel && <div className="text-[12px] text-muted">This session: {MFA_LABEL[method]} · {session.auth.deviceLabel} · since {fmtTs(session.auth.at)}</div>}
        </div>
      </Modal>
    </div>
  );
}

/* ───────── access control enforcer ───────── */
const BLOCK_MSG = 'Action Blocked: Physician Medical License Verification Required.';
function LicenseBlock({ className = '' }) {
  const { me, go } = useApp();
  if (!me || me.role !== 'doctor' || isVerifiedClinician(me)) return null;
  const v = me.profile.verification;
  const why = credStatus(me) === 'flagged' ? (v?.steps || []).filter(s => s.state === 'fail').map(s => `${s.label}: ${s.detail}`).join(' ') : 'Your licence hasn’t been checked against the registry yet.';
  return <div role="alert" className={`grid gap-2 sm:flex sm:items-start rounded-xl border border-crit/40 bg-crit/[.06] px-3 py-2.5 text-[13px] ${className}`} data-license-block>
    <div className="flex min-w-0 flex-1 items-start gap-2"><ShieldOff size={16} className="mt-0.5 shrink-0 text-crit" />
      <div className="min-w-0"><div className="font-bold text-crit">{BLOCK_MSG}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1"><CredentialBadge u={me} /><span className="text-fg/85">{why}</span></div>
        <div className="mt-1 text-[12px] text-muted">Blocked until verified: signing off reconciliations and transfers, overriding discrepancies, verifying prescriptions, viewing full patient identifiers.</div></div></div>
    <Btn size="sm" kind="primary" className="justify-self-start shrink-0" onClick={() => go('credentials')}><BadgeCheck size={13} />Verify my licence</Btn>
  </div>;
}

function LicenseBlockModal({ denied, onClose, go }) {
  const { me } = useApp();
  return <Modal open={!!denied} onClose={onClose} title="Action blocked" footer={<><Btn onClick={onClose}>Close</Btn><Btn kind="primary" onClick={() => { onClose(); go('credentials'); }}><BadgeCheck size={14} />Go to credential verification</Btn></>}>
    {denied && <div className="grid gap-3 text-[13.5px]" id="license-block-modal">
      <div role="alert" className="flex items-start gap-2 rounded-xl border border-crit/40 bg-crit/[.06] p-3"><ShieldOff size={18} className="mt-0.5 shrink-0 text-crit" /><b className="text-crit">{BLOCK_MSG}</b></div>
      <dl className="grid grid-cols-2 gap-3"><KV k="Attempted action" v={denied.action} /><KV k="Your status" v={<CredentialBadge u={me} />} /></dl>
      <p>Only clinicians whose licence is verified against the registry can do this. Patient consent alone isn’t enough.</p>
      <p className="text-[12.5px] text-muted">The attempt was recorded in the audit trail as ACCESS_DENIED. Nothing was changed.</p>
    </div>}
  </Modal>;
}

/* ───────── patient-identifier masking for unverified professionals ───────── */
const realLog = (db) => (useAppDb.current || db).log;
let REDACT_CACHE = { key: '', res: [] };
function redactPHI(t) {
  const d = useAppDb.current; if (!d || !t) return t;
  const pts = d.users.filter(u => u.role === 'patient');
  const key = pts.map(p => p.id + p.profile.fullName + p.profile.dob).join('|');
  if (REDACT_CACHE.key !== key) {
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); const res = [];
    pts.forEach(p => { p.profile.fullName.split(/\s+/).filter(x => x.length > 1).forEach(part => res.push(new RegExp(`\\b${esc(part)}\\b`, 'gi')));
      if (p.profile.dob) { const [y, m, dd] = p.profile.dob.split('-'); res.push(new RegExp(esc(p.profile.dob), 'g'), new RegExp(`${m}/${dd}/${y}`, 'g'), new RegExp(`${dd}/${m}/${y}`, 'g')); } });
    REDACT_CACHE = { key, res };
  }
  return REDACT_CACHE.res.reduce((s, re) => s.replace(re, '‹redacted›'), t);
}
function maskedView(db) {
  return { ...db,
    users: db.users.map(u => u.role !== 'patient' ? u : { ...u, email: maskEmail(u.email), phone: '', profile: { ...u.profile, fullName: maskName(u.profile.fullName), dob: '', address: '', emergency: '', gender: '' } }),
    prescriptions: db.prescriptions.map(r => r.lines ? { ...r, lines: r.lines.map(redactPHI) } : r),
    // Display copies only: the hash chain is always verified on the real log (realLog()).
    log: db.log.map(e => ({ ...e, actor: e.actorId && e.actorId.startsWith('MT-P') ? maskName(e.actor) : e.actor, detail: redactPHI(e.detail) })),
    notifications: db.notifications.map(n => ({ ...n, title: redactPHI(n.title), body: redactPHI(n.body || '') })) };
}
const MaskedNotice = () => { const { masked } = useApp(); return masked ? <span className="inline-flex items-center gap-1 rounded-md bg-crit/10 px-1.5 py-0.5 text-[10.5px] font-bold text-crit ring-1 ring-crit/30"><EyeOff size={11} />IDENTIFIERS MASKED</span> : null; };

/* ───────── synthetic provider registry (simulates NPPES / medical council lookups) ───────── */
const REGISTRY = [
  { npi: '1992401178', council: 'SYN-MC-55821', name: 'Léa Moreau', type: 'Physician', specialty: 'Internal Medicine', board: 'Board certified · Internal Medicine', affiliations: ['Eastside Family Clinic'], status: 'active', expires: '2028-06-30' },
  { npi: '1992401251', council: 'SYN-PH-20417', name: 'R. Osei', type: 'Pharmacist', specialty: 'Clinical Pharmacy', board: 'Board certified · Pharmacotherapy', affiliations: ['Harbor General Hospital'], status: 'active', expires: '2027-12-31' },
  { npi: '1992401335', council: 'SYN-MC-61190', name: 'Sam Reyes', type: 'Physician', specialty: 'Emergency Medicine', board: 'Board certified · Emergency Medicine', affiliations: ['Harbor General Hospital'], status: 'suspended', expires: '2027-03-31', note: 'Suspended by the (synthetic) state medical board on 2026-11-02.' },
  { npi: '1992401418', council: 'SYN-MC-48302', name: 'Priya Nair', type: 'Physician', specialty: 'Cardiology', board: 'Board certified · Cardiovascular Disease', affiliations: ['Harbor General Hospital'], status: 'active', expires: '2029-01-31' },
  { npi: '1992401582', council: 'SYN-MC-27715', name: 'Jordan Blake', type: 'Physician', specialty: 'Family Medicine', board: 'Board certified · Family Medicine', affiliations: ['Eastside Family Clinic'], status: 'active', expires: '2026-08-31' },
  { npi: '1992401665', council: 'SYN-RN-90412', name: 'Alex Kim', type: 'Registered Nurse', specialty: 'Nursing', board: 'Registered Nurse · Medical-Surgical', affiliations: ['Harbor General Hospital'], status: 'active', expires: '2028-02-28' },
];
const luhnOk = (s) => { let t = 0; [...s].reverse().forEach((c, i) => { let d = +c; if (i % 2) { d *= 2; if (d > 9) d -= 9; } t += d; }); return t % 10 === 0; };
const npiValid = (s) => /^\d{10}$/.test(s) && luhnOk('80840' + s);
const personTokens = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\b(dr|mr|mrs|ms|mx|prof)\b\.?/g, ' ').replace(/,?\s*\b(md|do|pharmd|rn|np|pa|mbbs|phd|bsn)\b\.?/g, ' ').replace(/[^a-z\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
const nameMatches = (a, b) => { const x = personTokens(a), y = personTokens(b); return !!(x.length && y.length && x[x.length - 1] === y[y.length - 1] && x[0][0] === y[0][0]); };
const normOrg = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function registryCheck(db, me, f, outage) {
  const id = f.idValue.trim().toUpperCase().replace(/\s/g, ''); const steps = []; const add = (key, label, state, detail) => steps.push({ key, label, state, detail });
  const fmtOk = f.idType === 'npi' ? npiValid(id) : /^[A-Z]{2,4}-[A-Z]{2}-\d{5}$/.test(id);
  add('format', f.idType === 'npi' ? 'NPI format & check digit' : 'Registration number format', fmtOk ? 'pass' : 'fail',
    fmtOk ? (f.idType === 'npi' ? `10 digits; Luhn check digit ${id.slice(-1)} is valid.` : 'Matches the council’s number format.') : (f.idType === 'npi' ? 'An NPI has 10 digits ending in a Luhn check digit (with prefix 80840). This number fails the check.' : 'Expected a format like SYN-MC-12345.'));
  const request = `GET /v1/providers?${f.idType === 'npi' ? 'number' : 'council_reg'}=${encodeURIComponent(id)}`;
  if (fmtOk && outage) { add('lookup', 'Registry lookup', 'error', 'The registry didn’t answer within 8 s (simulated outage). No decision was made; try again later.'); return { outcome: 'pending', steps, request, response: '504 Gateway Timeout' }; }
  const rec = fmtOk ? REGISTRY.find(r => (f.idType === 'npi' ? r.npi : r.council) === id) : null;
  if (fmtOk) add('lookup', 'Registry record found', rec ? 'pass' : 'fail', rec ? `${rec.type} · NPI ${rec.npi} · council reg. ${rec.council}.` : 'No provider with this identifier exists in the registry.');
  if (rec) {
    add('name', 'Legal name matches registry', nameMatches(f.legalName, rec.name) ? 'pass' : 'fail', `Registry: ${rec.name}. Submitted: ${f.legalName.trim()}.`);
    const expired = parseDay(rec.expires) < new Date();
    add('license', 'Licence active and in date', rec.status === 'active' && !expired ? 'pass' : 'fail', rec.status !== 'active' ? `Status ${rec.status.toUpperCase()}. ${rec.note || ''}`.trim() : expired ? `Licence expired on ${fmtDate(rec.expires)}.` : `Active until ${fmtDate(rec.expires)}.`);
    const a = normOrg(f.specialty), b = normOrg(rec.specialty);
    add('specialty', 'Board certification / specialty', a && (a.includes(b) || b.includes(a)) ? 'pass' : 'fail', `Registry: ${rec.board}. Submitted: ${f.specialty.trim()}.`);
    const aff = rec.affiliations.some(x => normOrg(x) === normOrg(f.affiliation) || normOrg(f.affiliation).includes(normOrg(x)));
    add('affiliation', 'Practice / hospital affiliation', aff ? 'pass' : 'fail', `Registry: ${rec.affiliations.join(', ')}. Submitted: ${f.affiliation.trim()}.`);
    const other = db.users.find(u => u.id !== me.id && u.role === 'doctor' && (u.profile.npi === rec.npi || (u.profile.regNo || '').toUpperCase() === rec.council));
    add('unique', 'Not linked to another account', other ? 'fail' : 'pass', other ? `This licence already belongs to MediTrace account ${other.id}. Possible impersonation: flagged for administrator review.` : 'No other MediTrace account uses this licence.');
  }
  add('document', 'Licence / identity document', f.doc ? 'pass' : 'fail', f.doc ? `${f.doc.name} stored for an administrator spot-check. It isn’t machine-read in this demo.` : 'Upload a photo of your medical licence or government photo ID.');
  const response = rec ? JSON.stringify({ number: rec.npi, council_reg: rec.council, name: rec.name, type: rec.type, taxonomy: rec.specialty, board: rec.board, affiliations: rec.affiliations, license_status: rec.status, expires: rec.expires }, null, 2) : fmtOk ? '{ "result_count": 0 }' : '400 Bad Request (invalid identifier)';
  return { outcome: steps.every(s => s.state === 'pass') ? 'verified' : 'flagged', steps, request, response, rec };
}

const STEP_META = { pass: ['text-ok', CheckCircle2], fail: ['text-crit', XCircle], error: ['text-high', AlertTriangle], wait: ['text-muted', CircleDashed] };

function CredentialPortal() {
  const { db, me, mutate, toast, go } = useApp();
  const p = me.profile; const st = credStatus(me); const v = p.verification;
  const [f, setF] = useState(() => ({ legalName: (v?.legalName || p.fullName || '').replace(/^Dr\.?\s+/i, ''), idType: v?.idType || 'npi', idValue: v?.idValue || p.npi || '', specialty: v?.specialty || p.specialisation || '', affiliation: v?.affiliation || orgOf(me) || '', doc: null, attest: false }));
  const [outage, setOutage] = useState(false), [errs, setErrs] = useState({}), [run, setRun] = useState(null), [shown, setShown] = useState(0), [upErr, setUpErr] = useState('');
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e && e.target ? e.target.value : e }));
  const busy = run && shown < run.steps.length;
  const submit = () => {
    const e = {};
    if (personTokens(f.legalName).length < 2) e.legalName = 'Enter your full legal name as it appears on your licence.';
    if (!f.idValue.trim()) e.idValue = f.idType === 'npi' ? 'Enter your 10-digit NPI.' : 'Enter your council registration number.';
    if (!f.specialty.trim()) e.specialty = 'Enter your board certification or specialty.';
    if (!f.affiliation.trim()) e.affiliation = 'Enter your primary practice or hospital.';
    if (!f.attest) e.attest = 'Confirm the declaration.';
    setErrs(e); if (Object.keys(e).length) return;
    const res = registryCheck(useAppDb.current, me, f, outage);
    setRun(res); setShown(0);
    mutate(n => pushAudit(n, { ...actorOf(me), action: 'CREDENTIAL_SUBMITTED', item: me.id, detail: `Submitted ${f.idType === 'npi' ? 'NPI' : 'council registration'} ${f.idValue.trim()} for registry verification (${f.specialty.trim()}, ${f.affiliation.trim()})${f.doc ? `, with document ${f.doc.name}` : ', no document'}.` }), { silent: true });
    let i = 0; const t = setInterval(() => { i++; setShown(i); if (i >= res.steps.length) { clearInterval(t); finish(res); } }, 420);
  };
  const finish = (res) => {
    const at = nowISO(); const fails = res.steps.filter(s => s.state !== 'pass');
    mutate(n => {
      const u = n.users.find(x => x.id === me.id);
      const rec = { idType: f.idType, idValue: f.idValue.trim().toUpperCase(), legalName: f.legalName.trim(), specialty: f.specialty.trim(), affiliation: f.affiliation.trim(), doc: f.doc ? { name: f.doc.name, size: f.doc.size, type: f.doc.type, dataUrl: f.doc.dataUrl } : null, steps: res.steps, outcome: res.outcome, at, registry: 'Synthetic provider registry (simulated NPPES / medical council API)' };
      u.profile.verificationHistory = [...(u.profile.verificationHistory || []), { at, outcome: res.outcome, idValue: rec.idValue }];
      u.profile.verification = rec;
      if (res.outcome !== 'pending') u.profile.credential = res.outcome;
      if (res.outcome === 'verified') { if (f.idType === 'npi') { u.profile.npi = rec.idValue; u.profile.regNo = res.rec.council; } else { u.profile.regNo = rec.idValue; u.profile.npi = res.rec.npi; } }
      const action = { verified: 'CREDENTIAL_VERIFIED', flagged: 'CREDENTIAL_FLAGGED', pending: 'CREDENTIAL_CHECK_DEFERRED' }[res.outcome];
      pushAudit(n, { ...SYS, actor: 'Registry check (simulated)', action, item: me.id, detail: res.outcome === 'verified' ? `${p.fullName}: all ${res.steps.length} checks passed against the synthetic registry. Status: VERIFIED CLINICIAN - ACTIVE.` : res.outcome === 'flagged' ? `${p.fullName}: FLAGGED / UNVERIFIED. Failed: ${fails.map(s => s.label).join('; ')}. Critical actions stay blocked.` : `${p.fullName}: registry unavailable; status remains PENDING VERIFICATION.` });
      notify(n, me.id, { type: 'credentials', title: res.outcome === 'verified' ? 'Licence verified: VERIFIED CLINICIAN - ACTIVE' : res.outcome === 'flagged' ? 'Licence check flagged your account' : 'Licence check couldn’t finish', body: res.outcome === 'verified' ? 'Prescription verification, reconciliation sign-off and full patient identifiers are now available.' : res.outcome === 'flagged' ? fails.map(s => s.label).join(' · ') : 'The registry didn’t respond. Your status stays pending; try again.', priority: res.outcome === 'verified' ? 'normal' : 'high', link: 'credentials' });
    });
    toast({ verified: 'Licence verified. Clinical actions unlocked.', flagged: 'Verification flagged. Critical actions stay blocked.', pending: 'Registry unavailable. Status stays pending.' }[res.outcome]);
  };
  const onFile = async (e) => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; setUpErr(''); try { const d = await readUpload(file); setF(s => ({ ...s, doc: d })); } catch (x) { setUpErr(x.message); } };
  const useRow = (r) => { setF(s => ({ ...s, legalName: r.name, idType: 'npi', idValue: r.npi, specialty: r.specialty, affiliation: r.affiliations[0] })); setRun(null); setErrs({}); };
  const E = (k) => errs[k];
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Anti-impersonation" title="Physician onboarding & licence verification" sub="Before you can sign off reconciliations, override discrepancies, verify prescriptions or see full patient identifiers, your licence is checked against the provider registry." />
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface card-shadow p-4" id="cred-status">
        <span className={`grid h-12 w-12 place-items-center rounded-2xl ${st === 'verified' ? 'bg-ok/15 text-ok' : st === 'flagged' ? 'bg-crit/15 text-crit' : 'bg-high/15 text-high'}`}>{st === 'verified' ? <BadgeCheck size={24} /> : st === 'flagged' ? <ShieldAlert size={24} /> : <Clock size={24} />}</span>
        <div className="min-w-0 flex-1"><div className="eyebrow">Your verification status</div><div className="mt-0.5"><CredentialBadge u={me} className="text-[12.5px] px-2.5 py-1" /></div>
          <div className="text-[12.5px] text-muted mt-1">{v ? `Last registry check ${fmtTs(v.at)} · ${v.idType === 'npi' ? 'NPI' : 'Council reg.'} ${v.idValue}` : 'Not checked yet.'}</div></div>
        {st === 'verified' && <div className="text-[12.5px] text-muted max-w-[42ch]">Licences are re-checked on a schedule in production. Re-run the check below if your details change.</div>}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Panel className="xl:col-span-3 min-w-0" title="Provider details" icon={Stethoscope}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Full legal name" id="cv-name" required error={E('legalName')} className="sm:col-span-2" hint="As printed on your licence. Titles like “Dr.” are ignored."><input id="cv-name" className={inputCls} value={f.legalName} onChange={set('legalName')} autoComplete="name" /></Field>
            <Field label="Identifier type" id="cv-type" required><select id="cv-type" className={inputCls} value={f.idType} onChange={set('idType')}><option value="npi">National Provider Identifier (NPI)</option><option value="council">State Medical Council / Board registration</option></select></Field>
            <Field label={f.idType === 'npi' ? 'NPI (10 digits)' : 'Council registration number'} id="cv-id" required error={E('idValue')}><input id="cv-id" className={inputCls + ' font-mono'} inputMode={f.idType === 'npi' ? 'numeric' : 'text'} value={f.idValue} onChange={set('idValue')} placeholder={f.idType === 'npi' ? '1992401418' : 'SYN-MC-48302'} /></Field>
            <Field label="Board certification / specialty" id="cv-spec" required error={E('specialty')}><input id="cv-spec" className={inputCls} value={f.specialty} onChange={set('specialty')} placeholder="e.g. Cardiology" /></Field>
            <Field label="Primary practice / hospital affiliation" id="cv-aff" required error={E('affiliation')}><input id="cv-aff" className={inputCls} value={f.affiliation} onChange={set('affiliation')} placeholder="e.g. Harbor General Hospital" /></Field>
            <Field label="Medical licence or photo ID" id="cv-doc" optional={false} className="sm:col-span-2" hint="JPG, PNG or WebP. Stored with your verification record for an administrator spot-check." error={upErr}>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-line bg-surface px-3 py-1.5 text-[13.5px] hover:bg-raised"><Upload size={14} />{f.doc ? 'Replace file' : 'Upload document'}<input id="cv-doc" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={onFile} /></label>
                {f.doc ? <span className="flex items-center gap-2 text-[12.5px]"><img src={f.doc.dataUrl} alt="" className="h-10 w-14 rounded object-cover ring-1 ring-line" /><span className="font-semibold">{f.doc.name}</span><span className="text-muted">{Math.round(f.doc.size / 1024)} KB</span></span> : <span className="text-[12.5px] text-muted">No file chosen</span>}
              </div></Field>
          </div>
          <div className="mt-3 grid gap-2">
            <Check2 id="cv-attest" checked={f.attest} onChange={(x) => setF(s => ({ ...s, attest: x }))} label="I declare these details are mine and accurate." desc="Using another clinician’s identity is impersonation. Every submission is recorded with your account, device and time." />
            {E('attest') && <span className="text-[12px] text-crit">{E('attest')}</span>}
            <Check2 id="cv-outage" checked={outage} onChange={setOutage} label="Demo: simulate a registry outage" desc="Shows what happens when the registry can’t be reached: the status stays PENDING and nothing unlocks." />
          </div>
          <Btn kind="primary" size="lg" className="mt-3" disabled={busy} onClick={submit}><ScanLine size={16} />{busy ? 'Checking registry…' : 'Verify against registry'}</Btn>
        </Panel>
        <div className="xl:col-span-2 grid gap-4 content-start min-w-0">
          <Panel title="Registry check" icon={Server} right={<span className="text-[11px] text-muted">simulated API</span>}>
            {!run && !v && <p className="text-[13px] text-muted">Submit your details to run the check.</p>}
            {(run || v) && (() => { const r = run || { steps: v.steps, request: null, response: null, outcome: v.outcome }; const done = !run || shown >= r.steps.length; return <div className="grid gap-2" id="cv-steps">
              {r.request && <div className="rounded-lg bg-raised px-2 py-1 font-mono text-[11.5px] break-all"><span className="text-accent font-semibold">→</span> {r.request}</div>}
              <ul className="grid gap-1.5">{r.steps.map((s, i) => { const vis = !run || i < shown; const [c, I] = STEP_META[vis ? s.state : 'wait']; return <li key={s.key} className="flex items-start gap-2 text-[12.5px]" data-step={s.key} data-state={vis ? s.state : 'wait'}><I size={15} className={`mt-0.5 shrink-0 ${c} ${!vis && run && i === shown ? 'animate-spin' : ''}`} /><div className="min-w-0"><div className="font-semibold">{s.label}</div>{vis && <div className="text-muted">{s.detail}</div>}</div></li>; })}</ul>
              {done && <div className={`rounded-xl p-2.5 text-[13px] font-semibold ring-1 ${CRED_META[r.outcome === 'verified' ? 'verified' : r.outcome === 'flagged' ? 'flagged' : 'pending'].cls}`} id="cv-outcome">Result: [{r.outcome === 'verified' ? 'VERIFIED CLINICIAN - ACTIVE' : r.outcome === 'flagged' ? 'FLAGGED / UNVERIFIED' : 'PENDING VERIFICATION'}]</div>}
              {done && r.response && <details className="text-[11.5px]"><summary className="cursor-pointer text-muted">Registry response</summary><pre className="mt-1 max-h-48 overflow-auto rounded-lg bg-raised p-2 font-mono text-[11px] whitespace-pre-wrap break-all">{r.response}</pre></details>}
            </div>; })()}
          </Panel>
          <Panel title="Synthetic registry (demo)" icon={Globe}>
            <p className="text-[12px] text-muted mb-2">No real registry is contacted. These synthetic providers stand in for NPPES / medical council records. Choose one to fill the form.</p>
            <ul className="grid gap-1.5">{REGISTRY.map(r => { const taken = db.users.find(u => u.id !== me.id && u.role === 'doctor' && u.profile.npi === r.npi); const exp = parseDay(r.expires) < new Date(); const res = taken ? 'Flagged: already linked to another account' : r.status !== 'active' ? `Flagged: licence ${r.status}` : exp ? 'Flagged: licence expired' : 'Verifies if your details match';
              return <li key={r.npi}><button onClick={() => useRow(r)} className="w-full text-left rounded-xl border border-line px-2.5 py-2 hover:bg-raised/60 grid gap-0.5"><span className="flex flex-wrap items-center gap-x-2"><span className="font-semibold text-[13px]">{r.name}</span><span className="text-[11.5px] text-muted">{r.type} · {r.specialty}</span></span><span className="font-mono text-[11.5px] text-muted">NPI {r.npi} · {r.council}</span><span className={`text-[11.5px] ${/Verifies/.test(res) ? 'text-ok' : 'text-crit'}`}>{res}</span></button></li>; })}</ul>
          </Panel>
        </div>
      </div>
      {(p.verificationHistory || []).length > 0 && <Panel title="Verification history" icon={History}><ul className="grid gap-1 text-[12.5px]">{[...p.verificationHistory].reverse().map((h, i) => <li key={i} className="flex flex-wrap gap-2 border-b border-line/60 py-1"><span className="font-mono text-muted tnum">{fmtTs(h.at)}</span><span className="font-mono">{h.idValue}</span><span className={CRED_META[h.outcome === 'verified' ? 'verified' : h.outcome === 'flagged' ? 'flagged' : 'pending'].cls + ' rounded px-1.5 font-mono text-[10.5px] font-bold ring-1'}>{h.outcome.toUpperCase()}</span></li>)}</ul></Panel>}
    </div>
  );
}

/* ───────── per-record EHR audit trail ───────── */
function RecordAuditTrail({ pid }) {
  const { db } = useApp();
  const chain = useMemo(() => verifyChain(realLog(db)), [db.log]);
  const log = db.log.filter(e => e.patientId === pid);
  return <Panel title="Immutable EHR audit trail" icon={History} right={<span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1 ${chain.ok ? 'bg-ok/10 text-ok ring-ok/30' : 'bg-crit/10 text-crit ring-crit/40'}`}><Link2 size={12} />{chain.ok ? `Chain intact · ${chain.n} entries` : `Chain broken at #${chain.at}`}</span>}>
    <p className="mb-3 text-[12.5px] text-muted">Every change and access for this record: time, user ID, the identity check behind it, and the exact clinical action. Entries can’t be edited or removed; each one is linked to the previous entry by hash.</p>
    <AuditTable log={log} limit={200} />
  </Panel>;
}

/* ───────── profile: security settings (both roles) ───────── */
function SecuritySettings() {
  const { db, me, mutate, toast } = useApp();
  const [enrolling, setEnrolling] = useState(false);
  const m = me.mfa || {}; const dev = useMemo(thisDevice, []);
  const idle = IDLE_OPTS.find(o => o[1] === idleMsFor(me))[0];
  const pid = me.role === 'patient' ? me.id : null;
  const events = db.log.filter(e => (e.actorId === me.id || e.item === me.id) && /LOGIN|LOGOUT|MFA|SESSION|DEVICE|ACCESS_DENIED|CREDENTIAL|SECURITY/.test(e.action)).slice(-10).reverse();
  const removeDev = (d) => { mutate(n => { const x = n.users.find(y => y.id === me.id); x.mfa.devices = x.mfa.devices.filter(z => z.id !== d.id); pushAudit(n, { ...actorOf(me), action: 'DEVICE_REMOVED', patientId: pid, item: d.id, detail: `Removed recognised device ${d.label}.` }); }); toast('Device removed'); };
  const setIdle = (v) => { mutate(n => { const x = n.users.find(y => y.id === me.id); x.security = { ...(x.security || {}), idle: v }; pushAudit(n, { ...actorOf(me), action: 'SECURITY_SETTING', patientId: pid, item: me.id, detail: `Idle auto-lock set to ${IDLE_OPTS.find(o => o[0] === v)[2]}.` }); }); touchIdle(true); toast('Auto-lock updated'); };
  const turnOff = () => { mutate(n => { const x = n.users.find(y => y.id === me.id); x.mfa = { ...x.mfa, enrolled: false, secret: null }; pushAudit(n, { ...actorOf(me), action: 'MFA_DISABLED', patientId: pid, item: me.id, detail: 'Patient turned off multi-factor authentication.' }); }); toast('Multi-factor authentication turned off'); };
  return (
    <Panel title="Security" icon={LockKeyhole} className="lg:col-span-3" id="security-settings">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-2 content-start">
          <div className="eyebrow">Multi-factor authentication</div>
          <div className="flex flex-wrap items-center gap-2">{m.enrolled ? <Chip tone="ok"><ShieldCheck size={11} />On · {MFA_SHORT[m.method]}</Chip> : <Chip tone="high"><ShieldOff size={11} />Off</Chip>}{isClinical(me) && <Chip tone="navy">Required for clinicians</Chip>}</div>
          {m.enrolled && <div className="text-[12px] text-muted">Turned on {fmtDate(m.enrolledAt)}</div>}
          <div className="flex flex-wrap gap-2"><Btn size="sm" onClick={() => setEnrolling(true)}><Fingerprint size={13} />{m.enrolled ? 'Change method' : 'Turn on'}</Btn>{m.enrolled && !isClinical(me) && <Btn size="sm" kind="danger" onClick={turnOff}>Turn off</Btn>}</div>
          <Field label="Auto-lock after inactivity" id="sec-idle" className="mt-1"><select id="sec-idle" className={inputCls} value={idle} onChange={e => setIdle(e.target.value)}>{IDLE_OPTS.map(([k, , l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        </div>
        <div className="grid gap-2 content-start">
          <div className="eyebrow">Recognised devices</div>
          {(m.devices || []).length === 0 ? <p className="text-[12.5px] text-muted">None yet.</p> : <ul className="grid gap-1.5">{m.devices.map(d => <li key={d.id} className="flex items-center gap-2 rounded-xl border border-line px-2.5 py-2 text-[12.5px]"><MonitorSmartphone size={15} className="shrink-0 text-muted" /><span className="min-w-0 flex-1"><span className="font-semibold">{d.label}</span>{d.id === dev.id && <span className="ml-1.5 text-[10.5px] font-bold text-accent">THIS DEVICE</span>}<span className="block text-[11px] text-muted">Last used {fmtTs(d.lastUsed)}</span></span><Btn size="sm" onClick={() => removeDev(d)}>Remove</Btn></li>)}</ul>}
        </div>
        <div className="grid gap-2 content-start min-w-0">
          <div className="eyebrow">Recent security events</div>
          <ul className="grid gap-1 text-[12px]">{events.map(e => <li key={e.seq} className="border-b border-line/60 pb-1"><span className="font-mono text-muted tnum">{fmtTs(e.ts)}</span> <span className="font-mono text-[10.5px] rounded bg-raised px-1">{e.action}</span><div className="text-fg/80 line-clamp-2">{e.detail}</div></li>)}</ul>
        </div>
      </div>
      <Modal open={enrolling} onClose={() => setEnrolling(false)} wide title={m.enrolled ? 'Change second factor' : 'Turn on multi-factor authentication'}>
        {enrolling && <MfaEnroll user={me} embedded onCancel={() => setEnrolling(false)} onEnrolled={({ method, secret, step }) => {
          mutate(n => { const x = n.users.find(y => y.id === me.id); x.mfa = { ...(x.mfa || {}), enrolled: true, method, secret, enrolledAt: nowISO(), lastStep: step || 0, failed: 0, devices: x.mfa?.devices || [] }; pushAudit(n, { ...actorOf(me), action: 'MFA_ENROLLED', patientId: pid, item: me.id, detail: `Second factor set to ${MFA_LABEL[method]}.` }); });
          CURRENT_AUTH = CURRENT_AUTH && { ...CURRENT_AUTH }; setEnrolling(false); toast(`Second factor set: ${MFA_SHORT[method]}`); }} />}
      </Modal>
    </Panel>
  );
}
