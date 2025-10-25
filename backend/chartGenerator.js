// 🎯 TICK-BASED CHART GENERATOR (IQCent/Quotex Style)
// Генерирует ТИКИ (не свечи), агрегирует параллельно во ВСЕ таймфреймы

const fs = require('fs');
const path = require('path');
const logger = require('./errorLogger');

// ===== TIMEFRAME CONFIGURATION =====
const TIMEFRAMES = {
    'S5': { seconds: 5, name: '5 seconds' },
    'S10': { seconds: 10, name: '10 seconds' },
    'S15': { seconds: 15, name: '15 seconds' },
    'S30': { seconds: 30, name: '30 seconds' },
    'M1': { seconds: 60, name: '1 minute' },
    'M2': { seconds: 120, name: '2 minutes' },
    'M3': { seconds: 180, name: '3 minutes' },
    'M5': { seconds: 300, name: '5 minutes' },
    'M10': { seconds: 600, name: '10 minutes' },
    'M15': { seconds: 900, name: '15 minutes' },
    'M30': { seconds: 1800, name: '30 minutes' }
};

// ===== SYMBOL CONFIGURATION =====
// 🔥 УВЕЛИЧЕНА ВОЛАТИЛЬНОСТЬ: в 20 раз для красивых свечей с нормальным движением
const SYMBOL_CONFIG = {
    // Forex OTC - волатильность 0.010-0.020 (было 0.0005-0.001)
    'USD_MXN_OTC': { basePrice: 18.50, volatility: 0.015, type: 'FOREX' },
    'EUR_USD_OTC': { basePrice: 1.0850, volatility: 0.012, type: 'FOREX' },
    'GBP_USD_OTC': { basePrice: 1.2650, volatility: 0.014, type: 'FOREX' },
    'AUD_CAD_OTC': { basePrice: 0.9120, volatility: 0.012, type: 'FOREX' },
    'BHD_CNY_OTC': { basePrice: 18.75, volatility: 0.010, type: 'FOREX' },
    'EUR_CHF_OTC': { basePrice: 0.9420, volatility: 0.010, type: 'FOREX' },
    'KES_USD_OTC': { basePrice: 0.0077, volatility: 0.016, type: 'FOREX' },
    'TND_USD_OTC': { basePrice: 0.3180, volatility: 0.012, type: 'FOREX' },
    'UAH_USD_OTC': { basePrice: 0.0244, volatility: 0.018, type: 'FOREX' },
    'USD_BDT_OTC': { basePrice: 119.50, volatility: 0.008, type: 'FOREX' },
    'USD_CNH_OTC': { basePrice: 7.2450, volatility: 0.010, type: 'FOREX' },
    'USD_IDR_OTC': { basePrice: 15680, volatility: 0.012, type: 'FOREX' },
    'USD_MYR_OTC': { basePrice: 4.4850, volatility: 0.010, type: 'FOREX' },
    'AUD_NZD_OTC': { basePrice: 1.0920, volatility: 0.012, type: 'FOREX' },
    'USD_PHP_OTC': { basePrice: 56.25, volatility: 0.012, type: 'FOREX' },
    'ZAR_USD_OTC': { basePrice: 0.0548, volatility: 0.020, type: 'FOREX' },
    'YER_USD_OTC': { basePrice: 0.0040, volatility: 0.016, type: 'FOREX' },
    'USD_BRL_OTC': { basePrice: 5.6250, volatility: 0.018, type: 'FOREX' },
    'USD_EGP_OTC': { basePrice: 48.75, volatility: 0.014, type: 'FOREX' },
    'OMR_CNY_OTC': { basePrice: 18.95, volatility: 0.012, type: 'FOREX' },
    'AUD_JPY_OTC': { basePrice: 97.50, volatility: 0.016, type: 'FOREX' },
    'EUR_CHF_OTC2': { basePrice: 0.9420, volatility: 0.010, type: 'FOREX' },
    'EUR_GBP_OTC': { basePrice: 0.8580, volatility: 0.012, type: 'FOREX' },
    'EUR_HUF_OTC': { basePrice: 395.00, volatility: 0.016, type: 'FOREX' },
    'EUR_TRY_OTC': { basePrice: 36.25, volatility: 0.024, type: 'FOREX' },
    'USD_JPY_OTC': { basePrice: 149.50, volatility: 0.014, type: 'FOREX' },
    'USD_CHF_OTC': { basePrice: 0.8680, volatility: 0.010, type: 'FOREX' },
    
    // Forex Regular
    'USD_CAD': { basePrice: 1.3850, volatility: 0.012, type: 'FOREX' },
    'AUD_CHF': { basePrice: 0.5720, volatility: 0.014, type: 'FOREX' },
    'CHF_JPY': { basePrice: 172.25, volatility: 0.016, type: 'FOREX' },
    'EUR_AUD': { basePrice: 1.6450, volatility: 0.014, type: 'FOREX' },
    'EUR_CHF': { basePrice: 0.9420, volatility: 0.010, type: 'FOREX' },
    'EUR_GBP': { basePrice: 0.8580, volatility: 0.012, type: 'FOREX' },
    'EUR_JPY': { basePrice: 162.00, volatility: 0.016, type: 'FOREX' },
    'EUR_USD': { basePrice: 1.0850, volatility: 0.012, type: 'FOREX' },
    'GBP_CAD': { basePrice: 1.7520, volatility: 0.014, type: 'FOREX' },
    'GBP_CHF': { basePrice: 1.0980, volatility: 0.014, type: 'FOREX' },
    'GBP_USD': { basePrice: 1.2650, volatility: 0.014, type: 'FOREX' },
    
    // Crypto - волатильность 0.08-0.18 (было 0.005-0.009)
    'BTC_OTC': { basePrice: 67500, volatility: 0.10, type: 'CRYPTO' },
    'ETH_OTC': { basePrice: 3250, volatility: 0.12, type: 'CRYPTO' },
    'BNB_OTC': { basePrice: 585, volatility: 0.14, type: 'CRYPTO' },
    'SOL_OTC': { basePrice: 165, volatility: 0.16, type: 'CRYPTO' },
    'DOGE_OTC': { basePrice: 0.145, volatility: 0.18, type: 'CRYPTO' },
    'ADA_OTC': { basePrice: 0.58, volatility: 0.16, type: 'CRYPTO' },
    'DOT_OTC': { basePrice: 6.85, volatility: 0.16, type: 'CRYPTO' },
    'MATIC_OTC': { basePrice: 0.72, volatility: 0.18, type: 'CRYPTO' },
    'LTC_OTC': { basePrice: 85, volatility: 0.14, type: 'CRYPTO' },
    'LINK_OTC': { basePrice: 14.50, volatility: 0.16, type: 'CRYPTO' },
    'AVAX_OTC': { basePrice: 38, volatility: 0.18, type: 'CRYPTO' },
    'TRX_OTC': { basePrice: 0.165, volatility: 0.16, type: 'CRYPTO' },
    'TON_OTC': { basePrice: 5.25, volatility: 0.18, type: 'CRYPTO' },
    'BTC_ETF_OTC': { basePrice: 67500, volatility: 0.10, type: 'CRYPTO' },
    'TEST_TEST1': { basePrice: 1.0, volatility: 0.06, type: 'CRYPTO' },
    'BTC': { basePrice: 67500, volatility: 0.10, type: 'CRYPTO' },
    
    // Commodities - волатильность 0.06-0.16 (было 0.003-0.008)
    'GOLD_OTC': { basePrice: 2650, volatility: 0.06, type: 'COMMODITIES' },
    'SILVER_OTC': { basePrice: 31.50, volatility: 0.08, type: 'COMMODITIES' },
    'BRENT_OTC': { basePrice: 85.50, volatility: 0.10, type: 'COMMODITIES' },
    'WTI_OTC': { basePrice: 81.25, volatility: 0.10, type: 'COMMODITIES' },
    'NATGAS_OTC': { basePrice: 3.25, volatility: 0.16, type: 'COMMODITIES' },
    'PALLADIUM_OTC': { basePrice: 1050, volatility: 0.12, type: 'COMMODITIES' },
    'PLATINUM_OTC': { basePrice: 980, volatility: 0.10, type: 'COMMODITIES' }
};

