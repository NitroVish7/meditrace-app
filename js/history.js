/* My Medical History: conditions, treatments, hospital visits, prescriptions, allergies and an interactive timeline.
   Each entry keeps its source: patient-reported vs professionally documented. */
const HX_TYPES = {
  visit: { label: 'Hospital visit', icon: Building2, tone: 'navy', dot: 'bg-navy' },
  condition: { label: 'Diagnosis', icon: HeartPulse, tone: 'crit', dot: 'bg-crit' },
  treatment: { label: 'Treatment', icon: Syringe, tone: 'info', dot: 'bg-info' },
  rx: { label: 'Prescription', icon: FileText, tone: 'accent', dot: 'bg-accent' },
  allergy: { label: 'Allergy recorded', icon: AlertTriangle, tone: 'high', dot: 'bg-high' },
};

function hxEvents(db, pid, can) {
  const rec = db.records[pid] || { conditions: [], treatments: [], visits: [], allergies: [] }; const ev = [];
  if (can.history) {
    rec.conditions.forEach(c => c.diagnosed && ev.push({ type: 'condition', id: c.id, date: c.diagnosed, title: c.name, sub: `${c.status === 'resolved' ? 'Resolved' : 'Current'}${c.facility ? ` · ${c.facility}` : ''}`, src: c.source, by: c.by }));
    rec.treatments.forEach(t => t.start && ev.push({ type: 'treatment', id: t.id, date: t.start, title: t.name, sub: `${t.facility || ''}${t.end ? ` · until ${fmtDate(t.end)}` : ''}`, src: t.source, by: t.by }));
    rec.allergies.forEach(a => a.recordedAt && ev.push({ type: 'allergy', id: a.id, date: a.recordedAt, title: `${a.substance} allergy`, sub: a.reaction || '', src: a.source, by: a.by }));
  }
  if (can.visits) rec.visits.forEach(v => ev.push({ type: 'visit', id: v.id, date: v.visitDate, title: v.hospital, sub: v.reason, src: v.source, by: v.by }));
  if (can.prescriptions) db.prescriptions.filter(r => r.patientId === pid).forEach(r => ev.push({ type: 'rx', id: r.id, date: r.date, title: r.title, sub: `${r.prescriber.name} · ${RX_STATUS[r.status].label}`, src: r.kind === 'handover' ? 'professional' : 'patient', by: r.uploadedBy }));
  return ev.sort((a, b) => b.date.localeCompare(a.date));
}

