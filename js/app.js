/* MediTrace app shell: storage, session, role-based navigation, notifications centre, access-expiry watcher. */
const NOTE_ICON = { 'access-request': KeyRound, 'access-approved': Unlock, 'access-declined': Ban, 'access-revoked': Lock, 'access-expired': Timer, 'rx-uploaded': Upload, 'rx-awaiting': ClipboardCheck, 'rx-verified': BadgeCheck, 'rx-rejected': XCircle, clarification: MessageSquareWarning, 'clarification-received': MessageSquareWarning, reminder: BellRing, 'pending-checklist': ListChecks, history: BookOpen, discrepancy: Flag, review: ClipboardList, welcome: CheckCircle2, credentials: BadgeCheck, escalation: ShieldAlert, security: LockKeyhole };

function NotificationRow({ n, go, compact, onOpen }) {
  const { mutate } = useApp();
  const I = NOTE_ICON[n.type] || Bell;
  const open = () => { if (!n.read) mutate(d => { const x = d.notifications.find(y => y.id === n.id); if (x) x.read = true; }, { silent: true }); onOpen && onOpen(); if (n.link) go(n.link, n.ref); };
  return (
    <li>
      <button onClick={open} className={`w-full text-left flex items-start gap-3 rounded-xl px-3 py-2.5 transition hover:bg-raised/60 ${n.read ? '' : 'bg-accent/[.06]'}`}>
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${n.priority === 'high' ? 'bg-crit/10 text-crit' : 'bg-accent/10 text-accent'}`}><I size={15} /></span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2"><span className={`text-[13.5px] ${n.read ? 'font-medium' : 'font-bold'}`}>{n.title}</span>{!compact && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${PRIORITY[n.priority].cls}`}>{PRIORITY[n.priority].label}</span>}</span>
          {n.body && <span className="block text-[12.5px] text-muted line-clamp-2">{n.body}</span>}
          <span className="block text-[11px] text-muted mt-0.5 font-mono tnum">{fmtTs(n.at)} · {relTime(n.at)}</span>
        </span>
        {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" aria-label="Unread"></span>}
      </button>
    </li>
  );
}

function NotificationsPage({ go }) {
  const { db, me, mutate } = useApp();
  const [f, setF] = useState('all');
  const mine = db.notifications.filter(n => n.userId === me.id);
  const list = mine.filter(n => f === 'all' || (f === 'unread' ? !n.read : n.priority === 'high'));
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Inbox" title="Notifications" sub="Generated from real events in MediTrace: access decisions, uploads, verifications, reminders and history updates." actions={<Btn disabled={!mine.some(n => !n.read)} onClick={() => mutate(d => d.notifications.forEach(n => { if (n.userId === me.id) n.read = true; }), { silent: true })}><Check size={14} />Mark all as read</Btn>} />
      <Segmented label="Filter notifications" value={f} onChange={setF} options={[['all', 'All', mine.length], ['unread', 'Unread', mine.filter(n => !n.read).length], ['high', 'High priority', mine.filter(n => n.priority === 'high').length]]} />
      <Panel pad={false}>{list.length === 0 ? <div className="p-4"><Empty icon={Bell} title="No notifications" /></div> : <ul className="grid gap-0.5 p-2">{list.map(n => <NotificationRow key={n.id} n={n} go={go} />)}</ul>}</Panel>
    </div>
  );
}

