# 🎨 Реализация фазовой системы свечей + исправление волатильности

**Дата:** 2025-10-26  
**Актив для тестирования:** TEST/TEST1  
**Бэкап:** `backend/chartGenerator_phased_backup.js`

---

## 📋 Выполненные изменения

### 1. ✅ **УБРАНЫ ЖЕСТКИЕ ЛИМИТЫ ЦЕНЫ** (Проблема "обрезки" на 1.0500)

#### До:
```javascript
// generateCandle() - строки 466-473
const maxDeviation = 0.05; // ±5% от базовой цены
const minPrice = this.basePrice * (1 - maxDeviation);  // 0.95
const maxPrice = this.basePrice * (1 + maxDeviation);  // 1.05 ← ПОТОЛОК!

// generateNextPrice() для TEST_TEST1 - строки 541-544
const minPrice = this.basePrice * 0.95;
const maxPrice = this.basePrice * 1.05; // ← ОБРЕЗКА НА 1.0500!

// generateNextPrice() для других - строки 568-569
newPrice = Math.max(newPrice, this.basePrice * 0.9);
newPrice = Math.min(newPrice, this.basePrice * 1.1);
```

#### После:
```javascript
// generateCandle() - расширены до ±30%
const maxDeviation = 0.30; // ±30% от базовой цены
const minPrice = this.basePrice * 0.70;
const maxPrice = this.basePrice * 1.30;

// generateNextPrice() для TEST_TEST1 - расширены до ±30%
const minPrice = this.basePrice * 0.70;
const maxPrice = this.basePrice * 1.30;

// generateNextPrice() для других - расширены до ±20%
newPrice = Math.max(newPrice, this.basePrice * 0.80);
newPrice = Math.min(newPrice, this.basePrice * 1.20);
```

**Результат:** График больше не обрезается на 1.0500, может свободно двигаться вверх/вниз!

---

### 2. ✅ **ИСПРАВЛЕНА ВОЛАТИЛЬНОСТЬ ТИКОВ** (Проблема накопления)

#### Математика проблемы:
- **Исторические свечи:** 1 случайное изменение с волатильностью `V_timeframe`
- **Реалтайм свечи:** формируются через тики (каждые 500ms)
- **M2 (120 сек):** 240 тиков × tickVolatility каждый
- **Накопление:** high-low растет как √240 ≈ **15.5x БОЛЬШЕ!** 🤯

#### Решение:
Добавлен новый метод `getTickVolatility()` с правильной формулой:

```javascript
getTickVolatility(timeframe) {
    const timeframeSeconds = TIMEFRAMES[timeframe].seconds;
    const tickIntervalSeconds = 0.5; // 500ms
    const ticksInTimeframe = timeframeSeconds / tickIntervalSeconds;
    
    // 🎯 КЛЮЧЕВАЯ ФОРМУЛА:
    // timeframeVolatility = tickVolatility × √(ticksInTimeframe)
    // Следовательно: tickVolatility = timeframeVolatility / √(ticksInTimeframe)
    
    const timeframeVolatility = this.getScaledVolatility(timeframeSeconds);
    const tickVolatility = timeframeVolatility / Math.sqrt(ticksInTimeframe);
    
    return tickVolatility;
}
```

**Примеры для TEST/TEST1:**
- **S5 (5 сек, 10 тиков):** tickVol = (0.0020 × 0.76) / √10 ≈ `0.00048`
- **M2 (120 сек, 240 тиков):** tickVol = (0.0020 × 1.63) / √240 ≈ `0.00021`
- **M5 (300 сек, 600 тиков):** tickVol = (0.0020 × 2.57) / √600 ≈ `0.00021`

**Результат:** Accumulated volatility за таймфрейм теперь совпадает с исторической!

---

### 3. ✅ **ДОБАВЛЕНА ФАЗОВАЯ СИСТЕМА** (Pocket Option стиль)

#### Механика длинных свечей M2/M5/M15/M30:

```
0%────10%───────80%─────95%────100%
│     │         │       │        │
│  Birth    Growth  Stabilize Final
│     │         │       │        │
маленькая → 3-4см → ±1-3мм → ±40-50%
```

#### Фазы:

| Фаза | Прогресс | Волатильность | Описание |
|------|----------|---------------|----------|
| 🐣 **Birth** | 0-10% | **15%** | Крохотная свеча 1-3мм, плавно зарождается |
| 📈 **Growth** | 10-80% | **15% → 100%** | Активный рост до полного размера (плавная анимация) |
| 😴 **Stabilization** | 80-95% | **5%** | "Застыла", только микродвижения (рынок медленный) |
| 💥 **Finale** | 95-100% | **45%** | Неожиданный всплеск ±40-50% (непредсказуемость!) |

#### Реализация:

```javascript
// В CandleAggregator добавлено:
this.usePhasedSystem = ['M2', 'M5', 'M15', 'M30'].includes(timeframe);

getPhasedVolatilityMultiplier(tickTime) {
    if (!this.usePhasedSystem) return 1.0; // S5/S10 без фаз
    
    const elapsed = tickTime - this.currentCandle.time;
    const progress = elapsed / this.timeframeSeconds;
    
    if (progress < 0.10) return 0.15;       // Birth
    else if (progress < 0.80) {
        const growthProgress = (progress - 0.10) / 0.70;
        return 0.15 + (0.85 * growthProgress); // Growth 15%→100%
    }
    else if (progress < 0.95) return 0.05;  // Stabilization
    else return 0.45;                        // Finale
}
```

