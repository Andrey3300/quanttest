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
        this.updateThrottle = 50; // минимальный интервал между обновлениями (ms)
        this.lastCandle = null; // последняя свеча для отслеживания
        this.candleCount = 0; // количество свечей для корректного расчета индексов
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

        this.isInitialized = true;
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

    // Обновление свечи с оптимизацией
    updateCandle(candle, isNewCandle = false) {
        if (!this.candleSeries || !this.volumeSeries) {
            return;
        }

        // Проверяем корректность данных
        if (!candle || typeof candle.time === 'undefined') {
            console.warn('Invalid candle data received');
            return;
        }
        
        // Валидация OHLC - критически важно!
        if (candle.high < candle.low || 
            candle.high < candle.open || 
            candle.high < candle.close ||
            candle.low > candle.open ||
            candle.low > candle.close) {
            console.error('Invalid OHLC data:', candle);
            return;
        }
        
        // Троттлинг обновлений - не чаще чем каждые 50ms (только для тиков)
        const now = Date.now();
        if (!isNewCandle && (now - this.lastUpdateTime) < this.updateThrottle) {
            return;
        }
        this.lastUpdateTime = now;

        // Обновляем свечу без перерисовки всего графика
        this.candleSeries.update(candle);
        this.volumeSeries.update({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
        });
        
        // Обновляем цену в UI
        this.updatePriceDisplay(candle.close);
        
        // Если это новая свеча, обновляем счетчик и прокручиваем график
        if (isNewCandle) {
            console.log('New candle created:', candle.time, 'open:', candle.open, 'close:', candle.close);
            
            // Увеличиваем счетчик свечей
            this.candleCount++;
            this.lastCandle = candle;
            
            // Плавно прокручиваем к последней свече только если пользователь не взаимодействует
            if (!this.isUserInteracting) {
                try {
                    const timeScale = this.chart.timeScale();
                    const currentRange = timeScale.getVisibleLogicalRange();
                    
                    if (currentRange) {
                        const rightOffsetBars = 12; // фиксированный отступ справа из настроек
                        
                        // Проверяем, находимся ли мы близко к концу графика
                        // Если текущий диапазон включает последние свечи (в пределах 5 свечей от конца)
                        const isNearEnd = currentRange.to >= (this.candleCount - 1 - 5);
                        
                        if (isNearEnd) {
                            // Вычисляем ширину видимого диапазона в свечах
                            const rangeWidth = currentRange.to - currentRange.from;
                            
                            // Создаем новый диапазон, сохраняя ту же ширину
                            // Новая последняя свеча имеет индекс this.candleCount - 1
                            const newRange = {
                                from: this.candleCount - 1 + rightOffsetBars - rangeWidth,
                                to: this.candleCount - 1 + rightOffsetBars
                            };
                            
                            // Устанавливаем новый диапазон БЕЗ анимации для плавного обновления
                            timeScale.setVisibleLogicalRange(newRange);
                        }
                    }
                } catch (error) {
                    console.error('Error scrolling chart:', error);
                }
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
