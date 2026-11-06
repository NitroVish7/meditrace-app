/* Patient portal: dashboard, daily checklist & reminders, prescriptions, access management, profile. */
const remOf = (db, pid) => db.reminders[pid] || DEFAULT_REMINDERS;
const hmToDate = (date, hm) => { const [h, m] = hm.split(':').map(Number); const d = parseDay(date); d.setHours(h, m, 0, 0); return d; };
const dosesOn = (released, date) => dosesFor(released.filter(m => !m.verifiedAt || ymd(m.verifiedAt) <= date));

/* Adherence is stored separately from prescriptions; recording a dose never edits the instruction. */
function recordDose(n, pid, dose, status, reason = '') {
  n.adherence[pid] = n.adherence[pid] || [];
  n.adherence[pid].push({ id: uid('AD'), date: ymd(), doseKey: dose.key, status, at: nowISO(), reason });
  const r = n.reminders[pid] = n.reminders[pid] || JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
  r.active = (r.active || []).filter(a => a.key !== dose.key);
  if (status !== 'pending') r.history.unshift({ at: nowISO(), doseKey: dose.key, name: dose.name, action: status });
  r.history = r.history.slice(0, 120);
}

/* In-app reminder engine: fires when a verified dose's reminder time passes and the dose is still pending. */
function useReminderEngine(me) {
  const { db, mutate } = useApp();
  const ref = useRef(db); ref.current = db;
  useEffect(() => {
    if (!me || me.role !== 'patient') return;
    const tick = () => {
      const d = ref.current, pid = me.id, rem = remOf(d, pid);
      if (!rem.enabled) return;
      const date = ymd(), now = Date.now();
      const doses = dosesOn(verifiedMeds(d, pid).released, date);
      const ev = adherenceEvents(d, pid);
      const due = doses.filter(x => {
        const t = reminderTimeFor(rem, x); if (!t || doseState(ev, date, x.key)) return false;
        if (hmToDate(date, t).getTime() > now) return false;
        const fk = `${date}|${x.key}`, sn = rem.snoozes?.[x.key];
        if (sn) return Date.parse(sn) <= now;
        return !rem.fired?.[fk];
      });
      const overdue = doses.filter(x => { const t = reminderTimeFor(rem, x); return t && !doseState(ev, date, x.key) && hmToDate(date, t).getTime() + HOUR < now; });
      const needPendingNote = overdue.length && !(rem.pendingNoted || {})[date];
      if (!due.length && !needPendingNote) return;
      mutate(n => {
        const r = n.reminders[pid] = n.reminders[pid] || JSON.parse(JSON.stringify(DEFAULT_REMINDERS));
        r.fired = r.fired || {}; r.snoozes = r.snoozes || {}; r.active = r.active || []; r.pendingNoted = r.pendingNoted || {};
        due.forEach(x => {
          r.fired[`${date}|${x.key}`] = nowISO(); delete r.snoozes[x.key];
          if (!r.active.some(a => a.key === x.key)) r.active.push({ key: x.key, at: nowISO() });
          r.history.unshift({ at: nowISO(), doseKey: x.key, name: x.name, action: 'shown' });
          notify(n, pid, { type: 'reminder', title: `Medication reminder: ${x.name}`, body: `${SLOT[x.slot].label}${x.count > 1 ? ` · dose ${x.idx + 1} of ${x.count}` : ''} · ${plainReg(x.reg)}`, priority: 'high', link: 'checklist' });
          if (r.browser && 'Notification' in window && Notification.permission === 'granted') { try { new Notification(`MediTrace: ${x.name}`, { body: `${SLOT[x.slot].label} dose · ${x.reg.dose} ${x.reg.unit}`, icon: 'assets/favicon.png' }); } catch (e) {} }
        });
        if (needPendingNote) { r.pendingNoted[date] = true; notify(n, pid, { type: 'pending-checklist', title: `${overdue.length} dose${overdue.length > 1 ? 's' : ''} not yet recorded today`, body: 'Open your checklist to mark them taken or skipped. MediTrace never marks doses for you.', priority: 'normal', link: 'checklist' }); }
        r.history = r.history.slice(0, 120);
      }, { silent: true });
    };
    tick(); const t = setInterval(tick, 20000); return () => clearInterval(t);
  }, [me?.id]);
}

function ReminderBanner({ go }) {
  const { db, me, mutate, toast } = useApp();
  if (!me || me.role !== 'patient') return null;
  const rem = remOf(db, me.id); const active = rem.active || [];
  if (!active.length) return null;
  const doses = dosesOn(verifiedMeds(db, me.id).released, ymd());
  const list = active.map(a => doses.find(d => d.key === a.key)).filter(Boolean);
  if (!list.length) return null;
  const act = (d, status) => { mutate(n => recordDose(n, me.id, d, status)); toast(status === 'taken' ? `${d.name} recorded as taken at ${fmtTime(nowISO())}` : `${d.name} recorded as skipped`); };
  const snooze = (d) => { mutate(n => { const r = n.reminders[me.id]; r.snoozes[d.key] = new Date(Date.now() + 10 * MIN).toISOString(); r.active = r.active.filter(a => a.key !== d.key); r.history.unshift({ at: nowISO(), doseKey: d.key, name: d.name, action: 'snoozed 10 min' }); }); toast(`Snoozed ${d.name} for 10 minutes`); };
  return (
    <div className="gutter pt-3">
      <div className="mx-auto max-w-7xl grid gap-2">
        {list.map(d => (
          <div key={d.key} role="alert" className="pop flex flex-wrap items-center gap-3 rounded-2xl border-2 border-accent/50 bg-accent/10 px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-white dark:text-bg"><BellRing size={18} /></span>
            <div className="min-w-0 flex-1"><div className="font-semibold">Time for {d.name}</div><div className="text-[13px] text-fg/80">{SLOT[d.slot].label}{d.count > 1 ? ` · dose ${d.idx + 1} of ${d.count}` : ''} · {plainReg(d.reg)}</div></div>
            <div className="flex flex-wrap gap-2"><Btn kind="ok" size="sm" onClick={() => act(d, 'taken')}><Check size={13} />Taken</Btn><Btn size="sm" onClick={() => go('checklist')}>Skip…</Btn><Btn size="sm" onClick={() => snooze(d)}><AlarmClock size={13} />Snooze 10 min</Btn></div>
          </div>))}
      </div>
    </div>
  );
}

const Ring = ({ pct, size = 76, label }) => {
  const r = (size - 10) / 2, c = 2 * Math.PI * r, v = pct == null ? 0 : pct;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }} role="img" aria-label={label || `${v}% complete`}>
      <svg width={size} height={size} className="-rotate-90"><circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="8" className="stroke-raised" /><circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="8" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v / 100)} className="stroke-accent transition-all duration-500" /></svg>
      <span className="absolute font-display text-[17px] font-extrabold tnum">{pct == null ? '—' : `${pct}%`}</span>
    </div>
  );
};

