/* MediTrace operational constraints
   - Constraint 12: Information uncertainty & human escalation (missing critical fact)
   - Constraint 5:  Surge demand & resource constraint (capacity crunch)
   Both are deterministic, rule-based and transparent: nothing here guesses a clinical value or exceeds real capacity. */

/* ======================================================================
   CONSTRAINT 12 · Missing critical fact → block, defer, escalate to a human
   ====================================================================== */
const ROUTE_CRITICAL = {
  morphine: 'Oral and injected morphine are not interchangeable: the same 10 mg dose has roughly 2–3 times the effect when injected.',
  hydromorphone: 'Oral and injected hydromorphone doses differ several-fold.',
  oxycodone: 'Route changes the dose equivalence of oxycodone.',
  vancomycin: 'Oral and IV vancomycin treat different conditions and are dosed differently.',
  methotrexate: 'Route and schedule errors with methotrexate can be fatal.',
  enoxaparin: 'Enoxaparin dosing differs between subcutaneous and IV use.',
  insulin: 'Insulin route determines onset and dose.',
};
const RENAL_SENSITIVE = {
  morphine: 'Morphine metabolites build up when kidney function is reduced, so the dose or interval may need adjusting.',
  gabapentin: 'Gabapentin dose depends on creatinine clearance.',
  enoxaparin: 'Enoxaparin needs dose adjustment in severe renal impairment.',
  vancomycin: 'Vancomycin dosing depends on current renal function.',
  metformin: 'Metformin limits depend on eGFR.',
  apixaban: 'Apixaban dose criteria include serum creatinine.',
};
const ROUTE_ALTS = {
  morphine: [{ route: 'PO', text: 'Oral morphine 10 mg every 4 hours as needed' }, { route: 'SC', text: 'Subcutaneous morphine 10 mg every 4 hours as needed (roughly 2–3× the effect of the oral dose)' }],
};
const RENAL_WINDOW_H = 72;
const matchKey = (dict, name) => Object.keys(dict).find(k => normName(name).includes(k));
const hoursBetween = (a, b) => Math.abs(parseDay(a) - parseDay(b)) / HOUR;

function latestRenal(db, pid) {
  const labs = (db.records[pid]?.labs || []).filter(l => /egfr|crcl|creatinine/i.test(l.test));
  return labs.sort((a, b) => b.date.localeCompare(a.date))[0] || null;
}

/* Lists exactly what is missing. It never fills a gap with a default or an assumption. */
function uncertaintyCheck(db, rx) {
  const issues = [];
  if (!rx || rx.kind === 'handover') return { issues, blocking: [], advisory: [], candidates: {} };
  const clar = rx.clarifications || {};
  rx.meds.forEach((m, i) => {
    const reg = effectiveReg(rx, i);
    const base = { medIdx: i, med: m.name, line: m.line };
    if (!reg.dose || !reg.unit) issues.push({ ...base, key: `${i}.strength`, field: 'Strength / unit', severity: 'blocking', known: m.strength || 'Not stated', why: 'A dose cannot be given without an explicit strength and unit.', need: 'Exact strength with unit, from the prescriber.' });
    if (!reg.freq) issues.push({ ...base, key: `${i}.freq`, field: 'Frequency', severity: 'blocking', known: 'Not stated', why: 'Without a frequency the daily dose is unknown.', need: 'How often, from the prescriber.' });
    const rk = matchKey(ROUTE_CRITICAL, m.name);
    if (!reg.route) issues.push({ ...base, key: `${i}.route`, field: 'Route of administration', severity: rk ? 'blocking' : 'advisory',
      known: `“${m.name} ${m.strength}${m.instructions ? ' ' + m.instructions : ''}”, with no route`, why: rk ? ROUTE_CRITICAL[rk] : 'Route is not stated; for this medicine it is very likely oral, but it should still be recorded.', need: 'The route the sending prescriber intended.', drug: rk });
    const nk = matchKey(RENAL_SENSITIVE, m.name);
    if (nk && !clar[`${i}.renal`]) {
      const lab = latestRenal(db, rx.patientId);
      const gap = lab ? hoursBetween(lab.date, rx.date) : null;
      if (!lab || gap > RENAL_WINDOW_H) issues.push({ ...base, key: `${i}.renal`, field: 'Current renal function', severity: 'blocking',
        known: lab ? `Most recent on file: ${lab.test} ${lab.value} ${lab.unit} on ${fmtDate(lab.date)}, ${Math.round(gap / 24)} days before the transfer (older than ${RENAL_WINDOW_H} h)` : 'No renal function result on file',
        why: RENAL_SENSITIVE[nk], need: `An eGFR or creatinine clearance measured within ${RENAL_WINDOW_H} h of the transfer, with its date and source.` });
    }
  });
  const blocking = issues.filter(x => x.severity === 'blocking'), advisory = issues.filter(x => x.severity === 'advisory');
  const candidates = {};
  blocking.forEach(x => {
    const c = candidates[x.medIdx] = candidates[x.medIdx] || [];
    if (x.key.endsWith('.route')) (ROUTE_ALTS[x.drug] || [{ text: `${x.med} by mouth` }, { text: `${x.med} by injection` }]).forEach(a => c.push({ text: a.text, requires: 'Route confirmed by the prescriber' }));
    if (x.key.endsWith('.renal')) { c.push({ text: `${x.med} at the dose written`, requires: 'Current renal function confirmed as adequate' }); c.push({ text: `${x.med} with a renally adjusted dose or interval`, requires: 'Current renal function and a prescriber decision' }); }
  });
  return { issues, blocking, advisory, candidates };
}
const authorisedClinicians = (db, pid, exceptId) => db.users.filter(u => u.role === 'doctor' && u.id !== exceptId && isVerifiedClinician(u) && canAccess(db, u.id, pid, 'prescriptions'));

