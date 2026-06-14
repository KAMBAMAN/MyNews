// Default initial categories mapping to the game and tokusatsu sources
const DEFAULT_CATEGORIES = [
    {
        id: 'game',
        name: 'ゲーム',
        sources: [
            {
                id: 'denfami',
                name: '電ファミニコゲーマー',
                type: 'rss',
                url: 'https://news.denfaminicogamer.jp/feed',
                accentClass: 'denfami'
            },
            {
                id: 'fourgamer',
                name: '4Gamer.net',
                type: 'rss',
                url: 'http://www.4gamer.net/rss/index.xml',
                accentClass: 'fourgamer'
            },
            {
                id: 'automaton',
                name: 'AUTOMATON',
                type: 'rss',
                url: 'https://automaton-media.com/feed/',
                accentClass: 'automaton'
            },
            {
                id: 'famitsu',
                name: 'ファミ通.com',
                type: 'scraping',
                url: 'https://www.famitsu.com/',
                accentClass: 'famitsu'
            },
            {
                id: 'dengeki',
                name: '電撃オンライン',
                type: 'scraping',
                url: 'https://dengekionline.com/',
                accentClass: 'dengeki'
            }
        ]
    },
    {
        id: 'tokusatsu',
        name: '特撮',
        sources: [
            {
                id: 'oricon',
                name: 'オリコンニュース (特撮)',
                type: 'scraping',
                url: 'https://www.oricon.co.jp/',
                accentClass: 'oricon'
            },
            {
                id: 'tsuburaya',
                name: '円谷プロ公式サイト',
                type: 'scraping',
                url: 'https://m-78.jp/news',
                accentClass: 'tsuburaya'
            },
            {
                id: 'kamenrider',
                name: '仮面ライダー公式サイト',
                type: 'scraping',
                url: 'https://www.kamen-rider-official.com/',
                accentClass: 'kamenrider'
            },
            {
                id: 'ttfc',
                name: '東映特撮ファンクラブ',
                type: 'scraping',
                url: 'https://tokusatsu-fc.jp/',
                accentClass: 'ttfc'
            },
            {
                id: 'toei',
                name: '東映株式会社',
                type: 'scraping',
                url: 'https://www.toei.co.jp/entertainment/news/index.html',
                accentClass: 'toei'
            }
        ]
    }
];

// App State
let categories = JSON.parse(localStorage.getItem('gnh_categories')) || DEFAULT_CATEGORIES;

// Storage Migration: Update old static URLs if they exist in localStorage from previous versions
(function migrateStorage() {
    let updated = false;
    categories.forEach(cat => {
        if (cat.id === 'game') {
            cat.sources.forEach(src => {
                if (src.id === 'famitsu' && (src.url.includes('/category/new-article/') || src.url.includes('/news/'))) {
                    src.url = 'https://www.famitsu.com/';
                    updated = true;
                }
                if (src.id === 'dengeki' && src.url.includes('/archive/')) {
                    src.url = 'https://dengekionline.com/';
                    updated = true;
                }
            });
        }
        if (cat.id === 'tokusatsu') {
            cat.sources.forEach(src => {
                if (src.id === 'oricon' && (src.url.includes('/genre/tokusatsu') || src.url.endsWith('/genre/tokusatsu/'))) {
                    src.url = 'https://www.oricon.co.jp/';
                    updated = true;
                }
                if (src.id === 'kamenrider' && (src.url.includes('/news') || src.url.endsWith('/news/'))) {
                    src.url = 'https://www.kamen-rider-official.com/';
                    updated = true;
                }
            });
        }
    });
    
    // Add new default categories (like tokusatsu) if they are missing in user's localStorage
    const hasTokusatsu = categories.some(cat => cat.id === 'tokusatsu');
    if (!hasTokusatsu) {
        const tokusatsuCat = DEFAULT_CATEGORIES.find(cat => cat.id === 'tokusatsu');
        if (tokusatsuCat) {
            categories.push(tokusatsuCat);
            updated = true;
        }
    }

    if (updated) {
        localStorage.setItem('gnh_categories', JSON.stringify(categories));
    }
})();

let activeCategoryId = localStorage.getItem('gnh_active_category_id') || 'game';
let globalArticles = []; // Merged and deduplicated articles
let loadingStates = {};  // Source ID -> 'idle' | 'loading' | 'done' | 'error'
let filterHours = 8;     // Default timeframe: 8 hours (requested)
let activeTab = 'all';   // 'all' | 'favorites'
let activeSourceFilter = 'all'; // Default source filter (requested)
let favorites = JSON.parse(localStorage.getItem('gnh_favorites') || '[]');
let currentAbortController = null; // To cancel active parallel requests on category/timeframe switch

// DOM Elements
const articlesGrid = document.getElementById('articlesGrid');
const skeletonsContainer = document.getElementById('skeletonsContainer');
const emptyState = document.getElementById('emptyState');
const sourceStatuses = document.getElementById('sourceStatuses');
const progressBar = document.getElementById('progressBar');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const favCountSpan = document.getElementById('favCount');
const tabAll = document.getElementById('tabAll');
const tabFavorites = document.getElementById('tabFavorites');

