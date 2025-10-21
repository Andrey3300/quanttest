# 🔧 Исправления проблемы схлопывания графика и оптимизация скорости обновления

## 📅 Дата: 2025-10-21

---

## 🎯 РЕАЛИЗОВАННЫЕ РЕШЕНИЯ

### ✅ **РЕШЕНИЕ #1: Временное отключение autoScale при программном скролле**

**Файл:** `frontend/chart.js`  
**Строки:** 430-449 (в updateCandle)

**Что сделано:**
- Добавлен флаг `this.isAdjustingScale` для отслеживания процесса корректировки масштаба
- Перед вызовом `setVisibleLogicalRange()` временно отключается `autoScale`
- После установки нового диапазона (через 150ms) `autoScale` снова включается

**Зачем:**
Предотвращает race condition между горизонтальным скроллом и вертикальным автомасштабированием. Без этого lightweight-charts может пытаться пересчитать вертикальный диапазон в момент изменения горизонтального, что приводит к конфликту.

**Код:**
```javascript
// Отключаем autoScale
this.chart.applyOptions({
    rightPriceScale: {
        autoScale: false
    }
});

// Устанавливаем новый диапазон
timeScale.setVisibleLogicalRange(newRange);

// Через 150ms возвращаем autoScale
setTimeout(() => {
    this.chart.applyOptions({
        rightPriceScale: {
            autoScale: true
        }
    });
}, 150);
```

---

### ✅ **РЕШЕНИЕ #3: Исправление расчета видимого диапазона**

**Файл:** `frontend/chart.js`  
**Строки:** 407-426 (в updateCandle)

**Проблема:**
Старый код неправильно вычислял ширину видимого диапазона, не учитывая что `currentRange.to` уже включает `rightOffset`:

```javascript
// БЫЛО (НЕПРАВИЛЬНО):
const visibleBarsWidth = currentRange.to - currentRange.from;
const newFrom = Math.max(0, this.candleCount - 1 - visibleBarsWidth + rightOffsetBars);
// Результат: newFrom получался слишком большим → узкий диапазон
```

**Решение:**
Явно вычисляем "чистую" ширину БЕЗ rightOffset:

```javascript
// СТАЛО (ПРАВИЛЬНО):
const totalWidth = currentRange.to - currentRange.from;
const pureVisibleBars = Math.max(this.MIN_VISIBLE_BARS, Math.floor(totalWidth - rightOffsetBars));
const newFrom = Math.max(0, lastRealCandleIndex - pureVisibleBars);
const newTo = lastRealCandleIndex + rightOffsetBars;
```

**Проверка:**
Добавлена валидация минимальной ширины диапазона:

```javascript
const calculatedPureWidth = newTo - newFrom - rightOffsetBars;

if (calculatedPureWidth < this.MIN_VISIBLE_BARS) {
    console.error('Preventing chart collapse - calculated range too narrow!');
    return; // НЕ применяем слишком узкий диапазон
}
```

---

### ✅ **РЕШЕНИЕ #6: Debounce для setVisibleLogicalRange**

**Файл:** `frontend/chart.js`  
**Строки:** 393-394, 397 (в updateCandle)

**Что сделано:**
- Добавлен таймер `this.scrollDebounceTimer` в constructor
- Перед установкой нового диапазона отменяется предыдущий таймер
- Новый диапазон применяется через 50ms задержку

**Зачем:**
Предотвращает множественные вызовы `setVisibleLogicalRange()` если быстро приходят несколько новых свечей подряд (например, при багах на backend).

**Код:**
```javascript
// Отменяем предыдущий таймер
clearTimeout(this.scrollDebounceTimer);

// Применяем через 50ms
this.scrollDebounceTimer = setTimeout(() => {
    // ... логика установки диапазона
}, 50);
```

---

### ✅ **РЕШЕНИЕ #7: Автоматическая защита от схлопывания**

**Файл:** `frontend/chart.js`  
**Строки:** 147-184 (в init)

**Что сделано:**
- Добавлен обработчик `subscribeVisibleLogicalRangeChange()`
- Постоянно мониторится ширина видимого диапазона
- При обнаружении слишком узкого диапазона (< 10 свечей) автоматически восстанавливается безопасный диапазон

**Зачем:**
Это "safety net" - последняя линия защиты. Даже если по какой-то причине график всё равно схлопнется, он автоматически восстановится.

**Код:**
```javascript
this.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
    if (!range || this.isRestoringRange) return;
    
    const pureVisibleBars = (range.to - range.from) - 12;
    
    if (pureVisibleBars < this.MIN_VISIBLE_BARS) {
        console.error('Chart collapse detected! Restoring...');
        
        // Восстанавливаем безопасный диапазон (100 свечей)
        const safeRange = {
            from: Math.max(0, this.candleCount - 100),
            to: this.candleCount - 1 + 12
        };
        
        this.isRestoringRange = true;
        setTimeout(() => {
            this.chart.timeScale().setVisibleLogicalRange(safeRange);
            setTimeout(() => {
                this.isRestoringRange = false;
            }, 100);
        }, 0);
    }
});
```

