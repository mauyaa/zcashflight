// Layout audit for the dashboard, run inside the page (recorded mode).
// Walks every moment and state and reports, per screen: hidden overflow, horizontal scroll,
// interactive targets under 24px (WCAG 2.2 AA), and content running under the footer.
// Usage: paste into the browser console, or evaluate with any page-automation tool; resolves to a report.
window.__audit = (async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const $ = s => document.querySelector(s);
  const click = s => { const e = $(s); if (!e) throw new Error('missing ' + s); e.click(); };
  const scene = name => { click('#statesBtn'); [...document.querySelectorAll('#pop button')].find(b => b.textContent === name).click(); };
  const report = [];
  function check(label) {
    const here = $('.st.here'), text = here.querySelector('.text'), foot = $('.footer').getBoundingClientRect();
    const issues = [];
    if (document.documentElement.scrollWidth > innerWidth) issues.push(`page scrolls sideways (${document.documentElement.scrollWidth}px)`);
    const hidden = text.scrollHeight - text.clientHeight;
    const tr = text.getBoundingClientRect();
    if (label.startsWith('0') && innerHeight >= 700 && hidden > 2) issues.push(`the promise must fit, but scrolls ${hidden}px`);
    if (hidden > 2 && !text.classList.contains('more') && text.scrollTop === 0) issues.push(`scrolls ${hidden}px with no visible cue`);
    const primary = text.querySelector('.btn.primary');
    
    if (innerWidth < 1024 && tr.bottom > foot.top + 1) issues.push(`text box runs ${Math.round(tr.bottom - foot.top)}px under the footer`);
    const small = [...document.querySelectorAll('.st.here button, .st.here a, .st.here input, .bar button, .bar a, .footer button, .footer [role=button]')]
      .filter(e => e.offsetParent !== null || e.closest('svg'))
      .filter(e => !e.classList.contains('inline-link') && !e.classList.contains('secret'))
      .map(e => [e, e.getBoundingClientRect()])
      .filter(([, r]) => r.width && (r.height < 24 || r.width < 24))
      .map(([e, r]) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} "${(e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
    if (small.length) issues.push('small targets: ' + small.join('; '));
    report.push({ screen: label, ok: !issues.length, issues });
  }
  await wait(600);
  check('0 promise');
  click('#t0 [data-go="1"]'); await wait(1100); check('1 choose app');
  click('#t1 [data-act="policy"]'); await wait(200); check('1 policy');
  click('#t1 [data-act="policyDone"]'); await wait(200);
  click('#t1 [data-act="sample"]'); await wait(1100); check('2 listening');
  await wait(3200); check('3 leaks list');
  click('#t3 [data-leak="0"]'); await wait(300); check('3 leak detail (A)');
  click('#t3 [data-leak="1"]'); await wait(300); check('3 leak detail (2)');
  click('#t3 [data-act="all"]'); await wait(200);
  click('#t3 [data-act="apply"]'); await wait(4200); check('4 all closed');
  click('#t4 [data-act="report"]'); await wait(300); check('4 report');
  click('#t4 [data-go="5"]'); await wait(1100); check('5 every day (quiet)');
  scene('A new leak'); await wait(1100); check('5 new leak');
  click('#t5 [data-act="seeit"]'); await wait(200); check('5 new leak detail');
  scene('First visit'); await wait(300); check('5 first visit');
  scene("App didn't start"); await wait(1100); check('2 app did not start');
  scene('Heard nothing'); await wait(300); check('2 heard nothing');
  scene('Stopped halfway'); await wait(300); check('2 stopped');
  scene('Folder not found'); await wait(1100); check('1 folder not found');
  click('#sealBtn'); await wait(200); check('About popover open'); click('#sealBtn');
  return { viewport: `${innerWidth}x${innerHeight}`, pass: report.filter(r => r.ok).length + '/' + report.length, failures: report.filter(r => !r.ok) };
})();
