/* MediTrace shared UI building blocks. */
const inputCls = 'w-full rounded-xl border border-line bg-surface px-3 py-2 text-[14px] text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 disabled:opacity-60';

function Logo({ variant = 'full', className = '', imgClass = '' }) {
  const full = variant === 'full';
  return (
    <span className={`logo-plate inline-flex items-center justify-center rounded-xl ring-1 ring-black/5 ${full ? 'px-2.5 py-1.5' : 'p-1'} ${className}`}>
      <img src={full ? 'assets/logo.jpg' : 'assets/mark.jpg'} alt={full ? 'MediTrace — Connected Medications. Continuity of Care.' : 'MediTrace'}
        width={full ? 1230 : 430} height={full ? 390 : 430} className={`block h-auto ${imgClass}`} draggable="false" />
    </span>
  );
}

const THEME_KEY = 'meditrace-theme';
function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  useEffect(() => {
    const root = document.documentElement; root.setAttribute('data-theme', theme); root.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
  }, [theme]);
  const toggle = () => { const r = document.documentElement; r.classList.add('theme-anim'); setTheme(t => t === 'dark' ? 'light' : 'dark'); clearTimeout(window.__themeT); window.__themeT = setTimeout(() => r.classList.remove('theme-anim'), 350); };
  return [theme, toggle];
}
function ThemeToggle({ theme, onToggle }) {
  const dark = theme === 'dark';
  return (
    <button type="button" role="switch" aria-checked={dark} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'} onClick={onToggle}
      className="relative inline-flex h-8 w-[60px] shrink-0 items-center rounded-full border border-line bg-raised transition-colors hover:border-accent/50">
      <Sun size={13} className={`absolute left-2 transition-opacity ${dark ? 'opacity-50 text-muted' : 'opacity-0'}`} />
      <Moon size={13} className={`absolute right-2 transition-opacity ${dark ? 'opacity-0' : 'opacity-50 text-muted'}`} />
      <span className={`absolute left-[3px] grid h-6 w-6 place-items-center rounded-full bg-surface ring-1 ring-line shadow-sm transition-transform duration-300 ease-out ${dark ? 'translate-x-[28px]' : 'translate-x-0'}`}>
        {dark ? <Moon size={14} className="text-accent" /> : <Sun size={14} className="text-high" />}
      </span>
    </button>
  );
}

