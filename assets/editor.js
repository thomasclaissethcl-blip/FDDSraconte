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
    loaded: false
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
    token: $('#github-token'),
    treeView: $('#tree-view'),
    log: $('#log-output'),
    homeCategoriesTitle: $('#home-categories-title'),
    homeArticlesTitle: $('#home-articles-title'),
    homeCategoriesIntro: $('#home-categories-intro'),
    homeSearchLabel: $('#home-search-label'),
    homeSearchPlaceholder: $('#home-search-placeholder'),
    homeResetLabel: $('#home-reset-label'),
    homeIntroHtml: $('#home-intro-html'),
    homePreview: $('#home-preview'),
    articleList: $('#article-list'),
    articleListSearch: $('#article-list-search'),
    articleTitle: $('#article-title'),
    articleSlug: $('#article-slug'),
    articleImage: $('#article-image'),
    articleSummary: $('#article-summary'),
    articleCategories: $('#article-categories'),
    articleBody: $('#article-body'),
    articlePreview: $('#article-preview'),
    categoryList: $('#category-list'),
    categoryLabel: $('#category-label'),
    categorySlug: $('#category-slug'),
    categoryImage: $('#category-image'),
    categoryDescription: $('#category-description'),
    imageGrid: $('#image-grid'),
    imageFile: $('#image-file'),
    imageTargetName: $('#image-target-name'),
    pendingImages: $('#pending-images'),
    buildPreview: $('#build-preview')
  };

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
      token: els.token.value.trim()
    };
  }

  function writeConfigToForm(config) {
    els.owner.value = config.owner || '';
    els.repo.value = config.repo || '';
    els.branch.value = config.branch || 'main';
    els.prefix.value = config.prefix || '';
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
    const response = await fetch(apiUrl(path), { ...options, headers });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`GitHub ${response.status} ${response.statusText} — ${text.slice(0, 400)}`);
    }
    if (response.status === 204) return null;
    return response.json();
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
    return githubFetch(`/git/ref/heads/${encodeURIComponent(state.config.branch).replace(/%2F/g, '/')}`);
  }

  async function getGitCommit(commitSha) {
    return githubFetch(`/git/commits/${encodeURIComponent(commitSha)}`);
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
    return githubFetch(`/git/refs/heads/${encodeURIComponent(state.config.branch).replace(/%2F/g, '/')}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: commitSha, force: false })
    });
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

  async function loadSiteFromGithub() {
    try {
      assertConfig();
      setStatus('Chargement en cours', false);
      log('Chargement du site depuis GitHub...');
      state.shas.clear();
      await loadTree();

      state.site = await getJSON('content/site.json');
      state.home = await getJSON('content/home.json');
      state.categories = await getJSON('content/categories.json');

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

  function normalizeArticle(article) {
    return {
      slug: article.slug || slugify(article.title),
      title: article.title || 'Nouvel article',
      summary: article.summary || '',
      image: article.image || '',
      categories: Array.isArray(article.categories) ? article.categories : [],
      bodyHtml: article.bodyHtml || ''
    };
  }

  function renderAll() {
    renderHome();
    renderArticleList();
    renderArticleForm();
    renderCategoryList();
    renderCategoryForm();
    renderImages();
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
    els.homeIntroHtml.value = state.home.introHtml || '';
    els.homePreview.innerHTML = state.home.introHtml || '';
  }

  function collectHomeFromForm() {
    if (!state.home) state.home = {};
    state.home.categoriesTitle = els.homeCategoriesTitle.value;
    state.home.articlesTitle = els.homeArticlesTitle.value;
    state.home.categoriesIntro = els.homeCategoriesIntro.value;
    state.home.searchLabel = els.homeSearchLabel.value;
    state.home.searchPlaceholder = els.homeSearchPlaceholder.value;
    state.home.resetLabel = els.homeResetLabel.value;
    state.home.introHtml = els.homeIntroHtml.value;
    els.homePreview.innerHTML = state.home.introHtml || '';
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
      els.articleCategories.appendChild(label);
    });
  }

  function renderArticleForm() {
    const article = getSelectedArticle();
    if (!article) {
      els.articleTitle.value = '';
      els.articleSlug.value = '';
      els.articleImage.value = '';
      els.articleSummary.value = '';
      els.articleBody.value = '';
      els.articleCategories.innerHTML = '';
      els.articlePreview.innerHTML = '';
      return;
    }
    els.articleTitle.value = article.title || '';
    els.articleSlug.value = article.slug || '';
    els.articleImage.value = article.image || '';
    els.articleSummary.value = article.summary || '';
    els.articleBody.value = article.bodyHtml || '';
    renderCategoryCheckboxes(article);
    renderArticlePreview();
  }

  function collectArticleCategories() {
    return $$('#article-categories input[type="checkbox"]')
      .filter((input) => input.checked)
      .map((input) => input.value);
  }

  function saveArticleFromForm(withLog = true) {
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
    els.articlePreview.innerHTML = `<article class="article"><header><h1>${escapeHTML(els.articleTitle.value)}</h1></header><div>${els.articleBody.value}</div></article>`;
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
      els.categoryDescription.value = '';
      return;
    }
    els.categoryLabel.value = category.label || '';
    els.categorySlug.value = category.slug || '';
    els.categoryImage.value = category.image || '';
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
    renderPendingImages();
    log(`Image ajoutée à la file : ${path}.`, 'ok');
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
    collectHomeFromForm();
    saveArticleFromForm(false);
    saveCategoryFromForm(false);

    const site = state.site || { title: 'Site', language: 'fr', brand: {} };
    const articles = sortByTitle(state.articles.map(normalizeArticle));
    const declaredCategories = state.categories;
    const usedCategoryLabels = new Set();
    articles.forEach((article) => article.categories.forEach((label) => usedCategoryLabels.add(label)));
    const declaredBySlug = new Map(declaredCategories.map((category) => [category.slug || slugify(category.label), category]));
    const categories = sortCategories([...usedCategoryLabels].map((label) => {
      const slug = slugify(label);
      const declared = declaredBySlug.get(slug) || {};
      return { slug, label, description: declared.description || '', image: declared.image || '' };
    }));

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
        articleBodyHtml: article.bodyHtml || ''
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
      searchText: normalizeForSearch([article.title, article.summary, article.categories.join(' '), stripHTML(article.bodyHtml)].join(' '))
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
      await loadSiteFromGithub();
      log('Publication terminée.', 'ok');
    } catch (error) {
      if (String(error.message || '').includes('GitHub 409')) {
        log('Conflit GitHub 409 : la branche a changé pendant la publication. Rechargez le site dans l’éditeur, puis relancez la publication.', 'error');
      }
      log(error.message, 'error');
    }
  }

  function downloadBackup() {
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

  function switchTab(tabName) {
    $$('.tab').forEach((button) => button.classList.toggle('is-active', button.dataset.tab === tabName));
    $$('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.id === `tab-${tabName}`));
  }

  function bindEvents() {
    $$('.tab').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    $('#save-config').addEventListener('click', saveConfig);
    $('#load-saved-config').addEventListener('click', loadSavedConfig);
    $('#forget-config').addEventListener('click', forgetConfig);
    $('#load-github').addEventListener('click', loadSiteFromGithub);
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
    [els.articleTitle, els.articleSlug, els.articleImage, els.articleSummary, els.articleBody]
      .forEach((input) => input.addEventListener('input', () => renderArticlePreview()));

    $('#new-category').addEventListener('click', newCategory);
    $('#save-category-local').addEventListener('click', () => saveCategoryFromForm(true));
    $('#delete-category-local').addEventListener('click', deleteCategory);
    $('#queue-image').addEventListener('click', queueImage);
    $('#download-backup').addEventListener('click', downloadBackup);
    $('#restore-backup').addEventListener('change', restoreBackup);
    $('#preview-build').addEventListener('click', previewBuild);
    $('#publish-github').addEventListener('click', publishGithub);
  }

  bindEvents();
  loadSavedConfig();
})();