function UncertaintyBanner({ check, rx }) {
  if (!check.blocking.length && !check.advisory.length) return null;
  const blocked = check.blocking.length > 0;
  return (
    <div role="alert" className={`rounded-2xl border-2 p-4 ${blocked ? 'border-crit/50 bg-crit/[.06]' : 'border-mod/50 bg-mod/10'}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${blocked ? 'bg-crit text-white' : 'bg-mod text-white'}`}>{blocked ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}</span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[17px] font-extrabold">{blocked ? `Uncertainty check: ${check.blocking.length} critical fact${check.blocking.length > 1 ? 's' : ''} missing. Approval is blocked.` : 'Uncertainty check: details to confirm'}</div>
          <p className="text-[13.5px] text-fg/85 max-w-[80ch]">{blocked ? 'MediTrace has enough information to list possible actions but not enough to choose one safely. It will not guess, fill in a default, or release anything until an authorised clinician confirms the facts below.' : 'Nothing here blocks approval, but these gaps should be recorded.'}</p>
        </div>
      </div>
      <ul className="mt-3 grid gap-2">
        {[...check.blocking, ...check.advisory].map(x => (
          <li key={x.key} className={`rounded-xl border bg-surface p-3 ${x.severity === 'blocking' ? 'border-crit/30' : 'border-mod/40'}`}>
            <div className="flex flex-wrap items-center gap-2"><Chip tone={x.severity === 'blocking' ? 'crit' : 'high'}>{x.severity === 'blocking' ? <Lock size={11} /> : <Info size={11} />}{x.severity === 'blocking' ? 'Blocking' : 'Advisory'}</Chip><b>{x.med}</b><span className="text-muted">·</span><span className="font-semibold">{x.field}</span>{x.line != null && <span className="text-[12px] text-muted font-mono">source line {x.line + 1}</span>}</div>
            <dl className="mt-1.5 grid gap-1 text-[13px] md:grid-cols-3">
              <div><dt className="eyebrow">What the record says</dt><dd>{x.known}</dd></div>
              <div><dt className="eyebrow">Why it matters</dt><dd>{x.why}</dd></div>
              <div><dt className="eyebrow">What is needed</dt><dd>{x.need}</dd></div>
            </dl>
          </li>))}
      </ul>
    </div>
  );
}

function CandidateActions({ check, rx }) {
  const ids = Object.keys(check.candidates);
  if (!ids.length) return null;
  return (
    <Panel title="Possible actions (not selectable)" icon={Lock}>
      <p className="text-[13px] text-muted mb-3">These are the options the record allows. Each depends on a fact that is missing, so MediTrace won’t choose between them or pre-select one.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {ids.map(i => <div key={i} className="grid gap-2 content-start"><div className="text-[13px] font-semibold">{rx.meds[i].name}</div>
          {check.candidates[i].map((c, j) => <div key={j} aria-disabled="true" className="flex items-start gap-2.5 rounded-xl border border-dashed border-line bg-raised/40 p-2.5 opacity-80 cursor-not-allowed"><input type="radio" disabled className="mt-1" aria-label={c.text} /><div><div className="text-[13.5px]">{c.text}</div><div className="text-[11.5px] text-crit flex items-center gap-1"><Lock size={11} />Requires: {c.requires}</div></div></div>)}
        </div>)}
      </div>
    </Panel>
  );
}

function BlockedActionModal({ open, onClose, check, onEscalate, onDefer, openEsc }) {
  return (
    <Modal open={open} onClose={onClose} title="Approval blocked: missing critical information" footer={<>
      <Btn onClick={onDefer}><PauseCircle size={14} />Defer and keep on hold</Btn>
      {openEsc ? <Btn kind="primary" onClick={onClose}>Close</Btn> : <Btn kind="primary" onClick={onEscalate}><Send size={14} />Escalate to a clinician</Btn>}
    </>}>
      <div className="grid gap-3">
        <div className="flex items-start gap-3 rounded-xl bg-crit/[.07] p-3"><Lock size={18} className="mt-0.5 text-crit shrink-0" /><p className="text-[13.5px]">This record can’t be verified while these facts are missing. Approving now would mean MediTrace or the reviewer choosing a route or dose that the prescriber never stated.</p></div>
        <ul className="grid gap-1.5">{check.blocking.map(x => <li key={x.key} className="flex flex-wrap gap-x-2 text-[13.5px]"><b>{x.med}:</b><span>{x.field} missing</span></li>)}</ul>
        <div className="rounded-xl border border-line p-3 text-[13px] grid gap-1">
          <div className="font-semibold flex items-center gap-1.5"><ShieldCheck size={14} className="text-ok" />Nothing irreversible has happened</div>
          <div className="text-muted">The original record is unchanged. Nothing has been released to the patient or added to their checklist. Their last verified instructions still apply.</div>
        </div>
        {openEsc && <div className="text-[13px] text-info">A clarification request is already open with {openEsc}. It stays blocked until they answer.</div>}
      </div>
    </Modal>
  );
}