// New DOM Elements for Categories, Modal, and Filters
const categoryTabs = document.getElementById('categoryTabs');
const sourceFilterContainer = document.getElementById('sourceFilterContainer');
const manageBtn = document.getElementById('manageBtn');
const manageModal = document.getElementById('manageModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTabCategories = document.getElementById('modalTabCategories');
const modalTabAddSource = document.getElementById('modalTabAddSource');
const modalSectionCategories = document.getElementById('modalSectionCategories');
const modalSectionAddSource = document.getElementById('modalSectionAddSource');
const newCategoryName = document.getElementById('newCategoryName');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const modalCategoryList = document.getElementById('modalCategoryList');
const sourceCategorySelect = document.getElementById('sourceCategorySelect');
const addSourceForm = document.getElementById('addSourceForm');
const sourceName = document.getElementById('sourceName');
const sourceUrl = document.getElementById('sourceUrl');

// Initialize App
function init() {
    // Render initial category tabs
    renderCategoryTabs();

    // Setup time filter buttons
    document.querySelectorAll('.time-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterHours = parseInt(btn.dataset.hours);
            startFetchNews();
        });
    });

    // Setup search input
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearSearchBtn.style.display = query ? 'block' : 'none';
        renderArticles();
    });

    clearSearchBtn.addEventListener('click', () => {
        searchInput.value = '';
        clearSearchBtn.style.display = 'none';
        renderArticles();
    });

    // Setup tabs
    tabAll.addEventListener('click', () => {
        activeTab = 'all';
        tabAll.classList.add('active');
        tabFavorites.classList.remove('active');
        renderArticles();
    });

    tabFavorites.addEventListener('click', () => {
        activeTab = 'favorites';
        tabFavorites.classList.add('active');
        tabAll.classList.remove('active');
        renderArticles();
    });

    // Modal Control Setup
    setupModalEvents();

    // Update initial fav count
    updateFavCountUI();

    // Start fetching
    startFetchNews();
}

// Render Category Tabs
function renderCategoryTabs() {
    categoryTabs.innerHTML = '';
    categories.forEach(cat => {
        const btn = document.createElement('button');
        btn.className = `category-tab ${cat.id === activeCategoryId ? 'active' : ''}`;
        btn.textContent = cat.name;
        btn.dataset.id = cat.id;
        btn.addEventListener('click', () => {
            if (activeCategoryId === cat.id && activeTab === 'all') return;
            activeCategoryId = cat.id;
            localStorage.setItem('gnh_active_category_id', activeCategoryId);
            
            // Switch back to "All articles" tab
            activeTab = 'all';
            tabAll.classList.add('active');
            tabFavorites.classList.remove('active');

            // Render tabs state
            document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
            btn.classList.add('active');

            startFetchNews();
        });
        categoryTabs.appendChild(btn);
    });
}

// Get sources for current active category
function getActiveSources() {
    const activeCat = categories.find(c => c.id === activeCategoryId);
    return activeCat ? activeCat.sources : [];
}

// Render Media Filter Chips dynamically based on current category sources
function renderSourceFilters() {
    sourceFilterContainer.innerHTML = '';
    
    const activeSources = getActiveSources();
    if (activeSources.length <= 1) {
        sourceFilterContainer.style.display = 'none';
        return;
    }
    sourceFilterContainer.style.display = 'flex';

    // 「すべて」のチップス
    const allChip = document.createElement('button');
    allChip.className = `filter-chip ${activeSourceFilter === 'all' ? 'active' : ''}`;
    allChip.textContent = 'すべて';
    allChip.addEventListener('click', () => {
        activeSourceFilter = 'all';
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        allChip.classList.add('active');
        renderArticles();
    });
    sourceFilterContainer.appendChild(allChip);

    // 各ソースのチップス
    activeSources.forEach(src => {
        const chip = document.createElement('button');
        chip.className = `filter-chip ${activeSourceFilter === src.id ? 'active' : ''}`;
        chip.textContent = src.name;
        chip.addEventListener('click', () => {
            activeSourceFilter = src.id;
            document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            renderArticles();
        });
        sourceFilterContainer.appendChild(chip);
    });
}

// Start news fetching process (parallelized)
function startFetchNews() {
    if (currentAbortController) {
        currentAbortController.abort();
    }
    currentAbortController = new AbortController();
    const signal = currentAbortController.signal;

    // カテゴリや期間の切り替え時にフィルターを「すべて」にリセット
    activeSourceFilter = 'all';
    renderSourceFilters();

    globalArticles = [];
    renderArticles(); // Clear list and show skeleton

    const activeSources = getActiveSources();
    
    if (activeSources.length === 0) {
        loadingStates = {};
        updateStatusPanelUI();
        skeletonsContainer.classList.add('hidden');
        renderArticles();
        return;
    }
    
    // Initialize loading states for active sources
    loadingStates = {};
    activeSources.forEach(src => {
        loadingStates[src.id] = 'loading';
    });
    updateStatusPanelUI();
    skeletonsContainer.classList.remove('hidden');

    // Run parallel fetch for active sources
    const fetchPromises = activeSources.map(src => {
        return fetchFromSource(src, signal)
            .then(articles => {
                if (signal.aborted) return;
                loadingStates[src.id] = 'done';
                if (articles && articles.length > 0) {
                    mergeArticles(articles);
                    skeletonsContainer.classList.add('hidden');
                }
            })
            .catch(err => {
                if (err.name === 'AbortError') {
                    console.log(`Fetch aborted for ${src.name}`);
                    return;
                }
                console.error(`Error fetching from ${src.name}:`, err);
                loadingStates[src.id] = 'error';
            })
            .finally(() => {
                if (!signal.aborted) {
                    updateStatusPanelUI();
                    renderArticles();
                }
            });
    });

    Promise.all(fetchPromises).finally(() => {
        if (!signal.aborted) {
            skeletonsContainer.classList.add('hidden');
        }
    });
}

