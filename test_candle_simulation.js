// 🧪 CANDLE GENERATION SIMULATOR
// Тестируем разные алгоритмы генерации свечей БЕЗ запуска сервера
// Цель: Плавное движение как на Pocket Option (большие движения OK, но без резких скачков)

// ===== КОНФИГУРАЦИЯ ТЕСТОВ =====
const TESTS = [
    {
        name: 'CURRENT (с жесткими границами 0.85-1.15)',
        config: {
            basePrice: 1.0,
            volatility: 0.002,
            useBoundaries: true,
            boundaryMin: 0.85,
            boundaryMax: 1.15,
            meanReversionStrength: 0.05,
            trendStrength: 0.0003
        }
    },
    {
        name: 'NO BOUNDARIES (без ограничений)',
        config: {
            basePrice: 1.0,
            volatility: 0.002,
            useBoundaries: false,
            meanReversionStrength: 0.05,
            trendStrength: 0.0003
        }
    },
    {
        name: 'SOFT BOUNDARIES (мягкие через mean reversion)',
        config: {
            basePrice: 1.0,
            volatility: 0.002,
            useBoundaries: false,
            meanReversionStrength: 0.15, // Усилен возврат к базе
            trendStrength: 0.0003
        }
    },
    {
        name: 'DYNAMIC RANGE (±20% от текущей цены)',
        config: {
            basePrice: 1.0,
            volatility: 0.002,
            useBoundaries: 'dynamic',
            dynamicRange: 0.20, // ±20% от текущей цены
            meanReversionStrength: 0.05,
            trendStrength: 0.0003
        }
    },
    {
        name: 'POCKET OPTION STYLE (увеличена волатильность + мягкие границы)',
        config: {
            basePrice: 1.0,
            volatility: 0.004, // Увеличена в 2 раза
            useBoundaries: false,
            meanReversionStrength: 0.08, // Средний возврат
            trendStrength: 0.0006 // Усилен тренд
        }
    },
    {
        name: 'HIGH VOLATILITY (очень большие движения)',
        config: {
            basePrice: 1.0,
            volatility: 0.008, // Увеличена в 4 раза
            useBoundaries: false,
            meanReversionStrength: 0.10,
            trendStrength: 0.0010
        }
    }
];

// ===== СИМУЛЯТОР СВЕЧЕЙ =====
class CandleSimulator {
    constructor(config) {
        this.basePrice = config.basePrice;
        this.currentPrice = config.basePrice;
        this.volatility = config.volatility;
        this.useBoundaries = config.useBoundaries;
        this.boundaryMin = config.boundaryMin;
        this.boundaryMax = config.boundaryMax;
        this.dynamicRange = config.dynamicRange;
        this.meanReversionStrength = config.meanReversionStrength;
        this.trendStrength = config.trendStrength;
        
        // Трендовая система
        this.trendCounter = 40 + Math.random() * 80;
        this.trendDir = (Math.random() - 0.5) * 2;
    }
    
