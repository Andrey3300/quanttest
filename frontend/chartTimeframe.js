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
        
        // 🎯 СКОЛЬЗЯЩЕЕ ОКНО ДИАПАЗОНА: Конфигурация для PocketOption-стиля
        // Параметры для каждого таймфрейма
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
                accumulationPhase: 0.17,   // 17% времени (10 секунд)
                fixedRangePercent: 0.03,   // ±0.03% от basePrice
                minRangePercent: 0.025     // минимум 0.025%
            },
            'M2': { 
                accumulationPhase: 0.17,   // 17% времени (20 секунд)
                fixedRangePercent: 0.04,   // ±0.04%
                minRangePercent: 0.03
            },
            'M3': { 
                accumulationPhase: 0.16,   // 16% времени (30 секунд)
                fixedRangePercent: 0.045,  // ±0.045%
                minRangePercent: 0.035
            },
            'M5': { 
                accumulationPhase: 0.15,   // 15% времени (45 секунд)
                fixedRangePercent: 0.05,   // ±0.05%
                minRangePercent: 0.04
            },
            'M10': { 
                accumulationPhase: 0.20,   // 20% времени (2 минуты)
                fixedRangePercent: 0.06,   // ±0.06%
                minRangePercent: 0.05
            },
            'M15': { 
                accumulationPhase: 0.20,   // 20% времени (3 минуты)
                fixedRangePercent: 0.08,   // ±0.08%
                minRangePercent: 0.06
            },
            'M30': { 
                accumulationPhase: 0.17,   // 17% времени (5 минут)
                fixedRangePercent: 0.10,   // ±0.10%
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
     * 🎯 СКОЛЬЗЯЩЕЕ ОКНО ДИАПАЗОНА:
     * - Фаза накопления (первые 15-20% времени): high/low растут как обычно
     * - Фаза скользящего окна (остальные 80-85%): high/low "едут" вместе с ценой
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
            
            // 🎯 Инициализируем данные фазы для новой свечи
            this.candlePhaseData.set(candleStart, {
                fixedRange: null,  // будет установлен при переходе в фазу скольжения
                phase: 'accumulation'
            });
            
            // Очищаем старые данные (оставляем только последние 10 свечей)
            if (this.candlePhaseData.size > 10) {
                const keys = Array.from(this.candlePhaseData.keys()).sort((a, b) => a - b);
                const toDelete = keys.slice(0, -10);
                toDelete.forEach(key => this.candlePhaseData.delete(key));
            }
            
            return {
                candle: newCandle,
                isNewCandle: true
            };
        } else {
            // Обновляем текущую свечу
            const config = this.timeframeConfig[timeframe];
            const phaseInfo = this.getCandlePhase(tickTime, candleStart, timeframe);
            const phaseData = this.candlePhaseData.get(candleStart) || { fixedRange: null, phase: 'accumulation' };
            
            let newHigh, newLow;
            
            if (phaseInfo.phase === 'accumulation') {
                // 📈 ФАЗА НАКОПЛЕНИЯ: high/low растут как обычно
                newHigh = Math.max(currentCandle.high, tick.price);
                newLow = Math.min(currentCandle.low, tick.price);
                
                phaseData.phase = 'accumulation';
                
                window.errorLogger?.debug('timeframe', '📈 Accumulation phase', {
                    timeframe,
                    progress: (phaseInfo.progress * 100).toFixed(1) + '%',
                    high: newHigh,
                    low: newLow,
                    range: ((newHigh - newLow) / this.getBasePrice(currentCandle) * 100).toFixed(3) + '%'
                });
            } else {
                // 🎯 ФАЗА СКОЛЬЗЯЩЕГО ОКНА
                
                if (phaseData.fixedRange === null) {
                    // Первый тик в фазе скольжения - фиксируем диапазон
                    const accumulatedRange = currentCandle.high - currentCandle.low;
                    const basePrice = this.getBasePrice(currentCandle);
                    const rangePercent = accumulatedRange / basePrice;
                    
                    // Применяем минимальный диапазон если нужно
                    const minRangePercent = config.minRangePercent / 100;
                    const finalRangePercent = Math.max(rangePercent, minRangePercent);
                    
                    phaseData.fixedRange = basePrice * finalRangePercent;
                    phaseData.phase = 'sliding';
                    
                    window.errorLogger?.info('timeframe', '🎯 Sliding window activated', {
                        timeframe,
                        fixedRange: phaseData.fixedRange.toFixed(6),
                        rangePercent: (finalRangePercent * 100).toFixed(3) + '%',
                        basePrice: basePrice.toFixed(6),
                        configuredMax: (config.fixedRangePercent).toFixed(2) + '%'
                    });
                    
                    console.log(`🎯 ${timeframe} sliding window: range=${(finalRangePercent * 100).toFixed(3)}%`);
                }
                
                // 🎯 СКОЛЬЗЯЩЕЕ ОКНО: high/low "едут" вместе с ценой
                const halfRange = phaseData.fixedRange / 2;
                newHigh = tick.price + halfRange;
                newLow = tick.price - halfRange;
                
                // 📏 Финальная корректировка в последние 10% времени
                const duration = this.getTimeframeDuration(timeframe);
                const elapsed = tickTime - candleStart;
                const timeLeft = duration - elapsed;
                const percentLeft = timeLeft / duration;
                
                if (percentLeft <= 0.10) {
                    // В последние 10% времени можем немного расширить/сжать (±20%)
                    const adjustmentFactor = 1 + (Math.random() - 0.5) * 0.2;
                    const adjustedRange = phaseData.fixedRange * adjustmentFactor;
                    const adjustedHalf = adjustedRange / 2;
                    
                    newHigh = tick.price + adjustedHalf;
                    newLow = tick.price - adjustedHalf;
                    
                    window.errorLogger?.debug('timeframe', '📏 Final adjustment phase', {
                        timeframe,
                        percentLeft: (percentLeft * 100).toFixed(1) + '%',
                        adjustmentFactor: adjustmentFactor.toFixed(3)
                    });
                }
                
                window.errorLogger?.debug('timeframe', '🎯 Sliding window active', {
                    timeframe,
                    progress: (phaseInfo.progress * 100).toFixed(1) + '%',
                    close: tick.price.toFixed(6),
                    high: newHigh.toFixed(6),
                    low: newLow.toFixed(6),
                    fixedRange: phaseData.fixedRange.toFixed(6)
                });
            }
            
            // Сохраняем обновленные данные фазы
            this.candlePhaseData.set(candleStart, phaseData);
            
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