const Panel = ({ title, icon: I, right, children, className = '', pad = true, id }) => (
  <section id={id} className={`rounded-2xl border border-line bg-surface card-shadow ${className}`}>
    {title && <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line px-4 py-3">
      <h2 className="flex items-center gap-2 font-display text-[15px] font-bold">{I && <I size={16} className="text-accent" />}{title}</h2>{right}</header>}
    <div className={pad ? 'p-4' : ''}>{children}</div>
  </section>
);
const Btn = ({ kind = 'ghost', size = 'md', className = '', ...p }) => {
  const k = { primary: 'bg-accent text-white dark:text-bg hover:bg-accent/90 font-semibold shadow-sm', navy: 'bg-navy text-white dark:text-bg hover:bg-navy/90 font-semibold', ghost: 'border border-line bg-surface hover:bg-raised text-fg', soft: 'bg-raised hover:bg-line/60 text-fg', danger: 'border border-crit/40 bg-crit/10 text-crit hover:bg-crit/20 font-medium', ok: 'bg-ok text-white dark:text-bg hover:bg-ok/90 font-semibold', link: 'text-accent hover:underline px-0 py-0' }[kind];
  const s = kind === 'link' ? '' : size === 'sm' ? 'px-2.5 py-1 text-[12.5px] rounded-lg' : size === 'lg' ? 'px-4 py-2.5 text-[15px] rounded-xl' : 'px-3 py-1.5 text-[13.5px] rounded-xl';
  return <button type="button" {...p} className={`inline-flex items-center justify-center gap-1.5 transition disabled:opacity-40 disabled:cursor-not-allowed ${s} ${k} ${className}`} />;
};
const SevBadge = ({ sev, small }) => { const s = SEV[sev]; return (
  <span className={`inline-flex items-center gap-1.5 rounded-full ring-1 ${s.bg} ${s.ring} ${s.text} ${small ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-0.5 text-xs'} font-semibold whitespace-nowrap`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`}></span>{s.label}</span>); };
const Badge = ({ meta }) => { const I = meta.icon; return <span className={`inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${meta.cls}`}>{I && <I size={12} />}{meta.label}</span>; };
const StatusBadge = ({ status }) => <Badge meta={STATUS[status] || STATUS.open} />;
const RxBadge = ({ status }) => <Badge meta={RX_STATUS[status] || RX_STATUS.pending} />;
const GRANT_META = {
  pending: { label: 'Pending', cls: 'text-high bg-high/10 ring-high/30', icon: Clock },
  approved: { label: 'Active', cls: 'text-ok bg-ok/10 ring-ok/30', icon: Unlock },
  declined: { label: 'Declined', cls: 'text-crit bg-crit/10 ring-crit/30', icon: Ban },
  revoked: { label: 'Revoked', cls: 'text-muted bg-raised ring-line', icon: Lock },
  expired: { label: 'Expired', cls: 'text-muted bg-raised ring-line', icon: Timer },
  cancelled: { label: 'Cancelled', cls: 'text-muted bg-raised ring-line', icon: XCircle },
};
const GrantBadge = ({ state }) => <Badge meta={GRANT_META[state] || GRANT_META.pending} />;
const Chip = ({ children, tone = 'raised', className = '' }) => {
  const t = { raised: 'bg-raised text-fg', accent: 'bg-accent/10 text-accent', navy: 'bg-navy/10 text-navy', crit: 'bg-crit/10 text-crit', ok: 'bg-ok/10 text-ok', info: 'bg-info/10 text-info', high: 'bg-high/10 text-high' }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ${t} ${className}`}>{children}</span>;
};
const ScopeChips = ({ scopes }) => <div className="flex flex-wrap gap-1">{scopes.map(s => { const S = SCOPE[s]; const I = S?.icon; return <Chip key={s} tone="navy">{I && <I size={11} />}{S?.label || s}</Chip>; })}</div>;
const SourceTag = ({ source, label }) => source === 'professional'
  ? <Chip tone="ok"><BadgeCheck size={11} />Professionally documented{label ? ` · ${label}` : ''}</Chip>
  : <Chip tone="info"><UserRound size={11} />Patient-reported</Chip>;
const Conf = ({ v }) => {
  if (v == null) return <span className="text-[10px] font-mono text-muted">n/s</span>;
  return <span className={`text-[10px] font-mono tnum ${v < .75 ? 'text-high' : v < .9 ? 'text-mod' : 'text-muted'}`}>{v.toFixed(2)}</span>;
};
const PRIORITY = { high: { label: 'High', cls: 'text-crit bg-crit/10' }, normal: { label: 'Normal', cls: 'text-accent bg-accent/10' }, low: { label: 'Low', cls: 'text-muted bg-raised' } };

function Field({ label, id, hint, error, required, optional, children, className = '' }) {
  return (
    <div className={`grid gap-1 min-w-0 ${className}`}>
      {label && <label htmlFor={id} className="text-[12.5px] font-semibold text-fg">{label}{required && <span className="text-crit"> *</span>}{optional && <span className="font-normal text-muted"> (optional)</span>}</label>}
      {children}
      {error ? <span className="text-[12px] text-crit flex items-center gap-1"><AlertTriangle size={12} />{error}</span> : hint ? <span className="text-[11.5px] text-muted">{hint}</span> : null}
    </div>
  );
}
function Modal({ open, onClose, title, children, wide, footer }) {
  const ref = useRef(null);
  useEffect(() => { if (!open) return; const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); setTimeout(() => ref.current?.focus(), 10); return () => window.removeEventListener('keydown', k); }, [open]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy/40 dark:bg-black/60 backdrop-blur-[2px] p-3" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`pop w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} max-h-[92vh] overflow-auto rounded-2xl border border-line bg-surface card-shadow outline-none`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3">
          <h2 className="font-display text-[16px] font-bold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-muted hover:bg-raised hover:text-fg"><X size={18} /></button>
        </div>
        <div className="p-4">{children}</div>
        {footer && <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 py-3">{footer}</div>}
      </div>
    </div>
  );
}
const Empty = ({ icon: I = Inbox, title, body, action }) => (
  <div className="grid place-items-center gap-2 rounded-xl border border-dashed border-line px-4 py-8 text-center">
    <I size={22} className="text-muted" /><div className="font-semibold">{title}</div>{body && <p className="max-w-[48ch] text-[13px] text-muted">{body}</p>}{action}
  </div>
);
const Stat = ({ label, value, sub, icon: I, tone = 'accent', onClick }) => {
  const T = onClick ? 'button' : 'div';
  return (
    <T onClick={onClick} className={`text-left rounded-2xl border border-line bg-surface card-shadow p-4 min-w-0 ${onClick ? 'hover:border-accent/50 transition' : ''}`}>
      <div className="flex items-center justify-between gap-2"><span className="eyebrow">{label}</span>{I && <span className={`grid h-8 w-8 place-items-center rounded-xl bg-${tone}/10 text-${tone}`}><I size={16} /></span>}</div>
      <div className="mt-1 font-display text-[26px] font-extrabold tnum leading-tight">{value}</div>
      {sub && <div className="text-[12px] text-muted">{sub}</div>}
    </T>
  );
};
const PageHead = ({ title, sub, actions, eyebrow }) => (
  <div className="flex flex-wrap items-end justify-between gap-3">
    <div className="min-w-0">{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1 className="font-display text-[24px] sm:text-[26px] font-extrabold leading-tight">{title}</h1>{sub && <p className="text-[13.5px] text-muted max-w-[70ch]">{sub}</p>}</div>
    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
  </div>
);
const Avatar = ({ name = '?', tone = 'accent', size = 36 }) => {
  const ini = name.replace(/^(Dr\.?\s+)/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
  return <span style={{ width: size, height: size }} className={`grid shrink-0 place-items-center rounded-full bg-${tone}/10 text-${tone} ring-1 ring-${tone}/25 font-display text-[13px] font-bold`}>{ini}</span>;
};
function CopyBtn({ text, label = 'Copy' }) {
  const [s, setS] = useState(null);
  return <Btn size="sm" onClick={async () => { try { await navigator.clipboard.writeText(text); setS('ok'); } catch (e) { setS('fail'); } setTimeout(() => setS(null), 1600); }}><Copy size={12} />{s === 'ok' ? 'Copied' : s === 'fail' ? 'Select & copy' : label}</Btn>;
}
const Segmented = ({ value, onChange, options, label }) => (
  <div role="tablist" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-line bg-surface p-1">
    {options.map(([k, l, n]) => <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)} className={`rounded-lg px-3 py-1.5 text-[13px] ${value === k ? 'bg-raised font-semibold text-fg' : 'text-muted hover:text-fg'}`}>{l}{n != null && <span className="ml-1 tnum text-muted">{n}</span>}</button>)}
  </div>
);
const Check2 = ({ checked, onChange, label, id, disabled, desc }) => (
  <label htmlFor={id} className={`flex items-start gap-2.5 rounded-xl border p-2.5 ${disabled ? 'opacity-50' : 'cursor-pointer hover:bg-raised/60'} ${checked ? 'border-accent bg-accent/5' : 'border-line'}`}>
    <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--c-accent))]" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
    <span className="min-w-0"><span className="text-[13.5px] font-medium">{label}</span>{desc && <span className="block text-[12px] text-muted">{desc}</span>}</span>
  </label>
);
const KV = ({ k, v, mono }) => <div className="min-w-0"><dt className="eyebrow">{k}</dt><dd className={`text-[13.5px] break-words ${mono ? 'font-mono tnum' : ''}`}>{v || <span className="text-muted">—</span>}</dd></div>;

