import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import {
  getFirestore,
  collection,
  doc,
  query,
  where,
  onSnapshot,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  getDocFromServer,
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';

const firebaseConfig = {
  projectId: 'sanguine-triode-9v0ns',
  appId: '1:737165253516:web:012b0e166c5873e1b194a9',
  apiKey: 'AIzaSyDLyAP013fmEbhnQzE-MjQkfsRZBYR9xEY',
  authDomain: 'sanguine-triode-9v0ns.firebaseapp.com',
  firestoreDatabaseId: 'ai-studio-eaf4cfa2-2701-4391-98fd-7e4205e2b4f2',
  storageBucket: 'sanguine-triode-9v0ns.firebasestorage.app',
  messagingSenderId: '737165253516',
};

const OWNER_EMAIL = 'jahidhasan112328@gmail.com';
const ALLOWED_CATEGORIES = ['Short Film', 'Vlog', 'Tutorial', 'Showreel', 'Music & Audio', 'Archive'];
const ALLOWED_REF_CATEGORIES = ['Site Share', 'Partner Offer', 'App & Tool', 'Sponsor'];

const DEFAULT_CHANNEL = {
  channelName: 'My-Plixer',
  ownerName: 'Jahid Hasan',
  tagline: 'Curated films, edits, and personal video stories.',
  bio: 'My-Plixer is a private-creator, public-viewer video showcase. Visitors from anywhere can stream and explore every published film without an account, while uploads and catalog curation remain strictly locked to the verified creator.',
  visibility: 'public',
  ownerUid: '',
};

const DEFAULT_AD = {
  preRollEnabled: true,
  midRollEnabled: true,
  preRollSeconds: 5,
  midRollSeconds: 5,
  midRollPercent: 50,
  adTitle: 'Featured Partner Spotlight',
  adDescription: 'Your video is loading. Explore curated partner links and creator offers below.',
  adImageUrl: '',
  adClickUrl: '',
  adCtaText: 'Visit Partner',
  visibility: 'public',
  ownerUid: '',
};

const DEFAULT_POSTER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#14141b"/><stop offset="60%" stop-color="#0b0b0f"/><stop offset="100%" stop-color="#2a0a14"/></linearGradient></defs><rect width="800" height="450" fill="url(#g)"/><circle cx="400" cy="225" r="46" fill="#E11D48" fill-opacity="0.18" stroke="#E11D48" stroke-width="2"/><polygon points="390,205 390,245 424,225" fill="#F8FAFC"/><text x="400" y="315" text-anchor="middle" fill="#94A3B8" font-family="sans-serif" font-size="16" letter-spacing="4">MY-PLIXER CINEMA</text></svg>'
  );

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

const state = {
  user: null,
  authReady: false,
  isOwner: false,
  videos: [],
  videosLoading: true,
  channel: { ...DEFAULT_CHANNEL },
  channelExists: false,
  adSettings: { ...DEFAULT_AD },
  adExists: false,
  referrals: [],
  category: 'All',
  visibility: 'all',
  search: '',
  activeVideo: null,
  adPhase: 'playing',
  countdown: 0,
  midRollDone: false,
  pendingDeleteId: null,
  unsubVideos: null,
  unsubChannel: null,
  unsubAd: null,
  unsubRef: null,
  countdownTimer: null,
  ytMidTimer: null,
  toastTimer: null,
  deepLinkHandled: false,
};

const $ = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeUrl(url) {
  const val = String(url || '').trim();
  if (!val) return '';
  if (/^(https?:\/\/|\/)/i.test(val)) return val;
  return '';
}

function isOwnerUser(user) {
  return Boolean(
    user &&
      user.email &&
      user.emailVerified &&
      user.email.toLowerCase() === OWNER_EMAIL.toLowerCase()
  );
}

function showToast(msg) {
  const el = $('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => el.classList.remove('show'), 4000);
}

function handleFirestoreError(error, operationType, path) {
  const info = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    uid: auth.currentUser?.uid || null,
  };
  console.error('Firestore Error:', JSON.stringify(info));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (err) {
    if (err instanceof Error && err.message.includes('the client is offline')) {
      console.error('Firebase client offline or unreachable.');
    }
  }
}

function parseYouTubeId(url) {
  const s = String(url || '').trim();
  const match = s.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/
  );
  return match && match[1] ? match[1] : '';
}

function parseDurationToSeconds(dur) {
  const parts = String(dur || '').trim().split(':').map(Number);
  if (parts.some(Number.isNaN)) return 180;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 180;
}

function formatDate(ts) {
  if (!ts) return 'Recently';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function buildShareUrl(paramsObj) {
  const url = new URL(window.location.href);
  url.search = '';
  for (const [k, v] of Object.entries(paramsObj)) {
    if (v) url.searchParams.set(k, v);
  }
  return url.toString();
}

function copyText(text, successMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => showToast(successMsg),
      () => fallbackCopy(text, successMsg)
    );
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    showToast(successMsg);
  } catch {
    showToast('Copy failed. Please copy manually.');
  }
  document.body.removeChild(ta);
}

function detectInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const ref = (params.get('ref') || '').trim();
  if (ref && /^[a-zA-Z0-9_\-]{1,64}$/.test(ref)) {
    $('refChip').textContent = `ref=${ref}`;
    $('refChip').classList.remove('hidden');
    $('refBannerCode').textContent = `?ref=${ref}`;
    $('refBanner').classList.remove('hidden');
  }
}

function renderAuthUI() {
  const user = state.user;
  const owner = state.isOwner;
  $('btnSignIn').classList.toggle('hidden', Boolean(user));
  $('btnSignOut').classList.toggle('hidden', !user);
  $('ownerBadge').classList.toggle('hidden', !owner);
  $('creatorToolbar').classList.toggle('hidden', !owner);
  $('authNotice').classList.toggle('hidden', !user || owner);
  if (user && !owner) {
    $('signedInEmail').textContent = user.email || 'Unknown account';
  }
}

function renderChannel() {
  const c = state.channel;
  $('heroChannelTitle').textContent = c.channelName;
  $('heroTagline').textContent = c.tagline;
  $('heroBioPreview').textContent = c.bio;
  $('navOwnerName').textContent = `Owner: ${c.ownerName}`;
  $('aboutOwnerName').textContent = c.ownerName;
  $('aboutBio').textContent = c.bio;
  $('footerChannelName').textContent = c.channelName;
}

