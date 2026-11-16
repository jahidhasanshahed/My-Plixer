'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const bn = n => Number(n).toLocaleString('bn-BD');
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LS = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};
const fmtDur = s => {
  s = Math.round(s || 0);
  const m = Math.floor(s / 60), r = s % 60;
  return bn(m) + ':' + (r < 10 ? '০' : '') + bn(r).replace(/^০(?=\d)/, '');
};
const fmtDate = t => new Date(t).toLocaleDateString('bn-BD', { year: 'numeric', month: 'short', day: 'numeric' });
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= IndexedDB (ভিডিও ও অ্যাড ফাইল) ================= */
let db;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('videohub', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('videos', { keyPath: 'id' });
      d.createObjectStore('ads', { keyPath: 'slot' });
    };
    r.onsuccess = () => { db = r.result; res(); };
    r.onerror = () => rej(r.error);
  });
}
function tx(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const rq = fn(t.objectStore(store));
    t.oncomplete = () => res(rq && rq.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}
const dbPut = (s, v) => tx(s, 'readwrite', o => o.put(v));
const dbAll = s => tx(s, 'readonly', o => o.getAll());
const dbGet = (s, k) => tx(s, 'readonly', o => o.get(k));
const dbDel = (s, k) => tx(s, 'readwrite', o => o.delete(k));
const dbCount = s => tx(s, 'readonly', o => o.count());

/* ================= ইউজার ও রেফার ================= */
let users = LS.get('vh_users', []);
let views = LS.get('vh_views', []);
let me = null;

function refBase() { return location.href.split('?')[0].split('#')[0]; }

function initUser() {
  const ref = new URLSearchParams(location.search).get('ref');
  if (ref) LS.set('vh_pendingRef', ref.toUpperCase());
  me = users.find(u => u.id === LS.get('vh_me', '')) || null;
  if (!me) {
    const pr = LS.get('vh_pendingRef', '');
    const referrer = users.find(u => u.code === pr);
    if (referrer) $('#joinNote').textContent = referrer.name + ' আপনাকে আমন্ত্রণ জানিয়েছেন। নাম লিখে যুক্ত হোন।';
    $('#joinModal').classList.remove('hidden');
  } else renderUserChip();
}

$('#joinForm').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#joinName').value.trim();
  if (!name) return;
  const pr = LS.get('vh_pendingRef', '');
  const referrer = users.find(u => u.code === pr);
  me = {
    id: uid(), name,
    code: uid().slice(0, 6).toUpperCase(),
    refBy: referrer ? referrer.code : null,
    joinedAt: Date.now()
  };
  users.push(me);
  LS.set('vh_users', users);
  LS.set('vh_me', me.id);
  localStorage.removeItem('vh_pendingRef');
  $('#joinModal').classList.add('hidden');
  renderUserChip();
  refreshTab(currentTab);
  toast('স্বাগতম, ' + name + '!');
});

function renderUserChip() {
  $('#userChip').innerHTML = me
    ? `<span class="avatar">${esc(me.name.charAt(0).toUpperCase())}</span><span>${esc(me.name)}</span>`
    : '';
}

/* ================= ট্যাব ================= */
let currentTab = 'home';
function showTab(name) {
  currentTab = name;
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  refreshTab(name);
  window.scrollTo(0, 0);
}
function refreshTab(name) {
  if (name === 'home') renderHome();
  if (name === 'ads') renderAds();
  if (name === 'dashboard') renderDashboard();
  if (name === 'refer') renderRefer();
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-tab]');
  if (b) showTab(b.dataset.tab);
});
document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]');
  if (g) showTab(g.dataset.goto);
});

/* ================= হোম ================= */
const viewsOf = id => views.filter(v => v.vid === id).length;

