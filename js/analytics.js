/* MediTrace v2 · Clinical analytics & visual cues (added feature; nothing existing is changed).
   Discrepancy breakdown (active vs resolved), Constraint 5 surge & resource meter, handover compliance trend,
   and pulsing status badges. All numbers are computed from this browser's demo database, except the 12-week
   handover trend, which is a clearly labelled synthetic cohort. */
const { BarChart3: AnIcBar, TrendingUp: AnIcTrend, AlertOctagon: AnIcOct, Hourglass: AnIcHour, Gauge: AnIcGauge } = L;

const AN_CATS = [
  { id: 'dosage', label: 'Dosage conflicts', re: /dose conflict|dose/i },
  { id: 'frequency', label: 'Frequency conflicts', re: /frequency/i },
  { id: 'formulation', label: 'Formulation changes', re: /formulation/i },
  { id: 'completeness', label: 'Missing / low-confidence fields', re: /missing unit|low ocr|confidence/i },
  { id: 'presence', label: 'New or omitted medicines', re: /new in visit|omitted/i },
  { id: 'interaction', label: 'Interactions & cautions', re: /interaction|caution/i },
];
const AN_TREND = [[14, 8, 6.5], [16, 9, 6.1], [15, 10, 5.8], [18, 12, 5.2], [17, 12, 4.9], [19, 14, 4.4], [21, 16, 3.9], [20, 16, 3.6], [22, 18, 3.2], [24, 20, 2.9], [23, 20, 2.7], [25, 22, 2.4]];

/* Pulsing high-impact badges. The pulse respects prefers-reduced-motion (global rule in index.html). */
function PulseBadge({ kind, label }) {
  const cfg = {
    critical: { cls: 'text-crit bg-crit/10 ring-crit/40', v: '--c-crit', I: AnIcOct, t: '[CRITICAL CONFLICT]' },
    npi: { cls: 'text-ok bg-ok/10 ring-ok/40', v: '--c-ok', I: BadgeCheck, t: '[VERIFIED NPI]' },
    escalation: { cls: 'text-high bg-high/10 ring-high/40', v: '--c-high', I: AnIcHour, t: '[PENDING ESCALATION - Constraint 12]' },
    flagged: { cls: 'text-crit bg-crit/10 ring-crit/40', v: '--c-crit', I: ShieldAlert, t: '[FLAGGED / UNVERIFIED]' },
  }[kind];
  const I = cfg.I;
  return <span data-badge={kind} className={`mt-pulse inline-flex items-center gap-1.5 rounded-full ring-1 px-2.5 py-1 font-mono text-[11.5px] font-bold ${cfg.cls}`} style={{ '--pulse': `var(${cfg.v})` }}><I size={13} />{label || cfg.t}</span>;
}

