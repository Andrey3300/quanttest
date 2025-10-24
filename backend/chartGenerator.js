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
        this.drift = drift; // базовый тренд
        this.meanReversionSpeed = meanReversionSpeed; // скорость возврата к средней
        this.maxCandleChange = 0.015; // максимальное изменение за свечу (1.5%)
        this.candles = [];
        
        // 🛡️ ЗАЩИТА ОТ АНОМАЛИЙ: Лимиты для валидации свечей
        this.MAX_CANDLE_RANGE_PERCENT = 0.025; // Максимальный размах свечи (2.5% от basePrice)
        this.MAX_PRICE_JUMP_PERCENT = 0.02; // Максимальный скачок цены между свечами (2%)
        
        // 🌊 СИСТЕМА ВОЛНООБРАЗНОГО ДВИЖЕНИЯ
        this.currentDrift = 0.0; // текущий динамический тренд (изменяется со временем)
        this.trendChangeCounter = 0; // счетчик для смены тренда
        this.trendChangePeriod = this.randomInt(30, 80); // меняем тренд каждые 30-80 свечей
        this.trendStrength = 0.0002; // сила тренда (для создания волн)
    }

    // Генерация случайного числа с нормальным распределением (Box-Muller)
    randomNormal(mean = 0, stdDev = 1) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    // Генерация случайного целого числа в диапазоне [min, max]
    randomInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    // 🌊 Обновление тренда для создания волнообразного движения
    updateTrend() {
        this.trendChangeCounter++;
        
        // Пришло время сменить тренд?
        if (this.trendChangeCounter >= this.trendChangePeriod) {
            // Генерируем новый тренд (может быть восходящим, нисходящим или нейтральным)
            const trendType = Math.random();
            
            if (trendType < 0.35) {
                // Восходящий тренд (35%)
                this.currentDrift = this.trendStrength * this.randomNormal(1.0, 0.3);
            } else if (trendType < 0.70) {
                // Нисходящий тренд (35%)
                this.currentDrift = -this.trendStrength * this.randomNormal(1.0, 0.3);
            } else {
                // Боковое движение (30%)
                this.currentDrift = this.trendStrength * this.randomNormal(0, 0.5);
            }
            
            // Сбрасываем счетчик и генерируем новый период
            this.trendChangeCounter = 0;
            this.trendChangePeriod = this.randomInt(30, 80);
            
            logger.debug('trend', 'Trend changed', {
                symbol: this.symbol,
                newDrift: this.currentDrift,
                nextChangePeriod: this.trendChangePeriod
            });
        } else {
            // Плавное изменение текущего тренда (добавляем небольшой шум)
            this.currentDrift += this.randomNormal(0, this.trendStrength * 0.1);
            // Ограничиваем тренд чтобы он не улетал слишком далеко
            this.currentDrift = Math.max(-this.trendStrength * 2, Math.min(this.trendStrength * 2, this.currentDrift));
        }
    }

    // Генерация следующей цены с учетом mean-reversion и динамического тренда
    generateNextPrice(currentPrice) {
        // 🌊 Обновляем тренд для волнообразного движения
        this.updateTrend();
        
        // Mean reversion: цена стремится вернуться к базовой (ослаблен для более свободного движения)
        // Используем адаптивную силу: слабее когда цена близко, сильнее когда далеко
        const deviation = Math.abs(currentPrice - this.basePrice) / this.basePrice;
        const adaptiveMeanReversion = this.meanReversionSpeed * Math.pow(deviation * 10, 1.5);
        const meanReversionForce = (this.basePrice - currentPrice) * adaptiveMeanReversion;
        
        // Geometric Brownian Motion с динамическим трендом
        const randomShock = this.randomNormal(0, this.volatility);
        const priceChange = this.currentDrift + meanReversionForce + randomShock;
        
        // Ограничиваем максимальное изменение
        const limitedChange = Math.max(-this.maxCandleChange, Math.min(this.maxCandleChange, priceChange));
        
        let newPrice = currentPrice * (1 + limitedChange);
        
        // Убедимся что цена положительная и в разумных пределах
        newPrice = Math.max(newPrice, this.basePrice * 0.9);
        newPrice = Math.min(newPrice, this.basePrice * 1.1);
        
        return newPrice;
    }

    // Определение точности цены на основе базовой цены
    getPricePrecision(price) {
        if (price >= 10000) return 1;     // Например UAH_USD_OTC: 68623.2
        if (price >= 1000) return 2;      // Например BTC: 68750.23
        if (price >= 100) return 3;       // Например ETH: 3450.123
        if (price >= 10) return 4;        // Например USD/MXN: 18.9167
        if (price >= 1) return 4;         // Например EUR/USD: 1.0850
        if (price >= 0.1) return 5;       // Например DOGE: 0.14523
        if (price >= 0.01) return 6;      // Например маленькие пары
        return 8;                          // Для очень маленьких цен
    }

    // 🛡️ ВАЛИДАЦИЯ СВЕЧИ НА АНОМАЛИИ
    validateCandleAnomaly(candle, context = 'unknown') {
        if (!candle) {
            logger.error('validation', 'Candle is null', { symbol: this.symbol, context });
            return { valid: false, reason: 'Null candle' };
        }
        
        // Проверка размаха свечи (high - low)
        const candleRange = candle.high - candle.low;
        const rangePercent = candleRange / this.basePrice;
        
        if (rangePercent > this.MAX_CANDLE_RANGE_PERCENT) {
            logger.error('validation', '🚨 BACKEND ANOMALY: Candle range too large!', {
                symbol: this.symbol,
                context,
                candleRange: candleRange.toFixed(4),
                rangePercent: (rangePercent * 100).toFixed(2) + '%',
                maxAllowed: (this.MAX_CANDLE_RANGE_PERCENT * 100).toFixed(2) + '%',
                basePrice: this.basePrice,
                candle: {
                    time: candle.time,
                    open: candle.open,
                    high: candle.high,
                    low: candle.low,
                    close: candle.close
                }
            });
            console.error(`🚨 ANOMALY: ${this.symbol} - range ${(rangePercent * 100).toFixed(2)}% exceeds limit`);
            
            return { 
                valid: false, 
                reason: 'Range too large',
                rangePercent,
                maxAllowed: this.MAX_CANDLE_RANGE_PERCENT
            };
        }
        
        // Проверка OHLC логики
        if (candle.high < candle.low || 
            candle.high < candle.open || 
            candle.high < candle.close ||
            candle.low > candle.open ||
            candle.low > candle.close) {
            logger.error('validation', 'OHLC logic violation', {
                symbol: this.symbol,
                context,
                candle
            });
            return { valid: false, reason: 'OHLC violation' };
        }
        
        return { valid: true };
    }
    
    // 🛡️ ПРОВЕРКА СКАЧКА ЦЕНЫ между свечами
    validatePriceJump(previousCandle, newCandle) {
        if (!previousCandle || !newCandle) {
            return { valid: true }; // Нечего проверять
        }
        
        const priceDiff = Math.abs(newCandle.open - previousCandle.close);
        const jumpPercent = priceDiff / this.basePrice;
        
        if (jumpPercent > this.MAX_PRICE_JUMP_PERCENT) {
            logger.error('validation', '🚨 BACKEND ANOMALY: Price jump too large!', {
                symbol: this.symbol,
                previousClose: previousCandle.close,
                newOpen: newCandle.open,
                difference: priceDiff.toFixed(4),
                jumpPercent: (jumpPercent * 100).toFixed(2) + '%',
                maxAllowed: (this.MAX_PRICE_JUMP_PERCENT * 100).toFixed(2) + '%',
                basePrice: this.basePrice
            });
            
            return {
                valid: false,
                reason: 'Price jump too large',
                jumpPercent,
                maxAllowed: this.MAX_PRICE_JUMP_PERCENT
            };
        }
        
        return { valid: true };
    }

    // Генерация одной свечи с реалистичным OHLC
    generateCandle(timestamp, openPrice) {
        const close = this.generateNextPrice(openPrice);
        
        // 📏 УМЕНЬШЕННАЯ волатильность внутри свечи для коротких свечей как на бинарных опционах
        const intraVolatility = this.volatility * 0.12; // сильно уменьшена с 0.4 до 0.12 для компактных свечей
        
        // High должен быть выше open и close
        const maxPrice = Math.max(openPrice, close);
        const high = maxPrice * (1 + Math.abs(this.randomNormal(0, intraVolatility)));
        
        // Low должен быть ниже open и close
        const minPrice = Math.min(openPrice, close);
        const low = minPrice * (1 - Math.abs(this.randomNormal(0, intraVolatility)));
        
        // Генерируем объем (случайный в диапазоне)
        const baseVolume = 10000;
        const volumeVariance = 0.5;
        const volume = Math.floor(baseVolume * (1 + this.randomNormal(0, volumeVariance)));
        
        // Определяем точность для этого актива
        const precision = this.getPricePrecision(this.basePrice);
        
        const candle = {
            time: Math.floor(timestamp / 1000), // время в секундах для lightweight-charts
            open: parseFloat(openPrice.toFixed(precision)),
            high: parseFloat(high.toFixed(precision)),
            low: parseFloat(low.toFixed(precision)),
            close: parseFloat(close.toFixed(precision)),
            volume: Math.max(1000, volume)
        };
        
        // 🛡️ ВАЛИДАЦИЯ: Проверяем свечу на аномалии
        const validation = this.validateCandleAnomaly(candle, 'generateCandle');
        if (!validation.valid) {
            // Если свеча аномальная - ограничиваем её размер
            logger.warn('validation', 'Limiting anomalous candle', {
                symbol: this.symbol,
                reason: validation.reason,
                originalCandle: { ...candle }
            });
            
            // Ограничиваем high и low в пределах допустимого диапазона
            const maxAllowedRange = this.basePrice * this.MAX_CANDLE_RANGE_PERCENT;
            const midPrice = (candle.open + candle.close) / 2;
            
            candle.high = Math.min(candle.high, midPrice + maxAllowedRange / 2);
            candle.low = Math.max(candle.low, midPrice - maxAllowedRange / 2);
            
            // Убедимся что high >= open, close и low <= open, close
            candle.high = Math.max(candle.high, candle.open, candle.close);
            candle.low = Math.min(candle.low, candle.open, candle.close);
            
            logger.info('validation', 'Candle limited successfully', {
                symbol: this.symbol,
                limitedCandle: candle
            });
        }
        
        return candle;
    }

    // Генерация исторических данных за 3 дня с шагом 5 секунд
    generateHistoricalData(days = 3, intervalSeconds = 5) {
        const candles = [];
        const now = Date.now();
        
        // ВАЖНО: Выравниваем текущее время по сетке intervalSeconds
        const currentTimeSeconds = Math.floor(now / 1000);
        const alignedCurrentTime = Math.floor(currentTimeSeconds / intervalSeconds) * intervalSeconds;
        const alignedNow = alignedCurrentTime * 1000;
        
        const startTime = alignedNow - (days * 24 * 60 * 60 * 1000); // N дней назад
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
        
        // Генерируем полноценную свечу с вариацией сразу
        // Используем существующий метод generateCandle() вместо плоской свечи
        const candle = this.generateCandle(timestamp * 1000, openPrice);
        
        // 🛡️ ВАЛИДАЦИЯ: Проверяем скачок цены между свечами
        if (this.candles.length > 0) {
            const previousCandle = this.candles[this.candles.length - 1];
            const jumpValidation = this.validatePriceJump(previousCandle, candle);
            
            if (!jumpValidation.valid) {
                // Корректируем open новой свечи чтобы убрать скачок
                logger.warn('validation', 'Correcting price jump', {
                    symbol: this.symbol,
                    originalOpen: candle.open,
                    previousClose: previousCandle.close
                });
                
                candle.open = previousCandle.close;
                
                // Пересчитываем high и low с учетом нового open
                candle.high = Math.max(candle.high, candle.open, candle.close);
                candle.low = Math.min(candle.low, candle.open, candle.close);
                
                logger.info('validation', 'Price jump corrected', {
                    symbol: this.symbol,
                    correctedOpen: candle.open
                });
            }
        }
        
        this.candles.push(candle);
        
        // СКОЛЬЗЯЩЕЕ ОКНО: Ограничиваем размер массива (храним последние 3 дня)
        // 3 дня = 51,840 свечей. При достижении 52,000 -> обрезаем до 51,500
        const TRIM_THRESHOLD = 52000;
        const KEEP_CANDLES = 51500;
        
        if (this.candles.length > TRIM_THRESHOLD) {
            const toRemove = this.candles.length - KEEP_CANDLES;
            const beforeTrim = this.candles[this.candles.length - 1]; // последняя свеча до обрезки
            this.candles = this.candles.slice(toRemove);
            const afterTrim = this.candles[this.candles.length - 1]; // последняя свеча после обрезки
            
            // 🔧 КРИТИЧНО: Проверяем что обрезка не нарушила непрерывность
            if (beforeTrim.time !== afterTrim.time) {
                logger.error('memory', 'TRIM CHANGED LAST CANDLE!', {
                    symbol: this.symbol,
                    beforeTime: beforeTrim.time,
                    afterTime: afterTrim.time,
                    beforeClose: beforeTrim.close,
                    afterClose: afterTrim.close
                });
            }
            
            // Обновляем currentPrice на основе последней свечи после обрезки
            this.currentPrice = afterTrim.close;
            
            logger.info('memory', 'Candle memory trimmed (sliding window)', {
                symbol: this.symbol,
                removed: toRemove,
                remaining: this.candles.length,
                threshold: TRIM_THRESHOLD,
                keepCandles: KEEP_CANDLES,
                lastCandleClose: afterTrim.close,
                currentPrice: this.currentPrice
            });
        }
        
        // 🔧 КРИТИЧЕСКИ ВАЖНО: Обновляем currentPrice для следующей свечи
        // Это гарантирует что следующая свеча начнется с close текущей
        this.currentPrice = candle.close;
        
        logger.debug('candle', 'currentPrice updated after new candle', {
            symbol: this.symbol,
            newCurrentPrice: this.currentPrice,
            candleClose: candle.close,
            candleOpen: candle.open
        });
        
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
        
        // Mean reversion для тиков - используем адаптивную силу
        const deviation = Math.abs(this.currentCandleState.targetClose - this.basePrice) / this.basePrice;
        const adaptiveMeanReversion = this.meanReversionSpeed * Math.pow(deviation * 10, 1.5);
        const meanReversionForce = (this.basePrice - this.currentCandleState.targetClose) * adaptiveMeanReversion;
        const priceChange = this.randomNormal(0, microVolatility) + meanReversionForce + this.currentDrift * 0.5;
        
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
            // 📏 Редкие и короткие фитили для компактного вида как на бинарных опционах
            if (Math.random() < 0.015) { // уменьшено с 4% до 1.5%
                const wickHigh = this.currentCandleState.close * (1 + Math.abs(this.randomNormal(0, microVolatility * 0.08))); // уменьшено с 0.2 до 0.08
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
            // 📏 Редкие и короткие фитили для компактного вида как на бинарных опционах
            if (Math.random() < 0.015) { // уменьшено с 4% до 1.5%
                const wickLow = this.currentCandleState.close * (1 - Math.abs(this.randomNormal(0, microVolatility * 0.08))); // уменьшено с 0.2 до 0.08
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

    // ПЕРСИСТЕНТНОСТЬ: Сохранение последних 1000 свечей на диск
    toJSON() {
        // Сохраняем только последние 1000 свечей для экономии места
        const SAVE_LAST_N = 1000;
        const candlesToSave = this.candles.slice(-SAVE_LAST_N);
        
        return {
            symbol: this.symbol,
            basePrice: this.basePrice,
            currentPrice: this.currentPrice,
            volatility: this.volatility,
            drift: this.drift,
            meanReversionSpeed: this.meanReversionSpeed,
            candles: candlesToSave,
            currentCandleState: this.currentCandleState,
            // 🌊 Сохраняем состояние волнообразного движения для непрерывности
            currentDrift: this.currentDrift,
            trendChangeCounter: this.trendChangeCounter,
            trendChangePeriod: this.trendChangePeriod,
            trendStrength: this.trendStrength,
            savedAt: Date.now(),
            savedCandleCount: candlesToSave.length
        };
    }

    // ПЕРСИСТЕНТНОСТЬ: Восстановление из сохраненных данных
    fromJSON(data) {
        if (!data || !data.candles || data.candles.length === 0) {
            logger.warn('persistence', 'No valid data to restore', { symbol: this.symbol });
            return false;
        }
        
        // Восстанавливаем состояние
        this.currentPrice = data.currentPrice || this.basePrice;
        this.currentCandleState = data.currentCandleState || null;
        
        // 🌊 Восстанавливаем состояние волнообразного движения
        if (typeof data.currentDrift === 'number') {
            this.currentDrift = data.currentDrift;
        }
        if (typeof data.trendChangeCounter === 'number') {
            this.trendChangeCounter = data.trendChangeCounter;
        }
        if (typeof data.trendChangePeriod === 'number') {
            this.trendChangePeriod = data.trendChangePeriod;
        }
        if (typeof data.trendStrength === 'number') {
            this.trendStrength = data.trendStrength;
        }
        
        logger.info('persistence', 'Trend state restored', {
            symbol: this.symbol,
            currentDrift: this.currentDrift,
            trendChangeCounter: this.trendChangeCounter,
            trendChangePeriod: this.trendChangePeriod
        });
        
        // Генерируем 3 дня истории
        this.generateHistoricalData();
        
        // Теперь объединяем с сохраненными свечами
        const savedCandles = data.candles;
        const lastSavedCandle = savedCandles[savedCandles.length - 1];
        const lastGeneratedCandle = this.candles[this.candles.length - 1];
        
        // Проверяем есть ли разрыв во времени
        const timeDiff = lastSavedCandle.time - lastGeneratedCandle.time;
        
        if (timeDiff > 0) {
            // Сохраненные свечи новее - добавляем их
            logger.info('persistence', 'Merging saved candles with generated history', {
                symbol: this.symbol,
                generatedCount: this.candles.length,
                savedCount: savedCandles.length,
                timeDiff: timeDiff,
                lastGeneratedTime: lastGeneratedCandle.time,
                lastSavedTime: lastSavedCandle.time
            });
            
            // Добавляем только свечи которые новее чем сгенерированные
            const newCandles = savedCandles.filter(c => c.time > lastGeneratedCandle.time);
            this.candles.push(...newCandles);
            
            // Обновляем currentPrice из последней свечи
            if (newCandles.length > 0) {
                this.currentPrice = newCandles[newCandles.length - 1].close;
            }
        } else {
            logger.info('persistence', 'Saved data is older than generated, using generated', {
                symbol: this.symbol,
                timeDiff: timeDiff
            });
        }
        
        logger.info('persistence', 'Data restored successfully', {
            symbol: this.symbol,
            totalCandles: this.candles.length,
            currentPrice: this.currentPrice
        });
        
        return true;
    }
}

// Singleton инстансы для разных символов
const generators = new Map();

// Конфигурация всех символов
const SYMBOL_CONFIG = {
            // 🌊 Currencies - ослабленный mean reversion для волнообразного движения
            'USD_MXN_OTC': { basePrice: 18.9167, volatility: 0.002, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_USD_OTC': { basePrice: 1.0850, volatility: 0.0015, drift: 0.0, meanReversionSpeed: 0.008 },
            'GBP_USD_OTC': { basePrice: 1.2650, volatility: 0.0018, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_CAD': { basePrice: 1.3550, volatility: 0.0016, drift: 0.0, meanReversionSpeed: 0.008 },
            'AUD_CAD_OTC': { basePrice: 0.8820, volatility: 0.0019, drift: 0.0, meanReversionSpeed: 0.008 },
            'BHD_CNY_OTC': { basePrice: 18.6500, volatility: 0.0017, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_CHF_OTC': { basePrice: 0.9420, volatility: 0.0014, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_CHF_OTC2': { basePrice: 0.9425, volatility: 0.0014, drift: 0.0, meanReversionSpeed: 0.008 },
            'KES_USD_OTC': { basePrice: 0.0077, volatility: 0.0020, drift: 0.0, meanReversionSpeed: 0.008 },
            'TND_USD_OTC': { basePrice: 0.3190, volatility: 0.0018, drift: 0.0, meanReversionSpeed: 0.008 },
            'UAH_USD_OTC': { basePrice: 68623.2282, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.006 },
            'USD_BDT_OTC': { basePrice: 0.0092, volatility: 0.0019, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_CNH_OTC': { basePrice: 7.2450, volatility: 0.0016, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_IDR_OTC': { basePrice: 15850, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.006 },
            'USD_MYR_OTC': { basePrice: 4.4650, volatility: 0.0017, drift: 0.0, meanReversionSpeed: 0.008 },
            'AUD_NZD_OTC': { basePrice: 1.0920, volatility: 0.0016, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_PHP_OTC': { basePrice: 0.0178, volatility: 0.0019, drift: 0.0, meanReversionSpeed: 0.008 },
            'ZAR_USD_OTC': { basePrice: 0.0548, volatility: 0.0021, drift: 0.0, meanReversionSpeed: 0.008 },
            'YER_USD_OTC': { basePrice: 0.0040, volatility: 0.0022, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_BRL_OTC': { basePrice: 5.6250, volatility: 0.0019, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_EGP_OTC': { basePrice: 0.0204, volatility: 0.0023, drift: 0.0, meanReversionSpeed: 0.008 },
            'OMR_CNY_OTC': { basePrice: 18.3500, volatility: 0.0016, drift: 0.0, meanReversionSpeed: 0.008 },
            'AUD_JPY_OTC': { basePrice: 96.850, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.006 },
            'EUR_GBP_OTC': { basePrice: 0.8580, volatility: 0.0015, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_HUF_OTC': { basePrice: 393.50, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.006 },
            'EUR_TRY_OTC': { basePrice: 37.250, volatility: 0.0024, drift: 0.0, meanReversionSpeed: 0.008 },
            'USD_JPY_OTC': { basePrice: 149.850, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.006 },
            'USD_CHF_OTC': { basePrice: 0.8690, volatility: 0.0015, drift: 0.0, meanReversionSpeed: 0.008 },
            'AUD_CHF': { basePrice: 0.5820, volatility: 0.0016, drift: 0.0, meanReversionSpeed: 0.008 },
            'CHF_JPY': { basePrice: 172.450, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.006 },
            'EUR_AUD': { basePrice: 1.6350, volatility: 0.0017, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_CHF': { basePrice: 0.9435, volatility: 0.0014, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_GBP': { basePrice: 0.8575, volatility: 0.0015, drift: 0.0, meanReversionSpeed: 0.008 },
            'EUR_JPY': { basePrice: 162.650, volatility: 0.007, drift: 0.0, meanReversionSpeed: 0.006 },
            'EUR_USD': { basePrice: 1.0855, volatility: 0.0016, drift: 0.0, meanReversionSpeed: 0.008 },
            'GBP_CAD': { basePrice: 1.7150, volatility: 0.0018, drift: 0.0, meanReversionSpeed: 0.008 },
            'GBP_CHF': { basePrice: 1.1020, volatility: 0.0017, drift: 0.0, meanReversionSpeed: 0.008 },
            'GBP_USD': { basePrice: 1.2655, volatility: 0.0017, drift: 0.0, meanReversionSpeed: 0.008 },
            
            // Cryptocurrencies - еще слабее mean reversion для более свободного движения с волнами
            'BTC': { basePrice: 68500, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.001 },
            'BTC_OTC': { basePrice: 68750, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.001 },
            'BTC_ETF_OTC': { basePrice: 68600, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.001 },
            'ETH_OTC': { basePrice: 3450, volatility: 0.014, drift: 0.0, meanReversionSpeed: 0.001 },
            'TEST_TEST1': { basePrice: 125.50, volatility: 0.0035, drift: 0.0, meanReversionSpeed: 0.002 },
            'BNB_OTC': { basePrice: 585, volatility: 0.013, drift: 0.0, meanReversionSpeed: 0.001 },
            'SOL_OTC': { basePrice: 168, volatility: 0.015, drift: 0.0, meanReversionSpeed: 0.001 },
            'ADA_OTC': { basePrice: 0.58, volatility: 0.0036, drift: 0.0, meanReversionSpeed: 0.002 },
            'DOGE_OTC': { basePrice: 0.14, volatility: 0.0040, drift: 0.0, meanReversionSpeed: 0.002 },
            'DOT_OTC': { basePrice: 7.2, volatility: 0.0034, drift: 0.0, meanReversionSpeed: 0.002 },
            'MATIC_OTC': { basePrice: 0.78, volatility: 0.0037, drift: 0.0, meanReversionSpeed: 0.002 },
            'LTC_OTC': { basePrice: 85, volatility: 0.013, drift: 0.0, meanReversionSpeed: 0.001 },
            'LINK_OTC': { basePrice: 15.8, volatility: 0.0034, drift: 0.0, meanReversionSpeed: 0.002 },
            'AVAX_OTC': { basePrice: 38.5, volatility: 0.0039, drift: 0.0, meanReversionSpeed: 0.002 },
            'TRX_OTC': { basePrice: 0.168, volatility: 0.0032, drift: 0.0, meanReversionSpeed: 0.002 },
            'TON_OTC': { basePrice: 5.6, volatility: 0.0036, drift: 0.0, meanReversionSpeed: 0.002 },
            
            // Commodities - ослабленный mean reversion для волнообразного движения
            'GOLD_OTC': { basePrice: 2650, volatility: 0.008, drift: 0.0, meanReversionSpeed: 0.006 },
            'SILVER_OTC': { basePrice: 31.5, volatility: 0.0022, drift: 0.0, meanReversionSpeed: 0.008 },
            'BRENT_OTC': { basePrice: 87.5, volatility: 0.010, drift: 0.0, meanReversionSpeed: 0.006 },
            'WTI_OTC': { basePrice: 83.8, volatility: 0.010, drift: 0.0, meanReversionSpeed: 0.006 },
            'NATGAS_OTC': { basePrice: 3.2, volatility: 0.0028, drift: 0.0, meanReversionSpeed: 0.008 },
            'PALLADIUM_OTC': { basePrice: 1050, volatility: 0.009, drift: 0.0, meanReversionSpeed: 0.006 },
            'PLATINUM_OTC': { basePrice: 980, volatility: 0.009, drift: 0.0, meanReversionSpeed: 0.006 }
};

function getGenerator(symbol) {
    if (!generators.has(symbol)) {
        const symbolConfig = SYMBOL_CONFIG[symbol] || { basePrice: 100, volatility: 0.002, drift: 0.0 };
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

// ПЕРСИСТЕНТНОСТЬ: Сохранение всех генераторов на диск
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

// Создаем директорию для данных если её нет
function ensureDataDir() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info('persistence', 'Data directory created', { path: DATA_DIR });
    }
}

// Сохранение одного генератора
function saveGenerator(symbol) {
    try {
        ensureDataDir();
        
        const generator = generators.get(symbol);
        if (!generator) {
            logger.warn('persistence', 'Generator not found for saving', { symbol });
            return false;
        }
        
        const data = generator.toJSON();
        const filename = path.join(DATA_DIR, `${symbol}.json`);
        
        fs.writeFileSync(filename, JSON.stringify(data, null, 2), 'utf8');
        
        logger.debug('persistence', 'Generator saved', { 
            symbol, 
            filename,
            candleCount: data.savedCandleCount 
        });
        
        return true;
    } catch (error) {
        logger.error('persistence', 'Failed to save generator', { 
            symbol, 
            error: error.message 
        });
        return false;
    }
}

// Загрузка одного генератора
function loadGenerator(symbol) {
    try {
        const filename = path.join(DATA_DIR, `${symbol}.json`);
        
        if (!fs.existsSync(filename)) {
            logger.debug('persistence', 'No saved data found', { symbol, filename });
            return null;
        }
        
        const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
        
        logger.info('persistence', 'Generator data loaded from file', { 
            symbol,
            candleCount: data.savedCandleCount,
            savedAt: new Date(data.savedAt).toISOString()
        });
        
        return data;
    } catch (error) {
        logger.error('persistence', 'Failed to load generator', { 
            symbol, 
            error: error.message 
        });
        return null;
    }
}

// Сохранение всех генераторов
function saveAllGenerators() {
    logger.info('persistence', 'Saving all generators...', { count: generators.size });
    
    let saved = 0;
    let failed = 0;
    
    generators.forEach((generator, symbol) => {
        if (saveGenerator(symbol)) {
            saved++;
        } else {
            failed++;
        }
    });
    
    logger.info('persistence', 'All generators saved', { 
        total: generators.size,
        saved,
        failed
    });
    
    return { saved, failed };
}

// Инициализация всех генераторов (вызывается при старте сервера)
function initializeAllGenerators() {
    logger.info('initialization', 'Initializing all generators for 24/7 operation...');
    
    const symbols = Object.keys(SYMBOL_CONFIG);
    let initialized = 0;
    let restored = 0;
    
    symbols.forEach(symbol => {
        // Пытаемся загрузить сохраненные данные
        const savedData = loadGenerator(symbol);
        
        // Получаем генератор (создаст новый если нет)
        const generator = getGenerator(symbol);
        
        // Если есть сохраненные данные - восстанавливаем
        if (savedData && generator.fromJSON(savedData)) {
            restored++;
        }
        
        initialized++;
    });
    
    logger.info('initialization', 'All generators initialized', {
        total: symbols.length,
        initialized,
        restored,
        fresh: initialized - restored
    });
    
    // Оставляем информационное сообщение для старта сервера
    console.log(`✅ Initialized ${initialized} chart generators (${restored} restored, ${initialized - restored} fresh)`);
    
    return { initialized, restored };
}

module.exports = { 
    ChartGenerator, 
    getGenerator, 
    generators,
    saveAllGenerators,
    initializeAllGenerators,
    SYMBOL_CONFIG
};
