import express from 'express';
import cors from 'cors';
import axios from 'axios';

const app = express();
const PORT = process.env.PORT || 5000;

// CORSミドルウェアの有効化（フロントエンドViteアプリからのアクセスを許可）
app.use(cors());

// RSS/HTML 中継（プロキシ）エンドポイント
app.get('/api/fetch', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) {
        return res.status(400).json({ error: 'Missing url query parameter' });
    }

    try {
        console.log(`[Proxy Server] Fetching: ${targetUrl}`);
        
        // 一般的なブラウザ（Chrome）のUser-Agentを模倣して、配信元サイト（Cloudflare等）のブロックを回避
        const response = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
                'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 10000 // 10秒でタイムアウト設定
        });

        // レスポンスのコンテンツタイプをそのまま中継して返却
        res.setHeader('Content-Type', response.headers['content-type'] || 'text/xml; charset=utf-8');
        res.send(response.data);
    } catch (error) {
        console.error(`[Proxy Server Error] Failed to fetch ${targetUrl}:`, error.message);
        
        // エラー詳細をJSONで返却
        res.status(500).json({ 
            error: 'Failed to fetch content from target', 
            details: error.message 
        });
    }
});

app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`  Local News Proxy Server is running!`);
    console.log(`  Target URL API: http://localhost:${PORT}/api/fetch`);
    console.log(`==================================================`);
});