function EscalationForm({ rx, check, onDone }) {
  const { db, me, mutate, toast } = useApp();
  const recips = authorisedClinicians(db, rx.patientId, me.id);
  const pName = userById(db, rx.patientId)?.profile.fullName;
  const [to, setTo] = useState(recips[0]?.id || 'external');
  const [urg, setUrg] = useState('urgent');
  const [facts, setFacts] = useState(check.blocking.map(x => x.key));
  const defaultQ = `Transfer from ${rx.prescriber.org} for ${pName}: please confirm ${check.blocking.map(x => `${x.field.toLowerCase()} for ${x.med}`).join(' and ')}. The record does not state ${check.blocking.length > 1 ? 'these' : 'this'}, so approval is on hold.`;
  const [q, setQ] = useState(defaultQ);
  const URG = { urgent: ['Urgent: within 1 hour', HOUR], today: ['Today: within 4 hours', 4 * HOUR], routine: ['Routine: within 24 hours', DAY] };
  const send = () => {
    const rec = to === 'external' ? null : userById(db, to);
    const esc = { id: uid('ESC'), rxId: rx.id, patientId: rx.patientId, raisedBy: me.id, to, facts: check.blocking.filter(x => facts.includes(x.key)).map(x => ({ key: x.key, med: x.med, field: x.field })), question: q.trim(), urgency: urg, dueAt: new Date(Date.now() + URG[urg][1]).toISOString(), createdAt: nowISO(), status: 'open' };
    mutate(n => {
      n.escalations = n.escalations || []; n.escalations.push(esc);
      const r = n.prescriptions.find(x => x.id === rx.id); r.status = 'escalated';
      r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'ESCALATED', comment: `To ${rec ? rec.profile.fullName : `${rx.prescriber.org} (external, phone/fax)`}: ${q.trim()}` });
      pushAudit(n, { ...actorOf(me), action: 'ESCALATION_RAISED', patientId: rx.patientId, item: esc.id, detail: `Missing ${esc.facts.map(f => `${f.med} ${f.field.toLowerCase()}`).join('; ')} on ${rx.id}. Sent to ${rec ? rec.profile.fullName : rx.prescriber.org + ' (external)'} · ${URG[urg][0]}. Action deferred; no changes released.` });
      if (rec) notify(n, rec.id, { type: 'escalation', title: 'Clarification needed: missing critical information', body: `${pName} · ${esc.facts.map(f => `${f.med} ${f.field.toLowerCase()}`).join(', ')} · ${URG[urg][0]}`, priority: 'high', link: 'verify', ref: rx.id });
      notify(n, rx.patientId, { type: 'history', title: 'A medicine is on hold while we check details', body: 'Your care team has asked a clinician to confirm how it should be given. Nothing has changed in your current instructions.', priority: 'normal', link: 'prescriptions', ref: rx.id });
    });
    toast(rec ? `Escalated to ${rec.profile.fullName}. The record stays on hold.` : 'External clarification logged. Record the answer here once the sending unit replies.');
    onDone();
  };
  return (
    <div className="grid gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Send to (authorised clinician)" id="esc-to" required hint="Only professionals with reviewed credentials and access to this patient’s prescriptions are listed.">
          <select id="esc-to" className={inputCls} value={to} onChange={e => setTo(e.target.value)}>
            {recips.map(u => <option key={u.id} value={u.id}>{u.profile.fullName} · {u.profile.designation}</option>)}
            <option value="external">Sending unit: {rx.prescriber.org} (phone/fax, answer logged by you)</option>
          </select></Field>
        <Field label="Urgency" id="esc-urg" required><select id="esc-urg" className={inputCls} value={urg} onChange={e => setUrg(e.target.value)}>{Object.entries(URG).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div><div className="text-[12.5px] font-semibold mb-1.5">Facts to confirm</div><div className="grid gap-1.5">{check.blocking.map(x => <Check2 key={x.key} id={`esc-f-${x.key}`} checked={facts.includes(x.key)} disabled onChange={() => {}} label={`${x.med}: ${x.field}`} desc="Required. Every blocking fact must be confirmed before release." />)}</div></div>
      <Field label="Clarification request" id="esc-q" required hint="Ask for the facts; don’t propose a value."><textarea id="esc-q" rows={3} className={inputCls} value={q} onChange={e => setQ(e.target.value)} /></Field>
      <div className="flex flex-wrap justify-end gap-2"><Btn kind="primary" disabled={q.trim().length < 20} onClick={send}><Send size={14} />Send clarification request</Btn></div>
    </div>
  );
}

function EscalationAnswer({ esc, rx }) {
  const { db, me, mutate, toast, guard } = useApp();
  const [route, setRoute] = useState(''), [src, setSrc] = useState('');
  const [metric, setMetric] = useState('eGFR'), [val, setVal] = useState(''), [ldate, setLdate] = useState(''), [lsrc, setLsrc] = useState('');
  const [attest, setAttest] = useState(false), [err, setErr] = useState('');
  const needRoute = esc.facts.find(f => f.key.endsWith('.route')), needRenal = esc.facts.find(f => f.key.endsWith('.renal'));
  const submit = () => guard('Record clinician-confirmed facts', submit0, rx.patientId);
  const submit0 = () => {
    if (needRoute && (!route || src.trim().length < 5)) return setErr('Choose the confirmed route and say who confirmed it.');
    if (needRenal) {
      const v = Number(val);
      if (!val || !(v > 0 && v < 200)) return setErr('Enter the measured renal function value (a number between 1 and 199).');
      if (!ldate) return setErr('Enter the date the result was taken.');
      if (ldate > ymd()) return setErr('The result date can’t be in the future.');
      if (hoursBetween(ldate, rx.date) > RENAL_WINDOW_H) return setErr(`That result is more than ${RENAL_WINDOW_H} h from the transfer date, so it doesn’t resolve the gap. Ask for a current result.`);
      if (lsrc.trim().length < 5) return setErr('Say where the result came from.');
    }
    if (!attest) return setErr('Confirm that these facts come from the named source.');
    setErr('');
    mutate(n => {
      const r = n.prescriptions.find(x => x.id === rx.id); r.clarifications = r.clarifications || {};
      const stamp = { by: me.id, byName: me.profile.fullName, at: nowISO(), escId: esc.id };
      if (needRoute) r.clarifications[needRoute.key] = { ...stamp, value: route, source: src.trim() };
      if (needRenal) {
        const lab = { id: uid('LAB'), test: metric, value: Number(val), unit: metric === 'eGFR' ? 'mL/min/1.73m²' : 'mL/min', date: ldate, source: lsrc.trim(), recordedBy: me.profile.fullName };
        n.records[rx.patientId].labs = n.records[rx.patientId].labs || []; n.records[rx.patientId].labs.push(lab);
        r.clarifications[needRenal.key] = { ...stamp, value: `${metric} ${val} ${lab.unit} on ${fmtDate(ldate)}`, source: lsrc.trim() };
      }
      const e = n.escalations.find(x => x.id === esc.id); e.status = 'answered'; e.answeredAt = nowISO(); e.answeredBy = me.id;
      const left = uncertaintyCheck(n, r).blocking.length;
      r.status = left ? 'blocked' : 'pending';
      r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'CLARIFIED', comment: [needRoute && `Route: ${route} (source: ${src.trim()})`, needRenal && `${metric} ${val} on ${fmtDate(ldate)} (source: ${lsrc.trim()})`].filter(Boolean).join('; ') });
      pushAudit(n, { ...actorOf(me), action: 'ESCALATION_ANSWERED', patientId: rx.patientId, item: esc.id, detail: `Confirmed for ${rx.id}: ${[needRoute && `${needRoute.med} route ${route} (source: ${src.trim()})`, needRenal && `${metric} ${val} measured ${fmtDate(ldate)} (source: ${lsrc.trim()})`].filter(Boolean).join('; ')}. Original record unchanged. ${left ? `${left} blocking fact(s) remain.` : 'No blocking facts remain; ready for verification by a different professional.'}` });
      if (esc.raisedBy !== me.id) notify(n, esc.raisedBy, { type: 'clarification-received', title: 'Clarification received: missing facts confirmed', body: `${rx.title} · ${left ? 'still on hold' : 'ready for verification'}`, priority: 'high', link: 'verify', ref: rx.id });
    });
    toast('Facts recorded with their source. The original record is unchanged.');
  };
  return (
    <div className="grid gap-3">
      <div className="rounded-xl bg-raised/60 p-3 text-[13px]"><b>Request:</b> “{esc.question}”</div>
      {needRoute && <div className="grid sm:grid-cols-2 gap-3 rounded-xl border border-line p-3">
        <Field label={`${needRoute.med}: confirmed route`} id="ans-route" required><select id="ans-route" className={inputCls} value={route} onChange={e => setRoute(e.target.value)}><option value="">Select the route the prescriber confirmed</option>{Object.entries(ROUTE).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}</select></Field>
        <Field label="Confirmed by / source" id="ans-src" required><input id="ans-src" className={inputCls} value={src} onChange={e => setSrc(e.target.value)} placeholder="e.g. Dr. Calloway by phone, 14:05" /></Field>
      </div>}
      {needRenal && <div className="grid sm:grid-cols-4 gap-3 rounded-xl border border-line p-3">
        <Field label="Measure" id="ans-metric" required><select id="ans-metric" className={inputCls} value={metric} onChange={e => setMetric(e.target.value)}><option>eGFR</option><option>CrCl</option></select></Field>
        <Field label="Value" id="ans-val" required><input id="ans-val" inputMode="decimal" className={inputCls + ' font-mono'} value={val} onChange={e => setVal(e.target.value)} placeholder="as reported" /></Field>
        <Field label="Date taken" id="ans-date" required><input id="ans-date" type="date" max={ymd()} className={inputCls} value={ldate} onChange={e => setLdate(e.target.value)} /></Field>
        <Field label="Source" id="ans-lsrc" required><input id="ans-lsrc" className={inputCls} value={lsrc} onChange={e => setLsrc(e.target.value)} placeholder="e.g. Northgate lab report" /></Field>
      </div>}
      <Check2 id="ans-attest" checked={attest} onChange={setAttest} label="I confirmed these facts directly with the named source." desc="I am not estimating or inferring them. The original transfer record stays unchanged; these confirmations are stored alongside it." />
      {err && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
      <Btn kind="primary" className="justify-self-start" onClick={submit}><Check size={14} />Record confirmed facts</Btn>
    </div>
  );
}

