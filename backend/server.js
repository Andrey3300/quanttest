const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const http = require('http');
const { getGenerator, saveAllGenerators, initializeAllGenerators, SYMBOL_CONFIG } = require('./chartGenerator');
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
// 🎯 MULTI-TIMEFRAME: Поддержка timeframe параметра
app.get('/api/chart/history', (req, res) => {
  try {
    const symbol = req.query.symbol || 'USD_MXN';
    const timeframe = req.query.timeframe || 'S5'; // 🎯 НОВОЕ
    const from = req.query.from ? parseInt(req.query.from) : null;
    const to = req.query.to ? parseInt(req.query.to) : null;
    
    const generator = getGenerator(symbol, timeframe); // 🎯 НОВОЕ
    const data = generator.getHistoricalData(from, to);
    
    res.json({
      symbol,
      timeframe, // 🎯 НОВОЕ
      data
    });
  } catch (error) {
    console.error('Chart history error:', error);
    res.status(500).json({ error: 'Failed to fetch chart data' });
  }
});

// 🎯 ENDPOINT: Получение текущего состояния свечи (для синхронизации при смене актива)
// 🎯 MULTI-TIMEFRAME: Поддержка timeframe
app.get('/api/chart/current-state/:symbol', (req, res) => {
  try {
    const symbol = req.params.symbol;
    const timeframe = req.query.timeframe || 'S5'; // 🎯 НОВОЕ
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    
    const generator = getGenerator(symbol, timeframe); // 🎯 НОВОЕ
    
    // Проверяем что генератор инициализирован
    if (!generator.candles || generator.candles.length === 0) {
      logger.warn('api', 'Generator not initialized for current-state request', { symbol, timeframe });
      return res.status(503).json({ error: 'Generator not ready yet' });
    }
    
    // Получаем последнюю свечу и текущее состояние
    const lastCandle = generator.candles[generator.candles.length - 1];
    const currentState = generator.currentCandleState || lastCandle;
    
    logger.debug('api', 'Current state requested', {
      symbol,
      timeframe, // 🎯 НОВОЕ
      lastCandleTime: lastCandle.time,
      currentStateTime: currentState.time,
      currentPrice: generator.currentPrice
    });
    
    res.json({
      symbol,
      timeframe, // 🎯 НОВОЕ
      lastCandle,
      currentState,
      currentPrice: generator.currentPrice,
      candleCount: generator.candles.length,
      timestamp: Date.now()
    });
  } catch (error) {
    console.error('Current state error:', error);
    logger.error('api', 'Failed to get current state', {
      symbol: req.params.symbol,
      timeframe: req.query.timeframe,
      error: error.message
    });
    res.status(500).json({ error: 'Failed to fetch current state' });
  }
});

// ===== ИНИЦИАЛИЗАЦИЯ ГЕНЕРАТОРОВ 24/7 =====

// 🧹 ОЧИСТКА: Удаляем старые логи перед стартом
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
console.log('🚀 Initializing chart generators for 24/7 operation...');
console.log('   (optimized: 1 day history with smart validation & silent mode)');

// 🛡️ ЗАЩИТА: Timeout для инициализации (максимум 2 минуты)
const initTimeout = setTimeout(() => {
    console.error('❌ CRITICAL: Generator initialization timeout (>2min)');
    console.error('   This should never happen. Check logs/chart-debug.log for details.');
    console.error('   Terminating process...');
    process.exit(1);
}, 120000); // 2 минуты

try {
    initializeAllGenerators();
    clearTimeout(initTimeout); // Успешно завершили - отменяем timeout
    console.log('✅ All chart generators are running!');
} catch (error) {
    clearTimeout(initTimeout);
    console.error('❌ CRITICAL: Generator initialization failed:', error);
    logger.error('initialization', 'Fatal initialization error', {
        error: error.message,
        stack: error.stack
    });
    console.error('   Terminating process...');
    process.exit(1);
}

// ===== WEBSOCKET SERVER =====

// Создание WebSocket сервера
const wss = new WebSocket.Server({ server, path: '/ws/chart' });

// 🎯 MULTI-TIMEFRAME: Хранение активных подписок по "symbol:timeframe"
const subscriptions = new Map(); // "symbol:timeframe" -> Set of WebSocket connections

