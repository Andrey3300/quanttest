// Chart management module
// Модуль управления графиком

class ChartManager {
    constructor() {
        this.chart = null;
        this.candleSeries = null;
        this.lineSeries = null; // для Line графика
        this.barSeries = null; // для Bars графика
        this.volumeSeries = null;
        this.ws = null;
        this.symbol = 'USD_MXN_OTC';
        this.isInitialized = false;
        this.isUserInteracting = false; // флаг взаимодействия пользователя
        this.lastUpdateTime = 0; // время последнего обновления
        this.updateThrottle = 16; // минимальный интервал между обновлениями (ms) - 60fps для интерполяции
        this.lastCandle = null; // последняя свеча для отслеживания
        this.candleCount = 0; // количество свечей для корректного расчета индексов
        this.isDestroyed = false; // флаг уничтожения для предотвращения переподключения
        this.reconnectTimer = null; // таймер переподключения для очистки
        this.connectionId = 0; // уникальный ID соединения для отслеживания
        this.processedCandles = new Set(); // сет для отслеживания обработанных свечей
        this.MAX_CANDLES_IN_MEMORY = 120960; // максимально 7 дней по 5-секундных свечей
        
        // НОВОЕ: Управление типом графика и таймфреймом
        // Загружаем сохраненные настройки из localStorage
        this.chartType = localStorage.getItem('chartType') || 'candles'; // 'line', 'candles', 'bars'
        this.timeframe = localStorage.getItem('chartTimeframe') || 'S5'; // текущий таймфрейм
        this.currentCandleByTimeframe = null; // текущая свеча для данного таймфрейма
        
        // РЕШЕНИЕ #6: Debounce для скролла
        this.scrollDebounceTimer = null;
        this.pendingScrollRange = null;
        
        // РЕШЕНИЕ #1: Контроль autoScale
        this.isAdjustingScale = false;
        
        // Таймер для начальной анимации цены
        this.initialAnimationTimer = null;
        
        // Защита от схлопывания
        this.MIN_VISIBLE_BARS = 10; // минимальная ширина видимого диапазона
        this.isRestoringRange = false; // флаг восстановления диапазона
        
        // 🎯 ИНТЕРПОЛЯЦИЯ ДЛЯ ПЛАВНОСТИ (smooth transitions between ticks)
        this.interpolationEnabled = true; // включить/выключить интерполяцию
        this.targetCandle = null; // целевое состояние свечи (куда движемся)
        this.currentInterpolatedCandle = null; // текущее интерполированное состояние
        this.interpolationStartTime = null; // время начала интерполяции
        this.interpolationDuration = 300; // длительность интерполяции (ms) - ДИНАМИЧЕСКАЯ, зависит от таймфрейма
        this.baseInterpolationDuration = 300; // базовая длительность для S5 (5 секунд)
        this.animationFrameId = null; // ID для requestAnimationFrame
        this.lastTickTime = 0; // время последнего тика для расчета интерполяции
        
        // Линия цены для отображения текущей цены справа на оси Y
        this.currentPrice = null; // текущая цена
        this.expirationPriceLine = null; // PriceLine для отображения линии и цены справа (на оси Y)
    }

