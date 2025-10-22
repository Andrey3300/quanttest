// Chart data generator with Geometric Brownian Motion
// Генератор свечных данных с геометрическим броуновским движением

const logger = require('./errorLogger');

class ChartGenerator {
    constructor(symbol, basePrice, volatility = 0.002, drift = 0.0, meanReversionSpeed = 0.05) {
        this.symbol = symbol;
        this.basePrice = basePrice;
        this.currentPrice = basePrice;
        

        // УЛУЧШЕНИЕ: Увеличиваем волатильность пропорционально для больших чисел

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


    // УЛУЧШЕНИЕ: Определение точности цены на основе базовой цены
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

        const maxWickMultiplier = bodySize > 0 ? 2.0 : 0.5; // фитиль не больше 2x тела

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
        

        // УЛУЧШЕНИЕ: Определяем точность для этого актива

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

        
        const intervalSeconds = 5; // интервал свечи
        
        // Новая свеча ВСЕГДА начинается с цены закрытия предыдущей свечи
        const openPrice = this.currentPrice;
        

        // УЛУЧШЕНИЕ: Рассчитываем timestamp от последней свечи для монотонности
        let timestamp;
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            timestamp = lastCandle.time + intervalSeconds; // строго больше предыдущего
        } else {
            const currentTimeSeconds = Math.floor(now / 1000);
            timestamp = Math.floor(currentTimeSeconds / intervalSeconds) * intervalSeconds;
        }
        
        // КРИТИЧЕСКОЕ УЛУЧШЕНИЕ: Генерируем полноценную свечу с вариацией сразу
        // Это решает проблему одинаковых свечей (open=high=low=close)

     
        const candle = this.generateCandle(timestamp * 1000, openPrice);
        
        this.candles.push(candle);
        
        // Ограничиваем размер массива (храним последние 7 дней)
        const maxCandles = 7 * 24 * 60 * 12; // 7 дней * 5-секундные свечи
        if (this.candles.length > maxCandles) {
            this.candles.shift();
        }
        

        console.log(`New candle created for ${this.symbol} at time ${candle.time}`);

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

        // УЛУЧШЕНИЕ: Настройки для разных символов с уникальными паттернами
        const config = {
            // Currencies
            'USD_MXN': { basePrice: 18.9167, volatility: 0.002, drift: 0.0 },
            'EUR_USD': { basePrice: 1.0850, volatility: 0.0015, drift: 0.0 },
            'GBP_USD': { basePrice: 1.2650, volatility: 0.0018, drift: 0.0 },
            'USD_MXN_OTC': { basePrice: 18.9167, volatility: 0.002, drift: 0.0 },
            'EUR_USD_OTC': { basePrice: 1.0850, volatility: 0.0015, drift: 0.0 },
            'GBP_USD_OTC': { basePrice: 1.2650, volatility: 0.0018, drift: 0.0 },
            'UAH_USD_OTC': { basePrice: 68623.2282, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.01 },
            
            // УЛУЧШЕНИЕ: Криптовалюты - увеличенная волатильность и ослабленный mean reversion
            'BTC': { basePrice: 68500, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.002 },
            'BTC_OTC': { basePrice: 68750, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.002 },
            'ETH_OTC': { basePrice: 3450, volatility: 0.014, drift: 0.0, meanReversionSpeed: 0.002 },

        // Настройки для разных символов с уникальными паттернами
        
            'BNB_OTC': { basePrice: 585, volatility: 0.013, drift: 0.0, meanReversionSpeed: 0.002 },
            'SOL_OTC': { basePrice: 168, volatility: 0.015, drift: 0.0, meanReversionSpeed: 0.002 },
            'ADA_OTC': { basePrice: 0.58, volatility: 0.0036, drift: 0.0, meanReversionSpeed: 0.003 },
            'DOGE_OTC': { basePrice: 0.14, volatility: 0.0040, drift: 0.0, meanReversionSpeed: 0.003 },

            
            // Commodities
            'GOLD_OTC': { basePrice: 2650, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.01 },
            'SILVER_OTC': { basePrice: 31.5, volatility: 0.0022, drift: 0.0 }

        };
        
        const symbolConfig = config[symbol] || { basePrice: 100, volatility: 0.002, drift: 0.0 };
        const generator = new ChartGenerator(
            symbol,
            symbolConfig.basePrice,
            symbolConfig.volatility,
            symbolConfig.drift,

            symbolConfig.meanReversionSpeed
        );
        
        // Сразу генерируем исторические данные
        generator.generateHistoricalData();
        console.log(`Generator created for ${symbol} with ${generator.candles.length} candles`);

        
        generators.set(symbol, generator);
    }
    return generators.get(symbol);
}


// УЛУЧШЕНИЕ: Экспортируем generators для очистки неактивных


module.exports = { ChartGenerator, getGenerator, generators };