// Fetch helper using fallback for multiple CORS Proxies (Reinforced for GitHub Pages)
async function fetchWithProxyFallback(targetUrl, signal) {
    const isOriconOrRider = targetUrl.includes('oricon.co.jp') || targetUrl.includes('kamen-rider-official.com');
    
    let proxiedUrls = [];
    
    if (isOriconOrRider) {
        // オリコン・仮面ライダー公式サイト（トップページに変更したため、corsproxy.io も並行で試す価値があります）
        proxiedUrls = [
            {
                name: 'corsproxy',
                url: `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
                parse: async (res) => await res.text()
            },
            {
                name: 'allorigins_raw',
                url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
                parse: async (res) => await res.text()
            },
            {
                name: 'allorigins_json',
                url: `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`,
                parse: async (res) => {
                    const json = await res.json();
                    return json.contents;
                }
            },
            {
                name: 'yacdn',
                url: `https://yacdn.org/proxy/${targetUrl}`,
                parse: async (res) => await res.text()
            }
        ];
    } else {
        // 通常のゲームカテゴリ等のリソース用（corsproxy.io を含めて並行フェッチ）
        proxiedUrls = [
            {
                name: 'corsproxy',
                url: `https://corsproxy.io/?url=${encodeURIComponent(targetUrl)}`,
                parse: async (res) => await res.text()
            },
            {
                name: 'yacdn',
                url: `https://yacdn.org/proxy/${targetUrl}`,
                parse: async (res) => await res.text()
            },
            {
                name: 'allorigins_raw',
                url: `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`,
                parse: async (res) => await res.text()
            }
        ];
    }

    // 各プロキシに対して非同期で取得を試みるPromise群を作成（並行実行）
    const fetchPromises = proxiedUrls.map(proxy => {
        return (async () => {
            let timeoutId = null;
            try {
                console.log(`[Parallel Proxy] Trying: ${proxy.name} -> ${proxy.url}`);
                
                const timerController = new AbortController();
                // 10秒で接続を切るタイムアウト設定
                timeoutId = setTimeout(() => {
                    timerController.abort();
                }, 10000);

                const combinedSignal = signal 
                    ? anySignal([signal, timerController.signal]) 
                    : timerController.signal;

                const response = await fetch(proxy.url, { signal: combinedSignal });
                clearTimeout(timeoutId);

                if (response.ok) {
                    const content = await proxy.parse(response);
                    if (content) {
                        console.log(`[Parallel Proxy] Successfully fetched via: ${proxy.name}`);
                        return content;
                    }
                }
                throw new Error(`Proxy status: ${response.status}`);
            } catch (err) {
                if (timeoutId) clearTimeout(timeoutId);
                
                if (err.name === 'AbortError') {
                    if (signal && signal.aborted) {
                        throw err; // ユーザーキャンセルは伝播
                    }
                    console.warn(`[Parallel Proxy] Timeout (10000ms): ${proxy.name}`);
                    throw new Error(`Timeout (10000ms)`);
                }
                console.warn(`[Parallel Proxy] Failed: ${proxy.name} -> ${err.message}`);
                throw err;
            }
        })();
    });

    // 最初に成功したプロキシのデータを採用する（手動 Promise.any 実装）
    return new Promise((resolve, reject) => {
        let completed = 0;
        let errors = [];
        
        fetchPromises.forEach((promise, idx) => {
            promise.then(resolve).catch(err => {
                errors.push(`${proxiedUrls[idx].name}: ${err.message}`);
                completed++;
                if (completed === fetchPromises.length) {
                    reject(new Error('All parallel proxies failed: ' + errors.join(' | ')));
                }
            });
        });
    });
}

// 複数のAbortSignalを合成するヘルパー
function anySignal(signals) {
    const controller = new AbortController();
    
    function onAbort() {
        controller.abort();
        cleanup();
    }
    
    function cleanup() {
        for (const signal of signals) {
            signal.removeEventListener('abort', onAbort);
        }
    }
    
    for (const signal of signals) {
        if (signal.aborted) {
            onAbort();
            break;
        }
        signal.addEventListener('abort', onAbort);
    }
    
    return controller.signal;
}

// Fetch helper with CORS Proxy or Local Proxy Server
async function fetchFromSource(src, signal) {
    let rawContent;
    
    // PCローカル実行時（localhostまたは127.0.0.1）は自分専用のプロキシサーバーを経由する
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    if (isLocalhost) {
        try {
            console.log(`[Local Proxy] Fetching ${src.name} via local server`);
            const localProxyUrl = `http://localhost:5000/api/fetch?url=${encodeURIComponent(src.url)}`;
            const response = await fetch(localProxyUrl, { signal });
            if (!response.ok) {
                throw new Error(`Local proxy returned status: ${response.status}`);
            }
            rawContent = await response.text();
        } catch (err) {
            if (err.name === 'AbortError') throw err;
            console.warn(`Local proxy failed for ${src.name}, falling back to public CORS proxies`, err);
            // ローカルプロキシが動いていない、またはエラーになった場合は公開CORSプロキシに自動でフォールバック
            rawContent = await fetchWithProxyFallback(src.url, signal);
        }
    } else {
        // クラウド上の静的ホスティング時は従来どおり公開CORSプロキシを使用
        rawContent = await fetchWithProxyFallback(src.url, signal);
    }
    
    const parser = new DOMParser();
    let articles = [];
    if (src.type === 'rss') {
        const doc = parser.parseFromString(rawContent, 'application/xml');
        articles = parseRSS(doc, src);
    } else {
        const doc = parser.parseFromString(rawContent, 'text/html');
        articles = parseScraping(doc, src);
    }

    // 特撮カテゴリの中の汎用ニュースソース（オリコン、東映株式会社）のみ特撮キーワードで絞り込む
    const activeCat = categories.find(c => c.sources.some(s => s.id === src.id));
    if (activeCat && activeCat.id === 'tokusatsu' && (src.id === 'oricon' || src.id === 'toei')) {
        const TOKUSATSU_KEYWORDS = [
            '特撮', '仮面ライダー', 'ウルトラマン', '戦隊', 'ゴジラ', 'ライダー', 
            'スーパー戦隊', 'ガメラ', 'キングオージャー', 'ドンブラザーズ', 
            'ゼンカイジャー', 'ギーツ', 'ガッチャード', 'ブンブンジャー', 'TTFC', 
            '東映特撮', '円谷', 'ウルトラセブン', 'ゼロ', 'ティガ', 'ゼッツ', 'テオ',
            'ヒーロー', '怪獣', 'シン・', '特撮ニュータイプ', '東映', 'ウルトラギャラクシー'
        ];
        articles = articles.filter(art => {
            const title = art.title.toLowerCase();
            const desc = art.description.toLowerCase();
            return TOKUSATSU_KEYWORDS.some(keyword => {
                const kw = keyword.toLowerCase();
                return title.includes(kw) || desc.includes(kw);
            });
        });
    }

    return articles;
}