function AnGauge({ value, max, label, caption, color }) {
  const p = Math.max(0, Math.min(1, max ? value / max : 0)), c = Math.PI * 52;
  return (
    <figure className="flex flex-col items-center m-0" aria-label={`${label}: ${caption}`}>
      <svg viewBox="0 0 130 74" className="w-full max-w-[160px]">
        <path d="M13 66 A52 52 0 0 1 117 66" fill="none" stroke="rgb(var(--c-raised))" strokeWidth="12" strokeLinecap="round" />
        <path d="M13 66 A52 52 0 0 1 117 66" fill="none" stroke={`rgb(var(--c-${color}))`} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${c * p} ${c}`} />
        <text x="65" y="60" textAnchor="middle" style={{ font: '800 19px Manrope, system-ui', fill: 'rgb(var(--c-fg))' }}>{caption}</text>
      </svg>
      <figcaption className="text-center text-[12px] font-semibold text-muted">{label}</figcaption>
    </figure>
  );
}

function AnMeter({ label, value, max, color, sub, marker }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]"><span className="font-semibold">{label}</span><span className="tnum text-muted">{sub}</span></div>
      <div className="relative h-3 rounded-full bg-raised" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}>
        <div className="h-3 rounded-full transition-all" style={{ width: `${pct}%`, background: `rgb(var(--c-${color}))` }} />
        {marker && <div className="absolute -top-1 h-5 w-0.5 bg-fg/70" style={{ left: `${Math.min(100, (marker / max) * 100)}%` }} title="capacity" />}
      </div>
    </div>
  );
}

function AnTrend({ data }) {
  const [hover, setHover] = useState(null);
  const W = 640, H = 220, Lx = 36, R = 12, T = 14, B = 28;
  const x = (i) => Lx + (i * (W - Lx - R)) / Math.max(1, data.length - 1);
  const y = (v) => T + (1 - v / 100) * (H - T - B);
  const path = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.rate).toFixed(1)}`).join(' ');
  const h = hover != null ? data[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Weekly handover compliance rate" id="chart-trend" onMouseLeave={() => setHover(null)}>
        {[0, 25, 50, 75, 100].map(v => <g key={v}><line x1={Lx} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgb(var(--c-line))" /><text x={Lx - 6} y={y(v) + 4} textAnchor="end" style={{ font: '11px Figtree, system-ui', fill: 'rgb(var(--c-muted))' }}>{v}%</text></g>)}
        <line x1={Lx} x2={W - R} y1={y(80)} y2={y(80)} stroke="rgb(var(--c-muted))" strokeDasharray="4 4" />
        <text x={Lx + 4} y={y(80) + 14} style={{ font: '11px Figtree, system-ui', fill: 'rgb(var(--c-muted))' }}>80% target</text>
        <path d={path} fill="none" stroke="rgb(var(--c-accent))" strokeWidth="2" strokeLinejoin="round" />
        {data.map((d, i) => <g key={i}>
          {i % 3 === 0 || i === data.length - 1 ? <text x={x(i)} y={H - 8} textAnchor="middle" style={{ font: '11px Figtree, system-ui', fill: 'rgb(var(--c-muted))' }}>{d.week.slice(5)}</text> : null}
          <circle cx={x(i)} cy={y(d.rate)} r="4" fill="rgb(var(--c-accent))" stroke="rgb(var(--c-surface))" strokeWidth="2" />
          <rect x={x(i) - 18} y={T} width="36" height={H - T - B} fill="transparent" tabIndex={0} aria-label={`${d.week}: ${d.rate}%`} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} />
        </g>)}
        {h && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="rgb(var(--c-muted))" />}
      </svg>
      {h && <div className="pointer-events-none absolute top-1 rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[12px] card-shadow" style={{ left: `min(calc(${(x(hover) / W) * 100}% + 8px), calc(100% - 180px))` }}>
        <div className="font-bold">Week of {h.week}</div><div className="tnum">{h.rate}% compliant · {h.compliant}/{h.transfers} transfers</div><div className="tnum text-muted">median {h.median} days to verified list</div>
      </div>}
    </div>
  );
}

function AnalyticsPage({ go }) {
  const { db, me, now } = useApp();
  const hm = (m) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  const pids = medsAccessPatients(db, me.id, now);
  const items = reconMedsFor(db, pids).filter(m => m.severity && m.severity !== 'none');
  const st = (m) => db.recon.items[m.id]?.status || 'open';
  const active = items.filter(m => ['open', 'decided', 'escalated'].includes(st(m))), resolved = items.filter(m => st(m) === 'verified');
  const catOf = (m) => AN_CATS.filter(c => (m.findings || []).some(f => c.re.test(f))).map(c => c.id);
  const breakdown = AN_CATS.map(c => ({ ...c, a: active.filter(m => catOf(m).includes(c.id)).length, r: resolved.filter(m => catOf(m).includes(c.id)).length })).filter(c => c.a + c.r > 0);
  const maxB = Math.max(1, ...breakdown.map(c => c.a + c.r));
  const critical = active.filter(m => m.severity === 'critical');
  const plan = useMemo(() => allocateSurge(db, 3, 50), [db]);
  const base = useMemo(() => allocateSurge(db, 1, 100), [db]);
  const T = plan.totals;
  const onHold = db.prescriptions.filter(r => RX_ON_HOLD.includes(r.status)).length;
  const monday = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const trend = AN_TREND.map(([t, c, md], i) => { const w = new Date(monday); w.setDate(w.getDate() - 7 * (AN_TREND.length - i)); return { week: ymd(w), transfers: t, compliant: c, rate: Math.round((c / t) * 100), median: md }; });
  const verified = isVerifiedClinician(me);
  const pct = items.length ? Math.round((resolved.length / items.length) * 100) : 0;
  const Stat = ({ label, value, sub, tone }) => <div className="rounded-2xl border border-line bg-surface card-shadow p-3"><div className="eyebrow">{label}</div><div className={`font-display text-[26px] font-extrabold leading-tight tnum ${tone ? `text-${tone}` : ''}`}>{value}</div>{sub && <div className="text-[12px] text-muted">{sub}</div>}</div>;

  return (
    <div className="grid gap-4" id="analytics">
      <div className="flex flex-wrap items-center gap-2" id="status-badges">
        {critical.length > 0 && <PulseBadge kind="critical" label={`[CRITICAL CONFLICT] × ${critical.length}`} />}
        {verified ? <PulseBadge kind="npi" label={`[VERIFIED NPI] ${me.profile.npi || ''}`} /> : <PulseBadge kind="flagged" />}
        {onHold > 0 && <PulseBadge kind="escalation" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Active discrepancies" value={active.length} sub="open, awaiting sign-off or with prescriber" tone="high" />
        <Stat label="Resolved & verified" value={resolved.length} sub={`${pct}% of all discrepancies`} tone="ok" />
        <Stat label="Wait-listed under surge" value={T.waitlisted} sub={`of ${T.served + T.waitlisted} requests at ×3 / 50%`} tone="crit" />
        <Stat label="Handover compliance" value={`${trend[trend.length - 1].rate}%`} sub={`up from ${trend[0].rate}% 12 weeks ago (synthetic cohort)`} tone="accent" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Discrepancy breakdown" icon={AnIcBar} right={<Chip>active / resolved</Chip>}>
          <div className="mb-2 flex gap-3 text-[12px]"><span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-high" />Active</span><span className="flex items-center gap-1.5"><i className="inline-block h-2.5 w-2.5 rounded-sm bg-ok" />Resolved (two-person verified)</span></div>
          {breakdown.length === 0 ? <p className="text-muted">No discrepancies on records you can access.</p> :
            <ul className="grid gap-2.5" id="chart-breakdown">{breakdown.map(c => (
              <li key={c.id} className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-2 text-[13px]" title={`${c.label}: ${c.a} active, ${c.r} resolved`}>
                <span className="truncate">{c.label}</span>
                <span className="flex h-4 gap-[2px]">
                  {c.a > 0 && <span className="h-4 rounded-l-[4px] last:rounded-r-[4px] bg-high" style={{ width: `${(c.a / maxB) * 100}%` }} />}
                  {c.r > 0 && <span className="h-4 rounded-r-[4px] first:rounded-l-[4px] bg-ok" style={{ width: `${(c.r / maxB) * 100}%` }} />}
                </span>
                <span className="tnum w-12 text-right text-muted">{c.a} / {c.r}</span>
              </li>))}</ul>}
          <div className="mt-4 grid grid-cols-3 gap-2">{['critical', 'high', 'moderate'].map(s => <div key={s} className="rounded-xl border border-line p-2"><div className="eyebrow">{s}</div><div className="font-display text-[20px] font-extrabold tnum">{active.filter(m => m.severity === s).length}<span className="text-[13px] font-semibold text-muted"> active</span></div><div className="text-[12px] text-muted tnum">{resolved.filter(m => m.severity === s).length} resolved</div></div>)}</div>
        </Panel>

        <Panel title="Surge capacity & resource meter (Constraint 5)" icon={AnIcGauge} right={<Btn size="sm" onClick={() => go('surge')}>Open</Btn>}>
          <div className="grid grid-cols-3 gap-2">
            <AnGauge value={T.demand} max={Math.max(T.demand, base.totals.demand * 3)} label="Demand vs normal" caption={`×${(T.demand / Math.max(1, base.totals.demand)).toFixed(1)}`} color="crit" />
            <AnGauge value={T.capacity} max={T.baseline} label="Clinician capacity" caption={`${Math.round((T.capacity / T.baseline) * 100)}%`} color="high" />
            <AnGauge value={T.used} max={T.capacity} label="Capacity booked" caption={`${Math.round((T.used / Math.max(1, T.capacity)) * 100)}%`} color="ok" />
          </div>
          <div className="mt-3 grid gap-2">
            <AnMeter label="Requests scheduled this shift" value={T.served} max={T.served + T.waitlisted} color="ok" sub={`${T.served} / ${T.served + T.waitlisted}`} />
            <AnMeter label="Wait-listed (ordered, safe interim state)" value={T.waitlisted} max={T.served + T.waitlisted} color="high" sub={`${T.waitlisted}`} />
            <AnMeter label="Booked minutes (never above capacity)" value={T.used} max={Math.max(T.demand, T.baseline)} color="accent" sub={`${hm(T.used)} / ${hm(T.capacity)}`} marker={T.capacity} />
          </div>
          <ul className="mt-3 grid gap-1 text-[12.5px]">{SURGE_TIERS.map(t => { const s = plan.results.filter(r => r.tier === t.id); return <li key={t.id} className="flex justify-between gap-2 border-t border-line pt-1"><span>{t.label}</span><span className="tnum"><b className="text-ok">{t.id === 'commit' ? plan.commits.filter(c => c.status !== 'unmet').length : s.filter(r => r.status === 'scheduled').length}</b> scheduled · <b className={s.some(r => r.status === 'waitlisted') ? 'text-high' : 'text-muted'}>{s.filter(r => r.status === 'waitlisted').length}</b> waiting</span></li>; })}</ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Handover timeline trend" icon={AnIcTrend} right={<Chip>reconciled + verified ≤ 7 days</Chip>}>
          <AnTrend data={trend} />
          <p className="mt-1 text-[12px] text-muted">Weekly share of hospital-to-clinic transfers whose medication list was reconciled and two-person verified within 7 days. This 12-week line is a <b>synthetic cohort</b> for illustration. Live from this demo: {resolved.length} of {items.length} discrepancies verified ({pct}%).</p>
        </Panel>
        <Panel title="Critical conflicts" icon={AnIcOct}>
          {critical.length === 0 ? <p className="text-muted">None open.</p> : <ul className="grid gap-2">{critical.map(m => <li key={m.id}><button onClick={() => go('review')} className="w-full text-left flex items-center justify-between gap-2 rounded-xl border border-crit/30 bg-crit/[.04] p-2.5 hover:border-crit"><span><b>{m.name}</b><span className="block text-[12px] text-muted">{(m.findings || []).join(' · ')}</span></span><Chip tone="crit">{st(m) === 'decided' ? 'Awaiting 2nd sign-off' : st(m) === 'escalated' ? 'With prescriber' : 'Needs decision'}</Chip></button></li>)}</ul>}
          {onHold > 0 && <div className="mt-3 flex items-start gap-2 rounded-xl border border-high/30 bg-high/5 p-2.5 text-[13px]"><AnIcHour size={15} className="mt-0.5 shrink-0 text-high" /><span>{onHold} record{onHold > 1 ? 's' : ''} on hold for missing critical information. <button className="font-semibold text-accent" onClick={() => go('verify')}>Open</button></span></div>}
        </Panel>
      </div>
    </div>
  );
}
