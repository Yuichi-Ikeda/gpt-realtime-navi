const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// 環境変数を読み込み
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(cors());
app.use(express.json());

// 静的ファイルの提供（HTMLファイルなど）
app.use(express.static('.'));

// セッション管理用の簡易的なメモリストア
const sessions = new Map();

// ログインAPIエンドポイント
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    // 環境変数から認証情報を取得
    const VALID_USERNAME = process.env.VALID_USERNAME;
    const VALID_PASSWORD = process.env.VALID_PASSWORD;
    
    // 認証チェック
    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
        // セッショントークンを生成（簡易的な実装）
        const sessionToken = `session_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        
        // セッションを保存（24時間有効）
        sessions.set(sessionToken, {
            username,
            createdAt: Date.now(),
            expiresAt: Date.now() + (24 * 60 * 60 * 1000)
        });
        
        res.json({ 
            success: true,
            sessionToken,
            message: 'ログインに成功しました'
        });
    } else {
        res.status(401).json({ 
            success: false,
            message: 'ユーザー名またはパスワードが正しくありません'
        });
    }
});

// セッション検証ミドルウェア
function validateSession(req, res, next) {
    const sessionToken = req.headers['x-session-token'];
    
    if (!sessionToken) {
        return res.status(401).json({ error: 'セッショントークンが必要です' });
    }
    
    const session = sessions.get(sessionToken);
    
    if (!session) {
        return res.status(401).json({ error: '無効なセッションです' });
    }
    
    if (Date.now() > session.expiresAt) {
        sessions.delete(sessionToken);
        return res.status(401).json({ error: 'セッションが期限切れです' });
    }
    
    req.session = session;
    next();
}

// 一時トークン（エフェメラルキー）を取得するAPIエンドポイント（認証必須）
app.post('/api/get-token', validateSession, async (req, res) => {
    try {
        const SESSIONS_URL = process.env.AZURE_OPENAI_SESSIONS_URL;
        const API_KEY = process.env.AZURE_OPENAI_API_KEY;
        const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-realtime';
        const VOICE = process.env.AZURE_OPENAI_VOICE || 'verse';

        // 環境変数のチェック
        if (!SESSIONS_URL || !API_KEY) {
            return res.status(500).json({ 
                error: '環境変数が正しく設定されていません' 
            });
        }

        // Azure OpenAI Realtime API にセッション作成リクエストを送信
        const response = await fetch(SESSIONS_URL, {
            method: "POST",
            headers: {
                "api-key": API_KEY,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: DEPLOYMENT,
                voice: VOICE
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Azure API Error:', errorText);
            return res.status(response.status).json({ 
                error: 'Azure APIからのレスポンスエラー',
                details: errorText 
            });
        }

        const data = await response.json();

        // クライアントに一時トークンとセッションIDを返す
        res.json({
            sessionId: data.id,
            ephemeralKey: data.client_secret?.value,
            webrtcUrl: process.env.AZURE_OPENAI_WEBRTC_URL
        });

    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({ 
            error: 'トークン生成エラー',
            message: error.message 
        });
    }
});

// ヘルスチェックエンドポイント
app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