wss.on('connection', (ws, req) => {
  logger.debug('websocket', 'New WebSocket connection');
  
  let currentSubscription = null; // "symbol:timeframe"
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'subscribe') {
        const symbol = data.symbol || 'USD_MXN';
        const timeframe = data.timeframe || 'S5'; // 🎯 НОВОЕ
        const subscriptionKey = `${symbol}:${timeframe}`;
        
        // Отписываемся от предыдущей подписки
        if (currentSubscription && subscriptions.has(currentSubscription)) {
          subscriptions.get(currentSubscription).delete(ws);
          logger.debug('websocket', `Client unsubscribed from ${currentSubscription} (auto)`);
        }
        
        // Подписываемся на новый symbol:timeframe
        currentSubscription = subscriptionKey;
        if (!subscriptions.has(subscriptionKey)) {
          subscriptions.set(subscriptionKey, new Set());
        }
        subscriptions.get(subscriptionKey).add(ws);
        
        logger.debug('websocket', `Client subscribed to ${subscriptionKey}`);
        
        // 🎯 КРИТИЧНО: Получаем генератор и отправляем текущее состояние
        const generator = getGenerator(symbol, timeframe);
        
        if (generator && generator.candles && generator.candles.length > 0) {
          // Получаем текущую свечу таймфрейма
          let currentCandle = null;
          
          // Для S5 - последняя завершенная свеча
          if (timeframe === 'S5') {
            currentCandle = generator.candles[generator.candles.length - 1];
          } else {
            // Для остальных таймфреймов - текущая агрегированная свеча
            if (generator.aggregator && generator.aggregator.currentAggregatedCandle) {
              currentCandle = generator.aggregator.currentAggregatedCandle;
            } else if (generator.candles.length > 0) {
              // Fallback к последней завершенной
              currentCandle = generator.candles[generator.candles.length - 1];
            }
          }
          
          if (currentCandle) {
            // Получаем длительность таймфрейма
            const { TIMEFRAMES } = require('./chartGenerator');
            const timeframeSeconds = TIMEFRAMES[timeframe]?.seconds || 5;
            
            // Отправляем текущее состояние клиенту
            ws.send(JSON.stringify({
              type: 'currentState',
              symbol,
              timeframe,
              candle: currentCandle,
              candleStartTime: currentCandle.time,
              timeframeSeconds: timeframeSeconds,
              serverTime: Math.floor(Date.now() / 1000)
            }));
            
            logger.info('websocket', `✅ Sent current state for ${subscriptionKey}`, {
              candleTime: currentCandle.time,
              candleStartTime: currentCandle.time,
              timeframeSeconds: timeframeSeconds,
              price: currentCandle.close
            });
          } else {
            logger.warn('websocket', `⚠️ No current candle available for ${subscriptionKey}`);
          }
        } else {
          logger.warn('websocket', `⚠️ Generator not ready for ${subscriptionKey}`);
        }
        
        // Отправляем подтверждение подписки
        ws.send(JSON.stringify({
          type: 'subscribed',
          symbol,
          timeframe // 🎯 НОВОЕ
        }));
      } else if (data.type === 'unsubscribe') {
        const symbol = data.symbol;
        const timeframe = data.timeframe || 'S5'; // 🎯 НОВОЕ
        const subscriptionKey = `${symbol}:${timeframe}`;
        
        if (subscriptionKey && subscriptions.has(subscriptionKey)) {
          subscriptions.get(subscriptionKey).delete(ws);
          logger.debug('websocket', `Client explicitly unsubscribed from ${subscriptionKey}`);
          
          // Отправляем подтверждение
          ws.send(JSON.stringify({
            type: 'unsubscribed',
            symbol,
            timeframe // 🎯 НОВОЕ
          }));
        }
        
        if (currentSubscription === subscriptionKey) {
          currentSubscription = null;
        }
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
    }
  });
  
  ws.on('close', () => {
    // Удаляем подписку при отключении
    if (currentSubscription && subscriptions.has(currentSubscription)) {
      subscriptions.get(currentSubscription).delete(ws);
    }
    logger.debug('websocket', 'WebSocket connection closed');
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
  });
});

// Флаг для блокировки тиков во время создания новой свечи
let isCreatingNewCandle = false;

