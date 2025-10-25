// 🎯 SIMPLIFIED CHART MANAGER (IQCent/Quotex Style)
// Работает с готовыми свечами с сервера + обновляет последнюю свечу тиками

class ChartManager {
    constructor() {
        this.chart = null;
        this.candleSeries = null;
        this.lineSeries = null;
        this.barSeries = null;
        this.ws = null;
        this.symbol = 'USD_MXN_OTC';
        this.timeframe = localStorage.getItem('chartTimeframe') || 'S5';
        this.chartType = localStorage.getItem('chartType') || 'candles';
        this.isInitialized = false;
        
        // Данные
        this.candles = []; // История свечей для текущего таймфрейма
        this.currentCandle = null; // Текущая формирующаяся свеча
        this.currentPrice = null;
        
        // Линия цены
        this.expirationPriceLine = null;
        
        // WebSocket управление
        this.connectionId = 0;
        this.isDestroyed = false;
        this.reconnectTimer = null;
        
        // 🎯 ИНТЕРПОЛЯЦИЯ ДЛЯ ПЛАВНОСТИ (60fps smooth animation)
        this.interpolationEnabled = true; // Включена интерполяция
        this.targetCandle = null; // Целевое состояние свечи (куда движемся)
        this.currentInterpolatedCandle = null; // Текущее интерполированное состояние
        this.interpolationStartTime = null; // Время начала интерполяции
        this.interpolationDuration = 300; // Длительность интерполяции (ms) - базовая для S5
        this.baseInterpolationDuration = 300; // Базовая длительность
        this.animationFrameId = null; // ID для requestAnimationFrame
        this.lastTickTime = 0; // Время последнего тика
        
        // Оптимизация обновлений линии цены
        this.lastPriceLineUpdate = 0;
    }