// Parse RSS Feeds (Supports RSS 1.0, 2.0, Atom)
function parseRSS(doc, src) {
    const isAtom = doc.documentElement.tagName.toLowerCase() === 'feed';
    const now = new Date();
    const limitMs = filterHours * 60 * 60 * 1000;
    const articles = [];

    if (isAtom) {
        const entries = doc.querySelectorAll('entry');
        entries.forEach(entry => {
            const pubDateText = entry.querySelector('published')?.textContent || entry.querySelector('updated')?.textContent || '';
            const pubDate = new Date(pubDateText);
            
            if (isNaN(pubDate.getTime()) || (now - pubDate) > limitMs) {
                return;
            }

            const title = entry.querySelector('title')?.textContent || '';
            
            let link = '';
            const linkEl = entry.querySelector('link');
            if (linkEl) {
                link = linkEl.getAttribute('href') || linkEl.textContent || '';
            }

            let description = entry.querySelector('summary')?.textContent || entry.querySelector('content')?.textContent || '';
            description = description.replace(/<[^>]*>/g, '').trim();
            if (!description) description = title;

            articles.push({
                title: title.trim(),
                link: link.trim(),
                description: description.substring(0, 200),
                date: pubDate,
                source: src.name,
                sourceId: src.id
            });
        });
    } else {
        const items = doc.querySelectorAll('item');
        items.forEach(item => {
            const pubDateText = item.querySelector('pubDate')?.textContent || item.querySelector('dc\\:date')?.textContent || item.querySelector('date')?.textContent || '';
            const pubDate = new Date(pubDateText);
            
            if (isNaN(pubDate.getTime()) || (now - pubDate) > limitMs) {
                return;
            }

            const title = item.querySelector('title')?.textContent || '';
            const link = item.querySelector('link')?.textContent || item.getAttribute('rdf:about') || '';
            
            let description = item.querySelector('description')?.textContent || item.querySelector('encoded')?.textContent || '';
            description = description.replace(/<[^>]*>/g, '').trim();
            if (!description) description = title;

            articles.push({
                title: title.trim(),
                link: link.trim(),
                description: description.substring(0, 200),
                date: pubDate,
                source: src.name,
                sourceId: src.id
            });
        });
    }

    return articles;
}

