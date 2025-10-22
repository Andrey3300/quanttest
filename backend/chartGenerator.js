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
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Определяем точность ДО любых вычислений
        const precision = this.getPricePrecision(this.basePrice);
        
        // ВАЖНО: openPrice уже округлен (это close предыдущей свечи)
        // НЕ округляем его повторно, чтобы сохранить непрерывность
        const open = openPrice;
        
        const close = this.generateNextPrice(open);
        
        // Генерируем high и low с реалистичной волатильностью внутри свечи
        const intraVolatility = this.volatility * 0.4; // уменьшенная внутри-свечная волатильность для меньших фитилей
        
        // Ограничение максимального размера фитиля относительно тела свечи
        const bodySize = Math.abs(close - open);

        const maxWickMultiplier = bodySize > 0 ? 0.4 : 0.3; // фитиль намного меньше тела (уменьшено с 2.0 до 0.4)

        const maxWickSize = bodySize > 0 ? bodySize * maxWickMultiplier : this.basePrice * 0.002;
        
        // High должен быть выше open и close
        const maxPrice = Math.max(open, close);
        let wickHighSize = Math.abs(this.randomNormal(0, intraVolatility)) * maxPrice;
        wickHighSize = Math.min(wickHighSize, maxWickSize); // ограничиваем размер фитиля
        const high = maxPrice + wickHighSize;
        
        // Low должен быть ниже open и close
        const minPrice = Math.min(open, close);
        let wickLowSize = Math.abs(this.randomNormal(0, intraVolatility)) * minPrice;
        wickLowSize = Math.min(wickLowSize, maxWickSize); // ограничиваем размер фитиля
        const low = minPrice - wickLowSize;
        
        // Генерируем объем (случайный в диапазоне)
        const baseVolume = 10000;
        const volumeVariance = 0.5;
        const volume = Math.floor(baseVolume * (1 + this.randomNormal(0, volumeVariance)));
        
        return {
            time: Math.floor(timestamp / 1000), // время в секундах для lightweight-charts
            open: parseFloat(open.toFixed(precision)), // Округляем для консистентности
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
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Округляем basePrice сразу для точности
        const precision = this.getPricePrecision(this.basePrice);
        let currentPrice = parseFloat(this.basePrice.toFixed(precision));
        
        for (let i = 0; i < totalCandles; i++) {
            const timestamp = startTime + (i * intervalSeconds * 1000);
            const candle = this.generateCandle(timestamp, currentPrice);
            
            // ВАЛИДАЦИЯ: Проверяем что open совпадает с ожидаемой ценой
            if (candle.open !== currentPrice) {
                logger.error('historical', 'Continuity broken in historical data!', {
                    symbol: this.symbol,
                    candleIndex: i,
                    expectedOpen: currentPrice,
                    actualOpen: candle.open,
                    difference: Math.abs(candle.open - currentPrice)
                });
            }
            
            candles.push(candle);
            
            // КРИТИЧЕСКИ ВАЖНО: Используем округленный close для непрерывности
            currentPrice = candle.close; // следующая свеча начинается ТОЧНО с close предыдущей
        }
        
        // ФИНАЛЬНАЯ ВАЛИДАЦИЯ: Проверим непрерывность всех свечей
        let continuityErrors = 0;
        for (let i = 1; i < candles.length; i++) {
            if (candles[i].open !== candles[i-1].close) {
                continuityErrors++;
                if (continuityErrors <= 5) { // Логируем только первые 5 ошибок
                    logger.error('historical', 'Continuity error detected', {
                        symbol: this.symbol,
                        candleIndex: i,
                        previousClose: candles[i-1].close,
                        currentOpen: candles[i].open,
                        difference: Math.abs(candles[i].open - candles[i-1].close)
                    });
                }
            }
        }
        
        if (continuityErrors > 0) {
            logger.error('historical', `Total continuity errors: ${continuityErrors} out of ${candles.length} candles`, {
                symbol: this.symbol,
                errorRate: (continuityErrors / candles.length * 100).toFixed(2) + '%'
            });
        } else {
            logger.info('historical', 'All candles are continuous ✓', {
                symbol: this.symbol,
                totalCandles: candles.length
            });
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
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Синхронизируем currentPrice с close последней свечи
        // Это гарантирует что open новой свечи = close предыдущей (НЕПРЕРЫВНОСТЬ)
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            
            // КРИТИЧЕСКИ ВАЖНО: Берем РЕАЛЬНОЕ значение close из массива свечей
            // а не из currentCandleState, т.к. оно может быть не синхронизировано
            const actualLastClose = lastCandle.close;
            
            // Используем ТОЧНОЕ значение close (уже округленное)
            this.currentPrice = actualLastClose;
            
            logger.debug('candle', 'Continuity check before creating new candle', {
                symbol: this.symbol,
                lastCandleClose: actualLastClose,
                lastCandleTime: lastCandle.time,
                nextCandleOpen: this.currentPrice,
                isContinuous: (actualLastClose === this.currentPrice),
                currentCandleStateClose: this.currentCandleState?.close,
                stateMatchesLast: (this.currentCandleState?.close === actualLastClose)
            });
        }
        
        // Новая свеча ВСЕГДА начинается с ТОЧНОЙ цены закрытия предыдущей свечи
        // КРИТИЧЕСКИ ВАЖНО: openPrice должен быть ТОЧНО равен close последней свечи из массива
        const openPrice = this.currentPrice;
        
        logger.debug('candle', 'Creating new candle with open price', {
            symbol: this.symbol,
            openPrice: openPrice,
            currentPrice: this.currentPrice,
            source: 'lastCandle.close'
        });
        
        // ИСПРАВЛЕНИЕ: Синхронизируем timestamp с РЕАЛЬНЫМ временем, а не с последней свечой
        // Это гарантирует что свечи создаются в правильной временной последовательности
        const currentTimeSeconds = Math.floor(now / 1000);
        const alignedTimestamp = Math.floor(currentTimeSeconds / intervalSeconds) * intervalSeconds;
        
        // Проверяем что новый timestamp больше последней свечи
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            
            // Если выровненный timestamp не больше последней свечи, берем следующий интервал
            if (alignedTimestamp <= lastCandle.time) {
                logger.warn('candle', 'Timestamp collision detected - adjusting', {
                    symbol: this.symbol,
                    alignedTimestamp: alignedTimestamp,
                    lastCandleTime: lastCandle.time,
                    adjustment: 'Using next interval'
                });
                // Используем timestamp последней свечи + интервал
                const timestamp = lastCandle.time + intervalSeconds;
                // КРИТИЧНО: openPrice ДОЛЖЕН быть ТОЧНО равен close предыдущей свечи
                const adjustedOpenPrice = lastCandle.close; // Уже округленное значение!
                const candle = this.generateCandle(timestamp * 1000, adjustedOpenPrice);
                
                // ВАЛИДАЦИЯ: Проверяем непрерывность
                if (candle.open !== adjustedOpenPrice) {
                    logger.error('candle', 'CONTINUITY BROKEN in adjusted candle!', {
                        symbol: this.symbol,
                        expectedOpen: adjustedOpenPrice,
                        actualOpen: candle.open,
                        difference: Math.abs(candle.open - adjustedOpenPrice)
                    });
                }
                
                this.candles.push(candle);
                this.currentPrice = candle.close;
                
                // Обновляем currentCandleState для новой свечи
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
                
                // Ограничиваем размер массива
                const maxCandles = 7 * 24 * 60 * 12;
                if (this.candles.length > maxCandles) {
                    this.candles.shift();
                }
                
                logger.info('candle', 'New candle created (adjusted)', {
                    symbol: this.symbol,
                    time: candle.time,
                    open: candle.open,
                    close: candle.close
                });
                
                return candle;
            }
        }
        
        // КРИТИЧЕСКОЕ УЛУЧШЕНИЕ: Генерируем полноценную свечу с вариацией сразу
        // Убедимся что openPrice = close последней свечи
        const candle = this.generateCandle(alignedTimestamp * 1000, openPrice);
        
        // ВАЛИДАЦИЯ НЕПРЕРЫВНОСТИ: Проверяем что open новой свечи = close предыдущей
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            
            // КРИТИЧЕСКАЯ ПРОВЕРКА: open новой свечи ДОЛЖЕН быть равен close предыдущей
            if (candle.open !== lastCandle.close) {
                logger.error('candle', 'CONTINUITY BROKEN! New candle open != previous candle close', {
                    symbol: this.symbol,
                    previousClose: lastCandle.close,
                    newOpen: candle.open,
                    difference: Math.abs(candle.open - lastCandle.close),
                    previousCandleTime: lastCandle.time,
                    newCandleTime: candle.time,
                    providedOpenPrice: openPrice
                });
                console.error(`❌ CONTINUITY BROKEN for ${this.symbol}! Previous close: ${lastCandle.close}, New open: ${candle.open}, Provided openPrice: ${openPrice}`);
                
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Принудительно устанавливаем правильный open
                candle.open = lastCandle.close;
                
                // Пересчитываем high и low с учетом нового open
                candle.high = Math.max(candle.high, candle.open);
                candle.low = Math.min(candle.low, candle.open);
                
                logger.info('candle', 'Continuity auto-fixed', {
                    symbol: this.symbol,
                    correctedOpen: candle.open,
                    newHigh: candle.high,
                    newLow: candle.low
                });
                console.log(`✓ Continuity auto-fixed for ${this.symbol}: open corrected to ${candle.open}`);
            } else {
                logger.debug('candle', 'Continuity verified ✓', {
                    symbol: this.symbol,
                    price: candle.open,
                    previousClose: lastCandle.close,
                    newOpen: candle.open
                });
            }
        }
        
        this.candles.push(candle);
        this.currentPrice = candle.close;
        
        // Обновляем currentCandleState для новой свечи
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
        
        // Ограничиваем размер массива (храним последние 7 дней)
        const maxCandles = 7 * 24 * 60 * 12; // 7 дней * 5-секундные свечи
        if (this.candles.length > maxCandles) {
            this.candles.shift();
        }
        
        logger.info('candle', 'New candle created', {
            symbol: this.symbol,
            time: candle.time,
            timeISO: new Date(candle.time * 1000).toISOString(),
            open: candle.open,
            close: candle.close,
            // Проверка непрерывности
            previousClose: this.candles.length > 1 ? this.candles[this.candles.length - 2].close : null,
            isContinuous: this.candles.length > 1 ? (candle.open === this.candles[this.candles.length - 2].close) : true
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
            if (Math.random() < 0.01) { // уменьшена вероятность с 0.03 до 0.01 для коротких фитилей
                const wickHigh = this.currentCandleState.close * (1 + Math.abs(this.randomNormal(0, microVolatility * 0.15))); // уменьшен множитель с 0.3 до 0.15
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
            if (Math.random() < 0.01) { // уменьшена вероятность с 0.03 до 0.01 для коротких фитилей
                const wickLow = this.currentCandleState.close * (1 - Math.abs(this.randomNormal(0, microVolatility * 0.15))); // уменьшен множитель с 0.3 до 0.15
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
                // КРИТИЧЕСКОЕ ПРАВИЛО: НЕ ИЗМЕНЯЕМ open при тиках!
                // open должен оставаться неизменным на протяжении всей жизни свечи
                const originalOpen = lastCandle.open;
                
                // Обновляем только изменяемые параметры
                lastCandle.close = this.currentCandleState.close;
                lastCandle.high = this.currentCandleState.high;
                lastCandle.low = this.currentCandleState.low;
                lastCandle.volume = this.currentCandleState.volume;
                
                // ВАЛИДАЦИЯ: Проверяем что open не изменился
                if (lastCandle.open !== originalOpen) {
                    logger.error('candle', 'CRITICAL: open was modified during tick!', {
                        symbol: this.symbol,
                        originalOpen: originalOpen,
                        currentOpen: lastCandle.open,
                        candleTime: lastCandle.time
                    });
                    // Восстанавливаем оригинальный open
                    lastCandle.open = originalOpen;
                }
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
