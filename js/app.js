// ===== CS2 Investment Tracker - Main Application =====

(function () {
    'use strict';

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

    // ===== Initialize =====
    function init() {
        // Set today's date as default
        dateInput.value = new Date().toISOString().split('T')[0];

        // Restore currency
        currencySelect.value = currentCurrency;
        updateCurrencyUI();

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
            updateCurrencyUI();
            renderTable();
            updateStats();
        });

        filterSearch.addEventListener('input', renderTable);
        filterPlatform.addEventListener('change', renderTable);

        // Sortable headers
        document.querySelectorAll('.sortable').forEach(th => {
            th.addEventListener('click', () => handleSort(th.dataset.sort));
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

        // Load item database
        loadItemDatabase();
    }

    function updateCurrencyUI() {
        const cur = getCurrency();
        priceUnitLabel.textContent = cur.symbol;
    }

    // ===== Item Database =====
    async function loadItemDatabase() {
        dbStatus.textContent = 'Ładowanie bazy przedmiotów...';
        dbStatus.classList.add('visible');

        await CS2Database.loadItems((count, done, completed, total) => {
            if (done) {
                dbStatus.textContent = `✓ Załadowano ${count.toLocaleString()} przedmiotów`;
                dbStatus.classList.add('done');
                setTimeout(() => {
                    dbStatus.classList.remove('visible');
                }, 3000);
            } else {
                dbStatus.textContent = `Ładowanie... (${completed}/${total} kategorii, ${count.toLocaleString()} przedmiotów)`;
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

        // Check if investment for this item already exists
        const existing = investments.find(inv =>
            inv.name.toLowerCase() === itemName.toLowerCase()
        );

        if (existing) {
            existing.tranches.push(tranche);
        } else {
            // Find item from database
            const dbItem = CS2Database.findByName(itemName);
            investments.push({
                id: generateId(),
                name: itemName,
                type: dbItem ? dbItem.type : 'Inne',
                image: dbItem ? dbItem.image : null,
                tranches: [tranche]
            });
        }

        saveInvestments();
        renderTable();
        updateStats();
        resetForm();
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
        // Convert all tranches to current currency
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

    function calcPlatforms(investment) {
        return [...new Set(investment.tranches.map(t => t.platform))];
    }

    function convertCurrency(amount, fromCurrency, toCurrency) {
        if (fromCurrency === toCurrency) return amount;
        const fromRate = (CURRENCIES[fromCurrency] || CURRENCIES.USD).rate;
        const toRate = (CURRENCIES[toCurrency] || CURRENCIES.USD).rate;
        // Convert to USD first, then to target
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
            const platforms = calcPlatforms(inv);

            // Try to get image from DB if not stored on investment
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
                <td>
                    <div class="platform-badges">
                        ${platforms.map(p => `<span class="platform-badge">${escapeHtml(p)}</span>`).join('')}
                    </div>
                </td>
                <td>
                    <span class="tranches-count" onclick="window.app.showTranches('${inv.id}')">
                        ${inv.tranches.length} ${inv.tranches.length === 1 ? 'transza' : (inv.tranches.length < 5 ? 'transze' : 'transz')}
                    </span>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn btn-sm btn-ghost" onclick="window.app.addTranche('${inv.id}')" title="Dodaj transzę">+</button>
                        <button class="btn btn-sm btn-danger" onclick="window.app.deleteInvestment('${inv.id}')" title="Usuń">✕</button>
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

        // Update header classes
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

        totalValueEl.textContent = totalQty + ' szt.';
        totalCostEl.textContent = formatPrice(totalSpent);
    }

    // ===== Modal: Show Tranches =====
    function showTranches(investmentId) {
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        modalTitle.textContent = inv.name;

        const totalQty = calcTotalQuantity(inv);
        const avgPrice = calcAvgPrice(inv);
        const totalSpent = calcTotalSpent(inv);

        modalBody.innerHTML = `
            <div class="tranche-list">
                ${inv.tranches.map((t, idx) => `
                    <div class="tranche-card">
                        <div class="tranche-info">
                            <div class="tranche-field">
                                <span class="field-label">Transza #${idx + 1}</span>
                                <span class="field-value">${escapeHtml(t.platform)}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">Ilość</span>
                                <span class="field-value">${t.quantity}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">Cena/szt.</span>
                                <span class="field-value">${formatTranchePrice(t)}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">Łączny koszt</span>
                                <span class="field-value">${formatTrancheCost(t)}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">Waluta</span>
                                <span class="field-value">${t.currency || 'USD'}</span>
                            </div>
                            <div class="tranche-field">
                                <span class="field-label">Data</span>
                                <span class="field-value">${t.date}</span>
                            </div>
                            ${t.notes ? `
                            <div class="tranche-field">
                                <span class="field-label">Notatki</span>
                                <span class="field-value">${escapeHtml(t.notes)}</span>
                            </div>` : ''}
                        </div>
                        <div class="tranche-actions">
                            <button class="btn btn-sm btn-danger" onclick="window.app.deleteTranche('${inv.id}', '${t.id}')">Usuń</button>
                        </div>
                    </div>
                `).join('')}
            </div>
            <div class="summary-row">
                <div>
                    <div class="summary-label">Łączna ilość: ${totalQty} szt.</div>
                    <div class="summary-label">Łączny koszt (${currentCurrency}): ${formatPrice(totalSpent)}</div>
                </div>
                <div class="summary-value">Śr. cena: ${formatPrice(avgPrice)}</div>
            </div>
        `;

        openModal();
    }

    // ===== Modal: Add Tranche to existing investment =====
    function addTranche(investmentId) {
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        // Pre-fill form with item name
        itemSearch.value = inv.name;
        itemSearch.focus();

        // Scroll to form
        form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ===== Delete =====
    function deleteInvestment(investmentId) {
        if (!confirm('Czy na pewno chcesz usunąć tę inwestycję i wszystkie jej transze?')) return;
        investments = investments.filter(i => i.id !== investmentId);
        saveInvestments();
        renderTable();
        updateStats();
    }

    function deleteTranche(investmentId, trancheId) {
        const inv = investments.find(i => i.id === investmentId);
        if (!inv) return;

        if (inv.tranches.length === 1) {
            if (!confirm('To jedyna transza. Usunięcie jej usunie całą inwestycję. Kontynuować?')) return;
            investments = investments.filter(i => i.id !== investmentId);
        } else {
            inv.tranches = inv.tranches.filter(t => t.id !== trancheId);
        }

        saveInvestments();
        renderTable();
        updateStats();
        closeModal();

        // Re-open if still exists
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