// Parse Scraping Sites (ファミ通, 電撃オンライン)
function parseScraping(doc, src) {
    const articles = [];
    const now = new Date();
    const limitMs = filterHours * 60 * 60 * 1000;

    if (src.id === 'famitsu') {
        const seenUrls = new Set();
        
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/article/') && href.match(/\d+$/)) {
                const fullUrl = href.startsWith('http') ? href : `https://www.famitsu.com${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);

                let title = '';
                const titleEl = a.querySelector('p[class*="cardTitle"], p[class*="Title"], h2, h3');
                if (titleEl) {
                    title = titleEl.textContent.trim();
                } else {
                    title = a.textContent.trim();
                }

                if (!title) {
                    const img = a.querySelector('img');
                    if (img) title = img.getAttribute('alt') || '';
                }

                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 10) return;

                let pubDate = now;
                const timeEl = a.querySelector('time') || a.parentElement?.querySelector('time');
                if (timeEl) {
                    pubDate = parseRelativeTime(timeEl.textContent);
                } else {
                    const text = a.parentElement?.textContent || '';
                    const match = text.match(/(\d+)\s*(時間前|分前|日前)/);
                    if (match) {
                        pubDate = parseRelativeTime(match[0]);
                    }
                }

                if ((now - pubDate) > limitMs) {
                    return;
                }

                articles.push({
                    title,
                    link: fullUrl,
                    description: title, // use title as fallback summary
                    date: pubDate,
                    source: src.name,
                    sourceId: src.id
                });
            }
        });
    } 
    else if (src.id === 'dengeki') {
        const seenUrls = new Set();
        
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/articles/')) {
                const fullUrl = href.startsWith('http') ? href : `https://dengekionline.com${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);

                let title = '';
                const titleEl = a.querySelector('p[class*="title"], p[class*="Title"], h2, h3, p');
                if (titleEl) {
                    title = titleEl.textContent.trim();
                } else {
                    title = a.textContent.trim();
                }
                
                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 10) return;

                let pubDate = now;
                const timeEl = a.querySelector('time') || a.parentElement?.querySelector('time');
                if (timeEl) {
                    const timeText = timeEl.textContent.trim();
                    pubDate = new Date(timeText);
                    if (isNaN(pubDate.getTime())) {
                        pubDate = parseRelativeTime(timeText);
                    }
                } else {
                    const text = a.parentElement?.textContent || '';
                    const match = text.match(/(\d+)\s*(時間前|分前|日前)/);
                    if (match) {
                        pubDate = parseRelativeTime(match[0]);
                    }
                }

                if ((now - pubDate) > limitMs) {
                    return;
                }

                const descEl = a.querySelector('p[class*="description"], p[class*="Description"]');
                const description = descEl ? descEl.textContent.trim() : title;

                articles.push({
                    title,
                    link: fullUrl,
                    description,
                    date: pubDate,
                    source: src.name,
                    sourceId: src.id
                });
            }
        });
    }
    else if (src.id === 'oricon') {
        const seenUrls = new Set();
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/news/') && (href.includes('/full/') || href.match(/\/\d+\//))) {
                const fullUrl = href.startsWith('http') ? href : `https://www.oricon.co.jp${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);

                let title = a.textContent.trim();
                if (title.length < 10) {
                    const img = a.querySelector('img');
                    if (img) title = img.getAttribute('alt') || '';
                }
                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 10) return;

                let pubDate = now;
                // オリコンのリストにある日付（例：2026-06-14 12:00 や相対表記）を解析
                const parentText = a.parentElement?.textContent || a.parentElement?.parentElement?.textContent || '';
                const dateMatch = parentText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/) || parentText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
                if (dateMatch) {
                    pubDate = new Date(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`);
                } else {
                    const match = parentText.match(/(\d+)\s*(時間前|分前|日前)/);
                    if (match) {
                        pubDate = parseRelativeTime(match[0]);
                    }
                }

                if ((now - pubDate) > limitMs) return;

                articles.push({
                    title,
                    link: fullUrl,
                    description: title,
                    date: pubDate,
                    source: src.name,
                    sourceId: src.id
                });
            }
        });
    }
    else if (src.id === 'tsuburaya') {
        const seenUrls = new Set();
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/news/')) {
                const cleanHref = href.split('#')[0].split('?')[0];
                if (cleanHref.endsWith('/news/') || cleanHref.endsWith('/news')) return;

                const fullUrl = href.startsWith('http') ? href : `https://m-78.jp${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);

                let title = a.textContent.trim();
                if (title.length < 8) {
                    const img = a.querySelector('img');
                    if (img) title = img.getAttribute('alt') || '';
                }
                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 8) return;

                let pubDate = now;
                const parentText = a.parentElement?.textContent || a.parentElement?.parentElement?.textContent || '';
                const dateMatch = parentText.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/) || parentText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
                if (dateMatch) {
                    pubDate = new Date(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`);
                }

                if (isNaN(pubDate.getTime()) || (now - pubDate) > limitMs) return;

                articles.push({
                    title,
                    link: fullUrl,
                    description: title,
                    date: pubDate,
                    source: src.name,
                    sourceId: src.id
                });
            }
        });
    }
    else if (src.id === 'kamenrider') {
        const seenUrls = new Set();
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && href.includes('/news/')) {
                const cleanHref = href.split('#')[0].split('?')[0];
                if (cleanHref.endsWith('/news/') || cleanHref.endsWith('/news')) return;

                const fullUrl = href.startsWith('http') ? href : `https://www.kamen-rider-official.com${href}`;
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);

                let title = a.textContent.trim();
                if (title.length < 8) {
                    const img = a.querySelector('img');
                    if (img) title = img.getAttribute('alt') || '';
                }
                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 8) return;

                let pubDate = now;
                const parentText = a.parentElement?.textContent || a.parentElement?.parentElement?.textContent || '';
                const dateMatch = parentText.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/) || parentText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
                if (dateMatch) {
                    pubDate = new Date(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`);
                }

                if (isNaN(pubDate.getTime()) || (now - pubDate) > limitMs) return;

                articles.push({
                    title,
                    link: fullUrl,
                    description: title,
                    date: pubDate,
                    source: src.name,
                    sourceId: src.id
                });
            }
        });
    }
    else if (src.id === 'ttfc') {
        const seenUrls = new Set();
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href) {
                const isRelative = href.startsWith('/') && !href.startsWith('//');
                const isToei = href.includes('toei.co.jp');
                const isTTFC = href.includes('tokusatsu-fc.jp');

                if (isRelative || isToei || isTTFC) {
                    const fullUrl = isRelative ? `https://tokusatsu-fc.jp${href}` : href;
                    if (seenUrls.has(fullUrl)) return;
                    seenUrls.add(fullUrl);

                    let title = a.textContent.trim();
                    if (title.length < 10) {
                        const img = a.querySelector('img');
                        if (img) title = img.getAttribute('alt') || '';
                    }
                    title = title.replace(/\s+/g, ' ').trim();
                    if (title.length < 10) return;

                    let pubDate = now;
                    const parentText = a.parentElement?.textContent || a.parentElement?.parentElement?.textContent || '';
                    const dateMatch = parentText.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/) || parentText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
                    if (dateMatch) {
                        pubDate = new Date(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`);
                    }

                    if (isNaN(pubDate.getTime()) || (now - pubDate) > limitMs) return;

                    articles.push({
                        title,
                        link: fullUrl,
                        description: title,
                        date: pubDate,
                        source: src.name,
                        sourceId: src.id
                    });
                }
            }
        });
    }
    else if (src.id === 'toei') {
        const seenUrls = new Set();
        doc.querySelectorAll('a').forEach(a => {
            const href = a.getAttribute('href');
            if (href && (href.includes('/news/detail/') || href.includes('detail/'))) {
                let fullUrl = href;
                if (!href.startsWith('http')) {
                    const cleanPath = href.replace(/^[./]+/, '');
                    fullUrl = `https://www.toei.co.jp/entertainment/news/${cleanPath}`;
                }
                if (seenUrls.has(fullUrl)) return;
                seenUrls.add(fullUrl);

                let title = a.textContent.trim();
                if (title.length < 10) {
                    const img = a.querySelector('img');
                    if (img) title = img.getAttribute('alt') || '';
                }
                title = title.replace(/\s+/g, ' ').trim();
                if (title.length < 10) return;

                let pubDate = now;
                const parentText = a.parentElement?.textContent || a.parentElement?.parentElement?.textContent || '';
                const dateMatch = parentText.match(/(\d{4})\.(\d{1,2})\.(\d{1,2})/) || parentText.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
                if (dateMatch) {
                    pubDate = new Date(`${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`);
                }

                if (isNaN(pubDate.getTime()) || (now - pubDate) > limitMs) return;

                articles.push({
                    title,
                    link: fullUrl,
                    description: title,
                    date: pubDate,
                    source: src.name,
                    sourceId: src.id
                });
            }
        });
    }

    return articles;
}

