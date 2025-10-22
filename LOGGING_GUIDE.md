# 📊 Chart Debug Logging Guide

## Обзор

В проект добавлена комплексная система логирования для отладки проблем с графиком. Система состоит из двух частей:

1. **Frontend Logger** (`frontend/logger.js`) - логирование на клиентской стороне
2. **Backend Logger** (`backend/errorLogger.js`) - логирование на серверной стороне

## Frontend Logging

### Автоматическое логирование

Frontend logger автоматически записывает:
- ✅ Все ошибки консоли (`console.error`)
- ✅ Все предупреждения консоли (`console.warn`)
- ✅ Необработанные исключения (`window.onerror`)
- ✅ Необработанные Promise rejections
- ✅ События графика (загрузка данных, создание свечей, скролл)
- ✅ WebSocket события (подключение, отключение, ошибки)

### Команды консоли

Откройте DevTools (F12) и используйте следующие команды:

```javascript
// Экспорт логов в JSON файл
exportLogs()

// Экспорт логов в текстовый файл (более читаемый)
exportLogsText()

// Показать статистику логирования
logStats()

// Очистить все логи
clearLogs()

// Получить логи с фильтрацией
window.errorLogger.filter({ 
  level: 'error',        // 'error', 'warn', 'info', 'debug'
  category: 'range',     // 'chart', 'range', 'websocket', 'candle'
  search: 'invalid'      // поиск по тексту
})

// Включить/выключить логирование
window.errorLogger.enable()
window.errorLogger.disable()
```

### Категории логов

Frontend логи разделены по категориям:

- **chart** - инициализация графика, загрузка данных
- **range** - расчет и изменение видимого диапазона
- **websocket** - WebSocket подключение и сообщения
- **candle** - обработка данных свечей
- **console** - перехваченные консольные сообщения
- **global** - глобальные ошибки
- **promise** - ошибки Promise

### Уровни логирования

- **error** - критические ошибки
- **warn** - предупреждения
- **info** - информационные сообщения
- **debug** - отладочная информация

## Backend Logging

### Файлы логов

Backend создает файлы логов в папке `backend/logs/`:

- `chart-debug.log` - все логи (все уровни)
- `chart-errors.log` - только ошибки

### Ротация логов

- Файлы автоматически ротируются при достижении 10 MB
- Старые логи (>7 дней) автоматически удаляются при старте сервера

### Что логируется

- ✅ Создание новых свечей
- ✅ Генерация тиков
- ✅ Валидация данных свечей
- ✅ WebSocket события
- ✅ Ошибки генерации данных

## Как использовать для отладки проблемы с графиком

### Шаг 1: Воспроизведение проблемы

1. Откройте приложение в браузере
2. Откройте DevTools (F12)
3. Перейдите во вкладку Console
4. Дождитесь появления проблемы (график схлопывается)

### Шаг 2: Экспорт логов

```javascript
// В консоли браузера выполните:
exportLogsText()
```

Это скачает файл `chart-debug-logs-YYYY-MM-DDTHH-MM-SS.txt`

### Шаг 3: Анализ логов

Откройте скачанный файл и ищите:

#### Проблемы с диапазоном (Range):

```
[range] Before scroll calculation
  Data: {
    "candleCount": 1234,
    "currentRange": { "from": 1100, "to": 1234 },
    "isNearEnd": true
  }

[range] Scroll calculation result
  Data: {
    "visibleBarsWidth": 134,
    "newFrom": -10,  // ⚠️ ПРОБЛЕМА: отрицательное значение!
    "newTo": 1246
  }
```

#### Проблемы с данными свечей:

```
[ERROR][candle] Invalid OHLC data detected
  Data: {
    "candle": {
      "time": 1234567890,
      "open": 1.0850,
      "high": 1.0800,  // ⚠️ ПРОБЛЕМА: high < open!
      "low": 1.0900,
      "close": 1.0870
    }
  }
```

#### Проблемы с временем:

```
[ERROR][chart] Invalid candle time format
  Data: {
    "type": "object",  // ⚠️ ПРОБЛЕМА: должно быть "number"!
    "value": { "year": 2025, "month": 1 }
  }
```

### Шаг 4: Backend логи

Проверьте файл `backend/logs/chart-debug.log` для серверных логов:

```bash
# В терминале
tail -f backend/logs/chart-debug.log
```

Ищите записи с `[ERROR]` или `[WARN]`:

```
[2025-01-20T12:34:56.789Z] [ERROR] [candle] Invalid new candle time detected
  Data: {
    "symbol": "USD_MXN_OTC",
    "candle": { ... }
  }
```

## Частые проблемы и их признаки

### 1. График схлопывается в линию

**Признаки в логах:**
```
[ERROR][range] Invalid range calculated!
  Data: {
    "newRange": { "from": -15, "to": 1246 }
  }
```

**Причина:** Отрицательное значение `from` в диапазоне

**Исправление:** Проверено в последней версии - добавлена проверка `Math.max(0, ...)`

### 2. Свечи не обновляются

**Признаки в логах:**
```
[WARN][candle] Ignoring outdated tick
[ERROR][chart] Invalid candle time format
```

**Причина:** Проблемы с timestamp свечей

### 3. Масштаб Y-оси сильно меняется

**Признаки в логах:**
```
[ERROR][candle] Invalid OHLC data detected
  Data: {
    "candle": { "high": 21.0000, "low": -1.0000 }
  }
```

**Причина:** Неверные значения OHLC

## Отправка логов для анализа

При сообщении о проблеме, отправьте следующие файлы:

1. **Frontend логи:**
   ```javascript
   exportLogsText()  // скачает текстовый файл
   ```

2. **Backend логи:**
   ```bash
   # Скопируйте файлы:
   backend/logs/chart-debug.log
   backend/logs/chart-errors.log
   ```

3. **Скриншот проблемы** с открытыми DevTools

4. **Информация о воспроизведении:**
   - Когда происходит проблема?
   - Какие действия предшествовали?
   - Всегда ли воспроизводится?

## Дополнительная отладка

### Просмотр логов в реальном времени

```javascript
// Показать все логи категории 'range'
window.errorLogger.filter({ category: 'range' })

// Показать только ошибки
window.errorLogger.filter({ level: 'error' })

// Показать логи за последние 5 минут
const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
window.errorLogger.filter({ fromTime: fiveMinutesAgo })
```

### Добавление собственного логирования

```javascript
// В коде приложения
window.errorLogger.debug('custom', 'My debug message', { 
  someData: 'value' 
})

window.errorLogger.info('custom', 'Something happened', { 
  details: {...} 
})

window.errorLogger.error('custom', 'Error occurred', { 
  error: error.message 
})
```

## Производительность

Система логирования оптимизирована:

- ✅ Логи хранятся в localStorage (max 1000 записей)
- ✅ Автоматическая очистка старых логов
- ✅ Минимальное влияние на производительность
- ✅ Можно отключить в любой момент

## Конфиденциальность

- ❌ Пароли и токены НЕ логируются
- ✅ Циклические ссылки автоматически удаляются
- ✅ Логи хранятся только локально
- ✅ Можно очистить в любой момент

---

**Важно:** Система логирования работает только в development режиме. В production рекомендуется отключить или ограничить уровень логирования.
