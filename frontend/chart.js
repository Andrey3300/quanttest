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
        this.updateThrottle = 150; // минимальный интервал между обновлениями (ms) - увеличено в 3 раза
        this.lastCandle = null; // последняя свеча для отслеживания
        this.candleCount = 0; // количество свечей для корректного расчета индексов
        
        // РЕШЕНИЕ #6: Debounce для скролла
        this.scrollDebounceTimer = null;
        this.pendingScrollRange = null;
        
        // РЕШЕНИЕ #1: Контроль autoScale
        this.isAdjustingScale = false;
        
        // Защита от схлопывания
        this.MIN_VISIBLE_BARS = 10; // минимальная ширина видимого диапазона
        this.isRestoringRange = false; // флаг восстановления диапазона
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
                rightOffset: 12, // Отступ справа для последней свечи
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
        
        // РЕШЕНИЕ #7: Защита от схлопывания графика через мониторинг диапазона
        this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
            if (!range || this.isRestoringRange || !this.isInitialized) return;
            
            // Проверяем на схлопывание
            const visibleBars = range.to - range.from;
            const rightOffsetBars = 12;
            const pureVisibleBars = visibleBars - rightOffsetBars;
            
            if (pureVisibleBars < this.MIN_VISIBLE_BARS) {
                window.errorLogger?.error('range', 'Chart collapse detected! Restoring safe range...', {
                    currentRange: { from: range.from, to: range.to },
                    visibleBars: visibleBars,
                    pureVisibleBars: pureVisibleBars,
                    minRequired: this.MIN_VISIBLE_BARS
                });
                console.error('Chart collapse detected! Range too narrow:', pureVisibleBars, 'bars');
                
                // Восстанавливаем безопасный диапазон
                const safeVisibleBars = 100; // отображаем последние 100 свечей
                const safeRange = {
                    from: Math.max(0, this.candleCount - safeVisibleBars),
                    to: Math.max(safeVisibleBars, this.candleCount - 1 + rightOffsetBars)
                };
                
                window.errorLogger?.info('range', 'Restoring safe range', { safeRange });
                
                // Устанавливаем флаг чтобы избежать рекурсии
                this.isRestoringRange = true;
                
                // Применяем с небольшой задержкой
                setTimeout(() => {
                    this.chart.timeScale().setVisibleLogicalRange(safeRange);
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
            
            // Устанавливаем начальный видимый диапазон (последние ~100 свечей)
            if (data.length > 0) {
                // Используем фиксированный отступ справа (rightOffset из настроек)
                const rightOffsetBars = 12; // соответствует rightOffset в настройках
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

    // Подключение к WebSocket
    connectWebSocket(symbol) {
        const wsUrl = window.location.origin.includes('localhost')
            ? 'ws://localhost:3001/ws/chart'
            : `ws://${window.location.host}/ws/chart`;

        try {
            this.ws = new WebSocket(wsUrl);

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
                    const message = JSON.parse(event.data);

                    if (message.type === 'subscribed') {
                        console.log(`Subscribed to ${message.symbol}`);
                    } else if (message.type === 'tick') {
                        // Плавное обновление текущей свечи
                        this.updateCandle(message.data, false);
                    } else if (message.type === 'newCandle') {
                        // Создание новой свечи
                        this.updateCandle(message.data, true);
                    } else if (message.type === 'candle') {
                        // Обратная совместимость
                        this.updateCandle(message.data, false);
                    }
                } catch (error) {
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

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                // Переподключаемся через 5 секунд
                setTimeout(() => {
                    if (this.isInitialized) {
                        console.log('Reconnecting WebSocket...');
                        this.connectWebSocket(symbol);
                    }
                }, 5000);
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
                    console.warn('Ignoring outdated tick - candle time:', candle.time, 'last candle time:', this.lastCandle.time);
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
                // Для новых свечей: время должно быть больше или равно времени последней свечи
                if (candle.time < this.lastCandle.time) {
                    window.errorLogger?.error('chart', 'REJECTED: New candle has older timestamp', {
                        candleTime: candle.time,
                        lastTime: this.lastCandle.time,
                        candleCount: this.candleCount
                    });
                    console.error('New candle has older timestamp - candle:', candle.time, 'last:', this.lastCandle.time);
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
        
        // Троттлинг обновлений - не чаще чем каждые 50ms (только для тиков)
        const now = Date.now();
        if (!isNewCandle && (now - this.lastUpdateTime) < this.updateThrottle) {
            return;
        }
        this.lastUpdateTime = now;

        // РЕШЕНИЕ #3: Отслеживаем успешность добавления свечи
        let actuallyAddedNewCandle = false;
        
        // Обновляем свечу без перерисовки всего графика
        try {
            this.candleSeries.update(candle);
            
            // РЕШЕНИЕ #2: Синхронизация candleCount с реальными данными после обновления
            // Проверяем что свеча ДЕЙСТВИТЕЛЬНО добавлена
            if (isNewCandle && candle.time > beforeUpdateTime) {
                actuallyAddedNewCandle = true;
                
                // Получаем реальное количество свечей из серии для синхронизации
                try {
                    const actualData = this.candleSeries.data();
                    if (actualData && actualData.length > 0) {
                        const realCount = actualData.length;
                        if (realCount !== this.candleCount + 1) {
                            window.errorLogger?.warn('chart', 'Candle count mismatch detected - synchronizing', {
                                expectedCount: this.candleCount + 1,
                                realCount: realCount,
                                difference: realCount - (this.candleCount + 1)
                            });
                        }
                        // Синхронизируем с реальностью
                        this.candleCount = realCount;
                    }
                } catch (err) {
                    // Если не удалось получить данные, используем инкремент
                    this.candleCount++;
                }
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
                            const rightOffsetBars = 12; // фиксированный отступ справа из настроек
                            
                            // Проверяем, находимся ли мы близко к концу графика
                            const lastRealCandleIndex = this.candleCount - 1;
                            const isNearEnd = currentRange.to >= (lastRealCandleIndex - 5);
                            
                            // Логируем текущее состояние ПЕРЕД расчетами
                            window.errorLogger?.debug('range', 'Before scroll calculation', {
                                candleCount: this.candleCount,
                                lastRealCandleIndex: lastRealCandleIndex,
                                currentRange: { from: currentRange.from, to: currentRange.to },
                                isNearEnd: isNearEnd,
                                rightOffsetBars: rightOffsetBars
                            });
                            
                            if (isNearEnd) {
                                // РЕШЕНИЕ #3: ИСПРАВЛЕННЫЙ расчет диапазона
                                // 1. Вычисляем "чистую" ширину видимых свечей БЕЗ rightOffset
                                const totalWidth = currentRange.to - currentRange.from;
                                const pureVisibleBars = Math.max(this.MIN_VISIBLE_BARS, Math.floor(totalWidth - rightOffsetBars));
                                
                                // 2. Рассчитываем новый from относительно последней реальной свечи
                                const newFrom = Math.max(0, lastRealCandleIndex - pureVisibleBars);
                                const newTo = lastRealCandleIndex + rightOffsetBars;
                                
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

    // Смена символа
    async changeSymbol(newSymbol) {
        this.symbol = newSymbol;
        
        // Закрываем старое WebSocket соединение
        if (this.ws) {
            this.ws.close();
        }

        // Очищаем график и сбрасываем счетчики
        if (this.candleSeries) {
            this.candleSeries.setData([]);
        }
        if (this.volumeSeries) {
            this.volumeSeries.setData([]);
        }
        
        // Сбрасываем счетчики и последнюю свечу
        this.candleCount = 0;
        this.lastCandle = null;

        // Загружаем новые данные
        await this.loadHistoricalData(newSymbol);

        // Подключаемся к новому WebSocket
        this.connectWebSocket(newSymbol);
        
        console.log(`Chart switched to ${newSymbol}`);
    }

    // Очистка ресурсов
    destroy() {
        this.isInitialized = false;
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

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
