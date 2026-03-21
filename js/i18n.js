// ===== CS2 Investment Tracker - Internationalization =====

const I18N = (function () {
    'use strict';

    const LANG_KEY = 'cs2_language';

    const translations = {
        pl: {
            // Header
            appTitle: 'CS2 Investment Tracker',
            statInvestments: 'Inwestycje',
            statTotalQty: 'Łączna ilość',
            statTotalCost: 'Łączny koszt',
            statCurrency: 'Waluta',
            statLanguage: 'Język',
            unitPcs: 'szt.',

            // Form
            addInvestment: 'Dodaj inwestycję',
            labelItem: 'Przedmiot',
            labelPlatform: 'Platforma',
            labelQuantity: 'Ilość',
            labelPricePerUnit: 'Cena za sztukę',
            labelDate: 'Data zakupu',
            labelNotes: 'Notatki (opcjonalne)',
            placeholderItem: 'Wyszukaj przedmiot CS2...',
            placeholderPlatform: 'Wybierz platformę...',
            placeholderNotes: 'np. Float 0.001, Pattern 661...',
            btnAddTransaction: 'Dodaj transakcję',

            // Table
            yourInvestments: 'Twoje inwestycje',
            filterPlaceholder: 'Filtruj przedmioty...',
            allPlatforms: 'Wszystkie platformy',
            colItem: 'Przedmiot',
            colQuantity: 'Ilość',
            colAvgPrice: 'Śr. cena zakupu',
            colTotalCost: 'Łączny koszt',
            colLivePrice: 'Cena live',
            colPL: 'Zysk/Strata',
            colPlatform: 'Platforma',
            colTranches: 'Transze',
            colActions: 'Akcje',
            tranche1: 'transza',
            tranche2_4: 'transze',
            tranche5plus: 'transz',

            // Empty state
            noInvestments: 'Brak inwestycji',
            noInvestmentsDesc: 'Dodaj swoją pierwszą inwestycję używając formularza powyżej',

            // Modal
            investmentDetails: 'Szczegóły inwestycji',
            trancheLabel: 'Transza',
            fieldQty: 'Ilość',
            fieldPricePerUnit: 'Cena/szt.',
            fieldTotalCost: 'Łączny koszt',
            fieldCurrency: 'Waluta',
            fieldDate: 'Data',
            fieldNotes: 'Notatki',
            summaryTotalQty: 'Łączna ilość',
            summaryTotalCost: 'Łączny koszt',
            summaryAvgPrice: 'Śr. cena',
            btnDelete: 'Usuń',

            // Confirms
            confirmDeleteInvestment: 'Czy na pewno chcesz usunąć tę inwestycję i wszystkie jej transze?',
            confirmDeleteLastTranche: 'To jedyna transza. Usunięcie jej usunie całą inwestycję. Kontynuować?',

            // DB Status
            dbLoading: 'Ładowanie bazy przedmiotów...',
            dbProgress: 'Ładowanie... ({completed}/{total} kategorii, {count} przedmiotów)',
            dbDone: '✓ Załadowano {count} przedmiotów',

            // Live prices
            priceNotAvailable: '—',
            priceLoading: '...',
            proxyOffline: 'Serwer cen offline',
            refreshPrices: 'Odśwież ceny',
        },

        en: {
            // Header
            appTitle: 'CS2 Investment Tracker',
            statInvestments: 'Investments',
            statTotalQty: 'Total Qty',
            statTotalCost: 'Total Cost',
            statCurrency: 'Currency',
            statLanguage: 'Language',
            unitPcs: 'pcs',

            // Form
            addInvestment: 'Add Investment',
            labelItem: 'Item',
            labelPlatform: 'Platform',
            labelQuantity: 'Quantity',
            labelPricePerUnit: 'Price per unit',
            labelDate: 'Purchase date',
            labelNotes: 'Notes (optional)',
            placeholderItem: 'Search CS2 item...',
            placeholderPlatform: 'Select platform...',
            placeholderNotes: 'e.g. Float 0.001, Pattern 661...',
            btnAddTransaction: 'Add transaction',

            // Table
            yourInvestments: 'Your Investments',
            filterPlaceholder: 'Filter items...',
            allPlatforms: 'All platforms',
            colItem: 'Item',
            colQuantity: 'Qty',
            colAvgPrice: 'Avg. buy price',
            colTotalCost: 'Total cost',
            colLivePrice: 'Live Price',
            colPL: 'Profit/Loss',
            colPlatform: 'Platform',
            colTranches: 'Tranches',
            colActions: 'Actions',
            tranche1: 'tranche',
            tranche2_4: 'tranches',
            tranche5plus: 'tranches',

            // Empty state
            noInvestments: 'No investments',
            noInvestmentsDesc: 'Add your first investment using the form above',

            // Modal
            investmentDetails: 'Investment Details',
            trancheLabel: 'Tranche',
            fieldQty: 'Quantity',
            fieldPricePerUnit: 'Price/unit',
            fieldTotalCost: 'Total cost',
            fieldCurrency: 'Currency',
            fieldDate: 'Date',
            fieldNotes: 'Notes',
            summaryTotalQty: 'Total quantity',
            summaryTotalCost: 'Total cost',
            summaryAvgPrice: 'Avg. price',
            btnDelete: 'Delete',

            // Confirms
            confirmDeleteInvestment: 'Are you sure you want to delete this investment and all its tranches?',
            confirmDeleteLastTranche: 'This is the only tranche. Deleting it will remove the entire investment. Continue?',

            // DB Status
            dbLoading: 'Loading item database...',
            dbProgress: 'Loading... ({completed}/{total} categories, {count} items)',
            dbDone: '✓ Loaded {count} items',

            // Live prices
            priceNotAvailable: '—',
            priceLoading: '...',
            proxyOffline: 'Price server offline',
            refreshPrices: 'Refresh prices',
        }
    };

    let currentLang = localStorage.getItem(LANG_KEY) || 'pl';

    function t(key, params) {
        const dict = translations[currentLang] || translations.pl;
        let text = dict[key] || translations.pl[key] || key;
        if (params) {
            for (const [k, v] of Object.entries(params)) {
                text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
            }
        }
        return text;
    }

    function getLang() {
        return currentLang;
    }

    function setLang(lang) {
        if (translations[lang]) {
            currentLang = lang;
            localStorage.setItem(LANG_KEY, lang);
        }
    }

    function trancheWord(count) {
        if (count === 1) return t('tranche1');
        if (count < 5) return t('tranche2_4');
        return t('tranche5plus');
    }

    return { t, getLang, setLang, trancheWord };
})();
