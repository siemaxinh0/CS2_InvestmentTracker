// ===== CS2 Items Database - Fetches from ByMykel/CSGO-API =====
// Source: https://github.com/ByMykel/CSGO-API (MIT License)

const CS2Database = (function () {
    'use strict';

    const BASE_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en';
    const CACHE_KEY = 'cs2_items_cache';
    const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

    let items = [];
    let loaded = false;
    let loadingPromise = null;

    // Endpoints to fetch
    const ENDPOINTS = [
        { url: `${BASE_URL}/skins.json`, type: 'Skin', mapper: mapSkin },
        { url: `${BASE_URL}/stickers.json`, type: 'Sticker', mapper: mapSticker },
        { url: `${BASE_URL}/crates.json`, type: 'Container', mapper: mapCrate },
        { url: `${BASE_URL}/agents.json`, type: 'Agent', mapper: mapAgent },
        { url: `${BASE_URL}/patches.json`, type: 'Patch', mapper: mapPatch },
        { url: `${BASE_URL}/collectibles.json`, type: 'Collectible', mapper: mapCollectible },
        { url: `${BASE_URL}/music_kits.json`, type: 'Music Kit', mapper: mapMusicKit },
        { url: `${BASE_URL}/keys.json`, type: 'Key', mapper: mapKey },
        { url: `${BASE_URL}/graffiti.json`, type: 'Graffiti', mapper: mapGraffiti },
        { url: `${BASE_URL}/keychains.json`, type: 'Keychain', mapper: mapKeychain },
    ];

    // ===== Mappers =====
    function mapSkin(item) {
        const weaponName = item.weapon ? item.weapon.name : '';
        let category = 'Rifle';
        if (item.category) {
            const catName = item.category.name || '';
            if (catName.includes('Pistol')) category = 'Pistol';
            else if (catName.includes('SMG')) category = 'SMG';
            else if (catName.includes('Shotgun')) category = 'Shotgun';
            else if (catName.includes('Machine')) category = 'Machine Gun';
            else if (catName.includes('Knife') || (item.name && item.name.startsWith('★'))) category = 'Knife';
            else if (catName.includes('Glove')) category = 'Gloves';
        }
        if (item.name && item.name.includes('Gloves')) category = 'Gloves';
        if (item.name && item.name.startsWith('★') && !item.name.includes('Gloves')) category = 'Knife';

        return {
            name: item.name,
            type: category,
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    function mapSticker(item) {
        return {
            name: item.name,
            type: 'Sticker',
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    function mapCrate(item) {
        return {
            name: item.name,
            type: item.type || 'Container',
            image: item.image || null,
            rarity: null,
        };
    }

    function mapAgent(item) {
        return {
            name: item.name,
            type: 'Agent',
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    function mapPatch(item) {
        return {
            name: item.name,
            type: 'Patch',
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    function mapCollectible(item) {
        return {
            name: item.name,
            type: 'Collectible',
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    function mapMusicKit(item) {
        return {
            name: item.name,
            type: 'Music Kit',
            image: item.image || null,
            rarity: null,
        };
    }

    function mapKey(item) {
        return {
            name: item.name,
            type: 'Key',
            image: item.image || null,
            rarity: null,
        };
    }

    function mapGraffiti(item) {
        return {
            name: item.name,
            type: 'Graffiti',
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    function mapKeychain(item) {
        return {
            name: item.name,
            type: 'Keychain',
            image: item.image || null,
            rarity: item.rarity ? item.rarity.color : null,
        };
    }

    // ===== Cache =====
    function getCachedItems() {
        try {
            const raw = localStorage.getItem(CACHE_KEY);
            if (!raw) return null;
            const cache = JSON.parse(raw);
            if (Date.now() - cache.timestamp > CACHE_TTL) {
                localStorage.removeItem(CACHE_KEY);
                return null;
            }
            return cache.items;
        } catch {
            return null;
        }
    }

    function setCachedItems(itemsList) {
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                items: itemsList,
            }));
        } catch {
            // localStorage might be full - ignore
        }
    }

    // ===== Fetch =====
    async function fetchEndpoint(endpoint) {
        try {
            const response = await fetch(endpoint.url);
            if (!response.ok) return [];
            const data = await response.json();
            if (!Array.isArray(data)) return [];
            return data.map(endpoint.mapper).filter(item => item && item.name);
        } catch {
            return [];
        }
    }

    async function loadItems(onProgress) {
        // Check cache first
        const cached = getCachedItems();
        if (cached && cached.length > 0) {
            items = cached;
            loaded = true;
            if (onProgress) onProgress(items.length, true);
            return items;
        }

        // Fetch all endpoints in parallel
        const allResults = [];
        let completedCount = 0;

        const promises = ENDPOINTS.map(async (endpoint) => {
            const result = await fetchEndpoint(endpoint);
            allResults.push(...result);
            completedCount++;
            if (onProgress) onProgress(allResults.length, false, completedCount, ENDPOINTS.length);
            return result;
        });

        await Promise.all(promises);

        // Deduplicate by name
        const nameMap = new Map();
        for (const item of allResults) {
            if (!nameMap.has(item.name)) {
                nameMap.set(item.name, item);
            }
        }

        items = Array.from(nameMap.values());
        items.sort((a, b) => a.name.localeCompare(b.name));

        // Cache
        setCachedItems(items);
        loaded = true;
        if (onProgress) onProgress(items.length, true);
        return items;
    }

    // ===== Search =====
    function search(query, limit = 50) {
        if (!query || query.length < 1) return [];
        const q = query.toLowerCase();
        const results = [];
        for (const item of items) {
            if (item.name.toLowerCase().includes(q)) {
                results.push(item);
                if (results.length >= limit) break;
            }
        }
        return results;
    }

    function findByName(name) {
        if (!name) return null;
        const lower = name.toLowerCase();
        return items.find(i => i.name.toLowerCase() === lower) || null;
    }

    // ===== Public API =====
    return {
        loadItems,
        search,
        findByName,
        isLoaded: () => loaded,
        getCount: () => items.length,
    };
})();