function Bellmenu({ go }) {
  const { db, me } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h); }, [open]);
  const mine = db.notifications.filter(n => n.userId === me.id); const unread = mine.filter(n => !n.read).length;
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open} className="relative grid h-9 w-9 place-items-center rounded-xl border border-line bg-surface hover:bg-raised">
        <Bell size={17} />{unread > 0 && <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-crit px-1 text-[10px] font-bold text-white tnum">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <div className="pop absolute right-0 top-11 z-40 w-[min(380px,calc(100vw-32px))] rounded-2xl border border-line bg-surface card-shadow shadow-xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5"><span className="font-display font-bold">Notifications</span><span className="text-[12px] text-muted">{unread} unread</span></div>
        {mine.length === 0 ? <p className="p-4 text-[13px] text-muted">Nothing yet.</p> : <ul className="max-h-[60vh] overflow-auto p-1.5 grid gap-0.5">{mine.slice(0, 7).map(n => <NotificationRow key={n.id} n={n} go={go} compact onOpen={() => setOpen(false)} />)}</ul>}
        <div className="border-t border-line p-2"><Btn className="w-full" onClick={() => { setOpen(false); go('notifications'); }}>Open notification centre</Btn></div>
      </div>}
    </div>
  );
}

const PATIENT_NAV = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['checklist', 'Daily checklist', ListChecks], ['medicines', 'Verified medicines', ShieldCheck], ['prescriptions', 'Prescriptions', FileText],
  ['history', 'Medical history', BookOpen], ['access', 'Access requests', KeyRound], ['notifications', 'Notifications', Bell], ['activity', 'Activity log', History], ['profile', 'Profile', UserRound],
];
const DOCTOR_NAV = [
  ['dashboard', 'Dashboard', LayoutDashboard], ['analytics', 'Analytics', Activity], ['request', 'Request patient access', KeyRound], ['patients', 'My patients', Users], ['verify', 'Prescription verification', ClipboardCheck],
  ['recon', 'Reconciliation', GitCompareArrows], ['review', 'Review queue', ClipboardList], ['surge', 'Surge capacity', Activity], ['credentials', 'Credential verification', BadgeCheck], ['notifications', 'Notifications', Bell], ['profile', 'Profile', Stethoscope],
];