// 🔥 УЛУЧШЕНИЕ: Плавные обновления текущей свечи (тики) для ВСЕХ таймфреймов
// Каждые 250ms отправляем текущее состояние свечи (4 обновления в секунду)
// 🎯 S5: используем generateCandleTick() для микро-колебаний
// 🎯 M3/M5/M10+: используем currentCandleState из агрегатора (реальное состояние)
setInterval(() => {
  // Не отправляем тики, если создается новая свеча
  if (isCreatingNewCandle) {
    return;
  }
  
  subscriptions.forEach((clients, subscriptionKey) => {
    if (clients.size === 0) return;
    
    // Парсим "symbol:timeframe"
    const [symbol, timeframe] = subscriptionKey.split(':');
    const generator = getGenerator(symbol, timeframe);
    
    // ЗАЩИТА: Проверяем что генератор инициализирован с данными
    if (!generator || !generator.candles || generator.candles.length === 0) {
      logger.warn('websocket', 'Generator not initialized, skipping tick', { symbol, timeframe });
      return;
    }
    
    let updatedCandle;
    
    // 🎯 Для S5: генерируем микро-тики для плавности
    if (timeframe === 'S5') {
      updatedCandle = generator.generateCandleTick();
    } 
    // 🎯 Для M3, M5, M10+: берем текущее состояние агрегированной свечи
    else {
      // Берем текущее состояние из агрегатора
      if (generator.currentCandleState) {
        updatedCandle = { ...generator.currentCandleState };
      } else if (generator.aggregator && generator.aggregator.currentAggregatedCandle) {
        updatedCandle = { ...generator.aggregator.currentAggregatedCandle };
      } else {
        // Fallback: последняя свеча если нет текущего состояния
        const lastCandle = generator.candles[generator.candles.length - 1];
        if (!lastCandle) return;
        updatedCandle = { ...lastCandle };
      }
    }
    
    // 🛡️ ВАЛИДАЦИЯ: Проверяем свечу на аномалии перед отправкой
    const validation = generator.validateCandleAnomaly(updatedCandle, 'websocket-tick');
    if (!validation.valid) {
      logger.error('websocket', '🚨 TICK VALIDATION FAILED - skipping send', {
        symbol,
        timeframe,
        reason: validation.reason,
        candle: updatedCandle
      });
      return; // НЕ ОТПРАВЛЯЕМ аномальный тик
    }
    
    // Дополнительная проверка: убедимся что время - это число
    if (typeof updatedCandle.time !== 'number' || isNaN(updatedCandle.time)) {
      logger.error('websocket', 'Invalid tick time format', { 
        symbol,
        timeframe,
        candle: updatedCandle
      });
      return;
    }
    
    const message = JSON.stringify({
      type: 'tick',
      symbol,
      timeframe,
      data: updatedCandle
    });
    
    // Отправляем всем подписанным клиентам
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });
}, 250); // каждые 250ms (4 обновления в секунду) + интерполяция на клиенте = плавная визуализация

// ИСПРАВЛЕНИЕ: Точная синхронизация создания свечей с системным временем
// Вместо простого setInterval используем выравнивание по сетке времени
function scheduleNextCandleCreation() {
  const CANDLE_INTERVAL = 5000; // 5 секунд
  const now = Date.now();
  
  // Вычисляем следующий момент создания свечи (выравнивание по сетке)
  const nextCandleTime = Math.ceil(now / CANDLE_INTERVAL) * CANDLE_INTERVAL;
  const delayUntilNextCandle = nextCandleTime - now;
  
  logger.debug('candle-schedule', 'Next candle scheduled', {
    now: now,
    nextCandleTime: nextCandleTime,
    delayMs: delayUntilNextCandle,
    nextCandleDate: new Date(nextCandleTime).toISOString()
  });
  
  setTimeout(() => {
    createNewCandlesForAllSymbols();
    // Планируем следующую свечу
    scheduleNextCandleCreation();
  }, delayUntilNextCandle);
}

