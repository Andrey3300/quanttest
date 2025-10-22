// Chart data generator with Geometric Brownian Motion
// Генератор свечных данных с геометрическим броуновским движением

const logger = require('./errorLogger');

class ChartGenerator {
    constructor(symbol, basePrice, volatility = 0.002, drift = 0.0, meanReversionSpeed = 0.05) {
        this.symbol = symbol;
        this.basePrice = basePrice;
        this.currentPrice = basePrice;
        
        // Увеличиваем волатильность пропорционально для больших чисел
        if (basePrice > 10000) {
            volatility = volatility * (1 + Math.log10(basePrice / 10000));
        }
        
        this.volatility = volatility; // волатильность
        this.drift = drift; // тренд
        this.meanReversionSpeed = meanReversionSpeed; // скорость возврата к средней
        this.maxCandleChange = 0.015; // максимальное изменение за свечу (1.5%) - увеличено для лучшей видимости
        this.candles = [];
    }

    // Генерация случайного числа с нормальным распределением (Box-Muller)
    randomNormal(mean = 0, stdDev = 1) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    // Генерация следующей цены с учетом mean-reversion
    generateNextPrice(currentPrice) {
        // Mean reversion: цена стремится вернуться к базовой
        const meanReversionForce = (this.basePrice - currentPrice) * this.meanReversionSpeed;
        
        // Geometric Brownian Motion
        const randomShock = this.randomNormal(0, this.volatility);
        const priceChange = this.drift + meanReversionForce + randomShock;
        
        // Ограничиваем максимальное изменение
        const limitedChange = Math.max(-this.maxCandleChange, Math.min(this.maxCandleChange, priceChange));
        
        let newPrice = currentPrice * (1 + limitedChange);
        
        // Убедимся что цена положительная и в разумных пределах
        newPrice = Math.max(newPrice, this.basePrice * 0.9);
        newPrice = Math.min(newPrice, this.basePrice * 1.1);
        
        return newPrice;
    }

    // Определение точности цены на основе базовой цены
    // УЛУЧШЕНИЕ: Адаптивная точность для различных ценовых диапазонов
    getPricePrecision(price) {
        if (price >= 10000) return 1;     // Крупные активы: UAH_USD_OTC: 68623.2
        if (price >= 1000) return 2;      // Криптовалюты: BTC: 68750.23
        if (price >= 100) return 3;       // Средние криптовалюты: ETH: 3450.123
        if (price >= 10) return 4;        // Валютные пары: USD/MXN: 18.9167
        if (price >= 1) return 4;         // Основные пары: EUR/USD: 1.0850
        if (price >= 0.1) return 5;       // Альткоины: DOGE: 0.14523
        if (price >= 0.01) return 6;      // Микро-пары
        return 8;                          // Минимальные активы
    }

    // Генерация одной свечи с реалистичным OHLC
    generateCandle(timestamp, openPrice) {
        const close = this.generateNextPrice(openPrice);
        
        // Генерируем high и low с реалистичной волатильностью внутри свечи
        const intraVolatility = this.volatility * 0.4; // уменьшенная внутри-свечная волатильность для меньших фитилей
        
        // Ограничение максимального размера фитиля относительно тела свечи
        const bodySize = Math.abs(close - openPrice);
        const maxWickMultiplier = bodySize > 0 ? 2.0 : 0.5; // фитиль не больше 2x тела (или 0.5% если тело нулевое)
        const maxWickSize = bodySize > 0 ? bodySize * maxWickMultiplier : this.basePrice * 0.005;
        
        // High должен быть выше open и close
        const maxPrice = Math.max(openPrice, close);
        let wickHighSize = Math.abs(this.randomNormal(0, intraVolatility)) * maxPrice;
        wickHighSize = Math.min(wickHighSize, maxWickSize); // ограничиваем размер фитиля
        const high = maxPrice + wickHighSize;
        
        // Low должен быть ниже open и close
        const minPrice = Math.min(openPrice, close);
        let wickLowSize = Math.abs(this.randomNormal(0, intraVolatility)) * minPrice;
        wickLowSize = Math.min(wickLowSize, maxWickSize); // ограничиваем размер фитиля
        const low = minPrice - wickLowSize;
        
        // Генерируем объем (случайный в диапазоне)
        const baseVolume = 10000;
        const volumeVariance = 0.5;
        const volume = Math.floor(baseVolume * (1 + this.randomNormal(0, volumeVariance)));
        
        // Определяем точность для этого актива
        const precision = this.getPricePrecision(this.basePrice);
        
        return {
            time: Math.floor(timestamp / 1000), // время в секундах для lightweight-charts
            open: parseFloat(openPrice.toFixed(precision)),
            high: parseFloat(high.toFixed(precision)),
            low: parseFloat(low.toFixed(precision)),
            close: parseFloat(close.toFixed(precision)),
            volume: Math.max(1000, volume)
        };
    }

