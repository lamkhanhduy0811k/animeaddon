const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    next();
});

function formatPoster(posterUrl, thumbUrl) {
    let img = posterUrl || thumbUrl || '';
    if (!img) return '';
    if (!img.startsWith('http')) {
        img = 'https://phimimg.com/' + img;
    }
    return `https://images.weserv.nl/?url=${encodeURIComponent(img)}&w=800&fit=cover&q=85`;
}

const manifest = {
    id: 'vn.animehay.pro.v2',
    version: '2.0.0',
    name: 'AnimeHay & Movie Pro',
    description: 'Addon Anime chuyên nghiệp: Hàng trăm Anime Bộ và Anime Movie phân loại riêng biệt',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['ah_'],
    catalogs: [
        {
            type: 'series',
            id: 'anime_bo_pro',
            name: 'AnimeHay - Anime Bộ (Series)',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'anime_le_pro',
            name: 'AnimeHay - Anime Lẻ (Movie)',
            extra: [{ name: 'search', isRequired: false }]
        }
    ]
};

app.get('/', (req, res) => res.json(manifest));
app.get('/manifest.json', (req, res) => res.json(manifest));

async function fetchCategoryItems(categoryType) {
    let items = [];
    try {
        // Tải nhiều trang để đạt số lượng lớn phim
        for (let page = 1; page <= 10; page++) {
            let url = `https://phimapi.com/v1/api/danh-sach/${categoryType}?page=${page}&limit=50`;
            let res = await axios.get(url, { timeout: 4000 });
            let list = res.data?.data?.items || [];
            if (list.length === 0) break;
            items.push(...list);
        }
    } catch (e) {
        // Bỏ qua lỗi nhỏ để đảm bảo trả về dữ liệu đã tải được
    }
    return items;
}

app.get('/catalog/:type/:id*', async (req, res) => {
    let type = req.params.type;
    let rawId = req.params.id + (req.params[0] || '');
    rawId = rawId.replace('.json', '');

    if (rawId.includes('search=')) {
        const queryMatch = rawId.match(/search=([^&]+)/);
        const keyword = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
        try {
            let seriesItems = await fetchCategoryItems('hoat-hinh');
            let movieItems = await fetchCategoryItems('phim-le');
            let allItems = [...seriesItems, ...movieItems];
            const results = [];
            
            allItems.forEach(item => {
                let name = (item.name || '').toLowerCase();
                let origin = (item.origin_name || '').toLowerCase();
                let kw = keyword.toLowerCase();
                if (name.includes(kw) || origin.includes(kw)) {
                    results.push({
                        id: `ah_${item.slug}`,
                        type: item.type === 'single' ? 'movie' : 'series',
                        name: item.name || item.title,
                        poster: formatPoster(item.poster_url, item.thumb_url),
                        posterShape: 'poster',
                        releaseInfo: `${item.year || '2026'} • ${item.episode_current || 'Full'}`,
                        description: item.origin_name ? `Tên gốc: ${item.origin_name}` : ''
                    });
                }
            });
            return res.json({ metas: results });
        } catch (e) {
            return res.json({ metas: [] });
        }
    }

    try {
        let rawItems = [];
        if (type === 'series') {
            rawItems = await fetchCategoryItems('hoat-hinh');
        } else {
            rawItems = await fetchCategoryItems('phim-le');
        }

        const metas = rawItems.map(item => ({
            id: `ah_${item.slug}`,
            type: type,
            name: item.name || item.title,
            poster: formatPoster(item.poster_url, item.thumb_url),
            posterShape: 'poster',
            releaseInfo: `${item.year || '2026'} • ${item.episode_current || 'Full'}`,
            description: item.origin_name ? `Tên gốc: ${item.origin_name}` : ''
        }));

        return res.json({ metas });
    } catch (e) {
        return res.json({ metas: [] });
    }
});

app.get('/meta/:type/:id*', async (req, res) => {
    try {
        let rawId = req.params.id + (req.params[0] || '');
        let slug = rawId.replace('.json', '').replace('ah_', '').split(':')[0];

        if (!slug) return res.json({ meta: null });

        let resP = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 4000 });
        let movie = resP.data?.movie;
        let episodesList = resP.data?.episodes || [];

        if (!movie) return res.json({ meta: null });

        let rawEpisodes = [];
        for (const s of episodesList) {
            if (s.server_data && s.server_data.length > rawEpisodes.length) {
                rawEpisodes = s.server_data;
            }
        }

        const moviePoster = formatPoster(movie.poster_url, movie.thumb_url);
        const videos = rawEpisodes.map((ep, idx) => {
            let epNum = idx + 1;
            let epTitle = ep.name ? String(ep.name).trim() : `Tập ${epNum}`;
            if (!/^tập/i.test(epTitle) && rawEpisodes.length > 1) {
                epTitle = `Tập ${epTitle}`;
            }
            return {
                id: `ah_${slug}:${idx + 1}`,
                title: epTitle,
                thumbnail: moviePoster,
                released: new Date().toISOString(),
                season: 1,
                episode: epNum
            };
        });

        return res.json({
            meta: {
                id: `ah_${slug}`,
                type: movie.type === 'single' ? 'movie' : 'series',
                name: movie.name || movie.title,
                poster: moviePoster,
                background: moviePoster,
                description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : '',
                year: String(movie.year || '2026'),
                releaseInfo: `${movie.year || '2026'} • ${movie.episode_current || 'Full'}`,
                videos: videos.length > 0 ? videos : undefined
            }
        });
    } catch (e) {
        return res.json({ meta: null });
    }
});

app.get('/stream/:type/:id*', async (req, res) => {
    try {
        let rawId = req.params.id + (req.params[0] || '');
        const parts = rawId.replace('.json', '').split(':');
        const baseId = parts[0];
        const epIndex = parts[1] ? parseInt(parts[1]) - 1 : 0;

        const slug = baseId.replace('ah_', '');
        const streams = [];

        let apiRes = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 4000 });
        const episodesList = apiRes.data?.episodes || [];

        episodesList.forEach((server, sIdx) => {
            const serverName = server.server_name || `Server ${sIdx + 1}`;
            const serverData = server.server_data || [];
            const targetEp = serverData[epIndex] || serverData[0];

            if (targetEp && targetEp.link_m3u8) {
                streams.push({
                    title: `AnimeHay Pro - ${serverName}`,
                    url: targetEp.link_m3u8
                });
            }
        });

        return res.json({ streams });
    } catch (e) {
        return res.json({ streams: [] });
    }
});

app.listen(process.env.PORT || 3000);
module.exports = app;
            