async function renderHome() {
  const q = $('#search').value.trim().toLowerCase();
  let list = (await dbAll('videos')).sort((a, b) => b.createdAt - a.createdAt);
  $('#emptyHome').classList.toggle('hidden', list.length > 0);
  if (q) list = list.filter(v => v.title.toLowerCase().includes(q));
  $('#videoGrid').innerHTML = list.map(v => `
    <article class="vcard" data-id="${v.id}">
      <button class="del" data-del="${v.id}" title="মুছুন">🗑</button>
      <div class="vthumb">
        <img src="${v.thumb || ''}" alt="">
        <div class="play"><span>▶</span></div>
        <span class="dur">${fmtDur(v.duration)}</span>
      </div>
      <div class="vinfo">
        <h4>${esc(v.title)}</h4>
        <small>👁 ${bn(viewsOf(v.id))} ভিউ • ${fmtDate(v.createdAt)}</small>
      </div>
    </article>`).join('');
}
$('#search').addEventListener('input', renderHome);
$('#videoGrid').addEventListener('click', async e => {
  const d = e.target.closest('[data-del]');
  if (d) {
    e.stopPropagation();
    if (confirm('ভিডিওটি মুছে ফেলবেন?')) {
      await dbDel('videos', d.dataset.del);
      views = views.filter(v => v.vid !== d.dataset.del);
      LS.set('vh_views', views);
      renderHome();
      toast('ভিডিও মুছে ফেলা হয়েছে');
    }
    return;
  }
  const c = e.target.closest('.vcard');
  if (c) openPlayer(c.dataset.id);
});

/* ================= আপলোড ================= */
let upFile = null, thumbData = '', customThumb = false;
const prev = $('#prevVideo');
let prevUrl = null;

function setThumb(url) { thumbData = url; $('#thumbPrev').src = url; }
function captureFrame() {
  if (!prev.videoWidth) return;
  const c = document.createElement('canvas');
  const w = Math.min(prev.videoWidth, 640);
  c.width = w; c.height = Math.round(w * prev.videoHeight / prev.videoWidth);
  c.getContext('2d').drawImage(prev, 0, 0, c.width, c.height);
  setThumb(c.toDataURL('image/jpeg', .82));
}
function pickVideo(file) {
  if (!file || !file.type.startsWith('video/')) return toast('দয়া করে একটি ভিডিও ফাইল দিন');
  upFile = file; customThumb = false;
  if (prevUrl) URL.revokeObjectURL(prevUrl);
  prevUrl = URL.createObjectURL(file);
  prev.src = prevUrl;
  $('#thumbArea').classList.remove('hidden');
  $('#dzText').textContent = '✅ ' + file.name + ' (' + bn((file.size / 1048576).toFixed(1)) + ' MB)';
  if (!$('#vTitle').value) $('#vTitle').value = file.name.replace(/\.[^.]+$/, '');
}
prev.addEventListener('loadedmetadata', () => {
  $('#frameSlider').max = prev.duration || 100;
  prev.currentTime = Math.min(1, (prev.duration || 2) / 2);
});
prev.addEventListener('seeked', () => { if (!customThumb) captureFrame(); });
$('#frameSlider').addEventListener('input', e => { prev.currentTime = +e.target.value; });
$('#captureBtn').addEventListener('click', () => { customThumb = false; captureFrame(); toast('থামবেল সেট হয়েছে'); });
$('#thumbFile').addEventListener('change', e => {
  const f = e.target.files[0];
  if (!f) return;
  const r = new FileReader();
  r.onload = () => { customThumb = true; setThumb(r.result); toast('আপনার ছবি থামবেল হিসেবে সেট হয়েছে'); };
  r.readAsDataURL(f);
});
$('#videoFile').addEventListener('change', e => pickVideo(e.target.files[0]));
const dz = $('#dropzone');
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
dz.addEventListener('drop', e => pickVideo(e.dataTransfer.files[0]));

$('#uploadForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (!upFile) return toast('আগে ভিডিও ফাইল বেছে নিন');
  const btn = $('#saveBtn');
  btn.disabled = true; btn.textContent = 'সংরক্ষণ হচ্ছে...';
  try {
    await dbPut('videos', {
      id: uid(),
      title: $('#vTitle').value.trim(),
      desc: $('#vDesc').value.trim(),
      blob: upFile,
      thumb: thumbData,
      duration: prev.duration || 0,
      createdAt: Date.now(),
      adsOn: { pre: $('#adPre').checked, mid: $('#adMid').checked, post: $('#adPost').checked }
    });
    toast('ভিডিও পাবলিশ হয়েছে ✅');
    e.target.reset();
    upFile = null; thumbData = ''; $('#thumbPrev').removeAttribute('src');
    $('#thumbArea').classList.add('hidden');
    $('#dzText').textContent = 'ভিডিও ফাইল বেছে নিন (ক্লিক করুন বা টেনে আনুন)';
    showTab('home');
  } catch (err) {
    console.error(err);
    toast('সংরক্ষণ করা যায়নি (জায়গা কম হতে পারে)');
  }
  btn.disabled = false; btn.textContent = 'ভিডিও পাবলিশ করুন';
});