// ===== CANDLE AGGREGATOR CLASS =====
class CandleAggregator {
    constructor(symbol, timeframe, timeframeSeconds) {
        this.symbol = symbol;
        this.timeframe = timeframe;
        this.timeframeSeconds = timeframeSeconds;
        this.candles = []; // История свечей
        this.currentCandle = null; // Текущая формирующаяся свеча
        this.maxCandles = 20000; // 🎯 УВЕЛИЧЕНО: Храним последние 20000 свечей (было 1000)
    }
    
    /**
     * Обновить агрегатор новым тиком
     */
    addTick(tick) {
        const candleStartTime = this.getCandleStartTime(tick.time);
        
        // Проверяем, нужно ли создать новую свечу
        if (!this.currentCandle || this.currentCandle.time !== candleStartTime) {
            // Закрываем предыдущую свечу
            if (this.currentCandle) {
                this.candles.push({ ...this.currentCandle });
                
                // 🎯 УВЕЛИЧЕНО: Ограничиваем размер массива до 20000 (было 1000)
                if (this.candles.length > this.maxCandles) {
                    this.candles.shift();
                }
            }
            
            // Создаем новую свечу
            this.currentCandle = {
                time: candleStartTime,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price
            };
            
            return { isNewCandle: true, completedCandle: this.candles[this.candles.length - 1] };
        } else {
            // Обновляем текущую свечу
            this.currentCandle.high = Math.max(this.currentCandle.high, tick.price);
            this.currentCandle.low = Math.min(this.currentCandle.low, tick.price);
            this.currentCandle.close = tick.price;
            
            return { isNewCandle: false, currentCandle: { ...this.currentCandle } };
        }
    }
    
