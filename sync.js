(() => {
  'use strict';
  const $=id=>document.getElementById(id),D=window.BoiData,legacyKey='boi_rewards_tracker_v1';
  let client,user=null,draft=null,busy=false,conflict=false,generation=0;
  const status=s=>$('syncStatus').textContent=s;
  const cacheKey=id=>'boi_private_draft_v2:'+id;
  const persist=()=>sessionStorage.setItem(cacheKey(user.id),JSON.stringify(draft));
  const legacy=()=>D.validate(JSON.parse(localStorage.getItem(legacyKey)));
  const showMigration=()=>{$('migration').hidden=!user||!localStorage.getItem(legacyKey);};
  function showError(){status(user?'Connection unavailable. Changes remain in this tab; export a backup before closing it. Retry with Sync now.':'Sign-in failed. Check your email or Supabase email settings, then retry.');}
  function save(v){
    const clean=D.validate(v);
    if(!user){if(window.BoiInvalidLegacy)throw Error('Export original storage first');localStorage.setItem(legacyKey,JSON.stringify(clean));return;}
    const next={...draft,state:clean,dirty:true};
    sessionStorage.setItem(cacheKey(user.id),JSON.stringify(next));draft=next;
    status(conflict?'Upload paused: newer cloud data exists. Export your unsent changes.':'Saved in this tab. Waiting to sync…');
    if(!conflict)void sync();
  }
  window.BoiSync={save};
  async function fetchCloud(id){
    const {data,error}=await client.from('reward_accounts').select('revision,state').eq('owner_id',id).maybeSingle();
    if(error)throw error;
    return data?{revision:data.revision,state:D.validate(data.state)}:{revision:0,state:D.empty()};
  }
  async function sync(){
    if(!user||!draft||busy||conflict)return;
    busy=true;const epoch=generation,id=user.id;
    try{
      if(draft.dirty){
        const sent=structuredClone(draft);
        const {data,error}=await client.rpc('save_rewards',{expected_revision:sent.revision,new_state:sent.state});
        if(epoch!==generation)return;
        if(error){if(error.code==='40001'){conflict=true;$('conflict').hidden=false;status('Newer data exists on another device. Automatic upload paused; export your unsent changes.');return;}throw error;}
        if(!Number.isSafeInteger(data))throw Error('Invalid server revision');
        draft.revision=data;
        if(JSON.stringify(draft.state)===JSON.stringify(sent.state))draft.dirty=false;
        persist();
      }else{
        const cloud=await fetchCloud(id);if(epoch!==generation)return;
        // An edit made while downloading must retain its old revision for conflict detection.
        if(!draft.dirty&&cloud.revision!==draft.revision){
          if(window.BoiTracker.isEditing?.()){status('New cloud data is available. Finish or cancel your transaction edit, then sync.');return;}
          draft={...cloud,dirty:false};persist();window.BoiTracker.set(draft.state);
        }
      }
      status(draft.dirty?'Local changes queued.':'Synced securely · '+new Date().toLocaleTimeString());
    }catch{if(epoch===generation)showError();}
    finally{busy=false;}
  }
  async function sessionChanged(session){
    const next=session?.user||null;
    if(next?.id===user?.id)return;
    generation++;user=next;draft=null;conflict=false;$('conflict').hidden=true;
    $('signIn').hidden=!!user;$('emailHelp').hidden=!!user;$('accountActions').hidden=!user;showMigration();
    if(!user){window.BoiTracker.set(legacy());status('Local mode. Browser data has not been uploaded.');return;}
    const epoch=generation;
    try{
      const saved=sessionStorage.getItem(cacheKey(user.id));
      if(saved){const parsed=JSON.parse(saved);if(!Number.isSafeInteger(parsed.revision)||parsed.revision<0||typeof parsed.dirty!=='boolean')throw Error('Invalid cache');draft={...parsed,state:D.validate(parsed.state)};}
      else draft={revision:0,state:D.empty(),dirty:false};
      window.BoiTracker.set(draft.state);status('Signed in as '+user.email+'. Loading private cloud data…');
      if(epoch===generation)void sync();
    }catch{status('Unable to read saved private draft. Keep this tab open and export any recoverable backup.');}
  }
  $('localBackup').onclick=()=>{try{D.download(legacy(),'boi-original-browser-backup');}catch{const raw=localStorage.getItem(legacyKey)||'';const a=document.createElement('a'),url=URL.createObjectURL(new Blob([raw],{type:'application/json'}));a.href=url;a.download='boi-original-unvalidated-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}};
  $('draftBackup').onclick=()=>D.download(draft.state,'boi-unsent-changes');
  $('migrate').onclick=async()=>{
    if(!user||!draft||busy||conflict)return;
    try{
      const source=legacy(),target=D.validate(draft.state);let total=0;
      // Merge stable transaction IDs; stop if a matching ID has different content.
      for(const [m,rows] of Object.entries(source.months)){
        const dest=target.months[m]||(target.months[m]=[]);
        for(const row of rows){const existing=dest.find(t=>t.id===row.id);if(existing&&JSON.stringify(existing)!==JSON.stringify(row))throw Error('A transaction differs between browser and cloud. Export both backups and resolve it before migration.');if(!existing){dest.push(row);total++;}}
      }
      for(const [m,values] of Object.entries(source.actual)){
        const dest=target.actual[m]||(target.actual[m]={});
        for(const [k,v] of Object.entries(values)){if(dest[k]!==undefined&&dest[k]!==v)throw Error('Credited rewards differ between browser and cloud. Export both backups before migration.');dest[k]=v;}
      }
      if(draft.revision===0)target.settings=source.settings;
      if(!confirm('Upload '+total+' additional transactions and browser credited rewards to your private Supabase account ('+user.email+')? Original browser data will remain here. Existing cloud assumptions are retained.'))return;
      D.download(source,'boi-before-migration');save(target);window.BoiTracker.set(target);
    }catch(e){alert(e.message);}
  };
  $('useCloud').onclick=async()=>{
    if(!user||busy)return;
    if(!confirm('Discard the unsent view in this tab and load the latest cloud version? Export unsent changes first.'))return;
    const epoch=generation;
    try{const cloud=await fetchCloud(user.id);if(epoch!==generation)return;D.download(draft.state,'boi-before-conflict-resolution');draft={...cloud,dirty:false};persist();conflict=false;$('conflict').hidden=true;window.BoiTracker.set(draft.state);status('Latest cloud version loaded.');}catch{showError();}
  };
  $('syncNow').onclick=()=>void sync();
  $('signOut').onclick=async()=>{
    if(busy){status('Wait for the current sync to finish, then sign out.');return;}
    if(draft?.dirty){D.download(draft.state,'boi-before-signout');if(!confirm('Unsent changes were exported and remain in this tab. Sign out now?'))return;}
    const {error}=await client.auth.signOut({scope:'local'});if(error){showError();return;}
    await sessionChanged(null);
  };
  $('signIn').onsubmit=async e=>{
    e.preventDefault();if(!client)return;
    const button=$('signIn').querySelector('button');button.disabled=true;
    try{const {error}=await client.auth.signInWithOtp({email:$('email').value.trim(),options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;status('Check your email. Open the sign-in link in this same browser on this device. No browser transactions have been uploaded.');}catch{showError();}finally{button.disabled=false;}
  };
  window.addEventListener('online',()=>void sync());
  window.addEventListener('focus',()=>void sync());
  window.addEventListener('beforeunload',e=>{if(draft?.dirty){e.preventDefault();e.returnValue='';}});
  const cfg=window.BOI_CONFIG;
  if(!cfg?.url||!cfg.publishableKey||!window.supabase){$('signIn').hidden=true;status('Local mode. Cloud setup is not configured yet. Export backups regularly.');return;}
  try{
    client=window.supabase.createClient(cfg.url,cfg.publishableKey,{auth:{flowType:'pkce',storage:sessionStorage,storageKey:'boi-auth-v2',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    client.auth.onAuthStateChange((_event,session)=>{setTimeout(()=>void sessionChanged(session),0);});
    client.auth.getSession().then(({data,error})=>{if(error){status('The sign-in link expired or was opened in another browser. Request a new link here.');return;}void sessionChanged(data.session);});
    setInterval(()=>{if(document.visibilityState==='visible')void sync();},15000);
  }catch{showError();}
})();
