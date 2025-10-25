// 🎯 CHART TIMEFRAME MANAGER (Simplified + Server-Synced)
// Управление таймфреймами с синхронизацией с сервером

class ChartTimeframeManager {
    constructor() {
        // Доступные таймфреймы
        this.timeframes = {
            'S5': 5,
            'S10': 10,
            'S15': 15,
            'S30': 30,
            'M1': 60,
            'M2': 120,
            'M3': 180,
            'M5': 300,
            'M10': 600,
            'M15': 900,
            'M30': 1800
        };
        
        this.currentTimeframe = 'S5';
        this.expirationTimer = null;
        this.onExpirationUpdate = null;
        
        // 🎯 СИНХРОНИЗАЦИЯ С СЕРВЕРОМ
        this.serverCandleStartTime = null; // Время начала текущей свечи (с сервера)
        this.serverTimeframeSeconds = null; // Длительность таймфрейма (с сервера)
        this.serverTimeDelta = 0; // Разница времени клиент-сервер (ms)
        this.isSynced = false; // Флаг синхронизации
    }
    
    /**
     * 🎯 КРИТИЧНО: Синхронизация с сервером
     * Получаем точное время начала свечи и длительность таймфрейма
     */
    syncWithServer(candleStartTime, timeframeSeconds, serverTime) {
        this.serverCandleStartTime = candleStartTime;
        this.serverTimeframeSeconds = timeframeSeconds;
        
        // Вычисляем разницу времени
        const clientTime = Math.floor(Date.now() / 1000);
        this.serverTimeDelta = (serverTime - clientTime) * 1000; // в ms
        
        this.isSynced = true;
        
        console.log(`✅ Timer synced:`, {
            candleStart: new Date(candleStartTime * 1000).toISOString(),
            duration: timeframeSeconds + 's',
            timeDelta: this.serverTimeDelta + 'ms'
        });
        
        // Немедленно обновляем таймер
        this.updateTimerDisplay();
    }
    
    /**
     * Получить текущее серверное время
     */
    getCurrentServerTime() {
        const clientNow = Date.now();
        const serverNow = clientNow + this.serverTimeDelta;
        return Math.floor(serverNow / 1000);
    }
    
    /**
     * НОВОЕ: Получить длительность таймфрейма в секундах (для совместимости с work4)
     */
    getTimeframeDuration(timeframe) {
        return this.timeframes[timeframe] || this.timeframes['S5'];
    }
    
    /**
     * Получить время до закрытия текущей свечи
     */
    getTimeUntilCandleClose() {
        if (!this.isSynced || !this.serverCandleStartTime || !this.serverTimeframeSeconds) {
            // Fallback если нет синхронизации
            return this.getFallbackTimeUntilClose();
        }
        
        const now = this.getCurrentServerTime();
        const candleEndTime = this.serverCandleStartTime + this.serverTimeframeSeconds;
        let remaining = candleEndTime - now;
        
        // Если свеча закрылась - вычисляем следующую
        if (remaining <= 0) {
            // Сколько свечей прошло с момента начала текущей
            const candlesPassed = Math.floor((now - this.serverCandleStartTime) / this.serverTimeframeSeconds);
            const nextCandleStart = this.serverCandleStartTime + ((candlesPassed + 1) * this.serverTimeframeSeconds);
            const nextCandleEnd = nextCandleStart + this.serverTimeframeSeconds;
            remaining = nextCandleEnd - now;
            
            // Обновляем время начала текущей свечи
            this.serverCandleStartTime = nextCandleStart;
        }
        
        return Math.max(0, remaining);
    }
    
    /**
     * Fallback метод (если нет синхронизации)
     */
    getFallbackTimeUntilClose() {
        const now = Math.floor(Date.now() / 1000);
        const duration = this.timeframes[this.currentTimeframe] || 5;
        const candleStart = Math.floor(now / duration) * duration;
        const candleEnd = candleStart + duration;
        return candleEnd - now;
    }
    
    /**
     * Форматировать время (MM:SS)
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }
    
    /**
     * НОВОЕ: Получить читабельное название таймфрейма (для совместимости с work4)
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
     * Обновить отображение таймера
     */
    updateTimerDisplay() {
        const timeLeft = this.getTimeUntilCandleClose();
        const formatted = this.formatTime(timeLeft);
        
        if (this.onExpirationUpdate) {
            this.onExpirationUpdate(formatted, timeLeft, this.currentTimeframe);
        }
    }
    
    /**
     * Установить таймфрейм и запустить таймер
     */
    setTimeframe(timeframe, onUpdate) {
        this.currentTimeframe = timeframe;
        this.onExpirationUpdate = onUpdate;
        
        // Останавливаем старый таймер
        this.stopExpirationTimer();
        
        // Запускаем новый (обновляем каждую секунду)
        this.expirationTimer = setInterval(() => {
            this.updateTimerDisplay();
        }, 1000);
        
        // Немедленно обновляем
        this.updateTimerDisplay();
    }
    
    /**
     * Остановить таймер
     */
    stopExpirationTimer() {
        if (this.expirationTimer) {
            clearInterval(this.expirationTimer);
            this.expirationTimer = null;
        }
    }
    
    /**
     * Очистка
     */
    destroy() {
        this.stopExpirationTimer();
        this.onExpirationUpdate = null;
    }
}

// Глобальный экземпляр
window.chartTimeframeManager = new ChartTimeframeManager();

console.log('⏱️ Chart Timeframe Manager initialized');
