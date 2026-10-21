/* ZcashFlight dashboard.
   One place, six moments, one horizontal line. Words top-left, the line at 68% height, its circle centred in the right column.
   Paper, ink, a grey-teal line, and one red that only ever means a leak.
   Live mode (zcashflight ui): every number, finding and line of code here comes from a real run on this machine.
   Recorded mode (the hosted demo): replays a real run of the ZecShop sample, recorded by `npm run record`, and says so. */
(function(){
  'use strict';
  var LIVE=window.ZF_LIVE||null, REC=null;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS='http://www.w3.org/2000/svg';
  var stage=document.getElementById('stage'),world=document.getElementById('world'),svg=document.getElementById('svg');
  var sts=[].slice.call(document.querySelectorAll('.st')),N=sts.length,T=sts.map(function(s){return s.querySelector('.text')});
  var WORDS=['no','one','two','three','four','five','six','seven','eight','nine','ten'];
  function word(n,cap){var w=n<WORDS.length?WORDS[n]:String(n);return cap?w.charAt(0).toUpperCase()+w.slice(1):w}
  var PHOTOS={hero:'img/hero.jpg',listen:'img/listen.jpg',final:'img/final.jpg'};

  /* policy classes, in the order the sentence reads them */
  var CLASSES=[['address','addresses'],['amount','amounts'],['memo','memos'],['txid','transaction IDs'],['viewing-key','viewing keys'],['spending-key','spending keys'],['seed-phrase','seed phrases']];
  var ALWAYS={'viewing-key':1,'spending-key':1,'seed-phrase':1};

  /* ================= data ================= */
  var D=null; // state: project, policy, runs, latest, previous, comparison
  var S={i:0,app:'idle',own:false,path:'',listen:'idle',err:null,count:{requests:0,logs:0},step:'',leak:-1,
         run:null,after:null,cmp:null,fixing:false,fixMsg:'',clean:'verified',home:null,closing:{}};

  function api(path,body){
    var u='api/'+path;
    return fetch(u,{method:body?'POST':'GET',headers:{'x-zcashflight-token':LIVE.token,'content-type':'application/json'},body:body?JSON.stringify(body):undefined})
      .then(function(r){return r.json().then(function(j){return {ok:r.ok,status:r.status,j:j}})});
  }
  function load(){
    if(LIVE)return api('state').then(function(r){D=r.j;var L=D&&D.latest;if(L&&L.status==='complete'&&L.findings.length){S.run=L;S.after=null;S.cmp=null}}); // a reload keeps the last saved run
    return fetch('recorded/data.json').then(function(r){return r.json()}).then(function(j){REC=j;D=recState(j.seeded,null)});
  }
  function recState(latest,previous){
    return {project:REC.project,policy:REC.policy,runs:REC.history,latest:latest,previous:previous,comparison:null};
  }

  /* events from the engine */
  if(LIVE){
    var es=new EventSource('api/events?token='+encodeURIComponent(LIVE.token));
    es.onmessage=function(m){onProgress(JSON.parse(m.data))};
  }
  function onProgress(e){
    if(e.type==='captured'){S.count={requests:e.requests,logs:e.logs};var c=document.getElementById('count');if(c)c.textContent=S.count.requests;var l=document.getElementById('logs');if(l)l.textContent=S.count.logs;if(S.fixing)fixLine('Re-running · '+e.requests+' requests');return}
    if(e.type==='step'){S.step='<b>'+esc(e.scenario)+'</b> · '+esc(e.request)+' → '+(e.status==null?'no answer':e.status);var s=document.getElementById('stepline');if(s)s.innerHTML=S.step;return}
    if(e.type==='phase'){if(e.phase==='starting'){S.step='starting <b>'+esc(e.detail||'the app')+'</b>';var s2=document.getElementById('stepline');if(s2)s2.innerHTML=S.step}return}
    if(e.type==='error'){
      S.err=e;
      if(S.fixing){S.fixing=false;S.fixMsg=e.message;render(3);return}
      S.listen=e.code==='silent'?'silent':e.code==='stopped'?'stopped':'nostart';
      counting(false);render(2);return}
    if(e.type==='run')onRun(e.run,e.comparison);
  }

  function startRun(){
    S.listen='run';S.err=null;S.count={requests:0,logs:0};S.step='';
    render(2,true);counting(true);
    if(LIVE){api('run',{}).then(function(r){if(!r.ok){S.listen='nostart';S.err={message:r.j.error||'Could not start a run'};counting(false);render(2)}});return}
    replay(S.fixing?REC.fixed:REC.seeded,S.fixing?REC.fixedProgress:REC.progress);
  }
  /* recorded mode: replay the real progress events, compressed to about two seconds */
  function replay(run,prog){
    var span=prog.length?prog[prog.length-1].ms:1,k=reduce?0:Math.min(1,2200/span);
    prog.forEach(function(p){setTimeout(function(){onProgress(p.e)},p.ms*k)});
    setTimeout(function(){onProgress({type:'run',run:run,comparison:S.fixing?REC.comparison:null})},span*k+120);
  }

  var toastT=null;
  function toast(html){var t=document.getElementById('toast');if(!t)return;t.innerHTML=html;t.hidden=false;requestAnimationFrame(function(){t.classList.add('on')});clearTimeout(toastT);toastT=setTimeout(function(){t.classList.remove('on');setTimeout(function(){t.hidden=true},300)},5200)}
  function edge(dir){
    if(dir>0)toast('<b>That\'s the whole walk.</b><span>You\'ve seen every step.</span><button class="link q" data-act="restart">Start over</button>'+(CFG.docs?'<a class="link q" href="'+esc(CFG.docs)+'" target="_blank" rel="noreferrer noopener">Get started ↗</a>':''));
    else toast('<b>This is the start.</b><span>Scroll down or press → to walk through.</span><button class="link q" data-go="1">Next step</button>');
  }
  function onRun(run,cmp){
    counting(false);
    if(run.status==='complete')toast(S.fixing?'<b>Re-run finished.</b><span>'+(run.findings.length?run.findings.length+' still open.':'No leaks detected in these tests.')+'</span>':'<b>Run finished.</b><span>'+(run.findings.length?run.findings.length+' leak'+(run.findings.length>1?'s':'')+' found, with evidence and fixes.':'No leaks detected in these tests.')+'</span>');
    if(LIVE)api('state').then(function(r){D=r.j;drawMode()});
    else D=recState(run,S.fixing?REC.seeded:null);
    if(run.status!=='complete'){
      S.fixing=false;S.run=run;S.after=null;S.cmp=null;S.leak=-1;
      S.listen=/^silent/.test(run.error||'')?'silent':/^stopped/.test(run.error||'')?'stopped':'nostart';
      S.err={message:run.error};render(2);render(3);render(4);render(5);go(2);return;
    }
    if(S.fixing){
      S.fixing=false;S.fixMsg='';S.after=run;S.cmp=cmp;
      var closed={};(cmp&&cmp.closed||[]).forEach(function(f){closed[f.id]=1});
      var cs=[].slice.call(svg.querySelectorAll('.c-leak')),ts=[].slice.call(svg.querySelectorAll('.leaktick'));
      var k=0;cs.forEach(function(c,j){if(closed[c.dataset.id]){var d=reduce?0:k++*180;setTimeout(function(){c.classList.add('closed')},d);setTimeout(function(){if(ts[j])ts[j].classList.add('on')},d+220)}});
      render(3,true);render(4,true);render(5,true);
      timer=setTimeout(function(){go(4,function(){var f=svg.querySelector('.finaltick');if(f&&S.cmp&&S.cmp.verdict==='clean')f.classList.add('on')})},reduce?0:400+k*180+600);
      return;
    }
    S.run=run;S.after=null;S.cmp=null;S.leak=-1;
    build();
    timer=setTimeout(function(){if(S.i===2)go(run.findings.length?3:4)},reduce?0:650);
  }

  /* ================= helpers ================= */
  function el(tag,a,p){var e=document.createElementNS(NS,tag);for(var k in a)e.setAttribute(k,a[k]);(p||svg).appendChild(e);return e}
  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
  var U='<span class="hand under">{w}<svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true"><path d="M3 8 C 40 3, 80 10, 118 6 S 176 3, 197 7"/></svg></span>';
  function pl(n,w){return n+' '+w+(n===1?'':'s')}
  var RING='<span class="hand ring">{w}<svg viewBox="0 0 60 60" preserveAspectRatio="none" aria-hidden="true"><path d="M34 5 C 14 3, 4 18, 6 32 C 8 48, 28 57, 44 52 C 58 47, 60 26, 50 13 C 43 5, 30 3, 20 8"/></svg></span>';
  function split(t){var m=/^(.*?)\s((?:sent|written|revealed|made)\s.*)$/.exec(t);return m?[m[1],m[2]]:[t,'']}
  function findings(){return S.run?S.run.findings:[]}
  function proofText(h){
    var kind=h.kind.replace(/-/g,' ');
    var how=h.proof==='checksum'?'encoding and checksum verified':h.proof==='wordlist'?'every word is in the BIP-39 list':h.proof==='zip321'?'part of a valid ZIP 321 payment request':'recognised by its field name';
    return kind+(h.network?' · '+h.network:'')+' · '+how;
  }
  function sec(h){return '<b class="secret" tabindex="0" data-mask="'+esc(h.masked)+'" data-full="'+esc(proofText(h))+'">'+esc(h.masked)+'</b>'}
  function when(iso){var d=new Date(iso);return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+', '+d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
  function scenarioList(){var s=(D&&D.policy&&D.policy.scenarios)||[];var n=s.map(function(x){return x.name});return n.length>1?n.slice(0,-1).join(', ')+' and '+n[n.length-1]:n.join('')}
  function reportLinks(run){
    var fm=[['html','HTML'],['md','Markdown'],['sarif','SARIF'],['json','JSON']];
    return '<div class="downloads" role="group" aria-label="Download this report"><span class="dl-label">Download</span>'+fm.map(function(f){
      var href=LIVE?'api/report/'+run.n+'.'+f[0]+'?token='+encodeURIComponent(LIVE.token):'recorded/report-'+run.n+'.'+f[0];
      return '<a href="'+href+'" download="zcashflight-run-'+run.n+'.'+f[0]+'">'+f[1]+'</a>'}).join('<span class="sep" aria-hidden="true">·</span>')+'</div>';
  }

  function fixLine(t){var b=document.querySelector('[data-act="apply"],[data-act="rerun"]');if(b)b.textContent=t}

  /* ================= words for each moment =================
     Copy rules (handbook ch.5, design system §3/§6): plain verbs, sentence case, one primary action per moment,
     errors say what happened and how to fix it, status labels are honest. */
  var LABELS=['The promise','Your app','Listening','What leaked','Verified','Every day'];
  function eyebrow(){return ''}
  function panel(head,meta,body,cls){return '<div class="block">'+(head||meta?'<p class="lbl">'+(head?'<span class="mono">'+head+'</span>':'')+(head&&meta?' · ':'')+(meta||'')+'</p>':'')+'<div class="'+(cls||'ev')+' rule">'+body+'</div></div>'}
  function sevTag(f,closed){var v=esc(f.severity);return '<span class="sev '+(closed?'closed':v)+'">'+(closed?'Closed':v.charAt(0).toUpperCase()+v.slice(1))+'</span>'}
  var CFG=window.ZF_CONFIG||{};
  var R={
    0:function(){
      return '<h1>Privacy should be '+U.replace('{w}','verified,')+' not merely promised.</h1>'+
      '<p class="sub">A CLI and GitHub Action that runs your Zcash app\'s real flows and catches leaked addresses, amounts and memos. For payment backends, bots, explorers and web front ends.</p>'+
      '<div class="row"><button class="btn primary" data-go="1">See it work <span>→</span></button>'+(CFG.docs?'<a class="link q" href="'+esc(CFG.docs)+'" target="_blank" rel="noreferrer noopener">Get started ↗</a>':'')+'</div>'+
      // the hosted page is a recorded replay: say so, and give the one command that runs the real thing
      (LIVE?'':'<div class="try"><div class="try-head"><span>Try it on your machine</span><button class="link q" data-act="copytry">Copy</button></div>'+
        '<code class="try-cmd">git clone https://github.com/mauyaa/zcashflight\ncd zcashflight &amp;&amp; npm run demo</code>'+
        '<p class="small muted">This page replays a recorded run of the sample app. It doesn\'t scan anything.</p></div>')},
    1:function(){
      var P=D&&D.policy, prot=P?P.protect:[];
      if(S.app==='policy'){
        return eyebrow(1)+'<h3>What must stay private.</h3><p class="sentence">Never let '+
          CLASSES.map(function(c){var on=prot.indexOf(c[0])>-1;return '<button class="chip" data-rule="'+c[0]+'" aria-pressed="'+on+'"'+(ALWAYS[c[0]]?' aria-disabled="true" aria-describedby="alwaysNote"':'')+'>'+c[1]+'</button>'}).join(', ').replace(/, (?=[^,]*$)/,' or ')+
          ' leave the app'+((P&&P.destinations.length)?', except to '+P.destinations.map(function(d){return '<span class="chip host" tabindex="0" title="'+esc((d.purpose||'')+(d.allow.length?' May receive: '+d.allow.join(', ')+'.':' Receives no protected data.'))+'">'+esc(d.host)+'</span>'}).join(' and '):'')+'.</p>'+
          '<p class="small muted" id="alwaysNote">Viewing keys, spending keys and seed phrases are always protected and can\'t be switched off.</p>'+
          '<div class="row"><button class="btn primary" data-act="policyDone">Save policy</button><span class="small">Saved to <span class="mono">'+esc((D.project&&D.project.policyFile)||'zcashflight.yml')+'</span>'+(LIVE?'':' (this demo keeps it for this visit only)')+'</span></div>';
      }
      var on=prot.length, name=(D&&D.project&&D.project.name)||'ZecShop', sample=!D||D.project.sample!==false, sc=((D&&D.policy&&D.policy.scenarios)||[]).length;
      if(!S.own&&S.app==='idle')return '<h2>Select an app to test.</h2>'+
        '<div class="row">'+runBtn()+(sample?'<button class="link q" data-act="own">Use my own app</button>':'<button class="link q" data-act="own">Use another folder</button><button class="link q" data-act="sample">Try ZecShop</button>')+'</div>'+
        '<p class="small">Watching for '+on+' kinds of private data. <button class="link q" data-act="policy">Change</button></p>';
      if(S.app==='demo')return '<h2>Run it on your own app.</h2>'+
        '<p class="sub">This demo can\'t open folders on your computer. In your app\'s folder, run:</p>'+
        '<div class="term"><b>$ zcashflight init</b>\n<b>$ zcashflight ui</b></div>'+
        '<div class="row"><button class="btn primary" data-act="sample">Try ZecShop instead <span>→</span></button><button class="link q" data-act="own">Back</button></div>';
      var nf=S.app==='notfound',np=S.app==='nopolicy',bad=nf||np;
      return eyebrow(1)+'<h2>'+(nf?'We can\'t find that folder.':np?'That folder has no policy yet.':'Select an app to test.')+'</h2>'+
        '<div><label class="field-label" for="dir">Project folder</label><div class="field"><input id="dir" placeholder="~/code/my-wallet" autocomplete="off" spellcheck="false" value="'+esc(S.path)+'"'+(bad?' aria-invalid="true" aria-describedby="dirErr"':'')+'><button class="btn" data-act="run">Test this app</button></div></div>'+
        (nf?'<p class="error" id="dirErr">Check the path and try again, or start with the sample app, <button class="link inline-link" data-act="sample">ZecShop</button>.</p>':
         np?'<p class="error" id="dirErr">Create one in that folder, then test it again:</p>'+panel('terminal','',' <b>$ zcashflight init</b>','term'):
         '<p class="small">The folder needs a <span class="mono">zcashflight.yml</span>. Want to see one first? <button class="link inline-link" data-act="sample">Try ZecShop</button></p>');
    },
    2:function(){
      var st=(D&&D.policy&&D.policy.start)||'npm run dev', e=S.err||{};
      var m={
        idle:'<h2>Ready when you are.</h2><p class="sub">'+(isSample()?'Start the sample and ZcashFlight runs its checkout, refunds and errors, and listens.':'ZcashFlight starts '+esc(runName())+', runs its scenarios, and listens.')+'</p><div class="row">'+runBtn()+'<button class="link q" data-go="1">Choose another app</button></div>',
        run:eyebrow(2)+'<h2>Listening.</h2><div><p class="count" id="count">'+S.count.requests+'</p><p class="count-cap">Requests captured · <span id="logs">'+S.count.logs+'</span> log lines read</p></div>'+
          '<p class="sub">Requests from '+esc(scenarioList()||'your scenarios')+', masked as they are captured. Calls to third parties are answered locally and never leave this machine.</p><p class="stepline" id="stepline" aria-live="polite">'+S.step+'</p>'+(LIVE?'<div class="row keep"><button class="link q" data-act="stop">Stop the run</button></div>':''),
        nostart:eyebrow(2)+'<h2>Your app didn\'t start.</h2><p class="sub">'+esc(e.message||'It exited before it was ready.')+'</p>'+panel('terminal','',' <b>$ '+esc(st)+'</b>\n '+esc(e.detail||'no output'),'term')+'<div class="row"><button class="btn primary" data-act="retry">Try again</button><button class="link q" data-go="1">Choose another app</button></div>',
        silent:eyebrow(2)+'<h2>We heard nothing.</h2><p class="sub">Your app ran, but no requests or log lines reached ZcashFlight. If it isn\'t a Node app, route its traffic through the collector:</p>'+panel('zcashflight.yml','',' <b>app:</b>\n   <b>proxy:</b> true','term')+'<div class="row"><button class="btn primary" data-act="retry">Run again</button></div>',
        stopped:eyebrow(2)+'<h2>Stopped halfway.</h2><p class="sub">'+esc(cap((e.message||'').replace(/^stopped:\s*/,'')||'Some scenarios didn\'t run'))+'. This result isn\'t complete, so it can\'t be compared yet.</p><div class="row"><button class="btn primary" data-act="retry">Finish the run</button><button class="link q" data-go="1">Discard</button></div>'
      };return m[S.listen]||m.idle},
    3:function(){
      var F=findings(),closed={};(S.cmp&&S.cmp.closed||[]).forEach(function(f){closed[f.id]=1});
      if(!S.run)return '<h2>Nothing to show yet.</h2><p class="sub">Run the scenarios first. Every leak here comes with evidence and a fix.</p><div class="row">'+runBtn()+'</div>';
      if(S.run.status!=='complete')return eyebrow(3)+'<h2>Run incomplete.</h2><p class="sub">'+esc(S.run.error||'The scenarios did not finish.')+'</p><div class="row"><button class="btn primary" data-act="retry">Try again</button></div>';
      if(!F.length)return eyebrow(3)+'<h2>No leaks detected.</h2><p class="sub">Every request and log line in these tests stayed within the policy.</p><div class="row"><button class="btn primary" data-go="4">See the report <span aria-hidden="true">→</span></button></div>';
      if(S.leak>-1){
        var f=F[S.leak],n=F.length,last=S.leak>=n-1;
        var keys=f.evidence.map(function(h){return '<span class="k">'+esc(h.path.replace(/^body\./,'').replace(/^header\./,'header '))+':</span> '+sec(h)}).join('\n');
        var st=f.stack||[],oi=f.at?st.findIndex(function(l){return l.file===f.at.file&&l.line===f.at.line}):-1;
        var chain=oi>0?st.slice(0,oi).reverse().map(function(l){return esc(l.file)+':'+l.line}).join(' → '):'';
        return '<div class="row nav" style="justify-content:space-between;max-width:420px"><button class="link q" data-act="all">← '+(n===1?'Back to the list':'All '+word(n))+'</button>'+(last?'<button class="link q" data-act="all">'+(n===1?'Fix it':'Fix them')+' →</button>':'<button class="link q" data-leak="'+(S.leak+1)+'">Next leak →</button>')+'</div>'+
          '<h3>'+esc(f.title)+'.</h3>'+
          '<div class="block"><p class="lbl meta-line">'+sevTag(f,closed[f.id])+'<span>'+(f.rule==='B'?'Written to':'Sent to')+' <span class="mono">'+esc(f.destination)+'</span> during '+esc(f.scenario)+(f.occurrences>1?', '+f.occurrences+' times':'')+' · masked, hold a value for proof</span></p>'+
            '<div class="ev rule">'+esc(f.sample)+(keys?'\n'+keys:'')+'</div></div>'+
          (f.at?panel(esc(f.at.file)+':'+f.at.line,'the line that sent it'+(chain?', leaving through '+chain:''),(f.snippet?'<s>'+esc(f.snippet)+'</s>':'')):'')+
          '<div class="block"><p class="lbl">The fix · '+esc(f.ruleName)+'</p><p class="small" style="color:var(--color-text-primary)">'+esc(f.remediation.summary)+'</p><details class="how"><summary>How to fix it, step by step</summary><ul class="fixsteps">'+f.remediation.steps.map(function(s){return '<li>'+esc(s).replace(/`([^`]+)`/g,'<span class="mono">$1</span>')+'</li>'}).join('')+'</ul>'+
            ((f.remediation.refs||[]).length?'<p class="small">'+f.remediation.refs.map(function(r){return '<a class="link q inline-link" href="'+esc(r.url)+'" target="_blank" rel="noreferrer noopener">'+esc(r.label)+' ↗</a>'}).join(' · ')+'</p>':'')+'</details></div>';
      }
      var allClosed=S.cmp&&S.cmp.verdict==='clean';
      var head=allClosed?'<h2>'+word(F.length,true)+' leaks, closed.</h2>':'<h2>'+RING.replace('{w}',F.length)+(F.length===1?'thing leaked.':'things leaked.')+'</h2>';
      var sample=LIVE?D.project.sample:true;
      var cta=S.after?'<div class="row"><button class="btn primary" data-go="4">See the result <span aria-hidden="true">→</span></button></div>':
        S.fixing?'<div class="row"><button class="btn primary" data-act="apply" aria-busy="true">Applying fixes…</button></div>':
        '<div class="row"><button class="btn primary" data-act="'+(sample?'apply':'rerun')+'">'+(sample?'Apply the '+word(F.length)+' fix'+(F.length===1?'':'es')+' and re-run':'Run the same tests again')+'</button></div>'+
        
        (S.fixMsg?'<p class="error" role="alert">'+esc(S.fixMsg)+'</p>':'');
      // the same title more than once: say which scenario each came from, so rows can be told apart
      var dup={};F.forEach(function(f){dup[f.title]=(dup[f.title]||0)+1});
      return eyebrow(3)+head+'<div class="list">'+F.map(function(f,k){var tw=split(f.title),c=closed[f.id];
        return '<button class="item'+(c?' closed':'')+'" data-leak="'+k+'"><span class="n">'+String(k+1).padStart(2,'0')+'</span><span><span class="t">'+esc(tw[0])+'</span> <span class="w">'+esc(tw[1])+'</span>'+(dup[f.title]>1?' <span class="w">· '+esc(f.scenario)+'</span>':'')+'</span>'+sevTag(f,c)+'</button>'}).join('')+'</div>'+cta;
    },
    4:function(){
      var run=S.after||S.run;
      if(!run)return '<h2>Nothing verified yet.</h2><p class="sub">Run the scenarios, fix what leaks, and the same tests confirm it here.</p><div class="row">'+runBtn()+'</div>';
      if(!S.after&&run.findings.length)return '<h2>Not yet.</h2><p class="sub">'+word(run.findings.length,true)+' leak'+(run.findings.length>1?'s are':' is')+' still open. Apply the fixes and the same tests run again.</p><div class="row">'+((LIVE?D.project.sample:true)?'<button class="btn primary" data-act="apply">Apply the fixes and re-run</button>':'<button class="btn primary" data-act="rerun">Run the same tests again</button>')+'<button class="link q" data-go="3">See the leaks</button></div>';
      var c=S.cmp;
      if(run.status!=='complete'||c&&c.verdict==='incomplete')return eyebrow(4)+'<h2>Not verified yet.</h2><p class="sub">'+esc(run.error||'A run did not complete, so its findings cannot be compared.')+'</p><div class="row"><button class="btn primary" data-act="retry">Run again</button></div>';
      if(S.clean==='report'){
        var open=run.findings;
        return eyebrow(4)+'<h3>'+(open.length?word(open.length,true)+' leak'+(open.length>1?'s':'')+' still open.':'No leaks detected in these tests.')+'</h3>'+
          '<p class="small mono muted">Run '+run.n+' · '+esc(run.network)+' · '+esc(when(run.finishedAt))+' · fingerprint '+esc(run.fingerprint)+'</p>'+
          '<div class="spine"><div class="stop ok"><h4>Tested</h4><p>'+esc(run.scenarios.map(function(s){return s.name}).join(', '))+'. '+pl(run.stats.requests,'request')+' and '+pl(run.stats.logs,'log line')+', masked on this machine; '+run.stats.sinkholed+' third-party calls kept off the network.</p></div>'+
          (c&&c.closed.length?'<div class="stop ok"><h4>Closed</h4><p>'+c.closed.map(function(f){return '<s>'+esc(split(f.title)[0])+'</s>'}).join(' · ')+'</p></div>':'')+
          (open.length?'<div class="stop"><h4>Still open</h4><p>'+open.map(function(f){return esc(f.title)}).join(' · ')+'</p></div>':'')+
          ((run.coverage.uninspected||[]).length?'<div class="stop"><h4>Not inspected</h4><p>'+run.coverage.uninspected.map(function(u){return u.count+' '+esc(u.what)+' to '+esc(u.destination)+' ('+esc(u.reason)+')'}).join('. ')+'. These are gaps in this run, not leaks.</p></div>':'')+
          '<div class="stop"><h4>Not tested</h4><p>'+esc(run.coverage.notTested.slice((run.coverage.uninspected||[]).length).join('. '))+'.</p></div></div>'+
          '<div class="row"><button class="btn primary" data-go="5">Done <span aria-hidden="true">→</span></button>'+reportLinks(run)+'</div>';
      }
      if(!c||!S.after)return eyebrow(4)+'<h2>'+U.replace('{w}','No leaks')+' detected.</h2><p class="sub">'+esc(cap(scenarioList()))+' ran with no detected leaks across the covered flows.</p><div class="row"><button class="btn primary" data-act="report">View the report</button><button class="link q" data-go="5">Skip</button></div>';
      if(c.verdict==='clean')return eyebrow(4)+'<h2>'+(c.closed.length===1?U.replace('{w}','The leak is')+' closed.':U.replace('{w}','All '+word(c.closed.length))+' leaks closed.')+'</h2><p class="sub">The same '+word(run.scenarios.length)+' scenario'+(run.scenarios.length===1?'':'s')+' ran again: '+pl(run.stats.requests,'request')+', no detected leaks across the covered flows.</p>'+
        '<div class="row"><button class="btn primary" data-act="report">View the report</button><button class="link q" data-go="5">Skip</button></div>';
      // nothing closed is not progress: say plainly that the same leaks are still there
      var none=!c.added.length&&!c.closed.length;
      return eyebrow(4)+'<h2>'+(c.added.length?word(c.added.length,true)+' new leak'+(c.added.length>1?'s':'')+'.':none?'Nothing closed yet.':word(c.closed.length,true)+' closed, '+word(c.open.length)+' still open.')+'</h2>'+
        '<p class="sub">'+(c.added.length?'The re-run found something the last run didn\'t.':none?'The same '+word(c.open.length)+' leak'+(c.open.length>1?'s are':' is')+' still open after the re-run. Fix the code, then run the same tests again.':'Progress. The rest are waiting with their evidence.')+'</p>'+
        '<div class="row"><button class="btn primary" data-act="continue">Back to the leaks</button><button class="link q" data-act="report">View the report</button></div>';
    },
    5:function(){
      var h=homeState(),L=D&&D.latest,cmp=D&&D.comparison;
      if(L&&L.status!=='complete'&&!S.home)return eyebrow(5)+'<h2>Last run incomplete.</h2><p class="sub">'+esc(L.error||'Finish the scenarios before verifying this app.')+'</p><div class="row"><button class="btn primary" data-go="1">Run again</button></div>';
      var ci=panel('.github/workflows/privacy.yml','',' <b>- run:</b> zcashflight run --ci\n   <span class="why"># fails the pull request on a new leak</span>','term');
      var get=CFG.docs?'<a class="btn primary" href="'+esc(CFG.docs)+'" target="_blank" rel="noreferrer noopener">Get started <span aria-hidden="true">↗</span></a>':'';
      var m={
        first:eyebrow(5)+'<h2>Nothing here yet.</h2><p class="sub">Point ZcashFlight at an app and take the first walk. It takes about a minute.</p><div class="row"><button class="btn primary" data-go="1">Choose an app <span aria-hidden="true">→</span></button></div>',
        quiet:eyebrow(5)+'<h2>All quiet.</h2><p class="sub">'+(L?'Run '+L.n+' found nothing new. ':'')+'Put the same check on every pull request, and ZcashFlight speaks only when something new leaks.</p>'+ci+
          '<div class="row">'+(LIVE?'<button class="btn primary" data-act="copy">Copy the command</button>':get+'<button class="link q" data-act="copy">Copy the command</button>')+'</div><p class="small">Findings also land in GitHub code scanning (SARIF) and the job summary.</p>',
        open:eyebrow(5)+'<h2>'+(L?word(L.findings.length,true):'Some')+' still open.</h2><p class="sub">Nothing new since the last run. The open leaks are waiting with their evidence.</p><div class="row"><button class="btn primary" data-act="openLeaks">See them</button></div>',
        alert:'',alertDetail:''
      };
      var nf=REC&&S.home&&S.home.indexOf('alert')===0?REC.regressed.findings.filter(function(f){return REC.regressedAdded.indexOf(f.id)>-1})[0]:(cmp&&cmp.added[0]);
      if(nf){
        m.alert=eyebrow(5)+'<h2>One new leak.</h2><p class="sub">'+esc(nf.title)+', new since the last run.</p><div class="row"><button class="btn primary" data-act="seeit">See it</button><button class="link q" data-act="quiet">Not now</button></div><p class="small">In CI, this fails the pull request that introduced it. No reminders in between.</p>';
        m.alertDetail=eyebrow(5)+'<h3>'+esc(nf.title)+'.</h3><p class="lbl meta-line">'+sevTag(nf)+'<span>New since the last run</span></p><p class="sub">Sent to <span class="mono">'+esc(nf.destination)+'</span>'+(nf.at?' from <span class="mono">'+esc(nf.at.file)+':'+nf.at.line+'</span>':'')+'.</p>'+
          (nf.snippet?panel(esc(nf.at.file)+':'+nf.at.line,'','<s>'+esc(nf.snippet)+'</s>'):'')+'<p class="small" style="color:var(--color-text-primary)">'+esc(nf.remediation.summary)+'</p><div class="row"><button class="btn primary" data-act="quiet">I fixed it</button></div>';
      }
      return m[h]||m.quiet;
    }
  };
  function cap(s){s=String(s||'');return s.charAt(0).toUpperCase()+s.slice(1)}
  function homeState(){
    if(S.home)return S.home;
    if(!D||!D.runs||!D.runs.length)return 'first';
    var L=D.latest;if(!L)return 'first';
    if(D.comparison&&D.comparison.added.length&&D.previous)return 'alert';
    return L.findings.length?'open':'quiet';
  }

  function render(i,keepFocus){
    T[i].innerHTML='<div class="swap">'+R[i]()+'</div>';
    var hd=T[i].querySelector('h1,h2');if(hd)hd.id='h'+i;
    if(i===5){svg.classList.toggle('first',homeState()==='first');var al=svg.querySelector('[data-today]');if(al&&/^alert/.test(homeState()))al.classList.add('alert')}
    var lg=document.getElementById('listenG');if(lg)lg.classList.toggle('stopped',S.listen==='stopped');
    if(walker&&path)paint(cur,0);
    fitText();syncHint();
    if(!keepFocus&&i===S.i)focusPrimary();
  }
  function renderAll(){for(var k=0;k<N;k++)render(k,true)}
  function focusPrimary(){var b=(S.focusDir&&T[S.i].querySelector('#dir'))||T[S.i].querySelector('.primary');S.focusDir=false;if(b&&!mobile)try{b.focus({preventScroll:true})}catch(e){}}

  /* illustrations sit in circles at full clarity: no filter, no overlay */
  function photoCircle(id,cx,cy,r,url,after){
    var defs=el('defs',{}),cp=el('clipPath',{id:'c-'+id},defs);el('circle',{cx:cx,cy:cy,r:r},cp);
    var im=el('image',{href:url,x:cx-r,y:cy-r,width:r*2,height:r*2,preserveAspectRatio:'xMidYMid slice','clip-path':'url(#c-'+id+')',class:'photo'});
    im.addEventListener('error',function(){im.remove()});
    if(after)im.addEventListener('load',after);
    return im;
  }

  /* ================= geometry ================= */
  var W,H,path,L,stops=[],walker,wbody,cur=0,camX=0,face=1,mobile=false,lineY=0;
  var RADIUS={critical:58,high:52,medium:40,low:32};
  function build(){
    W=stage.clientWidth;H=stage.clientHeight;mobile=W<=820;
    world.style.width=(W*N)+'px';
    sts.forEach(function(s,k){s.style.left=(k*W)+'px';s.style.width=W+'px'});
    svg.setAttribute('width',W*N);svg.setAttribute('height',H);svg.setAttribute('viewBox','0 0 '+(W*N)+' '+H);
    svg.innerHTML='';
    var wr=world.getBoundingClientRect();
    var arts=sts.map(function(s){var r=s.querySelector('.art').getBoundingClientRect();return {x:r.left-wr.left,y:r.top-wr.top,w:r.width,h:r.height}});
    if(mobile)lineY=Math.round(arts[0].y+arts[0].h*.49);
    else{T[0].innerHTML='<div class="swap">'+R[0]()+'</div>';var top0=T[0].getBoundingClientRect().top-stage.getBoundingClientRect().top;lineY=Math.round(Math.min(H-150,Math.max(H*.68,top0+T[0].scrollHeight+36)))}
    var y=lineY,gap=mobile?8:11,k=mobile?.62:1;
    var big=Math.max(24,mobile?Math.min(arts[0].w*.3,arts[0].h*.36,118):Math.min(arts[0].w*.4,H*.22,H-lineY-40));
    var C=[],mid=function(a){return a.x+a.w/2};
    function add(o){C.push(o);return o}
    add({kind:'hero',cx:mid(arts[0]),r:big});
    add({kind:'app',cx:mid(arts[1]),r:mobile?13:16});
    add({kind:'listen',cx:mid(arts[2]),r:62*k});
    var F=findings().slice(0,7);
    if(F.length){
      var rr=F.map(function(f){return (RADIUS[f.severity]||40)*k}),sp=16*k,tot=rr.reduce(function(a,b){return a+2*(b+gap)},0)+sp*(rr.length-1),fit=Math.min(1,(arts[3].w-(mobile?58:16))/tot);
      rr=rr.map(function(r){return r*fit});tot*=fit;var x=mid(arts[3])-tot/2+(mobile?21:0);
      rr.forEach(function(r,i){x+=r+gap;add({kind:'leak',cx:x,r:r,i:i});x+=r+gap+sp*fit});
    }
    add({kind:'final',cx:mid(arts[4]),r:big});
    var dw=Math.min(arts[5].w,420)/7,dx0=mid(arts[5])-dw*3,today=(new Date().getDay()+6)%7;
    var days=weekRuns();
    for(var d=0;d<7;d++)add({kind:'day',cx:dx0+d*dw,r:mobile?7:9,d:d});

    var dd=['M -60 '+y];
    C.forEach(function(c){c.R=c.r+gap;dd.push('H '+(c.cx-c.R),'A '+c.R+' '+c.R+' 0 0 0 '+(c.cx+c.R)+' '+y)});
    dd.push('H '+(W*N+60));
    path=el('path',{d:dd.join(' '),class:'track'});L=path.getTotalLength();

    var closed={};(S.cmp&&S.cmp.closed||[]).forEach(function(f){closed[f.id]=1});
    C.forEach(function(c){
      if(c.kind==='hero'){el('circle',{cx:c.cx,cy:y,r:c.r,class:'c-red'});photoCircle('hero',c.cx,y,c.r,PHOTOS.hero);hit(c.cx,y,c.r,{'data-go':'1'},'See it work');}
      if(c.kind==='app'){el('circle',{cx:c.cx,cy:y,r:c.r,class:'c-empty'});var t=el('text',{x:c.cx,y:y-c.R-14,class:'svglab','text-anchor':'middle'});t.textContent=(D&&D.project&&!D.project.sample)?String(D.project.name).toLowerCase():'your app';hit(c.cx,y,c.r+6,{'data-act':isSample()?'sample':'current'},'Run on '+runName())}
      if(c.kind==='listen'){photoCircle('listen',c.cx,y,c.r-3,PHOTOS.listen);var g=el('g',{id:'listenG'});el('circle',{cx:c.cx,cy:y,r:c.r,class:'c-listen'},g);el('path',{d:'M'+c.cx+' '+(y-c.r)+' A'+c.r+' '+c.r+' 0 0 0 '+c.cx+' '+(y+c.r),class:'half'},g)}
      if(c.kind==='leak'){
        var f=F[c.i],isC=!!closed[f.id];
        el('circle',{cx:c.cx,cy:y,r:c.r+7,class:'sel','data-sel':c.i});
        var lc=el('circle',{cx:c.cx,cy:y,r:c.r,class:'c-red c-leak'+(isC?' closed':''),'data-leak':c.i,'data-id':f.id});el('title',{},lc).textContent=String(c.i+1).padStart(2,'0')+' · '+f.title+(isC?' (closed)':'');
        var n=el('text',{x:c.cx,y:y-c.R-12,class:'num','text-anchor':'middle'});n.textContent=String(c.i+1).padStart(2,'0');
        tick(c,'leaktick',isC);
      }
      if(c.kind==='final'){el('circle',{cx:c.cx,cy:y,r:c.r,class:'c-empty'});photoCircle('final',c.cx,y,c.r-0.7,PHOTOS.final,function(){var t=svg.querySelector('.finaltick');if(t)t.style.display='none'});hit(c.cx,y,c.r,{'data-act':'report'},'View the report');tick(c,'finaltick',S.cmp&&S.cmp.verdict==='clean')}
      if(c.kind==='day'){var info=days[c.d],cls='c-day'+(c.d>today?' future':'')+(info&&info.leaks?' alert':'');var a={cx:c.cx,cy:y,r:c.r,class:cls,'data-day':c.d};if(c.d===today)a['data-today']='1';var ce=el('circle',a);if(info){var tt=el('title',{},ce);tt.textContent=info.runs+' run'+(info.runs>1?'s':'')+(info.leaks?', leaks found':', clean')}}
    });
    ['M','T','W','T','F','S','S'].forEach(function(l,i){var t=el('text',{x:dx0+i*dw,y:y+(mobile?7:9)+gap+18,class:'day'+(i===today?' today':''),'text-anchor':'middle'});t.textContent=l});
    function tick(c,cls,on){var s=c.r*.3;el('path',{d:'M'+(c.cx-s)+' '+(y+s*.05)+' l'+(s*.7)+' '+(s*.7)+' l'+(s*1.35)+' '+(-s*1.5),class:'tick '+cls+(on?' on':'')})}

    drawHint(C.filter(function(c){return c.kind==='leak'}),y,F);
    function hit(cx,cy,r,attrs,label){var g=el('g',Object.assign({class:'hit'},attrs));el('circle',{cx:cx,cy:cy,r:r+8,class:'hit-ring'},g);el('circle',{cx:cx,cy:cy,r:r,class:'hit-disk'},g);el('title',{},g).textContent=label;return g}
    walker=el('g',{});wbody=el('g',{},walker);
    var hero=C[0],app=C[1],lis=C[2],lk=C.filter(function(c){return c.kind==='leak'}),fin=C.filter(function(c){return c.kind==='final'})[0],dy=C.filter(function(c){return c.kind==='day'});
    var off=mobile?26:64,ti=Math.min(5,today);
    stops=[atX(hero.cx-hero.R-off),atX(app.cx-app.R-44),atX(lis.cx-lis.R-off*.7),atX(lk.length?lk[0].cx-lk[0].R-(mobile?16:off*.7):mid(arts[3])-40),atX(fin.cx-fin.R-off),atX((dy[ti].cx+dy[ti+1].cx)/2+3)];
    cur=stops[S.i];camX=S.i*W;world.style.transform='translate3d('+(-camX)+'px,0,0)';
    paint(cur,0);markSel();renderAll();drawMap();markHere();
    if(S.listen==='stopped'){var lg=document.getElementById('listenG');if(lg)lg.classList.add('stopped')}
    if(S.listen==='run'&&counting.on){var g2=document.getElementById('listenG');if(g2)g2.classList.add('listening')}
  }
  /* runs per weekday this week, from the run history */
  function weekRuns(){
    var out={},now=new Date(),monday=new Date(now.getFullYear(),now.getMonth(),now.getDate()-((now.getDay()+6)%7));
    ((D&&D.runs)||[]).forEach(function(r){var t=new Date(r.finishedAt);if(t<monday)return;var d=(t.getDay()+6)%7;out[d]=out[d]||{runs:0,leaks:0};out[d].runs++;out[d].leaks=r.findings});
    return out;
  }
  function drawHint(lk,y,F){
    if(!lk.length)return;
    var tc=lk[Math.min(1,lk.length-1)],last=lk[lk.length-1],s=mobile?.62:1;
    var ex=tc.cx+tc.r*.15,ey=y-tc.R-26*s;                                  // arrowhead: just above the circle's number
    var sx=Math.min(last.cx+30*s,(3+1)*W-(mobile?96:190)),sy=ey-(mobile?58:150); // label: up in the empty space, right of the run of circles
    sy=Math.max(sy,mobile?66:104);if(ey-sy<34*s)return;                     // never under the logo band; skip if the band is too short to say it well
    var c1x=sx+38*s,c1y=sy+62*s,c2x=ex+92*s,c2y=ey-78*s;
    var mx=sx-34*s,my=sy+58*s;                                             // a small loop on the way down: drawn, not plotted
    var d='M'+sx+' '+(sy+8*s)+' C '+(sx+12*s)+' '+(sy+30*s)+', '+(mx+26*s)+' '+(my-22*s)+', '+mx+' '+my+
      ' c '+(-15*s)+' '+(7*s)+' '+(-13*s)+' '+(28*s)+' '+(5*s)+' '+(23*s)+' c '+(14*s)+' '+(-5*s)+' '+(9*s)+' '+(-25*s)+' '+(-8*s)+' '+(-19*s)+
      ' C '+(mx-40*s)+' '+(my+26*s)+', '+c2x+' '+c2y+', '+ex+' '+ey;
    var jit=function(v,k){return v+Math.sin(v*.37+k)*1.6*s};
    var d2=d.replace(/-?\d+(\.\d+)?/g,function(v,_,i){return (+v+Math.sin(+v*.37+i)*1.4*s).toFixed(1)});  // a second, slightly-off pass of the pen
    var a=Math.atan2(ey-c2y,ex-c2x),L=13*s,h=function(t){return (ex-Math.cos(a+t)*L)+' '+(ey-Math.sin(a+t)*L)};
    var g=el('g',{id:'hint',class:'hint','data-leak':'0'});
    el('path',{d:d,pathLength:1},g);el('path',{d:d2,pathLength:1,class:'echo'},g);
    el('path',{d:'M'+h(.42)+' L '+ex+' '+ey+' L '+h(-.5),pathLength:1,class:'head'},g);
    var t=el('text',{x:sx-6*s,y:sy-4*s,transform:'rotate(-5 '+sx+' '+sy+')','text-anchor':'middle',class:'hint-label'},g);t.textContent='TAP A LEAK';
    el('path',{d:'M'+(sx-52*s)+' '+(sy+3*s)+' q 24 4 50 -1 t 44 2',pathLength:1,class:'scrawl'},g);
    el('title',{},g).textContent='Open the first leak';
    syncHint();
  }
  function syncHint(){var h=document.getElementById('hint');if(h)h.classList.toggle('on',S.i===3&&S.leak<0&&!S.after&&!S.fixing&&!!S.run&&S.run.findings.length>0)}
  function fitText(){
    T.forEach(function(t){
      if(mobile){t.style.maxHeight='';return}
      var top=t.getBoundingClientRect().top-stage.getBoundingClientRect().top;
      t.style.maxHeight=Math.max(200,lineY-top-36)+'px';
    });
    T.forEach(more);
  }
  function more(t){t.classList.toggle('more',t.scrollHeight-t.clientHeight-t.scrollTop>2)}
  T.forEach(function(t){t.addEventListener('scroll',function(){more(t)},{passive:true})});
  function atX(x){var lo=0,hi=L;for(var j=0;j<40;j++){var m=(lo+hi)/2;if(path.getPointAtLength(m).x<x)lo=m;else hi=m}return lo}
  var lastT=0,lastPos=null,stride=0,anim_on=false;
  function paint(l,moving){
    var p=path.getPointAtLength(l),q=path.getPointAtLength(Math.min(L,l+1.5)),tx=q.x-p.x,ty=q.y-p.y,s=mobile?.66:.74;
    var now=performance.now();if(moving&&lastPos!=null)stride+=Math.abs(l-lastPos)/(46*s);lastPos=l;lastT=now;
    var h=homeState(),sit=!moving&&S.i===5&&(h==='quiet'||h==='first');
    var kind=moving?'walk':sit?'sit':'stand';
    walker.setAttribute('transform','translate('+p.x.toFixed(1)+' '+p.y.toFixed(1)+')');
    wbody.setAttribute('transform','scale('+(face*s)+' '+s+')');
    wbody.innerHTML=ZFWalker.pose({kind:kind,p:stride%1,float:reduce?0:Math.sin(now/700)*0.9});
    wbody.classList.toggle('noshadow',Math.abs(ty)>Math.abs(tx)*.6);
  }

  /* ================= moving ================= */
  (function drift(){if(path&&!anim_on&&!reduce)paint(cur,0);setTimeout(function(){requestAnimationFrame(drift)},80)})();
  var anim=null,timer=null;
  function go(i,after){
    i=Math.max(0,Math.min(N-1,i));clearTimeout(timer);closePop();
    if(i===S.i){if(after)after();return}
    cancelAnimationFrame(anim);
    if(i===5&&!S.homePinned){S.home=null;render(5,true)}
    var from=cur,to=stops[i],c0=camX,c1=i*W,Dur=reduce?0:Math.max(900,Math.min(1500,Math.abs(c1-c0)*.8)),t0=performance.now();
    face=to>=from?1:-1;S.i=i;markHere();drawMap();syncHint();
    try{history.replaceState(null,'','#'+sts[i].dataset.name)}catch(e){}
    (function f(t){
      var k=Dur?Math.min(1,(t-t0)/Dur):1,e=-(Math.cos(Math.PI*k)-1)/2;   // sine in-out: no sudden start or stop
      anim_on=k<1;cur=from+(to-from)*e;camX=c0+(c1-c0)*e;world.style.transform='translate3d('+(-camX)+'px,0,0)';
      paint(cur,k<1);
      if(k<1)anim=requestAnimationFrame(f);else{paint(cur,0);focusPrimary();if(after)after()}
    })(t0);
  }
  function markHere(){sts.forEach(function(s,k){var h=k===S.i;s.classList.toggle('here',h);s.setAttribute('aria-hidden',h?'false':'true');s.inert=!h})}
  function counting(on){counting.on=on;var g=document.getElementById('listenG');if(g)g.classList.toggle('listening',on)}

  /* ================= leaks ================= */
  function markSel(){svg.querySelectorAll('[data-sel]').forEach(function(s){s.classList.toggle('on',+s.dataset.sel===S.leak)})}
  function apply(){
    S.fixing=true;S.fixMsg='';S.leak=-1;markSel();render(3,true);
    var rerun=function(){S.listen='run';S.count={requests:0,logs:0};fixLine('Re-running…');if(LIVE)api('run',{}).then(function(r){if(!r.ok){S.fixing=false;S.fixMsg=r.j.error||'Could not start a run';render(3)}});else replay(REC.fixed,REC.fixedProgress)};
    if(!LIVE){fixLine('Applying fixes…');setTimeout(rerun,reduce?0:500);return}
    if(D.project.sample)api('sample',{action:'apply'}).then(function(r){if(!r.ok){S.fixing=false;S.fixMsg=r.j.error||r.j.output;render(3);return}fixLine('Fixes applied · re-running…');rerun()});
    else rerun();
  }

  /* ================= little map ================= */
  function drawMap(){
    var m=document.getElementById('mapsvg'),w=150,y=10,gx=w/(N-1),str='<line x1="0" y1="'+y+'" x2="'+w+'" y2="'+y+'" stroke="var(--line)" stroke-width="1.6"/>';
    for(var k=0;k<N;k++)str+='<g class="pt'+(k===S.i?' on':k<S.i?' done':'')+'" data-go="'+k+'" role="button" tabindex="0" aria-label="'+sts[k].dataset.label+'"><title>'+sts[k].dataset.label+'</title><circle cx="'+(k*gx||5)+'" cy="'+y+'" r="5"/><rect x="'+((k*gx||5)-12)+'" y="-2" width="24" height="24" fill="transparent"/></g>';
    m.innerHTML=str.replace('cx="150"','cx="145"');
    document.getElementById('mapname').textContent=sts[S.i].dataset.label;
  }
  function drawMode(){
    var dl=document.getElementById('docsLink'),sl=document.getElementById('srcLink');
    if(dl){if(CFG.docs)dl.href=CFG.docs;else dl.hidden=true}if(sl){if(CFG.repo)sl.href=CFG.repo;else sl.hidden=true}
  }


  /* ================= seal + scenes ================= */
  var pop=document.getElementById('pop'),sb=document.getElementById('statesBtn'),sp=document.getElementById('sealpop');
  function seal(){
    document.getElementById('sealLabel').textContent=LIVE?'Local':'Demo only';
    var limits=CFG.repo?'<a href="'+esc(CFG.repo)+'#what-it-is-not" target="_blank" rel="noreferrer noopener">What it does not test ↗</a>':'';
    var credits='<div><h4>Credits</h4>Illustrations by the ZcashFlight team. Typeface Instrument Sans (SIL OFL). Both are served from this page.</div>';
    sp.innerHTML=LIVE?
      '<b>Everything stays on this machine.</b><div><h4>While testing</h4>Values are masked where they are captured; raw payloads are never written to disk. Requests to third parties are answered locally and never reach the network.</div><div><h4>This dashboard</h4>Listens on 127.0.0.1 only and needs this session’s token. No telemetry, no third-party fonts or scripts.</div><div><h4>Limits</h4>A clean run means no leaks were detected in these tests, not that the app is private in every circumstance. '+limits+'</div>'+credits:
      '<b>A real run, recorded.</b><div><h4>What you are seeing</h4>ZcashFlight ran against ZecShop, the sample app, on '+esc(REC?when(REC.recordedAt):'')+'. Every finding, masked value and line of code is from that run; this page replays it.</div><div><h4>Your privacy on this page</h4>No cookies, no analytics, no third-party requests, nothing stored about you. The host receives standard request logs (IP address, browser) under its own policy.</div><div><h4>Run it yourself</h4><span class="mono">npm run ui</span> in a checkout, or <span class="mono">zcashflight run</span> in your app’s folder. '+limits+'</div>'+credits;
  }

  var ST=[
    ['Every day'],
    ['First visit',function(){S.home='first';S.homePinned=true;render(5);go(5)}],
    ['A new leak',function(){S.home='alert';S.homePinned=true;render(5);go(5)}],
    ['All quiet',function(){S.home='quiet';S.homePinned=true;render(5);go(5)}],
    ['When something goes wrong'],
    ['Folder not found',function(){S.own=true;S.app='notfound';S.path='~/code/my-walet';render(1);go(1)}],
    ['App didn\'t start',function(){S.listen='nostart';S.err=REC.errors.nostart;render(2);go(2)}],
    ['Heard nothing',function(){S.listen='silent';render(2);go(2)}],
    ['Stopped halfway',function(){S.listen='stopped';S.err=REC.errors.stopped;render(2);go(2)}],
    ['Start'],
    ['Start over',function(){location.hash='';location.reload()}]
  ];
  function closePop(){pop.hidden=true;sp.hidden=true;sb.setAttribute('aria-expanded','false');document.getElementById('sealBtn').setAttribute('aria-expanded','false')}
  /* hold to reveal: what a masked value is and how we know, while you hold it. The raw value was never kept. */
  var held=null,ht=null;
  function reveal(b){hide();held=b;b.textContent=b.dataset.full;b.classList.add('shown');ht=setTimeout(hide,3000)}
  function hide(){clearTimeout(ht);if(held){held.textContent=held.dataset.mask;held.classList.remove('shown');held=null}}
  document.addEventListener('pointerdown',function(e){var b=e.target.closest('.secret');if(b){e.preventDefault();reveal(b)}});
  ['pointerup','pointercancel'].forEach(function(n){document.addEventListener(n,hide)});
  document.addEventListener('keydown',function(e){var b=e.target.closest&&e.target.closest('.secret');if(b&&(e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();reveal(b)}});
  document.addEventListener('keyup',function(e){if(held&&(e.key===' '||e.key==='Enter'))hide()});
  /* look away and evidence blurs */
  function away(on){document.body.classList.toggle('away',on);if(on)hide()}
  document.addEventListener('visibilitychange',function(){away(document.hidden)});
  addEventListener('blur',function(){away(true)});addEventListener('focus',function(){away(false)});

  /* ================= input ================= */
  function isSample(){return !D||!D.project||D.project.sample!==false}
  function runName(){return isSample()?'ZecShop':String(D.project.name)}
  function runBtn(){return '<button class="btn primary" data-act="'+(isSample()?'sample':'current')+'">Run on '+esc(runName())+' <span>→</span></button>'}
  function chooseCurrent(){S.own=false;S.app='idle';S.run=null;S.after=null;S.cmp=null;build();startRun();go(2)}
  function chooseSample(){
    S.own=false;S.app='idle';S.path='';
    var start=function(){build();startRun();go(2)};
    if(!LIVE){D=recState(REC.seeded,null);start();return}
    api('project',{sample:true}).then(function(r){if(!r.ok)return;D=r.j;drawMode();return api('sample',{action:'reset'})}).then(function(){start()});
  }
  function chooseOwn(){
    var v=((document.getElementById('dir')||{}).value||'').trim();S.path=v;
    if(!v){var i=document.getElementById('dir');if(i)i.focus();return}
    if(!LIVE){S.app='demo';render(1);return}
    api('project',{path:v}).then(function(r){
      if(!r.ok){S.app=r.j.error==='nopolicy'?'nopolicy':'notfound';render(1);return}
      D=r.j;S.app='idle';S.run=null;S.after=null;S.cmp=null;drawMode();build();startRun();go(2);
    });
  }
  function lightLeak(i,on){svg.querySelectorAll('.c-leak').forEach(function(c){c.classList.toggle('hl',on&&+c.dataset.leak===i)});T[3].querySelectorAll('.item').forEach(function(it){it.classList.toggle('hl',on&&+it.dataset.leak===i)})}
  ['mouseover','focusin'].forEach(function(n){document.addEventListener(n,function(e){var l=e.target.closest&&e.target.closest('.c-leak,.item[data-leak]');if(l&&S.i===3)lightLeak(+l.dataset.leak,true)})});
  ['mouseout','focusout'].forEach(function(n){document.addEventListener(n,function(e){var l=e.target.closest&&e.target.closest('.c-leak,.item[data-leak]');if(l)lightLeak(-1,false)})});
  document.addEventListener('click',function(e){
    var t=e.target;
    if(t.closest('#statesBtn')){sp.hidden=true;pop.hidden=!pop.hidden;sb.setAttribute('aria-expanded',String(!pop.hidden));return}
    if(t.closest('#sealBtn')){pop.hidden=true;sp.hidden=!sp.hidden;document.getElementById('sealBtn').setAttribute('aria-expanded',String(!sp.hidden));return}
    if(!t.closest('.sealpop'))sp.hidden=true;
    var st=t.closest('[data-st]');if(st){closePop();ST[+st.dataset.st][1]();return}
    if(!t.closest('.states'))closePop();
    var g=t.closest('[data-go]');if(g){go(+g.dataset.go);return}
    var r=t.closest('[data-rule]');if(r){
      var c=r.dataset.rule;if(ALWAYS[c])return;
      var p=D.policy.protect,k=p.indexOf(c);if(k>-1)p.splice(k,1);else p.push(c);r.setAttribute('aria-pressed',String(k===-1));return}
    var lk=t.closest('[data-leak]');if(lk&&S.i===3){S.leak=+lk.dataset.leak;lightLeak(-1,false);markSel();render(3,true);return}
    var a=t.closest('[data-act]');if(!a)return;
    switch(a.dataset.act){
      case 'run':chooseOwn();break;
      case 'sample':chooseSample();break;
      case 'current':chooseCurrent();break;
      case 'own':S.own=true;S.app='idle';S.focusDir=true;render(1);break;
      case 'policy':S.app='policy';render(1);break;
      case 'policyDone':
        if(LIVE)api('policy',{protect:D.policy.protect}).then(function(r){if(r.ok){D=r.j}S.app='idle';render(1)});
        else{S.app='idle';render(1)}break;
      case 'stop':if(LIVE)api('stop',{});break;
      case 'retry':startRun();break;
      case 'all':S.leak=-1;markSel();render(3);break;
      case 'apply':case 'rerun':if(!S.fixing){if(S.i!==3)go(3,function(){apply()});else apply()}break;
      case 'continue':S.run=S.after;S.after=null;S.cmp=null;S.leak=-1;build();go(3);break;
      case 'openLeaks':S.run=D.latest;S.after=null;S.cmp=null;S.leak=-1;build();go(3);break;
      case 'report':S.clean='report';render(4);break;
      case 'seeit':S.home='alertDetail';S.homePinned=true;render(5);break;
      case 'quiet':S.home='quiet';S.homePinned=true;render(5);paint(cur,0);break;
      case 'restart':var tt=document.getElementById('toast');if(tt){tt.classList.remove('on');tt.hidden=true}go(0);break;
      case 'copytry':try{navigator.clipboard.writeText('git clone https://github.com/mauyaa/zcashflight\ncd zcashflight && npm run demo').then(function(){a.textContent='Copied';setTimeout(function(){a.textContent='Copy'},2000)},function(){})}catch(x){}break;
      case 'copy':try{navigator.clipboard.writeText('zcashflight run --ci');a.textContent='Copied';setTimeout(function(){a.textContent='Copy the command'},2000)}catch(x){}break;
    }
  });
  document.addEventListener('keydown',function(e){
    if(e.key==='Escape'){var open=!pop.hidden?sb:!sp.hidden?document.getElementById('sealBtn'):null;closePop();if(open)open.focus();return}
    var g=e.target.closest&&e.target.closest('.pt');if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault();go(+g.dataset.go);return}
    if(e.target.id==='dir'&&e.key==='Enter'){e.preventDefault();chooseOwn();return}
    if((e.key==='PageDown'||e.key==='PageUp')&&e.target.id==='dir'){e.preventDefault();go(S.i+(e.key==='PageDown'?1:-1));return}
    if(document.activeElement&&document.activeElement.tagName==='INPUT')return;
    if(e.target.closest&&e.target.closest('input,textarea,select,[contenteditable]'))return;
    var t=T[S.i],fwd=e.key==='ArrowRight'||e.key==='PageDown'||(e.key==='ArrowDown'&&!canScroll(t,1)),back=e.key==='ArrowLeft'||e.key==='PageUp'||(e.key==='ArrowUp'&&!canScroll(t,-1));
    if(fwd){e.preventDefault();if(S.i===N-1)edge(1);else go(S.i+1)}else if(back){e.preventDefault();if(S.i===0)edge(-1);else go(S.i-1)}
  });
  var sx=null,sy=null;
  stage.addEventListener('touchstart',function(e){sx=e.touches[0].clientX;sy=e.touches[0].clientY},{passive:true});
  stage.addEventListener('touchend',function(e){if(sx==null)return;var dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>60&&Math.abs(dx)>Math.abs(dy)*1.4)go(S.i+(dx<0?1:-1));sx=null},{passive:true});
  var acc=0,lastWheel=0,lockUntil=0;
  function canScroll(t,dir){if(!t)return false;return dir>0?t.scrollTop+t.clientHeight<t.scrollHeight-1:t.scrollTop>0}
  addEventListener('wheel',function(e){
    if(e.ctrlKey||e.target.closest('.pop,.sealpop'))return;               // pinch-zoom and open menus keep their own scrolling
    var d=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;if(!d)return;
    if(Math.abs(e.deltaY)>=Math.abs(e.deltaX)&&canScroll(e.target.closest('.text'),e.deltaY))return; // long pages read first
    var n=Date.now();if(n<lockUntil)return;if(n-lastWheel>220)acc=0;lastWheel=n;
    acc+=e.deltaMode===1?d*16:d;if(Math.abs(acc)<55)return;
    var to=S.i+(acc>0?1:-1);acc=0;if(to<0||to>N-1){lockUntil=n+1400;edge(to<0?-1:1);return}lockUntil=n+(reduce?250:900);go(to);
  },{passive:true});

  /* ================= start ================= */
  load().then(function(){
    if(!LIVE){document.getElementById('scenes').hidden=false;pop.innerHTML=ST.map(function(s,k){return s[1]?'<button data-st="'+k+'">'+s[0]+'</button>':'<span class="g">'+s[0]+'</span>'}).join('')}
    seal();drawMode();
    var h=sts.findIndex(function(s){return '#'+s.dataset.name===location.hash});if(h>0&&h!==2)S.i=h;
    build();
    if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){build()});
    requestAnimationFrame(function(){requestAnimationFrame(function(){document.body.classList.add('ready')})});
    var rt;addEventListener('resize',function(){clearTimeout(rt);rt=setTimeout(build,120)});
  }).catch(function(err){
    T[0].innerHTML='<div class="swap"><h2>Couldn\'t load.</h2><p class="sub">'+esc(err&&err.message||err)+'</p></div>';
  });
})();
