// Chart data generator with Geometric Brownian Motion
// Генератор свечных данных с геометрическим броуновским движением

class ChartGenerator {
    constructor(symbol, basePrice, volatility = 0.002, drift = 0.0, meanReversionSpeed = 0.05) {
        this.symbol = symbol;
        this.basePrice = basePrice;
        this.currentPrice = basePrice;
        this.volatility = volatility; // волатильность
        this.drift = drift; // тренд
        this.meanReversionSpeed = meanReversionSpeed; // скорость возврата к средней
        this.maxCandleChange = 0.008; // максимальное изменение за свечу (0.8%)
        this.candles = [];
    }

    // Генерация случайного числа с нормальным распределением (Box-Muller)
    randomNormal(mean = 0, stdDev = 1) {
        const u1 = Math.random();
        const u2 = Math.random();
        const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
        return mean + z0 * stdDev;
    }

    // Генерация следующей цены с учетом mean-reversion
    generateNextPrice(currentPrice) {
        // Mean reversion: цена стремится вернуться к базовой
        const meanReversionForce = (this.basePrice - currentPrice) * this.meanReversionSpeed;
        
        // Geometric Brownian Motion с повышенной случайностью
        const randomShock = this.randomNormal(0, this.volatility);
        // Добавляем небольшой случайный шум для избежания ступенчатости
        const microNoise = (Math.random() - 0.5) * this.volatility * 0.1;
        const priceChange = this.drift + meanReversionForce + randomShock + microNoise;
        
        // Ограничиваем максимальное изменение
        const limitedChange = Math.max(-this.maxCandleChange, Math.min(this.maxCandleChange, priceChange));
        
        let newPrice = currentPrice * (1 + limitedChange);
        
        // Убедимся что цена положительная и в разумных пределах
        newPrice = Math.max(newPrice, this.basePrice * 0.85);
        newPrice = Math.min(newPrice, this.basePrice * 1.15);
        
        return newPrice;
    }

    // Генерация одной свечи с реалистичным OHLC
    generateCandle(timestamp, openPrice) {
        const close = this.generateNextPrice(openPrice);
        
        // Генерируем high и low с КОРОТКИМИ хвостами как в PocketOption
        // Уменьшаем внутри-свечную волатильность для коротких теней
        const intraVolatility = this.volatility * 0.3; // гораздо меньше для коротких хвостов
        
        // High должен быть выше open и close, но ненамного (короткий хвост)
        const maxPrice = Math.max(openPrice, close);
        const wickUpSize = Math.abs(this.randomNormal(0, intraVolatility));
        // Ограничиваем максимальный размер хвоста до 50% от размера тела свечи
        const bodySize = Math.abs(close - openPrice);
        const maxWickSize = Math.max(bodySize * 0.5, maxPrice * 0.0005); // минимум 0.05%
        const limitedWickUp = Math.min(wickUpSize * maxPrice, maxWickSize);
        const high = maxPrice + limitedWickUp;
        
        // Low должен быть ниже open и close, но ненамного (короткий хвост)
        const minPrice = Math.min(openPrice, close);
        const wickDownSize = Math.abs(this.randomNormal(0, intraVolatility));
        const limitedWickDown = Math.min(wickDownSize * minPrice, maxWickSize);
        const low = minPrice - limitedWickDown;
        
        // Генерируем объем (случайный в диапазоне)
        const baseVolume = 10000;
        const volumeVariance = 0.5;
        const volume = Math.floor(baseVolume * (1 + this.randomNormal(0, volumeVariance)));
        
        return {
            time: Math.floor(timestamp / 1000), // время в секундах для lightweight-charts
            open: parseFloat(openPrice.toFixed(4)),
            high: parseFloat(high.toFixed(4)),
            low: parseFloat(low.toFixed(4)),
            close: parseFloat(close.toFixed(4)),
            volume: Math.max(1000, volume)
        };
    }

    // Генерация исторических данных за 7 дней с шагом 5 секунд
    generateHistoricalData(days = 7, intervalSeconds = 5) {
        const candles = [];
        const now = Date.now();
        const startTime = now - (days * 24 * 60 * 60 * 1000); // 7 дней назад
        const totalCandles = Math.floor((now - startTime) / (intervalSeconds * 1000));
        
        let currentPrice = this.basePrice;
        
        for (let i = 0; i < totalCandles; i++) {
            const timestamp = startTime + (i * intervalSeconds * 1000);
            const candle = this.generateCandle(timestamp, currentPrice);
            candles.push(candle);
            currentPrice = candle.close; // следующая свеча начинается с close предыдущей
        }
        
        this.candles = candles;
        this.currentPrice = currentPrice;
        
        return candles;
    }