    // Инициализация графика
    init() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) {
            console.error('Chart container not found');
            return;
        }

        // Получаем родительский контейнер для правильного расчета размеров
        const parentContainer = chartContainer.parentElement;
        const width = parentContainer ? parentContainer.clientWidth : chartContainer.clientWidth;
        const height = parentContainer ? parentContainer.clientHeight : chartContainer.clientHeight;

        // Создаем график с темной темой
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
                    top: 0.1, // 10% отступ сверху
                    bottom: 0.1, // 10% отступ снизу
                },
                mode: LightweightCharts.PriceScaleMode.Normal,
                autoScale: true, // автоматическое масштабирование
                alignLabels: true,
            },
            timeScale: {
                borderColor: '#2d3748',
                timeVisible: true,
                secondsVisible: true,
                barSpacing: 8, // Делаем свечи толще
                minBarSpacing: 4, // Минимальная толщина при максимальном отдалении
                rightOffset: 50, // Увеличен отступ справа для последней свечи
                lockVisibleTimeRangeOnResize: true,
            },
        });

        // Создаем серию свечей с оптимизацией
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            borderUpColor: '#26d07c',
            borderDownColor: '#ff4757',
            wickUpColor: '#26d07c',
            wickDownColor: '#ff4757',
            priceLineVisible: false,
            lastValueVisible: false, // Отключено чтобы избежать дублирования с линией экспирации
            priceFormat: {
                type: 'price',
                precision: 4,
                minMove: 0.0001,
            },
            visible: this.chartType === 'candles',
        });
        
        // Создаем серию линий для Line графика
        this.lineSeries = this.chart.addLineSeries({
            color: '#4f9fff',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false, // Отключено чтобы избежать дублирования с линией экспирации
            priceFormat: {
                type: 'price',
                precision: 4,
                minMove: 0.0001,
            },
            visible: this.chartType === 'line',
        });
        
        // Создаем серию баров для Bars графика (используем candlestick с специальными настройками)
        this.barSeries = this.chart.addCandlestickSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            borderUpColor: '#26d07c',
            borderDownColor: '#ff4757',
            wickUpColor: '#26d07c',
            wickDownColor: '#ff4757',
            priceLineVisible: false,
            lastValueVisible: false, // Отключено чтобы избежать дублирования с линией экспирации
            priceFormat: {
                type: 'price',
                precision: 4,
                minMove: 0.0001,
            },
            visible: this.chartType === 'bars',
        });

        // Создаем серию объемов (скрыта)
        this.volumeSeries = this.chart.addHistogramSeries({
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: '', // отдельная шкала
            scaleMargins: {
                top: 0.8,
                bottom: 0,
            },
            visible: false, // Скрываем объемы
        });

        // Обработка изменения размера окна с дебаунсом
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                if (this.chart && chartContainer) {
                    const parentContainer = chartContainer.parentElement;
                    const width = parentContainer ? parentContainer.clientWidth : chartContainer.clientWidth;
                    const height = parentContainer ? parentContainer.clientHeight : chartContainer.clientHeight;
                    
                    this.chart.applyOptions({
                        width: width,
                        height: height,
                    });
                }
            }, 100);
        });
        
        // Отслеживание взаимодействия пользователя с графиком
        chartContainer.addEventListener('mousedown', () => {
            this.isUserInteracting = true;
        });
        
        chartContainer.addEventListener('mouseup', () => {
            setTimeout(() => {
                this.isUserInteracting = false;
            }, 100);
        });
        
        chartContainer.addEventListener('touchstart', () => {
            this.isUserInteracting = true;
        });
        
        chartContainer.addEventListener('touchend', () => {
            setTimeout(() => {
                this.isUserInteracting = false;
            }, 100);
        });
        
        chartContainer.addEventListener('wheel', () => {
            this.isUserInteracting = true;
            setTimeout(() => {
                this.isUserInteracting = false;
            }, 200);
        });
        
        // УСИЛЕННАЯ ЗАЩИТА ОТ СХЛОПЫВАНИЯ графика через мониторинг диапазона
        this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range || this.isRestoringRange || !this.isInitialized) return;
            
            // УЛУЧШЕНИЕ: Дополнительная проверка на корректность диапазона
            if (range.from < 0 || range.to < 0 || range.from >= range.to) {
                window.errorLogger?.error('range', 'Invalid range detected!', {
                    range: range,
                    candleCount: this.candleCount
                });
                console.error('Invalid range detected:', range);
                this.isRestoringRange = true;
                setTimeout(() => {
                    this.chart.timeScale().fitContent();
                    this.isRestoringRange = false;
                }, 50);
                return;
            }
            
            // Проверяем на схлопывание
            const visibleBars = range.to - range.from;
            const rightOffsetBars = 50;
            const pureVisibleBars = visibleBars - rightOffsetBars;
            
            if (pureVisibleBars < this.MIN_VISIBLE_BARS) {
                window.errorLogger?.error('range', 'Chart collapse detected! Restoring safe range...', {
                    currentRange: { from: range.from, to: range.to },
                    visibleBars: visibleBars,
                    pureVisibleBars: pureVisibleBars,
                    minRequired: this.MIN_VISIBLE_BARS,
                    candleCount: this.candleCount
                });
                console.error('Chart collapse detected! Range too narrow:', pureVisibleBars, 'bars');
                
                // УЛУЧШЕНИЕ: Используем candleCount для безопасного восстановления
                const safeVisibleBars = 100; // отображаем последние 100 свечей
                
                // Проверяем что у нас достаточно свечей
                if (this.candleCount < safeVisibleBars) {
                    window.errorLogger?.warn('range', 'Not enough candles for safe range, using fitContent', {
                        candleCount: this.candleCount,
                        safeVisibleBars: safeVisibleBars
                    });
                    this.isRestoringRange = true;
                    setTimeout(() => {
                        this.chart.timeScale().fitContent();
                        this.isRestoringRange = false;
                    }, 50);
                    return;
                }
                
                const safeRange = {
                    from: Math.max(0, this.candleCount - safeVisibleBars),
                    to: this.candleCount - 1 + rightOffsetBars
                };
                
                window.errorLogger?.info('range', 'Restoring safe range', { 
                    safeRange,
                    candleCount: this.candleCount
                });
                
                // Устанавливаем флаг чтобы избежать рекурсии
                this.isRestoringRange = true;
                
                // Применяем с небольшой задержкой
                setTimeout(() => {
                    try {
                        this.chart.timeScale().setVisibleLogicalRange(safeRange);
                    } catch (error) {
                        window.errorLogger?.error('range', 'Failed to restore range', {
                            error: error.message,
                            safeRange: safeRange
                        });
                        console.error('Failed to restore range:', error);
                    }
                    setTimeout(() => {
                        this.isRestoringRange = false;
                    }, 100);
                }, 0);
            }
        });

        this.isInitialized = true;
        window.errorLogger?.info('chart', 'Chart initialized successfully', {
            width: width,
            height: height,
            rightOffset: 12
        });
        console.log('Chart initialized');
    }

    // Загрузка исторических данных
    async loadHistoricalData(symbol) {
        try {
            const API_URL = window.location.origin.includes('localhost')
                ? 'http://localhost:3001'
                : window.location.origin;

            const response = await fetch(`${API_URL}/api/chart/history?symbol=${symbol}`);
            if (!response.ok) {
                throw new Error('Failed to fetch chart data');
            }

            const result = await response.json();
            const data = result.data;

            if (!data || data.length === 0) {
                console.warn('No chart data received');
                return;
            }

            // Устанавливаем данные в зависимости от типа графика
            if (this.chartType === 'line') {
                // Для Line графика конвертируем OHLC в простые точки
                const lineData = data.map(candle => ({
                    time: candle.time,
                    value: candle.close
                }));
                this.lineSeries.setData(lineData);
            } else if (this.chartType === 'candles') {
                this.candleSeries.setData(data);
            } else if (this.chartType === 'bars') {
                this.barSeries.setData(data);
            }
            
            // Сохраняем количество свечей и последнюю свечу
            this.candleCount = data.length;
            if (data.length > 0) {
                this.lastCandle = data[data.length - 1];
            }
            
            // Очищаем сет обработанных свечей при загрузке новых данных
            this.processedCandles.clear();

            // Устанавливаем данные объемов
            const volumeData = data.map(candle => ({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
            }));
            this.volumeSeries.setData(volumeData);

            // Автоматически подгоняем видимый диапазон только при первой загрузке
            window.errorLogger?.info('chart', 'Historical data loaded', {
                candleCount: data.length,
                symbol: symbol,
                firstTime: data[0]?.time,
                lastTime: data[data.length - 1]?.time
            });
            
            // Сохраняем текущую цену для создания линии цены
            if (data.length > 0) {
                this.currentPrice = data[data.length - 1].close;
                
                // ИСПРАВЛЕНИЕ: Сразу создаем линию цены после загрузки данных
                // И запускаем немедленное обновление для движения линии
                if (this.chartType !== 'line') {
                    this.createExpirationOverlay();
                    // Запускаем микро-симуляцию до получения первого тика
                    this.startInitialPriceAnimation();
                }
            }
            
            this.chart.timeScale().fitContent();
            
            // Устанавливаем начальный видимый диапазон (последние ~100 свечей)
            if (data.length > 0) {
                // Используем фиксированный отступ справа (rightOffset из настроек)
                const rightOffsetBars = 50; // соответствует rightOffset в настройках
                const visibleLogicalRange = {
                    from: Math.max(0, data.length - 100),
                    to: data.length - 1 + rightOffsetBars
                };
                this.chart.timeScale().setVisibleLogicalRange(visibleLogicalRange);
            }

            console.log(`Loaded ${data.length} candles for ${symbol}`);
        } catch (error) {
            window.errorLogger?.error('chart', 'Error loading historical data', {
                error: error.message,
                stack: error.stack,
                symbol: symbol
            });
            console.error('Error loading historical data:', error);
        }
    }

    // Подключение к WebSocket (переиспользуем соединение)
    connectWebSocket(symbol) {
        const wsUrl = window.location.origin.includes('localhost')
            ? 'ws://localhost:3001/ws/chart'
            : `ws://${window.location.host}/ws/chart`;

        try {
            // ПРОБЛЕМА WebSocket РЕШЕНА: Переиспользуем одно соединение
            // Если соединение уже есть и оно активно, просто меняем подписку
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                window.errorLogger?.info('websocket', 'Reusing existing connection for symbol change', { 
                    oldSymbol: this.symbol,
                    newSymbol: symbol
                });
                
                // Явный unsubscribe от старого символа
                if (this.symbol && this.symbol !== symbol) {
                    this.ws.send(JSON.stringify({
                        type: 'unsubscribe',
                        symbol: this.symbol
                    }));
                }
                
                // Подписываемся на новый символ
                this.symbol = symbol;
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    symbol: symbol
                }));
                return;
            }
            
            // Иначе создаем новое соединение
            this.closeWebSocket();
            
            // Отменяем любые pending переподключения
            if (this.reconnectTimer) {
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = null;
            }
            
            // Увеличиваем ID соединения для отслеживания
            this.connectionId++;
            const currentConnectionId = this.connectionId;
            
            this.ws = new WebSocket(wsUrl);
            
            window.errorLogger?.info('websocket', 'Creating new WebSocket connection', { 
                symbol,
                wsUrl,
                connectionId: currentConnectionId,
                readyState: this.ws.readyState 
            });

            this.ws.onopen = () => {
                window.errorLogger?.info('websocket', 'WebSocket connected', { symbol });
                console.log('WebSocket connected');
                // Подписываемся на символ
                this.ws.send(JSON.stringify({
                    type: 'subscribe',
                    symbol: symbol
                }));
            };

            this.ws.onmessage = (event) => {
                try {
                    // ЗАЩИТА: Игнорируем сообщения от устаревших соединений
                    if (currentConnectionId !== this.connectionId) {
                        window.errorLogger?.warn('websocket', 'Ignoring message from old connection', {
                            messageConnectionId: currentConnectionId,
                            currentConnectionId: this.connectionId
                        });
                        return;
                    }
                    
                    const message = JSON.parse(event.data);

                    if (message.type === 'subscribed') {
                        console.log(`Subscribed to ${message.symbol}`);
                        window.errorLogger?.info('websocket', 'Subscription confirmed', { 
                            symbol: message.symbol,
                            connectionId: currentConnectionId
                        });
                    } else if (message.type === 'unsubscribed') {
                        console.log(`Unsubscribed from ${message.symbol}`);
                        window.errorLogger?.info('websocket', 'Unsubscription confirmed', { 
                            symbol: message.symbol
                        });
                    } else if (message.type === 'tick') {
                        // Плавное обновление текущей свечи (не проверяем дубликаты для тиков)
                        // ИСПРАВЛЕНИЕ: Останавливаем начальную анимацию при получении первого реального тика
                        if (this.initialAnimationTimer) {
                            clearInterval(this.initialAnimationTimer);
                            this.initialAnimationTimer = null;
                            window.errorLogger?.debug('animation', 'Initial animation stopped - real tick received');
                        }
                        this.updateCandle(message.data, false);
                    } else if (message.type === 'newCandle') {
                        // Создание новой свечи
                        // ЗАЩИТА: Проверяем что эту свечу еще не обрабатывали
                        const candleKey = `${message.data.time}-${message.symbol || this.symbol}`;
                        if (this.processedCandles.has(candleKey)) {
                            window.errorLogger?.warn('websocket', 'Duplicate new candle detected - skipping', {
                                candleKey,
                                time: message.data.time
                            });
                            return;
                        }
                        this.processedCandles.add(candleKey);
                        
                        // Ограничиваем размер Set для предотвращения утечки памяти
                        if (this.processedCandles.size > 10000) {
                            // Очищаем старые записи
                            const entries = Array.from(this.processedCandles);
                            this.processedCandles = new Set(entries.slice(-5000));
                        }
                        
                        this.updateCandle(message.data, true);
                    } else if (message.type === 'candle') {
                        // Обратная совместимость
                        this.updateCandle(message.data, false);
                    }
                } catch (error) {
                    window.errorLogger?.error('websocket', 'Error processing WebSocket message', {
                        error: error.message,
                        stack: error.stack
                    });
                    console.error('Error processing WebSocket message:', error);
                }
            };

            this.ws.onerror = (error) => {
                window.errorLogger?.error('websocket', 'WebSocket error', { 
                    error: String(error),
                    symbol: symbol
                });
                console.error('WebSocket error:', error);
            };

            this.ws.onclose = (event) => {
                window.errorLogger?.info('websocket', 'WebSocket closed', { 
                    symbol,
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean,
                    isDestroyed: this.isDestroyed
                });
                console.log('WebSocket disconnected');
                
                // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: НЕ переподключаемся если компонент уничтожен
                // или если соединение закрыто намеренно (например, при смене символа)
                if (this.isDestroyed || !this.isInitialized) {
                    window.errorLogger?.info('websocket', 'Not reconnecting - component destroyed or not initialized');
                    return;
                }
                
                // Переподключаемся только если это неожиданное отключение
                if (event.code !== 1000) { // 1000 = нормальное закрытие
                    window.errorLogger?.info('websocket', 'Scheduling reconnect after abnormal close');
                    this.reconnectTimer = setTimeout(() => {
                        if (this.isInitialized && !this.isDestroyed) {
                            console.log('Reconnecting WebSocket...');
                            this.connectWebSocket(this.symbol); // используем текущий символ
                        }
                    }, 5000);
                }
            };
        } catch (error) {
            window.errorLogger?.error('websocket', 'Error connecting to WebSocket', {
                error: error.message,
                stack: error.stack,
                symbol: symbol
            });
            console.error('Error connecting to WebSocket:', error);
        }
    }

    // Обновление свечи с оптимизацией
    updateCandle(candle, isNewCandle = false) {
        const activeSeries = this.getActiveSeries();
        if (!activeSeries || !this.volumeSeries) {
            window.errorLogger?.error('chart', 'updateCandle called but series not initialized');
            return;
        }
        
        // Для Line графика - просто обновляем цену без группировки
        if (this.chartType === 'line') {
            const lineData = {
                time: candle.time,
                value: candle.close
            };
            
            try {
                this.lineSeries.update(lineData);
                this.updatePriceDisplay(candle.close);
            } catch (error) {
                window.errorLogger?.error('chart', 'Error updating line chart', {
                    error: error.message,
                    lineData: lineData
                });
                console.error('Error updating line chart:', error);
            }
            return;
        }
        
        // Для Candles и Bars - используем группировку по таймфрейму
        if (this.chartType === 'candles' || this.chartType === 'bars') {
            if (!window.chartTimeframeManager) {
                window.errorLogger?.error('chart', 'chartTimeframeManager not available');
                return;
            }
            
            // Преобразуем данные свечи в формат тика для группировки
            const tick = {
                time: candle.time,
                price: candle.close,
                volume: candle.volume || 0
            };
            
            // Обновляем/создаем свечу с учетом таймфрейма
            const result = window.chartTimeframeManager.updateCandleWithTick(
                this.currentCandleByTimeframe, 
                tick, 
                this.timeframe
            );
            
            // Обновляем текущую свечу
            this.currentCandleByTimeframe = result.candle;
            isNewCandle = result.isNewCandle;
            candle = result.candle;
        }

        // Проверяем корректность данных
        if (!candle || typeof candle.time === 'undefined') {
            window.errorLogger?.error('chart', 'Invalid candle data received', { candle });
            console.warn('Invalid candle data received:', candle);
            return;
        }
        
        // КРИТИЧЕСКАЯ ПРОВЕРКА: время должно быть числом, а не объектом
        if (typeof candle.time !== 'number' || isNaN(candle.time)) {
            window.errorLogger?.error('chart', 'Invalid candle time format', { 
                type: typeof candle.time, 
                value: candle.time,
                candle: candle
            });
            console.error('Invalid candle time format - expected number, got:', typeof candle.time, candle.time);
            return;
        }
        
        // РЕШЕНИЕ #3: Отслеживаем timestamp ПЕРЕД обновлением для проверки
        const beforeUpdateTime = this.lastCandle?.time || 0;
        
        // Проверка на устаревшие данные
        if (this.lastCandle && this.lastCandle.time) {
            if (!isNewCandle) {
                // Для тиков: проверяем что обновляем текущую свечу, а не старую
                if (candle.time < this.lastCandle.time) {
                    // Игнорируем устаревшие тики (это нормальное поведение после создания новой свечи)
                    window.errorLogger?.debug('chart', 'Ignoring outdated tick', {
                        tickTime: candle.time,
                        lastCandleTime: this.lastCandle.time,
                        timeDiff: this.lastCandle.time - candle.time
                    });
                    return;
                }
                // УЛУЧШЕНИЕ: Если тик пришел с новым временем - обрабатываем как новую свечу
                if (candle.time > this.lastCandle.time) {
                    window.errorLogger?.info('chart', 'Tick with new time - treating as new candle', {
                        tickTime: candle.time,
                        lastCandleTime: this.lastCandle.time,
                        timeDiff: candle.time - this.lastCandle.time
                    });
                    console.log('Tick with new time - treating as new candle:', candle.time, 'last:', this.lastCandle.time);
                    isNewCandle = true; // Переключаем в режим новой свечи
                }
                // Если candle.time === this.lastCandle.time - это нормальное обновление текущей свечи
            } else {
                // Для новых свечей: время должно быть строго больше времени последней свечи
                if (candle.time <= this.lastCandle.time) {
                    window.errorLogger?.warn('chart', 'REJECTED: New candle has older or equal timestamp', {
                        candleTime: candle.time,
                        lastTime: this.lastCandle.time,
                        candleCount: this.candleCount,
                        timeDiff: candle.time - this.lastCandle.time
                    });
                    console.warn('New candle has older or equal timestamp - candle:', candle.time, 'last:', this.lastCandle.time);
                    return;
                }
            }
        }
        
        // Валидация OHLC - критически важно!
        if (candle.high < candle.low || 
            candle.high < candle.open || 
            candle.high < candle.close ||
            candle.low > candle.open ||
            candle.low > candle.close) {
            window.errorLogger?.error('chart', 'Invalid OHLC data detected', { candle });
            console.error('Invalid OHLC data:', candle);
            return;
        }
        
        // Троттлинг обновлений - для интерполяции используем 16ms (60fps)
        const now = Date.now();
        
        // РЕШЕНИЕ #3: Отслеживаем успешность добавления свечи
        let actuallyAddedNewCandle = false;
        
        // 🎯 ИНТЕРПОЛЯЦИЯ: Для тиков используем плавную анимацию (только для Candles/Bars)
        if (!isNewCandle && this.interpolationEnabled && this.lastCandle && this.chartType !== 'line') {
            // Это тик - запускаем интерполяцию от текущей свечи к новому состоянию
            const fromCandle = this.currentInterpolatedCandle || this.lastCandle;
            this.startInterpolation(fromCandle, candle);
            this.lastCandle = candle;
            this.lastTickTime = now;
            return; // Интерполяция сама обновит график через requestAnimationFrame
        }
        
        // Обновляем свечу без интерполяции (для новых свечей или если интерполяция выключена)
        try {
            activeSeries.update(candle);
            
            // РЕШЕНИЕ #2 ИСПРАВЛЕНО: Надежный подсчет через инкремент
            // НЕ используем candleSeries.data().length т.к. он возвращает только буфер!
            // Проверяем что свеча ДЕЙСТВИТЕЛЬНО добавлена
            if (isNewCandle && candle.time > beforeUpdateTime) {
                actuallyAddedNewCandle = true;
                
                // ВАЖНО: Простой инкремент - единственный надежный способ
                this.candleCount++;
                
                window.errorLogger?.debug('chart', 'New candle added - count incremented', {
                    newCandleCount: this.candleCount,
                    candleTime: candle.time
                });
                
                // КРИТИЧЕСКАЯ ЗАЩИТА: Ограничиваем количество свечей в памяти
                if (this.candleCount > this.MAX_CANDLES_IN_MEMORY) {
                    window.errorLogger?.warn('chart', 'Memory limit reached - cleaning old candles', {
                        currentCount: this.candleCount,
                        maxAllowed: this.MAX_CANDLES_IN_MEMORY
                    });
                    
                    // Получаем все свечи из серии
                    const allCandles = activeSeries.data();
                    
                    if (allCandles && allCandles.length > 0) {
                        // Оставляем только последние MAX_CANDLES_IN_MEMORY свечей
                        const candlesToKeep = Math.floor(this.MAX_CANDLES_IN_MEMORY * 0.75); // 75% для запаса
                        const trimmedCandles = allCandles.slice(-candlesToKeep);
                        
                        window.errorLogger?.info('chart', 'Trimming candle data', {
                            before: allCandles.length,
                            after: trimmedCandles.length,
                            removed: allCandles.length - trimmedCandles.length
                        });
                        
                        // Применяем обрезанные данные
                        activeSeries.setData(trimmedCandles);
                        
                        // Обновляем счетчик
                        this.candleCount = trimmedCandles.length;
                        
                        // 🔧 КРИТИЧЕСКИ ВАЖНО: Обновляем lastCandle и синхронизируем состояние
                        if (trimmedCandles.length > 0) {
                            this.lastCandle = trimmedCandles[trimmedCandles.length - 1];
                            
                            // Проверяем непрерывность после обрезки
                            window.errorLogger?.info('chart', 'Post-trim continuity check', {
                                lastCandleTime: this.lastCandle.time,
                                lastCandleOpen: this.lastCandle.open,
                                lastCandleClose: this.lastCandle.close,
                                currentInterpolatedClose: this.currentInterpolatedCandle?.close
                            });
                            
                            // Синхронизируем интерполированное состояние
                            if (this.currentInterpolatedCandle) {
                                this.currentInterpolatedCandle = { ...this.lastCandle };
                            }
                        }
                        
                        // Также обрезаем объемы
                        const allVolumes = this.volumeSeries.data();
                        if (allVolumes && allVolumes.length > 0) {
                            const trimmedVolumes = allVolumes.slice(-candlesToKeep);
                            this.volumeSeries.setData(trimmedVolumes);
                        }
                    }
                }
                
                // Для новой свечи останавливаем интерполяцию и сбрасываем состояние
                if (this.animationFrameId) {
                    cancelAnimationFrame(this.animationFrameId);
                    this.animationFrameId = null;
                }
                this.currentInterpolatedCandle = candle;
            }
            
            this.volumeSeries.update({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
            });
        } catch (error) {
            window.errorLogger?.error('chart', 'Error updating chart', {
                error: error.message,
                candle: candle,
                lastCandle: this.lastCandle
            });
            console.error('Error updating chart:', error, 'Candle:', candle, 'Last candle:', this.lastCandle);
            return;
        }
        
        // Обновляем цену в UI (для новых свечей, тики обновляются в интерполяции)
        if (isNewCandle) {
            this.updatePriceDisplay(candle.close);
        }
        
        // РЕШЕНИЕ #3: Обновляем счетчик ТОЛЬКО если свеча реально добавлена
        if (actuallyAddedNewCandle) {
            window.errorLogger?.info('chart', 'New candle successfully added', { 
                time: candle.time, 
                timeISO: new Date(candle.time * 1000).toISOString(),
                open: candle.open, 
                close: candle.close,
                candleCount: this.candleCount,
                beforeUpdateTime: beforeUpdateTime
            });
            console.log('New candle created:', candle.time, 'open:', candle.open, 'close:', candle.close);
            
            // Обновляем lastCandle для следующих проверок
            this.lastCandle = candle;
            
            // Плавно прокручиваем к последней свече только если пользователь не взаимодействует
            if (!this.isUserInteracting) {
                // РЕШЕНИЕ #4 & #6: Увеличенный debounce для стабильности
                clearTimeout(this.scrollDebounceTimer);
                
                this.scrollDebounceTimer = setTimeout(() => {
                    try {
                        const timeScale = this.chart.timeScale();
                        const currentRange = timeScale.getVisibleLogicalRange();
                        
                        if (currentRange) {
                            const rightOffsetBars = 50; // фиксированный отступ справа из настроек
                            
                            // РЕШЕНИЕ #4: Используем candleCount напрямую, не создаем промежуточных переменных
                            // которые могут внести путаницу
                            const isNearEnd = currentRange.to >= (this.candleCount - 1 - 5);
                            
                            // Логируем текущее состояние ПЕРЕД расчетами
                            window.errorLogger?.debug('range', 'Before scroll calculation', {
                                candleCount: this.candleCount,
                                currentRange: { from: currentRange.from, to: currentRange.to },
                                isNearEnd: isNearEnd,
                                rightOffsetBars: rightOffsetBars
                            });
                            
                            if (isNearEnd) {
                                // ИСПРАВЛЕНИЕ: Убрана проверка candleCount < 1000
                                // Эта проверка была слишком строгой и блокировала работу
                                // Теперь мы гарантируем корректность candleCount через другие механизмы
                                
                                // УЛУЧШЕННАЯ ЛОГИКА АВТОСКРОЛЛА:
                                
                                // 1. Вычисляем "чистую" ширину видимых свечей БЕЗ rightOffset
                                const totalWidth = currentRange.to - currentRange.from;
                                const pureVisibleBars = Math.max(this.MIN_VISIBLE_BARS, Math.floor(totalWidth - rightOffsetBars));
                                
                                // 2. Используем candleCount для расчета
                                const safeLastCandleIndex = this.candleCount - 1;
                                
                                // 3. КРИТИЧЕСКАЯ ПРОВЕРКА: убедимся что candleCount достаточно большой
                                if (safeLastCandleIndex < pureVisibleBars) {
                                    window.errorLogger?.warn('range', 'Not enough candles for scroll calculation', {
                                        candleCount: this.candleCount,
                                        pureVisibleBars: pureVisibleBars,
                                        lastCandleIndex: safeLastCandleIndex
                                    });
                                    console.warn('Not enough candles for scroll:', this.candleCount, 'needed:', pureVisibleBars);
                                    return;
                                }
                                
                                // 4. Рассчитываем новый диапазон
                                const newFrom = Math.max(0, safeLastCandleIndex - pureVisibleBars);
                                const newTo = safeLastCandleIndex + rightOffsetBars;
                                
                                // 3. КРИТИЧНО: Проверяем минимальную ширину
                                const calculatedPureWidth = newTo - newFrom - rightOffsetBars;
                                
                                if (calculatedPureWidth < this.MIN_VISIBLE_BARS) {
                                    window.errorLogger?.error('range', 'Preventing chart collapse - range too narrow!', {
                                        calculatedPureWidth: calculatedPureWidth,
                                        minRequired: this.MIN_VISIBLE_BARS,
                                        newFrom: newFrom,
                                        newTo: newTo
                                    });
                                    console.error('Preventing chart collapse - calculated range too narrow!');
                                    return;
                                }
                                
                                const newRange = {
                                    from: newFrom,
                                    to: newTo
                                };
                                
                                // Логируем расчеты
                                window.errorLogger?.debug('range', 'Scroll calculation result', {
                                    totalWidth: totalWidth,
                                    pureVisibleBars: pureVisibleBars,
                                    calculatedPureWidth: calculatedPureWidth,
                                    newFrom: newFrom,
                                    newTo: newTo,
                                    newRange: newRange
                                });
                                
                                // Финальная проверка на разумность значений
                                if (newFrom < 0 || newTo < 0 || newFrom >= newTo) {
                                    window.errorLogger?.error('range', 'Invalid range calculated!', {
                                        newRange: newRange,
                                        candleCount: this.candleCount,
                                        currentRange: currentRange
                                    });
                                    console.error('Invalid range calculated:', newRange);
                                    return;
                                }
                                
                                // РЕШЕНИЕ #1: Временно отключаем autoScale перед установкой диапазона
                                this.isAdjustingScale = true;
                                
                                // Сохраняем текущие настройки
                                const currentAutoScale = true; // из настроек
                                
                                // Отключаем autoScale
                                this.chart.applyOptions({
                                    rightPriceScale: {
                                        autoScale: false
                                    }
                                });
                                
                                // Устанавливаем новый диапазон
                                timeScale.setVisibleLogicalRange(newRange);
                                
                                window.errorLogger?.debug('range', 'Range applied successfully', { newRange });
                                
                                // Через небольшую задержку возвращаем autoScale
                                setTimeout(() => {
                                    this.chart.applyOptions({
                                        rightPriceScale: {
                                            autoScale: currentAutoScale
                                        }
                                    });
                                    this.isAdjustingScale = false;
                                }, 150);
                            }
                        } else {
                            window.errorLogger?.warn('range', 'No current range available');
                        }
                    } catch (error) {
                        window.errorLogger?.error('range', 'Error scrolling chart', { 
                            error: error.message, 
                            stack: error.stack 
                        });
                        console.error('Error scrolling chart:', error);
                        this.isAdjustingScale = false;
                    }
                }, 300); // РЕШЕНИЕ #4: Увеличено с 50ms до 300ms для стабильности
            } else {
                window.errorLogger?.debug('range', 'Skipping scroll - user is interacting');
            }
        } else {
            // Для обновления текущей свечи (тик) просто обновляем lastCandle
            this.lastCandle = candle;
        }
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
        
        // Обновляем PriceLine с новой ценой (голубая линия)
        if (this.expirationPriceLine && this.chartType !== 'line') {
            this.updateExpirationPriceLine();
        }
    }
    
    // Создать линию цены (без оверлея с временем)
    createExpirationOverlay() {
        // Удаляем старый оверлей если есть
        this.removeExpirationOverlay();
        
        if (!this.currentPrice) return;
        
        // Создаем только PriceLine для отображения цены справа (без HTML оверлея)
        const activeSeries = this.getActiveSeries();
        if (activeSeries) {
            this.expirationPriceLine = activeSeries.createPriceLine({
                price: this.currentPrice,
                color: '#4f9fff',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Solid,
                axisLabelVisible: true,
                title: '', // пустой title - только цена справа
                axisLabelColor: '#4f9fff',
                axisLabelTextColor: '#ffffff'
            });
        }
        
        window.errorLogger?.info('chart', 'Price line created');
    }
    
    // Удалить линию цены
    removeExpirationOverlay() {
        // Удаляем PriceLine (линия и цена справа)
        if (this.expirationPriceLine) {
            const activeSeries = this.getActiveSeries();
            if (activeSeries) {
                try {
                    activeSeries.removePriceLine(this.expirationPriceLine);
                } catch (error) {
                    window.errorLogger?.warn('chart', 'Error removing price line', { error: error.message });
                }
            }
            this.expirationPriceLine = null;
        }
    }
    
    // Обновить позицию оверлея экспирации (удалена - больше не используется)
    updateExpirationOverlayPosition() {
        // Removed - no longer displaying time overlay
    }
    
    // Обновить PriceLine с новой ценой (голубая линия)
    updateExpirationPriceLine() {
        if (!this.expirationPriceLine || !this.currentPrice) return;
        
        const activeSeries = this.getActiveSeries();
        if (!activeSeries) return;
        
        try {
            // Удаляем старую линию и создаем новую с обновленной ценой
            activeSeries.removePriceLine(this.expirationPriceLine);
            this.expirationPriceLine = activeSeries.createPriceLine({
                price: this.currentPrice,
                color: '#4f9fff',
                lineWidth: 2,
                lineStyle: LightweightCharts.LineStyle.Solid,
                axisLabelVisible: true,
                title: '',
                axisLabelColor: '#4f9fff',
                axisLabelTextColor: '#ffffff'
            });
            window.errorLogger?.info('chart', 'Price line updated', { price: this.currentPrice });
        } catch (error) {
            window.errorLogger?.error('chart', 'Error updating price line', { error: error.message });
        }
    }
    
    // Обновить оверлей экспирации с временем и таймфреймом
    updateExpirationOverlay(timeframe, formattedTime, timeLeft) {
        // Создаем/обновляем только линию цены
        if (this.chartType !== 'line' && this.currentPrice) {
            if (!this.expirationPriceLine) {
                this.createExpirationOverlay();
            }
            
            // Обновляем HTML элемент с временем экспирации
            this.updateChartTimer(timeframe, formattedTime);
        }
    }
    
    // Обновить таймер экспирации на графике
    updateChartTimer(timeframe, formattedTime) {
        // Находим или создаем элемент для отображения времени
        let timerElement = document.getElementById('chart-expiration-timer');
        
        if (!timerElement) {
            // Создаем элемент если его нет
            timerElement = document.createElement('div');
            timerElement.id = 'chart-expiration-timer';
            timerElement.className = 'chart-expiration-timer';
            
            const chartContainer = document.getElementById('chart');
            if (chartContainer) {
                chartContainer.appendChild(timerElement);
            }
        }
        
        // Обновляем текст
        const timeframeLabel = window.chartTimeframeManager?.getTimeframeLabel(timeframe) || timeframe;
        timerElement.innerHTML = `<span class="timeframe-label">${timeframeLabel}</span> <span class="timer-value">${formattedTime}</span>`;
    }

    // Рассчитать оптимальную длительность интерполяции на основе таймфрейма
    calculateInterpolationDuration() {
        if (!window.chartTimeframeManager) {
            return this.baseInterpolationDuration;
        }
        
        const timeframeDuration = window.chartTimeframeManager.getTimeframeDuration(this.timeframe);
        
        // Для S5 (5 сек) используем базовую скорость 300ms
        // Для более длинных таймфреймов увеличиваем пропорционально
        // Но не линейно, а с коэффициентом замедления
        // M2 (120 сек) = 300ms * (120/5)^0.7 ≈ 2000ms
        const ratio = timeframeDuration / 5; // относительно S5
        const scaledDuration = this.baseInterpolationDuration * Math.pow(ratio, 0.7);
        
        // Ограничиваем максимум до 3000ms для очень длинных таймфреймов
        return Math.min(scaledDuration, 3000);
    }
    
    // 🎨 ИНТЕРПОЛЯЦИЯ - плавная анимация между тиками (60fps визуально)
    // Это создает "Binance-level" плавность даже при 20 тиках/сек
    startInterpolation(fromCandle, toCandle) {
        if (!this.interpolationEnabled || !fromCandle || !toCandle) {
            return;
        }
        
        // Останавливаем предыдущую анимацию если есть
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // КРИТИЧЕСКОЕ ИСПРАВЛЕНИЕ: Рассчитываем длительность на основе таймфрейма
        this.interpolationDuration = this.calculateInterpolationDuration();
        
        window.errorLogger?.debug('interpolation', 'Starting interpolation', {
            timeframe: this.timeframe,
            duration: this.interpolationDuration,
            fromClose: fromCandle.close,
            toClose: toCandle.close
        });
        
        // Инициализируем начальное состояние
        this.currentInterpolatedCandle = { ...fromCandle };
        this.targetCandle = { ...toCandle };
        this.interpolationStartTime = performance.now();
        
        // Запускаем анимацию
        this.animate();
    }
    
    // Анимационный цикл (60fps через requestAnimationFrame)
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
            close: this.lerp(this.currentInterpolatedCandle.close, this.targetCandle.close, eased),
            volume: this.targetCandle.volume // volume обновляется сразу
        };
        
        // Обновляем график
        try {
            const activeSeries = this.getActiveSeries();
            if (activeSeries && this.chartType !== 'line') {
                activeSeries.update(interpolated);
            }
            
            this.volumeSeries.update({
                time: interpolated.time,
                value: interpolated.volume,
                color: interpolated.close >= interpolated.open ? '#26d07c80' : '#ff475780'
            });
            
            // Обновляем отображение цены И линию цены
            this.updatePriceDisplay(interpolated.close);
            
            // ИСПРАВЛЕНИЕ: Обновляем линию цены во время интерполяции
            if (this.expirationPriceLine && this.chartType !== 'line') {
                this.updateExpirationPriceLine();
            }
        } catch (error) {
            window.errorLogger?.error('interpolation', 'Error during animation', {
                error: error.message,
                interpolated: interpolated
            });
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
    
    // Линейная интерполяция между двумя значениями
    lerp(start, end, t) {
        return start + (end - start) * t;
    }
    
    // НОВОЕ: Микро-симуляция движения цены до получения первого реального тика
    // Это решает проблему "замерзшей" синей линии при смене актива
    startInitialPriceAnimation() {
        // Останавливаем предыдущую анимацию если есть
        if (this.initialAnimationTimer) {
            clearInterval(this.initialAnimationTimer);
            this.initialAnimationTimer = null;
        }
        
        let tickCount = 0;
        const MAX_TICKS = 20; // Максимум 20 тиков (5 секунд при 250ms)
        
        this.initialAnimationTimer = setInterval(() => {
            tickCount++;
            
            // Останавливаем симуляцию если получили реальный тик или достигли лимита
            if (this.lastTickTime > 0 || tickCount >= MAX_TICKS) {
                clearInterval(this.initialAnimationTimer);
                this.initialAnimationTimer = null;
                window.errorLogger?.debug('animation', 'Initial price animation stopped', {
                    reason: this.lastTickTime > 0 ? 'real tick received' : 'max ticks reached',
                    tickCount: tickCount
                });
                return;
            }
            
            // Генерируем очень маленькое случайное изменение (±0.02%)
            const microChange = (Math.random() - 0.5) * 0.0004; // ±0.02%
            const newPrice = this.currentPrice * (1 + microChange);
            
            // Обновляем только отображение цены и линию, НЕ трогаем свечи
            this.updatePriceDisplay(newPrice);
            this.currentPrice = newPrice;
            
            // Обновляем линию цены
            if (this.expirationPriceLine && this.chartType !== 'line') {
                this.updateExpirationPriceLine();
            }
        }, 250); // каждые 250ms
        
        window.errorLogger?.debug('animation', 'Initial price animation started', {
            initialPrice: this.currentPrice
        });
    }

    // Смена символа (используем переиспользование соединения)
    async changeSymbol(newSymbol) {
        window.errorLogger?.info('chart', 'Changing symbol', { 
            from: this.symbol, 
            to: newSymbol 
        });

        // 🎯 Останавливаем интерполяцию при смене символа
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.currentInterpolatedCandle = null;
        this.targetCandle = null;
        
        // Останавливаем начальную анимацию если она запущена
        if (this.initialAnimationTimer) {
            clearInterval(this.initialAnimationTimer);
            this.initialAnimationTimer = null;
        }
        
        // Удаляем линию цены и таймер при смене символа
        this.removeExpirationOverlay();
        
        // Удаляем таймер экспирации
        const timerElement = document.getElementById('chart-expiration-timer');
        if (timerElement) {
            timerElement.remove();
        }

        // Очищаем график и сбрасываем счетчики
        if (this.candleSeries) {
            this.candleSeries.setData([]);
        }
        if (this.lineSeries) {
            this.lineSeries.setData([]);
        }
        if (this.barSeries) {
            this.barSeries.setData([]);
        }
        if (this.volumeSeries) {
            this.volumeSeries.setData([]);
        }
        
        // Сбрасываем счетчики и последнюю свечу
        this.candleCount = 0;
        this.lastCandle = null;
        this.currentCandleByTimeframe = null;
        
        // Очищаем сет обработанных свечей
        this.processedCandles.clear();

        // Загружаем данные
        await this.loadHistoricalData(newSymbol);
        
        // Небольшая задержка для гарантии что backend тоже инициализировал генератор
        await new Promise(resolve => setTimeout(resolve, 100));

        // Переиспользуем соединение (если есть) или создаем новое
        this.connectWebSocket(newSymbol);
        
        // ИСПРАВЛЕНИЕ: Линия цены теперь создается сразу после loadHistoricalData
        // Не нужна дополнительная задержка - уже создано выше
        
        window.errorLogger?.info('chart', 'Chart switched successfully', { 
            symbol: newSymbol,
            candleCount: this.candleCount 
        });
        console.log(`Chart switched to ${newSymbol} with ${this.candleCount} candles`);
    }

    // Полная очистка WebSocket соединения
    closeWebSocket() {
        if (this.ws) {
            const currentState = this.ws.readyState;
            
            // Удаляем все обработчики событий чтобы предотвратить утечки и повторные подключения
            this.ws.onopen = null;
            this.ws.onmessage = null;
            this.ws.onerror = null;
            this.ws.onclose = null;
            
            // Закрываем соединение если оно не закрыто
            if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
                this.ws.close(1000, 'Intentional close'); // 1000 = нормальное закрытие
            }
            
            window.errorLogger?.info('websocket', 'WebSocket cleaned up', { 
                previousState: currentState
            });
            
            this.ws = null;
        }
    }

    // НОВОЕ: Установить тип графика
    setChartType(type) {
        if (!this.chart) return;
        
        this.chartType = type;
        
        // Скрываем все серии
        if (this.candleSeries) {
            this.candleSeries.applyOptions({ visible: type === 'candles' });
        }
        if (this.lineSeries) {
            this.lineSeries.applyOptions({ visible: type === 'line' });
        }
        if (this.barSeries) {
            this.barSeries.applyOptions({ visible: type === 'bars' });
        }
        
        // Создаем/удаляем линию цены в зависимости от типа графика
        if (type === 'candles' || type === 'bars') {
            // Создаем линию цены для candles/bars
            if (this.currentPrice) {
                this.createExpirationOverlay();
            }
        } else {
            // Удаляем линию цены для line графика
            this.removeExpirationOverlay();
        }
        
        // Для line графика останавливаем таймер экспирации
        if (type === 'line') {
            if (window.chartTimeframeManager) {
                window.chartTimeframeManager.stopExpirationTimer();
            }
        } else {
            // Для candles/bars перезапускаем таймер
            if (window.chartTimeframeManager) {
                window.chartTimeframeManager.setTimeframe(this.timeframe, (formatted, timeLeft, tf) => {
                    this.updateExpirationOverlay(tf, formatted, timeLeft);
                });
            }
        }
        
        window.errorLogger?.info('chart', 'Chart type changed', { type });
        console.log(`Chart type changed to: ${type}`);
    }
    
    // НОВОЕ: Установить таймфрейм
    setTimeframe(timeframe) {
        this.timeframe = timeframe;
        
        // Обновляем таймер экспирации только для candles/bars
        if (this.chartType !== 'line' && window.chartTimeframeManager) {
            window.chartTimeframeManager.setTimeframe(timeframe, (formatted, timeLeft, tf) => {
                // Обновляем отображение времени экспирации
                this.updateExpirationOverlay(tf, formatted, timeLeft);
            });
        } else if (this.chartType === 'line') {
            // Для line графика убираем таймер
            const timerElement = document.getElementById('chart-expiration-timer');
            if (timerElement) {
                timerElement.remove();
            }
        }
        
        window.errorLogger?.info('chart', 'Timeframe changed', { timeframe });
        console.log(`Timeframe changed to: ${timeframe}`);
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

    // Очистка ресурсов
    destroy() {
        window.errorLogger?.info('chart', 'Destroying chart manager');
        
        this.isDestroyed = true;
        this.isInitialized = false;
        
        // Отменяем все таймеры
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.scrollDebounceTimer) {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = null;
        }
        
        // 🎯 Останавливаем интерполяционную анимацию
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        
        // Останавливаем начальную анимацию
        if (this.initialAnimationTimer) {
            clearInterval(this.initialAnimationTimer);
            this.initialAnimationTimer = null;
        }
        
        // Останавливаем таймер экспирации
        if (window.chartTimeframeManager) {
            window.chartTimeframeManager.destroy();
        }
        
        // Удаляем линию цены
        this.removeExpirationOverlay();
        
        // Полностью очищаем WebSocket
        this.closeWebSocket();

        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }

        this.candleSeries = null;
        this.lineSeries = null;
        this.barSeries = null;
        this.volumeSeries = null;
    }
}