function EscalationPanel({ rx }) {
  const { db, me } = useApp();
  const list = (db.escalations || []).filter(e => e.rxId === rx.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const clar = Object.entries(rx.clarifications || {});
  if (!list.length && !clar.length) return null;
  return (
    <Panel title="Clarification & escalation" icon={Send}>
      <ul className="grid gap-3">
        {list.map(e => {
          const to = e.to === 'external' ? `${rx.prescriber.org} (external)` : nameOf(db, e.to);
          const canAnswer = e.status === 'open' && (e.to === me.id || (e.to === 'external' && e.raisedBy === me.id));
          const overdue = e.status === 'open' && Date.parse(e.dueAt) < Date.now();
          return (
            <li key={e.id} className="rounded-xl border border-line p-3 grid gap-2">
              <div className="flex flex-wrap items-center gap-2"><Badge meta={e.status === 'open' ? { label: overdue ? 'Overdue' : 'Awaiting answer', cls: overdue ? 'text-crit bg-crit/10 ring-crit/30' : 'text-info bg-info/10 ring-info/30', icon: Clock } : { label: 'Answered', cls: 'text-ok bg-ok/10 ring-ok/30', icon: CheckCircle2 }} /><span className="text-[13px]"><b>{nameOf(db, e.raisedBy)}</b> → <b>{to}</b></span><span className="text-[12px] text-muted">raised {fmtTs(e.createdAt)} · due {fmtTs(e.dueAt)}</span></div>
              {canAnswer ? <EscalationAnswer esc={e} rx={rx} /> : e.status === 'open' ? <div className="text-[13px] text-muted">“{e.question}” Waiting for {to}. The record stays on hold.</div> : <div className="text-[13px] text-muted">Answered by {nameOf(db, e.answeredBy)} · {fmtTs(e.answeredAt)}</div>}
            </li>);
        })}
      </ul>
      {clar.length > 0 && <div className="mt-3"><div className="eyebrow mb-1">Confirmed facts (layered on the unchanged original)</div><ul className="grid gap-1.5">{clar.map(([k, c]) => { const i = +k.split('.')[0]; return <li key={k} className="rounded-lg bg-ok/[.07] px-3 py-2 text-[13px]"><b>{rx.meds[i].name} · {k.endsWith('.route') ? 'Route' : 'Renal function'}:</b> <span className="text-muted line-through decoration-1">not stated</span> → <b>{c.value}</b> <span className="text-muted">· source: {c.source} · recorded by {c.byName}, {fmtTs(c.at)}</span></li>; })}</ul></div>}
    </Panel>
  );
}

/* ======================================================================
   CONSTRAINT 5 · Surge demand (3×) with review capacity cut (50%)
   ====================================================================== */
const SURGE_TIERS = [
  { id: 'commit', label: 'Existing commitments', rule: 'Booked work (ward rounds, booked discharge reconciliations, requested second signatures) is honoured first and never displaced.' },
  { id: 'critical', label: 'Active high-risk discrepancies', rule: 'Critical discrepancies and high-alert medicines (anticoagulants, insulin, opioids).', decide: 30, verify: 15, role: 'pharm', base: 2,
    safe: 'Escalated to the on-call pharmacist and medicines-information line. The patient keeps their last verified regimen, and nothing is auto-released.' },
  { id: 'missing', label: 'Missing critical information', rule: 'Records on hold for a missing safety fact (Constraint 12) need a clinician to answer the escalation.', decide: 15, verify: 10, role: 'clin', base: 1,
    safe: 'Stays blocked with its clarification request open. Nothing is released until a clinician confirms the facts.' },
  { id: 'discharge', label: 'Time-critical discharges', rule: 'Discharge reconciliations due within 24 hours.', decide: 25, verify: 10, role: 'any', base: 3,
    safe: 'Discharge list marked “being checked”. The patient leaves with the last verified list and a booked pharmacist call-back.' },
  { id: 'high', label: 'High-severity discrepancies', rule: 'Missing units or frequencies, new interacting medicines.', decide: 20, verify: 10, role: 'pharm', base: 4,
    safe: 'Wait-listed for the next shift. The patient’s current verified instructions continue unchanged.' },
  { id: 'moderate', label: 'Moderate discrepancies', rule: 'Formulation changes, omissions with a documented hold.', decide: 15, verify: 10, role: 'pharm', base: 5,
    safe: 'Wait-listed. The patient’s current verified instructions continue unchanged.' },
  { id: 'routine', label: 'Routine reviews', rule: 'Scheduled reviews with no open discrepancy.', decide: 10, verify: 5, role: 'any', base: 9,
    safe: 'Rescheduled to the next available routine slot. No clinical change.' },
];
const TIER = Object.fromEntries(SURGE_TIERS.map((t, i) => [t.id, { ...t, rank: i }]));
const ROSTER = [
  { id: 'MT-D-001044', name: 'R. Osei, PharmD', role: 'pharm', hours: 8 },
  { id: 'S-PH2', name: 'A. Kim, PharmD', role: 'pharm', hours: 8 },
  { id: 'S-PH3', name: 'J. Patel, PharmD', role: 'pharm', hours: 6 },
  { id: 'MT-D-001021', name: 'Dr. Léa Moreau', role: 'clin', hours: 6 },
  { id: 'S-CL2', name: 'Dr. N. Adeyemi', role: 'clin', hours: 6 },
  { id: 'S-CL3', name: 'Dr. T. Brennan', role: 'clin', hours: 4 },
];
const COMMITMENTS = [
  { id: 'C-1', staff: 'MT-D-001044', role: 'pharm', min: 30, label: 'Ward medication-safety huddle (booked 09:00)' },
  { id: 'C-2', staff: 'MT-D-001021', role: 'clin', min: 60, label: '3 booked discharge reconciliations (clinic list)' },
  { id: 'C-3', staff: 'S-PH2', role: 'pharm', min: 45, label: 'Anticoagulation clinic (booked)' },
  { id: 'C-4', staff: 'S-CL2', role: 'clin', min: 30, label: 'Second signatures already requested' },
];
const ROLE_LABEL = { pharm: 'Pharmacist', clin: 'Clinician', any: 'Pharmacist or clinician' };

function surgeRequests(db, demand) {
  // Live items from the real record first, then synthetic surge patients (clearly labelled), deterministic.
  const live = [];
  MEDS.forEach(m => { const it = db.recon.items[m.id]; if (m.severity !== 'none' && it && ['open', 'decided'].includes(it.status)) live.push({ id: `LIVE-${m.id}`, tier: m.severity === 'critical' || m.highAlert ? 'critical' : m.severity === 'high' ? 'high' : 'moderate', label: `${m.name}: ${m.findings[0]}`, patient: 'Mara Lindqvist', live: true, waited: 1260 }); });
  (db.recon.flagged || []).forEach(f => { const it = db.recon.items[f.id]; if (it && ['open', 'decided'].includes(it.status)) live.push({ id: `LIVE-${f.id}`, tier: f.severity === 'critical' ? 'critical' : f.severity === 'high' ? 'high' : 'moderate', label: `${f.name}: flagged`, patient: userById(db, f.patientId)?.profile.fullName, live: true, waited: 300 }); });
  db.prescriptions.filter(r => RX_ON_HOLD.includes(r.status)).forEach(r => live.push({ id: `LIVE-${r.id}`, tier: 'missing', label: `${r.title}: missing critical facts`, patient: userById(db, r.patientId)?.profile.fullName, live: true, waited: Math.round((Date.now() - Date.parse(r.uploadedAt)) / MIN) }));
  let seed = 7; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const LBL = { critical: ['Warfarin INR plan unclear', 'Insulin dose conflict', 'Opioid dose doubled across visits', 'DOAC dose conflict'], missing: ['Transfer record: route not stated', 'Transfer record: renal function missing'], discharge: ['Discharge reconciliation due today', 'Discharge list to verify before 17:00'], high: ['Frequency missing', 'Unit missing', 'New NSAID with anticoagulant', 'Duplicate therapy'], moderate: ['Formulation change', 'Omitted medicine on hold', 'Brand/generic duplication'], routine: ['Scheduled 3-month review', 'Annual medicines review', 'Post-clinic list check'] };
  const out = [...live];
  SURGE_TIERS.filter(t => t.base).forEach(t => {
    const target = Math.round(t.base * demand), have = out.filter(r => r.tier === t.id).length;
    for (let k = 0; k < target - have; k++) out.push({ id: `S-${t.id}-${k + 1}`, tier: t.id, label: LBL[t.id][k % LBL[t.id].length], patient: `Synthetic patient S-${String(100 + Math.floor(rnd() * 900))}`, live: false, waited: Math.round(5 + rnd() * 420) });
  });
  return out;
}

function allocateSurge(db, demand, capPct) {
  const staff = ROSTER.map(s => { const cap = Math.floor(s.hours * 60 * capPct / 100 / 15) * 15; return { ...s, baseMin: s.hours * 60, cap, used: 0, tasks: [] }; });
  const byId = Object.fromEntries(staff.map(s => [s.id, s]));
  const free = (s) => s.cap - s.used;
  // P0: existing commitments, honoured first (re-assigned within role if the booked person lost capacity)
  const commits = COMMITMENTS.map(c => {
    let s = byId[c.staff];
    if (free(s) < c.min) s = staff.filter(x => x.role === c.role && free(x) >= c.min).sort((a, b) => free(b) - free(a))[0];
    if (!s) return { ...c, status: 'unmet' };
    s.used += c.min; s.tasks.push({ kind: 'commit', min: c.min, label: c.label });
    return { ...c, status: s.id === c.staff ? 'kept' : 'reassigned', assignedTo: s.id };
  });
  const reqs = surgeRequests(db, demand).sort((a, b) => TIER[a.tier].rank - TIER[b.tier].rank || b.waited - a.waited || a.id.localeCompare(b.id));
  const pick = (role, need, exclude) => {
    const pool = staff.filter(s => s.id !== exclude && free(s) >= need);
    const pref = pool.filter(s => role === 'any' || s.role === role).sort((a, b) => free(b) - free(a));
    return pref[0] || null;
  };
  const results = [];
  reqs.forEach(r => {
    const t = TIER[r.tier];
    const a = pick(t.role, t.decide, null);
    const otherRole = a ? (a.role === 'pharm' ? 'clin' : 'pharm') : null;
    const b = a ? (pick(otherRole, t.verify, a.id) || pick('any', t.verify, a.id)) : null;
    if (a && b) { // atomic: both reviewers or none
      a.used += t.decide; b.used += t.verify;
      a.tasks.push({ kind: 'decide', min: t.decide, req: r.id }); b.tasks.push({ kind: 'verify', min: t.verify, req: r.id });
      results.push({ ...r, status: 'scheduled', decider: a.id, verifier: b.id, min: t.decide + t.verify });
    } else {
      const reason = !a ? `No ${ROLE_LABEL[t.role].toLowerCase()} has ${t.decide} min free` : `No second reviewer has ${t.verify} min free for the two-person sign-off`;
      results.push({ ...r, status: 'waitlisted', reason, min: t.decide + t.verify });
    }
  });
  // Wait-list estimate: simulate following shifts at the same reduced capacity (commitments excluded), in priority order.
  const shiftCap = staff.reduce((x, s) => x + s.cap, 0);
  let shift = 1, left = shiftCap, pos = 0;
  results.filter(r => r.status === 'waitlisted').forEach(r => {
    pos++; if (r.min > left) { shift++; left = shiftCap; } left -= r.min;
    r.position = pos; r.eta = shift === 1 ? 'Next shift' : shift <= 3 ? `Shift +${shift}` : 'Beyond 3 shifts';
  });
  const totals = {
    capacity: staff.reduce((x, s) => x + s.cap, 0), baseline: staff.reduce((x, s) => x + s.baseMin, 0),
    committed: commits.filter(c => c.status !== 'unmet').reduce((x, c) => x + c.min, 0),
    allocated: results.filter(r => r.status === 'scheduled').reduce((x, r) => x + r.min, 0),
    demand: results.reduce((x, r) => x + r.min, 0) + COMMITMENTS.reduce((x, c) => x + c.min, 0),
    waitMin: results.filter(r => r.status === 'waitlisted').reduce((x, r) => x + r.min, 0),
    served: results.filter(r => r.status === 'scheduled').length, waitlisted: results.filter(r => r.status === 'waitlisted').length,
  };
  totals.used = totals.committed + totals.allocated;
  const overStaff = staff.filter(s => s.used > s.cap);
  return { staff, commits, results, totals, ok: overStaff.length === 0 && totals.used <= totals.capacity, overStaff };
}
const hm = (min) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;

function SurgePage() {
  const { db, me, mutate, toast } = useApp();
  const sg = db.surge || { demand: 3, capacity: 50, actions: {}, published: null };
  const [demand, setDemand] = useState(sg.demand), [cap, setCap] = useState(sg.capacity);
  const [filter, setFilter] = useState('wait');
  const plan = useMemo(() => allocateSurge(db, demand, cap), [db, demand, cap]);
  const base = useMemo(() => allocateSurge(db, 1, 100), [db]);
  const { totals: T, staff, commits, results } = plan;
  const setScenario = (d, c) => { setDemand(d); setCap(c); mutate(n => { n.surge = { ...(n.surge || {}), demand: d, capacity: c, actions: n.surge?.actions || {} }; }, { silent: true }); };
  const act = (r, type) => {
    mutate(n => { n.surge = n.surge || { actions: {} }; n.surge.actions = n.surge.actions || {}; n.surge.actions[r.id] = { type, at: nowISO(), by: me.id };
      pushAudit(n, { ...actorOf(me), action: type === 'escalated' ? 'SURGE_ESCALATED' : 'SURGE_PATIENT_INFORMED', patientId: r.live ? MARA_ID : null, item: r.id, detail: `${r.label} (${TIER[r.tier].label}) wait-listed at #${r.position}, ${r.eta}. ${type === 'escalated' ? 'Escalated to on-call pharmacist / medicines information.' : 'Patient told to continue last verified instructions.'}` }); });
    toast(type === 'escalated' ? 'Escalated to the on-call pharmacist' : 'Recorded: patient informed of the wait');
  };
  const publish = () => {
    mutate(n => { n.surge = { ...(n.surge || {}), demand, capacity: cap, published: { at: nowISO(), by: me.id, summary: `${T.served} scheduled, ${T.waitlisted} wait-listed` } };
      pushAudit(n, { ...actorOf(me), action: 'SURGE_PLAN_PUBLISHED', item: `surge-${demand}x-${cap}`, detail: `Demand ${demand}× (${results.length} requests, ${hm(T.demand)}), capacity ${cap}% (${hm(T.capacity)} available). Commitments ${hm(T.committed)} honoured; ${T.served} scheduled (${hm(T.allocated)}); ${T.waitlisted} wait-listed. Over-allocation: none.` }); });
    toast('Surge plan published to the audit trail');
  };
  const maxBar = Math.max(T.capacity, T.demand, 1);
  const pctW = (m) => `${(m / maxBar) * 100}%`;
  const shown = results.filter(r => filter === 'all' || (filter === 'wait' ? r.status === 'waitlisted' : r.status === 'scheduled'));
  const sName = (id) => ROSTER.find(s => s.id === id)?.name;
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Constraint 5 · capacity crunch" title="Surge capacity planner" sub="Recomputes review capacity when demand rises and staff are short. Booked work is kept, priority rules are applied in the open, no reviewer is booked beyond their hours, and anything that can't be served gets a wait-list place and a safe interim state." actions={<Btn kind="primary" onClick={publish}><Send size={14} />Publish surge plan</Btn>} />
      <Panel title="Scenario" icon={Activity} right={<div className="flex flex-wrap gap-2"><Btn size="sm" onClick={() => setScenario(1, 100)} className={demand === 1 && cap === 100 ? 'border-accent text-accent' : ''}>Normal operations</Btn><Btn size="sm" onClick={() => setScenario(3, 50)} className={demand === 3 && cap === 50 ? 'border-accent text-accent' : ''}>Surge: 3× demand, 50% staff</Btn></div>}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label={`Demand multiplier: ${demand}×`} id="sg-demand" hint={`Baseline ${base.results.length} requests/shift → now ${results.length}`}><input id="sg-demand" type="range" min="1" max="4" step="0.5" value={demand} onChange={e => setScenario(+e.target.value, cap)} className="w-full accent-[rgb(var(--c-accent))]" /></Field>
          <Field label={`Review capacity: ${cap}% of normal staffing`} id="sg-cap" hint={`Baseline ${hm(T.baseline)} → now ${hm(T.capacity)} (rounded down to whole 15-minute slots)`}><input id="sg-cap" type="range" min="25" max="100" step="5" value={cap} onChange={e => setScenario(demand, +e.target.value)} className="w-full accent-[rgb(var(--c-accent))]" /></Field>
        </div>
        {sg.published && <p className="mt-2 text-[12px] text-muted">Last published {fmtTs(sg.published.at)} by {nameOf(db, sg.published.by)}: {sg.published.summary}.</p>}
      </Panel>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Available review time" value={hm(T.capacity)} sub={`${staff.filter(s => s.cap > 0).length} reviewers · normal ${hm(T.baseline)}`} icon={Users} />
        <Stat label="Surge demand load" value={hm(T.demand)} sub={`${results.length} requests + ${COMMITMENTS.length} commitments`} icon={Activity} tone="high" />
        <Stat label="Scheduled this shift" value={`${T.served}`} sub={`${hm(T.used)} used of ${hm(T.capacity)}`} icon={CheckCircle2} tone="ok" />
        <Stat label="Wait-listed" value={`${T.waitlisted}`} sub={`${hm(T.waitMin)} of work, each with a safe interim state`} icon={Clock} tone="crit" />
      </div>

      <Panel title="Capacity vs demand (this shift)" icon={Activity} right={<Badge meta={plan.ok ? { label: `Feasible: allocated ${hm(T.used)} ≤ available ${hm(T.capacity)} · no reviewer over their hours`, cls: 'text-ok bg-ok/10 ring-ok/30', icon: ShieldCheck } : { label: 'Over-allocation detected', cls: 'text-crit bg-crit/10 ring-crit/30', icon: AlertTriangle }} />}>
        <div className="grid gap-3">
          {[['Capacity', [[T.committed, 'bg-navy', 'Commitments'], [T.allocated, 'bg-accent', 'Allocated'], [T.capacity - T.used, 'bg-raised', 'Unused']]], ['Demand', [[T.committed, 'bg-navy', 'Commitments'], [T.allocated, 'bg-accent', 'Served'], [T.waitMin, 'bg-high/70', 'Wait-listed']]]].map(([lbl, segs]) => (
            <div key={lbl} className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-3">
              <div className="text-[13px] font-semibold">{lbl}</div>
              <div className="flex h-7 overflow-hidden rounded-lg bg-bg ring-1 ring-line" role="img" aria-label={`${lbl}: ${segs.map(s => `${s[2]} ${hm(s[0])}`).join(', ')}`}>{segs.filter(s => s[0] > 0).map(([m, cls, l]) => <div key={l} className={`${cls} h-full flex items-center justify-center text-[11px] font-semibold ${cls === 'bg-raised' ? 'text-muted' : 'text-white'} overflow-hidden whitespace-nowrap`} style={{ width: pctW(m) }} title={`${l}: ${hm(m)}`}>{(m / maxBar) > 0.1 ? `${l} ${hm(m)}` : ''}</div>)}</div>
            </div>))}
          <div className="flex flex-wrap gap-4 text-[12px] text-muted">{[['bg-navy', 'Existing commitments'], ['bg-accent', 'Allocated / served'], ['bg-high/70', 'Wait-listed demand'], ['bg-raised', 'Unused capacity']].map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${c}`}></span>{l}</span>)}</div>
        </div>
      </Panel>

      <div className="grid gap-4 2xl:grid-cols-5">
        <Panel className="2xl:col-span-3 min-w-0" title="Priority rules (applied top to bottom)" icon={ListChecks} pad={false}>
          <div className="scroll-x"><table className="w-full min-w-[560px] text-[13px]">
            <thead><tr className="border-b border-line text-left">{['#', 'Rule', 'Effort (decide + verify)', 'Scheduled', 'Wait-listed'].map(h => <th key={h} className="px-3 py-2 eyebrow first:pl-4">{h}</th>)}</tr></thead>
            <tbody>{SURGE_TIERS.map((t, i) => { const rs = results.filter(r => r.tier === t.id); return (
              <tr key={t.id} className="border-b border-line/60 align-top">
                <td className="pl-4 pr-3 py-2.5 font-mono font-bold text-accent">P{i}</td>
                <td className="px-3 py-2.5 min-w-[260px]"><div className="font-semibold">{t.label}</div><div className="text-[12px] text-muted max-w-[52ch]">{t.rule}</div></td>
                <td className="px-3 py-2.5 font-mono text-[12px] whitespace-nowrap">{t.id === 'commit' ? 'as booked' : `${t.decide} + ${t.verify} min · ${ROLE_LABEL[t.role]}`}</td>
                <td className="px-3 py-2.5 tnum font-semibold text-ok">{t.id === 'commit' ? `${commits.filter(c => c.status !== 'unmet').length}/${commits.length}` : rs.filter(r => r.status === 'scheduled').length}</td>
                <td className={`px-3 py-2.5 tnum font-semibold ${t.id === 'commit' ? (commits.some(c => c.status === 'unmet') ? 'text-crit' : 'text-muted') : rs.some(r => r.status === 'waitlisted') ? 'text-high' : 'text-muted'}`}>{t.id === 'commit' ? commits.filter(c => c.status === 'unmet').length : rs.filter(r => r.status === 'waitlisted').length}</td>
              </tr>); })}</tbody></table></div>
          <p className="px-4 py-3 text-[12px] text-muted">Within a rule, the longest-waiting request goes first. Each request needs two different reviewers (decide, then verify) and is scheduled only if both fit. Requests are never split or partly booked. A lower rule is scheduled only into time no higher request can use, for example clinician time when the waiting higher item needs a pharmacist.</p>
        </Panel>
        <Panel className="2xl:col-span-2 min-w-0" title="Reviewer allocation" icon={Users}>
          <ul className="grid gap-x-6 gap-y-2.5 md:grid-cols-2 2xl:grid-cols-1">{staff.map(s => (
            <li key={s.id} className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-[13px]"><span className="font-semibold truncate">{s.name} <span className="font-normal text-muted">· {ROLE_LABEL[s.role]}</span></span><span className="font-mono tnum text-[12px] text-muted whitespace-nowrap">{hm(s.used)} / {hm(s.cap)}</span></div>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-raised" role="img" aria-label={`${s.name}: ${hm(s.used)} of ${hm(s.cap)} booked`}>
                <div className="bg-navy" style={{ width: s.cap ? `${s.tasks.filter(t => t.kind === 'commit').reduce((x, t) => x + t.min, 0) / s.cap * 100}%` : 0 }}></div>
                <div className="bg-accent" style={{ width: s.cap ? `${s.tasks.filter(t => t.kind !== 'commit').reduce((x, t) => x + t.min, 0) / s.cap * 100}%` : 0 }}></div>
              </div>
              <div className="text-[11px] text-muted">Normal {hm(s.baseMin)} · {s.tasks.filter(t => t.kind === 'decide').length} decisions, {s.tasks.filter(t => t.kind === 'verify').length} verifications</div>
            </li>))}</ul>
          <div className="mt-3 grid gap-1.5">{commits.map(c => <div key={c.id} className="flex flex-wrap items-center gap-2 text-[12px]"><Chip tone={c.status === 'unmet' ? 'crit' : 'navy'}>{c.status === 'kept' ? 'Kept' : c.status === 'reassigned' ? 'Reassigned' : 'Unmet'}</Chip><span>{c.label}</span><span className="text-muted">· {c.min} min · {sName(c.assignedTo || c.staff)}</span></div>)}</div>
        </Panel>
      </div>

      <Panel title="Request queue" icon={ClipboardList} right={<Segmented value={filter} onChange={setFilter} options={[['wait', 'Wait-listed', T.waitlisted], ['sched', 'Scheduled', T.served], ['all', 'All', results.length]]} />} pad={false}>
        <div className="scroll-x"><table className="w-full min-w-[900px] text-[13px]">
          <thead><tr className="border-b border-line text-left">{['Priority', 'Request', 'Patient', 'Status', filter === 'sched' ? 'Reviewers' : 'Wait-list & safe interim state', ''].map(h => <th key={h} className="px-3 py-2 eyebrow first:pl-4">{h}</th>)}</tr></thead>
          <tbody>{shown.map(r => { const t = TIER[r.tier], a = (sg.actions || {})[r.id]; return (
            <tr key={r.id} className="border-b border-line/60 align-top">
              <td className="pl-4 pr-3 py-2.5"><span className="font-mono font-bold text-accent">P{t.rank}</span><div className="text-[11.5px] text-muted">{t.label}</div></td>
              <td className="px-3 py-2.5"><div className="font-semibold">{r.label}</div><div className="text-[11.5px] text-muted">waiting {hm(r.waited)} · {r.min} min of review{r.live ? '' : ' · synthetic surge load'}</div>{r.live && <Chip tone="accent">Live record</Chip>}</td>
              <td className="px-3 py-2.5">{r.patient}</td>
              <td className="px-3 py-2.5">{r.status === 'scheduled' ? <Badge meta={{ label: 'Scheduled', cls: 'text-ok bg-ok/10 ring-ok/30', icon: CheckCircle2 }} /> : <div className="grid gap-1"><Badge meta={{ label: `Wait-listed #${r.position}`, cls: 'text-high bg-high/10 ring-high/30', icon: Clock }} /><span className="text-[11.5px] text-muted">{r.eta}</span></div>}</td>
              <td className="px-3 py-2.5 max-w-[46ch]">{r.status === 'scheduled' ? <span className="text-[12.5px]">{sName(r.decider)} decides → {sName(r.verifier)} verifies</span> : <div className="grid gap-1 text-[12.5px]"><span className="text-crit">{r.reason}.</span><span><b>Safe interim state:</b> {t.safe}</span></div>}</td>
              <td className="px-3 py-2.5 whitespace-nowrap">{r.status === 'waitlisted' && (a ? <Chip tone="ok"><Check size={11} />{a.type === 'escalated' ? 'Escalated' : 'Patient informed'}</Chip> : r.tier === 'critical' || r.tier === 'missing' ? <Btn size="sm" kind="danger" onClick={() => act(r, 'escalated')}>Escalate to on-call</Btn> : <Btn size="sm" onClick={() => act(r, 'informed')}>Mark patient informed</Btn>)}</td>
            </tr>); })}</tbody></table></div>
        {shown.length === 0 && <div className="p-4"><Empty icon={CheckCircle2} title={filter === 'wait' ? 'Nobody is wait-listed' : 'Nothing scheduled'} body={filter === 'wait' ? 'Capacity covers all demand at these settings.' : ''} /></div>}
        <p className="px-4 py-3 text-[12px] text-muted">This is a planning view. Wait-listing never releases anything: live records stay “Being checked” for the patient until two professionals sign them off in the review queue.</p>
      </Panel>
    </div>
  );
}