/* Shows an uploaded file or a handover document; nothing is altered. */
function RxDocument({ rx, highlightLine }) {
  const { masked } = useApp() || {};
  if (rx.kind === 'handover' || rx.kind === 'transfer') {
    const D = rx.kind === 'transfer' ? { lines: rx.lines } : DOCS[rx.docKey];
    return <div className="scroll-x rounded-xl border border-line bg-bg/60"><pre className="font-mono text-[12px] leading-6 py-2 min-w-max">{D.lines.map((t, i) => <div key={i} className={`doc-line flex pr-4 ${highlightLine === i ? 'hl' : ''}`}><span className="w-9 shrink-0 select-none text-right pr-3 text-muted/60 tnum">{i + 1}</span><span>{(masked ? redactPHI(t) : t) || ' '}</span></div>)}</pre></div>;
  }
  if (!rx.file?.dataUrl) return <Empty icon={FileWarning} title="No document stored" body="The original file is not available in this browser." />;
  if (rx.file.type === 'pdf') return (
    <div className="grid gap-2 rounded-xl border border-line bg-bg/60 p-4">
      <div className="flex items-center gap-3"><span className="grid h-12 w-10 place-items-center rounded-md bg-crit/10 text-crit text-[11px] font-bold">PDF</span><div className="min-w-0"><div className="font-semibold truncate">{rx.file.name}</div><div className="text-[12px] text-muted">{Math.round(rx.file.size / 1024)} KB · stored unchanged</div></div></div>
      <p className="text-[12px] text-muted">PDF pages can’t be previewed inside this sandboxed demo page. The original file is stored as uploaded; compare it using the transcribed details alongside.</p>
    </div>
  );
  if (masked) return <div className="relative overflow-hidden rounded-xl border border-line bg-white p-1.5"><img src={rx.file.dataUrl} alt="" className="mx-auto max-h-[560px] w-auto rounded-lg blur-md select-none" draggable="false" /><div className="absolute inset-0 grid place-items-center bg-navy/30 p-4"><div className="rounded-xl bg-surface px-4 py-3 text-center text-[13px] shadow-lg"><EyeOff size={18} className="mx-auto mb-1 text-crit" /><b>Document hidden</b><div className="text-muted">It shows patient identifiers. Licence verification is required.</div></div></div></div>;
  return <div className="rounded-xl border border-line bg-white p-1.5"><img src={rx.file.dataUrl} alt={`Original document: ${rx.title}`} className="mx-auto max-h-[560px] w-auto rounded-lg" /></div>;
}