    /**
     * Получить начало свечи для заданного timestamp
     */
    getCandleStartTime(timestamp) {
        return Math.floor(timestamp / this.timeframeSeconds) * this.timeframeSeconds;
    }
    
    /**
     * Получить все свечи
     */
    getCandles() {
        return this.candles;
    }
    
    /**
     * Получить текущую формирующуюся свечу
     */
    getCurrentCandle() {
        return this.currentCandle ? { ...this.currentCandle } : null;
    }
}

// ===== TICK GENERATOR CLASS =====
class TickGenerator {
    constructor(symbol) {
        const config = SYMBOL_CONFIG[symbol];
        if (!config) {
            throw new Error(`Unknown symbol: ${symbol}`);
        }
        
        this.symbol = symbol;
        this.basePrice = config.basePrice;
        this.currentPrice = config.basePrice;
        this.volatility = config.volatility;
        this.type = config.type;
        
        // Параметры Geometric Brownian Motion
        this.drift = 0.0;
        this.meanReversionSpeed = 0.05;
        
        // Агрегаторы для всех таймфреймов
        this.aggregators = {};
        Object.keys(TIMEFRAMES).forEach(tf => {
            this.aggregators[tf] = new CandleAggregator(
                symbol,
                tf,
                TIMEFRAMES[tf].seconds
            );
        });
        
        // Путь к данным
        this.dataDir = path.join(__dirname, '..', 'data', symbol);
        
        // Инициализация
        this.initialized = false;
    }
    
    /**
     * Инициализация: загрузка или генерация данных
     */
    async initialize() {
        if (this.initialized) return;
        
        console.log(`📊 Initializing ${this.symbol}...`);
        
        // Проверяем существование сохраненных данных
        const hasData = this.loadFromFiles();
        
        if (!hasData) {
            // Первый запуск - генерируем историю
            console.log(`   Generating 30 days history for all timeframes...`);
            await this.generateHistoricalData();
            this.saveToFiles();
        }
        
        this.initialized = true;
        
        // Логируем количество свечей для каждого таймфрейма
        const candleCounts = Object.keys(this.aggregators).map(tf => 
            `${tf}:${this.aggregators[tf].candles.length}`
        ).join(', ');
        console.log(`   ✅ ${this.symbol} ready (${candleCounts})`);
    }
    