    // Box-Muller нормальное распределение
    gaussianRandom() {
        let u = 0, v = 0;
        while (u === 0) u = Math.random();
        while (v === 0) v = Math.random();
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    
    // Генерация следующей цены
    generateNextPrice(currentPrice) {
        // 1. Обновление тренда
        this.trendCounter--;
        if (this.trendCounter <= 0) {
            this.trendCounter = 40 + Math.random() * 80;
            this.trendDir = (Math.random() - 0.5) * 2;
        }
        
        // 2. Базовая волатильность (рыночный шум)
        const noise = (Math.random() - 0.5) * this.volatility;
        
        // 3. Трендовая составляющая
        const trend = this.trendDir * this.trendStrength;
        
        // 4. Mean reversion (возврат к базовой цене)
        const deviation = (this.basePrice - currentPrice) / this.basePrice;
        const meanReversion = deviation * this.meanReversionStrength;
        
        // 5. Имитация рыночного пульса
        const pulse = Math.sin(Date.now() / 3000) * 0.0003;
        
        // Суммируем все факторы
        let nextPrice = currentPrice + trend + noise + meanReversion + pulse;
        
        // 6. Применяем границы (если нужны)
        if (this.useBoundaries === true) {
            // Жесткие границы относительно базовой цены
            const minPrice = this.basePrice * this.boundaryMin;
            const maxPrice = this.basePrice * this.boundaryMax;
            nextPrice = Math.max(minPrice, Math.min(maxPrice, nextPrice));
        } else if (this.useBoundaries === 'dynamic') {
            // Динамические границы относительно ТЕКУЩЕЙ цены
            const minPrice = currentPrice * (1 - this.dynamicRange);
            const maxPrice = currentPrice * (1 + this.dynamicRange);
            nextPrice = Math.max(minPrice, Math.min(maxPrice, nextPrice));
        }
        // Если false - без границ вообще
        
        return parseFloat(nextPrice.toFixed(6));
    }
    
    // Генерация серии свечей
    generateCandles(count, timeframeSeconds = 5) {
        const candles = [];
        let price = this.basePrice;
        let time = Math.floor(Date.now() / 1000);
        
        for (let i = 0; i < count; i++) {
            // Генерируем тики внутри свечи (симулируем таймфрейм)
            const ticksPerCandle = Math.floor(timeframeSeconds / 0.05); // Тики каждые 50ms
            
            const open = price;
            let high = price;
            let low = price;
            
            // Генерируем тики для этой свечи
            for (let t = 0; t < ticksPerCandle; t++) {
                price = this.generateNextPrice(price);
                high = Math.max(high, price);
                low = Math.min(low, price);
            }
            
            const close = price;
            
            candles.push({
                time,
                open,
                high,
                low,
                close,
                // Дополнительная информация для анализа
                bodySize: Math.abs(close - open),
                wickSize: (high - low) - Math.abs(close - open),
                totalRange: high - low
            });
            
            time += timeframeSeconds;
        }
        
        return candles;
    }
}

// ===== АНАЛИЗ РЕЗУЛЬТАТОВ =====
function analyzeCandles(candles, testName, config) {
    // Статистика по ценам
    const prices = candles.map(c => c.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    
    // Статистика по изменениям между свечами
    const changes = [];
    for (let i = 1; i < candles.length; i++) {
        const change = Math.abs(candles[i].close - candles[i-1].close);
        const changePercent = (change / candles[i-1].close) * 100;
        changes.push({ absolute: change, percent: changePercent });
    }
    
    const avgChange = changes.reduce((a, b) => a + b.absolute, 0) / changes.length;
    const maxChange = Math.max(...changes.map(c => c.absolute));
    const avgChangePercent = changes.reduce((a, b) => a + b.percent, 0) / changes.length;
    const maxChangePercent = Math.max(...changes.map(c => c.percent));
    
    // Статистика по размерам свечей
    const bodySizes = candles.map(c => c.bodySize);
    const wickSizes = candles.map(c => c.wickSize);
    const totalRanges = candles.map(c => c.totalRange);
    
    const avgBodySize = bodySizes.reduce((a, b) => a + b, 0) / bodySizes.length;
    const maxBodySize = Math.max(...bodySizes);
    const avgWickSize = wickSizes.reduce((a, b) => a + b, 0) / wickSizes.length;
    const avgTotalRange = totalRanges.reduce((a, b) => a + b, 0) / totalRanges.length;
    const maxTotalRange = Math.max(...totalRanges);
    
    // Проверка на резкие скачки (> 1% за свечу = ПЛОХО)
    const sharpJumps = changes.filter(c => c.percent > 1.0);
    const extremeJumps = changes.filter(c => c.percent > 2.0);
    
    // Проверка на "свечи во весь экран" (> 5% диапазон = ПЛОХО)
    const hugeCandles = candles.filter(c => (c.totalRange / config.basePrice) * 100 > 5.0);
    
    // Диапазон движения от базовой цены
    const priceRangeFromBase = ((maxPrice - minPrice) / config.basePrice) * 100;
    const maxDeviationFromBase = Math.max(
        Math.abs(maxPrice - config.basePrice),
        Math.abs(minPrice - config.basePrice)
    ) / config.basePrice * 100;
    
    return {
        testName,
        config,
        stats: {
            // Ценовой диапазон
            minPrice: minPrice.toFixed(6),
            maxPrice: maxPrice.toFixed(6),
            avgPrice: avgPrice.toFixed(6),
            priceRange: (maxPrice - minPrice).toFixed(6),
            priceRangePercent: priceRangeFromBase.toFixed(2) + '%',
            maxDeviationFromBase: maxDeviationFromBase.toFixed(2) + '%',
            
            // Изменения между свечами
            avgChange: avgChange.toFixed(6),
            maxChange: maxChange.toFixed(6),
            avgChangePercent: avgChangePercent.toFixed(4) + '%',
            maxChangePercent: maxChangePercent.toFixed(4) + '%',
            
            // Размеры свечей
            avgBodySize: avgBodySize.toFixed(6),
            maxBodySize: maxBodySize.toFixed(6),
            avgWickSize: avgWickSize.toFixed(6),
            avgTotalRange: avgTotalRange.toFixed(6),
            maxTotalRange: maxTotalRange.toFixed(6),
            
            // Проблемы
            sharpJumpsCount: sharpJumps.length,
            extremeJumpsCount: extremeJumps.length,
            hugeCandlesCount: hugeCandles.length,
            
            // Оценка качества
            isSmooth: sharpJumps.length === 0 && extremeJumps.length === 0,
            hasReasonableSize: hugeCandles.length === 0,
            quality: getQualityRating(sharpJumps.length, extremeJumps.length, hugeCandles.length, priceRangeFromBase)
        }
    };
}

// Оценка качества (0-10)
function getQualityRating(sharpJumps, extremeJumps, hugeCandles, priceRange) {
    let rating = 10;
    
    // Штраф за резкие скачки
    rating -= sharpJumps * 0.1;
    rating -= extremeJumps * 0.3;
    
    // Штраф за огромные свечи
    rating -= hugeCandles * 0.2;
    
    // Штраф за слишком узкий диапазон (< 2%) - скучно
    if (priceRange < 2.0) {
        rating -= (2.0 - priceRange);
    }
    
    // Штраф за слишком широкий диапазон (> 15%) - нереалистично для 5 минут
    if (priceRange > 15.0) {
        rating -= (priceRange - 15.0) * 0.5;
    }
    
    return Math.max(0, Math.min(10, rating)).toFixed(1);
}

// Визуализация ценового движения (ASCII график)
function visualizePrice(candles, width = 80, height = 20) {
    const prices = candles.map(c => c.close);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice;
    
    if (priceRange === 0) return 'No price movement';
    
    // Создаем 2D массив для графика
    const chart = Array(height).fill(null).map(() => Array(width).fill(' '));
    
    // Наносим цены
    const step = candles.length / width;
    for (let x = 0; x < width; x++) {
        const candleIdx = Math.floor(x * step);
        if (candleIdx >= candles.length) continue;
        
        const price = candles[candleIdx].close;
        const normalizedPrice = (price - minPrice) / priceRange;
        const y = Math.floor((1 - normalizedPrice) * (height - 1));
        
        chart[y][x] = '█';
    }
    
    // Формируем строки
    const lines = chart.map((row, idx) => {
        const price = minPrice + (priceRange * (1 - idx / (height - 1)));
        return `${price.toFixed(4)} │${row.join('')}`;
    });
    
    // Добавляем разметку
    lines.push('        └' + '─'.repeat(width));
    lines.push(`         0${' '.repeat(Math.floor(width/2) - 8)}${Math.floor(candles.length/2)}${' '.repeat(Math.floor(width/2) - 8)}${candles.length}`);
    
    return lines.join('\n');
}

// ===== ЗАПУСК ТЕСТОВ =====
console.log('🧪 CANDLE GENERATION SIMULATOR\n');
console.log('Генерируем 1000 свечей с разными настройками');
console.log('Цель: Плавное движение как на Pocket Option\n');
console.log('='.repeat(100));

const results = [];

for (const test of TESTS) {
    console.log('\n' + '='.repeat(100));
    console.log(`📊 ТЕСТ: ${test.name}`);
    console.log('='.repeat(100));
    
    // Генерируем свечи
    const simulator = new CandleSimulator(test.config);
    const candles = simulator.generateCandles(1000, 5); // 1000 свечей по 5 секунд
    
    // Анализируем
    const analysis = analyzeCandles(candles, test.name, test.config);
    results.push(analysis);
    
    // Выводим результаты
    console.log('\n📈 ЦЕНОВОЕ ДВИЖЕНИЕ:');
    console.log(`   Диапазон: ${analysis.stats.minPrice} - ${analysis.stats.maxPrice} (${analysis.stats.priceRange})`);
    console.log(`   Отклонение от базы: ${analysis.stats.priceRangePercent} (макс: ${analysis.stats.maxDeviationFromBase})`);
    
    console.log('\n📊 ИЗМЕНЕНИЯ МЕЖДУ СВЕЧАМИ:');
    console.log(`   Среднее: ${analysis.stats.avgChange} (${analysis.stats.avgChangePercent})`);
    console.log(`   Максимум: ${analysis.stats.maxChange} (${analysis.stats.maxChangePercent})`);
    
    console.log('\n🕯️  РАЗМЕРЫ СВЕЧЕЙ:');
    console.log(`   Среднее тело: ${analysis.stats.avgBodySize}`);
    console.log(`   Макс тело: ${analysis.stats.maxBodySize}`);
    console.log(`   Средний фитиль: ${analysis.stats.avgWickSize}`);
    console.log(`   Средний диапазон: ${analysis.stats.avgTotalRange}`);
    console.log(`   Макс диапазон: ${analysis.stats.maxTotalRange}`);
    
    console.log('\n⚠️  ПРОБЛЕМЫ:');
    console.log(`   Резкие скачки (>1%): ${analysis.stats.sharpJumpsCount}`);
    console.log(`   Экстремальные скачки (>2%): ${analysis.stats.extremeJumpsCount}`);
    console.log(`   Огромные свечи (>5%): ${analysis.stats.hugeCandlesCount}`);
    
    console.log('\n✅ КАЧЕСТВО:');
    console.log(`   Плавность: ${analysis.stats.isSmooth ? '✓ ДА' : '✗ НЕТ'}`);
    console.log(`   Адекватный размер: ${analysis.stats.hasReasonableSize ? '✓ ДА' : '✗ НЕТ'}`);
    console.log(`   Общая оценка: ${analysis.stats.quality}/10`);
    
    // Визуализация
    console.log('\n📉 ВИЗУАЛИЗАЦИЯ (первые 1000 свечей):');
    console.log(visualizePrice(candles));
}

// ===== СРАВНИТЕЛЬНАЯ ТАБЛИЦА =====
console.log('\n\n' + '='.repeat(100));
console.log('📊 СРАВНИТЕЛЬНАЯ ТАБЛИЦА РЕЗУЛЬТАТОВ');
console.log('='.repeat(100));

console.log('\n┌─────────────────────────────────────────────┬───────────┬────────────┬──────────┬────────────┬──────────┐');
console.log('│ Тест                                        │ Диапазон  │ Макс скачок│ Проблемы │ Плавность  │ Оценка   │');
console.log('├─────────────────────────────────────────────┼───────────┼────────────┼──────────┼────────────┼──────────┤');

for (const result of results) {
    const name = result.testName.substring(0, 43).padEnd(43);
    const range = result.stats.priceRangePercent.padEnd(9);
    const maxChange = result.stats.maxChangePercent.padEnd(10);
    const problems = (result.stats.sharpJumpsCount + result.stats.extremeJumpsCount + result.stats.hugeCandlesCount).toString().padEnd(8);
    const smooth = (result.stats.isSmooth ? '✓ Да' : '✗ Нет').padEnd(10);
    const quality = (result.stats.quality + '/10').padEnd(8);
    
    console.log(`│ ${name} │ ${range} │ ${maxChange} │ ${problems} │ ${smooth} │ ${quality} │`);
}

console.log('└─────────────────────────────────────────────┴───────────┴────────────┴──────────┴────────────┴──────────┘');

// ===== РЕКОМЕНДАЦИИ =====
console.log('\n\n' + '='.repeat(100));
console.log('💡 РЕКОМЕНДАЦИИ');
console.log('='.repeat(100));

const bestResult = results.reduce((best, current) => 
    parseFloat(current.stats.quality) > parseFloat(best.stats.quality) ? current : best
);

console.log(`\n✅ ЛУЧШИЙ ВАРИАНТ: ${bestResult.testName}`);
console.log(`   Оценка качества: ${bestResult.stats.quality}/10`);
console.log(`   Диапазон движения: ${bestResult.stats.priceRangePercent}`);
console.log(`   Плавность: ${bestResult.stats.isSmooth ? '✓' : '✗'}`);

console.log('\n📋 Параметры:');
console.log(`   volatility: ${bestResult.config.volatility}`);
console.log(`   meanReversionStrength: ${bestResult.config.meanReversionStrength}`);
console.log(`   trendStrength: ${bestResult.config.trendStrength}`);
console.log(`   useBoundaries: ${bestResult.config.useBoundaries}`);

console.log('\n🎯 СЛЕДУЮЩИЕ ШАГИ:');
console.log('   1. Выберите понравившийся вариант');
console.log('   2. Можно протестировать дополнительные настройки');
console.log('   3. Применим выбранные параметры к chartGenerator.js');
console.log('\n' + '='.repeat(100));
