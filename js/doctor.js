/* Professional portal: dashboard, access requests, authorised patients, prescription verification, reconciliation. */
const maskName = (n) => n.split(/\s+/).map(p => p[0] + '.').join(' ');
/* Not verified against the registry (pending or flagged): critical actions go through the access-control enforcer. */
const credPending = (u) => u?.role === 'doctor' && !isVerifiedClinician(u);
const CredNotice = () => { const { me, go } = useApp(); return <div className="flex flex-wrap items-center gap-2 rounded-xl border border-crit/30 bg-crit/[.05] px-3 py-2 text-[12.5px]"><ShieldOff size={14} className="shrink-0 text-crit" /><b className="text-crit">{BLOCK_MSG}</b><CredentialBadge u={me} /><Btn kind="link" className="text-[12.5px]" onClick={() => go('credentials')}>Verify licence</Btn></div>; };

function NoAccess({ pid, go, reason }) {
  return <Panel><Empty icon={Lock} title="You don’t have access to this record" body={reason || 'The patient hasn’t approved a request from you, or your access was revoked or has expired. Records stay private until the patient approves.'} action={<Btn kind="primary" onClick={() => go('request', pid)}><KeyRound size={14} />Request access</Btn>} /></Panel>;
}

function RequestAccess({ nav, go }) {
  const { db, me, mutate, toast, now } = useApp();
  const [q, setQ] = useState(nav.ref || ''); const [found, setFound] = useState(null); const [err, setErr] = useState('');
  const [reason, setReason] = useState(REASONS[0]), [note, setNote] = useState(''), [scopes, setScopes] = useState([]), [dur, setDur] = useState('30d');
  const search = (e, val) => { e && e.preventDefault(); const id = (val ?? q).trim().toUpperCase(); setErr(''); setFound(null);
    if (!/^MT-P-\d{6}$/.test(id)) return setErr('Enter a patient ID in the format MT-P-123456.');
    const p = db.users.find(u => u.id === id && u.role === 'patient'); if (!p) return setErr('No patient uses that MediTrace ID. Check it with the patient.'); setFound(p); };
  useEffect(() => { if (nav.ref) { setQ(nav.ref); search(null, nav.ref); } }, [nav.n]);
  const toggle = (id) => setScopes(s => id === 'complete' ? (s.includes('complete') ? [] : ['complete']) : (s.includes(id) ? s.filter(x => x !== id) : [...s.filter(x => x !== 'complete'), id]));
  const mineReqs = db.grants.filter(g => g.doctorId === me.id).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const dup = found && db.grants.some(g => g.doctorId === me.id && g.patientId === found.id && g.status === 'pending');
  const current = found ? activeScopes(db, me.id, found.id, now) : new Set();
  const submit = () => {
    if (!found) return; if (!scopes.length) return setErr('Choose at least one type of information.'); if (dup) return setErr('You already have a pending request with this patient.');
    if (reason === 'Other' && note.trim().length < 5) return setErr('Describe the reason for your request.');
    const g = { id: uid('G'), doctorId: me.id, patientId: found.id, scopes, reason, note: note.trim(), durationId: dur, requestedAt: nowISO(), status: 'pending' };
    mutate(n => { n.grants.push(g);
      pushAudit(n, { ...actorOf(me), action: 'ACCESS_REQUEST', patientId: found.id, item: g.id, detail: `Requested: ${scopes.map(s => SCOPE[s].label).join(', ')} · ${DURATION[dur].label}. Reason: ${reason}${g.note ? ` — ${g.note}` : ''}.` });
      notify(n, found.id, { type: 'access-request', title: `New access request from ${me.profile.fullName}`, body: `${orgOf(me)} · asks for ${scopes.map(s => SCOPE[s].label).join(', ')} for ${DURATION[dur].label}.`, priority: 'high', link: 'access' }); });
    toast('Access request sent. It stays Pending until the patient decides.'); setScopes([]); setNote(''); setFound(null); setQ('');
  };
  const cancel = (g) => { mutate(n => { const x = n.grants.find(y => y.id === g.id); x.status = 'cancelled'; x.decidedAt = nowISO(); pushAudit(n, { ...actorOf(me), action: 'ACCESS_REQUEST_CANCELLED', patientId: g.patientId, item: g.id, detail: 'Professional withdrew a pending access request.' }); }); toast('Request withdrawn'); };
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Consent" title="Request Patient Access" sub="Patients control their records. Send a request with a clear reason and only the information you need; nothing is visible until the patient accepts." />
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3 min-w-0" title="New request" icon={KeyRound}>
          <form onSubmit={search} className="flex flex-wrap gap-2" noValidate>
            <Field label="Patient’s MediTrace ID" id="ra-q" className="flex-1 min-w-[200px]"><input id="ra-q" className={inputCls + ' font-mono uppercase'} value={q} onChange={e => setQ(e.target.value)} placeholder="MT-P-004812" /></Field>
            <Btn kind="navy" className="self-end" onClick={search}><Search size={14} />Find patient</Btn>
          </form>
          {err && <div role="alert" className="mt-3 rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
          {found && <div className="pop mt-4 grid gap-4">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-raised/40 p-3"><Avatar name={found.profile.fullName} /><div><div className="font-semibold">Patient {maskName(found.profile.fullName)}</div><div className="font-mono text-[12.5px] text-muted">{found.id}</div></div>
              <span className="ml-auto text-[12px] text-muted">{current.size ? `You currently have: ${[...current].filter(s => s !== 'complete').map(s => SCOPE[s].label).join(', ')}` : 'No current access. Details are hidden until approval.'}</span></div>
            {dup && <div className="rounded-xl bg-high/10 px-3 py-2 text-[13px] text-high">You already have a pending request with this patient.</div>}
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Reason for requesting access" id="ra-reason" required><select id="ra-reason" className={inputCls} value={reason} onChange={e => setReason(e.target.value)}>{REASONS.map(r => <option key={r}>{r}</option>)}</select></Field>
              <Field label="Requested access duration" id="ra-dur" required><select id="ra-dur" className={inputCls} value={dur} onChange={e => setDur(e.target.value)}>{DURATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></Field>
              <Field label="Message to the patient" id="ra-note" optional={reason !== 'Other'} required={reason === 'Other'} className="sm:col-span-2"><textarea id="ra-note" rows={2} className={inputCls} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. I’m seeing you on Thursday about your blood pressure medicines." /></Field>
            </div>
            <div><div className="text-[12.5px] font-semibold mb-2">Information required</div><div className="grid sm:grid-cols-2 gap-2">{SCOPES.map(s => <Check2 key={s.id} id={`ra-s-${s.id}`} checked={scopes.includes(s.id) || (scopes.includes('complete') && s.id !== 'complete')} disabled={scopes.includes('complete') && s.id !== 'complete'} onChange={() => toggle(s.id)} label={s.label} desc={s.id === 'complete' ? 'Everything above. Ask only if you truly need it.' : null} />)}</div></div>
            <Btn kind="primary" size="lg" disabled={dup} onClick={submit}><Send size={15} />Send access request</Btn>
          </div>}
        </Panel>
        <Panel className="lg:col-span-2 min-w-0" title="My access requests" icon={History}>
          {mineReqs.length === 0 ? <Empty icon={Inbox} title="No requests yet" /> :
          <ul className="grid gap-2">{mineReqs.map(g => { const st = grantState(g, now); const p = userById(db, g.patientId); return (
            <li key={g.id} className="rounded-xl border border-line p-3 grid gap-1.5">
              <div className="flex items-center justify-between gap-2"><span className="font-semibold text-[13.5px] truncate">{st === 'approved' ? p.profile.fullName : `Patient ${maskName(p.profile.fullName)}`} <span className="font-mono text-[11.5px] text-muted">{p.id}</span></span><GrantBadge state={st} /></div>
              <ScopeChips scopes={g.scopes} />
              <div className="text-[12px] text-muted">Requested {fmtTs(g.requestedAt)}{st === 'approved' ? ` · expires ${relTime(g.expiresAt, now)}` : ''}{g.declineReason ? ` · “${g.declineReason}”` : ''}</div>
              <div className="flex gap-2">{st === 'pending' && <Btn size="sm" onClick={() => cancel(g)}>Withdraw</Btn>}{st === 'approved' && <Btn size="sm" onClick={() => go('patients', p.id)}>Open record</Btn>}{['declined', 'expired', 'revoked', 'cancelled'].includes(st) && <Btn size="sm" onClick={() => { setQ(p.id); search(null, p.id); }}>Request again</Btn>}</div>
            </li>); })}</ul>}
        </Panel>
      </div>
    </div>
  );
}

function PatientsPage({ nav, go }) {
  const { db, me, now } = useApp();
  const [sel, setSel] = useState(nav.ref || null);
  useEffect(() => { if (nav.ref) setSel(nav.ref); }, [nav.n]);
  const auth = authorisedPatients(db, me.id, now);
  const past = [...new Set(db.grants.filter(g => g.doctorId === me.id && ['revoked', 'expired'].includes(grantState(g, now))).map(g => g.patientId))].filter(id => !auth.some(p => p.id === id)).map(id => userById(db, id));
  if (sel) return <PatientRecord pid={sel} go={go} back={() => setSel(null)} />;
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Care team" title="My patients" sub="Only patients who have approved your access appear here, and only for what they shared." actions={<Btn kind="primary" onClick={() => go('request')}><KeyRound size={14} />Request access</Btn>} />
      {auth.length === 0 ? <Empty icon={Users} title="No authorised patients" body="Ask a patient for their MediTrace ID, then send an access request." /> :
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{auth.map(p => { const s = activeScopes(db, me.id, p.id, now); const g = db.grants.filter(x => x.doctorId === me.id && x.patientId === p.id && grantState(x, now) === 'approved').sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0]; return (
        <button key={p.id} onClick={() => setSel(p.id)} className="text-left rounded-2xl border border-line bg-surface card-shadow p-4 grid gap-3 hover:border-accent/50 transition min-w-0">
          <div className="flex items-center gap-3"><Avatar name={p.profile.fullName} /><div className="min-w-0"><div className="font-semibold truncate">{p.profile.fullName}</div><div className="font-mono text-[12px] text-muted">{p.id}</div></div><ChevronRight size={16} className="ml-auto text-muted" /></div>
          <ScopeChips scopes={s.has('complete') ? ['complete'] : [...s]} />
          <div className="text-[12px] text-muted">Access expires {relTime(g.expiresAt, now)}</div>
        </button>); })}</div>}
      {past.length > 0 && <Panel title="Access ended" icon={Lock}><ul className="grid gap-2">{past.map(p => <li key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-line p-3"><Lock size={15} className="text-muted" /><span className="font-semibold">Patient {maskName(p.profile.fullName)}</span><span className="font-mono text-[12px] text-muted">{p.id}</span><span className="text-[12px] text-muted">Revoked or expired — records hidden</span><Btn size="sm" className="ml-auto" onClick={() => go('request', p.id)}>Request again</Btn></li>)}</ul></Panel>}
    </div>
  );
}

function PatientRecord({ pid, go, back }) {
  const { db, me, now, guard, masked } = useApp();
  const p = userById(db, pid);
  const s = activeScopes(db, me.id, pid, now);
  const [tab, setTab] = useState('summary');
  if (!p || s.size === 0) return <div className="grid gap-4"><Btn className="justify-self-start" onClick={back}><ChevronLeft size={14} />All patients</Btn><NoAccess pid={pid} go={go} /></div>;
  const g = db.grants.filter(x => x.doctorId === me.id && x.patientId === pid && grantState(x, now) === 'approved').sort((a, b) => b.expiresAt.localeCompare(a.expiresAt))[0];
  const rec = db.records[pid];
  const tabs = [['summary', 'Summary', true], ['prescriptions', 'Prescriptions', s.has('prescriptions')], ['medications', 'Medication history', s.has('medications')], ['verified', 'Verified instructions', s.has('verified')], ['history', 'Medical history', s.has('history') || s.has('visits')], ['audit', 'Audit trail', true]];
  const { released, pending } = verifiedMeds(db, pid);
  const rxs = db.prescriptions.filter(r => r.patientId === pid).sort((a, b) => b.date.localeCompare(a.date));
  const locked = (label) => <Panel><Empty icon={Lock} title={`${label} not shared with you`} body="The patient hasn’t granted this permission. Send a new request if you need it." action={<Btn onClick={() => go('request', pid)}>Request more access</Btn>} /></Panel>;
  return (
    <div className="grid gap-4">
      <Btn className="justify-self-start" onClick={back}><ChevronLeft size={14} />All patients</Btn>
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-line bg-surface card-shadow p-4">
        <Avatar name={p.profile.fullName} size={48} /><div className="min-w-0"><h1 className="font-display text-[22px] font-extrabold flex flex-wrap items-center gap-2">{p.profile.fullName}<MaskedNotice /></h1><div className="text-[13px] text-muted"><span className="font-mono">{p.id}</span>{p.profile.dob ? ` · ${ageFrom(p.profile.dob)} y` : masked ? ' · date of birth hidden' : ''}{p.profile.gender ? ` · ${p.profile.gender}` : ''}</div>
          {masked && <Btn size="sm" className="mt-1.5" onClick={() => guard('View unmasked patient identifiers', null, pid)}><Eye size={13} />Show full identifiers</Btn>}</div>
        <div className="ml-auto grid gap-1 justify-items-end"><GrantBadge state="approved" /><span className="text-[12px] text-muted">until {fmtTs(g.expiresAt)}</span></div>
      </div>
      {s.has('history') && rec.allergies.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-crit/30 bg-crit/5 px-4 py-2.5 text-[13.5px]"><AlertTriangle size={16} className="text-crit" /><b className="text-crit">Allergies:</b>{rec.allergies.map(a => <span key={a.id}>{a.substance}{a.reaction ? ` (${a.reaction})` : ''}</span>)}</div>}
      <div className="scroll-x"><div role="tablist" className="inline-flex gap-1 rounded-xl border border-line bg-surface p-1">{tabs.map(([k, l, ok]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] ${tab === k ? 'bg-raised font-semibold' : 'text-muted hover:text-fg'}`}>{!ok && <Lock size={12} />}{l}</button>)}</div></div>
      {tab === 'summary' && <div className="grid gap-4 md:grid-cols-2">
        <Panel title="What you can see" icon={ShieldCheck}><ScopeChips scopes={s.has('complete') ? ['complete'] : [...s]} /><p className="mt-2 text-[12.5px] text-muted">Granted {fmtTs(g.decidedAt)} for: {g.reason}.</p></Panel>
        <Panel title="Quick actions" icon={ArrowRight}><div className="grid gap-2">
          {s.has('prescriptions') && <Btn className="justify-start" onClick={() => go('verify')}><ClipboardCheck size={14} />Prescription verification queue</Btn>}
          {(s.has('medications') || s.has('prescriptions')) && <Btn className="justify-start" onClick={() => go('recon', pid)}><GitCompareArrows size={14} />Open reconciliation</Btn>}
          {(s.has('medications') || s.has('prescriptions')) && <Btn className="justify-start" onClick={() => go('review')}><ClipboardList size={14} />Professional review queue</Btn>}
        </div></Panel>
      </div>}
      {tab === 'prescriptions' && (!s.has('prescriptions') ? locked('Prescription records') : <Panel title="Prescription records" icon={FileText}><ul className="grid gap-2">{rxs.map(r => <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line p-3"><div className="min-w-0 flex-1"><div className="font-semibold">{r.title}</div><div className="text-[12.5px] text-muted">{fmtDate(r.date)} · {r.prescriber.name} · {r.prescriber.org}</div></div><RxBadge status={r.status} />{r.kind !== 'handover' ? <Btn size="sm" onClick={() => go('verify', r.id)}>Open</Btn> : <Btn size="sm" onClick={() => go('recon', pid)}>Reconcile</Btn>}</li>)}</ul></Panel>)}
      {tab === 'medications' && (!s.has('medications') ? locked('Medication history') : <Panel title="Medication history" icon={Pill}>
        <div className="eyebrow mb-1">Verified</div><ul className="grid gap-1.5 mb-4">{released.map(m => <li key={m.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2"><span className="font-semibold">{m.name}</span><span className="font-mono text-[12px] text-muted">{regText(m.reg)}</span><span className="ml-auto text-[11.5px] text-muted">{m.verifiedBy}</span></li>)}</ul>
        <div className="eyebrow mb-1">Not yet verified</div><ul className="grid gap-1.5">{pending.map(m => <li key={m.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2"><span className="font-semibold">{m.name}</span><span className="text-[12px] text-muted">{m.reason}</span></li>)}</ul>
        <p className="mt-3 text-[12px] text-muted">Adherence records the patient keeps are separate from these instructions and aren’t shared through this permission.</p>
      </Panel>)}
      {tab === 'verified' && (!s.has('verified') ? locked('Verified medication instructions') : <PatientSafeView pid={pid} preview />)}
      {tab === 'history' && (!(s.has('history') || s.has('visits')) ? locked('Medical history') : <MedicalHistory pid={pid} />)}
      {tab === 'audit' && <RecordAuditTrail pid={pid} />}
    </div>
  );
}

/* ───────── prescription verification ───────── */
function VerifyPage({ nav, go }) {
  const { db, me, mutate, toast, now } = useApp();
  const pids = authorisedPatients(db, me.id, now).filter(p => canAccess(db, me.id, p.id, 'prescriptions', now)).map(p => p.id);
  const all = db.prescriptions.filter(r => r.kind !== 'handover' && pids.includes(r.patientId));
  const [tab, setTab] = useState('queue');
  const queue = all.filter(r => ['pending', 'clarification', 'discrepancy', ...RX_ON_HOLD].includes(r.status)).sort((a, b) => (RX_ON_HOLD.includes(b.status) - RX_ON_HOLD.includes(a.status)) || a.uploadedAt.localeCompare(b.uploadedAt));
  const done = all.filter(r => ['verified', 'rejected'].includes(r.status)).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const list = tab === 'queue' ? queue : done;
  const [sel, setSel] = useState(nav.ref || null);
  useEffect(() => { if (nav.ref) setSel(nav.ref); }, [nav.n]);
  const blocked = sel && !all.some(r => r.id === sel) && db.prescriptions.some(r => r.id === sel);
  const rx = sel && all.find(r => r.id === sel) || list[0];
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Verification" title="Prescription Verification" sub="Compare each uploaded prescription or incoming transfer with its original document. You confirm the record matches; you don’t become the prescriber, and you can’t edit the original. Records missing a critical fact are held until a clinician confirms it." />
      {credPending(me) && <CredNotice />}
      {blocked && <NoAccess go={go} pid={db.prescriptions.find(r => r.id === sel)?.patientId} reason="This prescription belongs to a patient who hasn’t granted you Prescription records access, or your access ended." />}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <Panel title="Queue" icon={ClipboardCheck} right={<Segmented value={tab} onChange={setTab} options={[['queue', 'To review', queue.length], ['done', 'Completed', done.length]]} />}>
          {list.length === 0 ? <Empty icon={CheckCircle2} title={tab === 'queue' ? 'Nothing waiting' : 'No completed reviews'} body={pids.length ? '' : 'You need Prescription records access from a patient first.'} /> :
          <ul className="grid gap-1.5">{list.map(r => { const p = userById(db, r.patientId); return <li key={r.id}><button onClick={() => setSel(r.id)} className={`w-full text-left rounded-xl border p-3 transition ${rx?.id === r.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-raised/60'}`}><div className="flex items-center justify-between gap-2"><span className="font-semibold truncate">{r.title}</span></div><div className="text-[12px] text-muted">{p.profile.fullName} · {r.kind === 'transfer' ? 'external transfer' : 'uploaded'} {relTime(r.uploadedAt, now)}</div><div className="mt-1"><RxBadge status={r.status} /></div></button></li>; })}</ul>}
        </Panel>
        {rx ? <VerifyDetail key={rx.id} rx={rx} go={go} /> : <Panel><Empty icon={FileText} title="Select a prescription" /></Panel>}
      </div>
    </div>
  );
}

function VerifyDetail({ rx, go }) {
  const { db, me, mutate, toast, guard } = useApp();
  const p = userById(db, rx.patientId);
  const sc = activeScopes(db, me.id, rx.patientId);
  const rec = db.records[rx.patientId];
  const unc = uncertaintyCheck(db, rx);
  const regs = rx.meds.map((m, i) => effectiveReg(rx, i));
  const openEsc = (db.escalations || []).find(e => e.rxId === rx.id && e.status === 'open');
  const clarifiedByMe = Object.values(rx.clarifications || {}).some(c => c.by === me.id);
  const [blockOpen, setBlockOpen] = useState(false);
  const [action, setAction] = useState(null), [comment, setComment] = useState(''), [ack, setAck] = useState(false), [flagIdx, setFlagIdx] = useState([]), [sev, setSev] = useState('high');
  const current = verifiedMeds(db, rx.patientId).released.filter(m => !m.key.startsWith(rx.id + ':'));
  const checks = rx.meds.map((m, i) => {
    const issues = []; if (!regs[i].dose || !regs[i].unit) issues.push('Strength or unit not stated'); if (!regs[i].freq) issues.push('Frequency not stated');
    unc.blocking.filter(x => x.medIdx === i && !/strength|frequency/i.test(x.field)).forEach(x => issues.push(`Blocking: ${x.field} missing`));
    const conflict = current.find(c => genericKey(c.name) === genericKey(m.name));
    if (conflict && regText(conflict.reg) !== regText(regs[i])) issues.push(`Differs from current verified ${conflict.name}: ${regText(conflict.reg)}`);
    else if (conflict) issues.push(`Duplicate of current verified ${conflict.name}`);
    return { i, issues, conflict, flagged: (rx.flaggedIdx || []).includes(i) };
  });
  const open = ['pending', 'clarification', 'discrepancy', ...RX_ON_HOLD].includes(rx.status);
  const unflaggedIncomplete = checks.some(c => !c.flagged && (!regs[c.i].dose || !regs[c.i].unit || !regs[c.i].freq));
  const remaining = checks.filter(c => !c.flagged).length;
  const blockedCred = credPending(me);
  const ver = { by: me.id, byName: me.profile.fullName, byReg: me.profile.regNo, byDesignation: me.profile.designation, byOrg: orgOf(me) };
  const reset = () => { setAction(null); setComment(''); setAck(false); setFlagIdx([]); };
  const run = () => {
    const c = comment.trim();
    mutate(n => {
      const r = n.prescriptions.find(x => x.id === rx.id);
      if (action === 'approve') {
        r.status = 'verified'; r.verification = { ...ver, at: nowISO() }; r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'VERIFIED', comment: c || 'Recorded details match the original document.' });
        pushAudit(n, { ...actorOf(me), action: 'RX_VERIFIED', patientId: rx.patientId, item: rx.id, detail: `Verified “${rx.title}” against the original document${Object.keys(rx.clarifications || {}).length ? ' and the clinician-confirmed facts' : ''}. Original prescriber: ${rx.prescriber.name} (${rx.prescriber.org}). Reviewing professional: ${me.profile.fullName}, ${me.profile.designation}, reg. ${me.profile.regNo}.${(r.flaggedIdx || []).length ? ` ${(r.flaggedIdx || []).length} flagged medicine(s) remain in professional review.` : ''}` });
        notify(n, rx.patientId, { type: 'rx-verified', title: 'Prescription verified', body: `“${rx.title}” was verified by ${me.profile.fullName}. Eligible medicines are now in your checklist.`, priority: 'normal', link: 'prescriptions', ref: rx.id });
      } else if (action === 'clarify') {
        r.status = 'clarification'; r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'CLARIFICATION_REQUESTED', comment: c });
        pushAudit(n, { ...actorOf(me), action: 'RX_CLARIFICATION', patientId: rx.patientId, item: rx.id, detail: `Requested clarification on “${rx.title}”: ${c}` });
        notify(n, rx.patientId, { type: 'clarification', title: 'Your doctor needs more information', body: `${me.profile.fullName}: “${c}”`, priority: 'high', link: 'prescriptions', ref: rx.id });
      } else if (action === 'reject') {
        r.status = 'rejected'; r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'REJECTED', comment: c });
        pushAudit(n, { ...actorOf(me), action: 'RX_REJECTED', patientId: rx.patientId, item: rx.id, detail: `Rejected verification of “${rx.title}”. Reason: ${c}` });
        notify(n, rx.patientId, { type: 'rx-rejected', title: 'Prescription verification rejected', body: `${me.profile.fullName}: “${c}”. You can upload a corrected document.`, priority: 'high', link: 'prescriptions', ref: rx.id });
      } else if (action === 'flag') {
        r.flaggedIdx = [...new Set([...(r.flaggedIdx || []), ...flagIdx])]; r.status = 'discrepancy';
        r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'DISCREPANCY_FLAGGED', comment: `${flagIdx.map(i => rx.meds[i].name).join(', ')}: ${c}` });
        flagIdx.forEach(i => {
          const md = rx.meds[i], ck = checks[i], fid = `FL-${rx.id}-${i}`;
          n.recon.flagged = n.recon.flagged.filter(f => f.id !== fid);
          n.recon.flagged.push({ id: fid, patientId: rx.patientId, rxId: rx.id, name: md.name, cls: `Uploaded prescription · ${rx.prescriber.name}`, highAlert: false, purpose: md.purpose || 'From your uploaded prescription', prescriber: rx.prescriber.name,
            A: ck.conflict ? { reg: ck.conflict.reg, quote: `Current verified: ${ck.conflict.name} ${regText(ck.conflict.reg)}` } : null,
            B: { reg: md.reg, quote: `${md.name} ${md.strength}${md.instructions ? ` — ${md.instructions}` : ''}` },
            findings: [`Flagged by ${me.profile.fullName}`, ...ck.issues.map(s => s.split(':')[0])], severity: sev, rationale: c, questions: ['Confirm the intended regimen with the original prescriber before release.'] });
          n.recon.items[fid] = { status: 'open' };
        });
        pushAudit(n, { ...actorOf(me), action: 'DISCREPANCY_FLAGGED', patientId: rx.patientId, item: rx.id, detail: `Flagged ${flagIdx.map(i => rx.meds[i].name).join(', ')} (${SEV[sev].label}) into professional review: ${c}. Original prescription left unchanged.` });
        n.users.filter(u => u.role === 'doctor' && medsAccessPatients(n, u.id).includes(rx.patientId)).forEach(u => notify(n, u.id, { type: 'discrepancy', title: 'Medication discrepancy flagged', body: `${p.profile.fullName} · ${flagIdx.map(i => rx.meds[i].name).join(', ')} (${SEV[sev].label})`, priority: 'high', link: 'review', ref: `FL-${rx.id}-${flagIdx[0]}` }));
        notify(n, rx.patientId, { type: 'discrepancy', title: 'A medicine is being double-checked', body: `${flagIdx.map(i => rx.meds[i].name).join(', ')} from “${rx.title}” is in professional review and won’t show as confirmed yet.`, priority: 'normal', link: 'prescriptions', ref: rx.id });
      }
    });
    toast({ approve: 'Prescription verified and added to the patient’s folder', clarify: 'Clarification requested from the patient', reject: 'Verification rejected; the patient can upload a corrected copy', flag: 'Discrepancy sent to the professional review queue' }[action]);
    reset();
  };
  const canRun = action && !blockedCred && (action === 'approve' ? ack && !unflaggedIncomplete && remaining > 0 && !unc.blocking.length && !clarifiedByMe : action === 'flag' ? flagIdx.length && comment.trim().length >= 10 : comment.trim().length >= 8);
  const lastReply = [...rx.reviews].reverse().find(r => r.action === 'PATIENT_REPLY');
  return (
    <div className="grid gap-4 min-w-0">
      {open && <UncertaintyBanner check={unc} rx={rx} />}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Original document" icon={FileImage} className="min-w-0"><RxDocument rx={rx} highlightLine={unc.blocking[0]?.line} /><div className="mt-2 text-[11.5px] text-muted">{rx.kind === 'transfer' ? `${rx.source} · received ${fmtTs(rx.uploadedAt)} · stored unchanged` : `${rx.file?.name} · uploaded ${fmtTs(rx.uploadedAt)} by the patient · stored unchanged`}</div></Panel>
        <div className="grid gap-4 content-start min-w-0">
          <Panel title="Patient & prescription" icon={UserRound} right={<RxBadge status={rx.status} />}>
            <dl className="grid grid-cols-2 gap-3"><KV k="Patient" v={<span className="inline-flex flex-wrap items-center gap-1.5">{p.profile.fullName}<MaskedNotice /></span>} /><KV k="MediTrace ID" v={p.id} mono /><KV k="Age" v={p.profile.dob ? `${ageFrom(p.profile.dob)} years` : ''} /><KV k="Prescription date" v={fmtDate(rx.date)} /><KV k="Original prescriber (as recorded)" v={`${rx.prescriber.name}${rx.prescriber.regNo ? ` · ${rx.prescriber.regNo}` : ''}`} /><KV k="Hospital / clinic" v={rx.prescriber.org} /></dl>
            <div className="mt-3"><div className="eyebrow">Reported health problem</div><p className="text-[13.5px]">{rx.problem}</p></div>
            <div className="mt-3"><div className="eyebrow">Allergies</div>{sc.has('history') ? (rec.allergies.length ? <p className="text-[13.5px] text-crit font-semibold">{rec.allergies.map(a => `${a.substance}${a.reaction ? ` (${a.reaction})` : ''}`).join(', ')}</p> : <p className="text-[13px] text-muted">None recorded</p>) : <p className="text-[12.5px] text-muted flex items-center gap-1"><Lock size={12} />Not shared with you (needs Medical history access)</p>}</div>
            {lastReply && rx.status === 'pending' && <div className="mt-3 rounded-xl border border-info/30 bg-info/5 p-2.5 text-[13px]"><b>Patient’s clarification:</b> “{lastReply.comment}”</div>}
          </Panel>
        </div>
      </div>
      <Panel title="Recorded medicines vs. document" icon={Pill} pad={false}>
        <div className="scroll-x"><table className="w-full min-w-[720px] text-[13px]"><thead><tr className="border-b border-line text-left">{['Medicine', 'Strength', 'Route', 'Frequency', 'Instructions as written', 'Source / confidence', 'Checks'].map(h => <th key={h} className="px-3 py-2 eyebrow first:pl-4">{h}</th>)}</tr></thead>
          <tbody>{rx.meds.map((m, i) => { const ck = checks[i]; return (
            <tr key={i} className="border-b border-line/70 align-top">
              <td className="pl-4 pr-3 py-2.5 font-semibold">{m.name}{ck.flagged && <div><Chip tone="high"><Flag size={11} />In review</Chip></div>}</td>
              <td className="px-3 py-2.5 font-mono">{regs[i].dose ? `${regs[i].dose} ${regs[i].unit || '[unit?]'}` : <span className="text-crit">not stated</span>}</td>
              <td className="px-3 py-2.5 font-mono">{regs[i].route ? <>{regs[i].route}{!m.reg.route && <span className="block font-sans text-[11px] text-ok">clinician-confirmed</span>}</> : <span className={unc.blocking.some(x => x.medIdx === i && x.key.endsWith('.route')) ? 'text-crit font-semibold' : 'text-muted'}>{unc.blocking.some(x => x.medIdx === i && x.key.endsWith('.route')) ? 'MISSING' : 'n/s'}</span>}</td>
              <td className="px-3 py-2.5 font-mono">{regs[i].freq ? `${regs[i].freq} · ${FREQ[regs[i].freq].label}` : <span className="text-crit">not stated</span>}</td>
              <td className="px-3 py-2.5 text-fg/85">{m.instructions || '—'}</td>
              <td className="px-3 py-2.5 text-[12px] text-muted">{m.source === 'patient-transcribed' ? 'Patient-transcribed · no OCR confidence (demo)' : m.source === 'transfer' ? `External transfer · line ${m.line + 1}` : m.source}</td>
              <td className="px-3 py-2.5 text-[12px]">{ck.issues.length ? <ul className="grid gap-0.5">{ck.issues.map(s => <li key={s} className="text-high flex gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{s}</li>)}</ul> : <span className="text-ok flex items-center gap-1"><Check size={12} />No issues found</span>}</td>
            </tr>); })}</tbody></table></div>
      </Panel>
      {open && unc.blocking.length > 0 && <CandidateActions check={unc} rx={rx} />}
      <EscalationPanel rx={rx} />
      {open ? <Panel title="Your action" icon={ClipboardCheck}>
        {blockedCred && <CredNotice />}
        {unc.blocking.length > 0 && <div className="flex items-start gap-2 rounded-xl border border-crit/30 bg-crit/[.05] px-3 py-2 text-[13px]"><Lock size={14} className="mt-0.5 shrink-0 text-crit" /><span><b>Approval is blocked.</b> {openEsc ? `Waiting for ${openEsc.to === 'external' ? rx.prescriber.org : nameOf(db, openEsc.to)} to confirm the missing facts.` : 'Escalate the missing facts to an authorised clinician, or defer and keep the record on hold.'} Nothing has been released.</span></div>}
        {clarifiedByMe && !unc.blocking.length && <div className="flex items-start gap-2 rounded-xl border border-high/40 bg-high/5 px-3 py-2 text-[13px] text-high"><Users size={14} className="mt-0.5 shrink-0" />You confirmed the missing facts, so a different professional must verify this record.</div>}
        <div className="grid sm:grid-cols-4 gap-2 mt-2">{[['approve', unc.blocking.length ? Lock : BadgeCheck, unc.blocking.length ? 'Approve (blocked)' : rx.status === 'discrepancy' ? 'Verify remaining' : 'Approve / Verify'], unc.blocking.length ? ['escalate', Send, openEsc ? 'Escalation sent' : 'Escalate missing facts'] : rx.kind === 'transfer' ? null : ['clarify', MessageSquareWarning, 'Request clarification'], ['reject', XCircle, 'Reject verification'], ['flag', Flag, 'Flag discrepancy']].filter(Boolean).map(([k, I, l]) => <button key={k} disabled={k === 'escalate' && !!openEsc} onClick={() => guard(`${l} · “${rx.title}”`, () => { reset(); if (k === 'approve' && unc.blocking.length) { setBlockOpen(true); return; } setAction(k); }, rx.patientId)} className={`flex items-center gap-2 rounded-xl border p-3 text-left text-[13.5px] font-semibold transition disabled:opacity-40 ${action === k ? 'border-accent bg-accent/5' : 'border-line hover:bg-raised/50'}`}><I size={16} className={k === 'reject' ? 'text-crit' : k === 'flag' ? 'text-mod' : k === 'clarify' || k === 'escalate' ? 'text-info' : unc.blocking.length ? 'text-crit' : 'text-ok'} />{l}</button>)}</div>
        {action === 'escalate' && <div className="pop mt-3"><EscalationForm rx={rx} check={unc} onDone={reset} /></div>}
        {action && action !== 'escalate' && <div className="pop mt-3 grid gap-3">
          {action === 'approve' && <>{unflaggedIncomplete && <div className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">A medicine is missing its strength, unit or frequency. Request clarification or flag it; it can’t be verified as written.</div>}
            {remaining === 0 && <div className="rounded-xl bg-high/10 px-3 py-2 text-[13px] text-high">Every medicine is flagged; they’ll be released through the review queue.</div>}
            <Check2 id="v-ack" checked={ack} onChange={setAck} label="I compared every recorded detail with the original document." desc={`I am verifying this record as the reviewing professional. ${rx.prescriber.name} remains the original prescriber. I have not changed any dose or medicine.`} /></>}
          {action === 'flag' && <><div className="grid sm:grid-cols-2 gap-2">{rx.meds.map((m, i) => <Check2 key={i} id={`fl-${i}`} disabled={checks[i].flagged} checked={flagIdx.includes(i) || checks[i].flagged} onChange={(v) => setFlagIdx(s => v ? [...s, i] : s.filter(x => x !== i))} label={m.name} desc={checks[i].flagged ? 'Already in review' : checks[i].issues[0] || regText(m.reg)} />)}</div>
            <Field label="Severity" id="fl-sev"><select id="fl-sev" className={inputCls} value={sev} onChange={e => setSev(e.target.value)}>{['critical', 'high', 'moderate'].map(s => <option key={s} value={s}>{SEV[s].label}</option>)}</select></Field></>}
          <Field label={{ approve: 'Comment', clarify: 'What do you need from the patient?', reject: 'Reason for rejecting', flag: 'Describe the discrepancy' }[action]} id="v-comment" optional={action === 'approve'} required={action !== 'approve'} hint={action === 'flag' ? 'At least 10 characters. This becomes the rationale in the review queue.' : action !== 'approve' ? 'At least 8 characters. The patient will see this.' : ''}>
            <textarea id="v-comment" rows={2} className={inputCls} value={comment} onChange={e => setComment(e.target.value)} placeholder={{ approve: 'Optional note', clarify: 'e.g. The strength is hard to read. Can you upload a clearer photo?', reject: 'e.g. The document is not a prescription.', flag: 'e.g. Dose differs from the current verified list.' }[action]} /></Field>
          <div className="flex flex-wrap gap-2"><Btn kind={action === 'reject' ? 'danger' : 'primary'} disabled={!canRun} onClick={run}>{{ approve: 'Verify prescription', clarify: 'Send clarification request', reject: 'Reject verification', flag: 'Send to review queue' }[action]}</Btn><Btn onClick={reset}>Cancel</Btn></div>
        </div>}
      </Panel> : <Panel title="Outcome" icon={rx.status === 'verified' ? BadgeCheck : XCircle}>
        {rx.status === 'verified' && rx.verification && <div className="text-[13.5px] grid gap-1"><div><b>Verified</b> {fmtTs(rx.verification.at)} by {rx.verification.byName} ({rx.verification.byDesignation}, reg. {rx.verification.byReg})</div><div className="text-muted">Original prescriber: {rx.prescriber.name}, {rx.prescriber.org}</div></div>}
        {rx.status === 'rejected' && <div className="text-[13.5px]">Rejected. {[...rx.reviews].reverse().find(r => r.action === 'REJECTED')?.comment}</div>}
      </Panel>}
      <BlockedActionModal open={blockOpen} onClose={() => setBlockOpen(false)} check={unc} openEsc={openEsc && (openEsc.to === 'external' ? rx.prescriber.org : nameOf(db, openEsc.to))}
        onEscalate={() => { setBlockOpen(false); setAction('escalate'); }}
        onDefer={() => { setBlockOpen(false); mutate(n => { const r = n.prescriptions.find(x => x.id === rx.id); r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'DEFERRED', comment: `Kept on hold: ${unc.blocking.map(x => `${x.med} ${x.field.toLowerCase()}`).join('; ')} missing.` }); pushAudit(n, { ...actorOf(me), action: 'ACTION_DEFERRED', patientId: rx.patientId, item: rx.id, detail: `Approval attempted and blocked. Deferred; record kept on hold until ${unc.blocking.map(x => `${x.med} ${x.field.toLowerCase()}`).join(' and ')} are confirmed. No changes released.` }); }); toast('Deferred: the record stays on hold and nothing was released'); }} />
      <Panel title="Review history" icon={History}>{rx.reviews.length ? <ul className="grid gap-1 text-[12.5px]">{rx.reviews.map((r, i) => <li key={i} className="border-b border-line/60 py-1"><span className="font-mono text-muted tnum">{fmtTs(r.at)}</span> · <b>{r.byName}</b> · {r.action.replace(/_/g, ' ').toLowerCase()}{r.comment ? `: “${r.comment}”` : ''}</li>)}</ul> : <p className="text-[13px] text-muted">No review actions yet.</p>}</Panel>
    </div>
  );
}

/* ───────── reconciliation workspace (original modules) ───────── */
function ReconWorkspace({ nav, go }) {
  const { db, me, now } = useApp();
  const pids = medsAccessPatients(db, me.id, now);
  const [pid, setPid] = useState(nav.ref && pids.includes(nav.ref) ? nav.ref : pids.includes(MARA_ID) ? MARA_ID : pids[0]);
  const [sub, setSub] = useState('overview');
  const [srcSel, setSrcSel] = useState(null);
  useEffect(() => { if (nav.ref && pids.includes(nav.ref)) setPid(nav.ref); }, [nav.n]);
  if (!pids.length) return <div className="grid gap-4"><PageHead title="Reconciliation" /><NoAccess go={go} reason="Reconciliation needs Medication history or Prescription records access from at least one patient." /></div>;
  const handover = pid === MARA_ID;
  const subs = [handover && ['overview', 'Overview'], handover && ['source', 'Source trace'], ['matrix', 'Reconciliation matrix'], canAccess(db, me.id, pid, 'verified', now) && ['patientview', 'Patient view preview']].filter(Boolean);
  const cur = subs.some(s => s[0] === sub) ? sub : subs[0][0];
  const goSub = (k) => k === 'review' ? go('review') : setSub(k);
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Continuity of care" title="Medication reconciliation" sub="Cross-visit comparison with source tracing. Discrepancies go to the professional review queue; nothing reaches the patient until two professionals sign off." actions={<Field label="Patient" id="rc-pid"><select id="rc-pid" className={inputCls} value={pid} onChange={e => { setPid(e.target.value); setSub('overview'); }}>{pids.map(id => <option key={id} value={id}>{userById(db, id).profile.fullName} · {id}</option>)}</select></Field>} />
      <div className="scroll-x"><Segmented label="Reconciliation view" value={cur} onChange={setSub} options={subs} /></div>
      {cur === 'overview' && <ReconOverview go={goSub} />}
      {cur === 'source' && <Extraction sel={srcSel} />}
      {cur === 'matrix' && <Reconcile key={pid} pid={pid} openReview={(id) => go('review', id)} openSource={(doc, med) => { setSrcSel({ doc, med, n: Date.now() }); setSub('source'); }} openRx={(id) => go('verify', id)} />}
      {cur === 'patientview' && <PatientSafeView pid={pid} preview />}
    </div>
  );
}

