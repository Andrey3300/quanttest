// Chart management module
// Модуль управления графиком

class ChartManager {
    constructor() {
        this.chart = null;
        this.candleSeries = null;
        this.volumeSeries = null;
        this.ws = null;
        this.symbol = 'USD_MXN_OTC';
        this.isInitialized = false;
        this.isUserInteracting = false; // флаг взаимодействия пользователя
        this.lastUpdateTime = 0; // время последнего обновления
        this.updateThrottle = 16; // минимальный интервал между обновлениями (ms) - 60 FPS для плавной анимации
        this.lastCandle = null; // последняя свеча для отслеживания
        this.candleCount = 0; // количество свечей для корректного расчета индексов
        this.isDestroyed = false; // флаг уничтожения для предотвращения переподключения
        this.reconnectTimer = null; // таймер переподключения для очистки
        this.connectionId = 0; // уникальный ID соединения для отслеживания
        this.processedCandles = new Set(); // сет для отслеживания обработанных свечей
        this.MAX_CANDLES_IN_MEMORY = 120960; // максимально 7 дней по 5-секундных свечей
        
        // РЕШЕНИЕ #6: Debounce для скролла
        this.scrollDebounceTimer = null;
        this.pendingScrollRange = null;
        
        // РЕШЕНИЕ #1: Контроль autoScale
        this.isAdjustingScale = false;
        
        // Защита от схлопывания
        this.MIN_VISIBLE_BARS = 10; // минимальная ширина видимого диапазона
        this.isRestoringRange = false; // флаг восстановления диапазона
        
        // Плавная анимация для активной свечи
        this.animationState = {
            isAnimating: false,
            animationFrameId: null,
            displayed: null, // текущие отображаемые значения {close, high, low}
            target: null,    // целевые значения {close, high, low}
            candleData: null // полные данные свечи {time, open, close, high, low, volume}
        };
        this.lerpFactor = 0.5; // коэффициент интерполяции (увеличен для мгновенной реакции)
        this.animationThreshold = 0.0001; // минимальная разница для остановки анимации
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
                barSpacing: 12, // Увеличено пространство между свечами (с 8 до 12)
                minBarSpacing: 6, // Увеличена минимальная толщина (с 4 до 6)
                rightOffset: 45, // Отступ справа для комфортного просмотра последней свечи
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
            priceLineVisible: true,
            lastValueVisible: true,
            priceFormat: {
                type: 'price',
                precision: 4,
                minMove: 0.0001,
            },
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
            const rightOffsetBars = 45; // синхронизировано с rightOffset в настройках
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
                const safeVisibleBars = 70; // отображаем последние 70 свечей для большего пространства
                
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

            // Устанавливаем данные свечей
            this.candleSeries.setData(data);
            
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
            this.chart.timeScale().fitContent();
            
            // Устанавливаем начальный видимый диапазон (последние ~70 свечей для большего пространства)
            if (data.length > 0) {
                // Используем фиксированный отступ справа (rightOffset из настроек)
                const rightOffsetBars = 45; // синхронизировано с rightOffset в настройках
                const visibleLogicalRange = {
                    from: Math.max(0, data.length - 70), // уменьшено с 100 до 70
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


    // КРИТИЧЕСКОЕ УЛУЧШЕНИЕ: Подключение к WebSocket с переиспользованием соединения

    connectWebSocket(symbol) {
        const wsUrl = window.location.origin.includes('localhost')
            ? 'ws://localhost:3001/ws/chart'
            : `ws://${window.location.host}/ws/chart`;

        try {

            // РЕШЕНИЕ ПРОБЛЕМЫ WebSocket: Переиспользуем одно соединение
            // Если соединение уже есть и оно активно, просто меняем подписку
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                console.log('Reusing existing WebSocket connection');

                
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


            this.ws = new WebSocket(wsUrl);
            
            // Увеличиваем ID соединения для отслеживания
            this.connectionId++;
            const currentConnectionId = this.connectionId;
            
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

                    } else if (message.type === 'unsubscribed') {
                        console.log(`Unsubscribed from ${message.symbol}`);

                    } else if (message.type === 'tick') {
                        // Обновление текущей свечи
                        this.updateCandle(message.data, false);
                        
                    } else if (message.type === 'newCandle') {
                        // Новая свеча
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
        if (!this.candleSeries || !this.volumeSeries) {
            window.errorLogger?.error('chart', 'updateCandle called but series not initialized');
            return;
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
        
        // РЕШЕНИЕ #3: Отслеживаем успешность добавления свечи
        let actuallyAddedNewCandle = false;
        
        // НОВАЯ ЛОГИКА: Плавная анимация для тиков, прямое обновление для новых свечей
        try {
            if (isNewCandle) {
                // Новая свеча - останавливаем анимацию и обновляем сразу
                this.stopCandleAnimation();
                
                this.candleSeries.update(candle);
                
                // РЕШЕНИЕ #2 ИСПРАВЛЕНО: Надежный подсчет через инкремент
                // НЕ используем candleSeries.data().length т.к. он возвращает только буфер!
                // Проверяем что свеча ДЕЙСТВИТЕЛЬНО добавлена
                if (candle.time > beforeUpdateTime) {
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
                        const allCandles = this.candleSeries.data();
                        
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
                            this.candleSeries.setData(trimmedCandles);
                            
                            // Обновляем счетчик
                            this.candleCount = trimmedCandles.length;
                            
                            // Обновляем последнюю свечу
                            if (trimmedCandles.length > 0) {
                                this.lastCandle = trimmedCandles[trimmedCandles.length - 1];
                            }
                            
                            // Также обрезаем объемы
                            const allVolumes = this.volumeSeries.data();
                            if (allVolumes && allVolumes.length > 0) {
                                const trimmedVolumes = allVolumes.slice(-candlesToKeep);
                                this.volumeSeries.setData(trimmedVolumes);
                            }
                        }
                    }
                }
                
                // Обновляем объем для новой свечи
                this.volumeSeries.update({
                    time: candle.time,
                    value: candle.volume,
                    color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
                });
            } else {
                // Тик текущей свечи - используем плавную анимацию
                // Троттлинг для тиков - не обновляем слишком часто
                const now = Date.now();
                if ((now - this.lastUpdateTime) < this.updateThrottle) {
                    return;
                }
                this.lastUpdateTime = now;
                
                // Запускаем или обновляем анимацию
                this.updateAnimationTarget(candle);
                
                // Объем обновляем без анимации (он накапливается)
                this.volumeSeries.update({
                    time: candle.time,
                    value: candle.volume,
                    color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
                });
            }
        } catch (error) {
            window.errorLogger?.error('chart', 'Error updating chart', {
                error: error.message,
                candle: candle,
                lastCandle: this.lastCandle
            });
            console.error('Error updating chart:', error, 'Candle:', candle, 'Last candle:', this.lastCandle);
            return;
        }
        
        // Обновляем цену в UI
        this.updatePriceDisplay(candle.close);
        
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
                                const rightOffsetBars = 45; // синхронизировано с rightOffset в настройках
                            
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
    }


    // УЛУЧШЕНИЕ: Смена символа с переиспользованием WebSocket
    async changeSymbol(newSymbol) {
        console.log(`Changing symbol from ${this.symbol} to ${newSymbol}`);
        
        // Очищаем график

        if (this.candleSeries) {
            this.candleSeries.setData([]);
        }
        if (this.volumeSeries) {
            this.volumeSeries.setData([]);
        }
        
        // Сбрасываем счетчики и последнюю свечу
        this.candleCount = 0;
        this.lastCandle = null;
        
        // Очищаем сет обработанных свечей
        this.processedCandles.clear();

        // Загружаем данные
        await this.loadHistoricalData(newSymbol);
        
        // Небольшая задержка для гарантии что backend тоже инициализировал генератор
        await new Promise(resolve => setTimeout(resolve, 100));


        // Переиспользуем WebSocket соединение (если есть) или создаем новое
        this.connectWebSocket(newSymbol);
        
        console.log(`✓ Chart switched to ${newSymbol}`);

    }

    // Остановка анимации свечей
    stopCandleAnimation() {
        if (this.animationState.animationFrameId) {
            cancelAnimationFrame(this.animationState.animationFrameId);
            this.animationState.animationFrameId = null;
        }
        this.animationState.isAnimating = false;
        this.animationState.displayed = null;
        this.animationState.target = null;
        this.animationState.candleData = null;
    }

    // Обновление целевых значений анимации
    updateAnimationTarget(candle) {
        if (!this.animationState.isAnimating) {
            // Запускаем новую анимацию
            this.animationState.isAnimating = true;
            this.animationState.candleData = candle;
            this.animationState.displayed = {
                close: candle.close,
                high: candle.high,
                low: candle.low
            };
            this.animationState.target = {
                close: candle.close,
                high: candle.high,
                low: candle.low
            };
            this.animateCandleUpdate();
        } else {
            // Обновляем целевые значения
            this.animationState.target = {
                close: candle.close,
                high: candle.high,
                low: candle.low
            };
            this.animationState.candleData = candle;
        }
    }

    // Плавная анимация обновления свечи
    animateCandleUpdate() {
        if (!this.animationState.isAnimating || !this.candleSeries) {
            return;
        }

        const { displayed, target, candleData } = this.animationState;
        
        // Линейная интерполяция
        displayed.close += (target.close - displayed.close) * this.lerpFactor;
        displayed.high += (target.high - displayed.high) * this.lerpFactor;
        displayed.low += (target.low - displayed.low) * this.lerpFactor;
        
        // Обновляем свечу с новыми интерполированными значениями
        const animatedCandle = {
            time: candleData.time,
            open: candleData.open,
            high: displayed.high,
            low: displayed.low,
            close: displayed.close,
            volume: candleData.volume
        };
        
        this.candleSeries.update(animatedCandle);
        
        // Проверяем достигли ли целевых значений
        const closeEnough = Math.abs(target.close - displayed.close) < this.animationThreshold &&
                           Math.abs(target.high - displayed.high) < this.animationThreshold &&
                           Math.abs(target.low - displayed.low) < this.animationThreshold;
        
        if (!closeEnough) {
            // Продолжаем анимацию
            this.animationState.animationFrameId = requestAnimationFrame(() => this.animateCandleUpdate());
        } else {
            // Анимация завершена, устанавливаем точные значения
            displayed.close = target.close;
            displayed.high = target.high;
            displayed.low = target.low;
            
            const finalCandle = {
                time: candleData.time,
                open: candleData.open,
                high: target.high,
                low: target.low,
                close: target.close,
                volume: candleData.volume
            };
            
            this.candleSeries.update(finalCandle);
        }
    }

    // Закрытие WebSocket соединения
    closeWebSocket() {
        if (this.ws) {
            // Явно отписываемся от текущего символа
            if (this.symbol) {
                try {
                    this.ws.send(JSON.stringify({
                        type: 'unsubscribe',
                        symbol: this.symbol
                    }));
                } catch (error) {
                    console.error('Error sending unsubscribe:', error);
                }
            }
            
            // Закрываем соединение
            this.ws.close(1000, 'Chart manager destroyed');
            this.ws = null;
        }
    }

    // Очистка ресурсов
    destroy() {
        window.errorLogger?.info('chart', 'Destroying chart manager');
        
        this.isDestroyed = true;
        this.isInitialized = false;
        
        // Останавливаем анимацию
        this.stopCandleAnimation();
        
        // Отменяем все таймеры
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.scrollDebounceTimer) {
            clearTimeout(this.scrollDebounceTimer);
            this.scrollDebounceTimer = null;
        }
        
        // Полностью очищаем WebSocket
        this.closeWebSocket();

        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }

        this.candleSeries = null;
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