    // Генерация исторических данных за 7 дней с шагом 5 секунд
    generateHistoricalData(days = 7, intervalSeconds = 5) {
        const candles = [];
        const now = Date.now();
        
        // ВАЖНО: Выравниваем текущее время по сетке intervalSeconds
        const currentTimeSeconds = Math.floor(now / 1000);
        const alignedCurrentTime = Math.floor(currentTimeSeconds / intervalSeconds) * intervalSeconds;
        const alignedNow = alignedCurrentTime * 1000;
        
        const startTime = alignedNow - (days * 24 * 60 * 60 * 1000); // 7 дней назад
        const totalCandles = Math.floor((alignedNow - startTime) / (intervalSeconds * 1000));
        
        let currentPrice = this.basePrice;
        
        for (let i = 0; i < totalCandles; i++) {
            const timestamp = startTime + (i * intervalSeconds * 1000);
            const candle = this.generateCandle(timestamp, currentPrice);
            candles.push(candle);
            currentPrice = candle.close; // следующая свеча начинается с close предыдущей
        }
        
        this.candles = candles;
        this.currentPrice = currentPrice;
        
        // Инициализируем currentCandleState для последней свечи
        if (candles.length > 0) {
            const lastCandle = candles[candles.length - 1];
            this.currentCandleState = {
                time: lastCandle.time,
                open: lastCandle.open,
                high: lastCandle.high,
                low: lastCandle.low,
                close: lastCandle.close,
                volume: lastCandle.volume,
                targetClose: lastCandle.close,
                targetHigh: lastCandle.high,
                targetLow: lastCandle.low
            };
        }
        
        logger.info('historical', 'Historical data generated', {
            symbol: this.symbol,
            totalCandles: candles.length,
            lastCandleTime: candles[candles.length - 1]?.time,
            alignedCurrentTime: alignedCurrentTime,
            intervalSeconds: intervalSeconds,
            currentCandleStateInitialized: !!this.currentCandleState
        });
        
        return candles;
    }

    // Генерация новой свечи для real-time обновления
    generateNextCandle() {
        const now = Date.now();
        const precision = this.getPricePrecision(this.basePrice);
        const intervalSeconds = 5; // интервал свечи
        
        // Новая свеча ВСЕГДА начинается с цены закрытия предыдущей свечи
        const openPrice = this.currentPrice;
        
        // РЕШЕНИЕ #1: Не полагаемся на Date.now() для timestamp, а рассчитываем от последней свечи
        // Это гарантирует монотонность времени и убирает зависимость от точности setInterval
        let timestamp;
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            // ВСЕГДА следующий интервал - гарантирует что timestamp строго больше предыдущего
            timestamp = lastCandle.time + intervalSeconds;
            
            logger.debug('candle', 'Calculated timestamp from last candle', { 
                symbol: this.symbol,
                lastTime: lastCandle.time,
                newTime: timestamp,
                intervalSeconds: intervalSeconds
            });
        } else {
            // Только для первой свечи выравниваем по сетке
            const currentTimeSeconds = Math.floor(now / 1000);
            timestamp = Math.floor(currentTimeSeconds / intervalSeconds) * intervalSeconds;
            
            logger.debug('candle', 'First candle - aligned to grid', { 
                symbol: this.symbol,
                timestamp: timestamp
            });
        }
        
