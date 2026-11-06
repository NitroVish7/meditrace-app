/* Original RxContinuum reconciliation modules, preserved and connected to MediTrace accounts and consent. */
const avgConf = (doc) => { const v = []; MEDS.forEach(m => { const x = m[doc]; if (x) Object.values(x.conf).forEach(c => c != null && v.push(c)); }); return v.reduce((a, b) => a + b, 0) / v.length; };

function ReconOverview({ go }) {
  const { db } = useApp();
  const items = db.recon.items;
  const disc = MEDS.filter(m => m.severity !== 'none');
  const counts = ['critical', 'high', 'moderate'].map(s => [s, disc.filter(m => m.severity === s).length]);
  const ready = MEDS.filter(m => ['verified', 'auto'].includes(items[m.id].status)).length;
  const byStatus = (s) => MEDS.filter(m => items[m.id].status === s).length;
  const steps = [
    { id: 'source', icon: ScanText, t: 'Extract', d: '2 documents · 15 entities', s: '1 low-confidence field set' },
    { id: 'matrix', icon: GitCompareArrows, t: 'Reconcile', d: '8 medicines compared', s: `${disc.length} discrepancies` },
    { id: 'review', icon: ClipboardCheck, t: 'Review', d: `${byStatus('open')} need decision · ${byStatus('decided')} to verify`, s: `${byStatus('escalated')} with prescriber` },
    { id: 'patientview', icon: UserRound, t: 'Patient view', d: `${ready} of ${MEDS.length} medicines released`, s: 'Unverified items held back' },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="lg:col-span-2 grid gap-4 min-w-0">
        <Panel title="Handover pipeline" icon={Activity}>
          <div className="grid gap-2 sm:grid-cols-4">
            {steps.map(st => { const I = st.icon; return (
              <button key={st.id} onClick={() => go(st.id)} className="group text-left rounded-xl border border-line bg-raised/40 hover:bg-raised hover:border-accent/50 p-3 transition">
                <div className="flex items-center justify-between"><I size={18} className="text-accent" /><ArrowRight size={14} className="text-muted group-hover:text-accent" /></div>
                <div className="mt-2 font-display text-[15px] font-bold">{st.t}</div><div className="text-xs text-fg/80 tnum">{st.d}</div><div className="text-[11px] text-muted mt-0.5">{st.s}</div>
              </button>); })}
          </div>
        </Panel>
        <Panel title="What needs attention" icon={AlertTriangle} right={<Btn size="sm" onClick={() => go('matrix')}>Open matrix <ChevronRight size={14} /></Btn>}>
          <div className="flex h-2 overflow-hidden rounded-full bg-raised mb-3">{counts.map(([s, n]) => <div key={s} className={SEV[s].bar} style={{ width: `${n / disc.length * 100}%` }}></div>)}</div>
          <div className="flex flex-wrap gap-4 mb-4 text-xs text-muted">{counts.map(([s, n]) => <span key={s} className="flex items-center gap-1.5"><span className={`h-2 w-2 rounded-full ${SEV[s].dot}`}></span>{SEV[s].label} <b className="text-fg tnum">{n}</b></span>)}</div>
          <ul className="divide-y divide-line">
            {[...disc].sort((a, b) => SEV[a.severity].order - SEV[b.severity].order).map(m => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5"><SevBadge sev={m.severity} small /><span className="font-semibold">{m.name}</span><span className="text-xs text-muted">{m.findings[0]}</span><span className="ml-auto"><StatusBadge status={items[m.id].status} /></span></li>))}
          </ul>
        </Panel>
      </div>
      <div className="grid gap-4 content-start min-w-0">
        <Panel title="Clinical context" icon={UserRound}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2">{[['Age / sex', `${PATIENT.age} ${PATIENT.sex}`], ['Weight', `${PATIENT.weightKg} kg`], ['SCr', `${PATIENT.scr} mg/dL`], ['eGFR', `${PATIENT.egfr} mL/min/1.73m²`]].map(([k, v]) => <KV key={k} k={k} v={v} mono />)}</dl>
          <div className="mt-3"><div className="eyebrow">Allergies</div><div className="text-crit text-[13px] font-semibold">{PATIENT.allergies.join(', ')}</div></div>
          <div className="mt-3"><div className="eyebrow">Problems</div><div className="flex flex-wrap gap-1 mt-1">{PATIENT.dx.map(d => <Chip key={d}>{d}</Chip>)}</div></div>
        </Panel>
        <Panel title="Care transition" icon={History}>
          <ol className="relative ml-2 border-l border-line pl-4 grid gap-4">
            {['A', 'B'].map(k => { const d = DOCS[k]; return (
              <li key={k} className="relative"><span className="absolute -left-[22px] top-1 h-3 w-3 rounded-full border-2 border-accent bg-bg"></span>
                <div className="text-xs font-mono text-muted tnum">{d.date} · {d.short}</div><div className="font-semibold">{d.title}</div>
                <div className="text-xs text-muted">{d.source} · {d.author}</div><div className="text-xs text-muted">{d.format} · mean confidence <span className="font-mono text-fg tnum">{avgConf(k).toFixed(2)}</span></div></li>); })}
          </ol>
        </Panel>
      </div>
    </div>
  );
}

function Extraction({ sel }) {
  const { masked } = useApp();
  const [doc, setDoc] = useState(sel?.doc || 'A');
  const [medId, setMedId] = useState(sel?.med || null);
  const lineRefs = useRef({});
  useEffect(() => { if (sel) { setDoc(sel.doc); setMedId(sel.med); } }, [sel]);
  const D = DOCS[doc];
  const ents = MEDS.filter(m => m[doc]).sort((a, b) => a[doc].line - b[doc].line);
  const active = medId && MEDS.find(m => m.id === medId)?.[doc];
  useEffect(() => { if (active) lineRefs.current[active.line]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [medId, doc]);
  const lineToMed = Object.fromEntries(ents.map(m => [m[doc].line, m.id]));
  const renderLine = (txt, i) => {
    const mid = lineToMed[i]; const e = mid && MEDS.find(m => m.id === mid)[doc];
    if (!e) return txt || ' '; const at = txt.indexOf(e.quote); if (at < 0) return txt;
    return <>{txt.slice(0, at)}<mark className="src">{e.quote}</mark>{txt.slice(at + e.quote.length)}</>;
  };
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Source document" value={doc} onChange={setDoc} options={['A', 'B'].map(k => [k, `${DOCS[k].short} · ${DOCS[k].date}`])} />
        <span className="text-xs text-muted">{D.method} · mean field confidence <span className="font-mono text-fg">{avgConf(doc).toFixed(2)}</span> · threshold <span className="font-mono">0.75</span></span>
      </div>
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3 min-w-0" title={D.title} icon={FileText} right={<span className="text-[11px] text-muted hidden sm:inline">{D.format}</span>}>
          <div className="text-xs text-muted mb-3">{D.source} · {D.author}</div>
          <div className="scroll-x rounded-xl border border-line bg-bg/60">
            <pre className="font-mono text-[12.5px] leading-6 py-2 min-w-max">
              {D.lines.map((t, i) => { const mid = lineToMed[i]; const hl = active && active.line === i; return (
                <div key={i} ref={el => lineRefs.current[i] = el} onClick={() => mid && setMedId(mid)} className={`doc-line flex pr-4 ${hl ? 'hl' : ''} ${mid ? 'cursor-pointer hover:bg-raised/60' : ''}`}>
                  <span className="w-10 shrink-0 select-none text-right pr-3 text-muted/60 tnum">{i + 1}</span><span>{renderLine(masked ? redactPHI(t) : t, i)}</span></div>); })}
            </pre>
          </div>
          <p className="mt-2 text-[11px] text-muted">Highlighted spans are the exact source text each extracted entity came from. Click a line or an entity to trace it.</p>
        </Panel>
        <Panel className="lg:col-span-2 min-w-0" title={`Extracted entities (${ents.length})`} icon={ScanText}>
          <ul className="grid gap-2">
            {ents.map(m => { const e = m[doc]; const on = medId === m.id; const low = Object.values(e.conf).some(c => c != null && c < .75);
              const normalized = e.raw.toLowerCase().split(' ')[0] !== m.name.toLowerCase().split(' ')[0];
              return (
              <li key={m.id}><button onClick={() => setMedId(m.id)} className={`w-full text-left rounded-xl border p-3 transition ${on ? 'border-accent bg-accent/5' : 'border-line bg-raised/30 hover:bg-raised/70'}`}>
                <div className="flex items-center gap-2"><Pill size={14} className="text-muted shrink-0" /><span className="font-semibold">{m.name}</span>
                  {m.highAlert && <span className="rounded bg-crit/10 text-crit px-1.5 text-[10px] font-bold uppercase tracking-wide">High-alert</span>}
                  {low && <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-high"><AlertTriangle size={12} />Low confidence</span>}</div>
                {normalized && <div className="mt-1 text-[11px] text-muted">Normalized from <span className="font-mono text-fg">“{e.raw}”</span></div>}
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {[['dose', e.reg.dose], ['unit', e.reg.unit], ['route', e.reg.route], ['freq', e.reg.freq]].map(([k, v]) => (
                    <div key={k} className={`rounded-lg border px-1.5 py-1 ${v == null ? (k === 'route' ? 'border-dashed border-line' : 'border-crit/40 bg-crit/5') : 'border-line bg-bg/40'}`}>
                      <div className="flex items-center justify-between"><span className="text-[9px] uppercase tracking-wider text-muted">{k}</span><Conf v={e.conf[k]} /></div>
                      <div className={`font-mono text-[12px] truncate ${v == null ? (k === 'route' ? 'text-muted' : 'text-crit') : ''}`}>{v ?? (k === 'route' ? 'n/s' : 'missing')}</div></div>))}
                </div>
                <div className="mt-2 text-[11px] text-muted flex items-center gap-1"><Link2 size={11} />Line {e.line + 1}: <span className="font-mono truncate">{e.quote}</span></div>
              </button></li>); })}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function Reconcile({ pid, openReview, openSource, openRx }) {
  const { db } = useApp();
  const items = db.recon.items;
  const [filter, setFilter] = useState('disc');
  const all = reconMedsFor(db, [pid]);
  const [sel, setSel] = useState(all.find(m => m.severity !== 'none')?.id || all[0]?.id);
  const rows = all.filter(m => filter === 'all' ? true : filter === 'disc' ? m.severity !== 'none' : ['critical', 'high'].includes(m.severity)).sort((a, b) => SEV[a.severity].order - SEV[b.severity].order);
  const m = all.find(x => x.id === sel);
  if (!all.length) return <Empty icon={GitCompareArrows} title="Nothing to reconcile for this patient yet" body="Cross-visit handover documents or discrepancies flagged from uploaded prescriptions appear here." />;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Segmented label="Filter" value={filter} onChange={setFilter} options={[['disc', 'Discrepancies'], ['urgent', 'Critical + high'], ['all', 'All medicines']]} />
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span className="flex items-center gap-1"><span className="rounded px-1 ring-1 bg-mod/15 ring-mod/40 text-mod font-mono">25</span>differs</span>
          <span className="flex items-center gap-1"><span className="rounded px-1 ring-1 bg-crit/10 ring-crit/40 text-crit font-mono">[freq?]</span>missing, required</span>
          <span className="flex items-center gap-1"><span className="rounded px-1 ring-1 ring-line text-muted font-mono">route n/s</span>not stated</span>
        </div>
      </div>
      <Panel title="Cross-visit reconciliation matrix" icon={GitCompareArrows} pad={false}>
        <div className="scroll-x">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead><tr className="border-b border-line">
              <th className="px-4 py-2 eyebrow">Medicine</th><th className="px-3 py-2 eyebrow">{pid === MARA_ID ? 'Visit A · discharge 10/28' : 'Current verified list'}</th><th className="px-3 py-2 eyebrow">{pid === MARA_ID ? 'Visit B · clinic 11/03 / upload' : 'Uploaded prescription'}</th>
              <th className="px-3 py-2 eyebrow">Finding</th><th className="px-3 py-2 eyebrow">Severity</th><th className="px-4 py-2 eyebrow">Review</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id} onClick={() => setSel(r.id)} className={`border-b border-line/70 cursor-pointer align-top transition ${sel === r.id ? 'bg-accent/[.06]' : 'hover:bg-raised/50'}`}>
                <td className="px-4 py-3 relative"><span className={`absolute left-0 top-0 bottom-0 w-[3px] ${SEV[r.severity].bar}`}></span><div className="font-semibold">{r.name}</div><div className="text-[11px] text-muted">{r.cls}</div></td>
                <td className="px-3 py-3"><RegChips reg={r.A?.reg} other={r.B?.reg} /></td>
                <td className="px-3 py-3"><RegChips reg={r.B?.reg} other={r.A?.reg} /></td>
                <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{r.findings.map(f => <Chip key={f}>{f}</Chip>)}</div></td>
                <td className="px-3 py-3"><SevBadge sev={r.severity} small /></td>
                <td className="px-4 py-3"><StatusBadge status={items[r.id]?.status || 'open'} /></td>
              </tr>))}</tbody>
          </table>
        </div>
      </Panel>
      {m && (
        <Panel title={`${m.name} — rule detail`} icon={Info} right={<SevBadge sev={m.severity} />}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="min-w-0">
              <div className="eyebrow mb-1">Why this was flagged</div><p className="text-[13.5px] leading-relaxed max-w-[65ch]">{m.rationale}</p>
              {m.questions?.length > 0 && <><div className="eyebrow mt-4 mb-1">For the reviewer</div><ul className="list-disc pl-5 text-[13px] grid gap-1">{m.questions.map(q => <li key={q}>{q}</li>)}</ul></>}
            </div>
            <div className="grid gap-2 content-start min-w-0">
              {['A', 'B'].map(k => (
                <div key={k} className="rounded-xl border border-line bg-bg/50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="eyebrow">{m.rxId ? (k === 'A' ? 'Current verified list' : 'Uploaded prescription') : `${DOCS[k].short} · ${DOCS[k].source}`}</span>
                    {m[k] && !m.rxId && <button onClick={() => openSource(k, m.id)} className="text-[12px] text-accent hover:underline inline-flex items-center gap-1"><Eye size={12} />Line {m[k].line + 1}</button>}
                    {m.rxId && k === 'B' && <button onClick={() => openRx(m.rxId)} className="text-[12px] text-accent hover:underline inline-flex items-center gap-1"><Eye size={12} />Open document</button>}
                  </div>
                  <div className="mt-1 font-mono text-[12.5px] break-words">{m[k] ? <mark className="src">{m[k].quote}</mark> : <span className="text-muted">Not listed in this source.</span>}</div>
                </div>))}
              {m.severity !== 'none' && <Btn kind="primary" className="justify-self-start mt-1" onClick={() => openReview(m.id)}><ClipboardCheck size={14} />Open in review queue</Btn>}
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}

function CustomForm({ value, onChange }) {
  const v = value || { dose: '', unit: 'mg', route: 'PO', freq: 'QD' };
  const set = (k, x) => onChange({ ...v, [k]: x });
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
      <Field label="Dose" id="custom-dose"><input id="custom-dose" className={inputCls + ' font-mono'} value={v.dose} onChange={e => set('dose', e.target.value)} placeholder="e.g. 2.5" /></Field>
      <Field label="Unit" id="custom-unit"><select id="custom-unit" className={inputCls} value={v.unit} onChange={e => set('unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
      <Field label="Route" id="custom-route"><select id="custom-route" className={inputCls} value={v.route} onChange={e => set('route', e.target.value)}>{Object.keys(ROUTE).map(u => <option key={u}>{u}</option>)}</select></Field>
      <Field label="Frequency" id="custom-freq"><select id="custom-freq" className={inputCls} value={v.freq} onChange={e => set('freq', e.target.value)}>{Object.keys(FREQ).map(u => <option key={u} value={u}>{u} · {FREQ[u].label}</option>)}</select></Field>
    </div>
  );
}

/* Professional review queue with two-person verification and the hash-chained audit trail. */
function Review({ pids, focus, setFocus }) {
  const { db, mutate, me, toast, guard } = useApp();
  const items = db.recon.items;
  const [tab, setTab] = useState('active');
  const [opt, setOpt] = useState(null);
  const [custom, setCustom] = useState(null);
  const [why, setWhy] = useState('');
  const [chain, setChain] = useState(null);
  const [copied, setCopied] = useState(false);
  const so = { open: 0, decided: 1, escalated: 2, verified: 3 };
  const queue = reconMedsFor(db, pids).filter(m => m.severity !== 'none' && items[m.id])
    .sort((a, b) => (so[items[a.id].status] - so[items[b.id].status]) || (SEV[a.severity].order - SEV[b.severity].order));
  const shown = queue.filter(m => tab === 'active' ? items[m.id].status !== 'verified' : items[m.id].status === 'verified');
  const id = focus && queue.some(q => q.id === focus) ? focus : shown[0]?.id;
  const m = id && queue.find(q => q.id === id); const it = m && items[m.id];
  useEffect(() => { setOpt(null); setCustom(null); setWhy(''); }, [id]);
  const patientOf = (x) => userById(db, x.patientId)?.profile.fullName;

  const options = m ? [
    m.A && { id: 'A', label: m.rxId ? 'Keep current verified regimen' : (m.A.reg.status === 'held' ? 'Resume Visit A dose' : 'Use Visit A regimen'), reg: { ...m.A.reg, status: undefined } },
    m.B && { id: 'B', label: m.rxId ? 'Use uploaded prescription as written' : 'Use Visit B regimen', reg: m.B.reg },
    ...(EXTRA_OPTIONS[m.id] || (m.rxId ? [{ id: 'stop', label: 'Do not add to the medication list', reg: { status: 'stopped' } }] : [])),
    { id: 'custom', label: 'Enter a corrected regimen (as confirmed with the prescriber)' },
    { id: 'escalate', label: 'Escalate to prescriber', esc: true },
  ].filter(Boolean) : [];
  const chosen = options.find(o => o.id === opt);
  const minWhy = m && ['critical', 'high'].includes(m.severity) ? 20 : 8;
  const canSubmit = chosen && why.trim().length >= minWhy && (chosen.id !== 'custom' || (custom && custom.dose.trim()));

  const decide = () => {
    const reg = chosen.id === 'custom' ? { ...custom } : chosen.reg; const esc = chosen.esc; const r = why.trim();
    mutate(n => {
      n.recon.items[m.id] = { status: esc ? 'escalated' : 'decided', decision: { optionId: chosen.id, reg: esc ? null : reg, rationale: r }, decidedBy: me.id, decidedAt: nowISO() };
      pushAudit(n, { ...actorOf(me), action: esc ? 'ESCALATE' : 'DECIDE', patientId: m.patientId, item: m.id, detail: esc ? `Escalated ${m.name} to prescriber. Note: ${r}` : `${m.name}: selected ${chosen.id === 'custom' ? 'corrected regimen' : chosen.label}: ${regText(reg)}. Rationale: ${r}` });
      n.users.filter(u => u.role === 'doctor' && u.id !== me.id && medsAccessPatients(n, u.id).includes(m.patientId)).forEach(u => notify(n, u.id, { type: 'review', title: esc ? `${m.name} escalated to prescriber` : `${m.name} needs second verification`, body: `${patientOf(m)} · decided by ${me.profile.fullName}`, priority: esc ? 'normal' : 'high', link: 'review', ref: m.id }));
    });
    toast(esc ? `${m.name} escalated to prescriber` : `Decision recorded for ${m.name}. A second professional must verify it.`);
    setOpt(null); setWhy(''); setCustom(null);
  };
  const verify = () => {
    mutate(n => {
      const cur = n.recon.items[m.id];
      n.recon.items[m.id] = { ...cur, status: 'verified', verifiedBy: me.id, verifiedAt: nowISO() };
      pushAudit(n, { ...actorOf(me), action: 'VERIFY', patientId: m.patientId, item: m.id, detail: `Verified and signed ${m.name}: ${regText(cur.decision.reg)}. Released to the patient's verified list.` });
      notify(n, m.patientId, { type: 'rx-verified', title: `${m.name} confirmed by your care team`, body: 'It now shows in your verified medicines. Check the instructions before your next dose.', link: 'medicines' });
      if (m.rxId) {
        const rx = n.prescriptions.find(r => r.id === m.rxId);
        if (rx) rx.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'REVIEW_RESOLVED', comment: `${m.name} resolved through professional review.` });
      }
    });
    toast(`${m.name} verified and released to the patient view`);
  };
  const returnItem = () => { mutate(n => { n.recon.items[m.id] = { status: 'open' }; pushAudit(n, { ...actorOf(me), action: 'RETURN', patientId: m.patientId, item: m.id, detail: `Returned ${m.name} for rework; previous decision voided (kept in trail).` }); }); toast(`${m.name} returned for rework`); };
  const reopen = () => { mutate(n => { n.recon.items[m.id] = { status: 'open' }; pushAudit(n, { ...actorOf(me), action: 'PRESCRIBER_REPLY', patientId: m.patientId, item: m.id, detail: `Prescriber response received for ${m.name}; reopened for decision.` }); }); toast(`${m.name} reopened`); };
  const log = db.log.filter(e => !e.patientId || pids.includes(e.patientId));
  const copyLog = async () => { try { await navigator.clipboard.writeText(JSON.stringify(log, null, 2)); setCopied(true); } catch (e) { setCopied('fail'); } setTimeout(() => setCopied(false), 1600); };
  const decider = it?.decidedBy && userById(db, it.decidedBy);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-2 min-w-0" title="Review queue" icon={ClipboardCheck} right={<Segmented value={tab} onChange={(k) => { setTab(k); setFocus(null); }} options={[['active', 'Active', queue.filter(q => items[q.id].status !== 'verified').length], ['done', 'Verified', queue.filter(q => items[q.id].status === 'verified').length]]} />}>
          {shown.length === 0 && <Empty icon={CheckCircle2} title={tab === 'active' ? 'Queue is clear' : 'Nothing verified yet'} body={tab === 'active' ? 'Every flagged medicine for your authorised patients has been verified.' : 'Decisions need a second professional before they appear here.'} />}
          <ul className="grid gap-1.5">{shown.map(q => (
            <li key={q.id}><button onClick={() => setFocus(q.id)} className={`w-full text-left rounded-xl border p-3 relative overflow-hidden transition ${id === q.id ? 'border-accent bg-accent/5' : 'border-line hover:bg-raised/60'}`}>
              <span className={`absolute left-0 top-0 bottom-0 w-[3px] ${SEV[q.severity].bar}`}></span>
              <div className="flex items-center gap-2"><span className="font-semibold">{q.name}</span><span className="ml-auto"><StatusBadge status={items[q.id].status} /></span></div>
              <div className="text-[12px] text-muted mt-0.5">{patientOf(q)} · {q.findings.join(' · ')}</div>
            </button></li>))}</ul>
        </Panel>
        <Panel className="lg:col-span-3 min-w-0" title={m ? `${m.name} · ${patientOf(m)}` : 'No item selected'} icon={Pill} right={m && <SevBadge sev={m.severity} />}>
          {!m && <Empty icon={ClipboardCheck} title="Select an item" body="Pick a flagged medicine from the queue to review it." />}
          {m && <>
            <p className="text-[13.5px] max-w-[65ch]">{m.rationale}</p>
            <div className="grid sm:grid-cols-2 gap-2 mt-3">{['A', 'B'].map(k => <div key={k} className="rounded-xl border border-line bg-bg/40 p-2.5"><div className="eyebrow mb-1">{m.rxId ? (k === 'A' ? 'Current verified' : 'Uploaded') : DOCS[k].short}</div><RegChips reg={m[k]?.reg} other={m[k === 'A' ? 'B' : 'A']?.reg} /></div>)}</div>
            {it.status === 'open' && <div className="mt-4">
              <div className="eyebrow mb-2">Decision</div>
              <div className="grid gap-1.5" role="radiogroup">{options.map(o => { const dis = o.reg && !o.reg.status && !isComplete(o.reg); return (
                <label key={o.id} className={`flex items-start gap-3 rounded-xl border p-2.5 ${dis ? 'opacity-50 cursor-not-allowed border-line' : opt === o.id ? 'border-accent bg-accent/5 cursor-pointer' : 'border-line hover:bg-raised/50 cursor-pointer'}`}>
                  <input type="radio" name="opt" id={`opt-${o.id}`} className="mt-1 accent-[rgb(var(--c-accent))]" disabled={dis} checked={opt === o.id} onChange={() => setOpt(o.id)} />
                  <div className="min-w-0 flex-1"><div className="text-[13.5px] font-semibold flex items-center gap-2">{o.esc && <Send size={13} className="text-info" />}{o.label}</div>
                    {o.reg && <div className="font-mono text-[12px] text-muted">{regText(o.reg)}</div>}
                    {dis && <div className="text-[11.5px] text-crit mt-0.5">Incomplete as written: {!o.reg.unit ? 'unit' : !o.reg.dose ? 'dose' : 'frequency'} not stated. Cannot be selected.</div>}
                    {o.id === 'custom' && opt === 'custom' && <CustomForm value={custom} onChange={setCustom} />}</div>
                </label>); })}</div>
              <Field label={`Rationale (required, min ${minWhy} characters)`} id="why" className="mt-3"><textarea id="why" rows={3} value={why} onChange={e => setWhy(e.target.value)} placeholder={chosen?.esc ? 'What you need the prescriber to confirm…' : 'Source you confirmed with (patient, pharmacy fill history, prescriber)…'} className={inputCls}></textarea></Field>
              <div className="flex flex-wrap items-center gap-2 mt-2"><Btn kind="primary" disabled={!canSubmit} onClick={() => guard(`${chosen?.esc ? 'Escalate' : 'Override discrepancy / record decision'} · ${m.name}`, decide, m.patientId)}><Lock size={13} />{chosen?.esc ? 'Escalate' : 'Record decision'} as {me.profile.fullName}</Btn><span className="text-[11.5px] text-muted">{chosen?.esc ? 'Item stays out of the patient view.' : 'A different professional must verify before release.'}</span></div>
            </div>}
            {it.status === 'decided' && <div className="mt-4 rounded-xl border border-accent/30 bg-accent/5 p-3">
              <div className="flex items-center gap-2 text-[13.5px]"><Clock size={14} className="text-accent" />Decided by <b>{decider?.profile.fullName}</b> ({roleLabel(decider)}) · {fmtTs(it.decidedAt)}</div>
              <div className="font-mono text-[12.5px] mt-1">{regText(it.decision.reg)}</div><div className="text-[13px] text-fg/80 mt-1">“{it.decision.rationale}”</div>
              <div className="flex flex-wrap gap-2 mt-3"><Btn kind="ok" disabled={it.decidedBy === me.id} onClick={() => guard(`Sign off reconciliation · ${m.name}`, verify, m.patientId)}><ShieldCheck size={14} />Verify &amp; sign</Btn><Btn disabled={it.decidedBy === me.id} onClick={() => guard(`Return for rework · ${m.name}`, returnItem, m.patientId)}><Undo2 size={14} />Return for rework</Btn></div>
              {it.decidedBy === me.id && <div className="text-[12px] text-high mt-2">Two-person rule: you made this decision, so a different authorised professional must sign in and verify it.</div>}
            </div>}
            {it.status === 'escalated' && <div className="mt-4 rounded-xl border border-info/30 bg-info/5 p-3"><div className="flex items-center gap-2 text-[13.5px]"><Send size={14} className="text-info" />Escalated by <b>{decider?.profile.fullName}</b></div><div className="text-[13px] text-fg/80 mt-1">“{it.decision.rationale}”</div><Btn className="mt-3" onClick={() => guard(`Record prescriber reply · ${m.name}`, reopen, m.patientId)}><MessageSquareWarning size={14} />Record prescriber reply, reopen</Btn></div>}
            {it.status === 'verified' && <div className="mt-4 rounded-xl border border-ok/30 bg-ok/5 p-3"><div className="flex items-center gap-2 text-[13.5px]"><ShieldCheck size={14} className="text-ok" />Verified · released to patient view</div><div className="font-mono text-[12.5px] mt-1">{regText(it.decision.reg)}</div><div className="text-[12px] text-muted mt-1">Decided by {nameOf(db, it.decidedBy)} · verified by {nameOf(db, it.verifiedBy)} · {fmtTs(it.verifiedAt)}</div></div>}
          </>}
        </Panel>
      </div>
      <Panel title="Audit trail" icon={History} right={<div className="flex gap-2"><Btn size="sm" onClick={() => setChain(verifyChain(realLog(db)))}><Link2 size={13} />Verify chain</Btn><Btn size="sm" onClick={copyLog}><Copy size={13} />{copied === true ? 'Copied' : copied === 'fail' ? 'Copy blocked' : 'Copy JSON'}</Btn></div>}>
        {chain && <div className={`mb-3 rounded-xl px-3 py-2 text-[12.5px] ring-1 ${chain.ok ? 'bg-ok/10 text-ok ring-ok/30' : 'bg-crit/10 text-crit ring-crit/30'}`}>{chain.ok ? `Chain intact: all ${chain.n} entries link to the previous one.` : `Chain broken at entry ${chain.at}.`}</div>}
        <AuditTable log={log} />
        <p className="mt-3 text-[11.5px] text-muted">Append-only and tamper-evident: each entry stores a hash of its contents plus the previous entry’s hash (FNV-1a, demo strength). Showing entries for your authorised patients; chain verification covers the whole log.</p>
      </Panel>
    </div>
  );
}

function AuditTable({ log, limit = 80 }) {
  const rows = [...log].reverse().slice(0, limit);
  if (!rows.length) return <Empty icon={History} title="No activity recorded yet" />;
  return (
    <div className="scroll-x -mx-4">
      <table className="w-full min-w-[900px] text-[12.5px]">
        <thead><tr className="text-left border-b border-line">{['#', 'Time', 'User', 'Verified identity', 'Action', 'Item', 'Detail', 'Hash'].map(h => <th key={h} className="px-3 py-2 eyebrow first:pl-4">{h}</th>)}</tr></thead>
        <tbody>{rows.map(e => (
          <tr key={e.seq} className="border-b border-line/60 align-top">
            <td className="pl-4 pr-3 py-2 font-mono text-muted tnum">{e.seq}</td>
            <td className="px-3 py-2 font-mono text-muted whitespace-nowrap tnum">{fmtTs(e.ts)}</td>
            <td className="px-3 py-2 whitespace-nowrap">{e.actor}<div className="font-mono text-[10.5px] text-muted">{e.actorId}</div><div className="text-[10px] text-muted uppercase tracking-wider">{e.role}</div></td>
            <td className="px-3 py-2 text-[11px] max-w-[22ch]">{e.auth ? <span className={/VERIFIED CLINICIAN/.test(e.auth) ? 'text-ok' : /FLAGGED|PENDING/.test(e.auth) ? 'text-crit' : 'text-fg/80'}>{e.auth}</span> : <span className="text-muted">{e.actorId === 'system' ? 'System process' : '—'}</span>}</td>
            <td className="px-3 py-2"><span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px]">{e.action}</span></td>
            <td className="px-3 py-2 font-mono text-[11.5px]">{e.item}</td>
            <td className="px-3 py-2 text-fg/85 max-w-[48ch]">{e.detail}</td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted whitespace-nowrap" title={`prev ${e.prev}`}>{e.hash}</td>
          </tr>))}</tbody>
      </table>
    </div>
  );
}

