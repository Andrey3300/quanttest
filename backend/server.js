const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { getGenerator } = require('./chartGenerator');
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

    // В реальном приложении отправляем email:
    // await transporter.sendMail({
    //   from: process.env.EMAIL_USER,
    //   to: email,
    //   subject: 'Password Reset - QuantFX',
    //   text: `Your new password is: ${newPassword}`
    // });

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

// Получение исторических данных графика
app.get('/api/chart/history', (req, res) => {
  try {
    const symbol = req.query.symbol || 'USD_MXN';
    const from = req.query.from ? parseInt(req.query.from) : null;
    const to = req.query.to ? parseInt(req.query.to) : null;
    
    const generator = getGenerator(symbol);
    const data = generator.getHistoricalData(from, to);
    
    res.json({
      symbol,
      data
    });
  } catch (error) {
    console.error('Chart history error:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// ===== WEBSOCKET SERVER =====

// Создание WebSocket сервера
const wss = new WebSocket.Server({ server, path: '/ws/chart' });

// Хранение активных подписок
const subscriptions = new Map(); // symbol -> Set of WebSocket connections

wss.on('connection', (ws, req) => {
  console.log('New WebSocket connection');
  
  let currentSymbol = null;
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe') {
        const symbol = data.symbol || 'USD_MXN';
        
        // Отписываемся от предыдущего символа
        if (currentSymbol && subscriptions.has(currentSymbol)) {
          subscriptions.get(currentSymbol).delete(ws);
          console.log(`Client unsubscribed from ${currentSymbol} (auto)`);
        }
        
        // Подписываемся на новый символ
        currentSymbol = symbol;
        if (!subscriptions.has(symbol)) {
          subscriptions.set(symbol, new Set());
        }
        subscriptions.get(symbol).add(ws);
        
        console.log(`Client subscribed to ${symbol}`);
        
        // Отправляем подтверждение
        ws.send(JSON.stringify({
          type: 'subscribed',
          symbol
        }));
      } else if (data.type === 'unsubscribe') {

        // УЛУЧШЕНИЕ: Явная обработка unsubscribe


        const symbol = data.symbol;
        
        if (symbol && subscriptions.has(symbol)) {
          subscriptions.get(symbol).delete(ws);
          console.log(`Client explicitly unsubscribed from ${symbol}`);
          
          // Отправляем подтверждение
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            symbol
          }));
        }
        
        if (currentSymbol === symbol) {
          currentSymbol = null;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    // Удаляем подписку при отключении
    if (currentSymbol && subscriptions.has(currentSymbol)) {
      subscriptions.get(currentSymbol).delete(ws);
    }
    console.log('WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Флаг для блокировки тиков во время создания новой свечи
let isCreatingNewCandle = false;

// Плавные обновления текущей свечи (тики) каждые 200ms для максимальной плавности (5 тиков в секунду)
setInterval(() => {
  // Не отправляем тики, если создается новая свеча
  if (isCreatingNewCandle) {
    return;
  }
  
  subscriptions.forEach((clients, symbol) => {
    if (clients.size > 0) {
      const generator = getGenerator(symbol);
      
      // ЗАЩИТА: Проверяем что генератор инициализирован с данными
      if (!generator.candles || generator.candles.length === 0) {
        logger.warn('websocket', 'Generator not initialized, skipping tick', { symbol });
        return;
      }
      
      const updatedCandle = generator.generateCandleTick();
      
      // Дополнительная проверка: убедимся что время - это число
      if (typeof updatedCandle.time !== 'number' || isNaN(updatedCandle.time)) {
        logger.error('websocket', 'Invalid tick time format', { 
          symbol: symbol,
          candle: updatedCandle
        });
        console.error('Invalid tick time format:', updatedCandle.time);
        return;
      }
      
      const message = JSON.stringify({
        type: 'tick',
        symbol,
        data: updatedCandle
      });
      
      // Отправляем всем подписанным клиентам
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  });
}, 200); // каждые 200ms (5 тиков в секунду) для максимально плавной анимации

// Создание новой свечи каждые 5 секунд
setInterval(() => {
  // Блокируем отправку тиков
  isCreatingNewCandle = true;
  
  // РЕШЕНИЕ #5: Логируем начало создания новых свечей
  const startTime = Date.now();
  logger.debug('websocket', 'Creating new candles for all symbols', {
    symbolCount: subscriptions.size,
    timestamp: startTime
  });
  
  subscriptions.forEach((clients, symbol) => {
    if (clients.size > 0) {
      const generator = getGenerator(symbol);
      
      // ЗАЩИТА: Проверяем что генератор инициализирован с данными
      if (!generator.candles || generator.candles.length === 0) {
        logger.warn('websocket', 'Generator not initialized, skipping new candle', { symbol });
        return;
      }
      
      const newCandle = generator.generateNextCandle();
      
      // Проверка: убедимся что время - это число
      if (typeof newCandle.time !== 'number' || isNaN(newCandle.time)) {
        logger.error('websocket', 'Invalid new candle time format', { 
          symbol: symbol,
          candle: newCandle
        });
        console.error('Invalid new candle time format:', newCandle.time);
        return;
      }
      
      // РЕШЕНИЕ #5: Валидация OHLC перед отправкой
      const isValidOHLC = newCandle.high >= newCandle.low &&
                          newCandle.high >= newCandle.open &&
                          newCandle.high >= newCandle.close &&
                          newCandle.low <= newCandle.open &&
                          newCandle.low <= newCandle.close;
      
      if (!isValidOHLC) {
        logger.error('websocket', 'Invalid OHLC data in new candle', {
          symbol: symbol,
          candle: newCandle
        });
        console.error('Invalid OHLC data:', newCandle);
        return;
      }
      
      const message = JSON.stringify({
        type: 'newCandle',
        symbol,
        data: newCandle
      });
      
      // Отправляем всем подписанным клиентам
      let sentCount = 0;
      clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
          sentCount++;
        }
      });
      
      logger.logCandle('New candle sent to clients', symbol, newCandle);
      logger.debug('websocket', 'New candle broadcast complete', {
        symbol: symbol,
        time: newCandle.time,
        clientCount: sentCount
      });
      console.log(`New candle created for ${symbol} at time ${newCandle.time}`);
    }
  });
  
  // РЕШЕНИЕ #4: Увеличиваем задержку с 200ms до 1000ms для стабильной обработки
  // Это гарантирует что клиенты получат и обработают новую свечу до следующих тиков
  setTimeout(() => {
    isCreatingNewCandle = false;
    logger.debug('websocket', 'Tick generation unlocked after new candles', {
      elapsedTime: Date.now() - startTime
    });
  }, 1000);
}, 5000); // каждые 5 секунд фиксируем свечу и создаем новую

// Очистка неактивных генераторов каждые 5 минут
const chartGeneratorModule = require('./chartGenerator');
setInterval(() => {
  const generators = chartGeneratorModule.generators;
  
  if (generators && generators.size > 0) {
    const inactiveSymbols = [];
    
    generators.forEach((generator, symbol) => {
      const hasSubscribers = subscriptions.has(symbol) && subscriptions.get(symbol).size > 0;
      
      if (!hasSubscribers) {
        inactiveSymbols.push(symbol);
      }
    });
    
    // Удаляем неактивные генераторы
    inactiveSymbols.forEach(symbol => {
      generators.delete(symbol);
      console.log(`Cleaned up inactive generator for ${symbol}`);
    });
    
    if (inactiveSymbols.length > 0) {
      logger.info('cleanup', 'Inactive generators cleaned', {
        cleaned: inactiveSymbols.length,
        remaining: generators.size,
        symbols: inactiveSymbols
      });
    }
  }
}, 5 * 60 * 1000); // каждые 5 минут

// КРИТИЧЕСКОЕ УЛУЧШЕНИЕ: Автоматическая очистка неактивных генераторов
// Предотвращает утечки памяти, удаляя генераторы без подписчиков каждые 5 минут
const chartGeneratorModule = require('./chartGenerator');
setInterval(() => {
  const generators = chartGeneratorModule.generators;
  
  if (generators && generators.size > 0) {
    const inactiveSymbols = [];
    
    generators.forEach((generator, symbol) => {
      const hasSubscribers = subscriptions.has(symbol) && subscriptions.get(symbol).size > 0;
      
      if (!hasSubscribers) {
        inactiveSymbols.push(symbol);
      }
    });
    
    // Удаляем неактивные генераторы
    inactiveSymbols.forEach(symbol => {
      generators.delete(symbol);
      console.log(`✓ Cleaned up inactive generator for ${symbol}`);
    });
    
    if (inactiveSymbols.length > 0) {
      console.log(`Inactive generators cleaned: ${inactiveSymbols.length}, remaining: ${generators.size}`);
    }
  }
}, 5 * 60 * 1000); // каждые 5 минут

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}/ws/chart`);
});
