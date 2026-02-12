(() => {
  'use strict';

  // ----- Base URL (for project pages) -----
  const BASE_URL = (() => {
    const meta = document.querySelector('meta[name="baseurl"]');
    const raw = meta && meta.content ? meta.content.trim() : '';
    if (!raw) return '';
    return raw.endsWith('/') ? raw.slice(0, -1) : raw;
  })();

  function resolveUrl(url) {
    if (!url) return '';
    if (/^(https?:)?\/\//i.test(url)) return url;
    if (url.startsWith('#')) return url;
    if (url.startsWith('/')) return BASE_URL + url;
    return BASE_URL + '/' + url;
  }

  function getQueryParam(key) {
    return new URLSearchParams(window.location.search).get(key);
  }

  function normalizeDate(ymd) {
    const s = (ymd || '').toString().trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function dateToNumber(ymd) {
    if (!ymd) return -Infinity;
    const [y, m, d] = ymd.split('-').map(Number);
    return y * 10000 + m * 100 + d;
  }

  function formatDate(ymd) {
    if (!ymd) return '未知日期';
    return ymd;
  }

  function toLower(s) {
    return (s || '').toString().trim().toLowerCase();
  }

  // Simple ASCII slug (for generating ids when missing)
  function slugify(s) {
    return (s || '')
      .toString()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60);
  }

  function safeArray(x) {
    return Array.isArray(x) ? x : (x ? [x] : []);
  }

  function buildSearchText(note) {
    return toLower([
      note.title,
      safeArray(note.tags).join(' '),
      note.abstract,
      note.venue,
      note.category
    ].filter(Boolean).join(' '));
  }

  function groupByDate(notes) {
    const map = new Map();
    for (const n of notes) {
      const k = n.date || 'unknown';
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(n);
    }
    const keys = Array.from(map.keys())
      .sort((a, b) => dateToNumber(b) - dateToNumber(a));
    return keys.map(k => ({
      dateKey: k,
      label: k === 'unknown' ? '未知日期' : formatDate(k),
      notes: map.get(k)
    }));
  }

  // ----- PDF.js lazy loader -----
  // 使用 PDF.js 的稳定版本号（与官方 getting_started 页面一致）
  const PDFJS = {
    version: '5.4.624',
    _lib: null,
    libUrl() { return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${this.version}/build/pdf.mjs`; },
    workerUrl() { return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${this.version}/build/pdf.worker.mjs`; },
    async load() {
      if (this._lib) return this._lib;
      const lib = await import(this.libUrl());
      lib.GlobalWorkerOptions.workerSrc = this.workerUrl();
      this._lib = lib;
      return lib;
    }
  };

  // ----- Reusable components (logic) -----
  window.NoteCard = function NoteCard(note, api, variant = 'list') {
    return {
      note,
      variant,
      get pdfUrl() { return api.resolveUrl(note.pdf); },
      get thumbUrl() { return note.thumbnail ? api.resolveUrl(note.thumbnail) : ''; },
      formatDate: api.formatDate,
      highlightClass: api.highlightClass,
      preview() { api.openModal(note); }
    };
  };

  // ----- Root app -----
  window.NotesApp = function NotesApp(cfg) {
    const config = cfg || {};
    const mode = config.mode || 'index'; // 'index' | 'category'
    const dataUrl = config.dataUrl || '/data/notes.json';

    return {
      // config
      mode,
      dataUrl,

      // data
      loading: true,
      error: '',
      notes: [],
      categories: [],
      allTags: [],

      // UI state
      view: mode === 'index' ? (localStorage.getItem('notes_view') || 'categories') : 'grid',
      search: '',
      filterTag: 'all',
      sort: 'date_desc',
      pageSize: mode === 'index' ? 10 : 12,
      page: 1,

      // category mode
      categoryKey: '',
      categoryLabel: '',
      categoryDescription: '',

      // modal viewer state
      modal: {
        open: false,
        note: null,
        usePdfjs: true,
        error: '',
        page: 1,
        pages: 0,
        zoom: 1.25,
        _pdfDoc: null,
        _pdfUrl: '',
        _token: 0
      },

      // expose helpers
      resolveUrl,
      formatDate,

      highlightClass(label) {
        const k = toLower(label);
        if (k === 'spotlight') return 'badge-spotlight';
        if (k === 'outstanding') return 'badge-outstanding';
        return '';
      },

      cardApi() {
        // 给 NoteCard 组件用：避免在模板里重复传一堆东西
        return {
          resolveUrl,
          formatDate,
          highlightClass: this.highlightClass.bind(this),
          openModal: this.openModal.bind(this)
        };
      },

      summaryText() {
        const total = this.filteredNotes.length;
        const tagText = this.filterTag === 'all' ? '全部标签' : `标签：${this.filterTag}`;
        const q = this.search ? `；搜索：“${this.search}”` : '';
        return `共 ${total} 条笔记（${tagText}${q}）`;
      },

      categoryHref(catKey) {
        return resolveUrl(`/notes/category.html?c=${encodeURIComponent(catKey)}`);
      },

      setView(v) {
        if (this.mode !== 'index') return;
        if (v !== 'categories' && v !== 'timeline') return;
        this.view = v;
        localStorage.setItem('notes_view', v);
        this.page = 1;
      },

      onFiltersChanged() {
        this.page = 1;
      },

      goPage(p) {
        const n = Math.max(1, Math.min(this.totalPages, Number(p)));
        if (!Number.isFinite(n)) return;
        this.page = n;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },

      toggleTheme() {
        const root = document.documentElement;
        const isDark = root.classList.toggle('dark');
        try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch (e) {}
      },

      // ----- lifecycle -----
      async init() {
        try {
          this.loading = true;
          this.error = '';

          if (this.mode === 'category') {
            this.categoryKey = toLower(getQueryParam('c') || '');
          }

          const res = await fetch(resolveUrl(dataUrl), { headers: { 'Accept': 'application/json' } });
          if (!res.ok) throw new Error(`加载 notes.json 失败：HTTP ${res.status}`);
          const data = await res.json();

          const rawNotes = Array.isArray(data) ? data : (data.notes || []);
          const categoriesInfo = (!Array.isArray(data) && data.categories) ? data.categories : {};

          // normalize notes
          const normalizedNotes = rawNotes.map((n, idx) => {
            const category = toLower(n.category) || 'others';
            const date = normalizeDate(n.date);
            const title = (n.title || '').toString().trim() || 'Untitled';
            const id = (n.id || '').toString().trim() || `${slugify(category)}-${slugify(title)}-${date || idx}`;
            const note = {
              id,
              title,
              category,
              date,
              venue: (n.venue || '').toString().trim(),
              abstract: (n.abstract || '').toString().trim(),
              tags: safeArray(n.tags).map(x => (x || '').toString().trim()).filter(Boolean),
              pdf: (n.pdf || '').toString().trim(),
              thumbnail: (n.thumbnail || '').toString().trim(),
              highlights: safeArray(n.highlights).map(x => (x || '').toString().trim()).filter(Boolean),
              _search: ''
            };
            note._search = buildSearchText(note);
            return note;
          });

          // categories aggregation
          const byCat = new Map();
          for (const note of normalizedNotes) {
            if (!byCat.has(note.category)) byCat.set(note.category, []);
            byCat.get(note.category).push(note);
          }

          const categories = Array.from(byCat.entries()).map(([key, notes]) => {
            const info = categoriesInfo[key] || {};
            const tagFreq = new Map();
            for (const n of notes) for (const t of safeArray(n.tags)) tagFreq.set(t, (tagFreq.get(t) || 0) + 1);
            const topTags = Array.from(tagFreq.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 5)
              .map(([t]) => t);

            return {
              key,
              label: info.label || (key.charAt(0).toUpperCase() + key.slice(1)),
              description: info.description || '',
              emoji: info.emoji || '📚',
              count: notes.length,
              topTags
            };
          }).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

          // tags aggregation
          const freq = new Map();
          for (const n of normalizedNotes) for (const t of safeArray(n.tags)) freq.set(t, (freq.get(t) || 0) + 1);
          const allTags = Array.from(freq.entries())
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
            .map(([t]) => t);

          this.notes = normalizedNotes;
          this.categories = categories;
          this.allTags = allTags;

          // category meta
          if (this.mode === 'category') {
            const cat = categories.find(c => c.key === this.categoryKey);
            this.categoryLabel = cat ? cat.label : (this.categoryKey || '');
            this.categoryDescription = cat ? cat.description : '';
            if (!cat) this.error = this.categoryKey ? `未找到分类：${this.categoryKey}` : '缺少分类参数 c';
          }

        } catch (e) {
          console.error(e);
          this.error = e.message || '加载失败';
        } finally {
          this.loading = false;
        }
      },

      // ----- derived -----
      get breadcrumbs() {
        if (this.mode === 'category') {
          return [
            { label: 'Home', href: resolveUrl('/') },
            { label: 'Notes', href: resolveUrl('/notes/') },
            { label: this.categoryLabel || this.categoryKey || 'Category', href: window.location.href }
          ];
        }
        return [
          { label: 'Home', href: resolveUrl('/') },
          { label: 'Notes', href: window.location.href }
        ];
      },

      get filteredNotes() {
        let list = this.notes;

        if (this.mode === 'category' && this.categoryKey) {
          list = list.filter(n => n.category === this.categoryKey);
        }

        const q = toLower(this.search);
        if (q) list = list.filter(n => n._search.includes(q));

        if (this.filterTag !== 'all') {
          list = list.filter(n => safeArray(n.tags).includes(this.filterTag));
        }

        // sort
        const sorted = list.slice().sort((a, b) => {
          if (this.sort === 'title_asc') return a.title.localeCompare(b.title);
          if (this.sort === 'title_desc') return b.title.localeCompare(a.title);
          if (this.sort === 'date_asc') return dateToNumber(a.date) - dateToNumber(b.date);
          return dateToNumber(b.date) - dateToNumber(a.date); // date_desc default
        });

        return sorted;
      },

      get totalPages() {
        return Math.max(1, Math.ceil(this.filteredNotes.length / this.pageSize));
      },

      get pagedNotes() {
        const p = Math.max(1, Math.min(this.totalPages, this.page));
        const start = (p - 1) * this.pageSize;
        return this.filteredNotes.slice(start, start + this.pageSize);
      },

      get timelineGroups() {
        return groupByDate(this.pagedNotes);
      },

      // ----- modal actions -----
      openModal(note) {
        this.modal.open = true;
        this.modal.note = note;
        this.modal.usePdfjs = true;
        this.modal.error = '';
        this.modal.page = 1;
        this.modal.zoom = 1.25;
        this.$nextTick(() => this.renderPdf());
      },

      closeModal() {
        this.modal.open = false;
        this.modal.note = null;
        this.modal.error = '';
        // 不强制清理 _pdfDoc：下次打开同一 PDF 更快
      },

      async renderPdf() {
        const note = this.modal.note;
        if (!note) return;

        const canvas = document.getElementById('notes-pdf-canvas');
        if (!canvas) return;

        const token = ++this.modal._token;
        const pdfUrl = resolveUrl(note.pdf);

        try {
          const lib = await PDFJS.load();

          let pdfDoc = this.modal._pdfDoc;
          if (!pdfDoc || this.modal._pdfUrl !== pdfUrl) {
            const task = lib.getDocument(pdfUrl);
            pdfDoc = await task.promise;
            this.modal._pdfDoc = pdfDoc;
            this.modal._pdfUrl = pdfUrl;
          }

          if (token !== this.modal._token) return;

          this.modal.pages = pdfDoc.numPages || 0;
          this.modal.page = Math.max(1, Math.min(this.modal.pages || 1, this.modal.page));

          const page = await pdfDoc.getPage(this.modal.page);
          if (token !== this.modal._token) return;

          const viewport = page.getViewport({ scale: this.modal.zoom });
          const outputScale = window.devicePixelRatio || 1;

          const ctx = canvas.getContext('2d', { alpha: false });
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = Math.floor(viewport.width) + 'px';
          canvas.style.height = Math.floor(viewport.height) + 'px';

          const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
          const renderContext = { canvasContext: ctx, viewport, transform };

          const renderTask = page.render(renderContext);
          await renderTask.promise;

        } catch (e) {
          console.error(e);
          this.modal.usePdfjs = false;
          this.modal.error = 'PDF.js 渲染失败，已回退为浏览器内嵌预览（或请直接新标签打开）。';
        }
      },

      modalPrev() {
        if (!this.modal.usePdfjs) return;
        this.modal.page = Math.max(1, this.modal.page - 1);
        this.renderPdf();
      },

      modalNext() {
        if (!this.modal.usePdfjs) return;
        this.modal.page = Math.min(this.modal.pages, this.modal.page + 1);
        this.renderPdf();
      },

      zoomIn() {
        if (!this.modal.usePdfjs) return;
        this.modal.zoom = Math.min(3.0, Math.round((this.modal.zoom + 0.15) * 100) / 100);
        this.renderPdf();
      },

      zoomOut() {
        if (!this.modal.usePdfjs) return;
        this.modal.zoom = Math.max(0.6, Math.round((this.modal.zoom - 0.15) * 100) / 100);
        this.renderPdf();
      }
    };
  };
})();
