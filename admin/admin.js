(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const cfg = window.YUKTECH_CONFIG;
  const loginPanel = $('#login-panel'), appPanel = $('#app-panel');
  let sb, currentUser, currentRole;
  const canReview = () => ['admin','reviewer'].includes(currentRole);
  const canEdit = () => ['admin','editor'].includes(currentRole);
  const isAdmin = () => currentRole === 'admin';
  const say = (message, error=false, target='#app-message') => { const el=$(target); if(el){el.textContent=message;el.classList.toggle('error',error);} };
  const esc = (s='') => String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const statusTag = (s) => `<span class="status ${esc(s)}">${esc(s.replace('_',' '))}</span>`;
  const safeUrl = (url) => {try {const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:'#';} catch{return '#';}};
  async function init(){
    if(!cfg || !cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes('YOUR-PROJECT') || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes('YOUR_')) {say('Setup required: copy config.example.js to config.js and add your Supabase URL and publishable/anon key.',true,'#login-message');return;}
    sb = window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    $('#login-form').addEventListener('submit',async e=>{e.preventDefault();say('Signing in…',false,'#login-message');const {error}=await sb.auth.signInWithPassword({email:$('#login-email').value.trim(),password:$('#login-password').value});if(error)say(error.message,true,'#login-message');});
    sb.auth.onAuthStateChange((_event,session)=>{if(session) setTimeout(()=>loadApp(session.user),0);else showLogin();});
    const {data:{session}}=await sb.auth.getSession(); if(session) await loadApp(session.user); else showLogin();
  }
  function showLogin(){loginPanel.hidden=false;appPanel.hidden=true;currentUser=null;currentRole=null;}
  async function loadApp(user){
    const {data:roleRow,error}=await sb.from('user_roles').select('role').eq('user_id',user.id).maybeSingle();
    if(error||!roleRow){await sb.auth.signOut();showLogin();say('This account has no YUKTECH role. Ask an administrator to assign one.',true,'#login-message');return;}
    currentUser=user;currentRole=roleRow.role;loginPanel.hidden=true;appPanel.hidden=false;
    $('#user-summary').textContent=`Signed in as ${user.email} · Role: ${currentRole}`;
    document.querySelectorAll('.admin-only').forEach(el=>el.hidden=!isAdmin());
    document.querySelectorAll('[data-tab=media]').forEach(el=>el.hidden=!canEdit());
    $('#new-content').hidden=!canEdit(); $('#new-job').hidden=!canEdit();
    document.querySelectorAll('.reviewer-only').forEach(el=>el.hidden=!canReview());
    document.querySelectorAll('[data-tab="review"]').forEach(el=>el.hidden=!canReview());
    document.querySelectorAll('[data-tab="users"]').forEach(el=>el.hidden=!isAdmin());
    document.querySelectorAll('[data-tab]').forEach(btn=>{btn.onclick=()=>switchTab(btn.dataset.tab);});
    bindForms(); await refreshAll(); switchTab('overview');
  }
  function switchTab(name){document.querySelectorAll('.tab-panel').forEach(p=>p.hidden=p.id!==`tab-${name}`);document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));if(name==='review')loadReview();if(name==='settings')loadSettings();if(name==='users'&&isAdmin())loadRoles();}
  let formsBound=false;
  function bindForms(){if(formsBound)return;formsBound=true;
    $('#signout-button').addEventListener('click',()=>sb.auth.signOut());
    $('#new-content').addEventListener('click',()=>openContent());$('#cancel-content').addEventListener('click',()=>$('#content-form').hidden=true);
    $('#content-form').addEventListener('submit',saveContent);$('#new-job').addEventListener('click',()=>openJob());$('#cancel-job').addEventListener('click',()=>$('#job-form').hidden=true);$('#job-form').addEventListener('submit',saveJob);
    $('#media-form').addEventListener('submit',uploadMedia);$('#copy-media-url').addEventListener('click',async()=>{await navigator.clipboard.writeText($('#media-url').value);say('Image URL copied.');});
    $('#role-form').addEventListener('submit',saveRole);
  }
  async function refreshAll(){await Promise.all([loadContent(),loadJobs(),loadMedia(),loadStats()]);}
  async function loadStats(){const [j,d,r]=await Promise.all([sb.from('job_posts').select('id',{count:'exact',head:true}).eq('status','published'),sb.from('cms_content').select('id',{count:'exact',head:true}).in('status',['draft','rejected']),sb.from('cms_content').select('id',{count:'exact',head:true}).eq('status','in_review')]);$('#stat-jobs').textContent=j.count??'—';$('#stat-drafts').textContent=d.count??'—';$('#stat-review').textContent=(r.count??0);}
  async function loadContent(){const {data,error}=await sb.from('cms_content').select('*').order('updated_at',{ascending:false});if(error){say(error.message,true);return;}const list=$('#content-list');list.replaceChildren();if(!data.length){list.textContent='No content fields yet. Create one to start building the CMS content library.';return;}data.forEach(row=>{const card=document.createElement('article');card.className='record';card.innerHTML=`<div><h3>${esc(row.content_key)}</h3><p>${esc(row.content_type)} · ${statusTag(row.status)}</p><p>${esc(row.content_value.slice(0,260))}</p></div><div class="record-actions">${canEdit()?'<button class="small-btn" data-edit>Edit</button>':''}${canEdit()&&['draft','rejected'].includes(row.status)?'<button class="small-btn publish" data-submit>Submit for review</button>':''}${canReview()&&row.status==='in_review'?'<button class="small-btn publish" data-publish>Publish</button><button class="small-btn reject" data-reject>Reject</button>':''}</div>`;card.querySelector('[data-edit]').onclick=()=>openContent(row);if(card.querySelector('[data-submit]'))card.querySelector('[data-submit]').onclick=()=>submitForReview('cms_content',row.id);if(card.querySelector('[data-publish]'))card.querySelector('[data-publish]').onclick=()=>approve('cms_content',row.id);if(card.querySelector('[data-reject]'))card.querySelector('[data-reject]').onclick=()=>reject('cms_content',row.id);list.append(card);});}
  function openContent(row){$('#content-form').hidden=false;const publishedVersion=row?.status==='published';$('#content-id').value=publishedVersion?'':(row?.id||'');$('#content-key').value=row?.content_key||'';$('#content-key').disabled=false;$('#content-type').value=row?.content_type||'text';$('#content-value').value=row?.content_value||'';$('#content-form').scrollIntoView({behavior:'smooth',block:'center'});}
  async function loadPageFields(){
    const page=$('#page-picker').value, host=$('#page-fields'); host.replaceChildren(); if(!page)return;
    host.textContent='Loading page fields…';
    try{
      const res=await fetch('../'+page+'.html',{cache:'no-store'}); if(!res.ok)throw new Error('Page not found');
      const doc=new DOMParser().parseFromString(await res.text(),'text/html');
      const {data:rows}=await sb.from('cms_content').select('content_key,status').in('status',['draft','in_review','published']);
      const state=new Map(); (rows||[]).forEach(r=>{const o=state.get(r.content_key)||[];o.push(r.status);state.set(r.content_key,o);});
      host.replaceChildren();
      doc.querySelectorAll('[data-cms-key],[data-cms-image]').forEach(el=>{
        const isImg=el.hasAttribute('data-cms-image'); const key=isImg?el.dataset.cmsImage:el.dataset.cmsKey;
        if(key==='site.logo'&&page!=='index')return; // logo/photo are shared site-wide; show once on Home
        const current=isImg?(el.getAttribute('src')||''):el.textContent.trim().replace(/\s+/g,' ');
        const card=document.createElement('article'); card.className='record';
        const st=state.get(key); const badge=st?statusTag(st.includes('published')?'published':st[0]):'<span class="status">not edited</span>';
        card.innerHTML=`<div><h3>${esc(key)}</h3><p>${isImg?'image':esc(el.tagName.toLowerCase())} · ${badge}</p><p>${esc(current.slice(0,200))}</p></div><div class="record-actions">${canEdit()?'<button class="small-btn">Edit</button>':''}</div>`;
        const btn=card.querySelector('button'); if(btn)btn.onclick=async()=>{
          const {data}=await sb.from('cms_content').select('*').eq('content_key',key).order('updated_at',{ascending:false}).limit(1);
          openContent(data&&data[0]?data[0]:{content_key:key,content_type:isImg?'image_url':'text',content_value:current});
        };
        host.append(card);
      });
      if(!host.children.length)host.textContent='No editable fields found on this page.';
    }catch(err){host.textContent='Could not load page: '+err.message;}
  }
  $('#page-picker').addEventListener('change',loadPageFields);
  /* ---------- Site settings (admin only) ---------- */
  const SETTINGS=[
    {group:'Company',items:[
      {key:'site.company.name',label:'Company name (footer copyright line)',def:'YUKTECH',type:'text'},
      {key:'site.email',label:'Public email address',def:'info@yuktech.net',type:'email',help:'Shown in the footer on every page and on the Contact page.'},
      {key:'site.linkedin',label:'LinkedIn page URL',def:'https://www.linkedin.com/company/yuktech/home/',type:'url'}]},
    {group:'United States office (Contact page)',items:[
      {key:'site.us.label',label:'Office heading',def:'UNITED STATES OFFICE',type:'text'},
      {key:'site.us.address',label:'Address',def:'314 E Highland Mall Blvd STE 505,\nAustin, TX 78752, USA',type:'textarea',help:'Put each line of the address on its own line. The "Get directions" link updates automatically.'},
      {key:'site.us.phone',label:'Phone',def:'+1 818 312 1406',type:'tel'}]},
    {group:'India office (Contact page)',items:[
      {key:'site.india.label',label:'Office heading',def:'INDIA OFFICE',type:'text'},
      {key:'site.india.address',label:'Address',def:'No. 306, Block B-158, Sector 63,\nNoida, Uttar Pradesh 201309, India',type:'textarea'},
      {key:'site.india.phone',label:'Phone',def:'+91 63797 95204',type:'tel'}]},
    {group:'Footer',items:[
      {key:'site.footer.tagline',label:'Footer tagline (under the logo)',def:'',type:'text',help:'Leave blank to keep the wording each page already has. Fill it in to use one tagline on every page.'},
      {key:'site.footer.motto',label:'Footer line (bottom right)',def:'People × Process × Technology.',type:'text'}]},
    {group:'Announcement banner (top of every page)',items:[
      {key:'site.banner.text',label:'Banner message',def:'',type:'text',help:'Leave blank to show no banner. Example: "We are hiring - see our open roles."'},
      {key:'site.banner.link',label:'Banner link (optional)',def:'',type:'text',help:'A page such as careers.html, or a full https:// address.'},
      {key:'site.banner.linklabel',label:'Banner link text (optional)',def:'',type:'text',help:'Example: View openings'}]}
  ];
  let settingsRows=new Map(),settingsBuilt=false;
  const settingId=k=>'set-'+k.replace(/\./g,'-');
  function buildSettingsForm(){
    const host=$('#settings-fields');host.replaceChildren();
    SETTINGS.forEach(g=>{
      const fs=document.createElement('fieldset');fs.className='settings-group';
      const lg=document.createElement('legend');lg.textContent=g.group;fs.append(lg);
      g.items.forEach(it=>{
        const lab=document.createElement('label');lab.htmlFor=settingId(it.key);lab.append(document.createTextNode(it.label));
        const inp=it.type==='textarea'?document.createElement('textarea'):document.createElement('input');
        if(it.type==='textarea')inp.rows=3;else inp.type=it.type==='email'?'email':(it.type==='tel'?'tel':'text');
        inp.id=settingId(it.key);inp.dataset.key=it.key;inp.maxLength=it.type==='textarea'?300:200;
        if(!it.def&&it.key.indexOf('banner')===-1)inp.placeholder='Using the text built into each page';
        lab.append(inp);fs.append(lab);
        if(it.help){const h=document.createElement('small');h.className='setting-help';h.textContent=it.help;fs.append(h);}
      });
      host.append(fs);
    });
    settingsBuilt=true;
  }
  async function loadSettings(){
    if(!isAdmin())return;
    if(!settingsBuilt)buildSettingsForm();
    const {data,error}=await sb.from('cms_content').select('id,content_key,content_value,updated_at').like('content_key','site.%').eq('status','published').order('updated_at',{ascending:false});
    if(error){say(error.message,true);return;}
    settingsRows=new Map();(data||[]).forEach(r=>{if(!settingsRows.has(r.content_key))settingsRows.set(r.content_key,r);});
    SETTINGS.forEach(g=>g.items.forEach(it=>{const f=document.getElementById(settingId(it.key));if(f){const r=settingsRows.get(it.key);f.value=r?r.content_value:it.def;}}));
  }
  function settingError(it,v){
    if(!v)return '';
    if(it.type==='email'&&!/^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v))return it.label+': enter a valid email address.';
    if(it.type==='tel'&&!/^\+?[\d\s().-]{6,25}$/.test(v))return it.label+': use digits, spaces and + only.';
    if(it.type==='url'){try{const u=new URL(v);if(!['https:','http:'].includes(u.protocol))throw 0;}catch{return it.label+': enter a full address starting with https://';}}
    if(it.key==='site.banner.link'&&!/^[\w./-]+\.html(#[\w-]*)?$/.test(v)){try{const u=new URL(v);if(!['https:','http:'].includes(u.protocol))throw 0;}catch{return it.label+': use a page such as careers.html or a full https:// address.';}}
    return '';
  }
  async function saveSettings(e){
    e.preventDefault();if(!isAdmin())return;
    const plan=[];
    for(const g of SETTINGS)for(const it of g.items){
      const v=document.getElementById(settingId(it.key)).value.replace(/\r/g,'').trim();
      const msg=settingError(it,v);if(msg){say(msg,true);return;}
      plan.push({it,v});
    }
    const btn=$('#settings-save');btn.disabled=true;say('Saving settings…');
    let changed=0;
    try{
      for(const {it,v} of plan){
        const existing=settingsRows.get(it.key);
        if(!v||v===it.def){
          if(existing){const {error}=await sb.from('cms_content').delete().eq('content_key',it.key);if(error)throw error;changed++;}
          continue;
        }
        if(existing){
          if(existing.content_value===v)continue;
          const {error}=await sb.from('cms_content').update({content_value:v,updated_by:currentUser.id}).eq('id',existing.id);if(error)throw error;
        }else{
          const ins=await sb.from('cms_content').insert({content_key:it.key,content_value:v,content_type:'text',status:'draft',created_by:currentUser.id,updated_by:currentUser.id}).select('id').single();
          if(ins.error)throw ins.error;
          const now=new Date().toISOString();
          const up=await sb.from('cms_content').update({status:'published',approved_by:currentUser.id,approved_at:now,updated_by:currentUser.id}).eq('id',ins.data.id);
          if(up.error)throw up.error;
        }
        changed++;
      }
      if(changed)await sb.from('audit_log').insert({actor_id:currentUser.id,action:'update_settings',entity_type:'cms_content',entity_id:'site settings',details:{changed}});
      say(changed?('Saved. '+changed+' setting'+(changed===1?'':'s')+' updated. Refresh the website to see the changes.'):'Nothing to change.');
      await loadSettings();
    }catch(err){say(err.message||String(err),true);}
    btn.disabled=false;
  }
  $('#settings-form').addEventListener('submit',saveSettings);
  $('#settings-reload').addEventListener('click',loadSettings);
  async function saveContent(e){e.preventDefault();const id=$('#content-id').value;const payload={content_key:$('#content-key').value.trim(),content_type:$('#content-type').value,content_value:$('#content-value').value,status:'draft',updated_by:currentUser.id};let res;if(id){res=await sb.from('cms_content').update(payload).eq('id',id);}else{payload.created_by=currentUser.id;res=await sb.from('cms_content').insert(payload);}if(res.error){say(res.error.message,true);return;}await sb.from('audit_log').insert({actor_id:currentUser.id,action:id?'edit_draft':'create_draft',entity_type:'cms_content',entity_id:id||payload.content_key});$('#content-form').hidden=true;say('Draft saved. Use Submit for review when ready.');await refreshAll();}
  async function loadJobs(){const {data,error}=await sb.from('job_posts').select('*').order('updated_at',{ascending:false});if(error){say(error.message,true);return;}const list=$('#job-list');list.replaceChildren();if(!data.length){list.textContent='No job postings yet. Select “Add job” to create the first draft.';return;}data.forEach(row=>{const card=document.createElement('article');card.className='record';card.innerHTML=`<div><h3>${esc(row.title)}</h3><p>${esc(row.location)} · ${esc(row.work_type)} · ${statusTag(row.status)}</p><p>${esc(row.experience)} · ${esc(row.external_board)} · ${esc(row.description.slice(0,180))}</p></div><div class="record-actions">${canEdit()?'<button class="small-btn" data-edit>Edit</button>':''}${canEdit()&&['draft','rejected'].includes(row.status)?'<button class="small-btn publish" data-submit>Submit for review</button>':''}${canReview()&&row.status==='in_review'?'<button class="small-btn publish" data-publish>Publish</button><button class="small-btn reject" data-reject>Reject</button>':''}${row.status==='published'&&canReview()?'<button class="small-btn" data-close>Close</button>':''}${row.status==='published'&&canReview()&&row.external_board!=='website'?'<button class="small-btn publish" data-dispatch>Send to ATS</button>':''}</div>`;if(card.querySelector('[data-edit]'))card.querySelector('[data-edit]').onclick=()=>openJob(row);if(card.querySelector('[data-submit]'))card.querySelector('[data-submit]').onclick=()=>submitForReview('job_posts',row.id);if(card.querySelector('[data-publish]'))card.querySelector('[data-publish]').onclick=()=>approve('job_posts',row.id);if(card.querySelector('[data-reject]'))card.querySelector('[data-reject]').onclick=()=>reject('job_posts',row.id);if(card.querySelector('[data-close]'))card.querySelector('[data-close]').onclick=()=>closeJob(row.id);if(card.querySelector('[data-dispatch]'))card.querySelector('[data-dispatch]').onclick=()=>dispatchJob(row.id);list.append(card);});}
  function openJob(row){$('#job-form').hidden=false;const liveVersion=row?.status==='published';$('#job-id').value=liveVersion?'':(row?.id||'');$('#job-supersedes-id').value=liveVersion?row.id:(row?.supersedes_id||'');$('#job-title').value=row?.title||'';$('#job-department').value=row?.department||'Technology';$('#job-location').value=row?.location||'';$('#job-work-type').value=row?.work_type||'Full-time';$('#job-experience').value=row?.experience||'';$('#job-board').value=row?.external_board||'website';$('#job-description').value=row?.description||'';$('#job-apply-url').value=row?.apply_url||'';$('#job-form').scrollIntoView({behavior:'smooth',block:'center'});}
  async function saveJob(e){e.preventDefault();const id=$('#job-id').value;const payload={title:$('#job-title').value.trim(),department:$('#job-department').value.trim(),location:$('#job-location').value.trim(),work_type:$('#job-work-type').value,experience:$('#job-experience').value.trim(),external_board:$('#job-board').value,description:$('#job-description').value.trim(),apply_url:$('#job-apply-url').value.trim(),supersedes_id:$('#job-supersedes-id').value||null,status:'draft',updated_by:currentUser.id};let res;if(id){res=await sb.from('job_posts').update(payload).eq('id',id);}else{payload.created_by=currentUser.id;res=await sb.from('job_posts').insert(payload);}if(res.error){say(res.error.message,true);return;}await sb.from('audit_log').insert({actor_id:currentUser.id,action:id?'edit_job_draft':'create_job_draft',entity_type:'job_posts',entity_id:id||payload.title});$('#job-form').hidden=true;say('Job draft saved. Submit it for review before publication.');await refreshAll();}
  async function submitForReview(table,id){const {error}=await sb.from(table).update({status:'in_review',updated_by:currentUser.id}).eq('id',id);if(error){say(error.message,true);return;}say('Submitted for review.');await refreshAll();if(canReview())await loadReview();}
  async function approve(table,id){if(!canReview())return;const now=new Date().toISOString();if(table==='job_posts'){const {data:targetJob}=await sb.from('job_posts').select('supersedes_id').eq('id',id).single();if(targetJob?.supersedes_id){const {error:closeOldError}=await sb.from('job_posts').update({status:'closed',updated_by:currentUser.id}).eq('id',targetJob.supersedes_id);if(closeOldError){say(closeOldError.message,true);return;}}}if(table==='cms_content'){const {data:target,error:readError}=await sb.from('cms_content').select('content_key').eq('id',id).single();if(readError){say(readError.message,true);return;}const {error:oldError}=await sb.from('cms_content').update({status:'draft'}).eq('content_key',target.content_key).eq('status','published');if(oldError){say(oldError.message,true);return;}}const patch=table==='job_posts'?{status:'published',approved_by:currentUser.id,approved_at:now,published_at:now,updated_by:currentUser.id}:{status:'published',approved_by:currentUser.id,approved_at:now,updated_by:currentUser.id};const {error}=await sb.from(table).update(patch).eq('id',id);if(error){say(error.message,true);return;}await sb.from('audit_log').insert({actor_id:currentUser.id,action:'publish',entity_type:table,entity_id:id});say('Published. Public pages show this only after their CMS rendering integration is configured.');await refreshAll();await loadReview();}
  async function reject(table,id){if(!canReview())return;const {error}=await sb.from(table).update({status:'rejected',updated_by:currentUser.id}).eq('id',id);if(error){say(error.message,true);return;}await sb.from('audit_log').insert({actor_id:currentUser.id,action:'reject',entity_type:table,entity_id:id});say('Item returned to the editor as rejected.');await refreshAll();await loadReview();}
  async function closeJob(id){const {error}=await sb.from('job_posts').update({status:'closed',updated_by:currentUser.id}).eq('id',id);if(error){say(error.message,true);return;}say('Job closed.');await refreshAll();}
  async function loadReview(){if(!canReview())return;const [c,j]=await Promise.all([sb.from('cms_content').select('*').eq('status','in_review'),sb.from('job_posts').select('*').eq('status','in_review')]);const list=$('#review-list');list.replaceChildren();if(c.error||j.error){list.textContent=(c.error||j.error).message;return;}const rows=[...(c.data||[]).map(x=>({...x,_table:'cms_content',_label:'Content'})),...(j.data||[]).map(x=>({...x,_table:'job_posts',_label:'Job'}))];if(!rows.length){list.textContent='The review queue is empty.';return;}rows.forEach(row=>{const card=document.createElement('article');card.className='record';const title=row._table==='job_posts'?row.title:row.content_key;const body=row._table==='job_posts'?`${row.location} · ${row.work_type}\n${row.description}`:row.content_value;card.innerHTML=`<div><h3>${esc(row._label)}: ${esc(title)}</h3><p>${statusTag(row.status)} · ${esc(row.content_type||row.external_board||'')}</p><p>${esc(body.slice(0,900))}</p></div><div class="record-actions"><button class="small-btn publish" data-publish>Approve & publish</button><button class="small-btn reject" data-reject>Reject</button></div>`;card.querySelector('[data-publish]').onclick=()=>approve(row._table,row.id);card.querySelector('[data-reject]').onclick=()=>reject(row._table,row.id);list.append(card);});}
  async function uploadMedia(e){e.preventDefault();const file=$('#media-file').files[0];if(!file)return;if(file.size>5*1024*1024){say('Choose an image under 5 MB.',true);return;}if(!['image/jpeg','image/png','image/webp','image/gif'].includes(file.type)){say('Unsupported image type.',true);return;}const path=`${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;const {error}=await sb.storage.from('site-media').upload(path,file,{upsert:false,contentType:file.type});if(error){say(error.message,true);return;}const {data}=sb.storage.from('site-media').getPublicUrl(path);$('#media-url').value=data.publicUrl;$('#media-url-wrap').hidden=false;say('Image uploaded. Add its URL as an image_url content field and submit for review.');$('#media-file').value='';await loadMedia();}
  async function loadMedia(){const {data,error}=await sb.storage.from('site-media').list('',{limit:100,sortBy:{column:'created_at',order:'desc'}});if(error)return;const list=$('#media-list');list.replaceChildren();(data||[]).filter(x=>x.name).forEach(file=>{const {data:u}=sb.storage.from('site-media').getPublicUrl(file.name);const card=document.createElement('div');card.className='media-card';const img=document.createElement('img');img.src=u.publicUrl;img.alt=file.name;img.loading='lazy';const a=document.createElement('a');a.href=u.publicUrl;a.target='_blank';a.rel='noopener';a.textContent=file.name;const copy=document.createElement('button');copy.className='small-btn';copy.textContent='Copy URL';copy.onclick=async()=>{await navigator.clipboard.writeText(u.publicUrl);say('Image URL copied.');};card.append(img,a,copy);list.append(card);});}
  async function loadRoles(){if(!isAdmin())return;const {data,error}=await sb.from('user_roles').select('user_id,role,created_at').order('created_at',{ascending:false});const list=$('#role-list');list.replaceChildren();if(error){list.textContent=error.message;return;}(data||[]).forEach(row=>{const el=document.createElement('article');el.className='record';const info=document.createElement('div');const h=document.createElement('h3');h.textContent = row.user_id;const p=document.createElement('p');p.textContent=`Role: ${row.role}`;info.append(h,p);const btn=document.createElement('button');btn.className='small-btn reject';btn.textContent='Remove role';btn.onclick=async()=>{if(row.user_id===currentUser.id){say('You cannot remove your own role from this session.',true);return;}if(!confirm('Remove this user’s admin-panel access?'))return;const {error}=await sb.from('user_roles').delete().eq('user_id',row.user_id);if(error)say(error.message,true);else{say('Role removed.');loadRoles();}};el.append(info,btn);list.append(el);});}
  async function saveRole(e){e.preventDefault();if(!isAdmin())return;const userId=$('#role-user-id').value.trim();const role=$('#role-value').value;const {error}=await sb.from('user_roles').upsert({user_id:userId,role},{onConflict:'user_id'});if(error){say(error.message,true);return;}await sb.from('audit_log').insert({actor_id:currentUser.id,action:'assign_role',entity_type:'user_roles',entity_id:userId,details:{role}});$('#role-user-id').value='';say('Role saved.');await loadRoles();}
  init();
})();