---

### ✅ **БОНУС: Замедление обновления свечей в 3 раза**

**Файл:** `backend/server.js`  
**Строка:** 388

**Что сделано:**
Изменен интервал отправки тиков с **150ms** на **450ms**

**Файл:** `frontend/chart.js`  
**Строка:** 13

**Что сделано:**
Увеличен троттлинг обновлений с **50ms** на **150ms**

**Результат:**
- Свечи двигаются в **3 раза медленнее**
- Движение более плавное и контролируемое
- Снижена нагрузка на сеть и CPU

**Код (backend):**
```javascript
// БЫЛО:
}, 150); // каждые 150ms для плавности

// СТАЛО:
}, 450); // каждые 450ms (в 3 раза медленнее) для более плавного движения свечи
```

---

## 📊 ДОБАВЛЕННЫЕ ПЕРЕМЕННЫЕ В CONSTRUCTOR

```javascript
// РЕШЕНИЕ #6: Debounce для скролла
this.scrollDebounceTimer = null;
this.pendingScrollRange = null;

// РЕШЕНИЕ #1: Контроль autoScale
this.isAdjustingScale = false;

// Защита от схлопывания
this.MIN_VISIBLE_BARS = 10; // минимальная ширина видимого диапазона
this.isRestoringRange = false; // флаг восстановления диапазона
```

---

## 🔍 УЛУЧШЕННОЕ ЛОГИРОВАНИЕ

Все критические моменты теперь логируются:

1. **Before scroll calculation** - состояние перед расчетом
2. **Scroll calculation result** - результаты расчетов
3. **Range applied successfully** - успешное применение
4. **Invalid range calculated** - обнаружен некорректный диапазон
5. **Chart collapse detected** - обнаружено схлопывание
6. **Restoring safe range** - восстановление безопасного диапазона

**Команды для просмотра логов:**
```javascript
// В консоли браузера:
logStats()                                  // статистика
exportLogsText()                            // экспорт в файл
window.errorLogger.filter({ category: 'range' })  // только логи диапазона
```

---

## 🎯 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

После этих исправлений график должен:

✅ **НЕ** схлопываться в линию  
✅ **Правильно** масштабироваться по вертикали  
✅ **Плавно** прокручиваться при появлении новых свечей  
✅ **Двигаться медленнее** и контролируемее (в 3 раза)  
✅ **Автоматически восстанавливаться** при обнаружении проблем  
✅ **Логировать** все критические моменты для отладки  

---

## 🧪 КАК ТЕСТИРОВАТЬ

1. Запустите приложение:
   ```bash
   cd backend
   npm start
   ```

2. Откройте браузер: `http://localhost:3001`

3. Откройте консоль разработчика (F12)

4. Наблюдайте за графиком 5-10 минут

5. Проверьте логи:
   ```javascript
   logStats()
   window.errorLogger.filter({ level: 'error', category: 'range' })
   ```

6. Если видите ошибки "Chart collapse detected" - это **ХОРОШО**! Это означает что защита сработала.

7. Если график схлопывается и **НЕ** восстанавливается - экспортируйте логи:
   ```javascript
   exportLogsText()
   ```

---

## 🚨 ЕСЛИ ПРОБЛЕМА ВСЁ ЕЩЁ ЕСТЬ

Проверьте логи на наличие:

```
[ERROR][range] Invalid range calculated!
[ERROR][range] Preventing chart collapse - range too narrow!
[ERROR][range] Chart collapse detected! Restoring safe range...
```

Эти сообщения укажут на точное место проблемы.

---

## 📝 ДОПОЛНИТЕЛЬНЫЕ ПРИМЕЧАНИЯ

### Почему замедлили тики?

**Проблема:** При 150ms интервале свечи обновлялись слишком быстро (≈6.7 тиков в секунду), что создавало:
- Визуальный "шум"
- Высокую нагрузку на CPU
- Сложность для пользователя отследить движение цены

**Решение:** 450ms интервал (≈2.2 тика в секунду) - это оптимальный баланс между:
- Плавностью движения
- Читаемостью графика
- Производительностью

### Почему 50ms debounce?

50ms - это баланс между:
- Достаточной задержкой для фильтрации множественных вызовов
- Минимальной заметной задержкой для пользователя

### Почему 150ms для восстановления autoScale?

150ms совпадает с обновленным троттлингом и дает достаточно времени для:
- Стабилизации горизонтального диапазона
- Отрисовки новых данных
- Безопасного включения autoScale без конфликтов

---

## ✨ ЗАКЛЮЧЕНИЕ

Реализованы **4 критических решения** + **1 бонусное улучшение**:

1. ✅ Временное отключение autoScale при скролле
2. ✅ Исправленный расчет видимого диапазона
3. ✅ Debounce для предотвращения множественных вызовов
4. ✅ Автоматическая защита от схлопывания
5. ✅ **БОНУС:** Замедление обновлений в 3 раза

Все изменения полностью обратно совместимы и не требуют изменений в других частях кода.
