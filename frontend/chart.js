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
        
        // 🎯 PAGINATION: Lazy loading состояние
        this.hasMore = true; // Есть ли еще данные для загрузки
        this.isLoadingMore = false; // Идет ли загрузка дополнительных данных
        this.LOAD_MORE_CANDLES = 100; // Количество свечей при подгрузке
        
        // Линия цены
        this.expirationPriceLine = null;
        
        // 🎯 АДАПТИВНОЕ КОЛИЧЕСТВО СВЕЧЕЙ: Уменьшено до 50-100 для лучшей визуализации
        this.INITIAL_CANDLES_BY_TIMEFRAME = {
            'S5': 100,   // 5 сек × 100 = ~8 минут
            'S10': 90,   // 10 сек × 90 = ~15 минут
            'S15': 80,   // 15 сек × 80 = ~20 минут
            'S30': 70,   // 30 сек × 70 = ~35 минут
            'M1': 60,    // 1 мин × 60 = ~1 час
            'M2': 60,    // 2 мин × 60 = ~2 часа
            'M3': 60,    // 3 мин × 60 = ~3 часа
            'M5': 60,    // 5 мин × 60 = ~5 часов
            'M10': 50,   // 10 мин × 50 = ~8 часов
            'M15': 50,   // 15 мин × 50 = ~12 часов
            'M30': 50    // 30 мин × 50 = ~25 часов
        };
        
        // WebSocket управление
        this.connectionId = 0;
        this.isDestroyed = false;
        this.reconnectTimer = null;
        this.isLoading = false; // 🔒 Флаг загрузки (игнорируем тики во время загрузки)
        
        // 🎯 ИНТЕРПОЛЯЦИЯ ДЛЯ ПЛАВНОСТИ (60fps smooth animation)
        this.interpolationEnabled = true; // Включена интерполяция
        this.targetCandle = null; // Целевое состояние свечи (куда движемся)
        this.currentInterpolatedCandle = null; // Текущее интерполированное состояние
        this.interpolationStartTime = null; // Время начала интерполяции
        this.interpolationDuration = 400; // Длительность интерполяции (ms) - оптимизировано под тики 500ms
        this.baseInterpolationDuration = 400; // Базовая длительность для плавности (400ms для комфортной анимации)
        this.animationFrameId = null; // ID для requestAnimationFrame
        this.lastTickTime = 0; // Время последнего тика
    }
    
    // 🎯 Получить количество свечей для загрузки в зависимости от таймфрейма
    getInitialCandlesCount(timeframe) {
        return this.INITIAL_CANDLES_BY_TIMEFRAME[timeframe] || 100;
    }

    // Инициализация графика
    async init() {
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
                    top: 0.25,    // 🔥 Увеличено с 0.1 до 0.25 для лучшей видимости свечей
                    bottom: 0.25, // 🔥 Увеличено с 0.1 до 0.25
                },
                mode: LightweightCharts.PriceScaleMode.Normal,
                autoScale: true,
            },
            timeScale: {
                borderColor: '#2d3748',
                timeVisible: true,
                secondsVisible: true,
                barSpacing: 18,       // 🔥 Увеличено с 8 до 18 для более читаемых свечей
                minBarSpacing: 4,
                rightOffset: 50,
            },
            // 🎯 ФОРМАТИРОВАНИЕ ЦЕНЫ: Показываем точные значения (18.5000 вместо 18.75)
            localization: {
                priceFormatter: (price) => {
                    // Автоматически определяем количество знаков в зависимости от цены
                    if (price >= 10000) return price.toFixed(1);      // BTC: 68750.2
                    if (price >= 1000) return price.toFixed(2);       // Gold: 2650.50
                    if (price >= 100) return price.toFixed(3);        // USD/JPY: 149.850
                    if (price >= 10) return price.toFixed(4);         // USD/MXN: 18.5000
                    if (price >= 1) return price.toFixed(4);          // EUR/USD: 1.0850
                    if (price >= 0.1) return price.toFixed(5);        // DOGE: 0.14523
                    if (price >= 0.01) return price.toFixed(6);       // Small pairs
                    return price.toFixed(8);                           // Very small
                }
            }
        });

        // Функция для определения точности отображения цены
        const getPriceFormat = (price) => {
            if (!price) price = 100; // default
            if (price >= 10000) return { type: 'price', precision: 1, minMove: 0.1 };
            if (price >= 1000) return { type: 'price', precision: 2, minMove: 0.01 };
            if (price >= 100) return { type: 'price', precision: 3, minMove: 0.001 };
            if (price >= 10) return { type: 'price', precision: 4, minMove: 0.0001 };
            if (price >= 1) return { type: 'price', precision: 4, minMove: 0.0001 };
            if (price >= 0.1) return { type: 'price', precision: 5, minMove: 0.00001 };
            if (price >= 0.01) return { type: 'price', precision: 6, minMove: 0.000001 };
            return { type: 'price', precision: 8, minMove: 0.00000001 };
        };

        // Создаем серии с точным форматированием
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            borderUpColor: '#26d07c',
            borderDownColor: '#ff4757',
            wickUpColor: '#26d07c',
            wickDownColor: '#ff4757',
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: getPriceFormat(100) // будет обновлен после загрузки данных
        });

        this.lineSeries = this.chart.addLineSeries({
            color: '#2962FF',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: getPriceFormat(100) // будет обновлен после загрузки данных
        });

        this.barSeries = this.chart.addBarSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            priceLineVisible: false,
            lastValueVisible: false,
            priceFormat: getPriceFormat(100) // будет обновлен после загрузки данных
        });

        // Применяем текущий тип графика
        this.applySeries();

        // Обработка ресайза
        window.addEventListener('resize', () => this.handleResize());

        // 🎯 PAGINATION: Отслеживание скролла для lazy loading
        this.setupScrollListener();

        console.log('📊 Chart initialized, loading data...');

        // 🎯 ЗАГРУЖАЕМ НАЧАЛЬНЫЕ ДАННЫЕ
        await this.loadHistoricalData(this.symbol, this.timeframe);

        // 🎯 ПОДКЛЮЧАЕМ WEBSOCKET ДЛЯ ТИКОВ
        this.connectWebSocket(this.symbol);

        this.isInitialized = true;
        console.log('✅ Chart fully initialized and connected');
    }

    // Получить формат цены на основе значения
    getPriceFormatForValue(price) {
        if (!price) price = 100;
        if (price >= 10000) return { type: 'price', precision: 1, minMove: 0.1 };
        if (price >= 1000) return { type: 'price', precision: 2, minMove: 0.01 };
        if (price >= 100) return { type: 'price', precision: 3, minMove: 0.001 };
        if (price >= 10) return { type: 'price', precision: 4, minMove: 0.0001 };
        if (price >= 1) return { type: 'price', precision: 4, minMove: 0.0001 };
        if (price >= 0.1) return { type: 'price', precision: 5, minMove: 0.00001 };
        if (price >= 0.01) return { type: 'price', precision: 6, minMove: 0.000001 };
        return { type: 'price', precision: 8, minMove: 0.00000001 };
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

    // 🎯 НОВОЕ: Загрузка исторических данных с сервера (с PAGINATION!)
    async loadHistoricalData(symbol, timeframe = this.timeframe) {
        if (!symbol) symbol = this.symbol;

        try {
            // 🎯 АДАПТИВНОЕ КОЛИЧЕСТВО: Разное для каждого таймфрейма
            const candlesCount = this.getInitialCandlesCount(timeframe);
            console.log(`📥 Loading ${symbol} ${timeframe} candles (first ${candlesCount})...`);

            // 🎯 PAGINATION: Загружаем адаптивное количество свечей
            const response = await fetch(`${API_URL}/api/chart/history?symbol=${symbol}&timeframe=${timeframe}&limit=${candlesCount}`);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            
            this.candles = data.candles || [];
            this.currentPrice = data.currentPrice;
            this.hasMore = data.hasMore || false; // Есть ли еще данные

            console.log(`✅ Loaded ${this.candles.length} ${timeframe} candles (hasMore: ${this.hasMore})`);

            // 🎯 Обновляем priceFormat на основе текущей цены
            if (this.currentPrice) {
                const priceFormat = this.getPriceFormatForValue(this.currentPrice);
                this.candleSeries.applyOptions({ priceFormat });
                this.lineSeries.applyOptions({ priceFormat });
                this.barSeries.applyOptions({ priceFormat });
            }

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

    // 🎯 PAGINATION: Подгрузка дополнительных свечей (lazy loading)
    async loadMoreCandles() {
        // Проверяем что не идет уже загрузка и есть еще данные
        if (this.isLoadingMore || !this.hasMore || this.candles.length === 0) {
            return;
        }

        try {
            this.isLoadingMore = true;
            
            // Получаем время самой старой свечи
            const oldestTime = this.candles[0].time;
            
            console.log(`📥 Loading more candles before ${new Date(oldestTime * 1000).toISOString()}...`);

            // Запрашиваем еще 100 свечей ДО самой старой
            const response = await fetch(
                `${API_URL}/api/chart/history?symbol=${this.symbol}&timeframe=${this.timeframe}&limit=${this.LOAD_MORE_CANDLES}&before=${oldestTime}`
            );
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const newCandles = data.candles || [];
            
            if (newCandles.length === 0) {
                console.log('⚠️ No more candles to load');
                this.hasMore = false;
                return;
            }

            console.log(`✅ Loaded ${newCandles.length} more candles (hasMore: ${data.hasMore})`);

            // Добавляем новые свечи В НАЧАЛО массива
            this.candles = [...newCandles, ...this.candles];
            this.hasMore = data.hasMore || false;

            // 🎯 ВАЖНО: Обновляем график с сохранением текущей позиции скролла
            this.updateChartWithNewCandles();

        } catch (error) {
            console.error('Failed to load more candles:', error);
            window.errorLogger?.error('chart', 'Failed to load more', {
                symbol: this.symbol,
                timeframe: this.timeframe,
                error: error.message
            });
        } finally {
            this.isLoadingMore = false;
        }
    }

    // 🎯 PAGINATION: Обновление графика с новыми свечами (без потери позиции скролла)
    updateChartWithNewCandles() {
        if (!this.candleSeries || !this.lineSeries || !this.barSeries) return;

        // Получаем текущую позицию скролла перед обновлением
        const timeScale = this.chart.timeScale();
        const visibleRange = timeScale.getVisibleRange();

        // Обновляем данные для всех серий
        this.candleSeries.setData(this.candles);
        this.lineSeries.setData(this.candles.map(c => ({ time: c.time, value: c.close })));
        this.barSeries.setData(this.candles);

        // Восстанавливаем видимый диапазон (чтобы не прыгало)
        if (visibleRange) {
            timeScale.setVisibleRange(visibleRange);
        }
    }

    // 🎯 PAGINATION: Настройка отслеживания скролла для lazy loading
    setupScrollListener() {
        if (!this.chart) return;

        const timeScale = this.chart.timeScale();
        
        // Подписываемся на изменение видимого диапазона (включает скролл)
        timeScale.subscribeVisibleLogicalRangeChange(() => {
            this.checkIfNeedLoadMore();
        });
    }

    // 🎯 PAGINATION: Проверка нужно ли подгружать еще данные
    checkIfNeedLoadMore() {
        if (!this.chart || !this.hasMore || this.isLoadingMore || this.candles.length === 0) {
            return;
        }

        const timeScale = this.chart.timeScale();
        const logicalRange = timeScale.getVisibleLogicalRange();
        
        if (!logicalRange) return;

        // Порог для подгрузки: если видим начало данных (первые 20 свечей)
        const LOAD_THRESHOLD = 20;
        
        // logicalRange.from - это индекс первой видимой свечи
        // Если пользователь скроллит влево и близок к началу - подгружаем
        if (logicalRange.from <= LOAD_THRESHOLD) {
            console.log('🔄 Near start of data, loading more candles...');
            this.loadMoreCandles();
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
        // 🔒 КРИТИЧНО: Игнорируем тики во время загрузки нового таймфрейма/символа
        if (this.isLoading) {
            return;
        }

        const { price, time } = data;
        const now = Date.now();

        // Обновляем текущую цену
        this.currentPrice = price;

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

        // 🎯 ПЛАВНАЯ ИНТЕРПОЛЯЦИЯ: запускаем или обновляем анимацию
        if (this.interpolationEnabled && this.chartType !== 'line') {
            // ✅ Всегда только обновляем целевое значение - анимация продолжится сама
            this.targetCandle = { ...updatedCandle };
            
            // Если анимация еще не запущена - запускаем
            if (!this.animationFrameId) {
                const fromCandle = this.currentInterpolatedCandle || lastCandle;
                this.startInterpolation(fromCandle, updatedCandle);
            }
            this.lastTickTime = now;
        } else {
            // 🔥 FALLBACK: Без интерполяции - обновляем напрямую
            this.updateActiveSeries(updatedCandle, price);
            this.updatePriceLine(price);
            this.updatePriceDisplay(price);
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

    // Обновление линии текущей цены (60fps - синхронно с интерполяцией!)
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
            // Обновляем существующую линию (60fps!)
            this.expirationPriceLine.applyOptions({ price: price });
        }
    }

    // 🎯 НОВОЕ: Смена таймфрейма (просто загружаем другой JSON!)
    async setTimeframe(timeframe) {
        if (timeframe === this.timeframe) return;

        console.log(`⏱️ Changing timeframe to ${timeframe}`);

        // 🔒 ШАГ 1: Останавливаем интерполяцию и блокируем тики
        this.isLoading = true;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // 🔒 ШАГ 2: Сбрасываем состояние интерполяции
        this.currentInterpolatedCandle = null;
        this.targetCandle = null;
        this.interpolationStartTime = null;

        // 🎯 PAGINATION: Сбрасываем состояние пагинации
        this.hasMore = true;
        this.isLoadingMore = false;

        // 🔒 ШАГ 3: Обновляем таймфрейм
        this.timeframe = timeframe;
        localStorage.setItem('chartTimeframe', timeframe);

        // 🔒 ШАГ 4: Загружаем историю нового таймфрейма
        await this.loadHistoricalData(this.symbol, timeframe);

        // 🔒 ШАГ 5: Разблокируем обработку тиков
        this.isLoading = false;

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

        // 🔒 ШАГ 1: Останавливаем интерполяцию и блокируем тики
        this.isLoading = true;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        // 🔒 ШАГ 2: Сбрасываем состояние интерполяции
        this.currentInterpolatedCandle = null;
        this.targetCandle = null;
        this.interpolationStartTime = null;

        // 🎯 PAGINATION: Сбрасываем состояние пагинации
        this.hasMore = true;
        this.isLoadingMore = false;

        // 🔒 ШАГ 3: Обновляем символ
        this.symbol = newSymbol;

        // 🔒 ШАГ 4: Загружаем новую историю
        await this.loadHistoricalData(newSymbol, this.timeframe);

        // 🔒 ШАГ 5: Разблокируем обработку тиков
        this.isLoading = false;

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
        
        // 🔥 МАСШТАБИРОВАНИЕ: Адаптируем скорость под таймфрейм
        // Для S5 (5 сек) используем базовую скорость 300ms
        // Для более длинных таймфреймов увеличиваем пропорционально
        const ratio = timeframeDuration / 5; // относительно S5
        const scaledDuration = this.baseInterpolationDuration * Math.pow(ratio, 0.5);
        
        // Ограничиваем максимум до 3000ms для длинных таймфреймов (M30)
        return Math.min(scaledDuration, 3000);
    }

    // 🎨 ИНТЕРПОЛЯЦИЯ - плавная анимация между тиками (60fps)
    startInterpolation(fromCandle, toCandle) {
        if (!this.interpolationEnabled || !fromCandle || !toCandle) {
            return;
        }
        
        // 🔥 FIX: Если анимация уже идет, НЕ запускаем новую (обновим targetCandle в handleTick)
        if (this.animationFrameId) {
            return;
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
        // 🔒 КРИТИЧНО: Проверка на null/undefined (защита от ошибок при смене таймфрейма)
        if (!this.interpolationEnabled || !this.targetCandle || !this.currentInterpolatedCandle) {
            this.animationFrameId = null;
            return;
        }
        
        const now = performance.now();
        const elapsed = now - this.interpolationStartTime;
        
        // Рассчитываем прогресс (0.0 - 1.0)
        const progress = Math.min(elapsed / this.interpolationDuration, 1.0);
        
        // Linear easing для равномерной плавности (как в IQOption)
        const eased = progress;
        
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
            
            // ✅ КРИТИЧНО: Обновляем линию цены синхронно (60fps вместо 1fps!)
            this.updatePriceLine(interpolated.close);
            
            // Обновляем отображение цены
            this.updatePriceDisplay(interpolated.close);
        } catch (error) {
            console.error('❌ Animation error:', error);
            this.animationFrameId = null;
            return;
        }
        
        // Продолжаем анимацию если не завершена
        if (progress < 1.0) {
            this.currentInterpolatedCandle = interpolated;
            this.animationFrameId = requestAnimationFrame(() => this.animate());
        } else {
            // 🎯 КРИТИЧНО: Анимация завершена - синхронизируемся с реальными данными
            this.currentInterpolatedCandle = this.targetCandle;
            this.animationFrameId = null;
            
            // 🔥 FIX: Проверяем, не пришли ли новые тики пока анимация шла
            const lastCandle = this.candles[this.candles.length - 1];
            if (lastCandle && lastCandle.time === this.targetCandle.time) {
                // Проверяем, изменилась ли последняя свеча
                const hasChanges = 
                    lastCandle.high !== this.targetCandle.high ||
                    lastCandle.low !== this.targetCandle.low ||
                    lastCandle.close !== this.targetCandle.close;
                
                if (hasChanges) {
                    // 🚀 Новые данные пришли - запускаем новую анимацию
                    this.targetCandle = { ...lastCandle };
                    this.startInterpolation(this.currentInterpolatedCandle, this.targetCandle);
                }
            }
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