function HxForm({ kind, pid, onClose }) {
  const { db, me, mutate, toast } = useApp();
  const rec = db.records[pid];
  const blank = { condition: { name: '', diagnosed: '', status: 'current', doctor: '', facility: '', notes: '' }, treatment: { name: '', conditionId: '', facility: '', doctor: '', start: '', end: '', outcome: '', visitId: '' }, visit: { hospital: '', visitDate: '', admission: '', discharge: '', reason: '', doctor: '', summary: '', rxIds: [], treatmentIds: [] }, allergy: { substance: '', reaction: '', recordedAt: ymd(), sourceLabel: '' } }[kind];
  const [f, setF] = useState(blank); const [err, setErr] = useState('');
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const toggle = (k, id) => setF(s => ({ ...s, [k]: s[k].includes(id) ? s[k].filter(x => x !== id) : [...s[k], id] }));
  const pro = me.role === 'doctor';
  const today = ymd();
  const save = () => {
    const req = { condition: ['name', 'diagnosed'], treatment: ['name', 'start'], visit: ['hospital', 'visitDate', 'reason'], allergy: ['substance', 'recordedAt'] }[kind];
    if (req.some(k => !String(f[k]).trim())) return setErr('Fill in the required fields.');
    const dates = ['diagnosed', 'start', 'end', 'visitDate', 'admission', 'discharge', 'recordedAt'].filter(k => f[k]);
    if (dates.some(k => f[k] > today)) return setErr('Dates can’t be in the future.');
    if (kind === 'treatment' && f.end && f.end < f.start) return setErr('The end date is before the start date.');
    if (kind === 'visit' && f.admission && f.discharge && f.discharge < f.admission) return setErr('The discharge date is before the admission date.');
    const id = uid(kind.slice(0, 2).toUpperCase());
    const entry = { ...f, id, source: pro ? 'professional' : 'patient', by: me.id, createdAt: nowISO(), ...(pro ? { sourceLabel: f.sourceLabel || `${me.profile.fullName}, ${orgOf(me)}` } : {}) };
    const key = { condition: 'conditions', treatment: 'treatments', visit: 'visits', allergy: 'allergies' }[kind];
    mutate(n => {
      n.records[pid][key].push(entry);
      if (kind === 'visit') entry.treatmentIds.forEach(tid => { const t = n.records[pid].treatments.find(x => x.id === tid); if (t && !t.visitId) t.visitId = id; });
      const label = { condition: entry.name, treatment: entry.name, visit: `${entry.hospital} visit on ${fmtDate(entry.visitDate)}`, allergy: `${entry.substance} allergy` }[kind];
      pushAudit(n, { ...actorOf(me), action: 'HISTORY_ADDED', patientId: pid, item: id, detail: `${HX_TYPES[kind === 'condition' ? 'condition' : kind].label} added: ${label}. Source: ${pro ? 'professionally documented' : 'patient-reported'}.${kind === 'visit' && (entry.rxIds.length || entry.treatmentIds.length) ? ` Linked ${entry.rxIds.length} prescription(s), ${entry.treatmentIds.length} treatment(s).` : ''}` });
      notify(n, pid, { type: 'history', title: 'Medical history updated', body: `${pro ? me.profile.fullName + ' added' : 'You added'}: ${label}.`, priority: pro ? 'normal' : 'low', link: 'history', ref: id });
    });
    toast('Saved to medical history'); onClose(id);
  };
  const rxs = db.prescriptions.filter(r => r.patientId === pid);
  return (
    <div className="grid gap-3">
      <div className="flex">{pro ? <SourceTag source="professional" label={me.profile.fullName} /> : <SourceTag source="patient" />}</div>
      {kind === 'condition' && <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Medical condition" id="hx-name" required className="sm:col-span-2"><input id="hx-name" className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Date diagnosed" id="hx-diag" required><input id="hx-diag" type="date" max={today} className={inputCls} value={f.diagnosed} onChange={set('diagnosed')} /></Field>
        <Field label="Status" id="hx-status"><select id="hx-status" className={inputCls} value={f.status} onChange={set('status')}><option value="current">Current</option><option value="resolved">Resolved</option></select></Field>
        <Field label="Treating doctor" id="hx-doc" optional><input id="hx-doc" className={inputCls} value={f.doctor} onChange={set('doctor')} /></Field>
        <Field label="Hospital or clinic" id="hx-fac" optional><input id="hx-fac" className={inputCls} value={f.facility} onChange={set('facility')} /></Field>
        <Field label="Additional notes" id="hx-notes" optional className="sm:col-span-2"><textarea id="hx-notes" rows={2} className={inputCls} value={f.notes} onChange={set('notes')} /></Field>
      </div>}
      {kind === 'treatment' && <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Treatment received" id="hx-tname" required className="sm:col-span-2"><input id="hx-tname" className={inputCls} value={f.name} onChange={set('name')} /></Field>
        <Field label="Condition being treated" id="hx-tcond" optional><select id="hx-tcond" className={inputCls} value={f.conditionId} onChange={set('conditionId')}><option value="">Not linked</option>{rec.conditions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Linked hospital visit" id="hx-tvisit" optional><select id="hx-tvisit" className={inputCls} value={f.visitId} onChange={set('visitId')}><option value="">Not linked</option>{rec.visits.map(v => <option key={v.id} value={v.id}>{v.hospital} · {fmtDate(v.visitDate)}</option>)}</select></Field>
        <Field label="Hospital or clinic" id="hx-tfac" optional><input id="hx-tfac" className={inputCls} value={f.facility} onChange={set('facility')} /></Field>
        <Field label="Treating doctor" id="hx-tdoc" optional><input id="hx-tdoc" className={inputCls} value={f.doctor} onChange={set('doctor')} /></Field>
        <Field label="Start date" id="hx-tstart" required><input id="hx-tstart" type="date" max={today} className={inputCls} value={f.start} onChange={set('start')} /></Field>
        <Field label="End date" id="hx-tend" optional><input id="hx-tend" type="date" max={today} className={inputCls} value={f.end} onChange={set('end')} /></Field>
        <Field label="Outcome or status, if documented" id="hx-tout" optional className="sm:col-span-2"><input id="hx-tout" className={inputCls} value={f.outcome} onChange={set('outcome')} /></Field>
      </div>}
      {kind === 'visit' && <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Hospital name" id="hx-vh" required><input id="hx-vh" className={inputCls} value={f.hospital} onChange={set('hospital')} /></Field>
        <Field label="Visit date" id="hx-vd" required><input id="hx-vd" type="date" max={today} className={inputCls} value={f.visitDate} onChange={set('visitDate')} /></Field>
        <Field label="Admission date" id="hx-va" optional><input id="hx-va" type="date" max={today} className={inputCls} value={f.admission} onChange={set('admission')} /></Field>
        <Field label="Discharge date" id="hx-vdis" optional><input id="hx-vdis" type="date" max={today} className={inputCls} value={f.discharge} onChange={set('discharge')} /></Field>
        <Field label="Reason for visit" id="hx-vr" required className="sm:col-span-2"><input id="hx-vr" className={inputCls} value={f.reason} onChange={set('reason')} /></Field>
        <Field label="Doctor’s details" id="hx-vdoc" optional><input id="hx-vdoc" className={inputCls} value={f.doctor} onChange={set('doctor')} placeholder="Name, department" /></Field>
        <Field label="Discharge summary" id="hx-vs" optional className="sm:col-span-2"><textarea id="hx-vs" rows={2} className={inputCls} value={f.summary} onChange={set('summary')} /></Field>
        <div className="sm:col-span-2 grid gap-2"><div className="text-[12.5px] font-semibold">Associated prescriptions</div>{rxs.length ? <div className="grid sm:grid-cols-2 gap-2">{rxs.map(r => <Check2 key={r.id} id={`hx-rx-${r.id}`} checked={f.rxIds.includes(r.id)} onChange={() => toggle('rxIds', r.id)} label={r.title} desc={`${fmtDate(r.date)} · ${r.prescriber.name}`} />)}</div> : <p className="text-[12px] text-muted">No prescriptions uploaded yet.</p>}</div>
        <div className="sm:col-span-2 grid gap-2"><div className="text-[12.5px] font-semibold">Previous treatments from this visit</div>{rec.treatments.length ? <div className="grid sm:grid-cols-2 gap-2">{rec.treatments.map(t => <Check2 key={t.id} id={`hx-t-${t.id}`} checked={f.treatmentIds.includes(t.id)} onChange={() => toggle('treatmentIds', t.id)} label={t.name} desc={t.start ? fmtDate(t.start) : ''} />)}</div> : <p className="text-[12px] text-muted">Add a treatment first, then link it here.</p>}</div>
      </div>}
      {kind === 'allergy' && <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Allergy (substance)" id="hx-as" required><input id="hx-as" className={inputCls} value={f.substance} onChange={set('substance')} placeholder="e.g. Sulfa drugs" /></Field>
        <Field label="Recorded reaction" id="hx-ar" optional><input id="hx-ar" className={inputCls} value={f.reaction} onChange={set('reaction')} placeholder="e.g. Hives" /></Field>
        <Field label="Date recorded" id="hx-ad" required><input id="hx-ad" type="date" max={today} className={inputCls} value={f.recordedAt} onChange={set('recordedAt')} /></Field>
        <Field label="Source of this information" id="hx-asrc" optional><input id="hx-asrc" className={inputCls} value={f.sourceLabel} onChange={set('sourceLabel')} placeholder={pro ? 'e.g. Allergy clinic letter' : 'e.g. Told by my GP'} /></Field>
      </div>}
      {err && <div role="alert" className="rounded-xl bg-crit/10 px-3 py-2 text-[13px] text-crit">{err}</div>}
      <div className="flex justify-end gap-2 border-t border-line pt-3"><Btn onClick={() => onClose()}>Cancel</Btn><Btn kind="primary" onClick={save}><Check size={14} />Save</Btn></div>
    </div>
  );
}

function HxDetail({ db, pid, ev, can, openEv }) {
  const rec = db.records[pid];
  const by = ev.by && ev.by !== 'system' ? nameOf(db, ev.by) : null;
  const linkBtn = (type, id, label) => <button key={type + id} onClick={() => openEv({ type, id })} className="inline-flex items-center gap-1 rounded-lg border border-line px-2 py-1 text-[12.5px] hover:border-accent/50 hover:bg-raised/50">{React.createElement(HX_TYPES[type].icon, { size: 12 })}{label}</button>;
  if (ev.type === 'visit') { const v = rec.visits.find(x => x.id === ev.id); if (!v) return null; return (
    <div className="grid gap-3"><SourceTag source={v.source} label={by} /><dl className="grid sm:grid-cols-2 gap-3"><KV k="Hospital" v={v.hospital} /><KV k="Visit date" v={fmtDate(v.visitDate)} /><KV k="Admission" v={v.admission && fmtDate(v.admission)} /><KV k="Discharge" v={v.discharge && fmtDate(v.discharge)} /><KV k="Reason" v={v.reason} /><KV k="Doctor" v={v.doctor} /></dl>
      {v.summary && <div><div className="eyebrow">Discharge summary</div><p className="text-[13.5px] max-w-[65ch]">{v.summary}</p></div>}
      <div><div className="eyebrow mb-1">Associated records</div><div className="flex flex-wrap gap-1.5">{(v.rxIds || []).filter(() => can.prescriptions).map(id => { const r = db.prescriptions.find(x => x.id === id); return r && linkBtn('rx', id, r.title); })}{(v.treatmentIds || []).filter(() => can.history).map(id => { const t = rec.treatments.find(x => x.id === id); return t && linkBtn('treatment', id, t.name); })}{!(v.rxIds || []).length && !(v.treatmentIds || []).length && <span className="text-[12.5px] text-muted">None linked.</span>}</div></div></div>); }
  if (ev.type === 'condition') { const c = rec.conditions.find(x => x.id === ev.id); if (!c) return null; const tr = rec.treatments.filter(t => t.conditionId === c.id); return (
    <div className="grid gap-3"><SourceTag source={c.source} label={by} /><dl className="grid sm:grid-cols-2 gap-3"><KV k="Condition" v={c.name} /><KV k="Diagnosed" v={fmtDate(c.diagnosed)} /><KV k="Status" v={c.status === 'resolved' ? 'Resolved' : 'Current'} /><KV k="Treating doctor" v={c.doctor} /><KV k="Hospital / clinic" v={c.facility} /></dl>{c.notes && <p className="text-[13.5px]">{c.notes}</p>}
      <div><div className="eyebrow mb-1">Treatments</div><div className="flex flex-wrap gap-1.5">{tr.length ? tr.map(t => linkBtn('treatment', t.id, t.name)) : <span className="text-[12.5px] text-muted">None linked.</span>}</div></div></div>); }
  if (ev.type === 'treatment') { const t = rec.treatments.find(x => x.id === ev.id); if (!t) return null; const c = rec.conditions.find(x => x.id === t.conditionId); const v = rec.visits.find(x => x.id === t.visitId); return (
    <div className="grid gap-3"><SourceTag source={t.source} label={by} /><dl className="grid sm:grid-cols-2 gap-3"><KV k="Treatment" v={t.name} /><KV k="Hospital / clinic" v={t.facility} /><KV k="Treating doctor" v={t.doctor} /><KV k="Dates" v={`${fmtDate(t.start)}${t.end ? ` – ${fmtDate(t.end)}` : ' – ongoing'}`} /><KV k="Outcome" v={t.outcome} /></dl>
      <div className="flex flex-wrap gap-1.5">{c && linkBtn('condition', c.id, c.name)}{v && can.visits && linkBtn('visit', v.id, `${v.hospital} · ${fmtDate(v.visitDate)}`)}</div></div>); }
  if (ev.type === 'allergy') { const a = rec.allergies.find(x => x.id === ev.id); if (!a) return null; return (
    <div className="grid gap-3"><SourceTag source={a.source} label={a.sourceLabel || by} /><dl className="grid sm:grid-cols-2 gap-3"><KV k="Allergy" v={a.substance} /><KV k="Reaction" v={a.reaction} /><KV k="Source" v={a.sourceLabel} /><KV k="Date recorded" v={fmtDate(a.recordedAt)} /></dl></div>); }
  if (ev.type === 'rx') { const r = db.prescriptions.find(x => x.id === ev.id); if (!r) return null; const vs = rec.visits.filter(v => (v.rxIds || []).includes(r.id)); return (
    <div className="grid gap-3 lg:grid-cols-2"><div className="min-w-0"><RxDocument rx={r} /></div><div className="grid gap-3 content-start min-w-0"><RxBadge status={r.status} /><dl className="grid grid-cols-2 gap-3"><KV k="Date" v={fmtDate(r.date)} /><KV k="Prescribing doctor" v={r.prescriber.name} /><KV k="Hospital" v={r.prescriber.org} /><KV k="Medicines" v={r.kind === 'handover' ? 'See reconciliation' : r.meds.map(m => m.name).join(', ')} /></dl>
      {r.verification && <div className="text-[12.5px]"><b>Reviewed by</b> {r.verification.byName} ({r.verification.byDesignation}) on {fmtDate(r.verification.at)}. Original prescriber: {r.prescriber.name}.</div>}
      <div><div className="eyebrow mb-1">Review history</div>{r.reviews.length ? <ul className="text-[12.5px] grid gap-1">{r.reviews.map((x, i) => <li key={i}>{fmtTs(x.at)} · <b>{x.byName}</b> · {x.action.replace(/_/g, ' ').toLowerCase()}{x.comment ? `: “${x.comment}”` : ''}</li>)}</ul> : <p className="text-[12.5px] text-muted">None.</p>}</div>
      {vs.length > 0 && can.visits && <div className="flex flex-wrap gap-1.5">{vs.map(v => linkBtn('visit', v.id, `${v.hospital} · ${fmtDate(v.visitDate)}`))}</div>}</div></div>); }
  return null;
}

function MedicalHistory({ pid, nav }) {
  const { db, me } = useApp();
  const isPatient = me.role === 'patient';
  const sc = isPatient ? null : activeScopes(db, me.id, pid);
  const can = isPatient ? { history: true, visits: true, prescriptions: true } : { history: sc.has('history'), visits: sc.has('visits'), prescriptions: sc.has('prescriptions') };
  const canEdit = isPatient || can.history;
  const [tab, setTab] = useState('timeline');
  const [form, setForm] = useState(null);
  const [open, setOpen] = useState(null);
  const [typeFilter, setTypeFilter] = useState('all');
  useEffect(() => { if (nav?.ref) { const ev = hxEvents(db, pid, can).find(e => e.id === nav.ref); if (ev) setOpen(ev); } }, [nav?.n]);
  const rec = db.records[pid] || { conditions: [], treatments: [], visits: [], allergies: [] };
  const events = hxEvents(db, pid, can);
  const shown = events.filter(e => typeFilter === 'all' || e.type === typeFilter);
  const years = [...new Set(shown.map(e => e.date.slice(0, 4)))];
  const openEv = ({ type, id }) => { const e = hxEvents(db, pid, can).find(x => x.type === type && x.id === id); if (e) setOpen(e); };
  const tabs = [['timeline', 'Timeline'], can.history && ['conditions', 'Health conditions'], can.history && ['treatments', 'Previous treatments'], can.visits && ['visits', 'Hospital visits'], can.prescriptions && ['rx', 'Prescription history'], can.history && ['allergies', 'Allergies']].filter(Boolean);
  const rxs = db.prescriptions.filter(r => r.patientId === pid).sort((a, b) => b.date.localeCompare(a.date));
  const addBtn = (k, l) => canEdit && <Btn kind="primary" size="sm" onClick={() => setForm(k)}><Plus size={13} />{l}</Btn>;
  const Row = ({ type, id, title, sub, src, by, right }) => <li><button onClick={() => openEv({ type, id })} className="w-full text-left rounded-xl border border-line p-3 hover:border-accent/50 hover:bg-raised/40 transition grid gap-1"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{title}</span>{right}</div><div className="text-[12.5px] text-muted">{sub}</div><div><SourceTag source={src} label={src === 'professional' && by && by !== 'system' ? nameOf(db, by) : null} /></div></button></li>;
  return (
    <div className="grid gap-4">
      {isPatient && <PageHead eyebrow="Health record" title="My Medical History" sub="Your conditions, treatments, hospital visits, prescriptions and allergies in one place. Each entry shows whether you reported it or a professional documented it." actions={<>{addBtn('visit', 'Hospital visit')}{addBtn('condition', 'Condition')}{addBtn('treatment', 'Treatment')}{addBtn('allergy', 'Allergy')}</>} />}
      {!isPatient && canEdit && <div className="flex flex-wrap gap-2">{addBtn('visit', 'Hospital visit')}{addBtn('condition', 'Condition')}{addBtn('treatment', 'Treatment')}{addBtn('allergy', 'Allergy')}<span className="self-center text-[12px] text-muted">Entries you add are marked as professionally documented by you.</span></div>}
      {can.history && rec.allergies.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-crit/30 bg-crit/5 px-4 py-2.5 text-[13.5px]"><AlertTriangle size={16} className="text-crit" /><b className="text-crit">Allergies:</b>{rec.allergies.map(a => <span key={a.id}>{a.substance}{a.reaction ? ` (${a.reaction})` : ''}</span>)}</div>}
      <div className="scroll-x"><Segmented label="Medical history section" value={tab} onChange={setTab} options={tabs} /></div>

      {tab === 'timeline' && <Panel title="Medical history timeline" icon={History} right={<div className="flex flex-wrap gap-1">{[['all', 'All'], ...Object.entries(HX_TYPES).filter(([k]) => events.some(e => e.type === k)).map(([k, v]) => [k, v.label])].map(([k, l]) => <button key={k} onClick={() => setTypeFilter(k)} className={`rounded-full px-2.5 py-1 text-[12px] ${typeFilter === k ? 'bg-accent text-white dark:text-bg font-semibold' : 'bg-raised text-muted hover:text-fg'}`}>{l}</button>)}</div>}>
        {shown.length === 0 ? <Empty icon={History} title="No history to show" body={canEdit ? 'Add a hospital visit, condition or treatment to start your timeline.' : 'Nothing in the sections shared with you.'} /> :
        <div className="grid gap-6">{years.map(y => (
          <div key={y} className="grid grid-cols-[56px_minmax(0,1fr)] gap-3">
            <div className="font-display text-[20px] font-extrabold text-navy tnum pt-1">{y}</div>
            <ol className="relative border-l-2 border-line pl-5 grid gap-3">
              {shown.filter(e => e.date.startsWith(y)).map(e => { const T = HX_TYPES[e.type]; const I = T.icon; return (
                <li key={e.type + e.id} className="relative">
                  <span className={`absolute -left-[29px] top-3 h-3.5 w-3.5 rounded-full ring-4 ring-surface ${T.dot}`}></span>
                  <button onClick={() => setOpen(e)} className="pop w-full text-left rounded-xl border border-line bg-surface p-3 hover:border-accent/50 hover:-translate-y-px transition grid gap-1">
                    <div className="flex flex-wrap items-center gap-2"><Chip tone={T.tone}><I size={11} />{T.label}</Chip><span className="font-mono text-[12px] text-muted tnum">{fmtDate(e.date)}</span><span className="ml-auto"><SourceTag source={e.src} /></span></div>
                    <div className="font-semibold">{e.title}</div>{e.sub && <div className="text-[12.5px] text-muted">{e.sub}</div>}
                  </button>
                </li>); })}
            </ol>
          </div>))}</div>}
        {!isPatient && <p className="mt-3 text-[11.5px] text-muted">Only sections the patient shared with you are shown.</p>}
      </Panel>}
      {tab === 'conditions' && <Panel title="Health conditions" icon={HeartPulse} right={addBtn('condition', 'Add condition')}>{rec.conditions.length ? <ul className="grid gap-2 md:grid-cols-2">{[...rec.conditions].sort((a, b) => (b.diagnosed || '').localeCompare(a.diagnosed || '')).map(c => <Row key={c.id} type="condition" id={c.id} title={c.name} sub={`Diagnosed ${fmtDate(c.diagnosed)}${c.doctor ? ` · ${c.doctor}` : ''}${c.facility ? ` · ${c.facility}` : ''}`} src={c.source} by={c.by} right={<Chip tone={c.status === 'resolved' ? 'raised' : 'accent'}>{c.status === 'resolved' ? 'Resolved' : 'Current'}</Chip>} />)}</ul> : <Empty title="No conditions recorded" />}</Panel>}
      {tab === 'treatments' && <Panel title="Previous treatments" icon={Syringe} right={addBtn('treatment', 'Add treatment')}>{rec.treatments.length ? <ul className="grid gap-2 md:grid-cols-2">{[...rec.treatments].sort((a, b) => (b.start || '').localeCompare(a.start || '')).map(t => <Row key={t.id} type="treatment" id={t.id} title={t.name} sub={`${fmtDate(t.start)}${t.end ? ` – ${fmtDate(t.end)}` : ' – ongoing'} · ${rec.conditions.find(c => c.id === t.conditionId)?.name || 'No condition linked'}${t.outcome ? ` · ${t.outcome}` : ''}`} src={t.source} by={t.by} />)}</ul> : <Empty title="No treatments recorded" />}</Panel>}
      {tab === 'visits' && <Panel title="Hospital visit history" icon={Building2} right={addBtn('visit', 'Add visit')}>{rec.visits.length ? <ul className="grid gap-2">{[...rec.visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate)).map(v => <Row key={v.id} type="visit" id={v.id} title={`${v.hospital} · ${fmtDate(v.visitDate)}`} sub={`${v.reason}${v.admission ? ` · admitted ${fmtDate(v.admission)}` : ''}${v.discharge ? `, discharged ${fmtDate(v.discharge)}` : ''}${v.doctor ? ` · ${v.doctor}` : ''}`} src={v.source} by={v.by} right={<span className="text-[12px] text-muted">{(v.rxIds || []).length} prescription(s) · {(v.treatmentIds || []).length} treatment(s)</span>} />)}</ul> : <Empty title="No visits recorded" />}</Panel>}
      {tab === 'rx' && <Panel title="Prescription history" icon={FileText}>{rxs.length ? <ul className="grid gap-2">{rxs.map(r => <Row key={r.id} type="rx" id={r.id} title={r.title} sub={`${fmtDate(r.date)} · ${r.prescriber.name} · ${r.prescriber.org} · ${r.kind === 'handover' ? 'handover list' : r.meds.map(m => m.name).join(', ')} · ${r.reviews.length} review event(s)`} src={r.kind === 'handover' ? 'professional' : 'patient'} by={r.uploadedBy} right={<RxBadge status={r.status} />} />)}</ul> : <Empty title="No prescriptions" />}</Panel>}
      {tab === 'allergies' && <Panel title="Allergy information" icon={AlertTriangle} right={addBtn('allergy', 'Add allergy')}>{rec.allergies.length ? <ul className="grid gap-2 md:grid-cols-2">{rec.allergies.map(a => <Row key={a.id} type="allergy" id={a.id} title={a.substance} sub={`${a.reaction ? `Reaction: ${a.reaction} · ` : ''}Recorded ${fmtDate(a.recordedAt)}${a.sourceLabel ? ` · Source: ${a.sourceLabel}` : ''}`} src={a.source} by={a.by} />)}</ul> : <Empty icon={ShieldCheck} title="No known allergies recorded" />}</Panel>}

      <Modal open={!!form} onClose={() => setForm(null)} title={{ condition: 'Add a health condition', treatment: 'Add a previous treatment', visit: 'Record a hospital visit', allergy: 'Add allergy information' }[form] || ''} wide={form === 'visit'}>{form && <HxForm kind={form} pid={pid} onClose={(id) => { const k = form; setForm(null); if (id) setTimeout(() => setOpen(hxEvents(useAppDb.current, pid, can).find(e => e.id === id) || null), 0); }} />}</Modal>
      <Modal open={!!open} onClose={() => setOpen(null)} title={open ? `${HX_TYPES[open.type].label}: ${open.title}` : ''} wide={open?.type === 'rx'}>{open && <HxDetail db={db} pid={pid} ev={open} can={can} openEv={openEv} />}</Modal>
    </div>
  );
}
/* Latest db snapshot for callbacks that run after a state update. */
const useAppDb = { current: null };