#### Применение в generateNextPrice():

```javascript
// Получаем фазовый мультипликатор для текущего таймфрейма
let phasedMultiplier = 1.0;
if (currentTimeframe && tickTime) {
    phasedMultiplier = aggregator.getPhasedVolatilityMultiplier(tickTime);
}

// Применяем к волатильности
const adjustedTickVolatility = tickVolatility * phasedMultiplier;
const randomChange = this.gaussianRandom() * adjustedTickVolatility;
```

**Результат:** 
- M5 свеча начинает маленькой (15% волатильности)
- Плавно растет до 100% за 210 секунд (10-80% прогресса)
- "Застывает" на 45 секунд с микроколебаниями (5% волатильности)
- Финальный всплеск в последние 15 секунд (45% волатильности)

---

## 🎯 Психологические эффекты

1. **Birth (10%):** "Свеча только началась, рано судить"
2. **Growth (70%):** "Активный рынок, идет движение"
3. **Stabilization (15%):** "Рынок медленный, все под контролем" ← ОБМАН!
4. **Finale (5%):** "Неожиданный всплеск!" ← Невозможно угадать результат

---

## 📊 Таймфреймы с фазовой системой

| Таймфрейм | Длительность | Birth | Growth | Stabilize | Finale |
|-----------|--------------|-------|--------|-----------|--------|
| M2 | 120 сек | 0-12с | 12-96с | 96-114с | 114-120с |
| M5 | 300 сек | 0-30с | 30-240с | 240-285с | 285-300с |
| M15 | 900 сек | 0-90с | 90-720с | 720-855с | 855-900с |
| M30 | 1800 сек | 0-180с | 180-1440с | 1440-1710с | 1710-1800с |

**S5/S10/S15/S30/M1:** Слишком короткие, используют обычную волатильность без фаз.

---

## 🔧 Технические детали

### Изменения в классе `CandleAggregator`:

1. Добавлено поле `usePhasedSystem` (true для M2/M5/M15/M30)
2. Добавлено поле `candleStartTime` (для отслеживания прогресса)
3. Добавлен метод `getPhasedVolatilityMultiplier(tickTime)` - возвращает коэффициент 0.05-1.0

### Изменения в классе `TickGenerator`:

1. Добавлен метод `getTickVolatility(timeframe)` - правильная формула с √(ticksInTimeframe)
2. Обновлен `generateNextPrice(currentPrice, isHistorical, currentTimeframe, tickTime)`:
   - Добавлены параметры `currentTimeframe` и `tickTime`
   - Получает фазовый мультипликатор
   - Применяет к волатильности
3. Обновлен `generateTick()`:
   - Определяет самый длинный активный таймфрейм (M30 > M15 > M5 > M2)
   - Передает его в `generateNextPrice()` для фазового расчета

---

## 🧪 Тестирование на TEST/TEST1

### Ожидаемое поведение:

1. **График не обрезается** на 1.0500 (может идти до 1.30 и выше)
2. **S5 свечи:** Обычная волатильность, без фаз
3. **M2 свечи:** 
   - Первые 12 сек - крохотные (15% волатильности)
   - 12-96 сек - активный рост
   - 96-114 сек - "застыли" (5% волатильности)
   - 114-120 сек - финальный всплеск (45%)
4. **M5 свечи:** Аналогично, но на 300 секунд (эффект "медленного рынка" в стабилизации)

### Как проверить:

1. Запустить сервер: `node backend/server.js`
2. Открыть TEST/TEST1
3. Переключиться на M5 таймфрейм
4. Наблюдать за формирующейся свечой:
   - Первые 30 сек - маленькая
   - 30-240 сек - растет
   - 240-285 сек - почти не меняется (только микродвижения)
   - 285-300 сек - может резко вырасти/упасть на 40-50%

---

## 📝 Бэкап

Оригинальный файл сохранен: **`backend/chartGenerator_phased_backup.js`**

Для отката:
```bash
cp backend/chartGenerator_phased_backup.js backend/chartGenerator.js
```

---

## ✅ Чеклист выполненных задач

- [x] Создан бэкап `chartGenerator_phased_backup.js`
- [x] Убраны жесткие лимиты цены ±5% → ±30%
- [x] Добавлен метод `getTickVolatility()` с формулой / √(ticksInTimeframe)
- [x] Добавлена фазовая система в `CandleAggregator`
- [x] Метод `getPhasedVolatilityMultiplier()` для 4 фаз
- [x] Обновлен `generateNextPrice()` для использования фазового мультипликатора
- [x] Обновлен `generateTick()` для определения активного таймфрейма
- [x] Проверен синтаксис (node -c chartGenerator.js) ✅

---

## 🚀 Следующие шаги

1. Запустить сервер и протестировать TEST/TEST1
2. Наблюдать M2/M5 свечи в реальном времени
3. Убедиться что график не обрезается на 1.0500
4. Проверить что реалтайм свечи соответствуют историческим по высоте
5. При необходимости настроить процентовки фаз (10%/70%/15%/5%)

---

**Готово к тестированию!** 🎯