/* Patient-safe view: only professionally verified, released instructions; everything else is "being checked". */
function PatientSafeView({ pid, preview }) {
  const { db } = useApp();
  const [big, setBig] = useState(false);
  const p = userById(db, pid);
  const { released, pending } = verifiedMeds(db, pid);
  const active = released.filter(m => !m.reg.status), paused = released.filter(m => m.reg.status === 'held'), stopped = released.filter(m => m.reg.status === 'stopped');
  const doses = dosesFor(released);
  return (
    <div className={`grid gap-4 ${big ? 'text-[17px]' : ''}`}>
      <div className="rounded-2xl border-2 border-high/50 bg-high/[.07] p-4">
        <div className="flex items-start gap-3"><ShieldAlert size={22} className="text-high shrink-0 mt-0.5" />
          <div className="grid gap-1.5 min-w-0"><div className="font-display text-[16px] font-bold">Please read before using this list</div>
            <ul className="list-disc pl-5 grid gap-1 text-[0.95em] text-fg/90 max-w-[72ch]">
              <li>This list shows only medicines a healthcare professional has checked. It does not replace advice from your doctor or pharmacist.</li>
              <li>Do not start, stop or change any medicine because of this page alone. Ask your care team first.</li>
              <li>MediTrace never writes prescriptions, changes doses or swaps medicines. Instructions come from your prescriber’s documents.</li>
              <li>Some medicines are still being checked. They are marked below, without a dose, until a professional confirms them.</li>
              <li><b>If you have chest pain, trouble breathing, unusual bleeding, or feel faint, call your local emergency number now.</b></li>
            </ul></div></div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><div className="eyebrow">{preview ? 'Patient view preview' : 'Your medicines'}</div><h2 className="font-display text-[1.5em] font-extrabold leading-tight">{preview ? p?.profile.fullName : `Hello, ${p?.profile.fullName.split(' ')[0]}`}</h2>
          <div className="text-muted text-[0.9em]">{released.length} confirmed · {pending.length} being checked</div></div>
        <Btn onClick={() => setBig(b => !b)} aria-pressed={big}><Type size={14} />{big ? 'Normal text' : 'Larger text'}</Btn>
      </div>
      <Panel title="Your day, as written in your verified instructions" icon={Clock}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {SLOTS.map(({ id, label, icon: I }) => { const list = doses.filter(d => d.slot === id); return (
            <div key={id} className="rounded-xl border border-line bg-raised/40 p-3 min-w-0"><div className="flex items-center gap-1.5 font-semibold text-[0.92em]"><I size={15} className="text-accent" />{label}</div>
              <ul className="mt-2 grid gap-1.5">{list.length ? list.map(d => <li key={d.key} className="text-[0.88em]"><b>{d.name}</b> <span className="text-muted">{d.reg.dose} {d.reg.unit}{d.count > 1 ? ` · dose ${d.idx + 1} of ${d.count}` : ''}</span></li>) : <li className="text-muted text-[0.85em]">Nothing confirmed</li>}</ul></div>); })}
        </div>
        <p className="mt-2 text-[0.8em] text-muted">“Timing not specified” means the instruction says how often (for example twice daily) but not when. Ask your pharmacist what times suit you.</p>
      </Panel>
      <div className="grid gap-3 md:grid-cols-2">
        {active.map(m => (
          <article key={m.key} className="rounded-2xl border border-line bg-surface card-shadow p-4">
            <div className="flex items-center gap-2"><CheckCircle2 size={16} className="text-ok" /><h3 className="font-display text-[1.1em] font-bold">{m.name}</h3>{m.reg.form && <span className="text-muted text-[0.85em]">{m.reg.form}</span>}</div>
            <p className="text-[0.92em] text-fg/85 mt-1">{m.purpose}</p><p className="mt-2 font-semibold">{plainReg(m.reg)}.</p>
            <p className="mt-2 text-[0.78em] text-muted">{m.prescriber ? `Prescribed by ${m.prescriber} · ` : ''}Checked by {m.verifiedBy}</p>
          </article>))}
        {paused.map(m => <article key={m.key} className="rounded-2xl border border-info/40 bg-info/5 p-4"><div className="flex items-center gap-2"><PauseCircle size={16} className="text-info" /><h3 className="font-display text-[1.1em] font-bold">{m.name}</h3><span className="text-info text-[0.78em] font-bold uppercase tracking-wide">Paused</span></div><p className="text-[0.92em] text-fg/85 mt-1">{m.purpose}</p><p className="mt-2 font-semibold">Do not take this for now. Your care team will tell you if and when to restart.</p></article>)}
        {stopped.map(m => <article key={m.key} className="rounded-2xl border border-line bg-surface p-4"><div className="flex items-center gap-2"><XCircle size={16} className="text-muted" /><h3 className="font-display text-[1.1em] font-bold">{m.name}</h3><span className="text-muted text-[0.78em] font-bold uppercase tracking-wide">Stopped</span></div><p className="mt-2">Your care team has stopped this medicine. Ask your pharmacist if you have questions.</p></article>)}
        {pending.map(m => <article key={m.key} className="rounded-2xl border border-dashed border-line bg-surface/60 p-4"><div className="flex items-center gap-2"><CircleDashed size={16} className="text-high" /><h3 className="font-display text-[1.1em] font-bold">{m.name}</h3><span className="text-high text-[0.78em] font-bold uppercase tracking-wide">Being checked</span></div><p className="text-[0.92em] text-fg/85 mt-1">{m.purpose}</p><p className="mt-2">{m.reason}. Keep taking it the way you were last told by your prescriber, and do not change anything until your care team contacts you.</p></article>)}
      </div>
    </div>
  );
}