function ReviewPage({ nav, go }) {
  const { db, me, now } = useApp();
  const pids = medsAccessPatients(db, me.id, now);
  const [focus, setFocus] = useState(nav.ref || null);
  useEffect(() => { if (nav.ref) setFocus(nav.ref); }, [nav.n]);
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Two-person verification" title="Professional review queue" sub="Decide how each flagged medicine should read, then a second professional verifies it. Only verified items are released to the patient." />
      {credPending(me) && <CredNotice />}
      {!pids.length ? <NoAccess go={go} reason="You need Medication history or Prescription records access from a patient to review their medicines." /> : <Review pids={pids} focus={focus} setFocus={setFocus} />}
    </div>
  );
}

function DoctorDashboard({ go }) {
  const { db, me, now } = useApp();
  const p = me.profile;
  const pats = authorisedPatients(db, me.id, now);
  const rxPids = pats.filter(x => canAccess(db, me.id, x.id, 'prescriptions', now)).map(x => x.id);
  const rxQueue = db.prescriptions.filter(r => r.kind !== 'handover' && rxPids.includes(r.patientId) && ['pending', 'discrepancy', ...RX_ON_HOLD].includes(r.status));
  const clar = db.prescriptions.filter(r => r.kind === 'upload' && rxPids.includes(r.patientId) && (r.status === 'clarification' || (r.status === 'pending' && r.reviews.some(x => x.action === 'PATIENT_REPLY'))));
  const mPids = medsAccessPatients(db, me.id, now);
  const alerts = reconMedsFor(db, mPids).filter(m => m.severity !== 'none' && ['open', 'decided'].includes(db.recon.items[m.id]?.status)).sort((a, b) => SEV[a.severity].order - SEV[b.severity].order);
  const reqs = db.grants.filter(g => g.doctorId === me.id).sort((a, b) => (b.decidedAt || b.requestedAt).localeCompare(a.decidedAt || a.requestedAt));
  const activity = db.log.filter(e => pats.some(x => x.id === e.patientId) && e.actorId !== me.id).slice(-8).reverse();
  const mine = db.log.filter(e => e.actorId === me.id && /DECIDE|VERIFY|RX_|DISCREPANCY|RETURN|ESCALATE|HISTORY/.test(e.action)).slice(-8).reverse();
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface card-shadow p-5">
        <div className="flex items-center gap-4 min-w-0"><Avatar name={p.fullName} size={52} tone="navy" /><div className="min-w-0"><div className="eyebrow">Professional dashboard</div><h1 className="font-display text-[24px] font-extrabold leading-tight truncate">{p.fullName}</h1><div className="text-[13px] text-muted">{p.designation} · {p.specialisation} · {orgOf(me)} · <span className="font-mono">{me.id}</span></div></div></div>
        <div className="grid justify-items-end gap-2"><CredBadge u={me} /><div className="flex gap-2"><Btn kind="primary" onClick={() => go('request')}><KeyRound size={14} />Request access</Btn><Btn onClick={() => go('profile')}>Profile</Btn></div></div>
      </div>
      {credPending(me) && <CredNotice />}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Authorised patients" value={pats.length} sub="With active consent" icon={Users} onClick={() => go('patients')} />
        <Stat label="Verification queue" value={rxQueue.length} sub="Prescriptions to review" icon={ClipboardCheck} tone="high" onClick={() => go('verify')} />
        <Stat label="Clarifications" value={clar.length} sub="Awaiting patient or replied" icon={MessageSquareWarning} tone="info" onClick={() => go('verify')} />
        <Stat label="Discrepancy alerts" value={alerts.length} sub={`${alerts.filter(a => a.severity === 'critical').length} critical`} icon={AlertTriangle} tone="crit" onClick={() => go('review')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Medication discrepancy alerts" icon={AlertTriangle} className="lg:col-span-2" right={<Btn size="sm" onClick={() => go('review')}>Review queue</Btn>}>
          {alerts.length === 0 ? <p className="text-[13px] text-muted">No open discrepancies.</p> : <ul className="divide-y divide-line">{alerts.slice(0, 6).map(m => <li key={m.id}><button onClick={() => go('review', m.id)} className="w-full text-left flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 hover:bg-raised/40 rounded-lg px-1"><SevBadge sev={m.severity} small /><span className="font-semibold">{m.name}</span><span className="text-[12px] text-muted">{userById(db, m.patientId).profile.fullName} · {m.findings[0]}</span><span className="ml-auto"><StatusBadge status={db.recon.items[m.id].status} /></span></button></li>)}</ul>}
        </Panel>
        <EscalationsCard go={go} />
        <Panel title="Patient access requests" icon={KeyRound} right={<Btn size="sm" onClick={() => go('request')}>All</Btn>}>
          {reqs.length === 0 ? <p className="text-[13px] text-muted">No requests sent.</p> : <ul className="grid gap-2">{reqs.slice(0, 5).map(g => { const st = grantState(g, now); const pt = userById(db, g.patientId); return <li key={g.id} className="flex items-center justify-between gap-2 text-[13px]"><span className="truncate">{st === 'approved' ? pt.profile.fullName : `Patient ${maskName(pt.profile.fullName)}`}</span><GrantBadge state={st} /></li>; })}</ul>}
        </Panel>
        <Panel title="Authorised patients" icon={Users} right={<Btn size="sm" onClick={() => go('patients')}>All</Btn>}>
          {pats.length === 0 ? <p className="text-[13px] text-muted">None yet.</p> : <ul className="grid gap-2">{pats.map(x => <li key={x.id}><button onClick={() => go('patients', x.id)} className="flex w-full items-center gap-2.5 rounded-xl p-1.5 text-left hover:bg-raised/50"><Avatar name={x.profile.fullName} size={30} /><span className="min-w-0"><span className="block text-[13.5px] font-semibold truncate">{x.profile.fullName}</span><span className="block font-mono text-[11.5px] text-muted">{x.id}</span></span></button></li>)}</ul>}
        </Panel>
        <Panel title="Prescription verification queue" icon={ClipboardCheck} right={<Btn size="sm" onClick={() => go('verify')}>Open</Btn>}>
          {rxQueue.length === 0 ? <p className="text-[13px] text-muted">Nothing waiting.</p> : <ul className="grid gap-2">{rxQueue.map(r => <li key={r.id}><button onClick={() => go('verify', r.id)} className="w-full text-left rounded-xl border border-line p-2.5 hover:bg-raised/50"><div className="font-semibold text-[13.5px]">{r.title}</div><div className="text-[12px] text-muted">{userById(db, r.patientId).profile.fullName} · {relTime(r.uploadedAt, now)}</div></button></li>)}</ul>}
        </Panel>
        <Panel title="Pending clarifications" icon={MessageSquareWarning}>
          {clar.length === 0 ? <p className="text-[13px] text-muted">None.</p> : <ul className="grid gap-2">{clar.map(r => <li key={r.id}><button onClick={() => go('verify', r.id)} className="w-full text-left rounded-xl border border-line p-2.5 hover:bg-raised/50"><div className="font-semibold text-[13.5px]">{r.title}</div><div className="text-[12px] text-muted">{r.status === 'clarification' ? 'Waiting for patient' : 'Patient replied'}</div></button></li>)}</ul>}
        </Panel>
        <Panel title="Recent patient activity" icon={Activity} className="lg:col-span-2">
          {activity.length === 0 ? <p className="text-[13px] text-muted">No recent activity.</p> : <ul className="grid gap-1.5">{activity.map(e => <li key={e.seq} className="flex flex-wrap gap-x-2 text-[12.5px] border-b border-line/60 pb-1.5"><span className="font-mono text-muted tnum">{fmtTs(e.ts)}</span><Chip>{e.action}</Chip><span className="min-w-0">{e.actor}: {e.detail}</span></li>)}</ul>}
        </Panel>
        <Panel title="My review history" icon={History}>
          {mine.length === 0 ? <p className="text-[13px] text-muted">No review actions yet.</p> : <ul className="grid gap-1.5">{mine.map(e => <li key={e.seq} className="text-[12.5px]"><div className="flex gap-2"><Chip tone="navy">{e.action}</Chip><span className="font-mono text-muted tnum">{fmtTs(e.ts)}</span></div><div className="text-fg/80 line-clamp-2">{e.detail}</div></li>)}</ul>}
        </Panel>
      </div>
    </div>
  );
}

