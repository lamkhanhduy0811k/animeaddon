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

const BASE_URL = 'https://animehay11.site';

const client = axios.create({
    baseURL: BASE_URL,
    timeout: 5000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': BASE_URL
    }
});

const manifest = {
    id: 'vn.animehay.standalone',
    version: '1.0.0',
    name: 'AnimeHay Độc Lập',
    description: 'Addon Stremio riêng biệt cào dữ liệu từ AnimeHay',
    resources: ['catalog', 'meta', 'stream'],
    types: ['series'],
    idPrefixes: ['ah_'],
    catalogs: [
        {
            type: 'series',
            id: 'animehay_moi_cap_nhat',
            name: 'AnimeHay - Mới Cập Nhật',
            extra: [{ name: 'search', isRequired: false }]
        }
    ]
};

app.get('/', (req, res) => res.json(manifest));
app.get('/manifest.json', (req, res) => res.json(manifest));

async function getLatestAnime() {
    try {
        const { data } = await client.get('/');
        const items = [];
        
        const regex = /<a[^>]+href="([^"]+)"[^>]*title="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
        let match;
        while ((match = regex.exec(data)) !== null && items.length < 30) {
            const link = match[1];
            const title = match[2];
            const innerHtml = match[3];
            
            if (link && title) {
                const imgMatch = innerHtml.match(/src="([^"]+)"/);
                const poster = imgMatch ? imgMatch[1] : '';
                
                const slugMatch = link.match(/([^\/]+)\.html$/) || link.match(/\/([^\/]+)$/);
                const slug = slugMatch ? slugMatch[1] : title;
                
                if (!items.some(i => i.name === title)) {
                    items.push({
                        id: `ah_${slug}`,
                        type: 'series',
                        name: title,
                        poster: poster.startsWith('http') ? poster : (poster ? `${BASE_URL}${poster}` : ''),
                        posterShape: 'poster',
                        releaseInfo: 'AnimeHay'
                    });
                }
            }
        }
        return items;
    } catch (e) {
        return [];
    }
}

app.get('/catalog/:type/:id*', async (req, res) => {
    const items = await getLatestAnime();
    res.json({ metas: items });
});

app.get('/meta/:type/:id*', async (req, res) => {
    const rawId = req.params.id + (req.params[0] || '');
    const slug = rawId.replace('.json', '').replace('ah_', '').split(':')[0];

    res.json({
        meta: {
            id: `ah_${slug}`,
            type: 'series',
            name: 'AnimeHay Phim',
            poster: '',
            description: 'Chi tiết phim từ AnimeHay Standalone Addon',
            videos: [
                {
                    id: `ah_${slug}:1`,
                    title: 'Tập 1',
                    season: 1,
                    episode: 1
                }
            ]
        }
    });
});

app.get('/stream/:type/:id*', async (req, res) => {
    res.json({ streams: [] });
});

app.listen(process.env.PORT || 3000);
module.exports = app;
                  