// Relative time parser helper
function parseRelativeTime(text) {
    const now = new Date();
    const cleanText = text.trim();
    
    const hourMatch = cleanText.match(/(\d+)\s*時間前/);
    if (hourMatch) {
        now.setHours(now.getHours() - parseInt(hourMatch[1]));
        return now;
    }
    
    const minuteMatch = cleanText.match(/(\d+)\s*分前/);
    if (minuteMatch) {
        now.setMinutes(now.getMinutes() - parseInt(minuteMatch[1]));
        return now;
    }
    
    const dayMatch = cleanText.match(/(\d+)\s*日前/);
    if (dayMatch) {
        now.setDate(now.getDate() - parseInt(dayMatch[1]));
        return now;
    }
    
    const parsed = Date.parse(cleanText);
    if (!isNaN(parsed)) {
        return new Date(parsed);
    }
    
    return now;
}

// Merge new articles into the global list and perform deduplication
function mergeArticles(newArticles) {
    newArticles.forEach(art => {
        const dupIndex = globalArticles.findIndex(existing => {
            return checkTitleSimilarity(existing.title, art.title);
        });

        if (dupIndex !== -1) {
            const existing = globalArticles[dupIndex];
            
            const sourceExists = existing.sources.some(s => s.id === art.sourceId);
            if (!sourceExists) {
                existing.sources.push({
                    id: art.sourceId,
                    name: art.source,
                    url: art.link
                });
            }

            if (art.date > existing.date) {
                existing.date = art.date;
            }

            if (art.description && art.description.length > existing.description.length) {
                existing.description = art.description;
            }

            if (art.title.length < existing.title.length && art.title.length > 15) {
                existing.title = art.title;
            }
        } else {
            globalArticles.push({
                id: `${art.sourceId}_${art.date.getTime()}_${Math.random().toString(36).substr(2, 5)}`,
                title: art.title,
                description: art.description,
                date: art.date,
                sources: [
                    {
                        id: art.sourceId,
                        name: art.source,
                        url: art.link
                    }
                ]
            });
        }
    });
}

// Check title similarity using Dice's Coefficient (Bi-gram based)
function checkTitleSimilarity(title1, title2) {
    const str1 = normalizeString(title1);
    const str2 = normalizeString(title2);

    if (str1 === str2) return true;
    if (str1.includes(str2) || str2.includes(str1)) {
        const minLength = Math.min(str1.length, str2.length);
        if (minLength > 12) return true;
    }

    const bigrams1 = getBigrams(str1);
    const bigrams2 = getBigrams(str2);

    if (bigrams1.length === 0 || bigrams2.length === 0) return false;

    let intersection = 0;
    const matches = new Set();
    
    bigrams1.forEach(bg1 => {
        bigrams2.forEach((bg2, idx) => {
            if (bg1 === bg2 && !matches.has(idx)) {
                intersection++;
                matches.add(idx);
            }
        });
    });

    const dice = (2.0 * intersection) / (bigrams1.length + bigrams2.length);
    return dice >= 0.45;
}

// Normalize strings (NFKC conversion, lowercase, punctuation removal)
function normalizeString(str) {
    return str
        .normalize('NFKC')
        .toLowerCase()
        .replace(/【[^】]+】/g, '')
        .replace(/\[[^\]]+\]/g, '')
        .replace(/\([^\)]+\)/g, '')
        .replace(/[\s\s\p{P}\p{S}]/gu, '')
        .trim();
}

// Get array of bi-grams
function getBigrams(str) {
    const bigrams = [];
    for (let i = 0; i < str.length - 1; i++) {
        bigrams.push(str.substring(i, i + 2));
    }
    return bigrams;
}