    // Генерация новой свечи для real-time обновления
    generateNextCandle() {
        const now = Date.now();
        const candle = this.generateCandle(now, this.currentPrice);
        this.candles.push(candle);
        this.currentPrice = candle.close;
        
        // Ограничиваем размер массива (храним последние 7 дней)
        const maxCandles = 7 * 24 * 60 * 12; // 7 дней * 5-секундные свечи
        if (this.candles.length > maxCandles) {
            this.candles.shift();
        }
        
        return candle;
    }

    // Получение исторических данных
    getHistoricalData(from, to) {
        if (this.candles.length === 0) {
            this.generateHistoricalData();
        }
        
        if (!from && !to) {
            return this.candles;
        }
        
        // Фильтрация по временному диапазону
        return this.candles.filter(candle => {
            const time = candle.time;
            const matchFrom = !from || time >= from;
            const matchTo = !to || time <= to;
            return matchFrom && matchTo;
        });
    }
}

// Singleton инстансы для разных символов
const generators = new Map();

function getGenerator(symbol) {
    if (!generators.has(symbol)) {
        // Настройки для разных символов с уникальными паттернами
        const config = {
            // Currencies - умеренная волатильность для естественного вида
            'USD_MXN_OTC': { basePrice: 18.9167, volatility: 0.003, drift: 0.0001 },
            'EUR_USD_OTC': { basePrice: 1.0850, volatility: 0.0025, drift: -0.0001 },
            'GBP_USD_OTC': { basePrice: 1.2650, volatility: 0.0028, drift: 0.0002 },
            'USD_CAD': { basePrice: 1.3550, volatility: 0.0026, drift: 0.0 },
            'AUD_CAD_OTC': { basePrice: 0.8820, volatility: 0.0029, drift: 0.0001 },
            'BHD_CNY_OTC': { basePrice: 18.6500, volatility: 0.0022, drift: 0.0 },
            'EUR_CHF_OTC': { basePrice: 0.9420, volatility: 0.0024, drift: -0.0001 },
            'EUR_CHF_OTC2': { basePrice: 0.9425, volatility: 0.0023, drift: 0.0001 },
            'KES_USD_OTC': { basePrice: 0.0077, volatility: 0.0035, drift: 0.0 },
            'TND_USD_OTC': { basePrice: 0.3190, volatility: 0.0027, drift: 0.0 },
            'UAH_USD_OTC': { basePrice: 0.0244, volatility: 0.0038, drift: -0.0002 },
            'USD_BDT_OTC': { basePrice: 0.0092, volatility: 0.0032, drift: 0.0 },
            'USD_CNH_OTC': { basePrice: 7.2450, volatility: 0.0029, drift: 0.0001 },
            'USD_IDR_OTC': { basePrice: 0.000063, volatility: 0.0031, drift: 0.0 },
            'USD_MYR_OTC': { basePrice: 4.4650, volatility: 0.0028, drift: 0.0 },
            'AUD_NZD_OTC': { basePrice: 1.0920, volatility: 0.0027, drift: 0.0001 },
            'USD_PHP_OTC': { basePrice: 0.0178, volatility: 0.0030, drift: 0.0 },
            'ZAR_USD_OTC': { basePrice: 0.0548, volatility: 0.0034, drift: -0.0001 },
            'YER_USD_OTC': { basePrice: 0.0040, volatility: 0.0036, drift: 0.0 },
            'USD_BRL_OTC': { basePrice: 5.6250, volatility: 0.0033, drift: 0.0002 },
            'USD_EGP_OTC': { basePrice: 0.0204, volatility: 0.0037, drift: 0.0 },
            'OMR_CNY_OTC': { basePrice: 18.3500, volatility: 0.0025, drift: 0.0 },
            'AUD_JPY_OTC': { basePrice: 96.850, volatility: 0.0029, drift: 0.0001 },
            'EUR_GBP_OTC': { basePrice: 0.8580, volatility: 0.0026, drift: 0.0 },
            'EUR_HUF_OTC': { basePrice: 393.50, volatility: 0.0032, drift: 0.0001 },
            'EUR_TRY_OTC': { basePrice: 37.250, volatility: 0.0040, drift: 0.0003 },
            'USD_JPY_OTC': { basePrice: 149.850, volatility: 0.0028, drift: 0.0 },
            'USD_CHF_OTC': { basePrice: 0.8690, volatility: 0.0025, drift: -0.0001 },
            'AUD_CHF': { basePrice: 0.5820, volatility: 0.0027, drift: 0.0 },
            'CHF_JPY': { basePrice: 172.450, volatility: 0.0029, drift: 0.0001 },
            'EUR_AUD': { basePrice: 1.6350, volatility: 0.0028, drift: 0.0 },
            'EUR_CHF': { basePrice: 0.9435, volatility: 0.0024, drift: 0.0 },
            'EUR_GBP': { basePrice: 0.8575, volatility: 0.0026, drift: 0.0 },
            'EUR_JPY': { basePrice: 162.650, volatility: 0.0027, drift: 0.0001 },
            'EUR_USD': { basePrice: 1.0855, volatility: 0.0025, drift: 0.0 },
            'GBP_CAD': { basePrice: 1.7150, volatility: 0.0030, drift: 0.0001 },
            'GBP_CHF': { basePrice: 1.1020, volatility: 0.0028, drift: 0.0 },
            'GBP_USD': { basePrice: 1.2655, volatility: 0.0028, drift: 0.0 },
            
            // Cryptocurrencies - higher volatility для более естественного вида
            'BTC': { basePrice: 68500, volatility: 0.0120, drift: 0.0005 },
            'BTC_OTC': { basePrice: 68750, volatility: 0.0125, drift: 0.0004 },
            'BTC_ETF_OTC': { basePrice: 68600, volatility: 0.0118, drift: 0.0003 },
            'ETH_OTC': { basePrice: 3450, volatility: 0.0140, drift: 0.0006 },
            'BNB_OTC': { basePrice: 585, volatility: 0.0145, drift: 0.0005 },
            'SOL_OTC': { basePrice: 168, volatility: 0.0180, drift: 0.0008 },
            'ADA_OTC': { basePrice: 0.58, volatility: 0.0165, drift: 0.0004 },
            'DOGE_OTC': { basePrice: 0.14, volatility: 0.0190, drift: 0.0002 },
            'DOT_OTC': { basePrice: 7.2, volatility: 0.0155, drift: 0.0003 },
            'MATIC_OTC': { basePrice: 0.78, volatility: 0.0170, drift: 0.0005 },
            'LTC_OTC': { basePrice: 85, volatility: 0.0150, drift: 0.0004 },
            'LINK_OTC': { basePrice: 15.8, volatility: 0.0160, drift: 0.0003 },
            'AVAX_OTC': { basePrice: 38.5, volatility: 0.0168, drift: 0.0006 },
            'TRX_OTC': { basePrice: 0.168, volatility: 0.0148, drift: 0.0002 },
            'TON_OTC': { basePrice: 5.6, volatility: 0.0185, drift: 0.0007 },
            
            // Commodities - moderate volatility
            'GOLD_OTC': { basePrice: 2650, volatility: 0.0035, drift: 0.0002 },
            'SILVER_OTC': { basePrice: 31.5, volatility: 0.0045, drift: 0.0001 },
            'BRENT_OTC': { basePrice: 87.5, volatility: 0.0050, drift: 0.0003 },
            'WTI_OTC': { basePrice: 83.8, volatility: 0.0052, drift: 0.0002 },
            'NATGAS_OTC': { basePrice: 3.2, volatility: 0.0070, drift: 0.0004 },
            'PALLADIUM_OTC': { basePrice: 1050, volatility: 0.0055, drift: 0.0001 },
            'PLATINUM_OTC': { basePrice: 980, volatility: 0.0048, drift: 0.0002 }
        };
        
        const symbolConfig = config[symbol] || { basePrice: 100, volatility: 0.002, drift: 0.0 };
        generators.set(symbol, new ChartGenerator(
            symbol,
            symbolConfig.basePrice,
            symbolConfig.volatility,
            symbolConfig.drift
        ));
    }
    return generators.get(symbol);
}

module.exports = { ChartGenerator, getGenerator };