function DoctorProfile() {
  const { db, me, mutate, toast } = useApp();
  const p = me.profile;
  const { go } = useApp();
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Account" title="Professional profile" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Profile" icon={Stethoscope} className="lg:col-span-2">
          <div className="flex items-center gap-3"><Avatar name={p.fullName} size={52} tone="navy" /><div><div className="font-display text-[20px] font-extrabold">{p.fullName}</div><div className="text-[13px] text-muted">{p.designation} · {p.specialisation}</div></div></div>
          <dl className="mt-4 grid sm:grid-cols-2 gap-3"><KV k="MediTrace doctor ID" v={me.id} mono /><KV k="Medical registration number" v={p.regNo} mono /><KV k="NPI" v={p.npi} mono /><KV k="How you practise" v={PRACTICE.find(x => x[0] === p.practice)?.[1]} /><KV k={p.practice === 'independent' ? 'Practice' : 'Organisation'} v={orgOf(me)} />
            {p.practice === 'independent' ? <><KV k="Practice address" v={p.practiceAddress} /><KV k="Consultation hours" v={p.hours} /></> : <><KV k="Department" v={p.department} /><KV k="Organisation address" v={p.orgAddress} /></>}
            <KV k="Email" v={me.email} /><KV k="Phone" v={me.phone} /></dl>
        </Panel>
        <Panel title="Professional verification status" icon={BadgeCheck}>
          <CredentialBadge u={me} />
          <p className="mt-2 text-[12.5px] text-muted">{p.verification ? `Last registry check ${fmtTs(p.verification.at)} (${p.verification.idType === 'npi' ? 'NPI' : 'council reg.'} ${p.verification.idValue}).` : 'Not yet checked against the provider registry.'} Self-reported details alone never unlock clinical actions.</p>
          <Btn size="sm" kind={isVerifiedClinician(me) ? 'ghost' : 'primary'} className="mt-3" onClick={() => go('credentials')}><BadgeCheck size={13} />{isVerifiedClinician(me) ? 'View verification' : 'Verify my licence'}</Btn>
        </Panel>
        <SecuritySettings />
      </div>
    </div>
  );
}
