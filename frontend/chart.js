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
            },
            timeScale: {
                borderColor: '#2d3748',
                timeVisible: true,
                secondsVisible: true,
            },
        });

        // Создаем серию свечей
        this.candleSeries = this.chart.addCandlestickSeries({
            upColor: '#26d07c',
            downColor: '#ff4757',
            borderUpColor: '#26d07c',
            borderDownColor: '#ff4757',
            wickUpColor: '#26d07c',
            wickDownColor: '#ff4757',
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
            
            // Сохраняем последнюю свечу для анимации
            if (data.length > 0) {
                this.lastCandle = { ...data[data.length - 1] };
            }

            // Автоматически подгоняем видимый диапазон
            this.chart.timeScale().fitContent();
            
            // Запускаем анимацию последней свечи
            this.startCandleAnimation();

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
                    } else if (message.type === 'candle') {
                        // Получили новую свечу с сервера (каждые 5 секунд)
                        this.lastCandle = { ...message.data };
                        this.updateCandle(message.data);
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
            priceEl.textContent = candle.close.toFixed(4);
            
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
            
            // Генерируем небольшое случайное изменение цены (±0.02%)
            const volatility = 0.0002;
            const priceChange = (Math.random() - 0.5) * 2 * volatility;
            const newClose = animatedCandle.close * (1 + priceChange);
            
            // Обновляем close
            animatedCandle.close = parseFloat(newClose.toFixed(4));
            
            // Обновляем high и low если нужно
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
