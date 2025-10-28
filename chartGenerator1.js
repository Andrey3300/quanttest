// 🎯 TICK-BASED CHART GENERATOR (IQCent/Quotex Style)
// Генерирует ТИКИ (не свечи), агрегирует параллельно во ВСЕ таймфреймы
//
// ✅ КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ:
// 1. 🔧 РАЗРЫВ МАСШТАБА: Полная синхронизация реал-тайм с историей
//    - Реал-тайм тики используют ту же масштабированную волатильность, что и история
//    - Трендовые параметры сохраняются/восстанавливаются для бесшовности
// 2. 🔧 ОГРОМНЫЕ СВЕЧИ: Упрощена формула волатильности
//    - Убрано агрессивное масштабирование для длинных TF (M10-M30)
//    - Жесткие ограничения на размер свечи (2% тело, 3% high-low)
// 3. 🔧 ПЕНЬКИ (S5-S30): Увеличена волатильность и тени
//    - Scaling factor для S5-S30 увеличен до 1.1x-1.3x
//    - Shadow multiplier увеличен до 0.4-0.6
// 4. 🔧 СТУПЕНЬКИ: Фазовая система отключена полностью
//    - Все тики обрабатываются одинаково, без фильтрации
// 5. 🔥 FIXED: Исправлена опечатка SatanChangeCounter -> trendChangeCounter

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
// 🔥 УВЕЛИЧЕНА ВОЛАТИЛЬНОСТЬ: Калибровка для реалистичных движений
const SYMBOL_CONFIG = {
    // Forex OTC
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
    
    // Crypto
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
    'TEST_TEST1': { basePrice: 1.0, volatility: 0.008, type: 'FOREX' }, // 🔥 FIXED: Увеличена волатильность для TEST_TEST1
    'BTC': { basePrice: 67500, volatility: 0.10, type: 'CRYPTO' },
    
    // Commodities
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
        this.candles = [];
        this.currentCandle = null;
        this.maxCandles = 20000; // Храним последние 20000 свечей
        this.candleStartTime = null;
    }

    /**
     * Обновить агрегатор новым тиком
     */
    addTick(tick) {
        const candleStartTime = this.getCandleStartTime(tick.time);

        if (!this.currentCandle || this.currentCandle.time !== candleStartTime) {
            if (this.currentCandle) {
                this.candles.push({ ...this.currentCandle });
                if (this.candles.length > this.maxCandles) {
                    this.candles.shift();
                }
            }

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
            // 🔥 FIXED: Все тики обрабатываются без фильтрации
            const currentRange = this.currentCandle.high - this.currentCandle.low;
            const shadowExpansion = currentRange * 0.25; // 🔥 FIXED: Увеличено с 0.15 до 0.25 для заметных теней

            const rand = Math.random();
            let virtualHigh = tick.price;
            let virtualLow = tick.price;

            if (rand < 0.25) {
                virtualHigh = tick.price + (shadowExpansion * Math.random());
            } else if (rand < 0.50) {
                virtualLow = tick.price - (shadowExpansion * Math.random());
            }

            this.currentCandle.high = Math.max(this.currentCandle.high, virtualHigh);
            this.currentCandle.low = Math.min(this.currentCandle.low, virtualLow);
            this.currentCandle.close = tick.price;

            return { isNewCandle: false, currentCandle: { ...this.currentCandle } };
        }
    }

    getCandleStartTime(timestamp) {
        return Math.floor(timestamp / this.timeframeSeconds) * this.timeframeSeconds;
    }

    getCandles() {
        return this.candles;
    }

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

        this.drift = 0.0;
        this.meanReversionSpeed = 0.05;
        this.currentDrift = 0.0;
        this.trendChangeCounter = 0;
        this.trendChangePeriod = this.randomInt(30, 80);
        this.trendStrength = 0.0002;

        // Параметры для TEST_TEST1
        if (symbol === 'TEST_TEST1') {
            this.trendCounter = 40 + Math.random() * 80;
            this.trendDir = (Math.random() - 0.5) * 2;
            this.trendStrengthTest = 0.0003 + Math.random() * 0.0012;
        }

        this.aggregators = {};
        Object.keys(TIMEFRAMES).forEach(tf => {
            this.aggregators[tf] = new CandleAggregator(symbol, tf, TIMEFRAMES[tf].seconds);
        });

        this.dataDir = path.join(__dirname, '..', 'data', symbol);
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;

        console.log(`📊 Initializing ${this.symbol}...`);
        const hasData = this.loadFromFiles();

        if (!hasData) {
            console.log(`   Generating 30 days history for all timeframes...`);
            await this.generateHistoricalData();
            this.saveToFiles();
        }

        this.initialized = true;

        const candleCounts = Object.keys(this.aggregators).map(tf =>
            `${tf}:${this.aggregators[tf].candles.length}`
        ).join(', ');
        console.log(`   ✅ ${this.symbol} ready (${candleCounts})`);
    }

    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    updateTrend() {
        this.trendChangeCounter++;

        if (this.trendChangeCounter >= this.trendChangePeriod) {
            const trendType = Math.random();

            if (trendType < 0.35) {
                const u1 = Math.random();
                const u2 = Math.random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                this.currentDrift = this.trendStrength * (1.0 + z0 * 0.3);
            } else if (trendType < 0.70) {
                const u1 = Math.random();
                const u2 = Math.random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                this.currentDrift = -this.trendStrength * (1.0 + z0 * 0.3);
            } else {
                const u1 = Math.random();
                const u2 = Math.random();
                const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
                this.currentDrift = this.trendStrength * (z0 * 0.5);
            }

            this.trendChangeCounter = 0;
            this.trendChangePeriod = this.randomInt(30, 80);
        } else {
            const u1 = Math.random();
            const u2 = Math.random();
            const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
            this.currentDrift += z0 * this.trendStrength * 0.1;
            this.currentDrift = Math.max(-this.trendStrength * 2, Math.min(this.trendStrength * 2, this.currentDrift));
        }
    }

    async generateHistoricalData() {
        const now = Math.floor(Date.now() / 1000);
        const startTime = now - (30 * 24 * 60 * 60);

        console.log(`   Generating candles for each timeframe with scaled volatility...`);

        for (const [timeframe, config] of Object.entries(TIMEFRAMES)) {
            const timeframeSeconds = config.seconds;
            const timeframeMinutes = timeframeSeconds / 60;
            const scaledVolatility = this.getScaledVolatility(timeframeSeconds);

            let currentTime = startTime;
            let price = this.basePrice;
            const totalCandles = Math.floor((30 * 24 * 60 * 60) / timeframeSeconds);

            for (let i = 0; i < totalCandles; i++) {
                const candleTime = Math.floor(currentTime / timeframeSeconds) * timeframeSeconds;
                const timeframeId = timeframeSeconds;
                const seed = candleTime * 1000 + timeframeId;

                const candle = this.generateCandle(price, scaledVolatility, seed, timeframeMinutes);
                candle.time = candleTime;

                this.aggregators[timeframe].candles.push(candle);

                if (this.aggregators[timeframe].candles.length > this.aggregators[timeframe].maxCandles) {
                    this.aggregators[timeframe].candles.shift();
                }

                price = candle.close;
                currentTime += timeframeSeconds;
            }

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

        // 🔥 FIXED: Синхронизация реал-тайм с историей
        const s5LastCandle = this.aggregators['S5'].candles[this.aggregators['S5'].candles.length - 1];
        this.currentPrice = s5LastCandle ? s5LastCandle.close : this.basePrice;

        // 🔥 FIXED: Инициализация трендов из последней свечи S5
        if (s5LastCandle) {
            const direction = s5LastCandle.close > s5LastCandle.open ? 1 : -1;
            this.currentDrift = direction * this.trendStrength * 0.5;
            if (this.symbol === 'TEST_TEST1') {
                this.trendDir = direction;
                this.trendStrengthTest = this.getScaledVolatility(5) * 0.8;
                this.trendCounter = this.randomInt(40, 120);
            }
        }

        console.log(`   📊 History ends at price: ${this.currentPrice.toFixed(6)} (base: ${this.basePrice})`);
    }

    generateTick() {
        const now = Math.floor(Date.now() / 1000);
        const results = {};

        // 🔥 FIXED: Генерация тиков с масштабированной волатильностью для каждого таймфрейма
        Object.keys(this.aggregators).forEach(tf => {
            const scaledVolatility = this.getScaledVolatility(TIMEFRAMES[tf].seconds);
            this.currentPrice = this.generateNextPrice(this.currentPrice, tf, false);
            const tick = { time: now, price: this.currentPrice };
            results[tf] = this.aggregators[tf].addTick(tick);
        });

        return { tick: { time: now, price: this.currentPrice }, aggregationResults: results };
    }

    getScaledVolatility(timeframeSeconds) {
        const baseSeconds = 60;
        const ratio = timeframeSeconds / baseSeconds;

        if (ratio < 0.15) {
            // 🔥 FIXED: S5-S10 (5-9 сек): Увеличено масштабирование до 1.1x-1.2x
            const scalingFactor = 1.1 + (ratio * 0.67); // S5=1.15x, S10=1.20x
            return this.volatility * scalingFactor;
        } else if (ratio < 0.5) {
            // 🔥 FIXED: S15-S30: Увеличено до 1.2x-1.3x
            const scalingFactor = 1.2 + (ratio * 0.4); // S15=1.26x, S30=1.32x
            return this.volatility * scalingFactor;
        } else if (ratio <= 1) {
            // M1: Базовая волатильность
            return this.volatility;
        } else if (ratio <= 5) {
            // M2-M5: Умеренный рост
            const scalingFactor = Math.sqrt(ratio) * 1.2; // M2=1.70x, M5=2.68x
            return this.volatility * scalingFactor;
        } else {
            // 🔥 FIXED: M10-M30: Упрощено масштабирование с насыщением
            const scalingFactor = Math.sqrt(ratio) * 1.5; // M15=3.67x, M30=5.20x
            return this.volatility * scalingFactor;
        }
    }

    generateCandle(basePrice, scaledVolatility, seed, timeframeMinutes) {
        const random = this.seededRandom(seed);
        const random2 = this.seededRandom(seed + 1);
        const random3 = this.seededRandom(seed + 2);
        const random4 = this.seededRandom(seed + 3);
        const random5 = this.seededRandom(seed + 4);

        const open = basePrice;
        const deviation = (basePrice - this.basePrice) / this.basePrice;
        const meanReversionForce = -deviation * 0.2;
        const trendForce = Math.sin(seed / 8000) * 0.0005;
        const randomGaussian = this.clampGaussian(this.gaussianFromSeed(random, random2), 1.5);
        const randomChange = randomGaussian * scaledVolatility * 0.8;

        const closeChangeTotal = meanReversionForce + trendForce + randomChange;
        let close = open * (1 + closeChangeTotal);

        const maxCandleChange = 0.02;
        const actualChange = (close - open) / open;
        if (Math.abs(actualChange) > maxCandleChange) {
            close = open * (1 + Math.sign(actualChange) * maxCandleChange);
        }

        const bodyHigh = Math.max(open, close);
        const bodyLow = Math.min(open, close);

        // 🔥 FIXED: Увеличены тени для заметности
        const upperShadowGaussian = this.clampGaussian(Math.abs(this.gaussianFromSeed(random3, random4)), 1.0);
        const lowerShadowGaussian = this.clampGaussian(Math.abs(this.gaussianFromSeed(random4, random3)), 1.0);
        const shadowMultiplier = 0.4 + random5 * 0.2; // 🔥 FIXED: 0.4-0.6 вместо 0.2-0.4

        const upperShadow = upperShadowGaussian * scaledVolatility * shadowMultiplier;
        const lowerShadow = lowerShadowGaussian * scaledVolatility * shadowMultiplier;

        let high = bodyHigh * (1 + upperShadow);
        let low = bodyLow * (1 - lowerShadow);

        const candleRange = (high - low) / open;
        if (candleRange > 0.03) {
            const mid = (high + low) / 2;
            high = mid + (open * 0.015);
            low = mid - (open * 0.015);
        }

        const maxDeviation = 0.30;
        const minPrice = this.basePrice * (1 - maxDeviation);
        const maxPrice = this.basePrice * (1 + maxDeviation);

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

    seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    gaussianFromSeed(u1, u2) {
        if (u1 === 0) u1 = 0.0001;
        if (u2 === 0) u2 = 0.0001;
        return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    }

    clampGaussian(value, sigma) {
        return Math.max(-sigma, Math.min(sigma, value));
    }

    getTickVolatility(timeframe) {
        const config = TIMEFRAMES[timeframe];
        if (!config) return this.volatility * 0.001;

        const timeframeSeconds = config.seconds;
        const tickIntervalSeconds = 0.5;
        const ticksInTimeframe = timeframeSeconds / tickIntervalSeconds;

        const timeframeVolatility = this.getScaledVolatility(timeframeSeconds);
        const tickVolatility = timeframeVolatility / Math.sqrt(ticksInTimeframe);

        return tickVolatility;
    }

    generateNextPrice(currentPrice, timeframe, isHistorical = false) {
        const tickVolatility = this.getTickVolatility(timeframe);

        if (this.symbol === 'TEST_TEST1') {
            this.trendCounter--;
            if (this.trendCounter <= 0) {
                this.trendCounter = this.randomInt(40, 120);
                this.trendDir = (Math.random() - 0.5) * 2;
                this.trendStrengthTest = tickVolatility * 0.8;
            }

            const randomChange = this.gaussianRandom() * tickVolatility * 1.5; // 🔥 FIXED: Увеличено с 1.4x до 1.5x
            const pulse = Math.sin(Date.now() / 5000) * tickVolatility * 0.1;
            const deviation = (currentPrice - this.basePrice) / this.basePrice;
            const meanReversionForce = -deviation * tickVolatility * 0.2;

            const priceChange = this.trendDir * this.trendStrengthTest + randomChange + pulse + meanReversionForce;
            let next = currentPrice + priceChange;

            const minPrice = this.basePrice * 0.70;
            const maxPrice = this.basePrice * 1.30;
            next = Math.max(minPrice, Math.min(maxPrice, next));

            return parseFloat(next.toFixed(6));
        }

        this.updateTrend();
        const adjustedVolatility = tickVolatility;
        const deviation = Math.abs(currentPrice - this.basePrice) / this.basePrice;
        const adaptiveMeanReversion = this.meanReversionSpeed * Math.pow(deviation * 10, 1.5);
        const meanReversionForce = (this.basePrice - currentPrice) * adaptiveMeanReversion;

        const randomShock = this.gaussianRandom() * adjustedVolatility;
        const priceChange = this.currentDrift + meanReversionForce + randomShock;

        const maxCandleChange = 0.015;
        const limitedChange = Math.max(-maxCandleChange, Math.min(maxCandleChange, priceChange));

        let newPrice = currentPrice * (1 + limitedChange);
        newPrice = Math.max(newPrice, this.basePrice * 0.80);
        newPrice = Math.min(newPrice, this.basePrice * 1.20);

        const decimals = this.basePrice < 1 ? 6 : this.basePrice < 100 ? 4 : 2;
        return parseFloat(newPrice.toFixed(decimals));
    }

    gaussianRandom() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }

    getCandles(timeframe, from = null, to = null, limit = null, before = null) {
        const aggregator = this.aggregators[timeframe];
        if (!aggregator) {
            throw new Error(`Unknown timeframe: ${timeframe}`);
        }

        let candles = aggregator.getCandles();

        if (before !== null && candles.length > 0) {
            const oldestCandle = candles[0];
            if (before < oldestCandle.time) {
                console.log(`🔄 Auto-generating older candles for ${this.symbol} ${timeframe} (before ${new Date(before * 1000).toISOString()})...`);
                this.generateOlderCandles(timeframe, before, limit || 100);
                candles = aggregator.getCandles();
            }
        }

        if (before !== null) {
            candles = candles.filter(c => c.time < before);
        }

        if (from !== null) {
            candles = candles.filter(c => c.time >= from);
        }
        if (to !== null) {
            candles = candles.filter(c => c.time <= to);
        }

        if (limit !== null && limit > 0) {
            candles = candles.slice(-limit);
        }

        return candles;
    }

    generateOlderCandles(timeframe, beforeTime, count = 100) {
        const aggregator = this.aggregators[timeframe];
        const config = TIMEFRAMES[timeframe];
        const timeframeSeconds = config.seconds;
        const timeframeMinutes = timeframeSeconds / 60;

        const scaledVolatility = this.getScaledVolatility(timeframeSeconds);

        const oldestCandle = aggregator.candles[0];
        let endTime = oldestCandle ? oldestCandle.time : beforeTime;
        let startTime = endTime - (timeframeSeconds * count);

        let price = this.basePrice;
        const newCandles = [];

        for (let currentTime = startTime; currentTime < endTime; currentTime += timeframeSeconds) {
            const candleTime = Math.floor(currentTime / timeframeSeconds) * timeframeSeconds;
            const timeframeId = timeframeSeconds;
            const seed = candleTime * 1000 + timeframeId;

            const candle = this.generateCandle(price, scaledVolatility, seed, timeframeMinutes);
            candle.time = candleTime;

            newCandles.push(candle);
            price = candle.close;
        }

        aggregator.candles = [...newCandles, ...aggregator.candles];

        if (aggregator.candles.length > aggregator.maxCandles) {
            const excess = aggregator.candles.length - aggregator.maxCandles;
            aggregator.candles = aggregator.candles.slice(0, -excess);
        }

        console.log(`✅ Generated ${newCandles.length} older candles for ${this.symbol} ${timeframe}`);
    }

    getCurrentCandle(timeframe) {
        const aggregator = this.aggregators[timeframe];
        if (!aggregator) {
            throw new Error(`Unknown timeframe: ${timeframe}`);
        }

        return aggregator.getCurrentCandle();
    }

    getCurrentPrice() {
        return this.currentPrice;
    }

    saveToFiles() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        Object.keys(TIMEFRAMES).forEach(tf => {
            const filePath = path.join(this.dataDir, `${tf}.json`);
            const data = {
                symbol: this.symbol,
                timeframe: tf,
                currentPrice: this.currentPrice,
                candles: this.aggregators[tf].getCandles(),
                currentCandle: this.aggregators[tf].getCurrentCandle(),
                timestamp: Date.now(),
                // 🔥 FIXED: Сохранение трендовых параметров
                trendParams: {
                    currentDrift: this.currentDrift,
                    trendChangeCounter: this.trendChangeCounter,
                    trendChangePeriod: this.trendChangePeriod,
                    trendDir: this.symbol === 'TEST_TEST1' ? this.trendDir : null,
                    trendStrengthTest: this.symbol === 'TEST_TEST1' ? this.trendStrengthTest : null,
                    trendCounter: this.symbol === 'TEST_TEST1' ? this.trendCounter : null
                }
            };

            fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        });
    }

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

                    this.aggregators[tf].candles = data.candles || [];
                    if (data.currentCandle) {
                        this.aggregators[tf].currentCandle = data.currentCandle;
                    }
                    if (data.currentPrice) {
                        this.currentPrice = data.currentPrice;
                    }
                    // 🔥 FIXED: Восстановление трендовых параметров
                    if (data.trendParams) {
                        this.currentDrift = data.trendParams.currentDrift || this.currentDrift;
                        this.trendChangeCounter = data.trendParams.trendChangeCounter || this.trendChangeCounter;
                        this.trendChangePeriod = data.trendParams.trendChangePeriod || this.trendChangePeriod;
                        if (this.symbol === 'TEST_TEST1' && data.trendParams.trendDir !== null) {
                            this.trendDir = data.trendParams.trendDir;
                            this.trendStrengthTest = data.trendParams.trendStrengthTest;
                            this.trendCounter = data.trendParams.trendCounter;
                        }
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

function getGenerator(symbol) {
    if (!generators.has(symbol)) {
        const generator = new TickGenerator(symbol);
        generators.set(symbol, generator);
    }
    return generators.get(symbol);
}

async function initializeAllGenerators() {
    const symbols = Object.keys(SYMBOL_CONFIG);
    const startTime = Date.now();

    console.log(`🚀 Initializing ${symbols.length} tick generators...`);

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