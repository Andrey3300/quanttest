// Chart Timeframe Manager
// Модуль для управления таймфреймами и группировки данных

class ChartTimeframeManager {
    constructor() {
        // Доступные таймфреймы с их длительностью в секундах
        this.timeframes = {
            'S5': 5,       // 5 секунд
            'S10': 10,     // 10 секунд
            'S15': 15,     // 15 секунд
            'S30': 30,     // 30 секунд
            'M1': 60,      // 1 минута
            'M2': 120,     // 2 минуты
            'M3': 180,     // 3 минуты
            'M5': 300,     // 5 минут
            'M10': 600,    // 10 минут
            'M15': 900,    // 15 минут
            'M30': 1800    // 30 минут
        };
        
        // 🎯 СИНХРОНИЗАЦИЯ С СЕРВЕРОМ: Данные с бэкенда
        this.serverCandleStartTime = null; // время начала свечи с сервера
        this.serverTimeframeSeconds = null; // длительность таймфрейма с сервера
        this.serverTimeDelta = 0; // разница между временем сервера и клиента (ms)
        
        // 🎯 УПРОЩЕННАЯ КОНФИГУРАЦИЯ: 100% accumulation для всех таймфреймов
        // Убрано sliding window для стабильности и предсказуемости
        // Все таймфреймы работают как классические биржевые свечи
        this.timeframeConfig = {
            'S5': { 
                accumulationPhase: 1.0,    // 100% - всегда накопительный режим
                fixedRangePercent: null,   // не используется
                minRangePercent: 0.02      // минимальный диапазон 0.02%
            },
            'S10': { 
                accumulationPhase: 1.0,    // 100% - всегда накопительный режим
                fixedRangePercent: null,
                minRangePercent: 0.02
            },
            'S15': { 
                accumulationPhase: 1.0,    // 100% - всегда накопительный режим
                fixedRangePercent: null,
                minRangePercent: 0.02
            },
            'S30': { 
                accumulationPhase: 1.0,    // 100% - всегда накопительный режим
                fixedRangePercent: null,
                minRangePercent: 0.025
            },
            'M1': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,   // не используется
                minRangePercent: 0.025     // минимум 0.025%
            },
            'M2': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,
                minRangePercent: 0.03
            },
            'M3': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,
                minRangePercent: 0.035
            },
            'M5': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,
                minRangePercent: 0.04
            },
            'M10': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,
                minRangePercent: 0.05
            },
            'M15': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,
                minRangePercent: 0.06
            },
            'M30': { 
                accumulationPhase: 1.0,    // 100% - накопление все время
                fixedRangePercent: null,
                minRangePercent: 0.08
            }
        };
        
        this.currentTimeframe = 'S5'; // По умолчанию 5 секунд
        this.expirationTimer = null;
        this.onExpirationUpdate = null; // Callback для обновления UI таймера
        
        // 🎯 Отслеживание фазы свечи для скользящего окна
        this.candlePhaseData = new Map(); // time -> { fixedRange, phase }
    }
    
    /**
     * Получить длительность таймфрейма в секундах
     */
    getTimeframeDuration(timeframe) {
        return this.timeframes[timeframe] || this.timeframes['S5'];
    }
    
    /**
     * Вычислить начало текущей свечи по глобальному времени
     * Это гарантирует что свечи синхронизированы независимо от момента подключения
     * 
     * Например:
     * - Для M30 (30 минут): свечи начинаются в :00 и :30 каждого часа
     * - Для M10 (10 минут): свечи начинаются в :00, :10, :20, :30, :40, :50 каждого часа
     * - Для S5 (5 секунд): свечи начинаются каждые 5 секунд от начала минуты
     */
    getCandleStartTime(timestamp, timeframe) {
        const duration = this.getTimeframeDuration(timeframe);
        
        // Округляем timestamp вниз до ближайшего начала свечи
        return Math.floor(timestamp / duration) * duration;
    }
    
    /**
     * Вычислить время закрытия текущей свечи
     */
    getCandleEndTime(timestamp, timeframe) {
        const startTime = this.getCandleStartTime(timestamp, timeframe);
        const duration = this.getTimeframeDuration(timeframe);
        return startTime + duration;
    }
    
    /**
     * 🎯 СИНХРОНИЗАЦИЯ: Получение времени с учетом данных сервера
     */
    getCurrentServerTime() {
        // Если есть синхронизация с сервером - используем её
        if (this.serverCandleStartTime !== null && this.serverTimeframeSeconds !== null) {
            const clientNow = Date.now();
            const serverNow = clientNow + this.serverTimeDelta;
            return Math.floor(serverNow / 1000);
        }
        
        // Иначе используем локальное время
        return Math.floor(Date.now() / 1000);
    }
    
    /**
     * 🎯 НОВОЕ: Синхронизация с данными сервера
     */
    syncWithServer(candleStartTime, timeframeSeconds, serverTime) {
        this.serverCandleStartTime = candleStartTime;
        this.serverTimeframeSeconds = timeframeSeconds;
        
        // Вычисляем разницу времени клиент-сервер
        const clientTime = Math.floor(Date.now() / 1000);
        this.serverTimeDelta = (serverTime - clientTime) * 1000; // в миллисекундах
        
        window.errorLogger?.info('timeframe', '✅ Timer synced with server', {
            candleStartTime: candleStartTime,
            timeframeSeconds: timeframeSeconds,
            serverTime: serverTime,
            clientTime: clientTime,
            timeDelta: this.serverTimeDelta + 'ms'
        });
        
        console.log(`🕐 Timer synced: candle starts at ${candleStartTime}, duration ${timeframeSeconds}s, delta ${this.serverTimeDelta}ms`);
    }
    
    /**
     * Получить время до закрытия текущей свечи в секундах
     */
    getTimeUntilCandleClose(timeframe = this.currentTimeframe) {
        // 🎯 КРИТИЧНО: Используем синхронизированное время с сервером
        if (this.serverCandleStartTime !== null && this.serverTimeframeSeconds !== null) {
            const now = this.getCurrentServerTime();
            const candleEndTime = this.serverCandleStartTime + this.serverTimeframeSeconds;
            const remaining = candleEndTime - now;
            
            // Защита от отрицательных значений (свеча уже закрылась, ждем новую)
            if (remaining < 0) {
                // Вычисляем начало следующей свечи
                const nextCandleStart = Math.ceil(now / this.serverTimeframeSeconds) * this.serverTimeframeSeconds;
                const nextCandleEnd = nextCandleStart + this.serverTimeframeSeconds;
                return Math.max(0, nextCandleEnd - now);
            }
            
            return Math.max(0, remaining);
        }
        
        // Fallback к старому методу если нет синхронизации
        const now = Math.floor(Date.now() / 1000);
        const endTime = this.getCandleEndTime(now, timeframe);
        return endTime - now;
    }
    
    /**
     * Форматировать время для отображения (MM:SS)
     */
    formatExpirationTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    /**
     * Получить читабельное название таймфрейма
     */
    getTimeframeLabel(timeframe) {
        const labels = {
            'S5': 'S5 (5 sec)',
            'S10': 'S10 (10 sec)',
            'S15': 'S15 (15 sec)',
            'S30': 'S30 (30 sec)',
            'M1': 'M1 (1 min)',
            'M2': 'M2 (2 min)',
            'M3': 'M3 (3 min)',
            'M5': 'M5 (5 min)',
            'M10': 'M10 (10 min)',
            'M15': 'M15 (15 min)',
            'M30': 'M30 (30 min)'
        };
        return labels[timeframe] || timeframe;
    }
    
    /**
     * Группировать данные в свечи по таймфрейму
     * Принимает массив тиков и возвращает массив свечей
     */
    groupDataByTimeframe(ticks, timeframe) {
        if (!ticks || ticks.length === 0) return [];
        
        const duration = this.getTimeframeDuration(timeframe);
        const candles = {};
        
        // Группируем тики по свечам
        ticks.forEach(tick => {
            const candleStart = this.getCandleStartTime(tick.time, timeframe);
            
            if (!candles[candleStart]) {
                // Создаем новую свечу
                candles[candleStart] = {
                    time: candleStart,
                    open: tick.price,
                    high: tick.price,
                    low: tick.price,
                    close: tick.price,
                    volume: tick.volume || 0
                };
            } else {
                // Обновляем существующую свечу
                const candle = candles[candleStart];
                candle.high = Math.max(candle.high, tick.price);
                candle.low = Math.min(candle.low, tick.price);
                candle.close = tick.price;
                candle.volume += tick.volume || 0;
            }
        });
        
        // Конвертируем объект в массив и сортируем по времени
        return Object.values(candles).sort((a, b) => a.time - b.time);
    }
    
    /**
     * 🎯 Определить текущую фазу свечи (накопление или скользящее окно)
     */
    getCandlePhase(tickTime, candleStart, timeframe) {
        const config = this.timeframeConfig[timeframe];
        if (!config || config.accumulationPhase === 1.0) {
            return { phase: 'accumulation', progress: 0 };
        }
        
        const duration = this.getTimeframeDuration(timeframe);
        const elapsed = tickTime - candleStart;
        const progress = elapsed / duration;
        
        if (progress <= config.accumulationPhase) {
            return { phase: 'accumulation', progress };
        } else {
            return { phase: 'sliding', progress };
        }
    }
    
    /**
     * 🎯 Получить базовую цену актива для расчета диапазона
     * Используем среднюю цену открытия/закрытия как базу
     */
    getBasePrice(candle) {
        return (candle.open + candle.close) / 2;
    }
    
    /**
     * Обновить текущую свечу с новым тиком
     * Возвращает { candle, isNewCandle }
     * 
     * 🎯 УПРОЩЕННАЯ ЛОГИКА: 100% accumulation
     * - high/low растут естественным образом как в классических биржевых свечах
     * - Нет искусственного sliding window - более предсказуемое поведение
     */
    updateCandleWithTick(currentCandle, tick, timeframe) {
        const tickTime = tick.time;
        const candleStart = this.getCandleStartTime(tickTime, timeframe);
        
        // Проверяем, относится ли тик к текущей свече или это новая свеча
        const isNewCandle = !currentCandle || currentCandle.time !== candleStart;
        
        if (isNewCandle) {
            // Создаем новую свечу
            const newCandle = {
                time: candleStart,
                open: tick.price,
                high: tick.price,
                low: tick.price,
                close: tick.price,
                volume: tick.volume || 0
            };
            
            window.errorLogger?.info('timeframe', '🆕 New candle created', {
                timeframe,
                candleStart,
                tickTime,
                price: tick.price
            });
            
            return {
                candle: newCandle,
                isNewCandle: true
            };
        } else {
            // 📈 ОБНОВЛЕНИЕ ТЕКУЩЕЙ СВЕЧИ: классическая логика
            // high/low растут естественным образом
            const newHigh = Math.max(currentCandle.high, tick.price);
            const newLow = Math.min(currentCandle.low, tick.price);
            
            window.errorLogger?.debug('timeframe', '📊 Candle updated', {
                timeframe,
                candleTime: currentCandle.time,
                tickTime: tickTime,
                close: tick.price.toFixed(6),
                high: newHigh.toFixed(6),
                low: newLow.toFixed(6),
                range: ((newHigh - newLow) / this.getBasePrice(currentCandle) * 100).toFixed(3) + '%'
            });
            
            return {
                candle: {
                    time: currentCandle.time,
                    open: currentCandle.open,
                    high: newHigh,
                    low: newLow,
                    close: tick.price,
                    volume: currentCandle.volume + (tick.volume || 0)
                },
                isNewCandle: false
            };
        }
    }
    
    /**
     * Установить таймфрейм и запустить таймер экспирации
     */
    setTimeframe(timeframe, onUpdate) {
        this.currentTimeframe = timeframe;
        this.onExpirationUpdate = onUpdate;
        
        // Останавливаем предыдущий таймер
        if (this.expirationTimer) {
            clearInterval(this.expirationTimer);
        }
        
        // Запускаем новый таймер (обновляем каждую секунду)
        this.expirationTimer = setInterval(() => {
            const timeLeft = this.getTimeUntilCandleClose(timeframe);
            const formatted = this.formatExpirationTime(timeLeft);
            
            if (this.onExpirationUpdate) {
                this.onExpirationUpdate(formatted, timeLeft, timeframe);
            }
        }, 1000);
        
        // Немедленно вызываем один раз для инициализации
        const timeLeft = this.getTimeUntilCandleClose(timeframe);
        const formatted = this.formatExpirationTime(timeLeft);
        if (this.onExpirationUpdate) {
            this.onExpirationUpdate(formatted, timeLeft, timeframe);
        }
    }
    
    /**
     * Остановить таймер экспирации
     */
    stopExpirationTimer() {
        if (this.expirationTimer) {
            clearInterval(this.expirationTimer);
            this.expirationTimer = null;
        }
    }
    
    /**
     * Очистка ресурсов
     */
    destroy() {
        this.stopExpirationTimer();
        this.onExpirationUpdate = null;
    }
}

// Глобальный экземпляр менеджера таймфреймов
window.chartTimeframeManager = new ChartTimeframeManager();

console.log('📅 Chart Timeframe Manager initialized');