// Render articles grid based on state, filters, search, and active tab
function renderArticles() {
    articlesGrid.innerHTML = '';
    
    let filtered = [...globalArticles].sort((a, b) => b.date - a.date);

    if (activeTab === 'favorites') {
        filtered = getFavoritesAsArticles();
    }

    // メディア絞り込みフィルターの適用
    if (activeSourceFilter !== 'all') {
        filtered = filtered.filter(art => 
            art.sources.some(s => s.id === activeSourceFilter)
        );
    }

    const query = searchInput.value.trim().toLowerCase();
    if (query) {
        filtered = filtered.filter(art => 
            art.title.toLowerCase().includes(query) || 
            art.description.toLowerCase().includes(query)
        );
    }

    if (filtered.length === 0) {
        const isLoadingAny = Object.values(loadingStates).some(s => s === 'loading');
        if (!isLoadingAny) {
            emptyState.classList.remove('hidden');
        } else {
            emptyState.classList.add('hidden');
        }
        return;
    } else {
        emptyState.classList.add('hidden');
    }

    filtered.forEach(art => {
        const card = document.createElement('article');
        card.className = 'article-card';
        
        const timeStr = formatTime(art.date);
        const favClass = isFavorite(art) ? 'active' : '';
        const favIcon = isFavorite(art) ? 'fa-solid fa-star' : 'fa-regular fa-star';

        // Badges HTML
        let badgesHtml = '';
        if (art.sources.length > 1) {
            badgesHtml = `<span class="merged-badge"><i class="fa-solid fa-code-merge"></i> 統合 (${art.sources.length})</span>`;
        } else {
            let src = null;
            for (const cat of categories) {
                src = cat.sources.find(s => s.name === art.sources[0].name);
                if (src) break;
            }
            const accentClass = src && src.accentClass ? src.accentClass : 'custom-feed';
            badgesHtml = `<span class="source-badge ${accentClass}">${art.sources[0].name}</span>`;
        }

        const linksHtml = art.sources.map(s => {
            let src = null;
            for (const cat of categories) {
                src = cat.sources.find(source => source.id === s.id);
                if (src) break;
            }
            const icon = src && src.type === 'rss' ? 'fa-solid fa-square-rss' : 'fa-solid fa-globe';
            return `<a href="${s.url}" target="_blank" rel="noopener noreferrer" class="media-link">
                <i class="${icon}"></i> ${s.name}
            </a>`;
        }).join('');

        card.innerHTML = `
            <div class="card-header">
                <div class="card-meta">
                    ${badgesHtml}
                    <span class="article-time"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
                </div>
                <button class="fav-btn ${favClass}" data-art-id="${art.id}" title="お気に入りに追加/削除">
                    <i class="${favIcon}"></i>
                </button>
            </div>
            <div class="card-body">
                <h3 class="article-title">
                    <a href="${art.sources[0].url}" target="_blank" rel="noopener noreferrer">${art.title}</a>
                </h3>
                <p class="article-summary">${art.description}</p>
            </div>
            <div class="card-footer">
                <span class="link-label">記事を読む:</span>
                ${linksHtml}
            </div>
        `;

        const favBtn = card.querySelector('.fav-btn');
        favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFavorite(art);
            favBtn.classList.toggle('active');
            const icon = favBtn.querySelector('i');
            if (favBtn.classList.contains('active')) {
                icon.className = 'fa-solid fa-star';
            } else {
                icon.className = 'fa-regular fa-star';
            }
            
            if (activeTab === 'favorites') {
                card.remove();
                if (articlesGrid.children.length === 0) {
                    emptyState.classList.remove('hidden');
                }
            }
        });

        articlesGrid.appendChild(card);
    });
}

// Format Date to localized string
function formatTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));

    if (diffMins < 1) return '今さっき';
    if (diffMins < 60) return `${diffMins}分前`;
    if (diffHours < 24) return `${diffHours}時間前`;
    
    return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

// Update Header status indicators & progress bar
function updateStatusPanelUI() {
    sourceStatuses.innerHTML = '';
    
    const activeSources = getActiveSources();
    let completedCount = 0;
    const totalCount = activeSources.length;

    if (totalCount === 0) {
        progressBar.style.width = '0%';
        return;
    }

    activeSources.forEach(src => {
        const state = loadingStates[src.id] || 'idle';
        let stateClass = '';
        
        if (state === 'loading') stateClass = 'loading';
        else if (state === 'done') {
            stateClass = 'done';
            completedCount++;
        }
        else if (state === 'error') {
            stateClass = 'error';
            completedCount++;
        }

        const indicator = document.createElement('div');
        indicator.className = `source-indicator ${stateClass}`;
        indicator.innerHTML = `<span class="dot"></span> ${src.name}`;
        sourceStatuses.appendChild(indicator);
    });

    const percent = Math.round((completedCount / totalCount) * 100);
    progressBar.style.width = `${percent}%`;
}

// Favorite management helpers
function toggleFavorite(art) {
    const index = favorites.findIndex(fav => fav.title === art.title);
    if (index !== -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push({
            id: art.id,
            title: art.title,
            description: art.description,
            dateString: art.date.toISOString(),
            sources: art.sources
        });
    }
    localStorage.setItem('gnh_favorites', JSON.stringify(favorites));
    updateFavCountUI();
}

function isFavorite(art) {
    return favorites.some(fav => fav.title === art.title);
}

function updateFavCountUI() {
    favCountSpan.textContent = favorites.length;
}

function getFavoritesAsArticles() {
    return favorites.map(fav => ({
        id: fav.id,
        title: fav.title,
        description: fav.description,
        date: new Date(fav.dateString),
        sources: fav.sources
    }));
}

