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
                barSpacing: 6,
                minBarSpacing: 0.5,
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
        this.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
            // Принудительно пересчитываем масштаб цены при изменении видимого диапазона
            // Это исправляет проблему с отображением на конце графика
            if (this.chart && this.candleSeries) {
                try {
                    // Получаем видимые данные для правильного масштабирования
                    const timeScale = this.chart.timeScale();
                    const logicalRange = timeScale.getVisibleLogicalRange();
                    
                    if (logicalRange) {
                        // Принудительно обновляем масштаб
                        this.chart.applyOptions({
                            rightPriceScale: {
                                autoScale: true,
                            }
                        });
                    }
                } catch (e) {
                    // Игнорируем ошибки если график еще не готов
                }
            }
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
                this.lastCandle = { ...data[data.length - 1] };
            }

            // Автоматически подгоняем видимый диапазон
            this.chart.timeScale().fitContent();
            
            // Принудительно обновляем масштаб цен
            setTimeout(() => {
                if (this.chart) {
                    this.chart.applyOptions({
                        rightPriceScale: {
                            autoScale: true,
                        }
                    });
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
                        this.lastCandle = { ...message.data };
                        this.updateCandle(message.data);
                        
                        // Не прокручиваем автоматически - пользователь сам управляет позицией графика
                        // Только обновляем масштаб цен для корректного отображения новых данных
                        if (isNewCandle && this.chart) {
                            this.chart.applyOptions({
                                rightPriceScale: {
                                    autoScale: true,
                                }
                            });
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

    // Обновление свечи
    updateCandle(candle) {
        if (!this.candleSeries) {
            return;
        }

        // Обновляем свечу
        this.candleSeries.update(candle);

        // Обновляем текущую цену в интерфейсе
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

    // Анимация последней свечи (каждые 0.3 секунды)
    startCandleAnimation() {
        // Останавливаем предыдущую анимацию
        if (this.animationInterval) {
            clearInterval(this.animationInterval);
        }

        // Запускаем новую анимацию
        this.animationInterval = setInterval(() => {
            if (!this.lastCandle || !this.candleSeries) {
                return;
            }

            // Создаем копию последней свечи
            const animatedCandle = { ...this.lastCandle };
            
            // Генерируем небольшое случайное изменение цены с повышенной детализацией
            // Используем разную волатильность для разных активов
            const baseVolatility = this.getAnimationVolatility(animatedCandle.close);
            const priceChange = (Math.random() - 0.5) * 2 * baseVolatility;
            const newClose = animatedCandle.close * (1 + priceChange);
            
            // Определяем точность на основе цены
            let precision = 4;
            if (animatedCandle.close >= 1000) precision = 2;
            else if (animatedCandle.close >= 100) precision = 3;
            else if (animatedCandle.close >= 0.1) precision = 4;
            else if (animatedCandle.close >= 0.01) precision = 5;
            else if (animatedCandle.close >= 0.001) precision = 6;
            else precision = 8;
            
            // Обновляем close с правильной точностью (избегаем ступенчатости)
            animatedCandle.close = parseFloat(newClose.toFixed(precision));
            
            // Обновляем high и low если нужно, но с ограничением размера теней
            if (animatedCandle.close > animatedCandle.high) {
                animatedCandle.high = animatedCandle.close;
            }
            if (animatedCandle.close < animatedCandle.low) {
                animatedCandle.low = animatedCandle.close;
            }
            
            // Обновляем свечу на графике
            this.updateCandle(animatedCandle);
        }, 300); // каждые 0.3 секунды
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

        // Очищаем график
        if (this.candleSeries) {
            this.candleSeries.setData([]);
        }

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