/* ================= অ্যাড সেটিংস ================= */
const SLOTS = [
  { k: 'pre', t: '▶ শুরুর অ্যাড', l: 'শুরুর অ্যাড' },
  { k: 'mid', t: '⏸ মাঝের অ্যাড', l: 'মাঝের অ্যাড' },
  { k: 'post', t: '⏹ শেষের অ্যাড', l: 'শেষের অ্যাড' }
];

async function renderAds() {
  const wrap = $('#adSlots');
  wrap.innerHTML = '';
  for (const s of SLOTS) {
    const ad = (await dbGet('ads', s.k)) ||
      { slot: s.k, enabled: false, kind: 'image', text: '', link: '', duration: 5, midPercent: 50 };
    const card = document.createElement('div');
    card.className = 'card adcard';
    card.innerHTML = `
      <h3>${s.t}
        <label class="switch"><input type="checkbox" class="a-en" ${ad.enabled ? 'checked' : ''}> চালু</label>
      </h3>
      <label class="lbl">অ্যাডের ধরন</label>
      <select class="a-kind">
        <option value="image" ${ad.kind === 'image' ? 'selected' : ''}>ছবি</option>
        <option value="video" ${ad.kind === 'video' ? 'selected' : ''}>ভিডিও</option>
        <option value="text" ${ad.kind === 'text' ? 'selected' : ''}>লেখা</option>
      </select>
      <div class="a-file-box">
        <label class="lbl">অ্যাড ফাইল</label>
        <input type="file" class="a-file" accept="image/*,video/*">
        <div class="fname">${ad.fileName ? 'বর্তমান: ' + esc(ad.fileName) : 'কোনো ফাইল নেই'}</div>
      </div>
      <div class="a-text-box">
        <label class="lbl">অ্যাডের লেখা</label>
        <textarea class="a-text" rows="3" placeholder="অ্যাডে যা দেখাবেন">${esc(ad.text)}</textarea>
      </div>
      <label class="lbl">ক্লিক করলে যে লিংকে যাবে (ঐচ্ছিক)</label>
      <input type="url" class="a-link" placeholder="https://..." value="${esc(ad.link)}">
      <label class="lbl">সময় (সেকেন্ড)</label>
      <input type="number" class="a-dur" min="1" max="60" value="${ad.duration || 5}">
      ${s.k === 'mid' ? `
        <label class="lbl">ভিডিওর কত শতাংশ চললে অ্যাড আসবে</label>
        <input type="number" class="a-mid" min="5" max="95" value="${ad.midPercent || 50}">` : ''}
      <button class="btn a-save">সেভ করুন</button>`;
    wrap.append(card);

    const kindSel = $('.a-kind', card);
    const syncKind = () => {
      $('.a-file-box', card).classList.toggle('hidden', kindSel.value === 'text');
      $('.a-text-box', card).classList.toggle('hidden', kindSel.value !== 'text');
      $('.a-file', card).accept = kindSel.value === 'video' ? 'video/*' : 'image/*';
    };
    kindSel.addEventListener('change', syncKind);
    syncKind();

    $('.a-save', card).addEventListener('click', async () => {
      const f = $('.a-file', card).files[0];
      ad.enabled = $('.a-en', card).checked;
      ad.kind = kindSel.value;
      ad.text = $('.a-text', card).value.trim();
      ad.link = $('.a-link', card).value.trim();
      ad.duration = Math.max(1, Math.min(60, +$('.a-dur', card).value || 5));
      if (s.k === 'mid') ad.midPercent = Math.max(5, Math.min(95, +$('.a-mid', card).value || 50));
      if (f) { ad.blob = f; ad.fileName = f.name; }
      if (ad.enabled && ad.kind !== 'text' && !ad.blob) return toast('আগে অ্যাডের ছবি/ভিডিও দিন');
      if (ad.enabled && ad.kind === 'text' && !ad.text) return toast('অ্যাডের লেখা দিন');
      await dbPut('ads', ad);
      toast(s.l + ' সেভ হয়েছে ✅');
      renderAds();
    });
  }
}

