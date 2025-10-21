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

        // Создаем серию объемов
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

            // Устанавливаем данные объемов
            const volumeData = data.map(candle => ({
                time: candle.time,
                value: candle.volume,
                color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
            }));
            this.volumeSeries.setData(volumeData);

            // Автоматически подгоняем видимый диапазон
            this.chart.timeScale().fitContent();

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
                        // Обновляем или добавляем новую свечу
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
        if (!this.candleSeries || !this.volumeSeries) {
            return;
        }

        // Обновляем свечу
        this.candleSeries.update(candle);

        // Обновляем объем
        this.volumeSeries.update({
            time: candle.time,
            value: candle.volume,
            color: candle.close >= candle.open ? '#26d07c80' : '#ff475780'
        });

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

    // Смена символа
    async changeSymbol(newSymbol) {
        this.symbol = newSymbol;
        
        // Закрываем старое WebSocket соединение
        if (this.ws) {
            this.ws.close();
        }

        // Очищаем график
        if (this.candleSeries) {
            this.candleSeries.setData([]);
        }
        if (this.volumeSeries) {
            this.volumeSeries.setData([]);
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