/* Regimen chips with field-level diff (from the original reconciliation matrix). */
function RegChips({ reg, other }) {
  if (!reg) return <span className="inline-flex items-center gap-1 rounded-md border border-dashed border-line px-2 py-0.5 text-xs text-muted">Not listed</span>;
  const chip = (f) => {
    const v = reg[f];
    if (f === 'form' && !v && !(other && other.form)) return null;
    let label = f === 'dose' ? `${v ?? '?'} ${reg.unit ?? ''}`.trim() : v;
    const required = ['dose', 'freq'].includes(f);
    const missing = f === 'dose' ? (!reg.dose || !reg.unit) : !v;
    let cls = 'bg-raised text-fg ring-line';
    if (missing && (required || f === 'form')) { cls = 'bg-crit/10 text-crit ring-crit/40'; label = f === 'dose' ? `${reg.dose ?? '?'} [unit?]` : `[${f}?]`; }
    else if (missing) { cls = 'bg-transparent text-muted/80 ring-line/60'; label = `${f} n/s`; }
    else if (other) { const ov = f === 'dose' ? `${other.dose}|${other.unit}` : other[f], mv = f === 'dose' ? `${reg.dose}|${reg.unit}` : v; if (ov && ov !== mv) cls = 'bg-mod/15 text-mod ring-mod/40'; }
    return <span key={f} title={f === 'freq' && v ? FREQ[v]?.label : f} className={`rounded px-1.5 py-0.5 font-mono text-[12px] ring-1 ${cls}`}>{label}</span>;
  };
  return <div className="flex flex-wrap items-center gap-1">{['form', 'dose', 'route', 'freq'].map(chip)}{reg.status === 'held' && <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 bg-info/10 text-info ring-info/40">HOLD</span>}{reg.status === 'stopped' && <span className="rounded px-1.5 py-0.5 text-[11px] font-semibold ring-1 bg-raised text-muted ring-line">STOPPED</span>}</div>;
}

const DemoNote = ({ children, className = '' }) => (
  <div className={`flex items-start gap-2 rounded-xl border border-mod/40 bg-mod/10 px-3 py-2 text-[12px] text-fg/85 ${className}`}><Info size={14} className="mt-0.5 shrink-0 text-mod" /><span>{children}</span></div>
);
