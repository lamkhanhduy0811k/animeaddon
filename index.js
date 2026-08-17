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

// Sử dụng API Kamyroll làm nguồn dữ liệu chính
const KAMYROLL_API = 'https://api.kamyroll.tech/api/v1/kamy';
const IMAGES_PROXY = 'https://images.weserv.nl/?url='; // Proxy để tối ưu hình ảnh

const manifest = {
    id: 'vn.kamyroll.anime',
    version: '1.0.0',
    name: 'Anime Kamyroll VN',
    description: 'Addon Anime chuyên nghiệp từ nguồn Kamyroll, tốc độ cao, ổn định',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series', 'movie'],
    idPrefixes: ['km_', 'tmdb:'],
    catalogs: [
        {
            type: 'series',
            id: 'kamy_series',
            name: 'Kamyroll - Anime Bộ Mới',
            extra: [{ name: 'search', isRequired: false }]
        },
        {
            type: 'movie',
            id: 'kamy_movies',
            name: 'Kamyroll - Anime Movie',
            extra: [{ name: 'search', isRequired: false }]
        }
    ]
};

app.get('/', (req, res) => res.json(manifest));
app.get('/manifest.json', (req, res) => res.json(manifest));

// Hàm lấy danh sách Anime từ Kamyroll
async function getKamyList(type) {
    try {
        // Mapping loại phim: series hoặc movie
        const category = type === 'series' ? 'trending' : 'movies';
        const response = await axios.get(`${KAMYROLL_API}/list/${category}`, { timeout: 5000 });
        const list = response.data?.result || [];

        return list.map(item => ({
            id: `km_${item.id}`, // Sử dụng ID riêng của Kamyroll
            type: type,
            name: item.title_romaji || item.title_english || item.title_japanese,
            poster: item.poster_art ? `${IMAGES_PROXY}${encodeURIComponent(item.poster_art)}&w=800&fit=cover` : '',
            posterShape: 'poster',
            releaseInfo: item.release_year ? String(item.release_year) : '',
            description: item.synopsis || 'Không có mô tả.'
        }));
    } catch (e) {
        return [];
    }
}

// Hàm tìm kiếm Anime trên Kamyroll
async function searchKamy(query) {
    try {
        const response = await axios.get(`${KAMYROLL_API}/search?query=${encodeURIComponent(query)}`, { timeout: 5000 });
        const list = response.data?.result || [];

        return list.map(item => ({
            id: `km_${item.id}`,
            type: item.type === 'movie' ? 'movie' : 'series',
            name: item.title_romaji || item.title_english || item.title_japanese,
            poster: item.poster_art ? `${IMAGES_PROXY}${encodeURIComponent(item.poster_art)}&w=800&fit=cover` : '',
            posterShape: 'poster',
            releaseInfo: item.release_year ? String(item.release_year) : '',
            description: item.synopsis || 'Không có mô tả.'
        }));
    } catch (e) {
        return [];
    }
}

app.get('/catalog/:type/:id*', async (req, res) => {
    let type = req.params.type;
    let rawId = req.params.id + (req.params[0] || '');
    rawId = rawId.replace('.json', '');

    // Xử lý tìm kiếm
    if (rawId.includes('search=')) {
        const queryMatch = rawId.match(/search=([^&]+)/);
        const keyword = queryMatch ? decodeURIComponent(queryMatch[1]) : '';
        if (keyword) {
            const results = await searchKamy(keyword);
            return res.json({ metas: results });
        }
    }
    
    // Xử lý danh mục chính
    const metas = await getKamyList(type);
    return res.json({ metas });
});

// Hàm lấy chi tiết phim và danh sách tập
async function getKamyMeta(animeId) {
    try {
        const cleanId = animeId.replace('km_', '');
        const response = await axios.get(`${KAMYROLL_API}/anime/${cleanId}`, { timeout: 5000 });
        const animeData = response.data?.result;

        if (!animeData) return null;

        // Lấy danh sách các mùa (seasons) và tập phim
        const episodesList = animeData.episodes || [];
        const videos = episodesList.map((ep, index) => ({
            id: `km_ep_${animeId}:${ep.episode_number || index + 1}`,
            title: ep.title || `Tập ${ep.episode_number || index + 1}`,
            season: ep.season_number || 1,
            episode: ep.episode_number || index + 1,
            thumbnail: ep.thumbnail ? `${IMAGES_PROXY}${encodeURIComponent(ep.thumbnail)}&w=1200&fit=cover` : '',
            released: new Date().toISOString() // Giả lập ngày phát hành
        }));

        return {
            id: `km_${animeData.id}`,
            type: animeData.type === 'movie' ? 'movie' : 'series',
            name: animeData.title_romaji || animeData.title_english,
            poster: animeData.poster_art ? `${IMAGES_PROXY}${encodeURIComponent(animeData.poster_art)}&w=800&fit=cover` : '',
            background: animeData.cover_art ? `${IMAGES_PROXY}${encodeURIComponent(animeData.cover_art)}&w=1200&fit=cover` : '',
            description: animeData.synopsis || 'Không có mô tả.',
            year: animeData.release_year ? String(animeData.release_year) : '',
            releaseInfo: animeData.release_year ? String(animeData.release_year) : '',
            genres: animeData.genres || [],
            videos: videos
        };

    } catch (e) {
        return null;
    }
}

app.get('/meta/:type/:id*', async (req, res) => {
    try {
        const rawId = req.params.id + (req.params[0] || '');
        const animeId = rawId.replace('.json', '').split(':')[0];

        if (!animeId || !animeId.startsWith('km_')) return res.json({ meta: null });

        const metaData = await getKamyMeta(animeId);
        return res.json({ meta: metaData });
    } catch (e) {
        return res.json({ meta: null });
    }
});

app.get('/stream/:type/:id*', async (req, res) => {
    try {
        let rawId = req.params.id + (req.params[0] || '');
        const parts = rawId.replace('.json', '').split(':');
        const animeId = parts[0].replace('km_ep_', ''); // ID anime
        const epNumber = parts[1]; // Số tập

        // Lấy link trực tiếp từ Kamyroll
        const response = await axios.get(`${KAMYROLL_API}/anime/${animeId}/episode/${epNumber}`, { timeout: 5000 });
        const streamData = response.data?.result;

        if (!streamData || !streamData.streams) return res.json({ streams: [] });

        const streams = streamData.streams.map(s => ({
            title: `Kamyroll - ${s.quality || 'Auto'}`,
            url: s.url, // Link m3u8 trực tiếp
            behaviorHints: {
                notWebPlayer: true // Gợi ý mở bằng trình phát video ngoài
            }
        }));

        return res.json({ streams });
    } catch (e) {
        return res.json({ streams: [] });
    }
});

app.listen(process.env.PORT || 3000);
module.exports = app;
            
