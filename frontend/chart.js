// Chart management module
// Имитация графика бинарных опционов

class ChartManager {
    constructor() {
        this.chart = null;
        this.candleSeries = null;
        this.volumeSeries = null;
        this.symbol = 'USD/MXN OTC';
        this.isInitialized = false;
        this.candles = [];
    }

    // Инициализация графика
    init() {
        const chartContainer = document.getElementById('chart');
        if (!chartContainer) {
            console.error('Chart container not found');
            return;
        }

        // Создаем график с темной темой
        this.chart = LightweightCharts.createChart(chartContainer, {
            width: chartContainer.clientWidth,
            height: chartContainer.clientHeight,
            layout: {
                background: { color: '#1a1f2e' },
                textColor: '#a0aec0',
            },
            grid: {
                vertLines: { color: '#2d3748' },
                horzLines: { color: '#2d3748' },
            },
            crosshair: { mode: LightweightCharts.CrosshairMode.Normal },
            rightPriceScale: { borderColor: '#2d3748' },
            timeScale: { borderColor: '#2d3748', timeVisible: true, secondsVisible: true },
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
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            scaleMargins: { top: 0.8, bottom: 0 },
        });

        window.addEventListener('resize', () => {
            this.chart.applyOptions({
                width: chartContainer.clientWidth,
                height: chartContainer.clientHeight,
            });
        });

        this.generateHistoricalData();
        this.startRealtimeUpdates();

        this.isInitialized = true;
        console.log('Chart initialized');
    }

    // Генерация исторических данных
    generateHistoricalData() {
        const now = Math.floor(Date.now() / 1000);
        let lastClose = 18.9167; // начальная цена
        this.candles = [];

        for (let i = 7 * 24 * 60; i >= 0; i--) { // 1 свеча = 5 мин (7 дней)
            const time = now - i * 300;
            const open = lastClose;
            const change = (Math.random() - 0.5) * 0.02; // небольшие колебания
            const close = open * (1 + change);
            const high = Math.max(open, close) * (1 + Math.random() * 0.005);
            const low = Math.min(open, close) * (1 - Math.random() * 0.005);
            const volume = Math.random() * 1000 + 100;

            const candle = { time, open, high, low, close, volume };
            this.candles.push(candle);
            lastClose = close;
        }

        this.candleSeries.setData(this.candles);
        this.volumeSeries.setData(this.candles.map(c => ({
            time: c.time,
            value: c.volume,
            color: c.close >= c.open ? '#26d07c80' : '#ff475780'
        })));

        this.chart.timeScale().fitContent();
    }

    // Реальное обновление свечей каждые 5 секунд
    startRealtimeUpdates() {
        setInterval(() => {
            if (!this.candleSeries) return;

            const lastCandle = this.candles[this.candles.length - 1];
            const now = Math.floor(Date.now() / 1000);
            let newCandle = lastCandle;

            if (now - lastCandle.time >= 5) {
                const open = lastCandle.close;
                const change = (Math.random() - 0.5) * 0.01;
                const close = open * (1 + change);
                const high = Math.max(open, close) * (1 + Math.random() * 0.003);
                const low = Math.min(open, close) * (1 - Math.random() * 0.003);
                const volume = Math.random() * 1000 + 100;

                newCandle = { time: now, open, high, low, close, volume };
                this.candles.push(newCandle);

                // Ограничиваем историю 7 дней
                if (this.candles.length > 2016) this.candles.shift(); // 7*24*60/5мин
            }

            this.candleSeries.update(newCandle);
            this.volumeSeries.update({
                time: newCandle.time,
                value: newCandle.volume,
                color: newCandle.close >= newCandle.open ? '#26d07c80' : '#ff475780'
            });

            // Обновляем текущую цену
            const priceEl = document.getElementById('current-price');
            if (priceEl) {
                const prev = parseFloat(priceEl.dataset.prevPrice || newCandle.close);
                priceEl.textContent = newCandle.close.toFixed(4);
                priceEl.classList.remove('price-up', 'price-down');
                if (newCandle.close > prev) priceEl.classList.add('price-up');
                else if (newCandle.close < prev) priceEl.classList.add('price-down');
                priceEl.dataset.prevPrice = newCandle.close;
            }
        }, 5000);
    }
}

// Глобальный экземпляр менеджера графика
window.chartManager = new ChartManager();

// Инициализация после загрузки страницы
window.addEventListener('DOMContentLoaded', () => {
    window.chartManager.init();
});
