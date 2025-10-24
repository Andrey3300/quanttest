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
        
        this.currentTimeframe = 'S5'; // По умолчанию 5 секунд
        this.expirationTimer = null;
        this.onExpirationUpdate = null; // Callback для обновления UI таймера
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
     * Получить время до закрытия текущей свечи в секундах
     */
    getTimeUntilCandleClose(timeframe = this.currentTimeframe) {
        const now = Math.floor(Date.now() / 1000); // Текущее время в секундах
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
     * Обновить текущую свечу с новым тиком
     * Возвращает { candle, isNewCandle }
     */
    updateCandleWithTick(currentCandle, tick, timeframe) {
        const tickTime = tick.time;
        const candleStart = this.getCandleStartTime(tickTime, timeframe);
        
        // Проверяем, относится ли тик к текущей свече или это новая свеча
        const isNewCandle = !currentCandle || currentCandle.time !== candleStart;
        
        if (isNewCandle) {
            // Создаем новую свечу
            return {
                candle: {
                    time: candleStart,
                    open: tick.price,
                    high: tick.price,
                    low: tick.price,
                    close: tick.price,
                    volume: tick.volume || 0
                },
                isNewCandle: true
            };
        } else {
            // Обновляем текущую свечу
            return {
                candle: {
                    time: currentCandle.time,
                    open: currentCandle.open,
                    high: Math.max(currentCandle.high, tick.price),
                    low: Math.min(currentCandle.low, tick.price),
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
