// 🎯 TICK-BASED CHART GENERATOR (IQCent/Quotex Style)
// Генерирует ТИКИ (не свечи), агрегирует параллельно во ВСЕ таймфреймы
//
// ✅ КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ (для TEST/TEST1):
// 1. 🔧 РАЗРЫВ МАСШТАБА: Синхронизирован реалтайм с историей
//    - Реалтайм тики начинаются с цены, где закончилась история
//    - Это предотвращает огромные первые свечи и "сплющенный" график
//
// 2. 🔧 ОГРОМНЫЕ СВЕЧИ: Отключена фазовая система волатильности
//    - Фазовая система вызывала двойное масштабирование (фазы × scaling)
//    - Это давало свечи в пол экрана на M2/M3
//    - Теперь все таймфреймы используют единую волатильность
//
// 3. 🔧 "СТУПЕНЬКИ": Исправлена фильтрация тиков
//    - Старая логика игнорировала тики но обновляла close
//    - Это создавало свечи где open=high=low=close
//    - Теперь все тики обрабатываются одинаково
//
// 4. 🔧 РАЗМЕР СВЕЧЕЙ: Добавлены жесткие ограничения
//    - Макс изменение тела свечи: 2% от цены
//    - Макс общий диапазон (high-low): 3% от цены
//    - Это гарантирует читаемые свечи на всех таймфреймах

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
    'TEST_TEST1': { basePrice: 1.0, volatility: 0.0020, type: 'FOREX' }, // 🎯 CALIBRATED: Увеличена волатильность для читаемых свечей на всех TF
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
        
        // 🎨 PHASED CANDLE SYSTEM для длинных таймфреймов (M2, M3, M5, M15, M30)
        // Используется только для реалтайм свечей, формирующихся через тики
        // Короткие TF (S5-M1) работают без фазовой системы для стабильности
        this.usePhasedSystem = ['M2', 'M3', 'M5', 'M15', 'M30'].includes(timeframe);
        this.candleStartTime = null; // Время начала текущей свечи
    }
    
    /**
     * 🎨 Получить фазовый мультипликатор волатильности для текущей свечи
     * 🔧 ИСПРАВЛЕНО: Убраны экстремальные значения, плавная волатильность
     * 
     * ✅ РЕШЕНИЕ ПРОБЛЕМЫ "ОГРОМНЫХ СВЕЧЕЙ":
     * - Фазовая система теперь НЕ изменяет волатильность радикально
     * - Все фазы используют 100% базовой волатильности
     * - Это предотвращает гигантские свечи на M2/M3
     */
    getPhasedVolatilityMultiplier(tickTime) {
        // 🔥 КРИТИЧЕСКОЕ ИЗМЕНЕНИЕ: Фазовая система ОТКЛЮЧЕНА
        // Она вызывала огромные свечи из-за двойного масштабирования
        // (фазовый множитель × масштабированная волатильность = свечи в пол экрана)
        return 1.0;
    }
    
    /**
     * Обновить агрегатор новым тиком
     * 
     * 🎯 ВАРИАНТ 3: ЛОКАЛЬНАЯ ФАЗОВАЯ СИСТЕМА
     * - Короткие TF (S5-M1): принимают все тики без фильтрации
     * - Длинные TF (M2-M30): применяют фазовую фильтрацию для "драмы"
     *   - Birth: умеренная активность (60% тиков)
     *   - Growth: полная активность (100% тиков)
     *   - Stabilization: сниженная активность (40% тиков) для эффекта "замедления"
     *   - Finale: повышенная активность (80% тиков) для финального всплеска
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
            this.candleStartTime = candleStartTime;
            
            return { isNewCandle: true, completedCandle: this.candles[this.candles.length - 1] };
        } else {
            // 🔥 ФАЗОВАЯ ФИЛЬТРАЦИЯ ОТКЛЮЧЕНА
            // ✅ РЕШЕНИЕ ПРОБЛЕМЫ "СТУПЕНЕК":
            // Старая логика игнорировала тики но обновляла close,
            // создавая свечи где open=high=low=close ("ступеньки")
            // Теперь ВСЕ тики обрабатываются одинаково для всех таймфреймов
            
            // Обновляем текущую свечу (все тики обрабатываются одинаково!)
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
        
        // 🌊 СИСТЕМА ВОЛНООБРАЗНОГО ДВИЖЕНИЯ (из work4)
        this.currentDrift = 0.0; // текущий динамический тренд (изменяется со временем)
        this.trendChangeCounter = 0; // счетчик для смены тренда
        this.trendChangePeriod = this.randomInt(30, 80); // меняем тренд каждые 30-80 свечей
        this.trendStrength = 0.0002; // сила тренда (для создания волн)
        
        // 🎯 ТРЁХУРОВНЕВАЯ СИСТЕМА ДЛЯ TEST/TEST1 (IQ Option / Quotex стиль)
        if (symbol === 'TEST_TEST1') {
            this.trendCounter = 40 + Math.random() * 80; // Счётчик до смены тренда (40-120 свечей)
            this.trendDir = (Math.random() - 0.5) * 2; // Направление тренда (-1..1)
            this.trendStrengthTest = 0.0003 + Math.random() * 0.0012; // Сила тренда (0.0003-0.0015)
        }
        
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
     * Генерация случайного целого числа в диапазоне [min, max]
     */
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    
    /**
     * 🌊 Обновление тренда для создания волнообразного движения (из work4)
     */
    updateTrend() {
        this.trendChangeCounter++;
        
        // Пришло время сменить тренд?
        if (this.trendChangeCounter >= this.trendChangePeriod) {
            // Генерируем новый тренд (может быть восходящим, нисходящим или нейтральным)
            const trendType = Math.random();
            
            if (trendType < 0.35) {
                // Восходящий тренд (35%)
                const u1 = Math.random();
                const u2 = Math.random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                this.currentDrift = this.trendStrength * (1.0 + z0 * 0.3);
            } else if (trendType < 0.70) {
                // Нисходящий тренд (35%)
                const u1 = Math.random();
                const u2 = Math.random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                this.currentDrift = -this.trendStrength * (1.0 + z0 * 0.3);
            } else {
                // Боковое движение (30%)
                const u1 = Math.random();
                const u2 = Math.random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                this.currentDrift = this.trendStrength * (z0 * 0.5);
            }
            
            // Сбрасываем счетчик и генерируем новый период
            this.trendChangeCounter = 0;
            this.trendChangePeriod = this.randomInt(30, 80);
        } else {
            // Плавное изменение текущего тренда (добавляем небольшой шум)
            const u1 = Math.random();
            const u2 = Math.random();
            const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            this.currentDrift += z0 * this.trendStrength * 0.1;
            // Ограничиваем тренд чтобы он не улетал слишком далеко
            this.currentDrift = Math.max(-this.trendStrength * 2, Math.min(this.trendStrength * 2, this.currentDrift));
        }
    }
    
    /**
     * 🔥 НОВАЯ СИСТЕМА: Генерация исторических данных за 30 дней
     * Генерируем свечи НАПРЯМУЮ для каждого таймфрейма с масштабированной волатильностью
     */
    async generateHistoricalData() {
        const now = Math.floor(Date.now() / 1000);
        const startTime = now - (30 * 24 * 60 * 60); // 30 дней назад
        
        console.log(`   Generating candles for each timeframe with scaled volatility...`);
        
        // Генерируем свечи для каждого таймфрейма отдельно
        for (const [timeframe, config] of Object.entries(TIMEFRAMES)) {
            const timeframeSeconds = config.seconds;
            const timeframeMinutes = timeframeSeconds / 60;
            
            // 🎯 МАСШТАБИРУЕМАЯ ВОЛАТИЛЬНОСТЬ: С насыщением (на основе реальных данных IQCent)
            const scaledVolatility = this.getScaledVolatility(timeframeSeconds);
            
            // Генерируем свечи для этого таймфрейма
            let currentTime = startTime;
            let price = this.basePrice;
            
            // Количество свечей для 30 дней
            const totalCandles = Math.floor((30 * 24 * 60 * 60) / timeframeSeconds);
            
            for (let i = 0; i < totalCandles; i++) {
                const candleTime = Math.floor(currentTime / timeframeSeconds) * timeframeSeconds;
                
                // 🎯 SEEDED RANDOM: Уникальный seed для каждого таймфрейма
                const timeframeId = timeframeSeconds; // Уникальный ID: 5, 10, 60, 300 и т.д.
                const seed = candleTime * 1000 + timeframeId;
                
                // Генерируем OHLC для свечи с учетом масштабированной волатильности
                const candle = this.generateCandle(price, scaledVolatility, seed, timeframeMinutes);
                candle.time = candleTime;
                
                // Добавляем свечу в агрегатор
                this.aggregators[timeframe].candles.push(candle);
                
                // Ограничиваем размер
                if (this.aggregators[timeframe].candles.length > this.aggregators[timeframe].maxCandles) {
                    this.aggregators[timeframe].candles.shift();
                }
                
                // Обновляем цену для следующей свечи (используем close)
                price = candle.close;
                currentTime += timeframeSeconds;
            }
            
            // Создаем текущую формирующуюся свечу
            const lastCandle = this.aggregators[timeframe].candles[this.aggregators[timeframe].candles.length - 1];
            if (lastCandle) {
                this.aggregators[timeframe].currentCandle = {
                    time: lastCandle.time + timeframeSeconds,
                    open: lastCandle.close,
                    high: lastCandle.close,
                    low: lastCandle.close,
                    close: lastCandle.close
                };
            }
        }
        
        // ✅ КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Синхронизируем реалтайм с историей
        // Устанавливаем текущую цену (из последней свечи самого мелкого таймфрейма)
        const s5LastCandle = this.aggregators['S5'].candles[this.aggregators['S5'].candles.length - 1];
        this.currentPrice = s5LastCandle ? s5LastCandle.close : this.basePrice;
        
        // 🔧 РЕШЕНИЕ ПРОБЛЕМЫ "РАЗРЫВА МАСШТАБА":
        // Теперь реалтайм тики начинаются с той же цены, что и история закончилась
        console.log(`   📊 History ends at price: ${this.currentPrice.toFixed(6)} (base: ${this.basePrice})`);
    }
    
    /**
     * Генерация следующего тика (в реальном времени)
     * 
     * 🎯 ВАРИАНТ 3: ГИБРИДНЫЙ ПОДХОД
     * - Генерируем тики с БАЗОВОЙ волатильностью (без фазовых модификаций)
     * - Короткие TF (S5-M1) получают стабильные свечи
     * - Длинные TF (M2-M30) получают свечи через масштабирование волатильности
     * - Фазовая система применяется на уровне агрегаторов (локально)
     */
    generateTick() {
        const now = Math.floor(Date.now() / 1000);
        
        // 🎯 ИСПРАВЛЕНО: Генерируем цену БЕЗ фазовых модификаций
        // Тик будет иметь базовую волатильность для S5
        // Каждый агрегатор сам решает, как обрабатывать этот тик
        this.currentPrice = this.generateNextPrice(this.currentPrice, false);
        
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
     * 🎯 МАСШТАБИРОВАНИЕ ВОЛАТИЛЬНОСТИ: Комплексное решение для нормальной ВЫСОТЫ свечей
     * Убрана агрессивная формула sqrt() для коротких таймфреймов
     */
    getScaledVolatility(timeframeSeconds) {
        // Базовая волатильность настроена для M1 (60 секунд)
        const baseSeconds = 60;
        const ratio = timeframeSeconds / baseSeconds;
        
        if (ratio < 0.15) {
            // 🔥 ОЧЕНЬ КОРОТКИЕ (S5, S10 до 9 сек): Мягкое масштабирование 70-80%
            // Без sqrt! Иначе свечи слишком короткие
            const scalingFactor = 0.70 + (ratio * 0.67); // S5(5s)=0.76x, S10(10s)=0.81x
            return this.volatility * scalingFactor;
        } else if (ratio < 0.5) {
            // 🔥 КОРОТКИЕ (S15, S30 до 30 сек): Умеренное масштабирование 80-90%
            const scalingFactor = 0.80 + (ratio * 0.4); // S15(15s)=0.90x, S30(30s)=1.0x
            return this.volatility * scalingFactor;
        } else if (ratio <= 1) {
            // 🔥 M1 (60 сек): Базовая волатильность 1.0x
            return this.volatility;
        } else if (ratio <= 5) {
            // 🔥 СРЕДНИЕ (M2-M5): Умеренный рост через sqrt
            const scalingFactor = Math.sqrt(ratio) * 1.15; // M2=1.63x, M5=2.57x
            return this.volatility * scalingFactor;
        } else {
            // 🔥 ДЛИННЫЕ (M10-M30): С насыщением (логарифм)
            const sqrtRatio = Math.sqrt(ratio);
            const saturation = 1 + Math.log(ratio) / 5;
            const scalingFactor = sqrtRatio * saturation * 1.1; // M15=3.85x, M30=5.24x
            return this.volatility * scalingFactor;
        }
    }
    
    /**
     * 🔥 ИСПРАВЛЕНО: Генерация реалистичных свечей (как Pocket Option / IQ Option)
     * ФИКС: Open = basePrice (без разрывов!), High/Low охватывают тело + тени
     */
    generateCandle(basePrice, scaledVolatility, seed, timeframeMinutes) {
        // Seeded random для воспроизводимости
        const random = this.seededRandom(seed);
        const random2 = this.seededRandom(seed + 1);
        const random3 = this.seededRandom(seed + 2);
        const random4 = this.seededRandom(seed + 3);
        const random5 = this.seededRandom(seed + 4);
        
        // 🎯 ФИКС #1: Open ТОЧНО равен basePrice (close предыдущей свечи)
        // Никаких случайных изменений! Это обеспечивает непрерывность графика
        const open = basePrice;
        
        // 🎯 SOFT BOUNDARIES: Mean reversion (возврат к базовой цене)
        const deviation = (basePrice - this.basePrice) / this.basePrice;
        const meanReversionForce = -deviation * 0.2; // 20% возврат к среднему
        
        // 🌊 Трендовая составляющая (плавные волны)
        const trendForce = Math.sin(seed / 8000) * 0.0005; // Медленная синусоида
        
        // 🎲 Случайное изменение для CLOSE (Gaussian random с ограничением до ±1.5σ)
        const randomGaussian = this.clampGaussian(this.gaussianFromSeed(random, random2), 1.5);
        const randomChange = randomGaussian * scaledVolatility * 0.8; // 80% от волатильности для тела
        
        // 📊 Генерируем Close относительно Open
        const closeChangeTotal = meanReversionForce + trendForce + randomChange;
        let close = open * (1 + closeChangeTotal);
        
        // 🔥 КРИТИЧЕСКОЕ ОГРАНИЧЕНИЕ: Макс размер свечи 2% от цены
        // ✅ РЕШЕНИЕ ПРОБЛЕМЫ "ОГРОМНЫХ СВЕЧЕЙ"
        const maxCandleChange = 0.02; // 2% максимум
        const actualChange = (close - open) / open;
        if (Math.abs(actualChange) > maxCandleChange) {
            close = open * (1 + Math.sign(actualChange) * maxCandleChange);
        }
        
        // 🎯 High/Low ОХВАТЫВАЮТ диапазон Open-Close + тени
        const bodyHigh = Math.max(open, close);
        const bodyLow = Math.min(open, close);
        
        // Генерируем тени (фитили) от границ тела - ОГРАНИЧЕННЫЕ
        const upperShadowGaussian = this.clampGaussian(Math.abs(this.gaussianFromSeed(random3, random4)), 1.0);
        const lowerShadowGaussian = this.clampGaussian(Math.abs(this.gaussianFromSeed(random4, random3)), 1.0);
        
        // Размер теней: 20-40% от волатильности (умеренные фитили)
        const shadowMultiplier = 0.2 + random5 * 0.2; // 0.2-0.4 (было 0.3-0.5)
        const upperShadow = upperShadowGaussian * scaledVolatility * shadowMultiplier;
        const lowerShadow = lowerShadowGaussian * scaledVolatility * shadowMultiplier;
        
        // High и Low выходят ЗА ПРЕДЕЛЫ тела свечи, но с ограничением
        let high = bodyHigh * (1 + upperShadow);
        let low = bodyLow * (1 - lowerShadow);
        
        // 🔥 ДОПОЛНИТЕЛЬНОЕ ОГРАНИЧЕНИЕ: Общий размер свечи (high-low) макс 3%
        const candleRange = (high - low) / open;
        if (candleRange > 0.03) {
            const mid = (high + low) / 2;
            high = mid + (open * 0.015); // ±1.5% от середины
            low = mid - (open * 0.015);
        }
        
        // ✅ УБРАНЫ ЖЕСТКИЕ ЛИМИТЫ ±5%!
        // Оставляем только защиту от экстремальных выбросов (±30%)
        const maxDeviation = 0.30; // ±30% от базовой цены
        const minPrice = this.basePrice * (1 - maxDeviation);
        const maxPrice = this.basePrice * (1 + maxDeviation);
        
        // Простое ограничение (без tanh - он искажает данные)
        const simpleClamp = (value) => {
            return Math.max(minPrice, Math.min(maxPrice, value));
        };
        
        return {
            open: simpleClamp(open),
            high: simpleClamp(high),
            low: simpleClamp(low),
            close: simpleClamp(close)
        };
    }
    
    /**
     * Seeded random: Генерация псевдослучайного числа на основе seed
     */
    seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }
    
    /**
     * Gaussian random из двух seeded random (Box-Muller transform)
     */
    gaussianFromSeed(u1, u2) {
        if (u1 === 0) u1 = 0.0001;
        if (u2 === 0) u2 = 0.0001;
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }
    
    /**
     * 🎯 Ограничение Gaussian random до ±N сигма (предотвращение выбросов)
     */
    clampGaussian(value, sigma) {
        return Math.max(-sigma, Math.min(sigma, value));
    }
    
    /**
     * 🎯 ИСПРАВЛЕНО: Получить волатильность для ТИКА с учетом накопления в таймфрейме
     * tickVolatility должен быть согласован с timeframeVolatility через √(ticksInTimeframe)
     */
    getTickVolatility(timeframe) {
        const config = TIMEFRAMES[timeframe];
        if (!config) return this.volatility * 0.001; // fallback
        
        const timeframeSeconds = config.seconds;
        const tickIntervalSeconds = 0.5; // 500ms
        const ticksInTimeframe = timeframeSeconds / tickIntervalSeconds;
        
        // 🎯 КЛЮЧЕВАЯ ФОРМУЛА:
        // timeframeVolatility = tickVolatility × √(ticksInTimeframe)
        // Следовательно: tickVolatility = timeframeVolatility / √(ticksInTimeframe)
        
        const timeframeVolatility = this.getScaledVolatility(timeframeSeconds);
        const tickVolatility = timeframeVolatility / Math.sqrt(ticksInTimeframe);
        
        return tickVolatility;
    }
    
    /**
     * Генерация следующей цены с трендами
     * 
     * 🎯 ВАРИАНТ 3: Генерируем тики с базовой волатильностью
     * - Без фазовых модификаций (убраны currentTimeframe и tickTime)
     * - Одинаковая волатильность для всех таймфреймов
     * - Размер свечей контролируется через масштабирование (getScaledVolatility)
     */
    generateNextPrice(currentPrice, isHistorical = false) {
        // 🎯 ИСПРАВЛЕНО: Базовая волатильность тика для S5
        // НИКАКИХ фазовых модификаций - только чистая волатильность
        const tickVolatility = this.getTickVolatility('S5');
        
        if (this.symbol === 'TEST_TEST1') {
            // 1. Плавный тренд (обновляем счётчик и направление)
            this.trendCounter--;
            if (this.trendCounter <= 0) {
                this.trendCounter = 40 + Math.random() * 80; // 40-120 тиков до смены тренда
                this.trendDir = (Math.random() - 0.5) * 2; // -1..1 направление
                // Сила тренда масштабируется также под тики
                this.trendStrengthTest = tickVolatility * 0.3; // 30% от tick volatility
            }
            
            // 2. Волатильность (Gaussian random) - без фазовых модификаций
            const randomChange = this.gaussianRandom() * tickVolatility;
            
            // 3. Имитация рыночного пульса (микро-волны)
            const pulse = Math.sin(Date.now() / 5000) * tickVolatility * 0.1; // 10% пульсация
            
            // 4. Mean reversion (мягкий возврат к базовой цене)
            const deviation = (currentPrice - this.basePrice) / this.basePrice;
            const meanReversionForce = -deviation * tickVolatility * 0.2; // 20% от tick volatility
            
            // 5. Обновляем цену
            const priceChange = this.trendDir * this.trendStrengthTest + randomChange + pulse + meanReversionForce;
            let next = currentPrice + priceChange;
            
            // ✅ УБРАНЫ ЖЕСТКИЕ ЛИМИТЫ! Теперь цена может идти выше 1.05 и ниже 0.95
            // Только защита от экстремальных выбросов (±30% от базовой цены)
            const minPrice = this.basePrice * 0.70;
            const maxPrice = this.basePrice * 1.30;
            next = Math.max(minPrice, Math.min(maxPrice, next));
            
            return parseFloat(next.toFixed(6));
        }
        
        // 🌊 ДЛЯ ОСТАЛЬНЫХ АКТИВОВ: Обновляем тренд для волнообразного движения
        this.updateTrend();
        
        // 🎯 БАЗОВАЯ ВОЛАТИЛЬНОСТЬ (без фазовых модификаций)
        const adjustedVolatility = this.volatility;
        
        // Mean reversion: цена стремится вернуться к базовой (адаптивная сила)
        const deviation = Math.abs(currentPrice - this.basePrice) / this.basePrice;
        const adaptiveMeanReversion = this.meanReversionSpeed * Math.pow(deviation * 10, 1.5);
        const meanReversionForce = (this.basePrice - currentPrice) * adaptiveMeanReversion;
        
        // Geometric Brownian Motion с динамическим трендом
        const randomShock = this.gaussianRandom() * adjustedVolatility;
        const priceChange = this.currentDrift + meanReversionForce + randomShock;
        
        // Ограничиваем максимальное изменение
        const maxCandleChange = 0.015; // 1.5%
        const limitedChange = Math.max(-maxCandleChange, Math.min(maxCandleChange, priceChange));
        
        let newPrice = currentPrice * (1 + limitedChange);
        
        // ✅ УВЕЛИЧЕНЫ ГРАНИЦЫ: ±20% вместо ±10% (больше свободы движения)
        newPrice = Math.max(newPrice, this.basePrice * 0.80);
        newPrice = Math.min(newPrice, this.basePrice * 1.20);
        
        // Округляем до разумного количества знаков
        const decimals = this.basePrice < 1 ? 6 : this.basePrice < 100 ? 4 : 2;
        return parseFloat(newPrice.toFixed(decimals));
    }
    
    /**
     * Нормальное распределение (Box-Muller) БЕЗ seed
     */
    gaussianRandom() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    
    /**
     * 🚀 АВТОГЕНЕРАЦИЯ: Получить свечи для таймфрейма (с генерацией на лету при необходимости)
     */
    getCandles(timeframe, from = null, to = null, limit = null, before = null) {
        const aggregator = this.aggregators[timeframe];
        if (!aggregator) {
            throw new Error(`Unknown timeframe: ${timeframe}`);
        }
        
        let candles = aggregator.getCandles();
        
        // 🚀 АВТОГЕНЕРАЦИЯ: Если запрашивают свечи РАНЬШЕ чем есть в истории - генерируем на лету
        if (before !== null && candles.length > 0) {
            const oldestCandle = candles[0];
            
            // Если запрашивают данные раньше чем самая старая свеча - нужно догенерировать
            if (before < oldestCandle.time) {
                console.log(`🔄 Auto-generating older candles for ${this.symbol} ${timeframe} (before ${new Date(before * 1000).toISOString()})...`);
                this.generateOlderCandles(timeframe, before, limit || 100);
                candles = aggregator.getCandles(); // Обновляем после генерации
            }
        }
        
        // 🎯 PAGINATION: Фильтрация по before (вернуть свечи ДО этого времени)
        if (before !== null) {
            candles = candles.filter(c => c.time < before);
        }
        
        // Фильтрация по времени (для обратной совместимости)
        if (from !== null) {
            candles = candles.filter(c => c.time >= from);
        }
        if (to !== null) {
            candles = candles.filter(c => c.time <= to);
        }
        
        // 🎯 PAGINATION: Ограничение количества свечей (берем последние limit свечей)
        if (limit !== null && limit > 0) {
            candles = candles.slice(-limit);
        }
        
        return candles;
    }
    
    /**
     * 🚀 АВТОГЕНЕРАЦИЯ: Генерация дополнительных СТАРЫХ свечей (при скролле назад)
     */
    generateOlderCandles(timeframe, beforeTime, count = 100) {
        const aggregator = this.aggregators[timeframe];
        const config = TIMEFRAMES[timeframe];
        const timeframeSeconds = config.seconds;
        const timeframeMinutes = timeframeSeconds / 60;
        
        // 🎯 МАСШТАБИРУЕМАЯ ВОЛАТИЛЬНОСТЬ с новой формулой
        const scaledVolatility = this.getScaledVolatility(timeframeSeconds);
        
        // Определяем с какого времени генерировать
        const oldestCandle = aggregator.candles[0];
        let endTime = oldestCandle ? oldestCandle.time : beforeTime;
        let startTime = endTime - (timeframeSeconds * count);
        
        // Генерируем свечи от старых к новым
        let price = this.basePrice; // Начинаем с базовой цены
        const newCandles = [];
        
        for (let currentTime = startTime; currentTime < endTime; currentTime += timeframeSeconds) {
            const candleTime = Math.floor(currentTime / timeframeSeconds) * timeframeSeconds;
            
            // 🎯 SEEDED RANDOM: Уникальный seed для каждого таймфрейма
            const timeframeId = timeframeSeconds;
            const seed = candleTime * 1000 + timeframeId;
            
            // Генерируем свечу
            const candle = this.generateCandle(price, scaledVolatility, seed, timeframeMinutes);
            candle.time = candleTime;
            
            newCandles.push(candle);
            
            // Обновляем цену для следующей свечи
            price = candle.close;
        }
        
        // Добавляем новые свечи В НАЧАЛО массива
        aggregator.candles = [...newCandles, ...aggregator.candles];
        
        // Ограничиваем общий размер (удаляем самые НОВЫЕ если превышен лимит)
        if (aggregator.candles.length > aggregator.maxCandles) {
            const excess = aggregator.candles.length - aggregator.maxCandles;
            aggregator.candles = aggregator.candles.slice(0, -excess);
        }
        
        console.log(`✅ Generated ${newCandles.length} older candles for ${this.symbol} ${timeframe}`);
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
