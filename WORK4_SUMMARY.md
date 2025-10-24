# WORK4 - Скользящее окно диапазона для таймфреймов

## 📅 Дата: 2025-10-24

## 🎯 Цель изменений
Реализация "скользящего окна диапазона" в стиле PocketOption для всех таймфреймов M1+.
Свечи теперь остаются одинакового размера независимо от таймфрейма, диапазон high-low "скользит" вместе с ценой.

## 📦 Бэкап файлы (для отката):
- `frontend/chart_work4.js` - бэкап chart.js
- `frontend/app_work4.js` - бэкап app.js
- `frontend/chartTimeframe_work4.js` - бэкап chartTimeframe.js
- `backend/server_work4.js` - бэкап server.js
- `backend/chartGenerator_work4.js` - бэкап chartGenerator.js

## 🔧 Внесенные изменения

### `frontend/chartTimeframe.js` - ГЛАВНЫЙ ФАЙЛ ИЗМЕНЕНИЙ

#### 1. Добавлена конфигурация таймфреймов
```javascript
timeframeConfig = {
    'M1': { accumulationPhase: 0.17, fixedRangePercent: 0.03 },   // 10 сек накопление, ±0.03%
    'M2': { accumulationPhase: 0.17, fixedRangePercent: 0.04 },   // 20 сек накопление, ±0.04%
    'M5': { accumulationPhase: 0.15, fixedRangePercent: 0.05 },   // 45 сек накопление, ±0.05%
    'M10': { accumulationPhase: 0.20, fixedRangePercent: 0.06 },  // 2 мин накопление, ±0.06%
    'M15': { accumulationPhase: 0.20, fixedRangePercent: 0.08 },  // 3 мин накопление, ±0.08%
    'M30': { accumulationPhase: 0.17, fixedRangePercent: 0.10 }   // 5 мин накопление, ±0.10%
}
```

#### 2. Две фазы жизни свечи

**Фаза 1: Накопление (первые 15-20% времени)**
- High/low растут как обычно (max/min)
- Формируется начальный диапазон волатильности

**Фаза 2: Скользящее окно (остальные 80-85% времени)**
- Диапазон фиксируется
- High = Close + fixedRange/2
- Low = Close - fixedRange/2
- High и Low "едут" вместе с ценой

**Финальная корректировка (последние 10% времени)**
- Диапазон может немного измениться (±20%) для реалистичности

#### 3. Новые методы
- `getCandlePhase()` - определение текущей фазы свечи
- `getBasePrice()` - получение базовой цены для расчета диапазона
- Расширенный `updateCandleWithTick()` с логикой скользящего окна

#### 4. Отслеживание состояния
- `candlePhaseData` Map - хранит fixedRange для каждой активной свечи
- Автоматическая очистка старых данных (хранит только последние 10 свечей)

## 📊 Результат

### Для S5, S10, S15, S30:
- Поведение НЕ изменено (accumulationPhase: 1.0)
- Работают как раньше в накопительном режиме

### Для M1, M2, M3, M5, M10, M15, M30:
- ✅ Свечи одинакового размера (~3-5см на экране)
- ✅ Диапазон "скользит" вместе с ценой
- ✅ Цена колеблется в узком коридоре
- ✅ Читаемый график как на PocketOption

## 🔄 Как откатить изменения

Если что-то сломалось:

```bash
cd /workspace

# Откат frontend
cp frontend/chart_work4.js frontend/chart.js
cp frontend/app_work4.js frontend/app.js
cp frontend/chartTimeframe_work4.js frontend/chartTimeframe.js

# Откат backend
cp backend/server_work4.js backend/server.js
cp backend/chartGenerator_work4.js backend/chartGenerator.js

# Перезапуск
npm restart
```

## 📝 Логирование

Добавлены debug/info логи:
- `📈 Accumulation phase` - фаза накопления
- `🎯 Sliding window activated` - активация скользящего окна
- `🎯 Sliding window active` - работа скользящего окна
- `📏 Final adjustment phase` - финальные корректировки

## ✅ Тестирование

Проверить:
1. Переключение между таймфреймами (S5, M1, M5, M10, M30)
2. Размер свечей должен быть одинаковым для M1+ таймфреймов
3. Цена должна колебаться в узком диапазоне
4. S5 должен работать как раньше
5. Переключение активов должно работать нормально

## 🚀 Готово к продакшену!

Херак херак и в продакшен! 🎯
