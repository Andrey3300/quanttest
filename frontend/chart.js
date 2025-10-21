// Chart management module
// Модуль управления графиком

class ChartManager {
    constructor() {
        this.chart = null;
        this.candleSeries = null;
        this.ws = null;
        this.symbol = 'USD_MXN_OTC';
        this.isInitialized = false;
        this.lastCandle = null;
        this.animationInterval = null;
        // Для плавной интерполяции свечей
        this.currentCandle = null; // текущее отображаемое состояние
        this.targetCandle = null;  // целевое состояние к которому движемся
        this.interpolationSpeed = 0.15; // скорость интерполяции (0.15 = 15% за шаг)
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

        console.log(`Initializing chart with dimensions: ${width}x${height}`);

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
                // Автоматическое масштабирование с учетом видимых данных
                autoScale: true,
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
                // Режим масштабирования для лучшей читаемости
                mode: 0, // Normal price scale mode
                // Применяем видимый диапазон только к видимым барам
                entireTextOnly: false,
            },
            timeScale: {
                borderColor: '#2d3748',
                timeVisible: true,
                secondsVisible: true,
                // Улучшенное управление масштабированием
                rightOffset: 12,
                barSpacing: 12,  // Увеличено с 6 до 12 для большего зазора между свечами
                minBarSpacing: 3,  // Увеличено с 0.5 до 3 для минимального зазора
                fixLeftEdge: false,
                fixRightEdge: false,
                // Автоматически прокручиваем к новым данным
                lockVisibleTimeRangeOnResize: true,
                rightBarStaysOnScroll: true,
                // Не сдвигаем видимый диапазон при появлении новых баров (позволяет пользователю самому управлять позицией)
                shiftVisibleRangeOnNewBar: false,
            },
        });

        // Создаем серию свечей с оптимизированными настройками для корректного отображения при масштабировании
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            borderUpColor: '#26d07c',
            borderDownColor: '#ff4757',
            wickUpColor: '#26d07c',
            wickDownColor: '#ff4757',
            // Настройки для корректного отображения при любом масштабе
            // Будут обновлены динамически при загрузке данных
            priceFormat: {
                type: 'price',
                precision: 4,
                minMove: 0.0001,
            },
        });

        // Обработка изменения размера окна
        window.addEventListener('resize', () => {
            if (this.chart && chartContainer) {
                const parentContainer = chartContainer.parentElement;
                const width = parentContainer ? parentContainer.clientWidth : chartContainer.clientWidth;
                const height = parentContainer ? parentContainer.clientHeight : chartContainer.clientHeight;
                
                this.chart.applyOptions({
                    width: width,
                    height: height,
                });
            }
        });

        // Подписываемся на изменения видимого диапазона для корректного масштабирования
        let scaleUpdateTimeout = null;
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            // Используем debounce чтобы не перегружать график частыми обновлениями
            if (scaleUpdateTimeout) {
                clearTimeout(scaleUpdateTimeout);
            }
            
            scaleUpdateTimeout = setTimeout(() => {
                // Принудительно пересчитываем масштаб цены при изменении видимого диапазона
                // Это исправляет проблему с отображением на конце графика
                if (this.chart && this.candleSeries) {
                    try {
                        // Получаем видимые данные для правильного масштабирования
                        const timeScale = this.chart.timeScale();
                        const logicalRange = timeScale.getVisibleLogicalRange();
                        
                        if (logicalRange && logicalRange.from !== null && logicalRange.to !== null) {
                            // Принудительно обновляем масштаб только если диапазон валидный
                            this.chart.applyOptions({
                                rightPriceScale: {
                                    autoScale: true,
                                    scaleMargins: {
                                        top: 0.1,
                                        bottom: 0.1,
                                    },
                                }
                            });
                        }
                    } catch (e) {
                        // Игнорируем ошибки если график еще не готов
                        console.debug('Scale update error (safe to ignore):', e.message);
                    }
                }
            }, 50); // Ждем 50мс перед обновлением
        });

        this.isInitialized = true;
        console.log('Chart initialized');
    }

    // Определение точности цены на основе диапазона цен
    determinePricePrecision(data) {
        if (!data || data.length === 0) return { precision: 4, minMove: 0.0001 };
        
        // Находим среднюю цену
        const avgPrice = data.reduce((sum, candle) => sum + candle.close, 0) / data.length;
        
        if (avgPrice >= 1000) return { precision: 2, minMove: 0.01 };      // Например BTC: 68750.23
        if (avgPrice >= 100) return { precision: 3, minMove: 0.001 };      // Например ETH: 3450.123
        if (avgPrice >= 10) return { precision: 4, minMove: 0.0001 };      // Например USD/MXN: 18.9167
        if (avgPrice >= 1) return { precision: 4, minMove: 0.0001 };       // Например EUR/USD: 1.0850
        if (avgPrice >= 0.1) return { precision: 5, minMove: 0.00001 };    // Например DOGE: 0.14523
        if (avgPrice >= 0.01) return { precision: 6, minMove: 0.000001 };  // Например маленькие пары
        return { precision: 8, minMove: 0.00000001 };                       // Для очень маленьких цен
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

            // Определяем оптимальную точность для этого актива
            const priceFormat = this.determinePricePrecision(data);
            
            // Обновляем формат цены для серии свечей
            this.candleSeries.applyOptions({
                priceFormat: {
                    type: 'price',
                    precision: priceFormat.precision,
                    minMove: priceFormat.minMove,
                }
            });

            // Устанавливаем данные свечей
            this.candleSeries.setData(data);
            
            // Сохраняем последнюю свечу для анимации
            if (data.length > 0) {
                const lastCandle = data[data.length - 1];
                this.lastCandle = {
                    time: lastCandle.time,
                    open: lastCandle.open,
                    high: lastCandle.high,
                    low: lastCandle.low,
                    close: lastCandle.close
                };
                this.currentCandle = {
                    time: lastCandle.time,
                    open: lastCandle.open,
                    high: lastCandle.high,
                    low: lastCandle.low,
                    close: lastCandle.close
                };
                this.targetCandle = {
                    time: lastCandle.time,
                    open: lastCandle.open,
                    high: lastCandle.high,
                    low: lastCandle.low,
                    close: lastCandle.close
                };
            }

            // Автоматически подгоняем видимый диапазон
            this.chart.timeScale().fitContent();
            
            // Принудительно обновляем масштаб цен с правильными настройками
            setTimeout(() => {
                if (this.chart) {
                    // Сначала подгоняем содержимое
                    this.chart.timeScale().fitContent();
                    
                    // Затем обновляем масштаб цен
                    this.chart.applyOptions({
                        rightPriceScale: {
                            autoScale: true,
                            scaleMargins: {
                                top: 0.1,
                                bottom: 0.1,
                            },
                        }
                    });
                    
                    // Дополнительная проверка через небольшую задержку
                    setTimeout(() => {
                        if (this.chart) {
                            this.chart.timeScale().scrollToRealTime();
                        }
                    }, 50);
                }
            }, 100);
            
            // Запускаем анимацию последней свечи
            this.startCandleAnimation();

            console.log(`Loaded ${data.length} candles for ${symbol} with precision ${priceFormat.precision}`);
        } catch (error) {
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
                    } else if (message.type === 'candle') {
                        // Получили новую свечу с сервера (каждые 5 секунд)
                        const isNewCandle = !this.lastCandle || this.lastCandle.time !== message.data.time;
                        this.lastCandle = {
                            time: message.data.time,
                            open: message.data.open,
                            high: message.data.high,
                            low: message.data.low,
                            close: message.data.close
                        };
                        
                        // Если это новая свеча (новый таймфрейм), сразу устанавливаем её без интерполяции
                        if (isNewCandle) {
                            this.currentCandle = {
                                time: message.data.time,
                                open: message.data.open,
                                high: message.data.high,
                                low: message.data.low,
                                close: message.data.close
                            };
                            this.targetCandle = {
                                time: message.data.time,
                                open: message.data.open,
                                high: message.data.high,
                                low: message.data.low,
                                close: message.data.close
                            };
                            this.updateCandleImmediate(message.data);
                            
                            // КРИТИЧНО: После фиксации свечи принудительно обновляем масштаб графика
                            // Это исправляет проблему с отображением, когда новые свечи появляются "в воздухе"
                            setTimeout(() => {
                                if (this.chart && this.candleSeries) {
                                    // Получаем все данные серии для правильного расчета масштаба
                                    const timeScale = this.chart.timeScale();
                                    const visibleRange = timeScale.getVisibleLogicalRange();
                                    
                                    // Принудительно пересчитываем масштаб цен
                                    this.chart.applyOptions({
                                        rightPriceScale: {
                                            autoScale: true,
                                            scaleMargins: {
                                                top: 0.1,
                                                bottom: 0.1,
                                            },
                                        }
                                    });
                                    
                                    // Если пользователь смотрит на правый край графика, подстраиваем видимый диапазон
                                    if (visibleRange && visibleRange.to !== null && visibleRange.to !== undefined) {
                                        const barsCount = Math.floor(visibleRange.to - visibleRange.from);
                                        timeScale.scrollToPosition(3, false); // Небольшой отступ справа
                                    }
                                }
                            }, 50);
                        } else {
                            // Устанавливаем целевую свечу для плавной интерполяции
                            this.setTargetCandle(message.data);
                        }
                    }
                } catch (error) {
                    console.error('Error processing WebSocket message:', error);
                }
            };

            this.ws.onerror = (error) => {
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
            console.error('Error connecting to WebSocket:', error);
        }
    }

    // Установка целевой свечи для плавной интерполяции
    setTargetCandle(candle) {
        if (!this.targetCandle) {
            this.targetCandle = {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
            };
            this.currentCandle = {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
            };
        } else {
            // Обновляем только целевую свечу, интерполяция произойдет в анимации
            this.targetCandle = {
                time: candle.time,
                open: candle.open,
                high: candle.high,
                low: candle.low,
                close: candle.close
            };
        }
    }

    // Немедленное обновление свечи (без интерполяции)
    updateCandleImmediate(candle) {
        if (!this.candleSeries) {
            return;
        }

        // Обновляем свечу
        this.candleSeries.update(candle);

        this.updatePriceDisplay(candle);
    }

    // Обновление свечи с текущим интерполированным состоянием
    updateCandle(candle) {
        if (!this.candleSeries) {
            return;
        }

        // Проверяем валидность данных перед обновлением
        if (!candle || typeof candle.time === 'undefined' || 
            typeof candle.open !== 'number' || typeof candle.high !== 'number' || 
            typeof candle.low !== 'number' || typeof candle.close !== 'number') {
            console.warn('Invalid candle data, skipping update', candle);
            return;
        }
        
        // Проверяем что OHLC значения логичны
        if (candle.high < candle.low || 
            candle.high < candle.open || candle.high < candle.close ||
            candle.low > candle.open || candle.low > candle.close) {
            console.warn('Invalid OHLC relationships, skipping update', candle);
            return;
        }

        // Обновляем свечу
        this.candleSeries.update(candle);

        this.updatePriceDisplay(candle);
    }

    // Обновление отображения цены в интерфейсе
    updatePriceDisplay(candle) {

        const priceEl = document.getElementById('current-price');
        if (priceEl) {
            // Определяем точность отображения
            let precision = 4;
            if (candle.close >= 1000) precision = 2;
            else if (candle.close >= 100) precision = 3;
            else if (candle.close >= 0.1) precision = 4;
            else if (candle.close >= 0.01) precision = 5;
            else if (candle.close >= 0.001) precision = 6;
            else precision = 8;
            
            priceEl.textContent = candle.close.toFixed(precision);
            
            // Добавляем анимацию изменения цены
            priceEl.classList.remove('price-up', 'price-down');
            
            // Определяем направление изменения
            const prevPrice = parseFloat(priceEl.dataset.prevPrice || candle.close);
            if (candle.close > prevPrice) {
                priceEl.classList.add('price-up');
            } else if (candle.close < prevPrice) {
                priceEl.classList.add('price-down');
            }
            
            priceEl.dataset.prevPrice = candle.close;
        }
    }

    // Определить волатильность для анимации на основе цены
    getAnimationVolatility(price) {
        // Для больших цен используем меньшую относительную волатильность
        if (price >= 10000) return 0.0004;  // BTC и др.
        if (price >= 1000) return 0.0005;   // ETH и др.
        if (price >= 100) return 0.0006;
        if (price >= 10) return 0.0007;
        if (price >= 1) return 0.0008;
        return 0.0010;  // Для маленьких цен
    }

    // Линейная интерполяция между двумя значениями
    lerp(start, end, t) {
        return start + (end - start) * t;
    }

    // Анимация последней свечи (каждые 0.3 секунды как запрошено)
    startCandleAnimation() {
        // Останавливаем предыдущую анимацию
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }

        // Запускаем новую анимацию
        this.animationInterval = setInterval(() => {
            if (!this.currentCandle || !this.targetCandle || !this.candleSeries) {
                return;
            }

            // Определяем точность на основе цены
            let precision = 4;
            if (this.currentCandle.close >= 1000) precision = 2;
            else if (this.currentCandle.close >= 100) precision = 3;
            else if (this.currentCandle.close >= 0.1) precision = 4;
            else if (this.currentCandle.close >= 0.01) precision = 5;
            else if (this.currentCandle.close >= 0.001) precision = 6;
            else precision = 8;

            // Плавно интерполируем текущую свечу к целевой
            const animatedCandle = {
                time: this.currentCandle.time, // Явно сохраняем time
                open: this.currentCandle.open,
                high: this.currentCandle.high,
                low: this.currentCandle.low,
                close: this.currentCandle.close
            };
            
            // Интерполируем все значения OHLC
            animatedCandle.open = this.lerp(this.currentCandle.open, this.targetCandle.open, this.interpolationSpeed);
            animatedCandle.high = this.lerp(this.currentCandle.high, this.targetCandle.high, this.interpolationSpeed);
            animatedCandle.low = this.lerp(this.currentCandle.low, this.targetCandle.low, this.interpolationSpeed);
            animatedCandle.close = this.lerp(this.currentCandle.close, this.targetCandle.close, this.interpolationSpeed);
            
            // Применяем точность
            animatedCandle.open = parseFloat(animatedCandle.open.toFixed(precision));
            animatedCandle.high = parseFloat(animatedCandle.high.toFixed(precision));
            animatedCandle.low = parseFloat(animatedCandle.low.toFixed(precision));
            animatedCandle.close = parseFloat(animatedCandle.close.toFixed(precision));
            
            // Убеждаемся что high - самое высокое, а low - самое низкое
            const allPrices = [animatedCandle.open, animatedCandle.close];
            animatedCandle.high = Math.max(animatedCandle.high, ...allPrices);
            animatedCandle.low = Math.min(animatedCandle.low, ...allPrices);
            
            // Обновляем текущую свечу для следующей итерации (с сохранением time)
            this.currentCandle = {
                time: animatedCandle.time,
                open: animatedCandle.open,
                high: animatedCandle.high,
                low: animatedCandle.low,
                close: animatedCandle.close
            };
            
            // Добавляем небольшую микро-анимацию только к close (очень маленькую)
            const baseVolatility = this.getAnimationVolatility(animatedCandle.close);
            const microChange = (Math.random() - 0.5) * 2 * baseVolatility * 0.3; // 30% от обычной волатильности
            const microClose = animatedCandle.close * (1 + microChange);
            animatedCandle.close = parseFloat(microClose.toFixed(precision));
            
            // Обновляем high и low если микро-изменение вышло за пределы
            if (animatedCandle.close > animatedCandle.high) {
                animatedCandle.high = animatedCandle.close;
            }
            if (animatedCandle.close < animatedCandle.low) {
                animatedCandle.low = animatedCandle.close;
            }
            
            // Убедимся что OHLC значения валидны перед обновлением
            if (animatedCandle.high < animatedCandle.low) {
                // Если high меньше low, что-то пошло не так, пропускаем это обновление
                console.warn('Invalid OHLC: high < low, skipping update');
                return;
            }
            
            // Обновляем свечу на графике
            this.updateCandle(animatedCandle);
        }, 300); // каждые 0.3 секунды как запрошено пользователем
    }

    // Остановка анимации
    stopCandleAnimation() {
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
            this.animationInterval = null;
        }
    }

    // Смена символа
    async changeSymbol(newSymbol) {
        this.symbol = newSymbol;
        
        // Останавливаем анимацию старого символа
        this.stopCandleAnimation();
        
        // Закрываем старое WebSocket соединение
        if (this.ws) {
            this.ws.close();
        }

        // Очищаем график и сбрасываем состояние
        if (this.candleSeries) {
            this.candleSeries.setData([]);
        }
        
        // Сбрасываем состояние свечей
        this.lastCandle = null;
        this.currentCandle = null;
        this.targetCandle = null;

        // Загружаем новые данные
        await this.loadHistoricalData(newSymbol);

        // Подключаемся к новому WebSocket
        this.connectWebSocket(newSymbol);
        
        console.log(`Chart switched to ${newSymbol}`);
    }

    // Очистка ресурсов
    destroy() {
        this.isInitialized = false;
        
        // Останавливаем анимацию
        this.stopCandleAnimation();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        if (this.chart) {
            this.chart.remove();
            this.chart = null;
        }

        this.candleSeries = null;
        this.lastCandle = null;
    }
}

// Глобальный экземпляр менеджера графика
window.chartManager = new ChartManager();