    /**
     * Генерация исторических данных за 30 дней
     */
    async generateHistoricalData() {
        const now = Math.floor(Date.now() / 1000);
        const startTime = now - (30 * 24 * 60 * 60); // 30 дней назад
        
        // Генерируем тики каждые 50ms за 30 дней
        const tickInterval = 0.05; // 50ms в секундах
        const totalTicks = Math.floor((30 * 24 * 60 * 60) / tickInterval);
        
        let currentTime = startTime;
        let price = this.basePrice;
        
        for (let i = 0; i < totalTicks; i++) {
            // 🔥 УНИКАЛЬНЫЙ SEED для каждого тика: symbol + timestamp
            // Это гарантирует отсутствие повторяющихся паттернов!
            const tickSeed = this.symbol + '_' + Math.floor(currentTime * 1000);
            
            // Генерируем изменение цены с уникальным seed'ом для этого тика
            price = this.generateNextPrice(price, true, tickSeed);
            
            // Создаем тик
            const tick = {
                time: Math.floor(currentTime),
                price: price
            };
            
            // Добавляем во все агрегаторы
            Object.values(this.aggregators).forEach(agg => {
                agg.addTick(tick);
            });
            
            currentTime += tickInterval;
        }
        
        // Устанавливаем текущую цену
        this.currentPrice = price;
    }
    
    /**
     * Генерация следующего тика (в реальном времени)
     */
    generateTick() {
        const now = Math.floor(Date.now() / 1000);
        this.currentPrice = this.generateNextPrice(this.currentPrice);
        
        const tick = {
            time: now,
            price: this.currentPrice
        };
        
        // Обновляем все агрегаторы
        const results = {};
        Object.keys(this.aggregators).forEach(tf => {
            results[tf] = this.aggregators[tf].addTick(tick);
        });
        
        return { tick, aggregationResults: results };
    }
    
    /**
     * Генерация следующей цены (Geometric Brownian Motion)
     * 🔥 ИСПРАВЛЕНО: Увеличена волатильность для красивых свечей
     */
    generateNextPrice(currentPrice, isHistorical = false, seed = null) {
        // 🔥 РАЗНАЯ ВОЛАТИЛЬНОСТЬ для исторических данных и реал-тайма
        // Исторические: более плавные, красивые свечи с нормальным движением
        // Реал-тайм: быстрые тики с меньшей волатильностью за тик
        
        // Mean reversion к базовой цене (слабая сила)
        const deviation = (this.basePrice - currentPrice) / this.basePrice;
        const returnForce = deviation * this.meanReversionSpeed * 0.001; // очень слабый
        
        // Случайный компонент с разной силой для истории и реал-тайма
        let randomShock;
        if (isHistorical) {
            // 🔥 ИСТОРИЧЕСКИЕ ДАННЫЕ: Увеличенная волатильность для красивых свечей
            // Используем детерминированную генерацию с уникальным seed'ом для каждого тика
            randomShock = this.gaussianRandom(seed) * this.volatility * 0.08;
        } else {
            // 🔥 РЕАЛ-ТАЙМ: Меньшая волатильность для плавности
            randomShock = this.gaussianRandom() * this.volatility * 0.02;
        }
        
        // Новая цена
        let newPrice = currentPrice * (1 + returnForce + randomShock);
        
        // Ограничиваем максимальное изменение за тик
        const maxChange = currentPrice * (isHistorical ? 0.01 : 0.005); // для истории больше
        newPrice = Math.max(currentPrice - maxChange, Math.min(currentPrice + maxChange, newPrice));
        
        // Ограничиваем общий диапазон (±15% от базы для истории, ±10% для реал-тайма)
        const rangeMultiplier = isHistorical ? 0.15 : 0.10;
        newPrice = Math.max(newPrice, this.basePrice * (1 - rangeMultiplier));
        newPrice = Math.min(newPrice, this.basePrice * (1 + rangeMultiplier));
        
        // Округляем до разумного количества знаков
        const decimals = this.basePrice < 1 ? 6 : this.basePrice < 100 ? 4 : 2;
        return parseFloat(newPrice.toFixed(decimals));
    }
    