function DoseRow({ d, compact }) {
  const { db, me, mutate, toast } = useApp();
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState('');
  const ev = adherenceEvents(db, me.id); const st = doseState(ev, ymd(), d.key);
  const rem = remOf(db, me.id); const t = reminderTimeFor(rem, d);
  const act = (status, why = '') => { mutate(n => recordDose(n, me.id, d, status, why)); setSkipping(false); setReason(''); toast(status === 'taken' ? `${d.name} recorded as taken at ${fmtTime(nowISO())}` : status === 'skipped' ? `${d.name} recorded as skipped. Your prescription is unchanged.` : `${d.name} set back to not yet taken`); };
  const tone = st?.status === 'taken' ? 'border-ok/40 bg-ok/5' : st?.status === 'skipped' ? 'border-high/40 bg-high/5' : 'border-line bg-surface';
  return (
    <li className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${st?.status === 'taken' ? 'bg-ok text-white dark:text-bg' : st?.status === 'skipped' ? 'bg-high/20 text-high' : 'bg-raised text-muted'}`}>{st?.status === 'taken' ? <Check size={16} /> : st?.status === 'skipped' ? <X size={16} /> : <Pill size={15} />}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{d.name}</span>{d.highAlert && <Chip tone="crit">High-alert</Chip>}{d.count > 1 && <Chip>Dose {d.idx + 1} of {d.count}</Chip>}</div>
          <div className="text-[13px] text-fg/80">{plainReg(d.reg)}</div>
          {!compact && <div className="text-[12px] text-muted mt-0.5 flex flex-wrap gap-x-3">
            <span>Prescribed timing: {d.slot === 'any' ? `${FREQ[d.reg.freq]?.label} (time not stated)` : SLOT[d.slot].label.toLowerCase()}</span>
            {d.reg.route && <span>Route: {ROUTE[d.reg.route] || d.reg.route}</span>}
            <span>{t ? `Reminder ${t}` : d.slot === 'prn' ? 'No scheduled reminder' : 'No reminder set'}</span></div>}
          <div className="text-[12px] mt-0.5 font-medium">{st?.status === 'taken' ? <span className="text-ok">Taken at {fmtTime(st.at)}</span> : st?.status === 'skipped' ? <span className="text-high">Skipped at {fmtTime(st.at)}{st.reason ? ` · ${st.reason}` : ''}</span> : <span className="text-muted">Pending</span>}</div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={`Record ${d.name}`}>
          <Btn kind={st?.status === 'taken' ? 'ok' : 'ghost'} size="sm" aria-pressed={st?.status === 'taken'} onClick={() => act('taken')}><Check size={13} />Taken</Btn>
          <Btn size="sm" aria-pressed={st?.status === 'skipped'} className={st?.status === 'skipped' ? 'border-high/50 text-high' : ''} onClick={() => setSkipping(s => !s)}><X size={13} />Skipped</Btn>
          <Btn size="sm" disabled={!st} onClick={() => act('pending')}><Undo2 size={13} />Not yet taken</Btn>
        </div>
      </div>
      {skipping && <div className="pop mt-3 grid gap-2 rounded-lg bg-raised/60 p-3">
        <Field label="Reason for skipping" id={`skip-${d.key}`} optional><input id={`skip-${d.key}`} className={inputCls} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. felt sick, ran out, forgot" /></Field>
        <p className="text-[12px] text-muted">Skipping is only recorded for you and your care team. It does not change your prescription and is not advice to stop this medicine. Talk to your care team before stopping anything.</p>
        <div className="flex gap-2"><Btn kind="primary" size="sm" onClick={() => act('skipped', reason.trim())}>Record as skipped</Btn><Btn size="sm" onClick={() => setSkipping(false)}>Cancel</Btn></div>
      </div>}
    </li>
  );
}

function PrnRow({ m }) {
  const { db, me, mutate, toast } = useApp();
  const ev = adherenceEvents(db, me.id).filter(e => e.date === ymd() && e.doseKey === `${m.key}#0` && e.status === 'taken');
  return (
    <li className="rounded-xl border border-line bg-surface p-3 flex flex-wrap items-center gap-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-raised text-muted"><HelpCircle size={15} /></span>
      <div className="min-w-0 flex-1"><div className="font-semibold">{m.name}</div><div className="text-[13px] text-fg/80">{plainReg(m.reg)}</div><div className="text-[12px] text-muted">{ev.length ? `Taken today at ${ev.map(e => fmtTime(e.at)).join(', ')}` : 'Not taken today'}</div></div>
      <Btn size="sm" onClick={() => { mutate(n => recordDose(n, me.id, { key: `${m.key}#0`, name: m.name }, 'taken')); toast(`${m.name} dose recorded at ${fmtTime(nowISO())}`); }}><Plus size={13} />Record a dose taken</Btn>
    </li>
  );
}

function ChecklistPage({ go }) {
  const { db, me, mutate, toast } = useApp();
  const pid = me.id, date = ymd();
  const { released, pending } = verifiedMeds(db, pid);
  const doses = dosesOn(released, date);
  const stats = dayStats(db, pid, date, doses);
  const rem = remOf(db, pid);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selDay, setSelDay] = useState(null);
  const [notifState, setNotifState] = useState(null);
  const week = [...Array(7)].map((_, i) => { const d = ymd(Date.now() - (6 - i) * DAY); return { d, ...dayStats(db, pid, d, dosesOn(released, d)) }; });
  const wkTotal = week.reduce((a, b) => a + b.total, 0), wkTaken = week.reduce((a, b) => a + b.taken, 0);
  const setRem = (fn) => mutate(n => { n.reminders[pid] = n.reminders[pid] || JSON.parse(JSON.stringify(DEFAULT_REMINDERS)); fn(n.reminders[pid]); }, { silent: true });
  const testReminder = () => {
    const d = doses.find(x => x.slot !== 'prn' && !doseState(adherenceEvents(db, pid), date, x.key));
    if (!d) return toast('Every scheduled dose today is already recorded, so there is nothing to remind you about.');
    mutate(n => { const r = n.reminders[pid]; r.active = r.active || []; if (!r.active.some(a => a.key === d.key)) r.active.push({ key: d.key, at: nowISO() }); r.history.unshift({ at: nowISO(), doseKey: d.key, name: d.name, action: 'shown (test)' }); notify(n, pid, { type: 'reminder', title: `Medication reminder: ${d.name}`, body: `Test reminder · ${plainReg(d.reg)}`, priority: 'high', link: 'checklist' }); });
    toast('Test reminder sent');
  };
  const askBrowser = async () => {
    if (!('Notification' in window)) { setNotifState('unsupported'); return; }
    try { const p = await Notification.requestPermission(); setNotifState(p); if (p === 'granted') setRem(r => { r.browser = true; }); } catch (e) { setNotifState('blocked'); }
  };
  const anyDoses = doses.filter(d => d.slot === 'any');
  const prn = released.filter(m => !m.reg.status && m.reg.freq === 'PRN');
  const grouped = SLOTS.filter(s => s.id !== 'prn').map(s => [s, doses.filter(d => d.slot === s.id)]).filter(([, l]) => l.length);
  const ev = adherenceEvents(db, pid);

  // calendar
  const first = calMonth, startDow = (first.getDay() + 6) % 7, daysIn = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells = [...Array(startDow).fill(null), ...[...Array(daysIn)].map((_, i) => ymd(new Date(first.getFullYear(), first.getMonth(), i + 1)))];
  const dayInfo = (d) => d > date ? null : dayStats(db, pid, d, dosesOn(released, d));

  return (
    <div className="grid gap-4">
      <PageHead eyebrow={parseDay(date).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} title="My Daily Medication Checklist" sub="Built only from instructions a healthcare professional has verified. Times come from your verified instructions; MediTrace never invents timings, recommends doses or marks doses for you." actions={<Btn onClick={testReminder}><BellRing size={14} />Send a test reminder</Btn>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface card-shadow p-4 flex items-center gap-4"><Ring pct={stats.pct} label="Today's completion" /><div><div className="eyebrow">Today</div><div className="font-display text-[18px] font-bold">{stats.taken} of {stats.total} taken</div><div className="text-[12px] text-muted">{stats.skipped} skipped · {stats.pending} pending</div></div></div>
        <Stat label="Weekly adherence" value={wkTotal ? `${Math.round(wkTaken / wkTotal * 100)}%` : '—'} sub={`${wkTaken} of ${wkTotal} scheduled doses in 7 days`} icon={CalendarDays} />
        <Stat label="Reminders" value={rem.enabled ? 'On' : 'Off'} sub={rem.enabled ? 'In-app reminders while MediTrace is open' : 'Turn on below'} icon={rem.enabled ? Bell : BellOff} tone={rem.enabled ? 'accent' : 'high'} />
        <Stat label="Awaiting verification" value={pending.length} sub="Not added to the checklist yet" icon={CircleDashed} tone="high" onClick={() => go('medicines')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 grid gap-4 content-start min-w-0">
          {!doses.length && !prn.length && <Panel><Empty icon={ListChecks} title="No verified medicines yet" body="When a healthcare professional verifies one of your prescriptions, its doses appear here." action={<Btn kind="primary" onClick={() => go('prescriptions')}><Upload size={14} />Upload a prescription</Btn>} /></Panel>}
          {grouped.map(([s, list]) => { const I = s.icon; return (
            <Panel key={s.id} title={s.label} icon={I} right={<span className="text-[12px] text-muted">{s.id === 'any' ? 'Instruction gives a frequency but no time' : rem.slotTimes[s.id] ? `Reminder at ${rem.slotTimes[s.id]}` : ''}</span>}>
              <ul className="grid gap-2">{list.map(d => <DoseRow key={d.key} d={d} />)}</ul>
            </Panel>); })}
          {prn.length > 0 && <Panel title="As needed" icon={HelpCircle} right={<span className="text-[12px] text-muted">No scheduled reminders</span>}><ul className="grid gap-2">{prn.map(m => <PrnRow key={m.key} m={m} />)}</ul></Panel>}
          {pending.length > 0 && <Panel title="Not in your checklist yet" icon={CircleDashed}>
            <p className="text-[13px] text-muted mb-2">These are still being checked by a healthcare professional, so they aren’t confirmed instructions yet. Follow what your prescriber told you, and don’t change anything until your care team contacts you.</p>
            <ul className="grid gap-1.5">{pending.map(p => <li key={p.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-line px-3 py-2 text-[13.5px]"><span className="font-semibold">{p.name}</span><span className="text-muted">· {p.reason}</span></li>)}</ul>
          </Panel>}
        </div>

        <div className="grid gap-4 content-start min-w-0">
          <Panel title="Smart reminders" icon={AlarmClock} right={<label className="inline-flex items-center gap-2 text-[13px] font-medium cursor-pointer"><input id="rem-enabled" type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={rem.enabled} onChange={e => { setRem(r => { r.enabled = e.target.checked; }); toast(e.target.checked ? 'Reminders turned on' : 'Reminders turned off'); }} />{rem.enabled ? 'On' : 'Off'}</label>}>
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-2">{['morning', 'afternoon', 'evening', 'bedtime'].map(s => <Field key={s} label={`${SLOT[s].label} reminder`} id={`rem-${s}`}><input id={`rem-${s}`} type="time" disabled={!rem.enabled} className={inputCls + ' font-mono'} value={rem.slotTimes[s]} onChange={e => e.target.value && setRem(r => { r.slotTimes[s] = e.target.value; })} /></Field>)}</div>
              <p className="text-[12px] text-muted">These clock times are when to remind you for doses your instructions place in that part of the day. Pick times that match what your prescriber told you.</p>
              {anyDoses.length > 0 && <div className="grid gap-2 rounded-xl bg-raised/50 p-3">
                <div className="text-[12.5px] font-semibold">Doses without a stated time</div>
                <p className="text-[12px] text-muted">Your instructions don’t say when to take these. Choose a reminder time with your pharmacist; MediTrace won’t pick one for you.</p>
                {anyDoses.map(d => <Field key={d.key} label={`${d.name}${d.count > 1 ? ` · dose ${d.idx + 1}` : ''}`} id={`rem-${d.key}`}><div className="flex gap-2"><input id={`rem-${d.key}`} type="time" disabled={!rem.enabled} className={inputCls + ' font-mono'} value={rem.doseTimes[d.key] || ''} onChange={e => setRem(r => { if (e.target.value) r.doseTimes[d.key] = e.target.value; else delete r.doseTimes[d.key]; })} />{rem.doseTimes[d.key] && <Btn size="sm" onClick={() => setRem(r => { delete r.doseTimes[d.key]; })}>Clear</Btn>}</div></Field>)}
              </div>}
              <div className="rounded-xl border border-line p-3 grid gap-2">
                <div className="text-[12.5px] font-semibold flex items-center gap-1.5"><Bell size={13} />Browser notifications</div>
                <p className="text-[12px] text-muted">Reminders always appear inside MediTrace while it’s open. This sandboxed demo page usually can’t show system notifications, and nothing can remind you once the page is closed.</p>
                <Btn size="sm" className="justify-self-start" onClick={askBrowser}>Try browser notifications</Btn>
                {notifState && <div className="text-[12px]">{notifState === 'granted' ? <span className="text-ok">Allowed. You’ll also get system notifications while this page is open.</span> : <span className="text-high">Not available here ({notifState}). In-app reminders still work.</span>}</div>}
              </div>
            </div>
          </Panel>
          <Panel title="Last 7 days" icon={CalendarDays}>
            <div className="flex items-end gap-2 h-32" role="img" aria-label="Daily completion for the last 7 days">
              {week.map(w => <div key={w.d} className="flex-1 grid gap-1 justify-items-center"><span className="text-[10.5px] tnum text-muted">{w.pct == null ? '—' : `${w.pct}%`}</span><div className="w-full max-w-[28px] h-20 rounded-md bg-raised relative overflow-hidden"><div className={`absolute bottom-0 inset-x-0 rounded-md ${w.pct >= 80 ? 'bg-ok' : w.pct >= 50 ? 'bg-mod' : 'bg-high'}`} style={{ height: `${w.pct || 0}%` }}></div></div><span className={`text-[11px] ${w.d === date ? 'font-bold text-fg' : 'text-muted'}`}>{parseDay(w.d).toLocaleDateString(undefined, { weekday: 'narrow' })}</span></div>)}
            </div>
          </Panel>
          <Panel title="Reminder history" icon={History}>
            {(rem.history || []).length === 0 ? <p className="text-[13px] text-muted">No reminders yet.</p> :
            <ul className="grid gap-1 max-h-56 overflow-auto text-[12.5px]">{rem.history.slice(0, 30).map((h, i) => <li key={i} className="flex gap-2 border-b border-line/60 py-1"><span className="font-mono text-muted tnum whitespace-nowrap">{fmtTs(h.at)}</span><span className="min-w-0"><b>{h.name}</b> · {h.action}</span></li>)}</ul>}
          </Panel>
        </div>
      </div>

      <Panel title="Medication history calendar" icon={Calendar} right={<div className="flex items-center gap-1"><Btn size="sm" aria-label="Previous month" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}><ChevronLeft size={14} /></Btn><span className="min-w-[120px] text-center text-[13px] font-semibold">{calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</span><Btn size="sm" aria-label="Next month" onClick={() => setCalMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}><ChevronRight size={14} /></Btn></div>}>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,280px)]">
          <div className="grid grid-cols-7 gap-1 text-center">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((x, i) => <div key={i} className="eyebrow py-1">{x}</div>)}
            {cells.map((d, i) => { if (!d) return <div key={i}></div>; const s = dayInfo(d); const tone = !s || s.pct == null ? 'bg-raised/40 text-muted' : s.pct >= 80 ? 'bg-ok/20 text-ok' : s.pct >= 50 ? 'bg-mod/20 text-mod' : 'bg-high/20 text-high';
              return <button key={d} onClick={() => setSelDay(d)} className={`aspect-square max-w-full rounded-lg text-[12.5px] font-semibold tnum transition ${tone} ${selDay === d ? 'ring-2 ring-accent' : ''} ${d === date ? 'outline outline-1 outline-accent' : ''}`}>{parseDay(d).getDate()}</button>; })}
          </div>
          <div className="rounded-xl border border-line p-3 min-w-0">
            {!selDay ? <p className="text-[13px] text-muted">Select a day to see what was recorded. Green ≥ 80% taken, yellow ≥ 50%, orange below.</p> : (() => { const list = ev.filter(e => e.date === selDay && e.status !== 'pending'); const s = dayInfo(selDay); return (<>
              <div className="font-semibold">{fmtDate(selDay)}</div><div className="text-[12px] text-muted mb-2">{s ? `${s.taken} taken · ${s.skipped} skipped · ${s.pending} not recorded` : 'Future date'}</div>
              {list.length ? <ul className="grid gap-1 text-[12.5px]">{list.map(e => { const nm = released.find(m => e.doseKey.startsWith(m.key + '#'))?.name || e.doseKey; return <li key={e.id} className="flex flex-wrap gap-x-2"><span className={e.status === 'taken' ? 'text-ok font-semibold' : 'text-high font-semibold'}>{e.status}</span><span>{nm}</span><span className="text-muted font-mono tnum">{fmtTime(e.at)}</span>{e.reason && <span className="text-muted">· {e.reason}</span>}{e.synthetic && <Chip>synthetic</Chip>}</li>; })}</ul> : <p className="text-[12.5px] text-muted">Nothing recorded.</p>}
            </>); })()}
          </div>
        </div>
      </Panel>
    </div>
  );
}

/* ───────── prescriptions ───────── */
const emptyMed = () => ({ name: '', dose: '', unit: 'mg', route: '', freq: '', instructions: '' });
function UploadForm({ onClose, replaces }) {
  const { db, me, mutate, toast } = useApp();
  const prev = replaces && db.prescriptions.find(r => r.id === replaces);
  const [f, setF] = useState(() => prev ? { title: prev.title, prescriber: prev.prescriber.name, prescriberReg: prev.prescriber.regNo || '', org: prev.prescriber.org, date: prev.date, problem: prev.problem || '' } : { title: '', prescriber: '', prescriberReg: '', org: '', date: '', problem: '' });
  const [meds, setMeds] = useState(() => prev ? prev.meds.map(m => ({ name: m.name, dose: m.reg.dose || '', unit: m.reg.unit || 'mg', route: m.reg.route || '', freq: m.reg.freq || '', instructions: m.instructions || '' })) : [emptyMed()]);
  const [file, setFile] = useState(null), [fileErr, setFileErr] = useState(''), [errs, setErrs] = useState({}), [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF(s => ({ ...s, [k]: e.target.value }));
  const setMed = (i, k, v) => setMeds(ms => ms.map((m, j) => j === i ? { ...m, [k]: v } : m));
  const onFile = async (e) => { const fl = e.target.files?.[0]; setFileErr(''); if (!fl) return; setBusy(true); try { setFile(await readUpload(fl)); } catch (er) { setFile(null); setFileErr(er.message); } setBusy(false); };
  const submit = () => {
    const e = {};
    if (!file) e.file = 'Attach a photo or PDF of the prescription.';
    if (!f.prescriber.trim()) e.prescriber = 'Enter the prescribing doctor’s name as written.';
    if (!f.org.trim()) e.org = 'Enter the hospital or clinic.';
    if (!f.date) e.date = 'Enter the prescription date.'; else if (f.date > ymd()) e.date = 'The date can’t be in the future.';
    if (f.problem.trim().length < 5) e.problem = 'Describe the health problem in a few words.';
    const good = meds.filter(m => m.name.trim());
    if (!good.length) e.meds = 'Add at least one medicine as written on the prescription.';
    setErrs(e); if (Object.keys(e).length) return;
    const id = uid('RX');
    const rx = { id, kind: 'upload', patientId: me.id, title: f.title.trim() || `Prescription from ${f.prescriber.trim()}`, date: f.date, file,
      prescriber: { name: f.prescriber.trim(), org: f.org.trim(), regNo: f.prescriberReg.trim() }, problem: f.problem.trim(),
      meds: good.map(m => ({ name: m.name.trim(), strength: `${m.dose} ${m.unit}`.trim(), instructions: m.instructions.trim(), source: 'patient-transcribed', reg: { dose: m.dose.trim() || null, unit: m.dose.trim() ? m.unit : null, route: m.route || null, freq: m.freq || null } })),
      status: 'pending', uploadedBy: me.id, uploadedAt: nowISO(), reviews: [], replaces: replaces || null };
    if (!saveDb({ ...db, prescriptions: [...db.prescriptions, rx] })) { setErrs({ file: 'Browser storage is full, so this file can’t be saved. Try a smaller image or remove older uploads.' }); return; }
    mutate(n => {
      n.prescriptions.push(rx);
      if (replaces) { const o = n.prescriptions.find(r => r.id === replaces); if (o) o.replacedBy = id; }
      pushAudit(n, { ...actorOf(me), action: 'UPLOAD', patientId: me.id, item: id, detail: `Patient uploaded prescription “${rx.title}” (${file.type}, ${rx.meds.length} medicine${rx.meds.length > 1 ? 's' : ''} transcribed)${replaces ? `, replacing ${replaces}` : ''}. Status: Pending doctor verification.` });
      notify(n, me.id, { type: 'rx-uploaded', title: 'Prescription uploaded', body: `“${rx.title}” is waiting for doctor verification.`, link: 'prescriptions', ref: id });
      n.users.filter(u => u.role === 'doctor' && canAccess(n, u.id, me.id, 'prescriptions')).forEach(u => {
        notify(n, u.id, { type: 'rx-uploaded', title: 'New prescription uploaded', body: `${me.profile.fullName} uploaded “${rx.title}”.`, priority: 'normal', link: 'verify', ref: id });
        notify(n, u.id, { type: 'rx-awaiting', title: 'Prescription awaiting verification', body: `${me.profile.fullName} · ${rx.meds.map(m => m.name).join(', ')}`, priority: 'high', link: 'verify', ref: id });
      });
    });
    toast('Prescription uploaded. Status: Pending doctor verification.'); onClose(id);
  };
  return (
    <div className="grid gap-4">
      {prev && <div className="rounded-xl border border-info/30 bg-info/5 p-3 text-[13px]">Uploading a corrected version of “{prev.title}”. The original stays in your history unchanged.</div>}
      <Field label="Prescription document" id="up-file" required error={errs.file || fileErr} hint="JPG, PNG or WebP (resized for storage), or PDF up to 1.5 MB.">
        <label htmlFor="up-file" className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed p-4 transition ${file ? 'border-ok/50 bg-ok/5' : 'border-line hover:border-accent/50'}`}>
          {file?.type === 'image' ? <img src={file.dataUrl} alt="" className="h-16 w-14 rounded object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-xl bg-raised text-accent">{file ? <FileText size={20} /> : <Upload size={20} />}</span>}
          <span className="min-w-0"><span className="block font-semibold truncate">{busy ? 'Reading file…' : file ? file.name : 'Choose a photo or PDF'}</span><span className="block text-[12px] text-muted">{file ? `${Math.round(file.size / 1024)} KB · ${file.type === 'pdf' ? 'PDF' : 'image'}` : 'The original is stored unchanged for your doctor to compare.'}</span></span>
          <input id="up-file" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" onChange={onFile} />
        </label>
      </Field>
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Title" id="up-title" optional><input id="up-title" className={inputCls} value={f.title} onChange={set('title')} placeholder="e.g. Blood pressure prescription" /></Field>
        <Field label="Prescription date" id="up-date" required error={errs.date}><input id="up-date" type="date" max={ymd()} className={inputCls} value={f.date} onChange={set('date')} /></Field>
        <Field label="Prescribing doctor" id="up-prescriber" required error={errs.prescriber}><input id="up-prescriber" className={inputCls} value={f.prescriber} onChange={set('prescriber')} placeholder="As written on the prescription" /></Field>
        <Field label="Prescriber registration no." id="up-preg" optional><input id="up-preg" className={inputCls} value={f.prescriberReg} onChange={set('prescriberReg')} /></Field>
        <Field label="Hospital or clinic" id="up-org" required error={errs.org} className="sm:col-span-2"><input id="up-org" className={inputCls} value={f.org} onChange={set('org')} /></Field>
        <Field label="Your current health problem" id="up-problem" required error={errs.problem} className="sm:col-span-2"><textarea id="up-problem" rows={2} className={inputCls} value={f.problem} onChange={set('problem')} placeholder="A short description, e.g. ‘Itchy rash on both arms for a week’" /></Field>
      </div>
      <div className="grid gap-2">
        <div className="flex items-center justify-between"><div><div className="text-[13px] font-semibold">Medicines as written on the prescription</div><div className="text-[12px] text-muted">Copy them exactly. Leave a field as “Not stated” if the prescription doesn’t say it. Your doctor checks these against the document.</div></div></div>
        {errs.meds && <span className="text-[12px] text-crit">{errs.meds}</span>}
        {meds.map((m, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-line bg-raised/30 p-3 sm:grid-cols-6">
            <Field label="Medicine" id={`m-name-${i}`} className="sm:col-span-2"><input id={`m-name-${i}`} className={inputCls} value={m.name} onChange={e => setMed(i, 'name', e.target.value)} placeholder="e.g. Amlodipine" /></Field>
            <Field label="Strength" id={`m-dose-${i}`}><input id={`m-dose-${i}`} className={inputCls + ' font-mono'} value={m.dose} onChange={e => setMed(i, 'dose', e.target.value)} placeholder="5" /></Field>
            <Field label="Unit" id={`m-unit-${i}`}><select id={`m-unit-${i}`} className={inputCls} value={m.unit} onChange={e => setMed(i, 'unit', e.target.value)}>{UNITS.map(u => <option key={u}>{u}</option>)}</select></Field>
            <Field label="Route" id={`m-route-${i}`}><select id={`m-route-${i}`} className={inputCls} value={m.route} onChange={e => setMed(i, 'route', e.target.value)}><option value="">Not stated</option>{Object.entries(ROUTE).map(([k, v]) => <option key={k} value={k}>{k} · {v}</option>)}</select></Field>
            <Field label="How often" id={`m-freq-${i}`}><select id={`m-freq-${i}`} className={inputCls} value={m.freq} onChange={e => setMed(i, 'freq', e.target.value)}><option value="">Not stated</option>{Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Field>
            <Field label="Other instructions as written" id={`m-ins-${i}`} className="sm:col-span-5"><input id={`m-ins-${i}`} className={inputCls} value={m.instructions} onChange={e => setMed(i, 'instructions', e.target.value)} placeholder="e.g. after food, for 7 days" /></Field>
            <div className="flex items-end"><Btn size="sm" disabled={meds.length === 1} onClick={() => setMeds(ms => ms.filter((_, j) => j !== i))}><Trash2 size={13} />Remove</Btn></div>
          </div>))}
        <Btn size="sm" className="justify-self-start" onClick={() => setMeds(ms => [...ms, emptyMed()])}><Plus size={13} />Add another medicine</Btn>
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3"><Btn onClick={() => onClose()}>Cancel</Btn><Btn kind="primary" disabled={busy} onClick={submit}><Upload size={14} />Upload for verification</Btn></div>
    </div>
  );
}

function RxCard({ rx, onOpen }) {
  const { db } = useApp();
  return (
    <button onClick={() => onOpen(rx.id)} className="group text-left rounded-2xl border border-line bg-surface card-shadow p-3 flex gap-3 hover:border-accent/50 transition min-w-0">
      <div className="h-20 w-16 shrink-0 overflow-hidden rounded-lg border border-line bg-white grid place-items-center">{rx.file?.type === 'image' && rx.file.dataUrl ? <img src={rx.file.dataUrl} alt="" className="h-full w-full object-cover object-top" /> : <FileText size={22} className="text-muted" />}</div>
      <div className="min-w-0 flex-1 grid gap-1">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold truncate">{rx.title}</span><RxBadge status={rx.status} /></div>
        <div className="text-[12.5px] text-muted">{fmtDate(rx.date)} · {rx.prescriber.name} · {rx.prescriber.org}</div>
        <div className="text-[12.5px] truncate">{rx.kind === 'handover' ? 'Handover medication list (see reconciliation)' : rx.meds.map(m => m.name).join(', ')}</div>
        {rx.status === 'verified' && rx.verification && <div className="text-[11.5px] text-ok">Verified by {rx.verification.byName} · {fmtDate(rx.verification.at)}</div>}
        {rx.status === 'clarification' && <div className="text-[11.5px] text-info font-semibold">Your doctor needs more information — open to reply</div>}
        {rx.status === 'rejected' && <div className="text-[11.5px] text-crit font-semibold">Rejected — open to see why{rx.replacedBy ? ' (corrected copy uploaded)' : ''}</div>}
      </div>
    </button>
  );
}

function RxDetail({ id, onClose, onReupload }) {
  const { db, me, mutate, toast } = useApp();
  const rx = db.prescriptions.find(r => r.id === id);
  const [reply, setReply] = useState('');
  if (!rx) return null;
  const lastClar = [...rx.reviews].reverse().find(r => r.action === 'CLARIFICATION_REQUESTED');
  const lastRej = [...rx.reviews].reverse().find(r => r.action === 'REJECTED');
  const sendReply = () => {
    mutate(n => {
      const r = n.prescriptions.find(x => x.id === id); r.status = 'pending'; r.reviews.push({ at: nowISO(), by: me.id, byName: me.profile.fullName, action: 'PATIENT_REPLY', comment: reply.trim() });
      pushAudit(n, { ...actorOf(me), action: 'CLARIFICATION_REPLY', patientId: me.id, item: id, detail: `Patient replied to clarification request: “${reply.trim()}”. Status back to Pending doctor verification.` });
      if (lastClar) notify(n, lastClar.by, { type: 'clarification-received', title: 'Clarification received', body: `${me.profile.fullName} replied on “${r.title}”.`, priority: 'high', link: 'verify', ref: id });
    });
    setReply(''); toast('Reply sent to your doctor');
  };
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="min-w-0"><div className="eyebrow mb-1">Original document (unchanged)</div><RxDocument rx={rx} /></div>
      <div className="grid gap-3 content-start min-w-0">
        <div className="flex flex-wrap items-center gap-2"><RxBadge status={rx.status} />{rx.replaces && <Chip>Corrected copy of {rx.replaces}</Chip>}</div>
        <dl className="grid grid-cols-2 gap-3"><KV k="Prescription date" v={fmtDate(rx.date)} /><KV k="Uploaded" v={fmtTs(rx.uploadedAt)} /><KV k="Prescribing doctor" v={`${rx.prescriber.name}${rx.prescriber.regNo ? ` (${rx.prescriber.regNo})` : ''}`} /><KV k="Hospital / clinic" v={rx.prescriber.org} />{rx.problem && <div className="col-span-2"><KV k="Reported health problem" v={rx.problem} /></div>}</dl>
        {rx.kind !== 'handover' && <div><div className="eyebrow mb-1">{rx.kind === 'transfer' ? 'Medicines (as written in the transfer record)' : 'Medicines (patient-transcribed)'}</div><ul className="grid gap-1.5">{rx.meds.map((m, i) => <li key={i} className="rounded-xl border border-line p-2.5"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{m.name}</span>{(rx.flaggedIdx || []).includes(i) && <Chip tone="high"><Flag size={11} />In professional review</Chip>}</div><RegChips reg={m.reg} />{m.instructions && <div className="text-[12.5px] text-muted mt-1">“{m.instructions}”</div>}</li>)}</ul></div>}
        {rx.status === 'verified' && rx.verification && <div className="rounded-xl border border-ok/30 bg-ok/5 p-3 text-[13px] grid gap-1">
          <div className="flex items-center gap-1.5 font-semibold text-ok"><BadgeCheck size={15} />Verified {fmtTs(rx.verification.at)}</div>
          <div><span className="text-muted">Original prescriber:</span> {rx.prescriber.name}, {rx.prescriber.org}</div>
          <div><span className="text-muted">Reviewing professional:</span> {rx.verification.byName} · {rx.verification.byDesignation} · {rx.verification.byOrg} · Reg. {rx.verification.byReg}</div>
          <div className="text-[12px] text-muted">The reviewing professional confirmed the recorded details match the document. They are not the original prescriber.</div>
        </div>}
        {rx.status === 'clarification' && lastClar && <div className="rounded-xl border border-info/30 bg-info/5 p-3 grid gap-2">
          <div className="text-[13px]"><b>{lastClar.byName}</b> asked: “{lastClar.comment}”</div>
          <Field label="Your reply" id="clar-reply"><textarea id="clar-reply" rows={2} className={inputCls} value={reply} onChange={e => setReply(e.target.value)} /></Field>
          <div className="flex flex-wrap gap-2"><Btn kind="primary" size="sm" disabled={reply.trim().length < 2} onClick={sendReply}><Send size={13} />Send reply</Btn><Btn size="sm" onClick={() => onReupload(id)}><Upload size={13} />Upload a corrected document</Btn></div>
        </div>}
        {rx.status === 'rejected' && <div className="rounded-xl border border-crit/30 bg-crit/5 p-3 grid gap-2"><div className="text-[13px]"><b>Reason:</b> {lastRej?.comment}</div><div className="text-[12px] text-muted">This prescription is not in your verified list or checklist.</div>{!rx.replacedBy ? <Btn kind="primary" size="sm" className="justify-self-start" onClick={() => onReupload(id)}><Upload size={13} />Upload a corrected document</Btn> : <div className="text-[12.5px] text-ok">Corrected copy uploaded ({rx.replacedBy}).</div>}</div>}
        {RX_ON_HOLD.includes(rx.status) && <div className="rounded-xl border border-crit/30 bg-crit/5 p-3 text-[13px] grid gap-1"><div className="font-semibold flex items-center gap-1.5"><Lock size={14} className="text-crit" />On hold: some details are missing</div><div>The transfer record doesn’t say everything needed to give one of these medicines safely, so your care team has asked a clinician to confirm. Nothing in your current instructions has changed, and these medicines won’t appear in your checklist until it’s confirmed.</div></div>}
        {rx.status === 'discrepancy' && <div className="rounded-xl border border-mod/40 bg-mod/10 p-3 text-[13px]">A professional flagged a possible discrepancy. It’s in professional review, and these medicines won’t appear as confirmed until that review is complete.</div>}
        <div><div className="eyebrow mb-1">Review history</div>{rx.reviews.length ? <ul className="grid gap-1 text-[12.5px]">{rx.reviews.map((r, i) => <li key={i} className="border-b border-line/60 py-1"><span className="font-mono text-muted tnum">{fmtTs(r.at)}</span> · <b>{r.byName}</b> · {r.action.replace(/_/g, ' ').toLowerCase()}{r.comment ? `: “${r.comment}”` : ''}</li>)}</ul> : <p className="text-[12.5px] text-muted">No reviews yet.</p>}</div>
      </div>
    </div>
  );
}

function PrescriptionsPage({ nav }) {
  const { db, me } = useApp();
  const [tab, setTab] = useState('all');
  const [open, setOpen] = useState(nav.ref && db.prescriptions.some(r => r.id === nav.ref) ? nav.ref : null);
  const [upload, setUpload] = useState(false), [replaces, setReplaces] = useState(null);
  useEffect(() => { if (nav.ref && db.prescriptions.some(r => r.id === nav.ref)) setOpen(nav.ref); }, [nav.n]);
  const mine = db.prescriptions.filter(r => r.patientId === me.id).sort((a, b) => b.date.localeCompare(a.date));
  const groups = { all: mine, verified: mine.filter(r => r.status === 'verified'), pending: mine.filter(r => ['pending', 'discrepancy', 'reconciled', ...RX_ON_HOLD].includes(r.status)), attention: mine.filter(r => ['clarification', 'rejected'].includes(r.status) && !r.replacedBy) };
  const cur = open && db.prescriptions.find(r => r.id === open);
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Medical folder" title="My prescriptions" sub="Upload a photo or PDF of any prescription. A healthcare professional you’ve authorised checks it against the original before it becomes part of your verified medicines." actions={<Btn kind="primary" onClick={() => { setReplaces(null); setUpload(true); }}><Upload size={14} />Upload prescription</Btn>} />
      <Segmented label="Filter prescriptions" value={tab} onChange={setTab} options={[['all', 'All', groups.all.length], ['verified', 'Verified', groups.verified.length], ['pending', 'In progress', groups.pending.length], ['attention', 'Needs your attention', groups.attention.length]]} />
      {groups[tab].length === 0 ? <Empty icon={FolderOpen} title="Nothing here yet" body={tab === 'all' ? 'Upload your first prescription to start your medical folder.' : 'No prescriptions match this filter.'} /> :
        <div className="grid gap-3 md:grid-cols-2">{groups[tab].map(rx => <RxCard key={rx.id} rx={rx} onOpen={setOpen} />)}</div>}
      <Modal open={upload} onClose={() => setUpload(false)} title={replaces ? 'Upload a corrected prescription' : 'Upload a prescription'} wide><UploadForm replaces={replaces} onClose={(id) => { setUpload(false); if (id) setOpen(id); }} /></Modal>
      <Modal open={!!cur} onClose={() => setOpen(null)} title={cur?.title || ''} wide>{cur && <RxDetail id={cur.id} onClose={() => setOpen(null)} onReupload={(rid) => { setOpen(null); setReplaces(rid); setUpload(true); }} />}</Modal>
    </div>
  );
}

/* ───────── access management (patient controls consent) ───────── */
function DoctorLine({ u }) {
  return <div className="flex items-center gap-3 min-w-0"><Avatar name={u.profile.fullName} tone="navy" /><div className="min-w-0"><div className="font-semibold truncate">{u.profile.fullName}</div><div className="text-[12px] text-muted truncate">{u.profile.specialisation} · {orgOf(u)} · <span className="font-mono">{u.id}</span></div></div></div>;
}
const CredBadge = ({ u }) => <CredentialBadge u={u} />;

function AccessPage() {
  const { db, me, mutate, toast, now } = useApp();
  const [declining, setDeclining] = useState(null), [why, setWhy] = useState(''), [revoking, setRevoking] = useState(null);
  const mine = db.grants.filter(g => g.patientId === me.id);
  const pending = mine.filter(g => g.status === 'pending').sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  const active = mine.filter(g => grantState(g, now) === 'approved');
  const doc = (g) => userById(db, g.doctorId);
  const accept = (g) => {
    const d = doc(g);
    mutate(n => { const x = n.grants.find(y => y.id === g.id); x.status = 'approved'; x.decidedAt = nowISO(); x.expiresAt = new Date(Date.now() + DURATION[x.durationId].ms).toISOString();
      pushAudit(n, { ...actorOf(me), action: 'ACCESS_APPROVED', patientId: me.id, item: g.id, detail: `Granted ${d.profile.fullName} (${d.id}): ${g.scopes.map(s => SCOPE[s].label).join(', ')} until ${fmtTs(x.expiresAt)}.` });
      notify(n, d.id, { type: 'access-approved', title: `${me.profile.fullName} approved your access`, body: `${g.scopes.map(s => SCOPE[s].label).join(', ')} · ${DURATION[g.durationId].label}`, priority: 'high', link: 'patients', ref: me.id }); });
    toast(`Access granted to ${d.profile.fullName}. Only the requested records are shared.`);
  };
  const decline = (g) => {
    const d = doc(g);
    mutate(n => { const x = n.grants.find(y => y.id === g.id); x.status = 'declined'; x.decidedAt = nowISO(); x.declineReason = why.trim();
      pushAudit(n, { ...actorOf(me), action: 'ACCESS_DECLINED', patientId: me.id, item: g.id, detail: `Declined request from ${d.profile.fullName} (${d.id})${why.trim() ? `: ${why.trim()}` : ''}.` });
      notify(n, d.id, { type: 'access-declined', title: `${me.profile.fullName} declined your access request`, body: why.trim() || 'No reason given.', priority: 'normal', link: 'request' }); });
    setDeclining(null); setWhy(''); toast('Request declined. No records were shared.');
  };
  const revoke = (g) => {
    const d = doc(g);
    mutate(n => { const x = n.grants.find(y => y.id === g.id); x.status = 'revoked'; x.revokedAt = nowISO();
      pushAudit(n, { ...actorOf(me), action: 'ACCESS_REVOKED', patientId: me.id, item: g.id, detail: `Revoked ${d.profile.fullName}'s access to ${g.scopes.map(s => SCOPE[s].label).join(', ')}. Effective immediately.` });
      notify(n, d.id, { type: 'access-revoked', title: `${me.profile.fullName} revoked your access`, body: 'You can no longer view this patient’s shared records.', priority: 'high', link: 'patients' }); });
    setRevoking(null); toast(`${d.profile.fullName} no longer has access`);
  };
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Privacy & consent" title="Access requests" sub="No doctor or hospital can see your records until you approve a request. You choose what they see, and you can take access away at any time." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 grid gap-4 content-start min-w-0">
          <Panel title={`Waiting for your decision (${pending.length})`} icon={Inbox}>
            {pending.length === 0 ? <Empty icon={CheckCircle2} title="No pending requests" body="When a professional asks for access, it appears here and in your notifications." /> :
            <ul className="grid gap-3">{pending.map(g => { const d = doc(g); return (
              <li key={g.id} className="pop rounded-2xl border-2 border-high/40 bg-high/[.04] p-4 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><DoctorLine u={d} /><CredBadge u={d} /></div>
                <dl className="grid sm:grid-cols-3 gap-3"><KV k="Reason" v={g.reason} /><KV k="Requested" v={fmtTs(g.requestedAt)} /><KV k="Duration" v={DURATION[g.durationId].label} /></dl>
                {g.note && <p className="text-[13px] text-fg/85">“{g.note}”</p>}
                <div><div className="eyebrow mb-1">Requested information</div><ScopeChips scopes={g.scopes} /></div>
                {declining === g.id ? <div className="grid gap-2 rounded-xl bg-raised/60 p-3"><Field label="Reason for declining" id={`dec-${g.id}`} optional><input id={`dec-${g.id}`} className={inputCls} value={why} onChange={e => setWhy(e.target.value)} /></Field><div className="flex gap-2"><Btn kind="danger" size="sm" onClick={() => decline(g)}>Decline request</Btn><Btn size="sm" onClick={() => setDeclining(null)}>Cancel</Btn></div></div> :
                <div className="flex flex-wrap gap-2"><Btn kind="ok" onClick={() => accept(g)}><Check size={14} />Accept request</Btn><Btn kind="danger" onClick={() => { setDeclining(g.id); setWhy(''); }}><Ban size={14} />Decline request</Btn><span className="text-[12px] text-muted self-center">Accepting shares only the items listed above.</span></div>}
              </li>); })}</ul>}
          </Panel>
          <Panel title={`Authorised healthcare professionals (${active.length})`} icon={ShieldCheck}>
            {active.length === 0 ? <Empty icon={Lock} title="Nobody has access" body="Your records are private. Approved professionals will be listed here." /> :
            <ul className="grid gap-3">{active.map(g => { const d = doc(g); const left = Date.parse(g.expiresAt) - now; return (
              <li key={g.id} className="rounded-2xl border border-line p-4 grid gap-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><DoctorLine u={d} /><GrantBadge state="approved" /></div>
                <ScopeChips scopes={g.scopes} />
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted"><span>Granted {fmtTs(g.decidedAt)}</span><span className={left < HOUR ? 'text-high font-semibold' : ''}>Expires {fmtTs(g.expiresAt)} ({relTime(g.expiresAt, now)})</span></div>
                {revoking === g.id ? <div className="flex flex-wrap items-center gap-2 rounded-xl bg-crit/5 p-3"><span className="text-[13px]">Revoke access for {d.profile.fullName} now?</span><Btn kind="danger" size="sm" onClick={() => revoke(g)}>Yes, revoke</Btn><Btn size="sm" onClick={() => setRevoking(null)}>Keep access</Btn></div> :
                <Btn kind="danger" size="sm" className="justify-self-start" onClick={() => setRevoking(g.id)}><Lock size={13} />Revoke access</Btn>}
              </li>); })}</ul>}
          </Panel>
        </div>
        <div className="grid gap-4 content-start min-w-0">
          <Panel title="Your MediTrace ID" icon={KeyRound}><div className="font-mono text-[22px] font-semibold text-navy">{me.id}</div><p className="text-[12.5px] text-muted mt-1">Share this ID with a professional so they can send you a request. Sharing it doesn’t give anyone access.</p><div className="mt-2"><CopyBtn text={me.id} label="Copy ID" /></div></Panel>
          <Panel title="Request history" icon={History}>
            {mine.length === 0 ? <p className="text-[13px] text-muted">No requests yet.</p> :
            <ul className="grid gap-2">{[...mine].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)).map(g => <li key={g.id} className="rounded-xl border border-line p-2.5 text-[12.5px] grid gap-1"><div className="flex items-center justify-between gap-2"><b className="truncate">{doc(g)?.profile.fullName}</b><GrantBadge state={grantState(g, now)} /></div><div className="text-muted">{g.scopes.map(s => SCOPE[s].label).join(', ')}</div><div className="text-muted">Requested {fmtDate(g.requestedAt)}{g.decidedAt ? ` · decided ${fmtDate(g.decidedAt)}` : ''}</div></li>)}</ul>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/* ───────── dashboard ───────── */
function PatientDashboard({ go }) {
  const { db, me, now } = useApp();
  const p = me.profile, rec = db.records[me.id] || { allergies: [], visits: [] };
  const { released, pending } = verifiedMeds(db, me.id);
  const date = ymd(); const doses = dosesOn(released, date); const stats = dayStats(db, me.id, date, doses);
  const ev = adherenceEvents(db, me.id); const rem = remOf(db, me.id);
  const upcoming = doses.map(d => ({ d, t: reminderTimeFor(rem, d) })).filter(x => x.t && !doseState(ev, date, x.d.key)).sort((a, b) => a.t.localeCompare(b.t));
  const reqs = db.grants.filter(g => g.patientId === me.id && g.status === 'pending');
  const docs = db.grants.filter(g => g.patientId === me.id && grantState(g, now) === 'approved');
  const rxPending = db.prescriptions.filter(r => r.patientId === me.id && ['pending', 'clarification', 'discrepancy', ...RX_ON_HOLD].includes(r.status));
  const notes = db.notifications.filter(n => n.userId === me.id).slice(0, 4);
  const visits = [...rec.visits].sort((a, b) => b.visitDate.localeCompare(a.visitDate)).slice(0, 3);
  const nextPending = doses.filter(d => !doseState(ev, date, d.key)).slice(0, 4);
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface card-shadow p-5">
        <div className="flex items-center gap-4 min-w-0"><Avatar name={p.fullName} size={52} /><div className="min-w-0"><div className="eyebrow">{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'}</div><h1 className="font-display text-[24px] font-extrabold leading-tight truncate">Welcome back, {p.fullName.split(' ')[0]}</h1><div className="text-[13px] text-muted">MediTrace ID <span className="font-mono text-fg">{me.id}</span>{p.dob ? ` · ${ageFrom(p.dob)} years` : ''}{p.blood ? ` · Blood group ${p.blood}` : ''}</div></div></div>
        <div className="flex flex-wrap gap-2"><Btn kind="primary" onClick={() => go('checklist')}><ListChecks size={14} />Open today’s checklist</Btn><Btn onClick={() => go('prescriptions')}><Upload size={14} />Upload prescription</Btn></div>
      </div>
      {rec.allergies.length > 0 && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-crit/30 bg-crit/5 px-4 py-2.5 text-[13.5px]"><AlertTriangle size={16} className="text-crit" /><b className="text-crit">Allergies:</b>{rec.allergies.map(a => <span key={a.id}>{a.substance}{a.reaction ? ` (${a.reaction})` : ''}</span>)}</div>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Today’s checklist" value={stats.pct == null ? '—' : `${stats.pct}%`} sub={`${stats.taken} taken · ${stats.pending} pending`} icon={ListChecks} onClick={() => go('checklist')} />
        <Stat label="Access requests" value={reqs.length} sub={reqs.length ? 'Waiting for your decision' : 'None pending'} icon={KeyRound} tone={reqs.length ? 'high' : 'accent'} onClick={() => go('access')} />
        <Stat label="Pending verifications" value={rxPending.length} sub="Prescriptions being checked" icon={Clock} tone="info" onClick={() => go('prescriptions')} />
        <Stat label="Authorised professionals" value={docs.length} sub="Currently have access" icon={ShieldCheck} tone="ok" onClick={() => go('access')} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2 min-w-0" title="Today’s medication checklist" icon={ListChecks} right={<Btn size="sm" onClick={() => go('checklist')}>Full checklist <ChevronRight size={13} /></Btn>}>
          {doses.length === 0 ? <Empty icon={Pill} title="No verified doses today" body="Verified medicines appear here automatically." /> : nextPending.length === 0 ? <div className="flex items-center gap-2 text-ok font-semibold"><CheckCircle2 size={18} />All of today’s scheduled doses are recorded.</div> : <ul className="grid gap-2">{nextPending.map(d => <DoseRow key={d.key} d={d} compact />)}</ul>}
        </Panel>
        <Panel title="Upcoming reminders" icon={AlarmClock} right={<Btn size="sm" onClick={() => go('checklist')}>Settings</Btn>}>
          {!rem.enabled ? <p className="text-[13px] text-muted">Reminders are off.</p> : upcoming.length === 0 ? <p className="text-[13px] text-muted">No more reminders today.</p> :
          <ul className="grid gap-1.5">{upcoming.slice(0, 5).map(({ d, t }) => <li key={d.key} className="flex items-center gap-3 rounded-xl bg-raised/50 px-3 py-2"><span className="font-mono text-[14px] font-semibold tnum text-accent">{t}</span><span className="min-w-0 truncate text-[13px]"><b>{d.name}</b> · {d.reg.dose} {d.reg.unit}</span></li>)}</ul>}
        </Panel>
        <Panel title="Access requests" icon={KeyRound} right={<Btn size="sm" onClick={() => go('access')}>Manage</Btn>}>
          {reqs.length === 0 ? <p className="text-[13px] text-muted">No pending requests.</p> : <ul className="grid gap-2">{reqs.map(g => { const d = userById(db, g.doctorId); return <li key={g.id} className="rounded-xl border border-high/40 bg-high/5 p-2.5"><div className="font-semibold text-[13.5px]">{d.profile.fullName}</div><div className="text-[12px] text-muted">{g.scopes.map(s => SCOPE[s].label).join(', ')}</div><Btn size="sm" kind="primary" className="mt-2" onClick={() => go('access')}>Review request</Btn></li>; })}</ul>}
        </Panel>
        <Panel title="Authorised professionals" icon={ShieldCheck}>
          {docs.length === 0 ? <p className="text-[13px] text-muted">Nobody has access to your records.</p> : <ul className="grid gap-2">{docs.map(g => <li key={g.id}><DoctorLine u={userById(db, g.doctorId)} /><div className="ml-12 text-[11.5px] text-muted">until {fmtDate(g.expiresAt)}</div></li>)}</ul>}
        </Panel>
        <Panel title="Pending prescription verifications" icon={Clock} right={<Btn size="sm" onClick={() => go('prescriptions')}>All prescriptions</Btn>}>
          {rxPending.length === 0 ? <p className="text-[13px] text-muted">Nothing waiting.</p> : <ul className="grid gap-2">{rxPending.map(r => <li key={r.id}><button onClick={() => go('prescriptions', r.id)} className="w-full text-left rounded-xl border border-line p-2.5 hover:bg-raised/50"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold text-[13.5px]">{r.title}</span><RxBadge status={r.status} /></div><div className="text-[12px] text-muted">{fmtDate(r.date)} · {r.prescriber.name}</div></button></li>)}</ul>}
        </Panel>
        <Panel title="Recent hospital visits" icon={Building2} right={<Btn size="sm" onClick={() => go('history')}>Medical history</Btn>}>
          {visits.length === 0 ? <p className="text-[13px] text-muted">No visits recorded.</p> : <ul className="grid gap-2">{visits.map(v => <li key={v.id} className="text-[13px]"><div className="font-semibold">{v.hospital}</div><div className="text-muted text-[12px]">{fmtDate(v.visitDate)} · {v.reason}</div></li>)}</ul>}
        </Panel>
        <Panel className="lg:col-span-2" title="Notifications" icon={Bell} right={<Btn size="sm" onClick={() => go('notifications')}>View all</Btn>}>
          {notes.length === 0 ? <p className="text-[13px] text-muted">You’re all caught up.</p> : <ul className="grid gap-1.5">{notes.map(n => <NotificationRow key={n.id} n={n} go={go} compact />)}</ul>}
        </Panel>
        <Panel title="Shortcuts" icon={FolderOpen}>
          <div className="grid gap-2">{[['history', BookOpen, 'My medical history'], ['prescriptions', FileText, 'Prescription history'], ['medicines', ShieldCheck, 'Verified medicines'], ['activity', History, 'Access & activity log']].map(([v, I, l]) => <Btn key={v} className="justify-start" onClick={() => go(v)}><I size={14} />{l}</Btn>)}</div>
        </Panel>
      </div>
    </div>
  );
}

function PatientProfile() {
  const { db, me, mutate, toast } = useApp();
  const [f, setF] = useState({ phone: me.phone, address: me.profile.address || '', emergency: me.profile.emergency || '', blood: me.profile.blood || '', gender: me.profile.gender || '' });
  const [err, setErr] = useState('');
  const save = () => {
    const ph = digits(f.phone); if (ph.length < 7 || ph.length > 15) return setErr('Enter a phone number with 7–15 digits.');
    if (db.users.some(u => u.id !== me.id && u.phone === ph)) return setErr('Another account uses this phone number.');
    setErr(''); mutate(n => { const u = n.users.find(x => x.id === me.id); u.phone = ph; Object.assign(u.profile, { address: f.address.trim(), emergency: f.emergency.trim(), blood: f.blood, gender: f.gender }); pushAudit(n, { ...actorOf(me), action: 'PROFILE_UPDATED', patientId: me.id, item: me.id, detail: 'Updated contact or optional profile details.' }); });
    toast('Profile saved');
  };
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Account" title="My profile" />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Identity" icon={UserRound}><div className="flex items-center gap-3"><Avatar name={me.profile.fullName} size={48} /><div><div className="font-display text-[18px] font-bold">{me.profile.fullName}</div><div className="font-mono text-navy">{me.id}</div></div></div><dl className="mt-4 grid grid-cols-2 gap-3"><KV k="Date of birth" v={fmtDate(me.profile.dob)} /><KV k="Email" v={me.email} /><KV k="Member since" v={fmtDate(me.createdAt)} /><KV k="Account type" v="Patient" /></dl><div className="mt-3"><CopyBtn text={me.id} label="Copy ID" /></div></Panel>
        <Panel className="lg:col-span-2" title="Contact & optional details" icon={Phone}>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Phone number" id="pf-phone" required><input id="pf-phone" className={inputCls} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></Field>
            <Field label="Gender" id="pf-gender" optional><select id="pf-gender" className={inputCls} value={f.gender} onChange={e => setF({ ...f, gender: e.target.value })}><option value="">Prefer not to say</option>{['Female', 'Male', 'Non-binary', 'Other'].map(g => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Blood group" id="pf-blood" optional><select id="pf-blood" className={inputCls} value={f.blood} onChange={e => setF({ ...f, blood: e.target.value })}><option value="">Unknown</option>{['A+', 'A−', 'B+', 'B−', 'AB+', 'AB−', 'O+', 'O−'].map(g => <option key={g}>{g}</option>)}</select></Field>
            <Field label="Emergency contact" id="pf-em" optional><input id="pf-em" className={inputCls} value={f.emergency} onChange={e => setF({ ...f, emergency: e.target.value })} /></Field>
            <Field label="Address" id="pf-addr" optional className="sm:col-span-2"><input id="pf-addr" className={inputCls} value={f.address} onChange={e => setF({ ...f, address: e.target.value })} /></Field>
          </div>
          {err && <div className="mt-2 text-[13px] text-crit">{err}</div>}
          <Btn kind="primary" className="mt-3" onClick={save}>Save changes</Btn>
        </Panel>
        <SecuritySettings />
      </div>
    </div>
  );
}

function ActivityPage() {
  const { db, me } = useApp();
  const log = db.log.filter(e => e.patientId === me.id);
  const [chain, setChain] = useState(null);
  return (
    <div className="grid gap-4">
      <PageHead eyebrow="Transparency" title="Access & activity log" sub="Every access request, approval, decline, revocation, upload, verification and change to your record." actions={<Btn onClick={() => setChain(verifyChain(realLog(db)))}><Link2 size={14} />Verify log integrity</Btn>} />
      {chain && <div className={`rounded-xl px-3 py-2 text-[13px] ring-1 ${chain.ok ? 'bg-ok/10 text-ok ring-ok/30' : 'bg-crit/10 text-crit ring-crit/30'}`}>{chain.ok ? `Log intact: ${chain.n} linked entries, none altered.` : `Log altered at entry ${chain.at}.`}</div>}
      <Panel title={`${log.length} entries about your record`} icon={History}><AuditTable log={log} /></Panel>
    </div>
  );
}
