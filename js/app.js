// ===== CS2 Investment Tracker - Main Application =====

(function () {
    'use strict';

    const t = I18N.t.bind(I18N);

    // ===== Currency =====
    const CURRENCIES = {
        USD: { symbol: '$', rate: 1, locale: 'en-US' },
        PLN: { symbol: 'zł', rate: 4.05, locale: 'pl-PL' },
        EUR: { symbol: '€', rate: 0.92, locale: 'de-DE' },
        CNY: { symbol: '¥', rate: 7.24, locale: 'zh-CN' },
    };
    const CURRENCY_KEY = 'cs2_currency';
    let currentCurrency = localStorage.getItem(CURRENCY_KEY) || 'USD';

    function getCurrency() {
        return CURRENCIES[currentCurrency] || CURRENCIES.USD;
    }

    function formatPrice(amountInUserCurrency) {
        const cur = getCurrency();
        return cur.symbol + amountInUserCurrency.toFixed(2);
    }

    // ===== Live Price State =====
    const PROXY_BASE = 'http://localhost:3000';
    const PRICE_CACHE_KEY = 'cs2_price_cache';
    const PRICE_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
    let priceCache = loadPriceCache();
    let proxyOnline = false;

    function loadPriceCache() {
        try {
            const raw = localStorage.getItem(PRICE_CACHE_KEY);
            if (!raw) return {};
            return JSON.parse(raw);
        } catch { return {}; }
    }

    function savePriceCache() {
        try {
            localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify(priceCache));
        } catch { /* ignore */ }
    }

    async function checkProxy() {
        try {
            const res = await fetch(PROXY_BASE + '/health', { signal: AbortSignal.timeout(2000) });
            proxyOnline = res.ok;
        } catch {
            proxyOnline = false;
        }
    }

    // Always fetches in USD, then converts client-side
    async function fetchSteamPriceUSD(itemName) {
        try {
            const url = `${PROXY_BASE}/api/steam-price?market_hash_name=${encodeURIComponent(itemName)}&currency=USD`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            const data = await res.json();
            if (data && data.success) {
                const raw = data.median_price || data.lowest_price || '';
                const numStr = raw.replace(/[^0-9.,]/g, '').replace(',', '.');
                const price = parseFloat(numStr);
                if (!isNaN(price) && price > 0) return price;
            }
            return null;
        } catch { return null; }
    }

    // CSFloat history/graph endpoint — returns array of { avg_price (cents), day, count }
    async function fetchCSFloatPriceUSD(itemName) {
        try {
            const url = `${PROXY_BASE}/api/csfloat-price?market_hash_name=${encodeURIComponent(itemName)}`;
            const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            const data = await res.json();
            // data is an array sorted by day desc; take the latest day's avg price
            if (Array.isArray(data) && data.length > 0 && data[0].avg_price) {
                return data[0].avg_price / 100; // cents -> dollars
            }
            return null;
        } catch { return null; }
    }

    // Maps platform name to price source key
    function platformToSource(platform) {
        return platform === 'CSFloat' ? 'csfloat' : 'steam';
    }

    // Cache stores { priceUSD, source, ts } under key "itemName|steam" or "itemName|csfloat"
    async function fetchLivePrice(itemName, source) {
        const cacheKey = itemName + '|' + source;
        const cached = priceCache[cacheKey];
        if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) {
            return cached;
        }
        if (!proxyOnline) return null;

        let priceUSD = null;
        if (source === 'csfloat') {
            priceUSD = await fetchCSFloatPriceUSD(itemName);
        } else {
            priceUSD = await fetchSteamPriceUSD(itemName);
        }

        if (priceUSD !== null) {
            const entry = { priceUSD, source, ts: Date.now() };
            priceCache[cacheKey] = entry;
            savePriceCache();
            return entry;
        }
        return null;
    }

    async function refreshAllPrices() {
        await checkProxy();
        if (!proxyOnline) return;
        // Deduplicate by (item name, source) pair
        const seen = new Set();
        const pairs = [];
        for (const inv of investments) {
            const name = inv.name;
            const source = platformToSource(inv.platform || 'Steam Market');
            const key = name + '|' + source;
            if (!seen.has(key)) {
                seen.add(key);
                pairs.push({ name, source });
            }
        }
        for (const { name, source } of pairs) {
            await fetchLivePrice(name, source);
            await new Promise(r => setTimeout(r, 400));
        }
        renderTable();
    }

    // Returns { price (in currentCurrency), source } or null
    function getCachedPrice(itemName, platform) {
        const source = platformToSource(platform || 'Steam Market');
        const cacheKey = itemName + '|' + source;
        const cached = priceCache[cacheKey];
        if (cached && Date.now() - cached.ts < PRICE_CACHE_TTL) {
            const priceConverted = convertCurrency(cached.priceUSD, 'USD', currentCurrency);
            return { price: priceConverted, source: cached.source };
        }
        return null;
    }

    // ===== State =====
    const STORAGE_KEY = 'cs2_investments';
    let investments = loadInvestments();
    let currentSort = { field: 'name', dir: 'asc' };
    let selectedAutocompleteIndex = -1;

    // ===== DOM Elements =====
    const form = document.getElementById('investmentForm');
    const itemSearch = document.getElementById('itemSearch');
    const autocompleteDropdown = document.getElementById('autocompleteDropdown');
    const platformSelect = document.getElementById('platform');
    const quantityInput = document.getElementById('quantity');
    const priceInput = document.getElementById('pricePerUnit');
    const dateInput = document.getElementById('purchaseDate');
    const notesInput = document.getElementById('notes');
    const tableBody = document.getElementById('investmentsTableBody');
    const emptyState = document.getElementById('emptyState');
    const filterSearch = document.getElementById('filterSearch');
    const filterPlatform = document.getElementById('filterPlatform');
    const modalOverlay = document.getElementById('modalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const modalClose = document.getElementById('modalClose');
    const currencySelect = document.getElementById('currencySelect');
    const priceUnitLabel = document.getElementById('priceUnitLabel');
    const dbStatus = document.getElementById('dbStatus');
    const langSelect = document.getElementById('langSelect');
    const btnRefreshPrices = document.getElementById('btnRefreshPrices');

    // Stats
    const totalInvestmentsEl = document.getElementById('totalInvestments');
    const totalValueEl = document.getElementById('totalValue');
    const totalCostEl = document.getElementById('totalCost');

    // ===== Persistence =====
    function loadInvestments() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch {
            return [];
        }
    }

    function saveInvestments() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(investments));
    }

    // ===== Flag URLs (Flagcdn.com - public domain) =====
    const FLAG_URLS = {
        USD: 'https://flagcdn.com/w40/us.png',
        PLN: 'https://flagcdn.com/w40/pl.png',
        EUR: 'https://flagcdn.com/w40/eu.png',
        CNY: 'https://flagcdn.com/w40/cn.png',
        pl: 'https://flagcdn.com/w40/pl.png',
        en: 'https://flagcdn.com/w40/gb.png',
    };

    // Custom dropdown with flag images inside each option
    function buildFlagSelect(selectEl, flagMap) {
        const parent = selectEl.parentNode;
        const container = document.createElement('div');
        container.className = 'flag-dropdown';

        const selected = document.createElement('div');
        selected.className = 'flag-dropdown-selected';
        container.appendChild(selected);

        const optionsList = document.createElement('div');
        optionsList.className = 'flag-dropdown-options';
        container.appendChild(optionsList);

        function renderOptions() {
            optionsList.innerHTML = '';
            Array.from(selectEl.options).forEach(opt => {
                const item = document.createElement('div');
                item.className = 'flag-dropdown-option' + (opt.value === selectEl.value ? ' active' : '');
                item.dataset.value = opt.value;
                const flagUrl = flagMap[opt.value];
                item.innerHTML = (flagUrl ? `<img class="flag-dropdown-flag" src="${flagUrl}" alt="">` : '') +
                    `<span>${opt.textContent}</span>`;
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    selectEl.value = opt.value;
                    selectEl.dispatchEvent(new Event('change'));
                    updateSelected();
                    optionsList.classList.remove('open');
                });
                optionsList.appendChild(item);
            });
        }

        function updateSelected() {
            const opt = selectEl.options[selectEl.selectedIndex];
            const flagUrl = flagMap[selectEl.value];
            selected.innerHTML = (flagUrl ? `<img class="flag-dropdown-flag" src="${flagUrl}" alt="">` : '') +
                `<span>${opt ? opt.textContent : ''}</span><span class="flag-dropdown-arrow">▾</span>`;
            renderOptions();
        }

        selected.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close all other open dropdowns
            document.querySelectorAll('.flag-dropdown-options.open').forEach(el => {
                if (el !== optionsList) el.classList.remove('open');
            });
            optionsList.classList.toggle('open');
        });

        document.addEventListener('click', () => optionsList.classList.remove('open'));

        selectEl.style.display = 'none';
        parent.insertBefore(container, selectEl.nextSibling);
        updateSelected();

        // Update on external changes
        selectEl.addEventListener('change', updateSelected);
    }

    // ===== i18n: Apply translations to DOM =====
    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        // Update dynamic text
        const cur = getCurrency();
        priceUnitLabel.textContent = cur.symbol;
        langSelect.value = I18N.getLang();
        document.documentElement.lang = I18N.getLang();
    }

    // ===== Initialize =====
    function init() {
        // Set today's date as default
        dateInput.value = new Date().toISOString().split('T')[0];

        // Restore currency
        currencySelect.value = currentCurrency;

        // Apply translations
        applyI18n();

        // Event listeners
        form.addEventListener('submit', handleAddInvestment);
        itemSearch.addEventListener('input', handleAutocomplete);
        itemSearch.addEventListener('keydown', handleAutocompleteKeydown);
        itemSearch.addEventListener('focus', () => {
            if (itemSearch.value.length >= 1) handleAutocomplete();
        });
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.autocomplete-wrapper')) {
                closeAutocomplete();
            }
        });

        currencySelect.addEventListener('change', () => {
            currentCurrency = currencySelect.value;
            localStorage.setItem(CURRENCY_KEY, currentCurrency);
            applyI18n();
            renderTable();
            updateStats();
        });

        langSelect.addEventListener('change', () => {
            I18N.setLang(langSelect.value);
            applyI18n();
            renderTable();
            updateStats();
        });

        // Build flag+select wrappers
        buildFlagSelect(currencySelect, FLAG_URLS);
        buildFlagSelect(langSelect, FLAG_URLS);

        filterSearch.addEventListener('input', renderTable);
        filterPlatform.addEventListener('change', renderTable);

        // Sortable headers
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
        });

        // Refresh prices button
        btnRefreshPrices.addEventListener('click', () => {
            refreshAllPrices();
        });

        // Modal
        modalClose.addEventListener('click', closeModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeModal();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        renderTable();
        updateStats();

        // Load item database then check price proxy
        loadItemDatabase();
        checkProxy().then(() => {
            if (proxyOnline) refreshAllPrices();
        });
    }

    // ===== Item Database =====
    async function loadItemDatabase() {
        dbStatus.textContent = t('dbLoading');
        dbStatus.classList.add('visible');

        await CS2Database.loadItems((count, done, completed, total) => {
            if (done) {
                dbStatus.textContent = t('dbDone', { count: count.toLocaleString() });
                dbStatus.classList.add('done');
                setTimeout(() => {
                    dbStatus.classList.remove('visible');
                }, 3000);
            } else {
                dbStatus.textContent = t('dbProgress', { completed, total, count: count.toLocaleString() });
            }
        });
    }

    // ===== Autocomplete =====
    function handleAutocomplete() {
        const query = itemSearch.value.trim();
        if (query.length < 1) {
            closeAutocomplete();
            return;
        }

        const results = CS2Database.search(query, 40);

        if (results.length === 0) {
            closeAutocomplete();
            return;
        }

        const queryLower = query.toLowerCase();
        selectedAutocompleteIndex = -1;
        autocompleteDropdown.innerHTML = results.map((item, i) => {
            const highlighted = highlightMatch(item.name, queryLower);
            const imgHtml = item.image
                ? `<img class="ac-img" src="${escapeAttr(item.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                : `<span class="ac-img-placeholder">${getTypeEmoji(item.type)}</span>`;
            const rarityStyle = item.rarity ? ` style="border-left: 3px solid ${item.rarity}"` : '';
            return `<div class="autocomplete-item" data-index="${i}" data-name="${escapeAttr(item.name)}"${rarityStyle}>
                ${imgHtml}
                <span class="item-name">${highlighted}</span>
                <span class="item-type">${escapeHtml(item.type)}</span>
            </div>`;
        }).join('');

        autocompleteDropdown.classList.add('active');

        // Click handlers for items
        autocompleteDropdown.querySelectorAll('.autocomplete-item').forEach(el => {
            el.addEventListener('click', () => {
                itemSearch.value = el.dataset.name;
                closeAutocomplete();
            });
        });
    }

    function handleAutocompleteKeydown(e) {
        const items = autocompleteDropdown.querySelectorAll('.autocomplete-item');
        if (!items.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedAutocompleteIndex = Math.min(selectedAutocompleteIndex + 1, items.length - 1);
            updateAutocompleteSelection(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedAutocompleteIndex = Math.max(selectedAutocompleteIndex - 1, 0);
            updateAutocompleteSelection(items);
        } else if (e.key === 'Enter' && selectedAutocompleteIndex >= 0) {
            e.preventDefault();
            items[selectedAutocompleteIndex].click();
        } else if (e.key === 'Escape') {
            closeAutocomplete();
        }
    }

    function updateAutocompleteSelection(items) {
        items.forEach((el, i) => {
            el.classList.toggle('selected', i === selectedAutocompleteIndex);
        });
        if (items[selectedAutocompleteIndex]) {
            items[selectedAutocompleteIndex].scrollIntoView({ block: 'nearest' });
        }
    }

    function closeAutocomplete() {
        autocompleteDropdown.classList.remove('active');
        selectedAutocompleteIndex = -1;
    }

    function highlightMatch(text, query) {
        const escaped = escapeHtml(text);
        const escapedQuery = escapeHtml(query);
        const regex = new RegExp(`(${escapeRegex(escapedQuery)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    // ===== Add Investment =====
    // Now groups by item name + platform (each platform = separate investment row)
    function handleAddInvestment(e) {
        e.preventDefault();

        const itemName = itemSearch.value.trim();
        const platform = platformSelect.value;
        const quantity = parseInt(quantityInput.value, 10);
        const pricePerUnit = parseFloat(priceInput.value);
        const date = dateInput.value;
        const notes = notesInput.value.trim();

        if (!itemName || !platform || !quantity || !pricePerUnit || !date) return;

        const tranche = {
            id: generateId(),
            quantity,
            pricePerUnit,
            currency: currentCurrency,
            platform,
            date,
            notes
        };

        // Match by BOTH name AND platform
        const existing = investments.find(inv =>
            inv.name.toLowerCase() === itemName.toLowerCase() &&
            inv.platform === platform
        );

        if (existing) {
            existing.tranches.push(tranche);
        } else {
            const dbItem = CS2Database.findByName(itemName);
            investments.push({
                id: generateId(),
                name: itemName,
                type: dbItem ? dbItem.type : 'Inne',
                image: dbItem ? dbItem.image : null,
                platform: platform,
                tranches: [tranche]
            });
        }

        saveInvestments();
        renderTable();
        updateStats();
        resetForm();

        // Fetch live price for the new item
        if (proxyOnline) {
            fetchLivePrice(itemName, platform).then(() => renderTable());
        }
    }

    function resetForm() {
        itemSearch.value = '';
        platformSelect.value = '';
        quantityInput.value = 1;
        priceInput.value = '';
        notesInput.value = '';
        dateInput.value = new Date().toISOString().split('T')[0];
    }

    // ===== Calculations =====
    function calcTotalQuantity(investment) {
        return investment.tranches.reduce((sum, t) => sum + t.quantity, 0);
    }

    function calcTotalSpent(investment) {
        return investment.tranches.reduce((sum, t) => {
            const trancheCost = t.quantity * t.pricePerUnit;
            return sum + convertCurrency(trancheCost, t.currency || 'USD', currentCurrency);
        }, 0);
    }

    function calcAvgPrice(investment) {
        const totalQty = calcTotalQuantity(investment);
        if (totalQty === 0) return 0;
        return calcTotalSpent(investment) / totalQty;
    }

    function convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        const fromRate = (CURRENCIES[fromCurrency] || CURRENCIES.USD).rate;
        const toRate = (CURRENCIES[toCurrency] || CURRENCIES.USD).rate;
        const usdAmount = amount / fromRate;
        return usdAmount * toRate;
    }

    function formatTrancheCost(tranche) {
        const origCur = CURRENCIES[tranche.currency || 'USD'] || CURRENCIES.USD;
        const cost = tranche.quantity * tranche.pricePerUnit;
        return origCur.symbol + cost.toFixed(2);
    }

    function formatTranchePrice(tranche) {
        const origCur = CURRENCIES[tranche.currency || 'USD'] || CURRENCIES.USD;
        return origCur.symbol + tranche.pricePerUnit.toFixed(2);
    }

    // ===== Render Table =====
    function renderTable() {
        const searchQuery = filterSearch.value.trim().toLowerCase();
        const platformFilter = filterPlatform.value;

        let filtered = investments;

        if (searchQuery) {
            filtered = filtered.filter(inv =>
                inv.name.toLowerCase().includes(searchQuery)
            );
        }

        if (platformFilter) {
            filtered = filtered.filter(inv =>
                (inv.platform || '') === platformFilter ||
                inv.tranches.some(t => t.platform === platformFilter)
            );
        }

        // Sort
        filtered = sortInvestments(filtered, currentSort.field, currentSort.dir);

        if (filtered.length === 0) {
            tableBody.innerHTML = '';
            emptyState.style.display = 'flex';
            return;
        }

        emptyState.style.display = 'none';
        tableBody.innerHTML = filtered.map(inv => {
            const totalQty = calcTotalQuantity(inv);
            const avgPrice = calcAvgPrice(inv);
            const totalSpent = calcTotalSpent(inv);
            const invPlatform = inv.platform || (inv.tranches[0] ? inv.tranches[0].platform : '?');

            // Try to get image from DB if not stored
            let imgUrl = inv.image;
            if (!imgUrl && CS2Database.isLoaded()) {
                const dbItem = CS2Database.findByName(inv.name);
                if (dbItem && dbItem.image) {
                    imgUrl = dbItem.image;
                    inv.image = imgUrl;
                    saveInvestments();
                }
            }

            const iconHtml = imgUrl
                ? `<img class="item-icon-img" src="${escapeAttr(imgUrl)}" alt="" loading="lazy" onerror="this.parentElement.innerHTML='${getTypeEmoji(inv.type)}';">`
                : getTypeEmoji(inv.type);

            // Live price & P/L
            const priceData = getCachedPrice(inv.name, invPlatform);
            let livePriceHtml, plHtml;
            if (priceData !== null) {
                const srcLabel = priceData.source === 'csfloat' ? t('priceSrcCSFloat') : t('priceSrcSteam');
                const srcClass = priceData.source === 'csfloat' ? 'price-source price-source-csfloat' : 'price-source price-source-steam';
                const srcTag = `<span class="${srcClass}">${escapeHtml(srcLabel)}</span>`;
                livePriceHtml = `<span class="live-price">${formatPrice(priceData.price)}</span>${srcTag}`;
                const totalValue = priceData.price * totalQty;
                const pl = totalValue - totalSpent;
                const plPct = totalSpent > 0 ? ((pl / totalSpent) * 100).toFixed(1) : '0.0';
                const plClass = pl >= 0 ? 'pl-positive' : 'pl-negative';
                plHtml = `<span class="${plClass}">${pl >= 0 ? '+' : ''}${formatPrice(pl)} (${pl >= 0 ? '+' : ''}${plPct}%)</span>`;
            } else {
                livePriceHtml = `<span class="live-price-na">${t('priceNotAvailable')}</span>`;
                plHtml = `<span class="live-price-na">${t('priceNotAvailable')}</span>`;
            }

            return `<tr data-id="${inv.id}">
                <td>
                    <div class="item-cell">
                        <div class="item-icon">${iconHtml}</div>
                        <div class="item-info">
                            <div class="item-name">${escapeHtml(inv.name)}</div>
                            ${inv.tranches[0]?.notes ? `<div class="item-notes">${escapeHtml(inv.tranches[0].notes)}</div>` : ''}
                        </div>
                    </div>
                </td>
                <td>${totalQty}</td>
                <td>${formatPrice(avgPrice)}</td>
                <td>${formatPrice(totalSpent)}</td>
                <td>${livePriceHtml}</td>
                <td>${plHtml}</td>
                <td><span class="platform-badge">${escapeHtml(invPlatform)}</span></td>
                <td>
                    <span class="tranches-count" onclick="window.app.showTranches('${inv.id}')">
                        ${inv.tranches.length} ${I18N.trancheWord(inv.tranches.length)}
                    </span>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-ghost" onclick="window.app.addTranche('${inv.id}')" title="+">+</button>
                        <button class="btn btn-sm btn-danger" onclick="window.app.deleteInvestment('${inv.id}')" title="✕">✕</button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    function getTypeEmoji(type) {
        const map = {
            'Knife': '🔪',
            'Gloves': '🧤',
            'Rifle': '🔫',
            'Pistol': '🔫',
            'SMG': '🔫',
            'Shotgun': '🔫',
            'Machine Gun': '🔫',
            'Container': '📦',
            'Case': '📦',
            'Sticker': '🏷️',
            'Agent': '🕵️',
            'Patch': '🎖️',
            'Collectible': '⭐',
            'Music Kit': '🎵',
            'Key': '🔑',
            'Tool': '🔧',
            'Graffiti': '🎨',
            'Keychain': '🔗',
        };
        return map[type] || '📦';
    }

    // ===== Sorting =====
    function sortInvestments(list, field, dir) {
        return [...list].sort((a, b) => {
            let va, vb;
            switch (field) {
                case 'name':
                    va = a.name.toLowerCase();
                    vb = b.name.toLowerCase();
                    return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
                case 'quantity':
                    va = calcTotalQuantity(a);
                    vb = calcTotalQuantity(b);
                    break;
                case 'avgPrice':
                    va = calcAvgPrice(a);
                    vb = calcAvgPrice(b);
                    break;
                case 'totalSpent':
                    va = calcTotalSpent(a);
                    vb = calcTotalSpent(b);
                    break;
                default:
                    return 0;
            }
            return dir === 'asc' ? va - vb : vb - va;
        });
    }

    function handleSort(field) {
        if (currentSort.field === field) {
            currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.field = field;
            currentSort.dir = 'asc';
        }

        document.querySelectorAll('.sortable').forEach(th => {
            th.classList.remove('sort-asc', 'sort-desc');
            if (th.dataset.sort === currentSort.field) {
                th.classList.add(currentSort.dir === 'asc' ? 'sort-asc' : 'sort-desc');
            }
        });

        renderTable();
    }

    // ===== Stats =====
    function updateStats() {
        totalInvestmentsEl.textContent = investments.length;

        const totalQty = investments.reduce((sum, inv) => sum + calcTotalQuantity(inv), 0);
        const totalSpent = investments.reduce((sum, inv) => sum + calcTotalSpent(inv), 0);

        totalValueEl.textContent = totalQty + ' ' + t('unitPcs');
        totalCostEl.textContent = formatPrice(totalSpent);
    }

    // ===== Modal: Show Tranches =====
    function showTranches(investmentId) {
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        const invPlatform = inv.platform || (inv.tranches[0] ? inv.tranches[0].platform : '');
        modalTitle.textContent = inv.name + (invPlatform ? ' — ' + invPlatform : '');

        const totalQty = calcTotalQuantity(inv);
        const avgPrice = calcAvgPrice(inv);
        const totalSpent = calcTotalSpent(inv);

        modalBody.innerHTML = `
            <div class="tranche-list">
                ${inv.tranches.map((tr, idx) => `
                    <div class="tranche-card">
                        <div class="tranche-info">
                            <div class="tranche-field">
                                <span class="field-label">${t('trancheLabel')} #${idx + 1}</span>
                                <span class="field-value">${escapeHtml(tr.platform)}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">${t('fieldQty')}</span>
                                <span class="field-value">${tr.quantity}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">${t('fieldPricePerUnit')}</span>
                                <span class="field-value">${formatTranchePrice(tr)}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">${t('fieldTotalCost')}</span>
                                <span class="field-value">${formatTrancheCost(tr)}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">${t('fieldCurrency')}</span>
                                <span class="field-value">${tr.currency || 'USD'}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">${t('fieldDate')}</span>
                                <span class="field-value">${tr.date}</span>
                            </div>
                            ${tr.notes ? `
                            <div class="tranche-field">
                                <span class="field-label">${t('fieldNotes')}</span>
                                <span class="field-value">${escapeHtml(tr.notes)}</span>
                            </div>` : ''}
                        </div>
                        <div class="tranche-actions">
                            <button class="btn btn-sm btn-danger" onclick="window.app.deleteTranche('${inv.id}', '${tr.id}')">${t('btnDelete')}</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="summary-row">
                <div>
                    <div class="summary-label">${t('summaryTotalQty')}: ${totalQty} ${t('unitPcs')}</div>
                    <div class="summary-label">${t('summaryTotalCost')} (${currentCurrency}): ${formatPrice(totalSpent)}</div>
                </div>
                <div class="summary-value">${t('summaryAvgPrice')}: ${formatPrice(avgPrice)}</div>
            </div>
        `;

        openModal();
    }

    // ===== Modal: Add Tranche to existing investment =====
    function addTranche(investmentId) {
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        itemSearch.value = inv.name;
        if (inv.platform) platformSelect.value = inv.platform;
        itemSearch.focus();
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ===== Delete =====
    function deleteInvestment(investmentId) {
        if (!confirm(t('confirmDeleteInvestment'))) return;
        investments = investments.filter(i => i.id !== investmentId);
        saveInvestments();
        renderTable();
        updateStats();
    }

    function deleteTranche(investmentId, trancheId) {
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (inv.tranches.length === 1) {
            if (!confirm(t('confirmDeleteLastTranche'))) return;
            investments = investments.filter(i => i.id !== investmentId);
        } else {
            inv.tranches = inv.tranches.filter(tr => tr.id !== trancheId);
        }

        saveInvestments();
        renderTable();
        updateStats();
        closeModal();

        if (investments.find(i => i.id === investmentId)) {
            showTranches(investmentId);
        }
    }

    // ===== Modal Helpers =====
    function openModal() {
        modalOverlay.classList.add('active');
    }

    function closeModal() {
        modalOverlay.classList.remove('active');
    }

    // ===== Utilities =====
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function escapeRegex(str) {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // ===== Public API (for onclick handlers in HTML) =====
    window.app = {
        showTranches,
        addTranche,
        deleteInvestment,
        deleteTranche
    };

    // ===== Start =====
    init();
})();