    /**
     * Нормальное распределение (Box-Muller)
     * @param {string|null} seed - Опциональный seed для детерминированной генерации
     */
    gaussianRandom(seed = null) {
        let u = 0, v = 0;
        
        if (seed !== null) {
            // Детерминированная генерация для исторических данных
            // Используем hash от seed для получения двух случайных чисел
            const hash1 = this.hashSeed(seed + '_u');
            const hash2 = this.hashSeed(seed + '_v');
            u = hash1;
            v = hash2;
        } else {
            // Обычная генерация для реал-тайма
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
        }
        
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    
    /**
     * Преобразование строки в число от 0 до 1 (детерминированно)
     */
    hashSeed(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        // Преобразуем в положительное число и нормализуем к (0, 1)
        // Используем большое простое число для лучшего распределения
        const normalized = Math.abs(hash % 2147483647) / 2147483647;
        // Гарантируем что не будет 0
        return normalized === 0 ? 0.0001 : normalized;
    }
    
    /**
     * Получить свечи для таймфрейма
     */
    getCandles(timeframe, from = null, to = null) {
        const aggregator = this.aggregators[timeframe];
        if (!aggregator) {
            throw new Error(`Unknown timeframe: ${timeframe}`);
        }
        
        let candles = aggregator.getCandles();
        
        // Фильтрация по времени
        if (from !== null) {
            candles = candles.filter(c => c.time >= from);
        }
        if (to !== null) {
            candles = candles.filter(c => c.time <= to);
        }
        
        return candles;
    }
    
    /**
     * Получить текущую формирующуюся свечу
     */
    getCurrentCandle(timeframe) {
        const aggregator = this.aggregators[timeframe];
        if (!aggregator) {
            throw new Error(`Unknown timeframe: ${timeframe}`);
        }
        
        return aggregator.getCurrentCandle();
    }
    
    /**
     * Получить текущую цену
     */
    getCurrentPrice() {
        return this.currentPrice;
    }
    
    /**
     * Сохранить данные в файлы
     */
    saveToFiles() {
        // Создаем директорию если нужно
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        
        // Сохраняем каждый таймфрейм в отдельный файл
        Object.keys(TIMEFRAMES).forEach(tf => {
            const filePath = path.join(this.dataDir, `${tf}.json`);
            const data = {
                symbol: this.symbol,
                timeframe: tf,
                currentPrice: this.currentPrice,
                candles: this.aggregators[tf].getCandles(),
                currentCandle: this.aggregators[tf].getCurrentCandle(),
                timestamp: Date.now()
            };
            
            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        });
    }
    
    /**
     * Загрузить данные из файлов
     */
    loadFromFiles() {
        if (!fs.existsSync(this.dataDir)) {
            return false;
        }
        
        let loaded = false;
        
        Object.keys(TIMEFRAMES).forEach(tf => {
            const filePath = path.join(this.dataDir, `${tf}.json`);
            
            if (fs.existsSync(filePath)) {
                try {
                    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                    
                    // Восстанавливаем свечи
                    this.aggregators[tf].candles = data.candles || [];
                    if (data.currentCandle) {
                        this.aggregators[tf].currentCandle = data.currentCandle;
                    }
                    
                    // Восстанавливаем текущую цену
                    if (data.currentPrice) {
                        this.currentPrice = data.currentPrice;
                    }
                    
                    loaded = true;
                } catch (error) {
                    console.error(`Error loading ${filePath}:`, error.message);
                }
            }
        });
        
        return loaded;
    }
}

// ===== GLOBAL GENERATOR REGISTRY =====
const generators = new Map();

/**
 * Получить генератор для символа
 */
function getGenerator(symbol) {
    if (!generators.has(symbol)) {
        const generator = new TickGenerator(symbol);
        generators.set(symbol, generator);
    }
    return generators.get(symbol);
}

/**
 * Инициализировать все генераторы
 */
async function initializeAllGenerators() {
    const symbols = Object.keys(SYMBOL_CONFIG);
    const startTime = Date.now();
    
    console.log(`🚀 Initializing ${symbols.length} tick generators...`);
    
    // Инициализируем параллельно (группами по 10 для избежания перегрузки)
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
        const batch = symbols.slice(i, i + batchSize);
        await Promise.all(batch.map(async symbol => {
            const generator = getGenerator(symbol);
            await generator.initialize();
        }));
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ All generators initialized in ${elapsed}s`);
}

/**
 * Сохранить все генераторы
 */
function saveAllGenerators() {
    let saved = 0;
    let failed = 0;
    
    generators.forEach((generator, symbol) => {
        try {
            generator.saveToFiles();
            saved++;
        } catch (error) {
            console.error(`Failed to save ${symbol}:`, error.message);
            failed++;
        }
    });
    
    return { saved, failed };
}

// ===== EXPORTS =====
module.exports = {
    TickGenerator,
    getGenerator,
    initializeAllGenerators,
    saveAllGenerators,
    TIMEFRAMES,
    SYMBOL_CONFIG
};