// Глобальный экземпляр менеджера графика
window.chartManager = new ChartManager();

// Диагностический инструмент для отладки
window.chartDiagnostics = {
    getStatus: function() {
        const cm = window.chartManager;
        const status = {
            isInitialized: cm.isInitialized,
            isDestroyed: cm.isDestroyed,
            symbol: cm.symbol,
            candleCount: cm.candleCount,
            connectionId: cm.connectionId,
            websocket: {
                exists: !!cm.ws,
                readyState: cm.ws ? cm.ws.readyState : null,
                readyStateText: cm.ws ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][cm.ws.readyState] : null,
                url: cm.ws ? cm.ws.url : null
            },
            processedCandlesCount: cm.processedCandles.size,
            lastCandle: cm.lastCandle ? {
                time: cm.lastCandle.time,
                timeISO: new Date(cm.lastCandle.time * 1000).toISOString(),
                close: cm.lastCandle.close
            } : null,
            memory: window.performance && window.performance.memory ? {
                totalJSHeapSize: window.performance.memory.totalJSHeapSize,
                usedJSHeapSize: window.performance.memory.usedJSHeapSize,
                jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
                usedPercentage: ((window.performance.memory.usedJSHeapSize / window.performance.memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
            } : 'Not available'
        };
        console.table([status]);
        return status;
    },
    
    // Непрерывный мониторинг
    startMonitoring: function(intervalSeconds = 10) {
        if (this.monitoringInterval) {
            console.log('Monitoring already running. Stop it first with stopMonitoring()');
            return;
        }
        
        console.log(`Starting monitoring every ${intervalSeconds} seconds...`);
        this.monitoringInterval = setInterval(() => {
            const status = this.getStatus();
            console.log(`[${new Date().toISOString()}] Candles: ${status.candleCount}, WS: ${status.websocket.readyStateText}, Memory: ${status.memory?.usedPercentage || 'N/A'}`);
        }, intervalSeconds * 1000);
    },
    
    stopMonitoring: function() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
            console.log('Monitoring stopped');
        }
    }
};

console.log('📊 Chart diagnostics available:');
console.log('  • chartDiagnostics.getStatus() - получить текущий статус');
console.log('  • chartDiagnostics.startMonitoring(10) - начать мониторинг каждые 10 секунд');
console.log('  • chartDiagnostics.stopMonitoring() - остановить мониторинг');