        // КРИТИЧЕСКОЕ УЛУЧШЕНИЕ: Генерируем полноценную свечу с вариацией сразу
        // Используем существующий метод generateCandle() вместо плоской свечи
        // Это решает проблему одинаковых свечей (open=high=low=close)
        const candle = this.generateCandle(timestamp * 1000, openPrice);
        
        this.candles.push(candle);
        
        // Ограничиваем размер массива (храним последние 7 дней)
        const maxCandles = 7 * 24 * 60 * 12; // 7 дней * 5-секундные свечи
        if (this.candles.length > maxCandles) {
            this.candles.shift();
        }
        
        // Инициализируем состояние текущей свечи для плавных обновлений
        // Начинаем с текущей цены и позволяем тикам развивать свечу
        this.currentCandleState = {
            time: candle.time,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            targetClose: candle.close,
            targetHigh: candle.high,
            targetLow: candle.low
        };
        
        // Финальная валидация перед возвратом
        if (typeof candle.time !== 'number' || isNaN(candle.time)) {
            logger.error('candle', 'Invalid new candle time detected', { 
                symbol: this.symbol,
                candle: candle
            });
            console.error('Invalid new candle time:', candle);
            candle.time = Math.floor(Date.now() / 1000);
        }
        
        // РЕШЕНИЕ #5: Детальное логирование для мониторинга
        logger.logCandle('New candle sent to clients', this.symbol, candle);
        logger.debug('candle', 'Candle creation details', {
            symbol: this.symbol,
            time: candle.time,
            timeISO: new Date(candle.time * 1000).toISOString(),
            open: candle.open,
            close: candle.close,
            totalCandles: this.candles.length,
            previousCandleTime: this.candles.length > 1 ? this.candles[this.candles.length - 2].time : null,
            timeDiff: this.candles.length > 1 ? candle.time - this.candles[this.candles.length - 2].time : null
        });
        