// 🎯 MULTI-TIMEFRAME: Функция создания свечей для всех таймфреймов (IQCent style)
function createNewCandlesForAllSymbols() {
  // Блокируем отправку тиков
  isCreatingNewCandle = true;
  
  const startTime = Date.now();
  const totalSymbols = Object.keys(SYMBOL_CONFIG).length;
  
  logger.debug('websocket', '🎯 Creating new S5 candles and aggregating to all timeframes', {
    totalSymbols: totalSymbols,
    subscriptions: subscriptions.size,
    timestamp: startTime
  });
  
  const { TIMEFRAMES } = require('./chartGenerator');
  const timeframeKeys = Object.keys(TIMEFRAMES);
  
  // Генерируем новую S5 свечу для каждого символа + агрегируем в другие таймфреймы
  Object.keys(SYMBOL_CONFIG).forEach(symbol => {
    // 1️⃣ Генерируем базовую S5 свечу
    const s5Generator = getGenerator(symbol, 'S5');
    
    // ЗАЩИТА: Проверяем что S5 генератор инициализирован
    if (!s5Generator || !s5Generator.candles || s5Generator.candles.length === 0) {
      logger.warn('websocket', 'S5 Generator not initialized, skipping', { symbol });
      return;
    }
    
    // Генерируем новую S5 свечу
    const s5Candle = s5Generator.generateNextCandle();
    
    // 🛡️ ВАЛИДАЦИЯ S5 свечи
    const s5Validation = s5Generator.validateCandleAnomaly(s5Candle, 'websocket-newCandle');
    if (!s5Validation.valid) {
      logger.error('websocket', '🚨 S5 CANDLE VALIDATION FAILED', {
        symbol,
        reason: s5Validation.reason
      });
      return; // Пропускаем весь символ если S5 невалидна
    }
    
    // 2️⃣ Отправляем S5 свечу подписчикам S5
    const s5SubscriptionKey = `${symbol}:S5`;
    const s5Clients = subscriptions.get(s5SubscriptionKey);
    if (s5Clients && s5Clients.size > 0) {
      const s5Message = JSON.stringify({
        type: 'newCandle',
        symbol,
        timeframe: 'S5',
        data: s5Candle
      });
      
      s5Clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(s5Message);
        }
      });
      
      logger.debug('websocket', 'S5 candle sent', {
        symbol,
        time: s5Candle.time,
        clientCount: s5Clients.size
      });
    }
    
    // 3️⃣ Агрегируем S5 свечу во все другие таймфреймы
    timeframeKeys.forEach(timeframe => {
      if (timeframe === 'S5') return; // S5 уже обработан
      
      const tfGenerator = getGenerator(symbol, timeframe);
      if (!tfGenerator || !tfGenerator.aggregator) {
        logger.warn('websocket', 'Aggregated generator not initialized', { symbol, timeframe });
        return;
      }
      
      // Агрегируем S5 свечу
      const aggregationResult = tfGenerator.aggregateS5Candle(s5Candle);
      if (!aggregationResult) return;
      
      // Если свеча завершилась - отправляем подписчикам
      if (aggregationResult.isNewCandle && aggregationResult.completed) {
        const tfSubscriptionKey = `${symbol}:${timeframe}`;
        const tfClients = subscriptions.get(tfSubscriptionKey);
        
        if (tfClients && tfClients.size > 0) {
          const completedCandle = aggregationResult.completed;
          
          // Валидация агрегированной свечи
          const tfValidation = tfGenerator.validateCandleAnomaly(completedCandle, 'aggregated-candle');
          if (!tfValidation.valid) {
            logger.error('websocket', '🚨 AGGREGATED CANDLE VALIDATION FAILED', {
              symbol,
              timeframe,
              reason: tfValidation.reason
            });
            return;
          }
          
          const tfMessage = JSON.stringify({
            type: 'newCandle',
            symbol,
            timeframe,
            data: completedCandle
          });
          
          tfClients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(tfMessage);
            }
          });
          
          logger.debug('websocket', `${timeframe} candle completed and sent`, {
            symbol,
            timeframe,
            time: completedCandle.time,
            clientCount: tfClients.size
          });
        }
      }
    });
  });
  
  // ИСПРАВЛЕНИЕ: Уменьшаем задержку до 200ms для более точного тайминга
  // Клиенты справляются с обработкой быстрее
  setTimeout(() => {
    isCreatingNewCandle = false;
    logger.debug('websocket', 'Tick generation unlocked after new candles', {
      elapsedTime: Date.now() - startTime
    });
  }, 200);
}

// ИСПРАВЛЕНИЕ: Запускаем точную синхронизацию вместо простого setInterval
scheduleNextCandleCreation();

// ===== ПЕРСИСТЕНТНОСТЬ =====

// Периодическое сохранение всех генераторов каждые 5 минут
setInterval(() => {
  logger.info('persistence', 'Auto-saving all generators...');
  const result = saveAllGenerators();
  console.log(`💾 Auto-save complete: ${result.saved} generators saved, ${result.failed} failed`);
}, 5 * 60 * 1000); // каждые 5 минут

// Graceful shutdown - сохраняем все данные при остановке сервера
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  logger.info('shutdown', 'Graceful shutdown initiated');
  
  // Сохраняем все генераторы
  console.log('💾 Saving all generators...');
  const result = saveAllGenerators();
  console.log(`✅ Saved ${result.saved} generators`);
  
  // Закрываем WebSocket соединения
  wss.clients.forEach(client => {
    client.close(1000, 'Server shutting down');
  });
  
  // Закрываем HTTP сервер
  server.close(() => {
    console.log('✅ Server closed');
    logger.info('shutdown', 'Server shutdown complete');
    process.exit(0);
  });
  
  // Принудительное завершение через 10 секунд
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Обработчики сигналов
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  logger.error('process', 'Uncaught exception', { 
    error: error.message, 
    stack: error.stack 
  });
  gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('process', 'Unhandled rejection', { 
    reason: String(reason) 
  });
});

server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`WebSocket server is running on ws://localhost:${PORT}/ws/chart`);
});