/* ================= প্লেয়ার + অ্যাড সিস্টেম ================= */
const mainVideo = $('#mainVideo');
let P = null; // বর্তমান প্লেয়ার স্টেট

async function openPlayer(id) {
  const rec = await dbGet('videos', id);
  if (!rec) return;
  const ads = await dbAll('ads');
  P = {
    rec, url: URL.createObjectURL(rec.blob),
    ads: Object.fromEntries(ads.map(a => [a.slot, a])),
    shown: {}, started: false, adActive: false, closed: false, cancelAd: null
  };
  $('#pTitle').textContent = rec.title;
  $('#pDesc').textContent = rec.desc || '';
  updateMeta();
  mainVideo.src = P.url;
  $('#playerModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function updateMeta() {
  if (!P) return;
  $('#pMeta').textContent = '👁 ' + bn(viewsOf(P.rec.id)) + ' ভিউ • ' + fmtDate(P.rec.createdAt);
}
function closePlayer() {
  if (!P) return;
  P.closed = true;
  if (P.cancelAd) P.cancelAd();
  mainVideo.pause();
  mainVideo.removeAttribute('src');
  mainVideo.load();
  URL.revokeObjectURL(P.url);
  P = null;
  $('#playerModal').classList.add('hidden');
  document.body.style.overflow = '';
  refreshTab(currentTab);
}
$('#closePlayer').addEventListener('click', closePlayer);
$('#playerModal').addEventListener('click', e => { if (e.target.id === 'playerModal') closePlayer(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && P) closePlayer(); });

function countView() {
  if (!P || !me) return;
  views.push({ vid: P.rec.id, uid: me.id, t: Date.now() });
  LS.set('vh_views', views);
  updateMeta();
}

function runAd(slot) {
  const cur = P;
  return new Promise(resolve => {
    const ad = cur.ads[slot];
    if (!ad || !ad.enabled || !(cur.rec.adsOn && cur.rec.adsOn[slot])) return resolve(false);
    if (ad.kind === 'text' ? !ad.text : !ad.blob) return resolve(false);

    const layer = $('#adLayer'), box = $('#adContent'), cd = $('#adCount');
    cur.adActive = true;
    mainVideo.pause();
    box.innerHTML = '';
    let objUrl = null, el;
    if (ad.kind === 'image') {
      objUrl = URL.createObjectURL(ad.blob);
      el = new Image(); el.src = objUrl;
    } else if (ad.kind === 'video') {
      objUrl = URL.createObjectURL(ad.blob);
      el = document.createElement('video');
      el.src = objUrl; el.playsInline = true; el.loop = true;
      el.play().catch(() => { el.muted = true; el.play().catch(() => { }); });
    } else {
      el = document.createElement('div');
      el.className = 'adtext';
      el.textContent = ad.text;
    }
    box.append(el);
    box.onclick = () => { if (ad.link) window.open(ad.link, '_blank', 'noopener'); };
    $('#adLabel').textContent = 'অ্যাড • ' + SLOTS.find(s => s.k === slot).l;
    layer.classList.remove('hidden');

    let left = ad.duration || 5;
    const label = () => {
      cd.textContent = slot === 'post'
        ? bn(left) + ' সেকেন্ড পরে অ্যাড শেষ হবে'
        : bn(left) + ' সেকেন্ড পরে ভিডিও চলবে';
    };
    label();
    let timer;
    const finish = () => {
      clearInterval(timer);
      layer.classList.add('hidden');
      box.innerHTML = '';
      box.onclick = null;
      if (objUrl) URL.revokeObjectURL(objUrl);
      cur.adActive = false;
      cur.cancelAd = null;
      resolve(true);
    };
    cur.cancelAd = finish;
    timer = setInterval(() => {
      left--;
      if (left <= 0 || cur.closed) finish(); else label();
    }, 1000);
  });
}

// ভিডিও চালু করলে: আগে শুরুর অ্যাড, তারপর ভিডিও
mainVideo.addEventListener('play', async () => {
  if (!P) return;
  const cur = P;
  if (cur.adActive) { mainVideo.pause(); return; }
  if (!cur.started) {
    cur.started = true;
    mainVideo.pause();
    cur.shown.pre = true;
    await runAd('pre');
    if (P !== cur || cur.closed) return;
    countView();
    mainVideo.play().catch(() => { });
  }
});

// মাঝের অ্যাড
mainVideo.addEventListener('timeupdate', async () => {
  if (!P || P.adActive || !P.started || P.shown.mid) return;
  const cur = P;
  const ad = cur.ads.mid;
  if (!ad || !ad.enabled || !(cur.rec.adsOn && cur.rec.adsOn.mid)) return;
  const dur = mainVideo.duration;
  if (!dur || !isFinite(dur)) return;
  const pct = ad.midPercent || 50;
  if (mainVideo.currentTime >= dur * pct / 100 && mainVideo.currentTime < dur - 0.4) {
    cur.shown.mid = true;
    await runAd('mid');
    if (P !== cur || cur.closed) return;
    mainVideo.play().catch(() => { });
  }
});

// শেষের অ্যাড
mainVideo.addEventListener('ended', async () => {
  if (!P || P.shown.post) return;
  const cur = P;
  cur.shown.post = true;
  await runAd('post');
});

/* ================= ড্যাশবোর্ড ================= */
function statCard(n, t) { return `<div class="stat"><div class="n">${bn(n)}</div><div class="t">${t}</div></div>`; }

async function renderDashboard() {
  const videos = (await dbAll('videos')).sort((a, b) => b.createdAt - a.createdAt);
  const viewers = new Set(views.map(v => v.uid)).size;
  $('#stats').innerHTML =
    statCard(videos.length, '🎬 মোট আপলোড করা ভিডিও') +
    statCard(views.length, '👁 মোট ভিউ') +
    statCard(viewers, '👥 যতজন ইউজার ভিডিও দেখেছে') +
    statCard(users.length, '✨ সাইটে যুক্ত হওয়া ইউজার');

  $('#videoTable').innerHTML = videos.length
    ? '<tr><th>ভিডিও</th><th>ভিউ</th><th>ইউনিক দর্শক</th></tr>' + videos.map(v => {
      const vv = views.filter(x => x.vid === v.id);
      return `<tr><td>${esc(v.title)}</td><td>${bn(vv.length)}</td><td>${bn(new Set(vv.map(x => x.uid)).size)}</td></tr>`;
    }).join('')
    : '<tr><td class="muted">কোনো ভিডিও নেই</td></tr>';

  $('#userTable').innerHTML = users.length
    ? '<tr><th>নাম</th><th>যোগদান</th><th>রেফার্ড বাই</th></tr>' + [...users].reverse().slice(0, 15).map(u => {
      const by = users.find(x => x.code === u.refBy);
      return `<tr><td>${esc(u.name)}</td><td>${fmtDate(u.joinedAt)}</td><td>${by ? esc(by.name) : '—'}</td></tr>`;
    }).join('')
    : '<tr><td class="muted">কোনো ইউজার নেই</td></tr>';
}

/* ================= রেফার ================= */
function renderRefer() {
  if (!me) return;
  $('#refLink').value = refBase() + '?ref=' + me.code;
  const mine = users.filter(u => u.refBy === me.code);
  $('#refStats').innerHTML =
    statCard(mine.length, '🔗 আপনার মাধ্যমে যুক্ত হয়েছে') +
    statCard(views.filter(v => mine.some(u => u.id === v.uid)).length, '👁 আপনার রেফারেলদের ভিউ');

  const rows = users.map(u => ({ u, c: users.filter(x => x.refBy === u.code).length }))
    .filter(r => r.c > 0).sort((a, b) => b.c - a.c);
  $('#refTable').innerHTML = rows.length
    ? '<tr><th>#</th><th>নাম</th><th>রেফার সংখ্যা</th></tr>' +
      rows.map((r, i) => `<tr><td>${bn(i + 1)}</td><td>${esc(r.u.name)}</td><td>${bn(r.c)}</td></tr>`).join('')
    : '<tr><td class="muted">এখনো কেউ রেফার করেনি</td></tr>';
}
$('#copyRef').addEventListener('click', async () => {
  const v = $('#refLink').value;
  try { await navigator.clipboard.writeText(v); }
  catch { $('#refLink').select(); document.execCommand('copy'); }
  toast('লিংক কপি হয়েছে ✅');
});

/* ================= শুরু ================= */
(async function init() {
  await openDB();
  initUser();
  const h = location.hash.replace('#', '');
  showTab(['home', 'upload', 'ads', 'dashboard', 'refer'].includes(h) ? h : 'home');
})();
