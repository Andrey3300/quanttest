const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { getGenerator, initializeAllGenerators, saveAllGenerators, SYMBOL_CONFIG, TIMEFRAMES } = require('./chartGenerator');
const logger = require('./errorLogger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use(express.static('frontend'));

// Users file path
const USERS_FILE = path.join(__dirname, 'users.json');

// Load users from file
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
  return [];
}

// Save users to file
function saveUsers(users) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  } catch (error) {
    console.error('Error saving users:', error);
  }
}

// Initialize users
let users = loadUsers();

// Email transporter
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Middleware для проверки токена
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'secret', (err, user) => {
    if (err) {
      console.error('Token verification error:', err);
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Регистрация
app.post('/api/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Проверка существования пользователя
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
      // Если пользователь существует, проверяем пароль
      const validPassword = await bcrypt.compare(password, existingUser.password);
      if (!validPassword) {
        return res.status(400).json({ error: 'Incorrect password' });
      }

      // Пароль правильный - выполняем вход
      const token = jwt.sign({ id: existingUser.id, email: existingUser.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

      return res.json({
        token,
        user: {
          id: existingUser.id,
          email: existingUser.email,
          demoBalance: existingUser.demoBalance || 10000,
          realBalance: existingUser.realBalance || 0,
          activeAccount: existingUser.activeAccount || 'demo'
        }
      });
    }

    // Хеширование пароля
    const hashedPassword = await bcrypt.hash(password, 10);

    // Создание нового пользователя
    const user = {
      id: users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1,
      email,
      password: hashedPassword,
      demoBalance: 10000, // Демо баланс
      realBalance: 0, // Реальный баланс
      activeAccount: 'demo', // Активный аккаунт по умолчанию
      createdAt: new Date().toISOString()
    };

    users.push(user);
    saveUsers(users);

    // Создание токена
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        demoBalance: user.demoBalance,
        realBalance: user.realBalance,
        activeAccount: user.activeAccount
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Вход
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Поиск пользователя
    const user = users.find(u => u.email === email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Проверка пароля
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Создание токена
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET || 'secret', { expiresIn: '24h' });

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        demoBalance: user.demoBalance || 10000,
        realBalance: user.realBalance || 0,
        activeAccount: user.activeAccount || 'demo'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Восстановление пароля
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Поиск пользователя по email
    const user = users.find(u => u.email === email);
    if (!user) {
      // Из соображений безопасности не говорим, что email не найден
      return res.json({ message: 'If email exists, password reset link has been sent' });
    }

    // Генерация нового пароля
    const newPassword = Math.random().toString(36).slice(-8);
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;

    // Отправка email (в демо режиме просто логируем)
    console.log(`New password for ${email}: ${newPassword}`);

    res.json({ message: 'New password has been sent to your email' });
  } catch (error) {
    console.error('Password reset error:', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

// Получение информации о пользователе
app.get('/api/user', authenticateToken, (req, res) => {
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    email: user.email,
    demoBalance: user.demoBalance || 10000,
    realBalance: user.realBalance || 0,
    activeAccount: user.activeAccount || 'demo'
  });
});

// Переключение аккаунта
app.post('/api/switch-account', authenticateToken, (req, res) => {
  const { accountType } = req.body;
  
  if (accountType !== 'demo' && accountType !== 'real') {
    return res.status(400).json({ error: 'Invalid account type' });
  }
  
  const user = users.find(u => u.id === req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  user.activeAccount = accountType;
  saveUsers(users);
  
  res.json({
    id: user.id,
    email: user.email,
    demoBalance: user.demoBalance || 10000,
    realBalance: user.realBalance || 0,
    activeAccount: user.activeAccount
  });
});

// ===== CHART API =====

// 🎯 НОВОЕ: Получение исторических свечей для таймфрейма
app.get('/api/chart/history', (req, res) => {
  try {
    const symbol = req.query.symbol || 'USD_MXN_OTC';
    const timeframe = req.query.timeframe || 'S5';
    const from = req.query.from ? parseInt(req.query.from) : null;
    const to = req.query.to ? parseInt(req.query.to) : null;
    
    const generator = getGenerator(symbol);
    
    if (!generator.initialized) {
      return res.status(503).json({ error: 'Generator not ready yet' });
    }
    
    const candles = generator.getCandles(timeframe, from, to);
    
    res.json({
      symbol,
      timeframe,
      candles,
      currentPrice: generator.getCurrentPrice()
    });
  } catch (error) {
    console.error('Chart history error:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// 🎯 НОВОЕ: Получение текущего состояния (для синхронизации таймера)
app.get('/api/chart/current-state/:symbol', (req, res) => {
  try {
    const symbol = req.params.symbol;
    const timeframe = req.query.timeframe || 'S5';
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    const generator = getGenerator(symbol);
    
    if (!generator.initialized) {
      return res.status(503).json({ error: 'Generator not ready yet' });
    }
    
    const currentCandle = generator.getCurrentCandle(timeframe);
    const currentPrice = generator.getCurrentPrice();
    const serverTime = Math.floor(Date.now() / 1000);
    
    // Вычисляем время начала свечи и длительность таймфрейма
    const timeframeSeconds = TIMEFRAMES[timeframe].seconds;
    const candleStartTime = currentCandle ? currentCandle.time : Math.floor(serverTime / timeframeSeconds) * timeframeSeconds;
    
    res.json({
      symbol,
      timeframe,
      currentCandle,
      currentPrice,
      candleStartTime,
      timeframeSeconds,
      serverTime
    });
  } catch (error) {
    console.error('Current state error:', error);
    res.status(500).json({ error: 'Failed to fetch current state' });
  }
});

// ===== ИНИЦИАЛИЗАЦИЯ ГЕНЕРАТОРОВ 24/7 =====

// Очистка старых логов
console.log('🧹 Cleaning old logs before server start...');
const logDir = path.join(__dirname, '..', 'logs');
if (fs.existsSync(logDir)) {
    const files = fs.readdirSync(logDir);
    let cleaned = 0;
    files.forEach(file => {
        try {
            fs.unlinkSync(path.join(logDir, file));
            cleaned++;
        } catch (err) {
            // Игнорируем ошибки удаления
        }
    });
    console.log(`✅ Cleaned ${cleaned} old log files`);
}

// Инициализируем ВСЕ генераторы при старте сервера
console.log('🚀 Initializing tick generators for 24/7 operation...');

const initTimeout = setTimeout(() => {
    console.error('❌ CRITICAL: Generator initialization timeout (>2min)');
    process.exit(1);
}, 120000);

initializeAllGenerators()
    .then(() => {
        clearTimeout(initTimeout);
        console.log('✅ All tick generators are running!');
    })
    .catch(error => {
        clearTimeout(initTimeout);
        console.error('❌ CRITICAL: Generator initialization failed:', error);
        process.exit(1);
    });

// ===== WEBSOCKET SERVER =====

const wss = new WebSocket.Server({ server, path: '/ws/chart' });

// 🎯 НОВОЕ: Подписки по символу (БЕЗ таймфрейма!)
const subscriptions = new Map(); // symbol -> Set of WebSocket connections

wss.on('connection', (ws, req) => {
  logger.debug('websocket', 'New WebSocket connection');
  
  let currentSubscription = null; // symbol
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe') {
        const symbol = data.symbol || 'USD_MXN_OTC';
        
        // Отписываемся от предыдущей подписки
        if (currentSubscription && subscriptions.has(currentSubscription)) {
          subscriptions.get(currentSubscription).delete(ws);
          logger.debug('websocket', `Client unsubscribed from ${currentSubscription}`);
        }
        
        // Подписываемся на новый symbol
        currentSubscription = symbol;
        if (!subscriptions.has(symbol)) {
          subscriptions.set(symbol, new Set());
        }
        subscriptions.get(symbol).add(ws);
        
        logger.debug('websocket', `Client subscribed to ${symbol}`);
        
        // Отправляем подтверждение
        ws.send(JSON.stringify({
          type: 'subscribed',
          symbol
        }));
      } else if (data.type === 'unsubscribe') {
        const symbol = data.symbol;
        
        if (symbol && subscriptions.has(symbol)) {
          subscriptions.get(symbol).delete(ws);
          logger.debug('websocket', `Client unsubscribed from ${symbol}`);
        }
        
        if (currentSubscription === symbol) {
          currentSubscription = null;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    if (currentSubscription && subscriptions.has(currentSubscription)) {
      subscriptions.get(currentSubscription).delete(ws);
    }
    logger.debug('websocket', 'WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// 🎯 НОВОЕ: Генерация и отправка тиков каждые 50ms (было 250ms)
setInterval(() => {
  subscriptions.forEach((clients, symbol) => {
    if (clients.size === 0) return;
    
    try {
      const generator = getGenerator(symbol);
      
      if (!generator.initialized) {
        return;
      }
      
      // Генерируем новый тик
      const { tick, aggregationResults } = generator.generateTick();
      
      // Отправляем тик всем подписанным клиентам
      const message = JSON.stringify({
        type: 'tick',
        symbol,
        price: tick.price,
        time: tick.time
      });
      
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
      
      // Если есть новые завершенные свечи - отправляем события
      Object.keys(aggregationResults).forEach(timeframe => {
        const result = aggregationResults[timeframe];
        
        if (result.isNewCandle && result.completedCandle) {
          const candleMessage = JSON.stringify({
            type: 'newCandle',
            symbol,
            timeframe,
            candle: result.completedCandle
          });
          
          clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(candleMessage);
            }
          });
          
          logger.debug('websocket', `New ${timeframe} candle`, {
            symbol,
            time: result.completedCandle.time
          });
        }
      });
      
    } catch (error) {
      console.error(`Error generating tick for ${symbol}:`, error);
    }
  });
}, 50); // Каждые 50ms (20 тиков в секунду)

// ===== ПЕРСИСТЕНТНОСТЬ =====

// Автосохранение каждые 5 минут
setInterval(() => {
  logger.info('persistence', 'Auto-saving all generators...');
  const result = saveAllGenerators();
  console.log(`💾 Auto-save: ${result.saved} saved, ${result.failed} failed`);
}, 5 * 60 * 1000);

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  console.log('💾 Saving all generators...');
  const result = saveAllGenerators();
  console.log(`✅ Saved ${result.saved} generators`);
  
  wss.clients.forEach(client => {
    client.close(1000, 'Server shutting down');
  });
  
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
  
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection:', reason);
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}/ws/chart`);
});