    // Инициализация графика
    init() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) {
            console.error('Chart container not found');
            return;
        }

        const parentContainer = chartContainer.parentElement;
        const width = parentContainer ? parentContainer.clientWidth : chartContainer.clientWidth;
        const height = parentContainer ? parentContainer.clientHeight : chartContainer.clientHeight;

        this.chart = LightweightCharts.createChart(chartContainer, {
            width: width,
            height: height,
            layout: {
                background: { color: '#1a1f2e' },
                textColor: '#a0aec0',
            },
            grid: {
                vertLines: { color: '#2d3748' },
                horzLines: { color: '#2d3748' },
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
            rightPriceScale: {
                borderColor: '#2d3748',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
                mode: LightweightCharts.PriceScaleMode.Normal,
                autoScale: true,
            },
            timeScale: {
                borderColor: '#2d3748',
                timeVisible: true,
                secondsVisible: true,
                barSpacing: 8,
                minBarSpacing: 4,
                rightOffset: 50,
            },
        });

        // Создаем серии
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            borderUpColor: '#26d07c',
            borderDownColor: '#ff4757',
            wickUpColor: '#26d07c',
            wickDownColor: '#ff4757',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        this.lineSeries = this.chart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
        });

        this.barSeries = this.chart.addBarSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            priceLineVisible: false,
            lastValueVisible: false,
        });

        // Применяем текущий тип графика
        this.applySeries();

        // Обработка ресайза
        window.addEventListener('resize', () => this.handleResize());

        this.isInitialized = true;
        console.log('📊 Chart initialized');
    }

    // Применить тип графика (показать нужную серию)
    applySeries() {
        if (!this.chart) return;

        // Скрываем все серии
        this.candleSeries.applyOptions({ visible: false });
        this.lineSeries.applyOptions({ visible: false });
        this.barSeries.applyOptions({ visible: false });

        // Показываем нужную
        if (this.chartType === 'line') {
            this.lineSeries.applyOptions({ visible: true });
        } else if (this.chartType === 'bars') {
            this.barSeries.applyOptions({ visible: true });
        } else {
            this.candleSeries.applyOptions({ visible: true });
        }
    }

    // 🎯 НОВОЕ: Загрузка исторических данных с сервера
    async loadHistoricalData(symbol, timeframe = this.timeframe) {
        if (!symbol) symbol = this.symbol;

        try {
            console.log(`📥 Loading ${symbol} ${timeframe} candles...`);

            const response = await fetch(`${API_URL}/api/chart/history?symbol=${symbol}&timeframe=${timeframe}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            this.candles = data.candles || [];
            this.currentPrice = data.currentPrice;

            console.log(`✅ Loaded ${this.candles.length} ${timeframe} candles`);

            // Отображаем данные
            this.renderCandles();

            // Создаем линию цены
            this.updatePriceLine(this.currentPrice);

            // 🎯 СИНХРОНИЗАЦИЯ ТАЙМЕРА: Загружаем текущее состояние
            await this.syncTimerWithServer(symbol, timeframe);

        } catch (error) {
            console.error('Failed to load historical data:', error);
            window.errorLogger?.error('chart', 'Failed to load history', {
                symbol,
                timeframe,
                error: error.message
            });
        }
    }

    // 🎯 НОВОЕ: Синхронизация таймера с сервером
    async syncTimerWithServer(symbol, timeframe) {
        try {
            const response = await fetch(`${API_URL}/api/chart/current-state/${symbol}?timeframe=${timeframe}`);
            
            if (!response.ok) return;

            const state = await response.json();
            
            // Синхронизируем таймер
            if (window.chartTimeframeManager && state.candleStartTime && state.timeframeSeconds) {
                window.chartTimeframeManager.syncWithServer(
                    state.candleStartTime,
                    state.timeframeSeconds,
                    state.serverTime
                );
            }

            // Обновляем текущую свечу
            if (state.currentCandle) {
                this.currentCandle = state.currentCandle;
            }

        } catch (error) {
            console.error('Failed to sync timer:', error);
        }
    }

    // Отрисовка свечей на графике
    renderCandles() {
        if (!this.candleSeries || !this.lineSeries || !this.barSeries) return;

        // Устанавливаем данные для всех серий
        this.candleSeries.setData(this.candles);
        this.lineSeries.setData(this.candles.map(c => ({ time: c.time, value: c.close })));
        this.barSeries.setData(this.candles);

        // Подгоняем видимый диапазон
        if (this.candles.length > 0) {
            const lastCandle = this.candles[this.candles.length - 1];
            this.chart.timeScale().scrollToPosition(5, true);
        }
    }

    // 🎯 НОВОЕ: Подключение к WebSocket (только тики!)
    connectWebSocket(symbol) {
        if (!symbol) symbol = this.symbol;

        // Отключаем старое соединение
        this.disconnectWebSocket();

        this.connectionId++;
        const currentConnectionId = this.connectionId;

        console.log(`🔌 Connecting to WebSocket for ${symbol}...`);

        try {
            const wsUrl = `${API_URL.replace('http', 'ws')}/ws/chart`;
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                if (currentConnectionId !== this.connectionId) {
                    this.ws.close();
                    return;
                }

                console.log(`✅ WebSocket connected for ${symbol}`);

                // Подписываемся на символ (БЕЗ таймфрейма!)
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    symbol: symbol
                }));
            };

            this.ws.onmessage = (event) => {
                if (currentConnectionId !== this.connectionId) return;

                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'tick') {
                        // Обрабатываем тик
                        this.handleTick(data);
                    } else if (data.type === 'newCandle') {
                        // Обрабатываем новую свечу
                        this.handleNewCandle(data);
                    } else if (data.type === 'subscribed') {
                        console.log(`✅ Subscribed to ${data.symbol}`);
                    }
                } catch (error) {
                    console.error('WebSocket message error:', error);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

            this.ws.onclose = () => {
                if (currentConnectionId !== this.connectionId || this.isDestroyed) {
                    return;
                }

                console.log('⚠️ WebSocket disconnected, reconnecting in 3s...');
                
                this.reconnectTimer = setTimeout(() => {
                    if (!this.isDestroyed && currentConnectionId === this.connectionId) {
                        this.connectWebSocket(symbol);
                    }
                }, 3000);
            };

        } catch (error) {
            console.error('WebSocket connection error:', error);
        }
    }

    // 🎯 НОВОЕ: Обработка тика (обновление последней свечи) С ИНТЕРПОЛЯЦИЕЙ
    // 🔒 ВАЖНО: Тики ТОЛЬКО обновляют существующую свечу, НЕ создают новые!
    // Новые свечи создаются ТОЛЬКО сервером через handleNewCandle()
    handleTick(data) {
        const { price, time } = data;

        // Обновляем текущую цену
        this.currentPrice = price;

        // Обновляем линию цены (раз в секунду, не каждый тик!)
        const now = Date.now();
        if (!this.lastPriceLineUpdate || now - this.lastPriceLineUpdate > 1000) {
            this.updatePriceLine(price);
            this.lastPriceLineUpdate = now;
        }

        // 🔒 БЕЗОПАСНОСТЬ: Проверяем что есть последняя свеча для обновления
        const lastCandle = this.candles[this.candles.length - 1];
        
        if (!lastCandle) {
            // Свечи еще нет - ждем сервер (это нормально при первом подключении)
            return;
        }

        // 🎯 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: Обновляем ТОЛЬКО существующую свечу
        const updatedCandle = {
            time: lastCandle.time,
            open: lastCandle.open,
            high: Math.max(lastCandle.high, price),
            low: Math.min(lastCandle.low, price),
            close: price
        };

        // Сохраняем в массиве
        this.candles[this.candles.length - 1] = updatedCandle;
        this.currentCandle = updatedCandle;

        // 🎯 ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ: запускаем анимацию к новому состоянию
        if (this.interpolationEnabled && this.chartType !== 'line') {
            const fromCandle = this.currentInterpolatedCandle || lastCandle;
            this.startInterpolation(fromCandle, updatedCandle);
            this.lastTickTime = now;
        } else {
            // Без интерполяции - обновляем напрямую
            this.updateActiveSeries(updatedCandle, price);
        }
    }

    // 🎯 НОВОЕ: Обработка новой завершенной свечи от СЕРВЕРА
    // 🔒 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ: Только сервер создает свечи!
    handleNewCandle(data) {
        const { candle, timeframe } = data;

        // Проверяем что это свеча нашего текущего таймфрейма
        if (timeframe !== this.timeframe) {
            return;
        }

        // 🛡️ ВАЛИДАЦИЯ ВРЕМЕНИ: Проверяем что время - число
        if (typeof candle.time !== 'number' || isNaN(candle.time)) {
            console.error('❌ Invalid candle time format:', candle.time);
            return;
        }

        console.log(`🕯️ New ${timeframe} candle completed:`, candle);

        // Проверяем последнюю свечу в массиве
        const lastCandle = this.candles[this.candles.length - 1];
        
        if (lastCandle && lastCandle.time === candle.time) {
            // 🔄 Свеча уже есть - обновляем финальные значения от сервера
            this.candles[this.candles.length - 1] = candle;
            
            // Обновляем напрямую (без интерполяции для завершенной свечи)
            this.applyTickDirectly(candle, false);
        } else {
            // ✨ Новая свеча - добавляем в конец
            this.candles.push(candle);
            
            // 🎯 УВЕЛИЧЕН ЛИМИТ: 20000 свечей (было 1000)
            if (this.candles.length > 20000) {
                this.candles.shift();
            }
            
            // Обновляем напрямую (без интерполяции для новой свечи)
            this.applyTickDirectly(candle, true);
        }

        // 🎯 ВАЖНО: Создаем СЛЕДУЮЩУЮ пустую свечу для тиков
        const timeframeSeconds = this.getTimeframeSeconds(timeframe);
        const nextCandleTime = candle.time + timeframeSeconds;
        
        // Проверяем что следующей свечи еще нет
        const lastCandleAfter = this.candles[this.candles.length - 1];
        if (!lastCandleAfter || lastCandleAfter.time < nextCandleTime) {
            const nextCandle = {
                time: nextCandleTime,
                open: candle.close,
                high: candle.close,
                low: candle.close,
                close: candle.close
            };
            
            this.candles.push(nextCandle);
            this.currentCandle = nextCandle;
            this.currentInterpolatedCandle = { ...nextCandle };
            
            // Обновляем график напрямую
            this.applyTickDirectly(nextCandle, true);
            
            console.log(`📊 Created next candle: ${new Date(nextCandleTime * 1000).toISOString()}`);
        }
        
        // Останавливаем интерполяцию при создании новой свечи
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    // Обновление линии текущей цены (оптимизировано!)
    updatePriceLine(price) {
        if (!price || !this.candleSeries) return;

        // Если линии нет - создаем один раз
        if (!this.expirationPriceLine) {
            this.expirationPriceLine = this.candleSeries.createPriceLine({
                price: price,
                color: '#2962FF',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Solid,
                axisLabelVisible: true,
                title: '',
            });
        } else {
            // Обновляем существующую линию (быстро!)
            this.expirationPriceLine.applyOptions({ price: price });
        }
    }

    // 🎯 НОВОЕ: Смена таймфрейма (просто загружаем другой JSON!)
    async setTimeframe(timeframe) {
        if (timeframe === this.timeframe) return;

        console.log(`⏱️ Changing timeframe to ${timeframe}`);

        this.timeframe = timeframe;
        localStorage.setItem('chartTimeframe', timeframe);

        // Загружаем историю нового таймфрейма
        await this.loadHistoricalData(this.symbol, timeframe);

        // WebSocket УЖЕ подключен (тики те же!)
        // Просто обновляем таймер экспирации
        if (this.chartType !== 'line' && window.chartTimeframeManager) {
            window.chartTimeframeManager.setTimeframe(timeframe, (formatted, timeLeft, tf) => {
                this.updateExpirationOverlay(tf, formatted, timeLeft);
            });
        }
    }

    // Установить тип графика
    setChartType(type) {
        if (type === this.chartType) return;

        console.log(`📊 Changing chart type to ${type}`);

        this.chartType = type;
        localStorage.setItem('chartType', type);

        // Применяем новый тип
        this.applySeries();

        // Управление таймером экспирации
        if (type === 'line') {
            // Для линии - таймфрейм не важен
            if (window.chartTimeframeManager) {
                window.chartTimeframeManager.stopExpirationTimer();
            }
            // Очищаем оверлей
            this.updateExpirationOverlay(null, '', 0);
        } else {
            // Для candles/bars - запускаем таймер
            if (window.chartTimeframeManager) {
                window.chartTimeframeManager.setTimeframe(this.timeframe, (formatted, timeLeft, tf) => {
                    this.updateExpirationOverlay(tf, formatted, timeLeft);
                });
            }
        }
    }

    // 🎯 НОВОЕ: Смена актива (загружаем новую историю + переподключаем WebSocket)
    async changeSymbol(newSymbol) {
        if (newSymbol === this.symbol) return;

        console.log(`🔄 Changing symbol to ${newSymbol}`);

        this.symbol = newSymbol;

        // Загружаем новую историю
        await this.loadHistoricalData(newSymbol, this.timeframe);

        // Переподключаем WebSocket к новому символу
        this.connectWebSocket(newSymbol);
    }

    // Обновление оверлея с таймером экспирации
    updateExpirationOverlay(timeframe, formattedTime, timeLeft) {
        const overlayEl = document.getElementById('expiration-overlay');
        if (!overlayEl) return;

        if (!timeframe || timeLeft === 0) {
            overlayEl.style.display = 'none';
            return;
        }

        overlayEl.style.display = 'flex';
        overlayEl.innerHTML = `
            <div class="expiration-badge">
                <div class="expiration-timeframe">${timeframe}</div>
                <div class="expiration-timer">${formattedTime}</div>
            </div>
        `;
    }

    // 🎯 Обновить только активную серию графика (оптимизация!)
    updateActiveSeries(candle, price) {
        if (!candle) return;

        // Обновляем только видимую серию в зависимости от типа графика
        if (this.chartType === 'line') {
            this.lineSeries.update({ time: candle.time, value: price });
        } else if (this.chartType === 'bars') {
            this.barSeries.update(candle);
        } else {
            // candles (по умолчанию)
            this.candleSeries.update(candle);
        }
    }

    // 🎨 ИНТЕРПОЛЯЦИЯ - рассчитать оптимальную длительность на основе таймфрейма
    calculateInterpolationDuration() {
        if (!window.chartTimeframeManager) {
            return this.baseInterpolationDuration;
        }
        
        const timeframeDuration = window.chartTimeframeManager.getTimeframeDuration(this.timeframe);
        
        // Для S5 (5 сек) используем базовую скорость 300ms
        // Для более длинных таймфреймов увеличиваем пропорционально
        const ratio = timeframeDuration / 5; // относительно S5
        const scaledDuration = this.baseInterpolationDuration * Math.pow(ratio, 0.7);
        
        // Ограничиваем максимум до 3000ms
        return Math.min(scaledDuration, 3000);
    }

    // 🎨 ИНТЕРПОЛЯЦИЯ - плавная анимация между тиками (60fps)
    startInterpolation(fromCandle, toCandle) {
        if (!this.interpolationEnabled || !fromCandle || !toCandle) {
            return;
        }
        
        // Останавливаем предыдущую анимацию если есть
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Рассчитываем длительность на основе таймфрейма
        this.interpolationDuration = this.calculateInterpolationDuration();
        
        // Инициализируем начальное состояние
        this.currentInterpolatedCandle = { ...fromCandle };
        this.targetCandle = { ...toCandle };
        this.interpolationStartTime = performance.now();
        
        // Запускаем анимацию
        this.animate();
    }

    // 🎨 ИНТЕРПОЛЯЦИЯ - анимационный цикл (60fps через requestAnimationFrame)
    animate() {
        if (!this.interpolationEnabled || !this.targetCandle || !this.currentInterpolatedCandle) {
            return;
        }
        
        const now = performance.now();
        const elapsed = now - this.interpolationStartTime;
        
        // Рассчитываем прогресс (0.0 - 1.0)
        const progress = Math.min(elapsed / this.interpolationDuration, 1.0);
        
        // Easing function для плавности (easeOutQuad - быстрый старт, плавное завершение)
        const eased = 1 - Math.pow(1 - progress, 2);
        
        // Интерполируем OHLC значения
        const interpolated = {
            time: this.targetCandle.time,
            open: this.currentInterpolatedCandle.open, // open не меняется
            high: this.lerp(this.currentInterpolatedCandle.high, this.targetCandle.high, eased),
            low: this.lerp(this.currentInterpolatedCandle.low, this.targetCandle.low, eased),
            close: this.lerp(this.currentInterpolatedCandle.close, this.targetCandle.close, eased)
        };
        
        // Обновляем график
        try {
            const activeSeries = this.getActiveSeries();
            if (activeSeries && this.chartType !== 'line') {
                activeSeries.update(interpolated);
            }
            
            // Обновляем отображение цены
            this.updatePriceDisplay(interpolated.close);
        } catch (error) {
            console.error('Animation error:', error);
            return;
        }
        
        // Продолжаем анимацию если не завершена
        if (progress < 1.0) {
            this.currentInterpolatedCandle = interpolated;
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        } else {
            // Анимация завершена - устанавливаем финальное состояние
            this.currentInterpolatedCandle = this.targetCandle;
            this.animationFrameId = null;
        }
    }

    // 🎨 ИНТЕРПОЛЯЦИЯ - линейная интерполяция между двумя значениями
    lerp(start, end, t) {
        return start + (end - start) * t;
    }

    // 🚀 Прямое обновление свечи БЕЗ интерполяции (для особых случаев)
    applyTickDirectly(candle, isNewCandle) {
        const activeSeries = this.getActiveSeries();
        if (!activeSeries) {
            return;
        }
        
        try {
            // Обновляем график напрямую
            activeSeries.update(candle);
            
            // Обновляем отображение цены
            this.updatePriceDisplay(candle.close);
            
            // Обновляем интерполированное состояние (для плавного возобновления)
            this.currentInterpolatedCandle = { ...candle };
        } catch (error) {
            console.error('Error applying tick directly:', error);
        }
    }

    // 🎯 Получить длительность таймфрейма в секундах
    getTimeframeSeconds(timeframe) {
        const timeframes = {
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
        return timeframes[timeframe] || 5;
    }

    // Обновление отображения цены
    updatePriceDisplay(price) {
        const priceEl = document.getElementById('current-price');
        if (priceEl) {
            priceEl.textContent = price.toFixed(4);
            
            // Добавляем анимацию изменения цены
            priceEl.classList.remove('price-up', 'price-down');
            
            // Определяем направление изменения
            const prevPrice = parseFloat(priceEl.dataset.prevPrice || price);
            if (price > prevPrice) {
                priceEl.classList.add('price-up');
            } else if (price < prevPrice) {
                priceEl.classList.add('price-down');
            }
            
            priceEl.dataset.prevPrice = price;
        }
        
        // Обновляем текущую цену для линии цены
        this.currentPrice = price;
    }

    // НОВОЕ: Получить активную серию в зависимости от типа графика
    getActiveSeries() {
        switch (this.chartType) {
            case 'line':
                return this.lineSeries;
            case 'bars':
                return this.barSeries;
            case 'candles':
            default:
                return this.candleSeries;
        }
    }

    // Обработка ресайза
    handleResize() {
        if (!this.chart) return;

        const chartContainer = document.getElementById('chart');
        if (!chartContainer) return;

        const parentContainer = chartContainer.parentElement;
        const width = parentContainer ? parentContainer.clientWidth : chartContainer.clientWidth;
        const height = parentContainer ? parentContainer.clientHeight : chartContainer.clientHeight;

        this.chart.resize(width, height);
    }

    // Отключение WebSocket
    disconnectWebSocket() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.connectionId++;
    }

    // Уничтожение
    destroy() {
        this.isDestroyed = true;
        
        // 🎯 Останавливаем интерполяционную анимацию
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        this.disconnectWebSocket();

        if (window.chartTimeframeManager) {
            window.chartTimeframeManager.stopExpirationTimer();
        }

        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }
    }
}

// Создаем глобальный экземпляр
window.chartManager = new ChartManager();

console.log('📊 Chart Manager initialized');
