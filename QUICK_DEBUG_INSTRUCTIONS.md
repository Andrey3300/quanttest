# 🔍 Быстрая инструкция для отладки проблемы с графиком

## Что было исправлено

### ✅ Основные исправления в `chart.js`:

1. **Проблема с отрицательными значениями диапазона** (строка ~365)
   - **Было:** `from: this.candleCount - 1 - visibleBarsWidth`
   - **Стало:** `from: Math.max(0, this.candleCount - 1 - visibleBarsWidth + rightOffsetBars)`
   - Теперь `from` не может быть отрицательным

2. **Проблема с расчетом ширины диапазона** (строка ~360)
   - **Было:** `visibleBarsWidth = currentRange.to - currentRange.from - rightOffsetBars`
   - **Стало:** `visibleBarsWidth = currentRange.to - currentRange.from`
   - Убрали вычитание rightOffset, которое приводило к неправильной ширине

3. **Добавлена валидация диапазона** (строка ~375)
   ```javascript
   if (newFrom < 0 || newTo < 0 || newFrom >= newTo) {
       // Логируем ошибку и не применяем неправильный диапазон
   }
   ```

4. **Добавлено автоматическое масштабирование** (строка ~53)
   ```javascript
   rightPriceScale: {
       autoScale: true,  // новое
       alignLabels: true, // новое
   }
   ```

### ✅ Система логирования

Добавлены два модуля логирования:
- **Frontend:** `frontend/logger.js`
- **Backend:** `backend/errorLogger.js`

## Как собрать логи для анализа

### Шаг 1: Откройте консоль браузера

1. Нажмите `F12` или `Ctrl+Shift+I` (Windows/Linux) / `Cmd+Option+I` (Mac)
2. Перейдите во вкладку **Console**

### Шаг 2: Дождитесь появления проблемы

Пользуйтесь приложением до тех пор, пока график не схлопнется

### Шаг 3: Экспортируйте логи

В консоли введите и выполните:

```javascript
exportLogsText()
```

Автоматически скачается файл `chart-debug-logs-*.txt`

### Шаг 4: Проверьте backend логи

Найдите файлы в папке `backend/logs/`:
- `chart-debug.log` - все логи
- `chart-errors.log` - только ошибки

### Шаг 5: Отправьте файлы на анализ

Отправьте следующие файлы:
1. ✅ Скачанный `chart-debug-logs-*.txt`
2. ✅ `backend/logs/chart-debug.log`
3. ✅ `backend/logs/chart-errors.log`
4. ✅ Скриншот проблемы

## Полезные команды в консоли

```javascript
// Показать статистику логов
logStats()

// Показать только ошибки диапазона
window.errorLogger.filter({ level: 'error', category: 'range' })

// Показать все логи диапазона
window.errorLogger.filter({ category: 'range' })

// Показать последние 100 логов
window.errorLogger.logs.slice(-100)

// Очистить логи
clearLogs()
```

## Что искать в логах

### 🔴 Критические ошибки:

```
[ERROR][range] Invalid range calculated!
```
Указывает на проблему с расчетом диапазона

```
[ERROR][candle] Invalid OHLC data detected
```
Указывает на некорректные данные свечей

```
[ERROR][chart] Invalid candle time format
```
Проблема с форматом времени

### 🟡 Предупреждения:

```
[WARN][range] No current range available
```
График еще не инициализирован

```
[WARN][candle] Ignoring outdated tick
```
Получены устаревшие данные (нормально)

### 🔵 Полезная информация:

```
[DEBUG][range] Before scroll calculation
```
Детали состояния перед прокруткой

```
[DEBUG][range] Scroll calculation result
```
Результаты расчетов

## Ожидаемое поведение

После исправлений график должен:
- ✅ НЕ схлопываться в линию
- ✅ Правильно масштабироваться по Y
- ✅ Плавно прокручиваться при появлении новых свечей
- ✅ Корректно отображать последние данные

## Если проблема всё ещё возникает

В логах должны быть записи вида:

```
[ERROR][range] Invalid range calculated!
  Data: {
    "newRange": { "from": X, "to": Y },
    "candleCount": Z,
    "currentRange": { ... }
  }
```

Эти данные помогут точно определить причину.

---

**Запуск приложения:**

```bash
# Terminal 1 - Backend
cd backend
npm install
npm start

# Terminal 2 - Откройте браузер
# http://localhost:3001
```

Логи сразу начнут собираться автоматически!