/* Dashboard card: open escalations for the signed-in professional */
function EscalationsCard({ go }) {
  const { db, me } = useApp();
  const mine = (db.escalations || []).filter(e => e.status === 'open' && (e.to === me.id || e.raisedBy === me.id));
  const blocked = db.prescriptions.filter(r => RX_ON_HOLD.includes(r.status) && canAccess(db, me.id, r.patientId, 'prescriptions'));
  return (
    <Panel title="Missing-information holds" icon={ShieldAlert} right={<Btn size="sm" onClick={() => go('verify')}>Open</Btn>}>
      {blocked.length === 0 && mine.length === 0 ? <p className="text-[13px] text-muted">No records on hold.</p> : <ul className="grid gap-2">
        {blocked.map(r => { const e = mine.find(x => x.rxId === r.id); return <li key={r.id}><button onClick={() => go('verify', r.id)} className="w-full text-left rounded-xl border border-crit/30 bg-crit/[.04] p-2.5 hover:bg-crit/[.08]"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[13.5px]">{r.title}</span><RxBadge status={r.status} /></div><div className="text-[12px] text-muted">{userById(db, r.patientId)?.profile.fullName} · {e ? (e.to === me.id ? 'Waiting for your answer' : `Waiting for ${e.to === 'external' ? 'sending unit' : nameOf(db, e.to)}`) : 'Needs escalation'}</div></button></li>; })}
      </ul>}
    </Panel>
  );
}