        return candle;
    }
    
    // Генерация плавного обновления текущей свечи (тика)
    generateCandleTick() {
        if (!this.currentCandleState) {
            // Если свечи нет, создаем начальную
            return this.generateNextCandle();
        }
        
        // ЗАЩИТА: Проверяем что currentCandleState синхронизирован с последней свечой
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            if (this.currentCandleState.time !== lastCandle.time) {
                logger.warn('candle', 'currentCandleState out of sync - resetting', {
                    symbol: this.symbol,
                    currentStateTime: this.currentCandleState.time,
                    lastCandleTime: lastCandle.time,
                    timeDiff: lastCandle.time - this.currentCandleState.time
                });
                // Пересинхронизируем с последней свечой
                this.currentCandleState = {
                    time: lastCandle.time,
                    open: lastCandle.open,
                    high: lastCandle.high,
                    low: lastCandle.low,
                    close: lastCandle.close,
                    volume: lastCandle.volume,
                    targetClose: lastCandle.close,
                    targetHigh: lastCandle.high,
                    targetLow: lastCandle.low
                };
            }
        }
        
        const precision = this.getPricePrecision(this.basePrice);
        
        // Генерируем небольшое изменение цены для плавности
        const microVolatility = this.volatility * 0.3; // меньшая волатильность для плавности
        
        // Mean reversion для тиков - стремимся к базовой цене
        const meanReversionForce = (this.basePrice - this.currentCandleState.targetClose) * this.meanReversionSpeed;
        const priceChange = this.randomNormal(0, microVolatility) + meanReversionForce;
        
        // Новая целевая цена close
        let newTargetClose = this.currentCandleState.targetClose * (1 + priceChange);
        
        // Ограничиваем изменение в пределах разумного
        const maxChange = this.basePrice * 0.001; // 0.1% за тик
        newTargetClose = Math.max(
            this.currentCandleState.targetClose - maxChange,
            Math.min(this.currentCandleState.targetClose + maxChange, newTargetClose)
        );
        
        // Убедимся что цена в разумных пределах
        newTargetClose = Math.max(newTargetClose, this.basePrice * 0.9);
        newTargetClose = Math.min(newTargetClose, this.basePrice * 1.1);
        
        // Обновляем текущее состояние
        this.currentCandleState.targetClose = newTargetClose;
        this.currentCandleState.close = parseFloat(newTargetClose.toFixed(precision));
        
        // Обновляем currentPrice для следующей свечи
        this.currentPrice = this.currentCandleState.close;
        
        // Обновляем high и low правильно
        if (this.currentCandleState.close > this.currentCandleState.high) {
            this.currentCandleState.high = this.currentCandleState.close;
            this.currentCandleState.targetHigh = this.currentCandleState.close;
        } else {
            // Иногда создаем фитиль вверх для реалистичности
            if (Math.random() < 0.03) { // уменьшена вероятность с 0.08 до 0.03
                const wickHigh = this.currentCandleState.close * (1 + Math.abs(this.randomNormal(0, microVolatility * 0.3))); // уменьшен множитель с 0.5 до 0.3
                if (wickHigh > this.currentCandleState.high && wickHigh <= this.basePrice * 1.1) {
                    this.currentCandleState.high = parseFloat(wickHigh.toFixed(precision));
                    this.currentCandleState.targetHigh = wickHigh;
                }
            }
        }
        
        if (this.currentCandleState.close < this.currentCandleState.low) {
            this.currentCandleState.low = this.currentCandleState.close;
            this.currentCandleState.targetLow = this.currentCandleState.close;
        } else {
            // Иногда создаем фитиль вниз для реалистичности
            if (Math.random() < 0.03) { // уменьшена вероятность с 0.08 до 0.03
                const wickLow = this.currentCandleState.close * (1 - Math.abs(this.randomNormal(0, microVolatility * 0.3))); // уменьшен множитель с 0.5 до 0.3
                if (wickLow < this.currentCandleState.low && wickLow >= this.basePrice * 0.9) {
                    this.currentCandleState.low = parseFloat(wickLow.toFixed(precision));
                    this.currentCandleState.targetLow = wickLow;
                }
            }
        }
        
        // Немного увеличиваем объем
        this.currentCandleState.volume += Math.floor(Math.random() * 100);
        
        // Обновляем последнюю свечу в массиве - КРИТИЧЕСКИ ВАЖНО!
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            if (lastCandle.time === this.currentCandleState.time) {
                lastCandle.close = this.currentCandleState.close;
                lastCandle.high = this.currentCandleState.high;
                lastCandle.low = this.currentCandleState.low;
                lastCandle.volume = this.currentCandleState.volume;
            }
        }
        
        // Создаем объект для возврата с явной проверкой типов
        const tickCandle = {
            time: this.currentCandleState.time,
            open: this.currentCandleState.open,
            high: this.currentCandleState.high,
            low: this.currentCandleState.low,
            close: this.currentCandleState.close,
            volume: this.currentCandleState.volume
        };
        
        // Валидация: все значения должны быть числами
        if (typeof tickCandle.time !== 'number' || isNaN(tickCandle.time) ||
            typeof tickCandle.open !== 'number' || isNaN(tickCandle.open) ||
            typeof tickCandle.high !== 'number' || isNaN(tickCandle.high) ||
            typeof tickCandle.low !== 'number' || isNaN(tickCandle.low) ||
            typeof tickCandle.close !== 'number' || isNaN(tickCandle.close)) {
            logger.error('candle', 'Invalid tick candle data detected', { 
                symbol: this.symbol,
                tickCandle: tickCandle,
                currentState: this.currentCandleState
            });
            console.error('Invalid tick candle data:', tickCandle);
            // Возвращаем безопасную копию без NaN
            return {
                time: this.currentCandleState.time || Math.floor(Date.now() / 1000),
                open: this.currentCandleState.open || this.basePrice,
                high: this.currentCandleState.high || this.basePrice,
                low: this.currentCandleState.low || this.basePrice,
                close: this.currentCandleState.close || this.basePrice,
                volume: this.currentCandleState.volume || 1000
            };
        }
        
        return tickCandle;
    }

    // Получение исторических данных
    getHistoricalData(from, to) {
        if (this.candles.length === 0) {
            this.generateHistoricalData();
        }
        
        if (!from && !to) {
            return this.candles;
        }
        
        // Фильтрация по временному диапазону
        return this.candles.filter(candle => {
            const time = candle.time;
            const matchFrom = !from || time >= from;
            const matchTo = !to || time <= to;
            return matchFrom && matchTo;
        });
    }
}