function getFilteredVideos() {
  return state.videos.filter((v) => {
    if (state.category !== 'All' && v.category !== state.category) return false;
    if (state.isOwner && state.visibility !== 'all' && v.visibility !== state.visibility) return false;
    if (state.search.trim()) {
      const q = state.search.trim().toLowerCase();
      const hay = `${v.title} ${v.description} ${v.category}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderHero() {
  const total = state.videos.length;
  const cats = new Set(state.videos.map((v) => v.category)).size;
  $('statVideos').textContent = String(total);
  $('statCategories').textContent = String(cats);
  $('statAds').textContent = `${state.adSettings.preRollSeconds}s / ${state.adSettings.midRollSeconds}s`;
  $('statAccess').textContent = state.isOwner ? 'Owner Studio' : 'Public Free';

  const featured = state.videos.find((v) => v.featured) || state.videos[0] || null;
  const btnWatch = $('btnWatchFeatured');
  const card = $('heroFeaturedCard');
  if (!featured) {
    btnWatch.disabled = true;
    $('heroFeaturedTitle').textContent = 'Showcase Ready for Your First Film';
    $('heroFeaturedMeta').textContent = 'Sign in as verified creator to publish YouTube or direct MP4 videos.';
    $('heroFeaturedThumb').src = DEFAULT_POSTER;
    card.onclick = null;
    return;
  }

  btnWatch.disabled = false;
  btnWatch.onclick = () => openPlayer(featured);
  card.onclick = () => openPlayer(featured);
  $('heroFeaturedTitle').textContent = featured.title;
  $('heroFeaturedMeta').textContent = `${featured.category} · ${featured.duration} · ${formatDate(featured.createdAt)}`;
  $('heroFeaturedThumb').src = sanitizeUrl(featured.thumbnailUrl) || DEFAULT_POSTER;
}

function renderVideos() {
  const grid = $('videoGrid');
  if (state.videosLoading) {
    grid.innerHTML = Array.from({ length: 6 })
      .map(() => '<div class="video-card skeleton-card"></div>')
      .join('');
    return;
  }

  const list = getFilteredVideos();
  if (!list.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No videos found</h3>
        <p>${state.isOwner ? 'Add a YouTube or Direct MP4 video from the Creator Studio toolbar above.' : 'Check back soon for new published films.'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = list
    .map((v) => {
      const thumb = sanitizeUrl(v.thumbnailUrl) || DEFAULT_POSTER;
      const badgeVis = state.isOwner
        ? `<span class="badge ${v.visibility === 'private' ? 'badge-warn' : 'badge-ok'}">${escapeHtml(v.visibility)}</span>`
        : '';
      const ownerBtns = state.isOwner
        ? `<div class="card-actions">
             <button class="btn-icon" data-action="edit" data-id="${escapeHtml(v.id)}">Edit</button>
             <button class="btn-icon" data-action="vis" data-id="${escapeHtml(v.id)}">${v.visibility === 'public' ? 'Hide' : 'Publish'}</button>
             <button class="btn-icon btn-danger" data-action="del" data-id="${escapeHtml(v.id)}">Delete</button>
           </div>`
        : '';
      return `
        <article class="video-card" data-play-id="${escapeHtml(v.id)}">
          <div class="thumb-wrap">
            <img src="${escapeHtml(thumb)}" alt="${escapeHtml(v.title)}" loading="lazy" />
            <span class="duration-pill">${escapeHtml(v.duration)}</span>
            ${v.featured ? '<span class="featured-pill">Featured</span>' : ''}
            <div class="play-overlay"><span>▶</span></div>
          </div>
          <div class="card-body">
            <div class="card-top-meta">
              <span class="cat-tag">${escapeHtml(v.category)}</span>
              ${badgeVis}
            </div>
            <h3 class="card-title">${escapeHtml(v.title)}</h3>
            <p class="card-desc">${escapeHtml(v.description || 'Watch now on My-Plixer.')}</p>
            <div class="card-foot">
              <span>${escapeHtml(formatDate(v.createdAt))}</span>
              ${ownerBtns}
            </div>
          </div>
        </article>`;
    })
    .join('');
}

function renderReferrals() {
  const grid = $('referralGrid');
  const visible = state.isOwner
    ? state.referrals
    : state.referrals.filter((r) => r.status === 'active');

  if (!visible.length) {
    grid.innerHTML = `
      <div class="empty-state">
        <h3>No referral links published yet</h3>
        <p>${state.isOwner ? 'Click "Referral Links" above to add partner links or your ?ref=CPILHE campaign.' : 'Partner links and creator recommendations will appear here.'}</p>
      </div>`;
    return;
  }

  grid.innerHTML = visible
    .map((r) => {
      const safeUrl = sanitizeUrl(r.url) || '#';
      return `
        <div class="ref-card">
          <div class="card-top-meta">
            <span class="cat-tag">${escapeHtml(r.category)}</span>
            ${r.rewardText ? `<span class="badge badge-accent">${escapeHtml(r.rewardText)}</span>` : ''}
            ${state.isOwner && r.status === 'hidden' ? '<span class="badge badge-warn">Hidden</span>' : ''}
          </div>
          <h3>${escapeHtml(r.title)}</h3>
          <p class="card-desc">${escapeHtml(r.description || 'Recommended creator partner link.')}</p>
          <div class="ref-foot">
            <code class="ref-code">${escapeHtml(r.refCode)}</code>
            <div class="ref-actions">
              <button class="btn btn-sm btn-ghost" data-copy-ref="${escapeHtml(safeUrl)}">Copy Link</button>
              <a class="btn btn-sm btn-primary" href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Open ↗</a>
            </div>
          </div>
        </div>`;
    })
    .join('');
}

function subscribeData() {
  if (state.unsubVideos) state.unsubVideos();
  if (state.unsubChannel) state.unsubChannel();
  if (state.unsubAd) state.unsubAd();
  if (state.unsubRef) state.unsubRef();

  state.videosLoading = true;
  renderVideos();

  const vRef = collection(db, 'videos');
  const vQ = state.isOwner ? vRef : query(vRef, where('visibility', '==', 'public'));
  state.unsubVideos = onSnapshot(
    vQ,
    (snap) => {
      state.videos = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      state.videosLoading = false;
      renderHero();
      renderVideos();
      if (!state.deepLinkHandled) {
        state.deepLinkHandled = true;
        const vidId = new URLSearchParams(window.location.search).get('v');
        if (vidId) {
          const found = state.videos.find((x) => x.id === vidId);
          if (found) openPlayer(found);
        }
      }
    },
    (err) => {
      state.videosLoading = false;
      renderVideos();
      handleFirestoreError(err, 'list', 'videos');
    }
  );

  const cQ = state.isOwner
    ? collection(db, 'channel')
    : query(collection(db, 'channel'), where('visibility', '==', 'public'));
  state.unsubChannel = onSnapshot(
    cQ,
    (snap) => {
      if (!snap.empty) {
        state.channelExists = true;
        state.channel = { ...DEFAULT_CHANNEL, ...snap.docs[0].data() };
      } else {
        state.channelExists = false;
        state.channel = { ...DEFAULT_CHANNEL };
      }
      renderChannel();
    },
    (err) => handleFirestoreError(err, 'list', 'channel')
  );

  const aQ = state.isOwner
    ? collection(db, 'adSettings')
    : query(collection(db, 'adSettings'), where('visibility', '==', 'public'));
  state.unsubAd = onSnapshot(
    aQ,
    (snap) => {
      if (!snap.empty) {
        state.adExists = true;
        state.adSettings = { ...DEFAULT_AD, ...snap.docs[0].data() };
      } else {
        state.adExists = false;
        state.adSettings = { ...DEFAULT_AD };
      }
      renderHero();
    },
    (err) => handleFirestoreError(err, 'list', 'adSettings')
  );

  const rQ = state.isOwner
    ? collection(db, 'referrals')
    : query(collection(db, 'referrals'), where('status', '==', 'active'));
  state.unsubRef = onSnapshot(
    rQ,
    (snap) => {
      state.referrals = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      renderReferrals();
      if (!$('referralModal').classList.contains('hidden')) renderOwnerReferralList();
    },
    (err) => handleFirestoreError(err, 'list', 'referrals')
  );
}

function clearAdTimers() {
  clearTimeout(state.countdownTimer);
  clearTimeout(state.ytMidTimer);
}

function updateAdOverlay() {
  const overlay = $('adOverlay');
  const ad = state.adSettings;
  if (state.adPhase === 'playing') {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  $('adPhaseLabel').textContent = state.adPhase === 'preroll' ? 'Pre-Roll Sponsor' : 'Mid-Roll Break';
  $('adTimerBadge').textContent = `Resumes in ${state.countdown}s`;
  $('adTitle').textContent = ad.adTitle || DEFAULT_AD.adTitle;
  $('adDescription').textContent = ad.adDescription || '';
  const imgUrl = sanitizeUrl(ad.adImageUrl);
  if (imgUrl) {
    $('adImage').src = imgUrl;
    $('adImageWrap').classList.remove('hidden');
  } else {
    $('adImageWrap').classList.add('hidden');
  }
  const clickUrl = sanitizeUrl(ad.adClickUrl);
  if (clickUrl) {
    $('adCtaLink').href = clickUrl;
    $('adCtaLink').textContent = `${ad.adCtaText || 'Visit Partner'} ↗`;
    $('adCtaLink').classList.remove('hidden');
  } else {
    $('adCtaLink').classList.add('hidden');
  }
}

function tickCountdown() {
  clearTimeout(state.countdownTimer);
  if (!state.activeVideo || state.adPhase === 'playing') return;
  updateAdOverlay();
  if (state.countdown <= 0) {
    const wasMid = state.adPhase === 'midroll';
    state.adPhase = 'playing';
    if (wasMid) state.midRollDone = true;
    updateAdOverlay();
    resumeActiveMedia();
    if (!wasMid && state.activeVideo.sourceType === 'youtube') scheduleYouTubeMidRoll();
    return;
  }
  state.countdownTimer = setTimeout(() => {
    state.countdown = Math.max(0, state.countdown - 1);
    tickCountdown();
  }, 1000);
}

function resumeActiveMedia() {
  const v = state.activeVideo;
  if (!v) return;
  if (v.sourceType === 'youtube') {
    $('playerIframe')?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'playVideo', args: '' }),
      '*'
    );
  } else {
    $('playerVideoEl')?.play().catch(() => undefined);
  }
}

function scheduleYouTubeMidRoll() {
  clearTimeout(state.ytMidTimer);
  const v = state.activeVideo;
  const ad = state.adSettings;
  if (!v || v.sourceType !== 'youtube' || state.midRollDone || !ad.midRollEnabled || ad.midRollSeconds <= 0) {
    return;
  }
  const totalSec = parseDurationToSeconds(v.duration);
  const delayMs = Math.max(8, Math.round(totalSec * (ad.midRollPercent / 100))) * 1000;
  state.ytMidTimer = setTimeout(() => {
    $('playerIframe')?.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: '' }),
      '*'
    );
    state.adPhase = 'midroll';
    state.countdown = ad.midRollSeconds;
    tickCountdown();
  }, delayMs);
}

function openPlayer(video) {
  clearAdTimers();
  state.activeVideo = video;
  state.midRollDone = false;

  const ad = state.adSettings;
  if (ad.preRollEnabled && ad.preRollSeconds > 0) {
    state.adPhase = 'preroll';
    state.countdown = ad.preRollSeconds;
  } else {
    state.adPhase = 'playing';
    state.countdown = 0;
  }

  $('playerTitle').textContent = video.title;
  $('playerMeta').textContent = `${video.category} · ${video.duration} · ${formatDate(video.createdAt)}`;
  $('playerDesc').textContent = video.description || 'Published on My-Plixer.';
  $('playerOwnerActions').classList.toggle('hidden', !state.isOwner);

  const wrap = $('videoFrameWrap');
  const safeSrc = sanitizeUrl(video.videoUrl);
  const ytId = video.sourceType === 'youtube' ? parseYouTubeId(video.videoUrl) : '';

  if (ytId) {
    wrap.innerHTML = `<iframe id="playerIframe" src="https://www.youtube.com/embed/${escapeHtml(ytId)}?enablejsapi=1&rel=0" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen title="${escapeHtml(video.title)}"></iframe>`;
  } else if (safeSrc && /^https?:\/\//i.test(safeSrc)) {
    wrap.innerHTML = `<video id="playerVideoEl" src="${escapeHtml(safeSrc)}" controls playsinline preload="metadata" poster="${escapeHtml(sanitizeUrl(video.thumbnailUrl) || DEFAULT_POSTER)}"></video>`;
    const vidEl = $('playerVideoEl');
    vidEl.addEventListener('timeupdate', () => {
      if (
        state.adPhase !== 'playing' ||
        state.midRollDone ||
        !ad.midRollEnabled ||
        ad.midRollSeconds <= 0 ||
        !Number.isFinite(vidEl.duration) ||
        vidEl.duration <= 0
      ) {
        return;
      }
      if (vidEl.currentTime >= vidEl.duration * (ad.midRollPercent / 100)) {
        vidEl.pause();
        state.adPhase = 'midroll';
        state.countdown = ad.midRollSeconds;
        tickCountdown();
      }
    });
  } else {
    wrap.innerHTML = '<div class="empty-state"><p>Video URL unavailable or requires Node media server.</p></div>';
  }

  const upNext = state.videos.filter((x) => x.id !== video.id).slice(0, 6);
  $('upNextList').innerHTML = upNext.length
    ? upNext
        .map(
          (u) => `
      <button class="upnext-item" data-play-id="${escapeHtml(u.id)}">
        <img src="${escapeHtml(sanitizeUrl(u.thumbnailUrl) || DEFAULT_POSTER)}" alt="" />
        <div>
          <div class="upnext-title">${escapeHtml(u.title)}</div>
          <div class="upnext-meta">${escapeHtml(u.category)} · ${escapeHtml(u.duration)}</div>
        </div>
      </button>`
        )
        .join('')
    : '<p class="muted">No other videos yet.</p>';

  $('playerModal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (state.adPhase !== 'playing') {
    tickCountdown();
  } else {
    updateAdOverlay();
    if (ytId) scheduleYouTubeMidRoll();
    else $('playerVideoEl')?.play().catch(() => undefined);
  }
}

function closePlayer() {
  clearAdTimers();
  state.activeVideo = null;
  $('videoFrameWrap').innerHTML = '';
  $('playerModal').classList.add('hidden');
  document.body.style.overflow = '';
}

function openUploadModal(video = null) {
  $('uploadError').textContent = '';
  $('uploadModalTitle').textContent = video ? 'Edit Video' : 'Add Video';
  $('vId').value = video ? video.id : '';
  $('vTitle').value = video ? video.title : '';
  $('vSourceType').value = video && video.sourceType === 'direct' ? 'direct' : 'youtube';
  $('vVideoUrl').value = video ? video.videoUrl : '';
  $('vThumbUrl').value = video ? video.thumbnailUrl : '';
  $('vCategory').value = video && ALLOWED_CATEGORIES.includes(video.category) ? video.category : 'Short Film';
  $('vDuration').value = video ? video.duration : '05:00';
  $('vVisibility').value = video ? video.visibility : 'public';
  $('vFeatured').checked = Boolean(video?.featured);
  $('vDescription').value = video ? video.description : '';
  $('uploadModal').classList.remove('hidden');
}

function openAdSettingsModal() {
  const ad = state.adSettings;
  $('adError').textContent = '';
  $('adPreEnabled').checked = Boolean(ad.preRollEnabled);
  $('adPreSeconds').value = String(ad.preRollSeconds || 5);
  $('adMidEnabled').checked = Boolean(ad.midRollEnabled);
  $('adMidSeconds').value = String(ad.midRollSeconds || 5);
  $('adMidPercent').value = String(ad.midRollPercent || 50);
  $('adInputTitle').value = ad.adTitle || '';
  $('adInputDesc').value = ad.adDescription || '';
  $('adInputImg').value = ad.adImageUrl || '';
  $('adInputClickUrl').value = ad.adClickUrl || '';
  $('adInputCta').value = ad.adCtaText || 'Visit Partner';
  $('adSettingsModal').classList.remove('hidden');
}

function openProfileModal() {
  const c = state.channel;
  $('profileError').textContent = '';
  $('pChannelName').value = c.channelName;
  $('pOwnerName').value = c.ownerName;
  $('pTagline').value = c.tagline;
  $('pBio').value = c.bio;
  $('profileModal').classList.remove('hidden');
}

function renderOwnerReferralList() {
  const wrap = $('ownerReferralList');
  if (!state.referrals.length) {
    wrap.innerHTML = '<p class="muted">No referral items yet.</p>';
    return;
  }
  wrap.innerHTML = state.referrals
    .map(
      (r) => `
    <div class="owner-ref-row">
      <div>
        <strong>${escapeHtml(r.title)}</strong>
        <div class="muted">${escapeHtml(r.category)} · Code: ${escapeHtml(r.refCode)} · ${escapeHtml(r.status)}</div>
      </div>
      <div class="row-btns">
        <button type="button" class="btn btn-sm btn-ghost" data-ref-edit="${escapeHtml(r.id)}">Edit</button>
        <button type="button" class="btn btn-sm btn-ghost" data-ref-toggle="${escapeHtml(r.id)}">${r.status === 'active' ? 'Hide' : 'Show'}</button>
        <button type="button" class="btn btn-sm btn-danger" data-ref-del="${escapeHtml(r.id)}">Del</button>
      </div>
    </div>`
    )
    .join('');
}

function openReferralModal() {
  $('refError').textContent = '';
  resetRefForm();
  updateSiteRefPreview();
  renderOwnerReferralList();
  $('referralModal').classList.remove('hidden');
}

function resetRefForm() {
  $('rId').value = '';
  $('rTitle').value = '';
  $('rUrl').value = '';
  $('rCode').value = 'CPILHE';
  $('rReward').value = '';
  $('rCategory').value = 'Partner Offer';
  $('rStatus').value = 'active';
  $('rDescription').value = '';
}

function updateSiteRefPreview() {
  const code = ($('siteRefCodeInput').value || 'CPILHE').trim();
  $('siteRefPreview').textContent = buildShareUrl({ ref: code });
}

function initEventListeners() {
  document.addEventListener(
    'error',
    (e) => {
      const target = e.target;
      if (target && target.tagName === 'IMG' && target.src !== DEFAULT_POSTER) {
        target.src = DEFAULT_POSTER;
      }
    },
    true
  );

  $('btnSignIn').addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Signed in successfully.');
    } catch (err) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        showToast('Sign in failed. Check Firebase Authorized Domains.');
      }
    }
  });

  $('btnSignOut').addEventListener('click', async () => {
    await signOut(auth);
    showToast('Signed out.');
  });

  $('btnSwitchAccount')?.addEventListener('click', async () => {
    await signOut(auth);
    await signInWithPopup(auth, googleProvider).catch(() => undefined);
  });

  $('searchInput').addEventListener('input', (e) => {
    state.search = e.target.value;
    renderVideos();
  });

  $('categoryTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-cat]');
    if (!btn) return;
    state.category = btn.dataset.cat;
    document.querySelectorAll('#categoryTabs [data-cat]').forEach((b) => {
      b.classList.toggle('active', b === btn);
    });
    renderVideos();
  });

  $('creatorToolbar').addEventListener('click', (e) => {
    const visBtn = e.target.closest('[data-vis]');
    if (visBtn) {
      state.visibility = visBtn.dataset.vis;
      document.querySelectorAll('#creatorToolbar [data-vis]').forEach((b) => {
        b.classList.toggle('active', b === visBtn);
      });
      renderVideos();
    }
  });

  $('btnAddVideo').addEventListener('click', () => openUploadModal(null));
  $('btnAdSettings').addEventListener('click', openAdSettingsModal);
  $('btnReferralSetup').addEventListener('click', openReferralModal);
  $('btnChannelProfile').addEventListener('click', openProfileModal);

  $('btnCopySiteRef').addEventListener('click', () => {
    copyText(buildShareUrl({ ref: 'CPILHE' }), 'Site referral link (?ref=CPILHE) copied!');
  });

  $('videoGrid').addEventListener('click', async (e) => {
    const actBtn = e.target.closest('[data-action]');
    if (actBtn) {
      e.stopPropagation();
      const id = actBtn.dataset.id;
      const vid = state.videos.find((x) => x.id === id);
      if (!vid) return;
      if (actBtn.dataset.action === 'edit') openUploadModal(vid);
      if (actBtn.dataset.action === 'vis') {
        try {
          await updateDoc(doc(db, 'videos', vid.id), {
            visibility: vid.visibility === 'public' ? 'private' : 'public',
            updatedAt: serverTimestamp(),
          });
          showToast('Visibility updated.');
        } catch (err) {
          handleFirestoreError(err, 'update', `videos/${vid.id}`);
          showToast('Permission denied or update failed.');
        }
      }
      if (actBtn.dataset.action === 'del') {
        state.pendingDeleteId = vid.id;
        $('deleteTargetTitle').textContent = vid.title;
        $('deleteModal').classList.remove('hidden');
      }
      return;
    }

    const card = e.target.closest('[data-play-id]');
    if (card) {
      const vid = state.videos.find((x) => x.id === card.dataset.playId);
      if (vid) openPlayer(vid);
    }
  });

  $('referralGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-copy-ref]');
    if (btn) copyText(btn.dataset.copyRef, 'Referral link copied!');
  });

  $('upNextList').addEventListener('click', (e) => {
    const item = e.target.closest('[data-play-id]');
    if (!item) return;
    const vid = state.videos.find((x) => x.id === item.dataset.playId);
    if (vid) openPlayer(vid);
  });

  $('btnClosePlayer').addEventListener('click', closePlayer);
  $('btnShareVideo').addEventListener('click', () => {
    if (!state.activeVideo) return;
    copyText(buildShareUrl({ v: state.activeVideo.id }), 'Video share link copied!');
  });
  $('btnEditActive').addEventListener('click', () => {
    const v = state.activeVideo;
    if (!v) return;
    closePlayer();
    openUploadModal(v);
  });
  $('btnDeleteActive').addEventListener('click', () => {
    const v = state.activeVideo;
    if (!v) return;
    closePlayer();
    state.pendingDeleteId = v.id;
    $('deleteTargetTitle').textContent = v.title;
    $('deleteModal').classList.remove('hidden');
  });

  $('btnCloseUpload').addEventListener('click', () => $('uploadModal').classList.add('hidden'));
  $('btnCloseAdSettings').addEventListener('click', () => $('adSettingsModal').classList.add('hidden'));
  $('btnCloseReferral').addEventListener('click', () => $('referralModal').classList.add('hidden'));
  $('btnCloseProfile').addEventListener('click', () => $('profileModal').classList.add('hidden'));
  $('btnCancelDelete').addEventListener('click', () => {
    state.pendingDeleteId = null;
    $('deleteModal').classList.add('hidden');
  });

  $('btnConfirmDelete').addEventListener('click', async () => {
    if (!state.pendingDeleteId) return;
    const id = state.pendingDeleteId;
    try {
      await deleteDoc(doc(db, 'videos', id));
      showToast('Video deleted.');
    } catch (err) {
      handleFirestoreError(err, 'delete', `videos/${id}`);
      showToast('Failed to delete video.');
    } finally {
      state.pendingDeleteId = null;
      $('deleteModal').classList.add('hidden');
    }
  });

  $('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.isOwner || !state.user) return;
    const id = $('vId').value.trim();
    const title = $('vTitle').value.trim();
    const sourceType = $('vSourceType').value === 'direct' ? 'direct' : 'youtube';
    const videoUrl = sanitizeUrl($('vVideoUrl').value);
    let thumbnailUrl = sanitizeUrl($('vThumbUrl').value);
    const category = ALLOWED_CATEGORIES.includes($('vCategory').value) ? $('vCategory').value : 'Archive';
    const duration = ($('vDuration').value.trim() || '05:00').slice(0, 24);
    const visibility = $('vVisibility').value === 'private' ? 'private' : 'public';
    const featured = $('vFeatured').checked;
    const description = $('vDescription').value.trim().slice(0, 2000);

    if (!title || !videoUrl) {
      $('uploadError').textContent = 'Please provide a valid title and https:// video URL.';
      return;
    }
    if (sourceType === 'youtube' && !thumbnailUrl) {
      const ytId = parseYouTubeId(videoUrl);
      if (ytId) thumbnailUrl = `https://i.ytimg.com/vi/${ytId}/hqdefault.jpg`;
    }

    try {
      if (id) {
        await updateDoc(doc(db, 'videos', id), {
          title,
          description,
          category,
          sourceType,
          videoUrl,
          storageFilename: '',
          thumbnailUrl,
          duration,
          visibility,
          featured,
          updatedAt: serverTimestamp(),
        });
        showToast('Video updated.');
      } else {
        const ref = doc(collection(db, 'videos'));
        await setDoc(ref, {
          title,
          description,
          category,
          sourceType,
          videoUrl,
          storageFilename: '',
          thumbnailUrl,
          duration,
          visibility,
          featured,
          ownerUid: state.user.uid,
          ownerName: (state.user.displayName || state.channel.ownerName || 'Jahid Hasan').slice(0, 100),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('Video published.');
      }
      $('uploadModal').classList.add('hidden');
    } catch (err) {
      handleFirestoreError(err, id ? 'update' : 'create', 'videos');
      $('uploadError').textContent = 'Failed to save video. Check owner permissions and fields.';
    }
  });

  $('adSettingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.isOwner || !state.user) return;
    const clamp = (n, min, max, def) => {
      const v = parseInt(n, 10);
      return Number.isNaN(v) ? def : Math.min(max, Math.max(min, v));
    };
    const payload = {
      preRollEnabled: $('adPreEnabled').checked,
      midRollEnabled: $('adMidEnabled').checked,
      preRollSeconds: clamp($('adPreSeconds').value, 1, 60, 5),
      midRollSeconds: clamp($('adMidSeconds').value, 1, 60, 5),
      midRollPercent: clamp($('adMidPercent').value, 10, 90, 50),
      adTitle: ($('adInputTitle').value.trim() || DEFAULT_AD.adTitle).slice(0, 120),
      adDescription: $('adInputDesc').value.trim().slice(0, 400),
      adImageUrl: sanitizeUrl($('adInputImg').value).slice(0, 1000),
      adClickUrl: sanitizeUrl($('adInputClickUrl').value).slice(0, 1000),
      adCtaText: ($('adInputCta').value.trim() || 'Visit Partner').slice(0, 40),
      visibility: 'public',
      updatedAt: serverTimestamp(),
    };
    try {
      const ref = doc(db, 'adSettings', 'main');
      if (state.adExists) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, { ...payload, ownerUid: state.user.uid });
      }
      $('adSettingsModal').classList.add('hidden');
      showToast('Ad settings saved.');
    } catch (err) {
      handleFirestoreError(err, 'write', 'adSettings/main');
      $('adError').textContent = 'Failed to save ad settings.';
    }
  });

  $('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.isOwner || !state.user) return;
    const payload = {
      channelName: ($('pChannelName').value.trim() || DEFAULT_CHANNEL.channelName).slice(0, 80),
      ownerName: ($('pOwnerName').value.trim() || DEFAULT_CHANNEL.ownerName).slice(0, 80),
      tagline: ($('pTagline').value.trim() || DEFAULT_CHANNEL.tagline).slice(0, 200),
      bio: ($('pBio').value.trim() || DEFAULT_CHANNEL.bio).slice(0, 1200),
      visibility: 'public',
      updatedAt: serverTimestamp(),
    };
    try {
      const ref = doc(db, 'channel', 'main');
      if (state.channelExists) {
        await updateDoc(ref, payload);
      } else {
        await setDoc(ref, { ...payload, ownerUid: state.user.uid });
      }
      $('profileModal').classList.add('hidden');
      showToast('Channel profile updated.');
    } catch (err) {
      handleFirestoreError(err, 'write', 'channel/main');
      $('profileError').textContent = 'Failed to update channel profile.';
    }
  });

  $('siteRefCodeInput').addEventListener('input', updateSiteRefPreview);
  $('btnCopyCustomSiteRef').addEventListener('click', () => {
    const code = ($('siteRefCodeInput').value || 'CPILHE').trim();
    copyText(buildShareUrl({ ref: code }), `Copied ?ref=${code} link!`);
  });
  $('btnResetRefForm').addEventListener('click', resetRefForm);

  $('referralForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.isOwner || !state.user) return;
    const id = $('rId').value.trim();
    const title = $('rTitle').value.trim().slice(0, 120);
    const url = sanitizeUrl($('rUrl').value).slice(0, 1000);
    const refCode = ($('rCode').value.trim() || 'CPILHE').slice(0, 64);
    const rewardText = $('rReward').value.trim().slice(0, 120);
    const category = ALLOWED_REF_CATEGORIES.includes($('rCategory').value) ? $('rCategory').value : 'Partner Offer';
    const status = $('rStatus').value === 'hidden' ? 'hidden' : 'active';
    const description = $('rDescription').value.trim().slice(0, 500);

    if (!title || !url) {
      $('refError').textContent = 'Title and valid https:// URL are required.';
      return;
    }

    try {
      if (id) {
        await updateDoc(doc(db, 'referrals', id), {
          title,
          description,
          url,
          refCode,
          rewardText,
          category,
          status,
          updatedAt: serverTimestamp(),
        });
        showToast('Referral updated.');
      } else {
        await setDoc(doc(collection(db, 'referrals')), {
          title,
          description,
          url,
          refCode,
          rewardText,
          category,
          status,
          ownerUid: state.user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        showToast('Referral added.');
      }
      resetRefForm();
    } catch (err) {
      handleFirestoreError(err, 'write', 'referrals');
      $('refError').textContent = 'Failed to save referral.';
    }
  });

  $('ownerReferralList').addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-ref-edit]');
    if (editBtn) {
      const r = state.referrals.find((x) => x.id === editBtn.dataset.refEdit);
      if (!r) return;
      $('rId').value = r.id;
      $('rTitle').value = r.title;
      $('rUrl').value = r.url;
      $('rCode').value = r.refCode;
      $('rReward').value = r.rewardText || '';
      $('rCategory').value = r.category;
      $('rStatus').value = r.status;
      $('rDescription').value = r.description || '';
      return;
    }

    const togBtn = e.target.closest('[data-ref-toggle]');
    if (togBtn) {
      const r = state.referrals.find((x) => x.id === togBtn.dataset.refToggle);
      if (!r) return;
      await updateDoc(doc(db, 'referrals', r.id), {
        status: r.status === 'active' ? 'hidden' : 'active',
        updatedAt: serverTimestamp(),
      }).catch((err) => handleFirestoreError(err, 'update', `referrals/${r.id}`));
      return;
    }

    const delBtn = e.target.closest('[data-ref-del]');
    if (delBtn) {
      const id = delBtn.dataset.refDel;
      await deleteDoc(doc(db, 'referrals', id)).catch((err) =>
        handleFirestoreError(err, 'delete', `referrals/${id}`)
      );
      showToast('Referral deleted.');
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('playerModal').classList.contains('hidden')) {
      closePlayer();
    }
  });
}

detectInitialParams();
initEventListeners();
testConnection();

onAuthStateChanged(auth, (currentUser) => {
  state.user = currentUser;
  state.authReady = true;
  state.isOwner = isOwnerUser(currentUser);
  renderAuthUI();
  subscribeData();
});