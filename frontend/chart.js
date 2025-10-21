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
        this.animatingCandles = new Map(); // Хранение состояния анимирующихся свечей
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
                barSpacing: 8, // Делаем свечи толще
                minBarSpacing: 4, // Минимальная толщина при максимальном отдалении
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

        const candleKey = candle.time;
        
        // Если свеча уже анимируется, обновляем её финальные значения
        if (this.animatingCandles.has(candleKey)) {
            const animData = this.animatingCandles.get(candleKey);
            animData.finalCandle = { ...candle };
            return;
        }

        // Начинаем анимацию новой свечи
        const animationData = {
            startTime: Date.now(),
            finalCandle: { ...candle },
            currentCandle: { ...candle },
            interval: null,
            timeout: null
        };

        this.animatingCandles.set(candleKey, animationData);

        // Функция анимации свечи
        const animateCandle = () => {
            const elapsed = Date.now() - animationData.startTime;
            const animDuration = 5000; // 5 секунд
            
            if (elapsed >= animDuration) {
                // Анимация завершена - фиксируем свечу
                this.candleSeries.update(animationData.finalCandle);
                this.volumeSeries.update({
                    time: animationData.finalCandle.time,
                    value: animationData.finalCandle.volume,
                    color: animationData.finalCandle.close >= animationData.finalCandle.open ? '#26d07c80' : '#ff475780'
                });
                
                // Останавливаем анимацию
                if (animationData.interval) {
                    clearInterval(animationData.interval);
                }
                if (animationData.timeout) {
                    clearTimeout(animationData.timeout);
                }
                this.animatingCandles.delete(candleKey);
                
                // Обновляем цену в UI
                this.updatePriceDisplay(animationData.finalCandle.close);
                return;
            }

            // Создаём плавное движение вверх-вниз
            const progress = elapsed / animDuration;
            const final = animationData.finalCandle;
            
            // Вычисляем амплитуду колебания (уменьшается со временем)
            const amplitude = (final.high - final.low) * 0.3 * (1 - progress);
            
            // Синусоидальное колебание с частотой ~3.33 раза в секунду (0.3 сек период)
            const oscillation = Math.sin(elapsed / 300 * Math.PI * 2) * amplitude;
            
            // Плавно переходим к финальным значениям
            const lerpFactor = progress * 0.7; // Постепенное схождение к финальным значениям
            
            // Применяем колебание к телу свечи (open/close), а не к хвостам
            const currentCandle = {
                time: final.time,
                open: final.open + oscillation,
                close: final.close * (1 - lerpFactor) + final.close * lerpFactor + oscillation,
                high: final.high,
                low: final.low,
                volume: final.volume
            };

            // Убедимся что high >= max(open, close) и low <= min(open, close)
            currentCandle.high = Math.max(currentCandle.high, currentCandle.open, currentCandle.close);
            currentCandle.low = Math.min(currentCandle.low, currentCandle.open, currentCandle.close);

            // Обновляем свечу на графике
            this.candleSeries.update(currentCandle);
            this.volumeSeries.update({
                time: currentCandle.time,
                value: currentCandle.volume,
                color: currentCandle.close >= currentCandle.open ? '#26d07c80' : '#ff475780'
            });

            // Обновляем цену в UI
            this.updatePriceDisplay(currentCandle.close);
        };

        // Запускаем анимацию каждые 0.3 секунды
        animationData.interval = setInterval(animateCandle, 300);
        
        // Также вызываем сразу
        animateCandle();
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
        
        // Останавливаем все анимации
        this.stopAllAnimations();
        
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

    // Остановка всех анимаций
    stopAllAnimations() {
        this.animatingCandles.forEach((animData) => {
            if (animData.interval) {
                clearInterval(animData.interval);
            }
            if (animData.timeout) {
                clearTimeout(animData.timeout);
            }
        });
        this.animatingCandles.clear();
    }

    // Очистка ресурсов
    destroy() {
        this.isInitialized = false;
        
        // Останавливаем все анимации
        this.stopAllAnimations();
        
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