// Singleton инстансы для разных символов
const generators = new Map();

function getGenerator(symbol) {
    if (!generators.has(symbol)) {
        // Настройки для разных символов с уникальными паттернами
        const config = {
            // Currencies - умеренная волатильность для естественного вида как USD/MXN
            'USD_MXN_OTC': { basePrice: 18.9167, volatility: 0.002, drift: 0.0 },
            'EUR_USD_OTC': { basePrice: 1.0850, volatility: 0.0015, drift: 0.0 },
            'GBP_USD_OTC': { basePrice: 1.2650, volatility: 0.0018, drift: 0.0 },
            'USD_CAD': { basePrice: 1.3550, volatility: 0.0016, drift: 0.0 },
            'AUD_CAD_OTC': { basePrice: 0.8820, volatility: 0.0019, drift: 0.0 },
            'BHD_CNY_OTC': { basePrice: 18.6500, volatility: 0.0017, drift: 0.0 },
            'EUR_CHF_OTC': { basePrice: 0.9420, volatility: 0.0014, drift: 0.0 },
            'EUR_CHF_OTC2': { basePrice: 0.9425, volatility: 0.0014, drift: 0.0 },
            'KES_USD_OTC': { basePrice: 0.0077, volatility: 0.0020, drift: 0.0 },
            'TND_USD_OTC': { basePrice: 0.3190, volatility: 0.0018, drift: 0.0 },
            'UAH_USD_OTC': { basePrice: 68623.2282, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.01 },
            'USD_BDT_OTC': { basePrice: 0.0092, volatility: 0.0019, drift: 0.0 },
            'USD_CNH_OTC': { basePrice: 7.2450, volatility: 0.0016, drift: 0.0 },
            'USD_IDR_OTC': { basePrice: 15850, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.01 },
            'USD_MYR_OTC': { basePrice: 4.4650, volatility: 0.0017, drift: 0.0 },
            'AUD_NZD_OTC': { basePrice: 1.0920, volatility: 0.0016, drift: 0.0 },
            'USD_PHP_OTC': { basePrice: 0.0178, volatility: 0.0019, drift: 0.0 },
            'ZAR_USD_OTC': { basePrice: 0.0548, volatility: 0.0021, drift: 0.0 },
            'YER_USD_OTC': { basePrice: 0.0040, volatility: 0.0022, drift: 0.0 },
            'USD_BRL_OTC': { basePrice: 5.6250, volatility: 0.0019, drift: 0.0 },
            'USD_EGP_OTC': { basePrice: 0.0204, volatility: 0.0023, drift: 0.0 },
            'OMR_CNY_OTC': { basePrice: 18.3500, volatility: 0.0016, drift: 0.0 },
            'AUD_JPY_OTC': { basePrice: 96.850, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.01 },
            'EUR_GBP_OTC': { basePrice: 0.8580, volatility: 0.0015, drift: 0.0 },
            'EUR_HUF_OTC': { basePrice: 393.50, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.01 },
            'EUR_TRY_OTC': { basePrice: 37.250, volatility: 0.0024, drift: 0.0 },
            'USD_JPY_OTC': { basePrice: 149.850, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.01 },
            'USD_CHF_OTC': { basePrice: 0.8690, volatility: 0.0015, drift: 0.0 },
            'AUD_CHF': { basePrice: 0.5820, volatility: 0.0016, drift: 0.0 },
            'CHF_JPY': { basePrice: 172.450, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.01 },
            'EUR_AUD': { basePrice: 1.6350, volatility: 0.0017, drift: 0.0 },
            'EUR_CHF': { basePrice: 0.9435, volatility: 0.0014, drift: 0.0 },
            'EUR_GBP': { basePrice: 0.8575, volatility: 0.0015, drift: 0.0 },
            'EUR_JPY': { basePrice: 162.650, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.01 },
            'EUR_USD': { basePrice: 1.0855, volatility: 0.0016, drift: 0.0 },
            'GBP_CAD': { basePrice: 1.7150, volatility: 0.0018, drift: 0.0 },
            'GBP_CHF': { basePrice: 1.1020, volatility: 0.0017, drift: 0.0 },
            'GBP_USD': { basePrice: 1.2655, volatility: 0.0017, drift: 0.0 },
            
            // Cryptocurrencies - увеличенная волатильность и ослабленный mean reversion для более свободного движения
            'BTC': { basePrice: 68500, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.002 },
            'BTC_OTC': { basePrice: 68750, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.002 },
            'BTC_ETF_OTC': { basePrice: 68600, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.002 },
            'ETH_OTC': { basePrice: 3450, volatility: 0.014, drift: 0.0, meanReversionSpeed: 0.002 },
            'TEST_TEST1': { basePrice: 125.50, volatility: 0.0035, drift: 0.0, meanReversionSpeed: 0.003 },
            'BNB_OTC': { basePrice: 585, volatility: 0.013, drift: 0.0, meanReversionSpeed: 0.002 },
            'SOL_OTC': { basePrice: 168, volatility: 0.015, drift: 0.0, meanReversionSpeed: 0.002 },
            'ADA_OTC': { basePrice: 0.58, volatility: 0.0036, drift: 0.0, meanReversionSpeed: 0.003 },
            'DOGE_OTC': { basePrice: 0.14, volatility: 0.0040, drift: 0.0, meanReversionSpeed: 0.003 },
            'DOT_OTC': { basePrice: 7.2, volatility: 0.0034, drift: 0.0, meanReversionSpeed: 0.003 },
            'MATIC_OTC': { basePrice: 0.78, volatility: 0.0037, drift: 0.0, meanReversionSpeed: 0.003 },
            'LTC_OTC': { basePrice: 85, volatility: 0.013, drift: 0.0, meanReversionSpeed: 0.002 },
            'LINK_OTC': { basePrice: 15.8, volatility: 0.0034, drift: 0.0, meanReversionSpeed: 0.003 },
            'AVAX_OTC': { basePrice: 38.5, volatility: 0.0039, drift: 0.0, meanReversionSpeed: 0.003 },
            'TRX_OTC': { basePrice: 0.168, volatility: 0.0032, drift: 0.0, meanReversionSpeed: 0.003 },
            'TON_OTC': { basePrice: 5.6, volatility: 0.0036, drift: 0.0, meanReversionSpeed: 0.003 },
            
            // Commodities - оптимизированная волатильность
            'GOLD_OTC': { basePrice: 2650, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.01 },
            'SILVER_OTC': { basePrice: 31.5, volatility: 0.0022, drift: 0.0 },
            'BRENT_OTC': { basePrice: 87.5, volatility: 0.010, drift: 0.0, meanReversionSpeed: 0.01 },
            'WTI_OTC': { basePrice: 83.8, volatility: 0.010, drift: 0.0, meanReversionSpeed: 0.01 },
            'NATGAS_OTC': { basePrice: 3.2, volatility: 0.0028, drift: 0.0 },
            'PALLADIUM_OTC': { basePrice: 1050, volatility: 0.009, drift: 0.0, meanReversionSpeed: 0.01 },
            'PLATINUM_OTC': { basePrice: 980, volatility: 0.009, drift: 0.0, meanReversionSpeed: 0.01 }
        };
        
        const symbolConfig = config[symbol] || { basePrice: 100, volatility: 0.002, drift: 0.0 };
        const generator = new ChartGenerator(
            symbol,
            symbolConfig.basePrice,
            symbolConfig.volatility,
            symbolConfig.drift,
            symbolConfig.meanReversionSpeed // если не указан, будет использован дефолтный 0.05
        );
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Сразу генерируем исторические данные
        // Это гарантирует что генератор инициализирован ДО первых тиков
        generator.generateHistoricalData();
        
        logger.info('generator', 'New generator created and initialized', {
            symbol: symbol,
            candleCount: generator.candles.length,
            basePrice: symbolConfig.basePrice
        });
        
        generators.set(symbol, generator);
    }
    return generators.get(symbol);
}

module.exports = { ChartGenerator, getGenerator, generators };
