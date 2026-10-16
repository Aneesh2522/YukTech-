/* YUKTECH public CMS bridge.
   - data-cms-key="x"        -> text/URL from the CMS (Website content)
   - data-cms-image="x"      -> image from the CMS
   - data-site-text="site.x" -> site-wide setting, sets the text
   - data-site-href="site.x" -> site-wide setting, sets the link (data-site-scheme="mailto:" or "tel:")
   - data-site-map="site.x"  -> builds a Google Maps directions link from an address setting
   - data-jobs-list          -> Careers job listing container */
(() => {
  const cfg = window.YUKTECH_CONFIG;
  if (!cfg?.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT') || !window.supabase) return;
  const client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {auth:{persistSession:false,autoRefreshToken:false}});

  /* ---------- safe value helpers ---------- */
  const emailOk = v => /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v);
  const telClean = v => { const t = v.replace(/[^\d+]/g,''); return /^\+?\d{6,15}$/.test(t) ? t : ''; };
  const urlOk = (v, allowRelative) => {
    if (allowRelative && /^[\w./-]+\.html(#[\w-]*)?$/.test(v)) return v;
    try { const u = new URL(v); return ['https:','http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; }
  };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  /* ---------- page content + site settings ---------- */
  async function applyContent(){
    const {data,error} = await client.from('cms_content').select('content_key,content_value,content_type,updated_at').eq('status','published').order('updated_at',{ascending:false});
    if (error || !data) return;
    const values = new Map();
    for (const item of data) if (!values.has(item.content_key)) values.set(item.content_key, item);
    const val = k => { const i = values.get(k); return i ? i.content_value.trim() : ''; };

    document.querySelectorAll('[data-cms-key]').forEach(node => {
      const item = values.get(node.dataset.cmsKey); if (!item) return;
      if (item.content_type === 'url') {
        try { const p = new URL(item.content_value, location.href); if (['https:','http:','mailto:','tel:'].includes(p.protocol)) node.setAttribute(node.matches('a') ? 'href' : 'data-cms-url', item.content_value); } catch {}
      } else node.textContent = item.content_value;
    });
    document.querySelectorAll('[data-cms-image]').forEach(node => {
      const item = values.get(node.dataset.cmsImage); if (!item || item.content_type !== 'image_url') return;
      const u = urlOk(item.content_value, false); if (u) node.src = u;
    });

    /* site-wide settings */
    document.querySelectorAll('[data-site-text]').forEach(node => { const v = val(node.dataset.siteText); if (v) node.textContent = v; });
    document.querySelectorAll('[data-site-href]').forEach(node => {
      const v = val(node.dataset.siteHref); if (!v) return;
      const scheme = node.dataset.siteScheme || '';
      if (scheme === 'mailto:') { if (emailOk(v)) node.href = 'mailto:' + v; }
      else if (scheme === 'tel:') { const t = telClean(v); if (t) node.href = 'tel:' + t; }
      else { const u = urlOk(v, false); if (u) node.href = u; }
    });
    document.querySelectorAll('[data-site-map]').forEach(node => {
      const v = val(node.dataset.siteMap); if (!v) return;
      node.href = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(v.replace(/\s*\n\s*/g, ', '));
    });

    /* announcement banner */
    const bannerText = val('site.banner.text');
    if (bannerText && !document.querySelector('.site-banner')) {
      const bar = el('div', 'site-banner'); bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Announcement');
      const inner = el('div', 'site-banner-inner'); inner.append(el('span', 'site-banner-text', bannerText));
      const link = urlOk(val('site.banner.link'), true);
      if (link) { const a = el('a', 'site-banner-link', val('site.banner.linklabel') || 'Learn more'); a.href = link; if (/^https?:/.test(link)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } inner.append(a); }
      bar.append(inner); document.body.prepend(bar);
    }
  }

  /* ---------- careers: job listing ---------- */
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function postedLabel(iso){
    if (!iso) return '';
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (days <= 0) return 'Posted today';
    if (days === 1) return 'Posted yesterday';
    if (days <= 30) return 'Posted ' + days + ' days ago';
    return 'Posted ' + new Date(iso).toLocaleDateString(undefined, {day:'numeric', month:'short', year:'numeric'});
  }
  /* Turns the plain-text description into headings, bullet lists and paragraphs (no HTML is ever injected). */
  function formatDescription(text){
    const frag = document.createDocumentFragment(); let list = null;
    String(text || '').replace(/\r/g, '').split('\n').forEach(raw => {
      const line = raw.trim();
      if (!line) { list = null; return; }
      const bullet = line.match(/^[-•*–]\s+(.*)$/);
      if (bullet) { if (!list) { list = el('ul', 'job-bullets'); frag.append(list); } list.append(el('li', null, bullet[1])); return; }
      list = null;
      if (line.length <= 70 && /:$/.test(line)) frag.append(el('h4', null, line.replace(/:$/, '')));
      else frag.append(el('p', null, line));
    });
    return frag;
  }
  const excerptOf = t => { const s = String(t || '').replace(/[-•*–]\s+/g, '').replace(/\s+/g, ' ').trim(); return s.length > 190 ? s.slice(0, 187).trimEnd() + '…' : s; };

  async function applyJobs(){
    const host = document.querySelector('[data-jobs-list]'); if (!host) return;
    const {data,error} = await client.from('job_posts').select('id,title,department,location,work_type,experience,description,apply_url,published_at').eq('status','published').order('published_at',{ascending:false});
    if (error || !data || !data.length) return;
    host.replaceChildren(); host.classList.add('job-list');

    const cards = data.map(job => {
      const card = el('article', 'job-card'); card.id = 'job-' + job.id;
      const main = el('div', 'job-card-main'), head = el('div', 'job-card-head');
      head.append(el('h3', 'job-title', job.title));
      if (job.published_at && Date.now() - new Date(job.published_at).getTime() < 7 * 86400000) head.append(el('span', 'job-badge-new', 'New'));
      const chips = el('ul', 'job-chips');
      [job.location, job.work_type, job.department, job.experience && (/\d/.test(job.experience) && !/year|yr/i.test(job.experience) ? job.experience + ' yrs exp' : job.experience)].filter(Boolean).forEach(c => chips.append(el('li', null, c)));
      const excerpt = el('p', 'job-excerpt', excerptOf(job.description));
      const details = el('div', 'job-details'); details.hidden = true; details.append(formatDescription(job.description));
      main.append(head, chips, excerpt, details);

      const side = el('div', 'job-card-side');
      const posted = postedLabel(job.published_at); if (posted) side.append(el('span', 'job-posted', posted));
      let href = 'apply.html?job=' + encodeURIComponent(job.id), external = false;
      if (job.apply_url) { try { const u = new URL(job.apply_url); if (['https:','http:','mailto:'].includes(u.protocol)) { href = u.href; external = u.protocol !== 'mailto:'; } } catch {} }
      const apply = el('a', 'btn btn-primary', 'Apply now'); apply.href = href; if (external) { apply.target = '_blank'; apply.rel = 'noopener noreferrer'; }
      const toggle = el('button', 'job-toggle', 'View details'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false');
      const setOpen = open => { details.hidden = !open; excerpt.hidden = open; toggle.textContent = open ? 'Hide details' : 'View details'; toggle.setAttribute('aria-expanded', String(open)); };
      toggle.addEventListener('click', () => setOpen(details.hidden));
      side.append(apply, toggle);
      card.append(main, side); host.append(card);
      return {job, card, setOpen, hay: [job.title, job.location, job.department, job.work_type, job.description].join(' ').toLowerCase()};
    });

    /* toolbar: search + filters (shown when there are 3 or more openings) */
    const count = el('p', 'job-count'); count.setAttribute('aria-live', 'polite');
    const none = el('p', 'job-none', 'No openings match your search. Try clearing the filters.'); none.hidden = true; host.after(none);
    const uniq = k => [...new Set(data.map(j => j[k]).filter(Boolean))].sort();
    const q = el('input', 'job-search'); q.type = 'search'; q.placeholder = 'Search by role, skill or location'; q.setAttribute('aria-label', 'Search jobs');
    const mk = (label, key) => { const s = el('select', 'job-filter'); s.setAttribute('aria-label', label); s.append(new Option(label, '')); uniq(key).forEach(v => s.append(new Option(v, v))); return s; };
    const fLoc = mk('All locations', 'location'), fDep = mk('All departments', 'department'), fType = mk('All job types', 'work_type');
    const reset = el('button', 'job-reset', 'Clear filters'); reset.type = 'button';
    const run = () => {
      const term = q.value.trim().toLowerCase(); let shown = 0;
      cards.forEach(c => {
        const ok = (!term || c.hay.includes(term)) && (!fLoc.value || c.job.location === fLoc.value) && (!fDep.value || c.job.department === fDep.value) && (!fType.value || c.job.work_type === fType.value);
        c.card.hidden = !ok; if (ok) shown++;
      });
      count.textContent = plural(shown, 'opening') + (shown === cards.length ? '' : ' found');
      none.hidden = shown !== 0;
    };
    [q, fLoc, fDep, fType].forEach(c => c.addEventListener(c === q ? 'input' : 'change', run));
    reset.addEventListener('click', () => { q.value = ''; fLoc.value = fDep.value = fType.value = ''; run(); });
    if (data.length >= 3) { const bar = el('div', 'job-toolbar'); bar.append(q, fLoc, fDep, fType, reset); host.before(bar); }
    host.before(count); run();

    /* deep link: careers.html#job-<id> opens that role */
    const target = cards.find(c => location.hash === '#' + c.card.id);
    if (target) { target.setOpen(true); target.card.scrollIntoView({block:'center'}); }
  }

  document.addEventListener('DOMContentLoaded', () => { applyContent(); applyJobs(); });
})();
