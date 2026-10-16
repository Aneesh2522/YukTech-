(function(){
  'use strict';
  var form=document.getElementById('applyForm'); if(!form)return;
  var banner=document.getElementById('applyBanner'), err=document.getElementById('applyError'), btn=document.getElementById('applySubmit');
  var MAX=5*1024*1024, EXT=/\.(pdf|doc|docx)$/i;
  document.getElementById('applyNext').value=new URL('apply-thank-you.html',window.location.href).href;

  function showBanner(text,closed){
    banner.hidden=false; banner.textContent=''; banner.classList.toggle('apply-closed',!!closed);
    var p=document.createElement('p'); p.textContent=text; banner.appendChild(p);
    if(closed){var a=document.createElement('a');a.className='btn btn-outline';a.href='careers.html';a.textContent='View current openings';banner.appendChild(a);}
  }
  function showError(msg){err.textContent=msg;err.hidden=false;err.scrollIntoView({block:'center',behavior:'smooth'});}
  function lockForm(){Array.prototype.forEach.call(form.elements,function(el){el.disabled=true;});}

  // Which job? ?job=<id> comes from the Careers page Apply button.
  var jobId=new URLSearchParams(window.location.search).get('job');
  var cfg=window.YUKTECH_CONFIG||{};
  var ready=cfg.SUPABASE_URL&&cfg.SUPABASE_ANON_KEY&&cfg.SUPABASE_URL.indexOf('YOUR-PROJECT')===-1&&window.supabase;

  if(jobId){
    if(!/^[0-9a-f-]{36}$/i.test(jobId)){showBanner('This job link is not valid.',true);lockForm();}
    else if(ready){
      var client=window.supabase.createClient(cfg.SUPABASE_URL,cfg.SUPABASE_ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
      client.from('job_posts').select('id,title,location').eq('id',jobId).eq('status','published').maybeSingle().then(function(r){
        if(r.error||!r.data){showBanner('This position is no longer open or could not be found.',true);lockForm();return;}
        var title=r.data.title+(r.data.location?' ('+r.data.location+')':'');
        showBanner('You are applying for: '+title);
        document.getElementById('applyJobTitle').value=title;
        document.getElementById('applyJobRef').value=r.data.id;
        document.getElementById('applySubject').value='New Job Application - '+r.data.title;
      });
    } else { showBanner('We could not load the job details right now. You can still submit a general application.'); }
  } else { showBanner('You are submitting a general application.'); }

  form.addEventListener('submit',function(e){
    err.hidden=true;
    var f=document.getElementById('applyResume').files[0];
    if(!f){e.preventDefault();showError('Please attach your resume.');return;}
    if(!EXT.test(f.name)){e.preventDefault();showError('Resume must be a PDF, DOC or DOCX file.');return;}
    if(f.size>MAX){e.preventDefault();showError('Your resume is larger than 5 MB. Please upload a smaller file.');return;}
    btn.disabled=true; btn.firstChild.textContent='Submitting… ';
  });
})();
