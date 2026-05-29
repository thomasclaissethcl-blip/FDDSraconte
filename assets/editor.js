(() => {
  'use strict';

  const state = {
    config: { owner: '', repo: '', branch: 'main', prefix: '', token: '' },
    site: null,
    home: null,
    categories: [],
    articles: [],
    images: [],
    tree: [],
    shas: new Map(),
    originalArticleFiles: new Set(),
    originalPageFiles: new Set(),
    selectedArticleSlug: null,
    selectedCategorySlug: null,
    pendingImages: [],
    siteCss: '',
    loaded: false,
    lock: {
      branch: 'fdds-editor-lock',
      filePath: '.editor-lock.json',
      sessionId: '',
      editorName: '',
      acquired: false,
      heartbeatTimer: null,
      heartbeatMs: 120000,
      ttlMs: 20 * 60 * 1000,
      lastRemote: null,
      releasing: false
    }
  };

  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  const els = {
    statusDot: $('#status-dot'),
    statusText: $('#status-text'),
    owner: $('#repo-owner'),
    repo: $('#repo-name'),
    branch: $('#repo-branch'),
    prefix: $('#repo-prefix'),
    editorName: $('#editor-name'),
    token: $('#github-token'),
    releaseLock: $('#release-lock'),
    lockStatus: $('#lock-status'),
    busyDialog: $('#busy-dialog'),
    busyDetails: $('#busy-lock-details'),
    busyExpiry: $('#busy-lock-expiry'),
    treeView: $('#tree-view'),
    log: $('#log-output'),
    homeCategoriesTitle: $('#home-categories-title'),
    homeArticlesTitle: $('#home-articles-title'),
    homeCategoriesIntro: $('#home-categories-intro'),
    homeSearchLabel: $('#home-search-label'),
    homeSearchPlaceholder: $('#home-search-placeholder'),
    homeResetLabel: $('#home-reset-label'),
    homeIntroHtml: $('#home-intro-html'),
    homeRichEditor: $('#home-rich-editor'),
    homePreview: $('#home-preview'),
    articleList: $('#article-list'),
    articleListSearch: $('#article-list-search'),
    articleTitle: $('#article-title'),
    articleSlug: $('#article-slug'),
    articleImage: $('#article-image'),
    articleImageSelect: $('#article-image-select'),
    articleSummary: $('#article-summary'),
    articleTemplate: $('#article-template'),
    characterCardToggle: $('#character-card-toggle'),
    characterPanel: $('#character-card-panel'),
    characterImage: $('#character-image'),
    characterImageSelect: $('#character-image-select'),
    characterImageAlt: $('#character-image-alt'),
    characterCaption: $('#character-caption'),
    characterType: $('#character-type'),
    characterActivity: $('#character-activity'),
    characterEntourage: $('#character-entourage'),
    characterEnemyOf: $('#character-enemy-of'),
    characterFirstAppearance: $('#character-first-appearance'),
    characterStatus: $('#character-status'),
    characterFieldLink: $('#character-field-link'),
    characterFieldUnlink: $('#character-field-unlink'),
    articleCategories: $('#article-categories'),
    articleBody: $('#article-body'),
    articleRichEditor: $('#article-rich-editor'),
    articlePreview: $('#article-preview'),
    categoryList: $('#category-list'),
    categoryLabel: $('#category-label'),
    categorySlug: $('#category-slug'),
    categoryImage: $('#category-image'),
    categoryImageSelect: $('#category-image-select'),
    categoryDescription: $('#category-description'),
    imageGrid: $('#image-grid'),
    imageFile: $('#image-file'),
    imageTargetName: $('#image-target-name'),
    pendingImages: $('#pending-images'),
    buildPreview: $('#build-preview'),
    linkDialog: $('#link-dialog'),
    linkUrl: $('#link-url'),
    linkTitle: $('#link-title')
  };

  let activeRichEditable = null;
  let savedRichRange = null;

  function rememberRichSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement;
    const editor = container?.closest?.('.rich-editor, .rich-mini');
    if (!editor) return;
    activeRichEditable = editor;
    savedRichRange = range.cloneRange();
  }

  function restoreRichSelection() {
    if (!savedRichRange) return false;
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(savedRichRange);
    return true;
  }

  function syncRichContainerAfterChange(editor) {
    const block = editor?.closest?.('.rich-editor-block');
    if (block) {
      const target = document.getElementById(block.dataset.richTarget);
      syncRichToTextarea(editor, target);
      if (block.dataset.richTarget === 'article-body') renderArticlePreview();
      if (block.dataset.richTarget === 'home-intro-html') collectHomeFromForm();
    }
    if (editor?.classList?.contains('rich-mini')) {
      renderArticlePreview();
    }
  }

  function openLinkDialog(editor) {
    if (editor) {
      activeRichEditable = editor;
      editor.focus();
      rememberRichSelection();
    }
    if (!activeRichEditable || !savedRichRange) {
      log('Sélectionnez d’abord le texte à transformer en lien.', 'error');
      return;
    }
    els.linkUrl.value = '';
    els.linkTitle.value = '';
    if (els.linkDialog?.showModal) els.linkDialog.showModal();
    else {
      const url = prompt('Adresse du lien à insérer :');
      if (url) applyLink(url, '');
    }
  }

  function applyLink(url, title = '') {
    if (!url || !activeRichEditable || !savedRichRange) return;
    activeRichEditable.focus();
    restoreRichSelection();
    document.execCommand('createLink', false, url);
    const selection = window.getSelection();
    const anchor = selection?.anchorNode?.parentElement?.closest?.('a') || activeRichEditable.querySelector(`a[href="${CSS.escape(url)}"]`);
    if (anchor) {
      if (title) anchor.setAttribute('title', title);
      if (/^https?:\/\//i.test(url)) {
        anchor.classList.add('external-link');
        anchor.setAttribute('target', '_blank');
        anchor.setAttribute('rel', 'noopener noreferrer');
      }
    }
    syncRichContainerAfterChange(activeRichEditable);
  }

  function unlinkSelection(editor) {
    if (editor) {
      activeRichEditable = editor;
      editor.focus();
      rememberRichSelection();
    }
    if (!activeRichEditable) return;
    restoreRichSelection();
    document.execCommand('unlink', false, null);
    syncRichContainerAfterChange(activeRichEditable);
  }

  function log(message, type = 'info') {
    const prefix = type === 'error' ? '[erreur]' : type === 'ok' ? '[ok]' : '[info]';
    const line = `${new Date().toLocaleTimeString('fr-FR')} ${prefix} ${message}`;
    els.log.textContent += `${line}\n`;
    els.log.scrollTop = els.log.scrollHeight;
  }

  function setStatus(text, ok = false) {
    els.statusText.textContent = text;
    els.statusDot.classList.toggle('ok', ok);
  }

  function normalizePrefix(value) {
    return String(value || '').trim().replace(/^\/+|\/+$/g, '');
  }

  function pathJoin(...parts) {
    return parts.filter(Boolean).join('/').replace(/\/+/g, '/');
  }

  function repoPath(path) {
    return pathJoin(normalizePrefix(state.config.prefix), path);
  }

  function slugify(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr-FR')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'article';
  }

  function sortByTitle(items) {
    return [...items].sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'fr-FR'));
  }

  function sortCategories(items) {
    return [...items].sort((a, b) => String(a.label || '').localeCompare(String(b.label || ''), 'fr-FR'));
  }

  function stripHTML(value) {
    const div = document.createElement('div');
    div.innerHTML = String(value || '');
    div.querySelectorAll('script, style').forEach((node) => node.remove());
    return div.textContent.replace(/\s+/g, ' ').trim();
  }

  function normalizeForSearch(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr-FR')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }


  function isLikelyBinaryPath(path) {
    return /\.(png|jpe?g|gif|webp|avif|ico|svgz|pdf|zip|woff2?|ttf|otf|mp3|mp4|webm|ogg)$/i.test(String(path || ''));
  }

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function syncRichToTextarea(editor, textarea) {
    if (!editor || !textarea) return;
    textarea.value = editor.innerHTML.trim();
  }

  function syncTextareaToRich(textarea, editor) {
    if (!editor || !textarea) return;
    if (editor.innerHTML !== textarea.value) editor.innerHTML = textarea.value || '';
  }

  function setRichHTML(textarea, editor, html) {
    if (textarea) textarea.value = html || '';
    if (editor) editor.innerHTML = html || '';
  }

  function syncAllRichEditors() {
    syncRichToTextarea(els.homeRichEditor, els.homeIntroHtml);
    syncRichToTextarea(els.articleRichEditor, els.articleBody);
  }

  function interpolate(template, values) {
    return template.replace(/{{(\w+)}}/g, (_, key) => values[key] ?? '');
  }

  function utf8ToBase64(value) {
    const bytes = new TextEncoder().encode(String(value));
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  function base64ToUtf8(value) {
    const binary = atob(String(value || '').replace(/\n/g, ''));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  function readConfigFromForm() {
    state.config = {
      owner: els.owner.value.trim(),
      repo: els.repo.value.trim(),
      branch: els.branch.value.trim() || 'main',
      prefix: normalizePrefix(els.prefix.value),
      editorName: els.editorName?.value.trim() || '',
      token: els.token.value.trim()
    };
  }

  function writeConfigToForm(config) {
    els.owner.value = config.owner || '';
    els.repo.value = config.repo || '';
    els.branch.value = config.branch || 'main';
    els.prefix.value = config.prefix || '';
    if (els.editorName) els.editorName.value = config.editorName || '';
    els.token.value = config.token || '';
  }

  function saveConfig() {
    readConfigFromForm();
    localStorage.setItem('fdds-editor-config', JSON.stringify(state.config));
    log('Configuration enregistrée dans ce navigateur.', 'ok');
  }

  function loadSavedConfig() {
    const raw = localStorage.getItem('fdds-editor-config');
    if (!raw) {
      log('Aucune configuration locale enregistrée.');
      return;
    }
    state.config = JSON.parse(raw);
    writeConfigToForm(state.config);
    log('Configuration locale rechargée.', 'ok');
  }

  function forgetConfig() {
    localStorage.removeItem('fdds-editor-config');
    writeConfigToForm({ branch: 'main' });
    log('Configuration locale effacée.', 'ok');
  }

  function assertConfig() {
    readConfigFromForm();
    if (!state.config.owner || !state.config.repo || !state.config.branch || !state.config.token) {
      throw new Error('Renseignez propriétaire, dépôt, branche et token GitHub.');
    }
    if (!state.config.editorName) {
      throw new Error('Renseignez le nom du chroniqueur avant de charger le site.');
    }
  }

  function apiUrl(path) {
    return `https://api.github.com/repos/${encodeURIComponent(state.config.owner)}/${encodeURIComponent(state.config.repo)}${path}`;
  }

  async function githubFetch(path, options = {}) {
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${state.config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    };
    const response = await fetch(apiUrl(path), { ...options, headers, cache: 'no-store' });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`GitHub ${response.status} ${response.statusText} — ${text.slice(0, 400)}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function githubFetchOptional(path, options = {}) {
    try {
      return await githubFetch(path, options);
    } catch (error) {
      if (String(error.message || '').includes('GitHub 404')) return null;
      throw error;
    }
  }


  function getOrCreateSessionId() {
    const key = 'fdds-editor-session-id';
    let value = localStorage.getItem(key);
    if (!value) {
      value = (crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`);
      localStorage.setItem(key, value);
    }
    state.lock.sessionId = value;
    return value;
  }

  function initLockIdentity() {
    readConfigFromForm();
    state.lock.editorName = state.config.editorName || 'Chroniqueur anonyme';
    getOrCreateSessionId();
  }

  function getLockBranchName() {
    return state.lock.branch;
  }

  function getLockFilePath() {
    return state.lock.filePath;
  }

  function getLockExpiryDate() {
    return new Date(Date.now() + state.lock.ttlMs);
  }

  function isLockActive(lock) {
    if (!lock || lock.locked !== true) return false;
    const expires = Date.parse(lock.expiresAt || '');
    return Number.isFinite(expires) && expires > Date.now();
  }

  function isOwnLock(lock) {
    return Boolean(lock && lock.sessionId && lock.sessionId === state.lock.sessionId);
  }

  function formatLockDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'date inconnue';
    return date.toLocaleString('fr-FR');
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function lockDisplayName(lock) {
    return lock?.editorName || 'un autre chroniqueur';
  }

  function renderLockStatus(text, ok = state.lock.acquired) {
    if (!els.lockStatus) return;
    if (text) {
      els.lockStatus.textContent = text;
    } else if (state.lock.acquired) {
      const expires = state.lock.lastRemote?.expiresAt ? ` jusqu’à ${formatLockDate(state.lock.lastRemote.expiresAt)}` : '';
      els.lockStatus.textContent = `Verrou éditorial détenu par ${state.lock.editorName}${expires}.`;
    } else {
      els.lockStatus.textContent = 'Aucun verrou éditorial actif.';
    }
    els.lockStatus.classList.toggle('is-ok', Boolean(ok));
    els.lockStatus.classList.toggle('is-busy', !ok && Boolean(text));
    if (els.releaseLock) els.releaseLock.disabled = !state.lock.acquired;
  }

  async function getGitRef(branch) {
    return githubFetch(`/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`);
  }

  async function getGitRefOptional(branch) {
    return githubFetchOptional(`/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`);
  }

  async function createGitRef(branch, commitSha) {
    return githubFetch('/git/refs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commitSha })
    });
  }

  async function updateGitRef(branch, commitSha, force = false) {
    return githubFetch(`/git/refs/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha, force })
    });
  }

  async function deleteGitRef(branch) {
    return githubFetch(`/git/refs/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`, {
      method: 'DELETE'
    });
  }

  async function deleteGitRefOptional(branch) {
    try {
      await deleteGitRef(branch);
      return true;
    } catch (error) {
      if (String(error.message || '').includes('GitHub 404')) return false;
      throw error;
    }
  }

  async function getTextFileFromRef(path, ref) {
    const fullPath = repoPath(path);
    const data = await githubFetchOptional(`/contents/${encodeURIComponent(fullPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(ref)}`);
    if (!data || Array.isArray(data) || data.type !== 'file') return null;
    return base64ToUtf8(data.content);
  }

  async function readEditorLock() {
    const branch = getLockBranchName();
    const ref = await getGitRefOptional(branch);
    if (!ref?.object?.sha) return null;
    const text = await getTextFileFromRef(getLockFilePath(), branch);
    if (!text) return { refSha: ref.object.sha, data: null };
    try {
      return { refSha: ref.object.sha, data: JSON.parse(text) };
    } catch (_) {
      return { refSha: ref.object.sha, data: null };
    }
  }

  function buildLockData(previous = {}, locked = true) {
    const now = new Date();
    const expiresAt = locked ? getLockExpiryDate() : now;
    return {
      locked,
      message: locked ? 'Un chroniqueur est en train de produire.' : 'Verrou éditorial libéré.',
      editorName: state.lock.editorName || state.config.editorName || 'Chroniqueur anonyme',
      sessionId: state.lock.sessionId,
      repository: `${state.config.owner}/${state.config.repo}`,
      branch: state.config.branch,
      prefix: normalizePrefix(state.config.prefix),
      createdAt: previous.createdAt || now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      releasedAt: locked ? null : now.toISOString()
    };
  }

  async function commitLockData(lockData, createBranch = false) {
    const lockBranch = getLockBranchName();
    const parentRef = createBranch ? await getGitRef(state.config.branch) : await getGitRef(lockBranch);
    const parentSha = parentRef.object?.sha;
    if (!parentSha) throw new Error('Impossible de déterminer le commit de référence du verrou.');
    const parentCommit = await getGitCommit(parentSha);
    const baseTreeSha = parentCommit.tree?.sha;
    if (!baseTreeSha) throw new Error('Impossible de déterminer l’arbre Git du verrou.');

    const newTree = await createGitTree(baseTreeSha, [{
      path: repoPath(getLockFilePath()),
      mode: '100644',
      type: 'blob',
      content: `${JSON.stringify(lockData, null, 2)}\n`
    }]);
    const newCommit = await createGitCommit(`Verrou éditorial FDDS — ${lockData.locked ? 'prise' : 'libération'} — ${lockData.editorName}`, newTree.sha, parentSha);

    if (createBranch) await createGitRef(lockBranch, newCommit.sha);
    else await updateGitRef(lockBranch, newCommit.sha, true);
    state.lock.lastRemote = lockData;
    return newCommit;
  }

  function showBusyDialog(lock) {
    const editor = lockDisplayName(lock);
    const expires = lock?.expiresAt ? `Expiration automatique prévue : ${formatLockDate(lock.expiresAt)}.` : 'Expiration automatique non déterminée.';
    if (els.busyDetails) els.busyDetails.textContent = `Le site est actuellement verrouillé par ${editor}.`;
    if (els.busyExpiry) els.busyExpiry.textContent = expires;
    if (els.busyDialog?.showModal) els.busyDialog.showModal();
    else els.busyDialog?.setAttribute('open', '');
  }

  function closeBusyDialog() {
    els.busyDialog?.close?.();
    els.busyDialog?.removeAttribute?.('open');
  }

  function stopLockHeartbeat() {
    if (state.lock.heartbeatTimer) {
      clearInterval(state.lock.heartbeatTimer);
      state.lock.heartbeatTimer = null;
    }
  }

  function startLockHeartbeat() {
    stopLockHeartbeat();
    state.lock.heartbeatTimer = setInterval(() => {
      if (state.lock.releasing) return;
      renewEditorLock().catch((error) => log(`Renouvellement du verrou impossible : ${error.message}`, 'error'));
    }, state.lock.heartbeatMs);
  }

  async function acquireEditorLock({ force = false } = {}) {
    initLockIdentity();
    state.lock.releasing = false;
    const remote = await readEditorLock();
    const remoteLock = remote?.data;
    const activeOtherLock = isLockActive(remoteLock) && !isOwnLock(remoteLock);

    if (activeOtherLock && !force) {
      state.lock.acquired = false;
      state.lock.lastRemote = remoteLock;
      stopLockHeartbeat();
      renderLockStatus(`Site occupé par ${lockDisplayName(remoteLock)}.`, false);
      showBusyDialog(remoteLock);
      return false;
    }

    const nextLock = buildLockData(isOwnLock(remoteLock) ? remoteLock : {}, true);
    try {
      await commitLockData(nextLock, !remote?.refSha);
    } catch (error) {
      if (String(error.message || '').includes('GitHub 409') || String(error.message || '').includes('GitHub 422')) {
        const latest = await readEditorLock();
        if (latest?.data && isLockActive(latest.data) && !isOwnLock(latest.data) && !force) {
          state.lock.acquired = false;
          state.lock.lastRemote = latest.data;
          renderLockStatus(`Site occupé par ${lockDisplayName(latest.data)}.`, false);
          showBusyDialog(latest.data);
          return false;
        }
      }
      throw error;
    }

    state.lock.acquired = true;
    state.lock.lastRemote = nextLock;
    startLockHeartbeat();
    renderLockStatus();
    log(`Verrou éditorial obtenu pour ${state.lock.editorName}.`, 'ok');
    return true;
  }

  async function renewEditorLock() {
    if (!state.lock.acquired || state.lock.releasing) return false;
    const remote = await readEditorLock();
    if (state.lock.releasing) return false;
    const remoteLock = remote?.data;
    if (remoteLock && isLockActive(remoteLock) && !isOwnLock(remoteLock)) {
      state.lock.acquired = false;
      state.lock.lastRemote = remoteLock;
      stopLockHeartbeat();
      renderLockStatus(`Verrou perdu : le site est occupé par ${lockDisplayName(remoteLock)}.`, false);
      showBusyDialog(remoteLock);
      return false;
    }
    const nextLock = buildLockData(isOwnLock(remoteLock) ? remoteLock : {}, true);
    if (state.lock.releasing) return false;
    await commitLockData(nextLock, !remote?.refSha);
    if (state.lock.releasing) return false;
    state.lock.acquired = true;
    state.lock.lastRemote = nextLock;
    renderLockStatus();
    return true;
  }

  async function ensureOwnEditorLock() {
    if (!state.lock.acquired) return acquireEditorLock();
    const remote = await readEditorLock();
    const remoteLock = remote?.data;
    if (remoteLock && isLockActive(remoteLock) && !isOwnLock(remoteLock)) {
      state.lock.acquired = false;
      stopLockHeartbeat();
      renderLockStatus(`Site occupé par ${lockDisplayName(remoteLock)}.`, false);
      showBusyDialog(remoteLock);
      return false;
    }
    if (!remoteLock || !isLockActive(remoteLock)) {
      return acquireEditorLock();
    }
    return true;
  }

  async function releaseEditorLock({ silent = false } = {}) {
    initLockIdentity();
    state.lock.releasing = true;
    stopLockHeartbeat();
    if (els.releaseLock) els.releaseLock.disabled = true;
    renderLockStatus('Libération du verrou éditorial en cours...', false);
    if (!silent) log('Libération du verrou éditorial en cours...');

    try {
      let remote = await readEditorLock();
      let remoteLock = remote?.data;

      if (!remote?.refSha) {
        state.lock.acquired = false;
        state.lock.lastRemote = null;
        renderLockStatus('Aucun verrou éditorial actif.', false);
        if (!silent) log('Aucun verrou distant à libérer.', 'ok');
        return;
      }

      if (remoteLock && !isOwnLock(remoteLock)) {
        throw new Error(`Le verrou distant est détenu par ${lockDisplayName(remoteLock)}. Impossible de le libérer depuis cette session.`);
      }

      try {
        await deleteGitRefOptional(getLockBranchName());
      } catch (deleteError) {
        log(`Suppression directe du verrou impossible. Tentative de libération par écriture : ${deleteError.message}`, 'error');
        remote = await readEditorLock();
        remoteLock = remote?.data;
        if (remote?.refSha && (!remoteLock || isOwnLock(remoteLock))) {
          const releasedLock = buildLockData(remoteLock || {}, false);
          await commitLockData(releasedLock, false);
        } else if (remoteLock && !isOwnLock(remoteLock)) {
          throw new Error(`Le verrou distant est détenu par ${lockDisplayName(remoteLock)}. Impossible de le libérer depuis cette session.`);
        }
      }

      await sleep(700);
      const verification = await readEditorLock();
      if (verification?.data && isLockActive(verification.data) && isOwnLock(verification.data)) {
        throw new Error('GitHub indique encore un verrou actif après la demande de libération. Réessayez dans quelques secondes.');
      }

      state.lock.acquired = false;
      state.lock.lastRemote = null;
      renderLockStatus('Verrou éditorial libéré.', false);
      if (!silent) log('Verrou éditorial libéré côté GitHub.', 'ok');
    } catch (error) {
      if (!silent) log(`Impossible de libérer le verrou : ${error.message}`, 'error');
      renderLockStatus(`Libération impossible : ${error.message}`, false);
    } finally {
      state.lock.releasing = false;
      if (!state.lock.acquired) stopLockHeartbeat();
      if (els.releaseLock) els.releaseLock.disabled = !state.lock.acquired;
    }
  }

  async function getContent(path) {
    const fullPath = repoPath(path);
    const data = await githubFetch(`/contents/${encodeURIComponent(fullPath).replace(/%2F/g, '/')}?ref=${encodeURIComponent(state.config.branch)}`);
    if (Array.isArray(data)) return data;
    if (data.sha) state.shas.set(path, data.sha);
    return data;
  }

  async function getTextFile(path) {
    const data = await getContent(path);
    if (!data || Array.isArray(data) || data.type !== 'file') {
      throw new Error(`Fichier introuvable : ${path}`);
    }
    return base64ToUtf8(data.content);
  }

  async function getJSON(path) {
    return JSON.parse(await getTextFile(path));
  }

  function getRepoRawBasePath() {
    const prefix = normalizePrefix(state.config.prefix);
    const branch = encodeURIComponent(state.config.branch || 'main');
    const parts = [
      'https://raw.githubusercontent.com',
      encodeURIComponent(state.config.owner || ''),
      encodeURIComponent(state.config.repo || ''),
      branch
    ];
    if (prefix) parts.push(prefix.split('/').map(encodeURIComponent).join('/'));
    return `${parts.join('/')}/`;
  }

  function getPreviewCss() {
    return state.siteCss || `
      body { margin: 0; font-family: system-ui, sans-serif; color: #f2f6ff; background: #09101e; }
      .site-main { max-width: 74rem; margin: 0 auto; padding: 2rem; }
      .article { line-height: 1.65; }
      img { max-width: 100%; height: auto; }
      .infobox { float: right; width: min(320px, 100%); margin: .2rem 0 1rem 1.2rem; border: 1px solid rgba(255,255,255,.18); border-radius: 16px; overflow: hidden; }
      .infobox-title { margin: 0; padding: .85rem 1rem; }
      .infobox-image { margin: 0; }
      .infobox-image img { width: 100%; display: block; }
      .infobox-row { display: grid; grid-template-columns: 42% 1fr; gap: .5rem; padding: .65rem .8rem; border-top: 1px solid rgba(255,255,255,.18); }
      .infobox-label { margin: 0; opacity: .72; font-size: .86rem; }
    `;
  }

  function renderProductionPreview(container, documentHtml) {
    if (!container) return;
    container.innerHTML = '';
    const frame = document.createElement('iframe');
    frame.className = 'production-preview-frame';
    frame.setAttribute('title', 'Aperçu du rendu public');
    frame.setAttribute('sandbox', 'allow-same-origin allow-popups allow-popups-to-escape-sandbox');
    frame.srcdoc = documentHtml;
    frame.addEventListener('load', () => {
      try {
        const doc = frame.contentDocument;
        const height = Math.max(520, Math.min(1400, doc.documentElement.scrollHeight + 24));
        frame.style.height = `${height}px`;
      } catch (_) {
        frame.style.height = '760px';
      }
    });
    container.appendChild(frame);
  }

  function buildArticlePreviewDocument(article) {
    const site = state.site || { title: 'FDDS', language: 'fr' };
    const rawBase = getRepoRawBasePath();
    const safeSlug = article.slug || slugify(article.title || 'article');
    const categories = Array.isArray(article.categories) ? article.categories.join(', ') : '';
    return `<!DOCTYPE html>
<html lang="${escapeHTML(site.language || 'fr')}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHTML(article.title || 'Article')} — ${escapeHTML(site.title || 'FDDS')}</title>
<base href="${escapeHTML(rawBase)}pages/${escapeHTML(safeSlug)}.html">
<style>${getPreviewCss()}</style>
</head>
<body class="article-document">
<main class="site-main article-standalone" id="contenu" tabindex="-1">
<article class="article">
<header class="article-header">
<h1>${escapeHTML(article.title || '')}</h1>
<div class="article-meta">Catégories : ${escapeHTML(categories)}</div>
</header>
<div class="article-body">
${buildArticleBodyHtml(article)}
</div>
</article>
</main>
</body>
</html>`;
  }

  function buildHomeIntroPreviewDocument() {
    const site = state.site || { title: 'FDDS', language: 'fr' };
    const rawBase = getRepoRawBasePath();
    const home = state.home || {};
    return `<!DOCTYPE html>
<html lang="${escapeHTML(site.language || 'fr')}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHTML(site.title || 'FDDS')} — aperçu accueil</title>
<base href="${escapeHTML(rawBase)}index.html">
<style>${getPreviewCss()}</style>
</head>
<body>
<main class="site-main" data-view="home" id="contenu" tabindex="-1">
<section class="home-intro" id="home-intro">
<div class="home-intro-content" id="home-intro-content">
${home.introHtml || ''}
</div>
</section>
</main>
</body>
</html>`;
  }

  async function putFile(path, content, message, isBase64 = false) {
    const fullPath = repoPath(path);
    const payload = {
      message,
      content: isBase64 ? content : utf8ToBase64(content),
      branch: state.config.branch
    };
    const knownSha = state.shas.get(path);
    if (knownSha) payload.sha = knownSha;
    const data = await githubFetch(`/contents/${encodeURIComponent(fullPath).replace(/%2F/g, '/')}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const newSha = data?.content?.sha;
    if (newSha) state.shas.set(path, newSha);
    return data;
  }

  async function deleteFile(path, message) {
    const sha = state.shas.get(path);
    if (!sha) return;
    const fullPath = repoPath(path);
    await githubFetch(`/contents/${encodeURIComponent(fullPath).replace(/%2F/g, '/')}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, sha, branch: state.config.branch })
    });
    state.shas.delete(path);
  }


  async function getBranchRef() {
    return getGitRef(state.config.branch);
  }

  async function getGitCommit(commitSha) {
    return githubFetch(`/git/commits/${encodeURIComponent(commitSha)}`);
  }

  async function getGitBlob(blobSha) {
    return githubFetch(`/git/blobs/${encodeURIComponent(blobSha)}`);
  }

  async function createGitBlob(base64Content) {
    return githubFetch('/git/blobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: base64Content, encoding: 'base64' })
    });
  }

  async function createGitTree(baseTreeSha, treeEntries) {
    return githubFetch('/git/trees', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries })
    });
  }

  async function createGitCommit(message, treeSha, parentSha) {
    return githubFetch('/git/commits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] })
    });
  }

  async function updateBranchRef(commitSha) {
    return updateGitRef(state.config.branch, commitSha, false);
  }

  async function commitFilesInOneBatch({ files, images, deletedPaths, message }) {
    log('Préparation d’un commit unique GitHub.');

    const ref = await getBranchRef();
    const parentSha = ref.object?.sha;
    if (!parentSha) throw new Error('Impossible de déterminer le dernier commit de la branche.');

    const parentCommit = await getGitCommit(parentSha);
    const baseTreeSha = parentCommit.tree?.sha;
    if (!baseTreeSha) throw new Error('Impossible de déterminer l’arbre Git de référence.');

    const treeEntries = [];

    for (const image of images) {
      log(`Préparation image : ${image.path}`);
      const blob = await createGitBlob(image.base64);
      treeEntries.push({
        path: repoPath(image.path),
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
    }

    for (const [path, content] of [...files.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr-FR'))) {
      log(`Préparation fichier : ${path}`);
      treeEntries.push({
        path: repoPath(path),
        mode: '100644',
        type: 'blob',
        content
      });
    }

    for (const path of [...deletedPaths].sort((a, b) => a.localeCompare(b, 'fr-FR'))) {
      log(`Préparation suppression : ${path}`);
      treeEntries.push({
        path: repoPath(path),
        mode: '100644',
        type: 'blob',
        sha: null
      });
    }

    if (!treeEntries.length) {
      log('Aucun changement à publier.', 'ok');
      return null;
    }

    const newTree = await createGitTree(baseTreeSha, treeEntries);
    const newCommit = await createGitCommit(message, newTree.sha, parentSha);
    await updateBranchRef(newCommit.sha);

    state.shas.clear();
    log(`Commit unique créé : ${newCommit.sha.slice(0, 12)}.`, 'ok');
    return newCommit;
  }

  async function loadTree() {
    const data = await githubFetch(`/git/trees/${encodeURIComponent(state.config.branch)}?recursive=1`);
    const prefix = normalizePrefix(state.config.prefix);
    state.tree = (data.tree || [])
      .filter((item) => !prefix || item.path === prefix || item.path.startsWith(`${prefix}/`))
      .map((item) => ({ ...item, displayPath: prefix ? item.path.replace(`${prefix}/`, '') : item.path }));
    renderTree();
  }

  function renderTree() {
    if (!state.tree.length) {
      els.treeView.textContent = 'Aucune arborescence chargée.';
      return;
    }
    els.treeView.textContent = state.tree
      .sort((a, b) => a.displayPath.localeCompare(b.displayPath, 'fr-FR'))
      .map((item) => `${item.type === 'tree' ? 'dossier ' : 'fichier '} ${item.displayPath}`)
      .join('\n');
  }

  async function loadSiteFromGithub(options = {}) {
    try {
      assertConfig();
      setStatus('Chargement en cours', false);
      log('Chargement du site depuis GitHub...');
      if (!options.skipLock) {
        const hasLock = await acquireEditorLock();
        if (!hasLock) {
          setStatus('Site occupé', false);
          return;
        }
      }
      state.shas.clear();
      await loadTree();

      state.site = await getJSON('content/site.json');
      state.home = await getJSON('content/home.json');
      state.categories = await getJSON('content/categories.json');
      try {
        state.siteCss = await getTextFile('assets/css/styles.css');
        log('Feuille de style publique chargée pour les aperçus.', 'ok');
      } catch (_) {
        state.siteCss = '';
        log('Feuille de style publique introuvable. Les aperçus utilisent un style de secours.', 'error');
      }

      const articleDir = await getContent('content/articles');
      const articleFiles = articleDir.filter((item) => item.type === 'file' && item.name.endsWith('.json'));
      state.originalArticleFiles = new Set(articleFiles.map((item) => `content/articles/${item.name}`));
      state.articles = [];
      for (const file of articleFiles) {
        const article = await getJSON(`content/articles/${file.name}`);
        state.articles.push(normalizeArticle(article));
      }
      state.articles = sortByTitle(state.articles);

      state.originalPageFiles = new Set(
        state.tree
          .filter((item) => item.type === 'blob' && /^pages\/.+\.html$/.test(item.displayPath))
          .map((item) => item.displayPath)
      );

      try {
        state.images = await getJSON('data/images.json');
      } catch (_) {
        state.images = inferImagesFromTree();
      }

      state.loaded = true;
      state.selectedArticleSlug = state.articles[0]?.slug || null;
      state.selectedCategorySlug = state.categories[0]?.slug || null;
      renderAll();
      setStatus('Site chargé', true);
      log(`Site chargé : ${state.articles.length} articles, ${state.categories.length} catégories.`, 'ok');
    } catch (error) {
      setStatus('Erreur de chargement', false);
      log(error.message, 'error');
    }
  }

  function inferImagesFromTree() {
    return state.tree
      .filter((item) => item.type === 'blob' && /^assets\/images\//.test(item.displayPath))
      .map((item) => ({ name: item.displayPath.split('/').pop(), path: item.displayPath }));
  }

  const characterFieldDefinitions = [
    ['type', 'Type'],
    ['activity', 'Activité'],
    ['entourage', 'Entourage'],
    ['enemyOf', 'Ennemi de'],
    ['firstAppearance', 'Première apparition'],
    ['status', 'État']
  ];

  function defaultCharacterCard() {
    return {
      enabled: false,
      image: '',
      imageAlt: '',
      caption: '',
      type: '',
      activity: '',
      entourage: '',
      enemyOf: '',
      firstAppearance: '',
      status: ''
    };
  }

  function normalizeLabelForCard(label) {
    return normalizeForSearch(label).replace(/\s+/g, ' ');
  }

  function extractCharacterCardFromBody(bodyHtml = '') {
    const result = { card: defaultCharacterCard(), bodyHtml: bodyHtml || '', found: false };
    if (!bodyHtml || !bodyHtml.includes('infobox')) return result;
    const template = document.createElement('template');
    template.innerHTML = bodyHtml;
    const infobox = template.content.querySelector('aside.infobox');
    if (!infobox) return result;

    result.found = true;
    result.card.enabled = true;
    const img = infobox.querySelector('.infobox-image img, img');
    const caption = infobox.querySelector('.infobox-caption, figcaption');
    result.card.image = img?.getAttribute('src') || '';
    result.card.imageAlt = img?.getAttribute('alt') || '';
    result.card.caption = caption?.innerHTML?.trim() || '';

    infobox.querySelectorAll('.infobox-row').forEach((row) => {
      const label = normalizeLabelForCard(row.querySelector('.infobox-label')?.textContent || '');
      const value = row.querySelector('.infobox-value')?.innerHTML?.trim() || '';
      if (label === 'type') result.card.type = value;
      else if (label === 'activite') result.card.activity = value;
      else if (label === 'entourage') result.card.entourage = value;
      else if (label === 'ennemi de') result.card.enemyOf = value;
      else if (label === 'premiere apparition') result.card.firstAppearance = value;
      else if (label === 'etat') result.card.status = value;
    });

    infobox.remove();
    result.bodyHtml = template.innerHTML.trim();
    return result;
  }

  function hasCharacterCardData(card) {
    if (!card || typeof card !== 'object') return false;
    return ['image', 'imageAlt', 'caption', 'type', 'activity', 'entourage', 'enemyOf', 'firstAppearance', 'status']
      .some((key) => stripHTML(String(card[key] || '')).trim());
  }

  function isCharacterArticle(article) {
    if (!article) return false;
    const categories = Array.isArray(article.categories) ? article.categories : [];
    return article.template === 'character'
      || article.type === 'character'
      || article.characterCard?.enabled
      || hasCharacterCardData(article.characterCard)
      || categories.includes('Personnage');
  }

  function normalizeCharacterCard(card, bodyHtml = '', categories = []) {
    const extracted = extractCharacterCardFromBody(bodyHtml);
    const inputCard = card && typeof card === 'object' ? card : {};
    const merged = { ...defaultCharacterCard(), ...extracted.card, ...inputCard };
    const hasPersonCategory = categories.includes('Personnage');
    merged.enabled = Boolean(inputCard.enabled || extracted.found || hasPersonCategory || hasCharacterCardData(merged));
    return merged;
  }

  function normalizeArticle(article) {
    const categories = Array.isArray(article.categories) ? article.categories : [];
    const extracted = extractCharacterCardFromBody(article.bodyHtml || '');
    const characterCard = normalizeCharacterCard(article.characterCard, article.bodyHtml || '', categories);
    const template = article.template || article.type || (characterCard.enabled ? 'character' : 'general');
    return {
      slug: article.slug || slugify(article.title),
      title: article.title || 'Nouvel article',
      summary: article.summary || '',
      image: article.image || characterCard.image || '',
      categories,
      template: template === 'character' || characterCard.enabled ? 'character' : 'general',
      characterCard,
      bodyHtml: extracted.found ? extracted.bodyHtml : (article.bodyHtml || '')
    };
  }

  function renderAll() {
    renderHome();
    renderArticleList();
    renderArticleForm();
    renderCategoryList();
    renderCategoryForm();
    renderImages();
    renderImageSelectors();
    renderPendingImages();
  }

  function renderHome() {
    if (!state.home) return;
    els.homeCategoriesTitle.value = state.home.categoriesTitle || '';
    els.homeArticlesTitle.value = state.home.articlesTitle || '';
    els.homeCategoriesIntro.value = state.home.categoriesIntro || '';
    els.homeSearchLabel.value = state.home.searchLabel || '';
    els.homeSearchPlaceholder.value = state.home.searchPlaceholder || '';
    els.homeResetLabel.value = state.home.resetLabel || '';
    setRichHTML(els.homeIntroHtml, els.homeRichEditor, state.home.introHtml || '');
    renderProductionPreview(els.homePreview, buildHomeIntroPreviewDocument());
  }

  function collectHomeFromForm() {
    syncRichToTextarea(els.homeRichEditor, els.homeIntroHtml);
    if (!state.home) state.home = {};
    state.home.categoriesTitle = els.homeCategoriesTitle.value;
    state.home.articlesTitle = els.homeArticlesTitle.value;
    state.home.categoriesIntro = els.homeCategoriesIntro.value;
    state.home.searchLabel = els.homeSearchLabel.value;
    state.home.searchPlaceholder = els.homeSearchPlaceholder.value;
    state.home.resetLabel = els.homeResetLabel.value;
    state.home.introHtml = els.homeIntroHtml.value;
    renderProductionPreview(els.homePreview, buildHomeIntroPreviewDocument());
  }

  function renderArticleList() {
    const query = normalizeForSearch(els.articleListSearch.value || '');
    els.articleList.innerHTML = '';
    sortByTitle(state.articles)
      .filter((article) => !query || normalizeForSearch(`${article.title} ${article.slug}`).includes(query))
      .forEach((article) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `item-button${article.slug === state.selectedArticleSlug ? ' is-active' : ''}`;
        button.innerHTML = `${escapeHTML(article.title)}<small>${escapeHTML(article.slug)}</small>`;
        button.addEventListener('click', () => {
          saveArticleFromForm(false);
          state.selectedArticleSlug = article.slug;
          renderArticleList();
          renderArticleForm();
        });
        els.articleList.appendChild(button);
      });
  }

  function getSelectedArticle() {
    return state.articles.find((article) => article.slug === state.selectedArticleSlug) || null;
  }

  function renderCategoryCheckboxes(article) {
    els.articleCategories.innerHTML = '';
    sortCategories(state.categories).forEach((category) => {
      const label = document.createElement('label');
      label.className = 'checkbox-pill';
      const checked = article?.categories?.includes(category.label) ? 'checked' : '';
      label.innerHTML = `<input type="checkbox" value="${escapeHTML(category.label)}" ${checked}> ${escapeHTML(category.label)}`;
      const input = label.querySelector('input');
      input.addEventListener('change', () => {
        const selectedCategories = collectArticleCategories();
        if (selectedCategories.includes('Personnage')) syncCharacterControls(true);
        renderArticlePreview();
      });
      els.articleCategories.appendChild(label);
    });
  }

  function renderArticleForm() {
    const article = getSelectedArticle();
    if (!article) {
      els.articleTitle.value = '';
      els.articleSlug.value = '';
      els.articleImage.value = '';
      if (els.articleImageSelect) els.articleImageSelect.value = '';
      els.articleSummary.value = '';
      if (els.articleTemplate) els.articleTemplate.value = 'general';
      if (els.characterCardToggle) els.characterCardToggle.checked = false;
      setCharacterPanelVisible(false);
      renderCharacterCardFields(null);
      setRichHTML(els.articleBody, els.articleRichEditor, '');
      els.articleCategories.innerHTML = '';
      els.articlePreview.innerHTML = '';
      return;
    }
    els.articleTitle.value = article.title || '';
    els.articleSlug.value = article.slug || '';
    els.articleImage.value = article.image || '';
    if (els.articleImageSelect) els.articleImageSelect.value = article.image || '';
    els.articleSummary.value = article.summary || '';
    renderCharacterCardFields(article);
    setRichHTML(els.articleBody, els.articleRichEditor, article.bodyHtml || '');
    renderCategoryCheckboxes(article);
    renderArticlePreview();
  }

  function collectArticleCategories() {
    return $$('#article-categories input[type="checkbox"]')
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  function setCharacterPanelVisible(visible) {
    if (!els.characterPanel) return;
    els.characterPanel.hidden = !visible;
    els.characterPanel.classList.toggle('is-visible', Boolean(visible));
  }

  function setMiniHTML(element, html) {
    if (element && element.innerHTML !== (html || '')) element.innerHTML = html || '';
  }

  function getMiniHTML(element) {
    return element?.innerHTML?.trim() || '';
  }

  function isCharacterFormEnabled() {
    return els.articleTemplate?.value === 'character' || Boolean(els.characterCardToggle?.checked);
  }

  function syncCharacterControls(enabled) {
    if (els.articleTemplate) els.articleTemplate.value = enabled ? 'character' : 'general';
    if (els.characterCardToggle) els.characterCardToggle.checked = Boolean(enabled);
    setCharacterPanelVisible(enabled);
  }

  function renderCharacterCardFields(article) {
    const isCharacter = isCharacterArticle(article);
    syncCharacterControls(isCharacter);
    const card = { ...defaultCharacterCard(), ...(article?.characterCard || {}) };
    if (els.characterImage) els.characterImage.value = card.image || article?.image || '';
    if (els.characterImageSelect) els.characterImageSelect.value = card.image || article?.image || '';
    if (els.characterImageAlt) els.characterImageAlt.value = card.imageAlt || article?.title || '';
    if (els.characterCaption) els.characterCaption.value = card.caption || '';
    setMiniHTML(els.characterType, card.type || '');
    setMiniHTML(els.characterActivity, card.activity || '');
    setMiniHTML(els.characterEntourage, card.entourage || '');
    setMiniHTML(els.characterEnemyOf, card.enemyOf || '');
    setMiniHTML(els.characterFirstAppearance, card.firstAppearance || '');
    setMiniHTML(els.characterStatus, card.status || '');
  }

  function collectCharacterCardFromForm() {
    const enabled = isCharacterFormEnabled();
    return {
      ...defaultCharacterCard(),
      enabled,
      image: els.characterImage?.value?.trim() || '',
      imageAlt: els.characterImageAlt?.value?.trim() || '',
      caption: els.characterCaption?.value?.trim() || '',
      type: getMiniHTML(els.characterType),
      activity: getMiniHTML(els.characterActivity),
      entourage: getMiniHTML(els.characterEntourage),
      enemyOf: getMiniHTML(els.characterEnemyOf),
      firstAppearance: getMiniHTML(els.characterFirstAppearance),
      status: getMiniHTML(els.characterStatus)
    };
  }

  function saveArticleFromForm(withLog = true) {
    syncRichToTextarea(els.articleRichEditor, els.articleBody);
    const oldSlug = state.selectedArticleSlug;
    if (!oldSlug) return;
    const article = getSelectedArticle();
    if (!article) return;
    const nextSlug = slugify(els.articleSlug.value || els.articleTitle.value);
    article.title = els.articleTitle.value.trim() || 'Article sans titre';
    article.slug = nextSlug;
    article.image = els.articleImage.value.trim();
    article.summary = els.articleSummary.value.trim();
    article.categories = collectArticleCategories();
    article.template = isCharacterFormEnabled() ? 'character' : 'general';
    article.characterCard = collectCharacterCardFromForm();
    if (isCharacterFormEnabled() && article.characterCard.image && !article.image) {
      article.image = article.characterCard.image;
      els.articleImage.value = article.image;
    }
    article.bodyHtml = els.articleBody.value;
    if (oldSlug !== nextSlug) {
      state.selectedArticleSlug = nextSlug;
    }
    state.articles = sortByTitle(state.articles);
    renderArticleList();
    renderArticlePreview();
    if (withLog) log(`Article enregistré en mémoire : ${article.title}.`, 'ok');
  }

  function newArticle() {
    const baseSlug = 'nouvel-article';
    let slug = baseSlug;
    let index = 2;
    while (state.articles.some((article) => article.slug === slug)) {
      slug = `${baseSlug}-${index++}`;
    }
    const firstCategory = state.categories[0]?.label;
    state.articles.push({
      slug,
      title: 'Nouvel article',
      summary: '',
      image: '',
      categories: firstCategory ? [firstCategory] : [],
      template: 'general',
      characterCard: defaultCharacterCard(),
      bodyHtml: '<p>Nouveau contenu.</p>'
    });
    state.selectedArticleSlug = slug;
    renderArticleList();
    renderArticleForm();
    log('Nouvel article créé en mémoire.', 'ok');
  }

  function deleteArticle() {
    const article = getSelectedArticle();
    if (!article) return;
    if (!confirm(`Supprimer l’article « ${article.title} » en mémoire ?`)) return;
    state.articles = state.articles.filter((item) => item.slug !== article.slug);
    state.selectedArticleSlug = state.articles[0]?.slug || null;
    renderArticleList();
    renderArticleForm();
    log(`Article supprimé en mémoire : ${article.title}.`, 'ok');
  }

  function renderArticlePreview() {
    const article = getSelectedArticle();
    if (!article) return;
    syncRichToTextarea(els.articleRichEditor, els.articleBody);
    const checkedCategories = $$('#article-categories input:checked').map((input) => input.value);
    const previewArticle = {
      slug: els.articleSlug.value || slugify(els.articleTitle.value || 'article'),
      title: els.articleTitle.value,
      categories: checkedCategories,
      template: isCharacterFormEnabled() ? 'character' : 'general',
      characterCard: collectCharacterCardFromForm(),
      bodyHtml: els.articleBody.value
    };
    renderProductionPreview(els.articlePreview, buildArticlePreviewDocument(previewArticle));
  }

  function renderCategoryList() {
    els.categoryList.innerHTML = '';
    sortCategories(state.categories).forEach((category) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `item-button${category.slug === state.selectedCategorySlug ? ' is-active' : ''}`;
      button.innerHTML = `${escapeHTML(category.label)}<small>${escapeHTML(category.slug)}</small>`;
      button.addEventListener('click', () => {
        saveCategoryFromForm(false);
        state.selectedCategorySlug = category.slug;
        renderCategoryList();
        renderCategoryForm();
      });
      els.categoryList.appendChild(button);
    });
  }

  function getSelectedCategory() {
    return state.categories.find((category) => category.slug === state.selectedCategorySlug) || null;
  }

  function renderCategoryForm() {
    const category = getSelectedCategory();
    if (!category) {
      els.categoryLabel.value = '';
      els.categorySlug.value = '';
      els.categoryImage.value = '';
      if (els.categoryImageSelect) els.categoryImageSelect.value = '';
      els.categoryDescription.value = '';
      return;
    }
    els.categoryLabel.value = category.label || '';
    els.categorySlug.value = category.slug || '';
    els.categoryImage.value = category.image || '';
    if (els.categoryImageSelect) els.categoryImageSelect.value = category.image || '';
    els.categoryDescription.value = category.description || '';
  }

  function saveCategoryFromForm(withLog = true) {
    const oldSlug = state.selectedCategorySlug;
    if (!oldSlug) return;
    const category = getSelectedCategory();
    if (!category) return;
    const oldLabel = category.label;
    const newLabel = els.categoryLabel.value.trim() || 'Nouvelle catégorie';
    const newSlug = slugify(els.categorySlug.value || newLabel);
    category.label = newLabel;
    category.slug = newSlug;
    category.image = els.categoryImage.value.trim();
    category.description = els.categoryDescription.value.trim();
    if (oldLabel && oldLabel !== newLabel) {
      state.articles.forEach((article) => {
        article.categories = article.categories.map((label) => label === oldLabel ? newLabel : label);
      });
    }
    if (oldSlug !== newSlug) state.selectedCategorySlug = newSlug;
    state.categories = sortCategories(state.categories);
    renderCategoryList();
    renderCategoryCheckboxes(getSelectedArticle());
    if (withLog) log(`Catégorie enregistrée en mémoire : ${category.label}.`, 'ok');
  }

  function newCategory() {
    let slug = 'nouvelle-categorie';
    let index = 2;
    while (state.categories.some((category) => category.slug === slug)) {
      slug = `nouvelle-categorie-${index++}`;
    }
    state.categories.push({ slug, label: 'Nouvelle catégorie', description: '', image: '' });
    state.selectedCategorySlug = slug;
    renderCategoryList();
    renderCategoryForm();
    renderCategoryCheckboxes(getSelectedArticle());
    log('Nouvelle catégorie créée en mémoire.', 'ok');
  }

  function deleteCategory() {
    const category = getSelectedCategory();
    if (!category) return;
    if (!confirm(`Supprimer la catégorie « ${category.label} » en mémoire ? Elle sera aussi retirée des articles.`)) return;
    state.categories = state.categories.filter((item) => item.slug !== category.slug);
    state.articles.forEach((article) => {
      article.categories = article.categories.filter((label) => label !== category.label);
    });
    state.selectedCategorySlug = state.categories[0]?.slug || null;
    renderCategoryList();
    renderCategoryForm();
    renderCategoryCheckboxes(getSelectedArticle());
    log(`Catégorie supprimée en mémoire : ${category.label}.`, 'ok');
  }

  function renderImages() {
    els.imageGrid.innerHTML = '';
    state.images.forEach((image) => {
      const path = image.path || image.src || image.image || image;
      const card = document.createElement('div');
      card.className = 'image-card';
      card.innerHTML = `<img alt="" src="https://raw.githubusercontent.com/${escapeHTML(state.config.owner)}/${escapeHTML(state.config.repo)}/${escapeHTML(state.config.branch)}/${escapeHTML(repoPath(path))}"><code>${escapeHTML(path)}</code>`;
      els.imageGrid.appendChild(card);
    });
  }


  function imagePaths() {
    return state.images
      .map((image) => image.path || image.src || image.image || image)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b), 'fr-FR'));
  }

  function populateImageSelect(select, currentValue = '') {
    if (!select) return;
    const paths = imagePaths();
    select.innerHTML = '<option value="">Aucune image sélectionnée</option>' + paths.map((path) => `<option value="${escapeHTML(path)}">${escapeHTML(path)}</option>`).join('');
    select.value = currentValue || '';
  }

  function renderImageSelectors() {
    populateImageSelect(els.articleImageSelect, els.articleImage?.value || '');
    populateImageSelect(els.characterImageSelect, els.characterImage?.value || '');
    populateImageSelect(els.categoryImageSelect, els.categoryImage?.value || '');
    $$('.rich-image-select').forEach((select) => populateImageSelect(select, ''));
  }

  function renderPendingImages() {
    els.pendingImages.innerHTML = '';
    if (!state.pendingImages.length) {
      els.pendingImages.textContent = 'Aucune image en attente.';
      return;
    }
    state.pendingImages.forEach((image, index) => {
      const item = document.createElement('div');
      item.className = 'pending-item';
      item.innerHTML = `<span><strong>${escapeHTML(image.path)}</strong><br><small>${escapeHTML(image.mime || '')}, ${Math.round((image.size || 0) / 1024)} Ko</small></span>`;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'secondary';
      button.textContent = 'Retirer';
      button.addEventListener('click', () => {
        state.pendingImages.splice(index, 1);
        renderPendingImages();
      });
      item.appendChild(button);
      els.pendingImages.appendChild(item);
    });
  }

  async function queueImage() {
    const file = els.imageFile.files[0];
    const targetName = els.imageTargetName.value.trim() || file?.name;
    if (!file || !targetName) {
      log('Sélectionnez un fichier image et un nom cible.', 'error');
      return;
    }
    const arrayBuffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(arrayBuffer);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const path = `assets/images/${targetName.replace(/^assets\/images\//, '')}`;
    state.pendingImages.push({ path, base64: btoa(binary), mime: file.type, size: file.size });
    if (!state.images.some((image) => (image.path || image) === path)) {
      state.images.push({ name: path.split('/').pop(), path });
    }
    els.imageFile.value = '';
    els.imageTargetName.value = '';
    renderImages();
    renderImageSelectors();
    renderPendingImages();
    log(`Image ajoutée à la file : ${path}.`, 'ok');
  }

  function buildCharacterCardHtml(article) {
    const card = { ...defaultCharacterCard(), ...(article.characterCard || {}) };
    if (!card.enabled) return '';
    const imagePath = card.image || article.image || '';
    const imageAlt = card.imageAlt || article.title || '';
    const imageHtml = imagePath ? `<figure class="infobox-image">
<a href="${escapeHTML(imagePath)}">
<img alt="${escapeHTML(imageAlt)}" src="${escapeHTML(imagePath)}"/>
</a>
${card.caption ? `<figcaption class="infobox-caption">${card.caption}</figcaption>` : ''}
</figure>` : '';
    const rows = characterFieldDefinitions
      .map(([key, label]) => {
        const value = card[key] || '';
        if (!stripHTML(value)) return '';
        return `<div class="infobox-row">
<h3 class="infobox-label">${escapeHTML(label)}</h3>
<div class="infobox-value">${value}</div>
</div>`;
      })
      .filter(Boolean)
      .join('\n');
    return `<aside class="infobox">
<h2 class="infobox-title">${escapeHTML(article.title || '')}</h2>
${imageHtml}
${rows}
</aside>`;
  }

  function buildArticleBodyHtml(article) {
    return `${buildCharacterCardHtml(article)}
${article.bodyHtml || ''}`.trim();
  }

  const templates = {
    index: `<!DOCTYPE html>
<html lang="{{language}}">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>{{siteTitle}}</title>
<meta content="{{siteDescription}}" name="description"/>
<link href="assets/css/styles.css" rel="stylesheet"/>
<script defer src="assets/js/site.js"></script>
</head>
<body>
<a class="skip-link" href="#contenu">Aller au contenu</a>
<header class="site-header">
  <div class="brand">
    <a class="brand-link" data-home="true" href="index.html">
      <img alt="" class="brand-logo" src="{{brandLogo}}"/>
      <span>{{brandLabel}}</span>
    </a>
  </div>
</header>
<div class="site-shell">
<main class="site-main" data-view="home" id="contenu" tabindex="-1">
  <section class="home-intro" id="home-intro">
    <div class="home-intro-toolbar">
      <button aria-controls="home-intro-content" aria-expanded="true" class="intro-toggle" id="toggle-intro" type="button">Masquer la présentation</button>
    </div>
    <div class="home-intro-content" id="home-intro-content">
{{homeIntroHtml}}
    </div>
  </section>

  <section class="category-filter" aria-labelledby="categories-title">
    <h2 id="categories-title">{{categoriesTitle}}</h2>
    <p class="section-intro">{{categoriesIntro}}</p>
    <div class="category-select-wrapper">
      <label class="search-label" for="category-select">Filtrer par catégorie</label>
      <select class="category-select" id="category-select"></select>
    </div>
    <div aria-live="polite" class="category-grid" id="category-grid"></div>
  </section>

  <section class="article-browser" aria-labelledby="articles-title">
    <h2 id="articles-title">{{articlesTitle}}</h2>
    <div class="article-search-panel" role="search">
      <label class="search-label" for="site-search">{{searchLabel}}</label>
      <input autocomplete="off" class="site-search" id="site-search" placeholder="{{searchPlaceholder}}" type="search"/>
    </div>
    <div class="filter-toolbar"><button class="filter-reset" id="clear-filters" type="button">{{resetLabel}}</button></div>
    <p class="section-intro article-filter-summary" id="article-filter-summary">Tous les articles sont affichés.</p>
    <div class="card-grid" data-dynamic-articles="true" id="article-grid"></div>
    <p class="no-results" id="article-empty-state">Aucun article ne correspond aux filtres actifs.</p>
  </section>
</main>
</div>
</body>
</html>
`,
    article: `<!DOCTYPE html>
<html lang="{{language}}">
<head>
<meta charset="utf-8"/>
<meta content="width=device-width, initial-scale=1" name="viewport"/>
<title>{{articleTitle}} — {{siteTitle}}</title>
<link href="../assets/css/styles.css" rel="stylesheet"/>
</head>
<body class="article-document">
<main class="site-main article-standalone" id="contenu" tabindex="-1">
<!-- Fragment HTML chargé dynamiquement dans index.html -->
<!-- Titre : {{articleTitle}} -->
<article class="article">
<header class="article-header">
<h1>{{articleTitle}}</h1>
<div class="article-meta">Catégories : {{articleCategories}}</div>
</header>
<div class="article-body">
{{articleBodyHtml}}
</div>
</article>
</main>
</body>
</html>
`
  };

  function buildSiteFiles() {
    syncAllRichEditors();
    collectHomeFromForm();
    saveArticleFromForm(false);
    saveCategoryFromForm(false);

    const site = state.site || { title: 'Site', language: 'fr', brand: {} };
    const articles = sortByTitle(state.articles.map(normalizeArticle));
    const declaredCategories = sortCategories(state.categories.map((category) => ({
      slug: category.slug || slugify(category.label),
      label: category.label || 'Catégorie sans nom',
      description: category.description || '',
      image: category.image || ''
    })));
    const categoriesBySlug = new Map(declaredCategories.map((category) => [category.slug, category]));
    articles.forEach((article) => {
      article.categories.forEach((label) => {
        const slug = slugify(label);
        if (!categoriesBySlug.has(slug)) {
          categoriesBySlug.set(slug, { slug, label, description: '', image: '' });
        }
      });
    });
    const categories = sortCategories([...categoriesBySlug.values()]);

    const files = new Map();
    files.set('content/site.json', `${JSON.stringify(site, null, 2)}\n`);
    files.set('content/home.json', `${JSON.stringify(state.home, null, 2)}\n`);
    files.set('content/categories.json', `${JSON.stringify(sortCategories(state.categories), null, 2)}\n`);

    articles.forEach((article) => {
      files.set(`content/articles/${article.slug}.json`, `${JSON.stringify(article, null, 2)}\n`);
      const pageHTML = interpolate(templates.article, {
        language: escapeHTML(site.language || 'fr'),
        siteTitle: escapeHTML(site.title || ''),
        articleTitle: escapeHTML(article.title),
        articleCategories: escapeHTML(article.categories.join(', ')),
        articleBodyHtml: buildArticleBodyHtml(article)
      });
      files.set(`pages/${article.slug}.html`, pageHTML);
    });

    const articlesData = articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      path: `pages/${article.slug}.html`,
      categories: article.categories,
      image: article.image,
      summary: article.summary
    }));

    const searchIndex = articles.map((article) => ({
      slug: article.slug,
      title: article.title,
      path: `pages/${article.slug}.html`,
      categories: article.categories,
      summary: article.summary,
      searchText: normalizeForSearch([article.title, article.summary, article.categories.join(' '), stripHTML(buildArticleBodyHtml(article))].join(' '))
    }));

    files.set('data/articles.json', `${JSON.stringify(articlesData, null, 2)}\n`);
    files.set('data/categories.json', `${JSON.stringify(categories, null, 2)}\n`);
    files.set('data/search-index.json', `${JSON.stringify(searchIndex, null, 2)}\n`);
    files.set('data/images.json', `${JSON.stringify(state.images, null, 2)}\n`);

    const indexHTML = interpolate(templates.index, {
      language: escapeHTML(site.language || 'fr'),
      siteTitle: escapeHTML(site.title || ''),
      siteDescription: escapeHTML(site.description || ''),
      brandLogo: escapeHTML(site.brand?.logo || 'assets/images/site-logo.webp'),
      brandLabel: escapeHTML(site.brand?.label || site.title || ''),
      homeIntroHtml: state.home?.introHtml || '',
      categoriesTitle: escapeHTML(state.home?.categoriesTitle || 'Catégories principales'),
      categoriesIntro: escapeHTML(state.home?.categoriesIntro || 'Sélectionnez une catégorie pour filtrer les articles.'),
      articlesTitle: escapeHTML(state.home?.articlesTitle || 'Les articles'),
      searchLabel: escapeHTML(state.home?.searchLabel || 'Recherche'),
      searchPlaceholder: escapeHTML(state.home?.searchPlaceholder || ''),
      resetLabel: escapeHTML(state.home?.resetLabel || 'Réinitialiser les filtres')
    });
    files.set('index.html', indexHTML);

    files.set('build-summary-editor.json', `${JSON.stringify({
      generatedBy: 'FDDS Editor Webapp',
      generatedAt: new Date().toISOString(),
      articles: articles.length,
      categories: categories.length
    }, null, 2)}\n`);

    return { files, articles, categories, searchIndex };
  }

  function previewBuild() {
    if (!state.loaded) {
      log('Chargez d’abord le site.', 'error');
      return;
    }
    const build = buildSiteFiles();
    els.buildPreview.textContent = [
      `${build.articles.length} articles générés`,
      `${build.categories.length} catégories publiées`,
      `${build.searchIndex.length} entrées dans l’index de recherche`,
      '',
      ...[...build.files.keys()].sort().map((path) => `• ${path}`)
    ].join('\n');
    log('Prévisualisation de génération terminée.', 'ok');
  }

  async function publishGithub() {
    if (!state.loaded) {
      log('Chargez d’abord le site.', 'error');
      return;
    }
    if (!confirm('Publier les changements sur GitHub ?')) return;

    try {
      assertConfig();
      const hasLock = await ensureOwnEditorLock();
      if (!hasLock) return;
      const build = buildSiteFiles();
      const now = new Date().toISOString();
      const message = `Mise à jour éditoriale FDDS Editor — ${now}`;
      const nextFiles = new Set(build.files.keys());
      const deletedContentArticles = [...state.originalArticleFiles].filter((path) => !nextFiles.has(path));
      const nextPageFiles = new Set(build.articles.map((article) => `pages/${article.slug}.html`));
      const deletedPages = [...state.originalPageFiles].filter((path) => !nextPageFiles.has(path));
      const deletedPaths = new Set([...deletedContentArticles, ...deletedPages]);

      await commitFilesInOneBatch({
        files: build.files,
        images: state.pendingImages,
        deletedPaths,
        message
      });

      state.pendingImages = [];
      await loadSiteFromGithub({ skipLock: true });
      log('Publication terminée. Le verrou reste actif tant que vous ne quittez pas l’édition.', 'ok');
    } catch (error) {
      if (String(error.message || '').includes('GitHub 409')) {
        log('Conflit GitHub 409 : la branche a changé pendant la publication. Rechargez le site dans l’éditeur, puis relancez la publication.', 'error');
      }
      log(error.message, 'error');
    }
  }


  async function ensureZipLibrary() {
    if (!window.JSZip) {
      throw new Error('La bibliothèque ZIP n’est pas chargée. Vérifiez votre connexion internet ou rechargez l’éditeur.');
    }
    return window.JSZip;
  }

  async function downloadRepositoryZip() {
    if (!state.loaded) {
      log('Chargez d’abord le site.', 'error');
      return;
    }
    try {
      const JSZip = await ensureZipLibrary();
      assertConfig();
      await loadTree();
      const zip = new JSZip();
      const blobs = state.tree.filter((item) => item.type === 'blob');
      log(`Préparation du backup ZIP : ${blobs.length} fichiers.`);
      for (const item of blobs) {
        log(`Ajout au ZIP : ${item.displayPath}`);
        const blob = await getGitBlob(item.sha);
        const content = String(blob.content || '').replace(/\n/g, '');
        if (blob.encoding === 'base64') {
          zip.file(item.displayPath, content, { base64: true });
        }
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fdds-backup-complet-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      log('Backup ZIP complet généré.', 'ok');
    } catch (error) {
      log(error.message, 'error');
    }
  }

  function findCommonZipRoot(paths) {
    const firstSegments = paths
      .filter((path) => path.includes('/'))
      .map((path) => path.split('/')[0]);
    if (!firstSegments.length) return '';
    const candidate = firstSegments[0];
    return firstSegments.every((segment) => segment === candidate) && !paths.includes('index.html') ? `${candidate}/` : '';
  }

  async function restoreRepositoryZip(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (!state.loaded && !confirm('Le site n’est pas chargé. Continuer quand même après lecture de l’arborescence GitHub ?')) return;
    if (!confirm('Restaurer ce ZIP vers GitHub ? Cette opération remplacera les fichiers du dépôt de test par le contenu de l’archive.')) return;
    try {
      const JSZip = await ensureZipLibrary();
      assertConfig();
      await loadTree();
      const zip = await JSZip.loadAsync(file);
      const rawPaths = Object.keys(zip.files).filter((path) => !zip.files[path].dir && !path.includes('__MACOSX/'));
      const root = findCommonZipRoot(rawPaths);
      const files = new Map();
      const images = [];
      const nextPaths = new Set();

      for (const rawPath of rawPaths) {
        const normalizedPath = root ? rawPath.replace(root, '') : rawPath;
        if (!normalizedPath || normalizedPath.endsWith('/')) continue;
        nextPaths.add(normalizedPath);
        const zipEntry = zip.files[rawPath];
        if (isLikelyBinaryPath(normalizedPath)) {
          const base64 = await zipEntry.async('base64');
          images.push({ path: normalizedPath, base64 });
        } else {
          const text = await zipEntry.async('text');
          files.set(normalizedPath, text);
        }
      }

      const deletedPaths = new Set(
        state.tree
          .filter((item) => item.type === 'blob')
          .map((item) => item.displayPath)
          .filter((path) => !nextPaths.has(path))
      );

      await commitFilesInOneBatch({
        files,
        images,
        deletedPaths,
        message: `Restauration ZIP FDDS Editor — ${new Date().toISOString()}`
      });
      await loadSiteFromGithub();
      log('Restauration ZIP publiée sur GitHub.', 'ok');
    } catch (error) {
      log(error.message, 'error');
    } finally {
      event.target.value = '';
    }
  }

  function downloadBackup() {
    syncAllRichEditors();
    collectHomeFromForm();
    saveArticleFromForm(false);
    saveCategoryFromForm(false);
    const backup = {
      type: 'fdds-editor-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      site: state.site,
      home: state.home,
      categories: state.categories,
      articles: state.articles,
      images: state.images
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fdds-backup-editorial-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    log('Backup JSON généré.', 'ok');
  }

  async function restoreBackup(event) {
    const file = event.target.files[0];
    if (!file) return;
    const text = await file.text();
    const backup = JSON.parse(text);
    if (backup.type !== 'fdds-editor-backup') {
      log('Le fichier sélectionné ne ressemble pas à un backup FDDS Editor.', 'error');
      return;
    }
    state.site = backup.site;
    state.home = backup.home;
    state.categories = backup.categories || [];
    state.articles = backup.articles || [];
    state.images = backup.images || [];
    state.selectedArticleSlug = state.articles[0]?.slug || null;
    state.selectedCategorySlug = state.categories[0]?.slug || null;
    state.loaded = true;
    renderAll();
    log('Backup JSON restauré en mémoire. Publiez ensuite pour l’envoyer sur GitHub.', 'ok');
  }


  function getEditorFromBlock(block) {
    return block ? block.querySelector('.rich-editor') : null;
  }

  function applyRichCommand(button) {
    const block = button.closest('.rich-editor-block');
    const editor = getEditorFromBlock(block);
    if (!editor) return;
    editor.focus();
    document.execCommand(button.dataset.richCommand, false, null);
    syncRichToTextarea(editor, document.getElementById(block.dataset.richTarget));
    if (block.dataset.richTarget === 'article-body') renderArticlePreview();
    if (block.dataset.richTarget === 'home-intro-html') collectHomeFromForm();
  }

  function applyRichFormat(select) {
    const block = select.closest('.rich-editor-block');
    const editor = getEditorFromBlock(block);
    if (!editor) return;
    editor.focus();
    document.execCommand('formatBlock', false, select.value);
    syncRichToTextarea(editor, document.getElementById(block.dataset.richTarget));
    if (block.dataset.richTarget === 'article-body') renderArticlePreview();
    if (block.dataset.richTarget === 'home-intro-html') collectHomeFromForm();
  }

  function insertRichLink(button) {
    const block = button.closest('.rich-editor-block');
    const editor = getEditorFromBlock(block);
    if (!editor) return;
    openLinkDialog(editor);
  }

  function insertRichImage(button) {
    const block = button.closest('.rich-editor-block');
    const editor = getEditorFromBlock(block);
    const select = block?.querySelector('.rich-image-select');
    const path = select?.value;
    if (!editor || !path) {
      log('Choisissez une image avant de l’insérer.', 'error');
      return;
    }
    const alt = prompt('Texte alternatif de l’image, facultatif :') || '';
    editor.focus();
    document.execCommand('insertHTML', false, `<figure><img src="${escapeHTML(path)}" alt="${escapeHTML(alt)}"><figcaption>${escapeHTML(alt)}</figcaption></figure>`);
    syncRichToTextarea(editor, document.getElementById(block.dataset.richTarget));
    if (block.dataset.richTarget === 'article-body') renderArticlePreview();
    if (block.dataset.richTarget === 'home-intro-html') collectHomeFromForm();
  }

  function setupRichEditors() {
    document.addEventListener('selectionchange', rememberRichSelection);
    $$('.rich-editor').forEach((editor) => {
      editor.addEventListener('focus', () => { activeRichEditable = editor; rememberRichSelection(); });
      editor.addEventListener('keyup', rememberRichSelection);
      editor.addEventListener('mouseup', rememberRichSelection);
      editor.addEventListener('input', () => {
        const block = editor.closest('.rich-editor-block');
        const target = document.getElementById(block.dataset.richTarget);
        syncRichToTextarea(editor, target);
        if (block.dataset.richTarget === 'article-body') renderArticlePreview();
        if (block.dataset.richTarget === 'home-intro-html') collectHomeFromForm();
      });
    });
    $$('.rich-mini').forEach((editor) => {
      editor.addEventListener('focus', () => { activeRichEditable = editor; rememberRichSelection(); });
      editor.addEventListener('keyup', rememberRichSelection);
      editor.addEventListener('mouseup', rememberRichSelection);
      editor.addEventListener('input', renderArticlePreview);
    });
    $$('.rich-editor-block').forEach((block) => {
      const textarea = document.getElementById(block.dataset.richTarget);
      const editor = getEditorFromBlock(block);
      textarea?.addEventListener('input', () => {
        syncTextareaToRich(textarea, editor);
        if (textarea.id === 'article-body') renderArticlePreview();
        if (textarea.id === 'home-intro-html') collectHomeFromForm();
      });
    });
    $$('.rich-toolbar [data-rich-command]').forEach((button) => button.addEventListener('click', () => applyRichCommand(button)));
    $$('.rich-toolbar [data-rich-action="link"]').forEach((button) => button.addEventListener('click', () => insertRichLink(button)));
    $$('.rich-toolbar [data-rich-action="image"]').forEach((button) => button.addEventListener('click', () => insertRichImage(button)));
    $$('.rich-format').forEach((select) => select.addEventListener('change', () => applyRichFormat(select)));
  }


  const CONTEXT_HELP_ITEMS = [
    { selector: '#repo-owner', title: 'Propriétaire GitHub', text: 'Indiquez le nom du compte personnel ou de l’organisation qui possède le dépôt du site. C’est la première partie de l’adresse GitHub du dépôt.' },
    { selector: '#repo-name', title: 'Nom du dépôt', text: 'Indiquez uniquement le nom du dépôt GitHub qui contient le site, sans l’URL complète.' },
    { selector: '#repo-branch', title: 'Branche de publication', text: 'Indiquez la branche que l’éditeur doit lire et modifier. Dans la plupart des cas, il s’agit de main.' },
    { selector: '#repo-prefix', title: 'Préfixe de dossier', text: 'Laissez ce champ vide si le site est à la racine du dépôt. Renseignez-le uniquement si les fichiers du site sont rangés dans un sous-dossier.' },
    { selector: '#github-token', title: 'Token GitHub', text: 'Collez ici un token GitHub limité au dépôt du site. Il sert à lire les contenus, créer un commit et publier les modifications.' },
    { selector: '#editor-name', title: 'Nom du chroniqueur', text: 'Indiquez le nom affiché dans le verrou éditorial. Si un autre utilisateur ouvre l’éditeur, il verra que le site est occupé par ce chroniqueur.' },
    { selector: '#save-config', title: 'Enregistrer localement', text: 'Enregistre les informations de connexion dans ce navigateur pour éviter de les ressaisir à chaque ouverture.' },
    { selector: '#load-github', title: 'Charger depuis GitHub', text: 'Récupère les fichiers du site depuis le dépôt GitHub : contenus, catégories, articles, images et arborescence.' },
    { selector: '#forget-config', title: 'Effacer la configuration', text: 'Supprime de ce navigateur les informations de connexion enregistrées localement.' },
    { selector: '#release-lock', title: 'Quitter l’édition', text: 'Libère le verrou éditorial afin qu’un autre chroniqueur puisse charger le site dans son éditeur.' },
    { selector: '#refresh-tree', title: 'Rafraîchir l’arborescence', text: 'Recharge la liste des fichiers présents dans la branche GitHub sélectionnée.' },

    { selector: '#home-categories-title', title: 'Titre des catégories', text: 'Titre affiché au-dessus des filtres de catégories sur la page d’accueil du site public.' },
    { selector: '#home-articles-title', title: 'Titre des articles', text: 'Titre affiché au-dessus de la liste des cartes d’articles.' },
    { selector: '#home-categories-intro', title: 'Introduction des catégories', text: 'Court texte affiché dans la section des catégories. Il sert à expliquer la logique de navigation.' },
    { selector: '#home-search-label', title: 'Libellé de recherche', text: 'Texte affiché au-dessus du champ de recherche du site public.' },
    { selector: '#home-search-placeholder', title: 'Placeholder de recherche', text: 'Texte indicatif visible dans le champ de recherche quand celui-ci est vide.' },
    { selector: '#home-reset-label', title: 'Bouton de réinitialisation', text: 'Libellé du bouton qui vide la recherche et retire le filtre de catégorie actif.' },
    { selector: '[data-rich-editor="home-rich-editor"]', title: 'Bloc de présentation', text: 'Zone éditable correspondant au texte de présentation de la page d’accueil. Le HTML source reste disponible sous l’éditeur.', mode: 'self' },
    { selector: '#home-intro-html', title: 'HTML source de la présentation', text: 'Version HTML brute du bloc de présentation. À utiliser pour une correction précise lorsque l’éditeur riche ne suffit pas.' },

    { selector: '#article-title', title: 'Titre de l’article', text: 'Titre principal de l’article. Il est utilisé dans la page, dans la carte d’article et dans les données de recherche.' },
    { selector: '#article-slug', title: 'Slug de l’article', text: 'Identifiant technique utilisé dans les URL et les noms de fichiers. Il doit rester court, sans espace ni accent.' },
    { selector: '#article-image', title: 'Image principale', text: 'Chemin de l’image utilisée pour la carte de l’article sur la page d’accueil, par exemple assets/images/vega.webp.' },
    { selector: '#article-image-select', title: 'Choisir une image existante', text: 'Permet de sélectionner une image déjà connue du dépôt sans recopier son chemin manuellement.' },
    { selector: '#article-summary', title: 'Résumé de carte', text: 'Texte court affiché sur la carte de l’article. Il doit donner envie d’ouvrir l’article sans remplacer son contenu.' },
    { selector: '#article-template', title: 'Type d’article', text: 'Article général correspond à une page classique. Article personnage active la logique de carte personnage structurée.' },
    { selector: '#character-card-toggle', title: 'Carte personnage', text: 'Active ou désactive la carte personnage. Quand elle est active, les champs dédiés sont utilisés pour générer automatiquement la carte dans l’article.' },
    { selector: '#character-card-panel', title: 'Champs de carte personnage', text: 'Ces champs alimentent la carte personnage affichée dans l’article public. Les champs riches acceptent aussi des liens internes ou externes.', mode: 'self' },
    { selector: '#character-image', title: 'Image de la carte', text: 'Image affichée dans la carte personnage. Elle peut être différente de l’image principale utilisée pour la carte d’article.' },
    { selector: '#character-image-select', title: 'Image existante', text: 'Sélectionne une image déjà présente dans le dépôt pour l’utiliser dans la carte personnage.' },
    { selector: '#character-image-alt', title: 'Texte alternatif', text: 'Texte descriptif de l’image. Il améliore l’accessibilité et sert si l’image ne se charge pas.' },
    { selector: '#character-caption', title: 'Légende', text: 'Texte affiché sous l’image dans la carte personnage.' },
    { selector: '#character-type', title: 'Type', text: 'Information libre décrivant la nature du personnage : humain, machine, entité, faction incarnée, etc.' },
    { selector: '#character-activity', title: 'Activité', text: 'Activité, fonction ou rôle principal du personnage dans l’univers du site.' },
    { selector: '#character-entourage', title: 'Entourage', text: 'Personnages, groupes ou organisations associés au personnage. Vous pouvez créer des liens dans ce champ.' },
    { selector: '#character-enemy-of', title: 'Ennemi de', text: 'Personnages, groupes ou concepts avec lesquels le personnage est en opposition.' },
    { selector: '#character-first-appearance', title: 'Première apparition', text: 'Indiquez la première œuvre, page, épisode ou source où le personnage apparaît.' },
    { selector: '#character-status', title: 'État', text: 'Statut actuel du personnage : actif, disparu, mort, inconnu, reconstruit, etc.' },
    { selector: '#character-field-link', title: 'Créer un lien dans la carte', text: 'Sélectionnez du texte dans un champ de carte personnage, puis utilisez ce bouton pour lui appliquer un lien.' },
    { selector: '#character-field-unlink', title: 'Retirer un lien', text: 'Placez le curseur dans un lien ou sélectionnez le texte concerné, puis utilisez ce bouton pour retirer le lien.' },
    { selector: '.checkbox-group', title: 'Catégories de l’article', text: 'Les catégories déterminent l’affichage de la carte d’article dans les filtres de la page d’accueil et dans la recherche.', mode: 'self' },
    { selector: '[data-rich-editor="article-rich-editor"]', title: 'Corps de l’article', text: 'Zone principale de rédaction de l’article. Elle accepte titres, paragraphes, listes, liens et images.', mode: 'self' },
    { selector: '#article-body', title: 'HTML source de l’article', text: 'Version HTML brute du contenu de l’article. À utiliser seulement pour des corrections précises.' },
    { selector: '#save-article-local', title: 'Enregistrer en mémoire', text: 'Enregistre l’article dans l’état courant de l’éditeur. La modification n’est envoyée sur GitHub qu’au moment de la publication.' },
    { selector: '#delete-article-local', title: 'Supprimer en mémoire', text: 'Retire l’article de l’état courant de l’éditeur. La suppression n’est effective sur GitHub qu’après publication.' },

    { selector: '#category-label', title: 'Nom de catégorie', text: 'Nom visible de la catégorie sur le site public et dans l’éditeur.' },
    { selector: '#category-slug', title: 'Slug de catégorie', text: 'Identifiant technique de la catégorie. Il sert aux filtres, aux routes et aux données du site.' },
    { selector: '#category-image', title: 'Image de catégorie', text: 'Image affichée sur la carte de catégorie dans la page d’accueil.' },
    { selector: '#category-image-select', title: 'Choisir une image existante', text: 'Permet d’utiliser une image déjà présente dans le dépôt comme image de catégorie.' },
    { selector: '#category-description', title: 'Description de catégorie', text: 'Texte court qui explique ce que regroupe la catégorie sur la page d’accueil.' },
    { selector: '#save-category-local', title: 'Enregistrer en mémoire', text: 'Enregistre la catégorie dans l’état courant de l’éditeur. Elle sera publiée lors du prochain envoi vers GitHub.' },
    { selector: '#delete-category-local', title: 'Supprimer en mémoire', text: 'Supprime la catégorie de l’état courant. Vérifiez les articles associés avant publication.' },

    { selector: '#image-file', title: 'Fichier image', text: 'Sélectionnez une image locale à ajouter au dépôt. Elle sera placée dans assets/images/ lors de la publication.' },
    { selector: '#image-target-name', title: 'Nom de fichier cible', text: 'Nom du fichier tel qu’il sera enregistré dans assets/images/. Utilisez un nom court, sans espace, avec une extension adaptée.' },
    { selector: '#queue-image', title: 'Ajouter à la file', text: 'Prépare l’image pour la prochaine publication GitHub. Tant que vous ne publiez pas, elle reste seulement en attente dans l’éditeur.' },

    { selector: '#download-backup', title: 'Backup JSON', text: 'Télécharge une sauvegarde des contenus éditoriaux structurés : accueil, articles, catégories et index d’images.' },
    { selector: '#restore-backup', title: 'Restaurer un backup JSON', text: 'Recharge dans l’éditeur une sauvegarde éditoriale JSON. La restauration ne modifie GitHub qu’après publication.' },
    { selector: '#download-repo-zip', title: 'Backup ZIP complet', text: 'Télécharge une archive complète de la branche chargée du dépôt GitHub.' },
    { selector: '#restore-repo-zip', title: 'Restaurer un ZIP complet', text: 'Prépare la restauration complète d’une archive ZIP vers GitHub. À utiliser avec prudence, idéalement après test.' },
    { selector: '#preview-build', title: 'Prévisualiser la génération', text: 'Construit virtuellement les fichiers publics pour vérifier ce qui sera généré avant publication.' },
    { selector: '#publish-github', title: 'Publier sur GitHub', text: 'Génère les fichiers publics, prépare les contenus structurés et envoie l’ensemble vers GitHub dans un commit unique.' }
  ];

  function ensureHelpPopover() {
    let popover = $('#context-help-popover');
    if (popover) return popover;
    popover = document.createElement('div');
    popover.id = 'context-help-popover';
    popover.className = 'context-help-popover';
    popover.hidden = true;
    popover.setAttribute('role', 'dialog');
    popover.setAttribute('aria-live', 'polite');
    popover.innerHTML = `
      <div class="context-help-head">
        <strong class="context-help-title"></strong>
        <button type="button" class="context-help-close" aria-label="Fermer l’aide">×</button>
      </div>
      <p class="context-help-text"></p>
    `;
    document.body.appendChild(popover);
    popover.querySelector('.context-help-close').addEventListener('click', closeContextHelp);
    return popover;
  }

  function getHelpHost(element, mode) {
    if (!element) return null;
    if (mode === 'self') return element;
    if (element.matches('button, .button-like')) return element;
    return element.closest('label') || element.closest('fieldset') || element;
  }

  function addHelpButton(host, item) {
    if (!host || host.dataset.helpReady === 'true') return;
    host.dataset.helpReady = 'true';
    host.classList.add('has-context-help');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = host.matches('button, .button-like') ? 'context-help-trigger context-help-trigger-inline' : 'context-help-trigger';
    button.setAttribute('aria-label', `Aide : ${item.title}`);
    button.textContent = '?';
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openContextHelp(button, item);
    });
    if (host.matches('button, .button-like')) {
      host.insertAdjacentElement('afterend', button);
    } else {
      host.appendChild(button);
    }
  }

  function openContextHelp(trigger, item) {
    const popover = ensureHelpPopover();
    popover.querySelector('.context-help-title').textContent = item.title;
    popover.querySelector('.context-help-text').textContent = item.text;
    popover.hidden = false;
    popover.dataset.open = 'true';

    const rect = trigger.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 32);
    popover.style.width = `${width}px`;
    popover.style.left = '0px';
    popover.style.top = '0px';

    const popRect = popover.getBoundingClientRect();
    const preferredLeft = rect.left + rect.width / 2 - width / 2;
    const left = Math.max(16, Math.min(preferredLeft, window.innerWidth - width - 16));
    const below = rect.bottom + 10;
    const above = rect.top - popRect.height - 10;
    const top = below + popRect.height <= window.innerHeight - 16 ? below : Math.max(16, above);

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function closeContextHelp() {
    const popover = $('#context-help-popover');
    if (!popover) return;
    popover.hidden = true;
    delete popover.dataset.open;
  }

  function setupContextHelp() {
    ensureHelpPopover();
    CONTEXT_HELP_ITEMS.forEach((item) => {
      const element = document.querySelector(item.selector);
      const host = getHelpHost(element, item.mode);
      addHelpButton(host, item);
    });
    document.addEventListener('click', (event) => {
      const popover = $('#context-help-popover');
      if (!popover || popover.hidden) return;
      if (event.target.closest('.context-help-popover') || event.target.closest('.context-help-trigger')) return;
      closeContextHelp();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeContextHelp();
    });
    window.addEventListener('resize', closeContextHelp);
    window.addEventListener('scroll', closeContextHelp, true);
  }


  function setupUserGuideModal() {
    const openButton = $('#open-user-guide');
    const closeButton = $('#close-user-guide');
    const dialog = $('#user-guide-dialog');
    if (!openButton || !closeButton || !dialog) return;

    openButton.addEventListener('click', () => {
      if (typeof dialog.showModal === 'function') {
        dialog.showModal();
      } else {
        dialog.setAttribute('open', '');
      }
    });

    closeButton.addEventListener('click', () => dialog.close?.() || dialog.removeAttribute('open'));

    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) {
        dialog.close?.() || dialog.removeAttribute('open');
      }
    });
  }

  function switchTab(tabName) {
    $$('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tabName));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === `tab-${tabName}`));
  }

  function bindEvents() {
    $$('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    $('#save-config').addEventListener('click', saveConfig);
    $('#load-saved-config').addEventListener('click', loadSavedConfig);
    $('#forget-config').addEventListener('click', forgetConfig);
    $('#load-github').addEventListener('click', () => loadSiteFromGithub());
    els.releaseLock?.addEventListener('click', () => releaseEditorLock());
    $('#busy-close')?.addEventListener('click', closeBusyDialog);
    $('#busy-cancel')?.addEventListener('click', closeBusyDialog);
    $('#busy-retry')?.addEventListener('click', () => { closeBusyDialog(); loadSiteFromGithub(); });
    $('#busy-force')?.addEventListener('click', async () => {
      if (!confirm('Forcer la reprise du verrou peut interrompre le travail d’un autre chroniqueur. Continuer ?')) return;
      try {
        const ok = await acquireEditorLock({ force: true });
        if (ok) {
          closeBusyDialog();
          await loadSiteFromGithub({ skipLock: true });
        }
      } catch (error) {
        log(error.message, 'error');
      }
    });
    els.busyDialog?.addEventListener('click', (event) => { if (event.target === els.busyDialog) closeBusyDialog(); });
    window.addEventListener('beforeunload', () => { stopLockHeartbeat(); });
    $('#refresh-tree').addEventListener('click', async () => {
      try { assertConfig(); await loadTree(); log('Arborescence rafraîchie.', 'ok'); } catch (error) { log(error.message, 'error'); }
    });
    $('#clear-log').addEventListener('click', () => { els.log.textContent = ''; });

    [els.homeCategoriesTitle, els.homeArticlesTitle, els.homeCategoriesIntro, els.homeSearchLabel, els.homeSearchPlaceholder, els.homeResetLabel, els.homeIntroHtml]
      .forEach((input) => input.addEventListener('input', collectHomeFromForm));

    els.articleListSearch.addEventListener('input', renderArticleList);
    $('#new-article').addEventListener('click', newArticle);
    $('#save-article-local').addEventListener('click', () => saveArticleFromForm(true));
    $('#delete-article-local').addEventListener('click', deleteArticle);
    [els.articleTitle, els.articleSlug, els.articleImage, els.articleSummary, els.articleBody, els.characterImage, els.characterImageAlt, els.characterCaption]
      .filter(Boolean)
      .forEach((input) => input.addEventListener('input', () => renderArticlePreview()));
    els.articleTemplate?.addEventListener('change', () => {
      const enabled = els.articleTemplate.value === 'character';
      syncCharacterControls(enabled);
      renderArticlePreview();
    });
    els.characterCardToggle?.addEventListener('change', () => {
      syncCharacterControls(els.characterCardToggle.checked);
      renderArticlePreview();
    });
    els.characterImageSelect?.addEventListener('change', () => {
      els.characterImage.value = els.characterImageSelect.value;
      if (!els.articleImage.value) els.articleImage.value = els.characterImageSelect.value;
      renderArticlePreview();
    });
    els.characterFieldLink?.addEventListener('click', () => openLinkDialog(activeRichEditable?.classList.contains('rich-mini') ? activeRichEditable : null));
    els.characterFieldUnlink?.addEventListener('click', () => unlinkSelection(activeRichEditable?.classList.contains('rich-mini') ? activeRichEditable : null));
    $('#apply-link')?.addEventListener('click', () => {
      applyLink(els.linkUrl.value.trim(), els.linkTitle.value.trim());
      els.linkDialog?.close();
    });
    $('#cancel-link')?.addEventListener('click', () => els.linkDialog?.close());

    $('#new-category').addEventListener('click', newCategory);
    $('#save-category-local').addEventListener('click', () => saveCategoryFromForm(true));
    $('#delete-category-local').addEventListener('click', deleteCategory);
    $('#queue-image').addEventListener('click', queueImage);
    els.articleImageSelect?.addEventListener('change', () => { els.articleImage.value = els.articleImageSelect.value; saveArticleFromForm(false); });
    els.categoryImageSelect?.addEventListener('change', () => { els.categoryImage.value = els.categoryImageSelect.value; saveCategoryFromForm(false); });
    $('#download-backup').addEventListener('click', downloadBackup);
    $('#restore-backup').addEventListener('change', restoreBackup);
    $('#download-repo-zip').addEventListener('click', downloadRepositoryZip);
    $('#restore-repo-zip').addEventListener('change', restoreRepositoryZip);
    $('#preview-build').addEventListener('click', previewBuild);
    $('#publish-github').addEventListener('click', publishGithub);
  }

  setupRichEditors();
  bindEvents();
  setupContextHelp();
  setupUserGuideModal();
  loadSavedConfig();
})();