// Setup Modal Control Events
function setupModalEvents() {
    // Open Modal
    manageBtn.addEventListener('click', () => {
        manageModal.classList.remove('hidden');
        renderModalCategoryList();
        populateCategorySelect();
    });

    // Close Modal
    closeModalBtn.addEventListener('click', () => {
        manageModal.classList.add('hidden');
    });

    manageModal.addEventListener('click', (e) => {
        if (e.target === manageModal) {
            manageModal.classList.add('hidden');
        }
    });

    // Modal Tabs Switching
    modalTabCategories.addEventListener('click', () => {
        modalTabCategories.classList.add('active');
        modalTabAddSource.classList.remove('active');
        modalSectionCategories.classList.remove('hidden');
        modalSectionAddSource.classList.add('hidden');
    });

    modalTabAddSource.addEventListener('click', () => {
        modalTabAddSource.classList.add('active');
        modalTabCategories.classList.remove('active');
        modalSectionAddSource.classList.remove('hidden');
        modalSectionCategories.classList.add('hidden');
        populateCategorySelect();
    });

    // Add Category Action
    addCategoryBtn.addEventListener('click', () => {
        const name = newCategoryName.value.trim();
        if (!name) return;

        const exists = categories.some(c => c.name.toLowerCase() === name.toLowerCase());
        if (exists) {
            alert('そのカテゴリ名は既に存在します。');
            return;
        }

        const id = 'cat_' + Date.now();
        categories.push({
            id: id,
            name: name,
            sources: []
        });

        saveCategories();
        newCategoryName.value = '';
        renderModalCategoryList();
        renderCategoryTabs();
    });

    // Add Source Action
    addSourceForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const catId = sourceCategorySelect.value;
        const name = sourceName.value.trim();
        const url = sourceUrl.value.trim();

        if (!catId || !name || !url) return;

        const targetCat = categories.find(c => c.id === catId);
        if (!targetCat) return;

        const urlExists = targetCat.sources.some(s => s.url.toLowerCase() === url.toLowerCase());
        if (urlExists) {
            alert('このURLは既にこのカテゴリに登録されています。');
            return;
        }

        const newSource = {
            id: 'src_' + Date.now(),
            name: name,
            type: 'rss',
            url: url,
            accentClass: 'custom-feed'
        };

        targetCat.sources.push(newSource);
        saveCategories();
        
        sourceName.value = '';
        sourceUrl.value = '';
        
        alert('ニュースソースを追加しました！');
        
        modalTabCategories.click();
        renderModalCategoryList();
        
        if (catId === activeCategoryId) {
            startFetchNews();
        }
    });
}

// Save categories to localStorage
function saveCategories() {
    localStorage.setItem('gnh_categories', JSON.stringify(categories));
}

// Populate Category select dropdown in Add Source tab
function populateCategorySelect() {
    sourceCategorySelect.innerHTML = '';
    categories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.name;
        sourceCategorySelect.appendChild(opt);
    });
}

// Render dynamic list of categories & sources in Modal
function renderModalCategoryList() {
    modalCategoryList.innerHTML = '';
    categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'category-item';

        const isDefaultGame = cat.id === 'game';
        const deleteBtnHtml = isDefaultGame 
            ? '<span class="default-badge" style="font-size: 0.75rem; color: var(--text-muted);">標準 (削除不可)</span>' 
            : `<button class="delete-btn" data-cat-id="${cat.id}"><i class="fa-solid fa-trash"></i> 削除</button>`;

        let sourcesHtml = '';
        if (cat.sources.length === 0) {
            sourcesHtml = '<span class="no-sources-text" style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">登録されたソースはありません</span>';
        } else {
            sourcesHtml = cat.sources.map(src => {
                return `
                    <div class="source-item">
                        <span><strong>${src.name}</strong> <span class="source-url-text">(${src.url})</span></span>
                        <button class="delete-btn delete-source-btn" data-cat-id="${cat.id}" data-src-id="${src.id}" title="ソースを削除">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                `;
            }).join('');
        }

        item.innerHTML = `
            <div class="category-item-header">
                <span class="category-title-text"><i class="fa-solid fa-folder-open"></i> ${cat.name} (${cat.sources.length})</span>
                ${deleteBtnHtml}
            </div>
            <div class="category-item-sources">
                ${sourcesHtml}
            </div>
        `;

        if (!isDefaultGame) {
            const delBtn = item.querySelector('.delete-btn:not(.delete-source-btn)');
            if (delBtn) {
                delBtn.addEventListener('click', () => {
                    if (confirm(`カテゴリ「${cat.name}」と、その中に含まれるすべてのソースを削除しますか？`)) {
                        categories = categories.filter(c => c.id !== cat.id);
                        if (activeCategoryId === cat.id) {
                            activeCategoryId = 'game';
                            localStorage.setItem('gnh_active_category_id', 'game');
                        }
                        saveCategories();
                        renderModalCategoryList();
                        renderCategoryTabs();
                        startFetchNews();
                    }
                });
            }
        }

        item.querySelectorAll('.delete-source-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const catId = btn.dataset.catId;
                const srcId = btn.dataset.srcId;
                const targetCategory = categories.find(c => c.id === catId);
                if (!targetCategory) return;
                
                const targetSource = targetCategory.sources.find(s => s.id === srcId);
                const srcName = targetSource ? targetSource.name : '不明なソース';

                if (confirm(`ソース「${srcName}」を削除しますか？`)) {
                    targetCategory.sources = targetCategory.sources.filter(s => s.id !== srcId);
                    saveCategories();
                    renderModalCategoryList();
                    if (catId === activeCategoryId) {
                        startFetchNews();
                    }
                }
            });
        });

        modalCategoryList.appendChild(item);
    });
}

// Start application
window.addEventListener('DOMContentLoaded', init);