function Sidebar({ view, go, onLogout, onReset, close }) {
  const { db, me, now } = useApp();
  const navs = me.role === 'patient' ? PATIENT_NAV : DOCTOR_NAV;
  const badge = (k) => {
    const unread = db.notifications.filter(n => n.userId === me.id && !n.read).length;
    if (k === 'notifications') return unread;
    if (k === 'credentials') return isVerifiedClinician(me) ? 0 : 1;
    if (me.role === 'patient') { if (k === 'access') return db.grants.filter(g => g.patientId === me.id && g.status === 'pending').length; if (k === 'prescriptions') return db.prescriptions.filter(r => r.patientId === me.id && ['clarification', 'rejected'].includes(r.status) && !r.replacedBy).length; if (k === 'checklist') { const d = dosesOn(verifiedMeds(db, me.id).released, ymd()); return dayStats(db, me.id, ymd(), d).pending; } }
    else { const ps = authorisedPatients(db, me.id, now).filter(p => canAccess(db, me.id, p.id, 'prescriptions', now)).map(p => p.id); if (k === 'verify') return db.prescriptions.filter(r => r.kind !== 'handover' && ps.includes(r.patientId) && ['pending', 'discrepancy', ...RX_ON_HOLD].includes(r.status)).length; if (k === 'review') return reconMedsFor(db, medsAccessPatients(db, me.id, now)).filter(m => ['open', 'decided'].includes(db.recon.items[m.id]?.status) && m.severity !== 'none').length; }
    return 0;
  };
  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-2"><button onClick={() => go('dashboard')} aria-label="MediTrace dashboard"><Logo imgClass="w-[196px]" /></button>{close && <button onClick={close} aria-label="Close menu" className="rounded-lg p-1.5 text-muted hover:bg-raised lg:hidden"><X size={18} /></button>}</div>
      <div className="flex items-center gap-2.5 rounded-xl bg-raised/60 p-2.5"><Avatar name={me.profile.fullName} size={34} tone={me.role === 'doctor' ? 'navy' : 'accent'} /><div className="min-w-0"><div className="text-[13.5px] font-semibold truncate">{me.profile.fullName}</div><div className="text-[11.5px] text-muted truncate">{roleLabel(me)} · <span className="font-mono">{me.id}</span></div></div></div>
      <nav aria-label="Main" className="grid gap-0.5">
        <div className="eyebrow px-2 pb-1">{me.role === 'patient' ? 'Patient portal' : 'Professional portal'}</div>
        {navs.map(([k, l, I]) => { const b = badge(k); return (
          <button key={k} onClick={() => go(k)} aria-current={view === k ? 'page' : undefined} className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13.5px] transition ${view === k ? 'bg-accent/10 text-accent font-bold' : 'text-fg/85 hover:bg-raised'}`}>
            <I size={16} /><span className="flex-1 text-left">{l}</span>{b > 0 && <span className={`rounded-full px-1.5 text-[10.5px] font-bold tnum ${k === 'notifications' ? 'bg-crit text-white' : 'bg-high/20 text-high'}`}>{b}</span>}
          </button>); })}
      </nav>
      <div className="mt-auto grid gap-2">
        <div className="rounded-xl border border-mod/40 bg-mod/10 p-2.5 text-[11px] text-fg/80">Demo prototype · synthetic data · stored in this browser only. Not a secure medical record system.</div>
        <div className="flex gap-2"><Btn size="sm" className="flex-1" onClick={onLogout}><LogOut size={13} />Sign out</Btn><Btn size="sm" onClick={onReset} title="Reset demo data"><RotateCcw size={13} /></Btn></div>
      </div>
    </div>
  );
}

function ReminderEngine() { const { me } = useApp(); useReminderEngine(me); return null; }

const TITLES = { dashboard: 'Dashboard', checklist: 'Daily checklist', medicines: 'Verified medicines', prescriptions: 'Prescriptions', history: 'Medical history', access: 'Access requests', notifications: 'Notifications', activity: 'Activity log', profile: 'Profile', request: 'Request patient access', patients: 'My patients', verify: 'Prescription verification', recon: 'Reconciliation', review: 'Review queue', surge: 'Surge capacity', analytics: 'Clinical analytics', credentials: 'Credential verification' };

function App() {
  const [db, setDb] = useState(null);
  const dbRef = useRef(null);
  const [session, setSession] = useState(() => { const s = readSession(); if (s) { const l = readIdle(); IDLE.last = l && l <= Date.now() ? l : Date.now(); } return s; });
  const [notice, setNotice] = useState(null);
  const [denied, setDenied] = useState(null);
  const [nav, setNav] = useState(() => ({ view: (location.hash || '').slice(1) || 'dashboard', ref: null, n: 0 }));
  const [toasts, setToasts] = useState([]);
  const [now, setNow] = useState(Date.now());
  const [drawer, setDrawer] = useState(false);
  const [resetAsk, setResetAsk] = useState(false);
  const [theme, toggleTheme] = useTheme();
  const [loadErr, setLoadErr] = useState(null);

  const toast = useCallback((msg) => { const id = Math.random(); setToasts(t => [...t.slice(-2), { id, msg }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3200); }, []);
  const mutate = useCallback((fn, opts = {}) => {
    const next = typeof structuredClone === 'function' ? structuredClone(dbRef.current) : JSON.parse(JSON.stringify(dbRef.current));
    fn(next); dbRef.current = next; useAppDb.current = next; setDb(next);
    if (!saveDb(next) && !opts.silent) toast('Couldn’t save to browser storage (it may be full). Changes last until you reload.');
  }, [toast]);

  useEffect(() => { loadDb().then(d => { dbRef.current = d; useAppDb.current = d; setDb(d); }).catch(e => setLoadErr(String(e))); }, []);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 15000); return () => clearInterval(t); }, []);
  useEffect(() => { const f = () => setNav(n => ({ view: (location.hash || '').slice(1) || 'dashboard', ref: null, n: n.n + 1 })); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);

  // Absolute session expiry (8 h). The idle lock is handled by SessionTimer in the security bar.
  useEffect(() => { if (session && session.exp <= now) endSession('SESSION_EXPIRED', 'Your 8-hour session ended. Sign in again.'); }, [now]);
  // Access expiry: expired permissions stop working immediately (grantState); this records the event once.
  useEffect(() => {
    if (!db) return;
    const exp = db.grants.filter(g => g.status === 'approved' && grantState(g, now) === 'expired');
    if (!exp.length) return;
    mutate(n => exp.forEach(g0 => { const g = n.grants.find(x => x.id === g0.id); g.status = 'expired'; g.expiredAt = nowISO(); const d = userById(n, g.doctorId), p = userById(n, g.patientId);
      pushAudit(n, { ...SYS, action: 'ACCESS_EXPIRED', patientId: g.patientId, item: g.id, detail: `${d.profile.fullName}'s access (${g.scopes.map(s => SCOPE[s].label).join(', ')}) expired.` });
      notify(n, d.id, { type: 'access-expired', title: 'Access permission expired', body: `Your access to ${p.profile.fullName}'s records has ended.`, priority: 'normal', link: 'patients' });
      notify(n, p.id, { type: 'access-expired', title: `${d.profile.fullName}'s access expired`, body: 'They can no longer see your records.', priority: 'low', link: 'access' }); }), { silent: true });
  }, [db && db.grants, now]);

  setCurrentAuth(session);
  const me0 = db && session ? userById(db, session.userId) : null;
  // A clinical session is only valid once a second factor was verified (older or tampered sessions are dropped).
  const me = me0 && (!mfaRequired(me0) || MFA_METHODS.includes(session.auth?.method)) ? me0 : null;
  useEffect(() => { if (db && session && !me) { writeSession(null); setSession(null); if (me0) setNotice('Professional sessions need multi-factor authentication. Sign in again.'); } }, [db, session, me]);
  // Activity resets the idle clock, except during the final-minute warning, which needs an explicit "Stay signed in".
  useEffect(() => {
    if (!me) return; const ms = idleMsFor(me);
    const h = () => { if (ms - (Date.now() - IDLE.last) > IDLE.warn) touchIdle(); };
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];
    evs.forEach(e => window.addEventListener(e, h, { passive: true })); return () => evs.forEach(e => window.removeEventListener(e, h));
  }, [me && me.id, me && me.security?.idle]);
  const masked = !!me && me.role === 'doctor' && !isVerifiedClinician(me);
  const viewDb = useMemo(() => masked ? maskedView(db) : db, [db, masked]);
  // Access-control enforcer: critical actions run only for verified clinicians; every refusal is audited.
  const guard = useCallback((action, fn, patientId) => {
    if (me && me.role === 'doctor' && !isVerifiedClinician(me)) {
      setDenied({ action });
      mutate(n => pushAudit(n, { ...actorOf(me), action: 'ACCESS_DENIED', patientId: patientId || null, item: me.id, detail: `Blocked: ${action}. ${BLOCK_MSG} Status: ${CRED_META[credStatus(me)].label}.` }), { silent: true });
      return false;
    }
    fn && fn(); return true;
  }, [me]);
  const go = useCallback((view, ref) => { setNav(n => ({ view, ref: ref || null, n: n.n + 1 })); try { history.replaceState(null, '', '#' + view); } catch (e) {} setDrawer(false); window.scrollTo({ top: 0 }); }, []);
  const ctx = useMemo(() => ({ db: viewDb, mutate, me, toast, go, now, guard, masked, session }), [viewDb, me, now, guard, masked, session]);

  const onAuthed = (userId, auth) => { const s = { userId, exp: Date.now() + SESSION_MS, auth: auth || { method: 'password', at: nowISO() } }; touchIdle(true); writeSession(s); setSession(s); setNotice(null); go('dashboard'); const u = userById(dbRef.current, userId); toast(`Signed in as ${u.profile.fullName}`); };
  function endSession(action, msg) {
    const u = session && userById(dbRef.current, session.userId);
    if (u) mutate(n => pushAudit(n, { ...actorOf(u), action, patientId: u.role === 'patient' ? u.id : null, item: u.id, detail: action === 'LOGOUT' ? 'Signed out.' : action === 'SESSION_TIMEOUT' ? `Session locked after ${Math.round(idleMsFor(u) / MIN)} minutes without activity.` : 'Session reached its 8-hour limit.' }), { silent: true });
    writeSession(null); setSession(null); CURRENT_AUTH = null; setNotice(msg || null); setDenied(null); setNav({ view: 'dashboard', ref: null, n: 0 }); try { history.replaceState(null, '', '#'); } catch (e) {}
  }
  const logout = () => endSession('LOGOUT');
  const onIdle = () => endSession('SESSION_TIMEOUT', 'You were signed out after a period of inactivity to protect patient information.');
  const doReset = async () => { const d = await seedDb(); dbRef.current = d; useAppDb.current = d; setDb(d); saveDb(d); writeSession(null); setSession(null); setResetAsk(false); toast('Demo data reset to the original synthetic records'); };

  if (loadErr) return <div className="p-8 text-crit">MediTrace couldn’t start: {loadErr}</div>;
  if (!db) return <div id="boot"><div><div className="plate"><img src="assets/logo.jpg" alt="MediTrace" /></div><div className="bar"></div><p>Preparing secure demo workspace…</p></div></div>;

  const Toasts = () => <div className="fixed z-[60] left-1/2 -translate-x-1/2 grid gap-2 w-[min(460px,calc(100vw-32px))]" style={{ bottom: 'calc(18px + env(safe-area-inset-bottom, 0px))' }} role="status" aria-live="polite">{toasts.map(t => <div key={t.id} className="pop flex items-center gap-2 rounded-xl bg-navy text-white dark:bg-raised dark:text-fg px-4 py-2.5 text-[13.5px] shadow-lg"><CheckCircle2 size={15} className="shrink-0 text-[rgb(62_196_204)]" />{t.msg}</div>)}</div>;

  if (!me) return (
    <AppCtx.Provider value={ctx}>
      <div className="fixed right-4 z-30" style={{ top: 'calc(12px + env(safe-area-inset-top, 0px))' }}><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
      <AuthScreen onAuthed={onAuthed} notice={notice} />
      <Toasts />
    </AppCtx.Provider>
  );

  const allowed = (me.role === 'patient' ? PATIENT_NAV : DOCTOR_NAV).map(x => x[0]);
  const view = allowed.includes(nav.view) ? nav.view : 'dashboard';
  const page = me.role === 'patient' ? {
    dashboard: <PatientDashboard go={go} />, checklist: <ChecklistPage go={go} />, medicines: <div className="grid gap-4"><PageHead eyebrow="Patient-safe view" title="Verified medicines" sub="Instructions confirmed by healthcare professionals, in plain language." /><PatientSafeView pid={me.id} /></div>,
    prescriptions: <PrescriptionsPage nav={nav} />, history: <MedicalHistory pid={me.id} nav={nav} />, access: <AccessPage />, notifications: <NotificationsPage go={go} />, activity: <ActivityPage />, profile: <PatientProfile />,
  }[view] : {
    dashboard: <DoctorDashboard go={go} />, request: <RequestAccess nav={nav} go={go} />, patients: <PatientsPage nav={nav} go={go} />, verify: <VerifyPage nav={nav} go={go} />,
    recon: <ReconWorkspace nav={nav} go={go} />, review: <ReviewPage nav={nav} go={go} />, surge: <SurgePage />, analytics: <AnalyticsPage go={go} />, credentials: <CredentialPortal />, notifications: <NotificationsPage go={go} />, profile: <DoctorProfile />,
  }[view];

  return (
    <AppCtx.Provider value={ctx}>
      <div className="min-h-screen lg:grid lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block sticky top-0 h-screen overflow-auto border-r border-line bg-surface px-4 py-5"><Sidebar view={view} go={go} onLogout={logout} onReset={() => setResetAsk(true)} /></aside>
        {drawer && <div className="fixed inset-0 z-50 lg:hidden"><div className="absolute inset-0 bg-navy/40 dark:bg-black/60" onClick={() => setDrawer(false)}></div><aside className="pop absolute inset-y-0 left-0 w-[min(300px,86vw)] overflow-auto bg-surface px-4 py-5" style={{ paddingTop: 'calc(20px + env(safe-area-inset-top, 0px))' }}><Sidebar view={view} go={go} onLogout={logout} onReset={() => setResetAsk(true)} close={() => setDrawer(false)} /></aside></div>}
        <div className="min-w-0 flex flex-col">
          <header className="sticky z-30 border-b border-line bg-surface/85 backdrop-blur" style={{ top: 'env(safe-area-inset-top, 0px)' }}>
            <div className="gutter mx-auto flex max-w-7xl items-center gap-3 py-2.5">
              <button className="lg:hidden grid h-9 w-9 place-items-center rounded-xl border border-line" onClick={() => setDrawer(true)} aria-label="Open menu"><Menu size={18} /></button>
              <button className="lg:hidden" onClick={() => go('dashboard')} aria-label="MediTrace dashboard"><Logo variant="mark" imgClass="w-7" /></button>
              <div className="min-w-0"><div className="font-display text-[16px] font-bold truncate">{TITLES[view]}</div><div className="hidden sm:block text-[11.5px] text-muted truncate">MediTrace · Connected Medications. Continuity of Care.</div></div>
              <span className="hidden md:inline-flex ml-2 rounded-md bg-mod/15 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-mod ring-1 ring-mod/40">SYNTHETIC DATA</span>
              {me.role === 'doctor' && <span className="hidden md:inline-flex"><CredentialBadge u={me} /></span>}
              <div className="ml-auto flex items-center gap-2"><Bellmenu go={go} /><ThemeToggle theme={theme} onToggle={toggleTheme} /><button onClick={() => go('profile')} className="hidden sm:block" aria-label="Your profile"><Avatar name={me.profile.fullName} size={34} tone={me.role === 'doctor' ? 'navy' : 'accent'} /></button><Btn size="sm" className="hidden md:inline-flex" onClick={logout}><LogOut size={13} />Sign out</Btn></div>
            </div>
            <SecurityBar session={session} idleMs={idleMsFor(me)} onTimeout={onIdle} />
          </header>
          {me.role === 'patient' && <><ReminderEngine /><ReminderBanner go={go} /></>}
          {masked && <div className="gutter mx-auto w-full max-w-7xl pt-4"><LicenseBlock /></div>}
          <main className="gutter mx-auto w-full max-w-7xl flex-1 py-5" key={view}>{page}</main>
          <footer className="gutter mx-auto w-full max-w-7xl pb-8">
            <div className="flex items-start gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-[11.5px] text-muted"><Info size={14} className="shrink-0 mt-0.5" />
              <span>Clinical boundary: MediTrace is decision support for medication continuity. It traces and flags; it never writes prescriptions, changes doses or substitutes medicines, and nothing is released to patients without professional verification. Demo limitations: sign-in, MFA, consent and records are stored and checked in this browser’s localStorage (not encrypted, demo-grade hashing); there is no server, multi-device sync, real credential registry, email/SMS delivery or push notifications. The security banner shows which controls are live here and which are production-only. Not HIPAA/GDPR certified. All names and records are synthetic.</span></div>
          </footer>
        </div>
      </div>
      <Modal open={resetAsk} onClose={() => setResetAsk(false)} title="Reset demo data?" footer={<><Btn onClick={() => setResetAsk(false)}>Cancel</Btn><Btn kind="danger" onClick={doReset}>Reset and sign out</Btn></>}>
        <p className="text-[13.5px]">This restores the original synthetic patients, professionals, prescriptions and audit trail, and removes accounts and changes made in this browser.</p>
      </Modal>
      <LicenseBlockModal denied={denied} onClose={() => setDenied(null)} go={go} />
      <Toasts />
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
