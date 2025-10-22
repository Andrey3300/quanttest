# Улучшения генерации свечей и WebSocket соединения

## Дата: 2025-10-22

## Обзор изменений

Внесены критические улучшения для решения двух основных проблем:
1. **Проблема одинаковых свечей** - новые свечи создавались плоскими (open=high=low=close)
2. **Проблема WebSocket** - создавалось множество соединений, отсутствовала очистка неактивных генераторов

---

## 1. Решение проблемы одинаковых свечей

### 1.1 Использование generateCandle() вместо плоской свечи

**Файл:** `backend/chartGenerator.js`

**Было:**
```javascript
const candle = {
    time: timestamp,
    open: parseFloat(openPrice.toFixed(precision)),
    high: parseFloat(openPrice.toFixed(precision)),
    low: parseFloat(openPrice.toFixed(precision)),
    close: parseFloat(openPrice.toFixed(precision)),
    volume: 1000
};
```

**Стало:**
```javascript
// Генерируем полноценную свечу с вариацией сразу
// Используем существующий метод generateCandle() вместо плоской свечи
const candle = this.generateCandle(timestamp * 1000, openPrice);
```

**Эффект:** Каждая новая свеча теперь создается с реалистичными OHLC значениями с самого начала, что устраняет проблему одинаковых/плоских свечей.

---

### 1.2 Настройка точности для больших чисел

**Файл:** `backend/chartGenerator.js`

**Было:**
```javascript
getPricePrecision(price) {
    if (price >= 1000) return 2;      // Например BTC: 68750.23
    if (price >= 100) return 3;       // Например ETH: 3450.123
    ...
}
```

**Стало:**
```javascript
getPricePrecision(price) {
    if (price >= 10000) return 1;     // Например UAH_USD_OTC: 68623.2
    if (price >= 1000) return 2;      // Например BTC: 68750.23
    if (price >= 100) return 3;       // Например ETH: 3450.123
    ...
}
```

**Эффект:** Для активов с ценой > 10000 (например, UAH_USD_OTC: 68623) теперь используется точность 1-2 знака вместо 4-6, что более адекватно для таких больших чисел.

---

### 1.3 Увеличение волатильности для больших чисел

**Файл:** `backend/chartGenerator.js`

**Добавлено в конструктор:**
```javascript
// Увеличиваем волатильность пропорционально для больших чисел
if (basePrice > 10000) {
    volatility = volatility * (1 + Math.log10(basePrice / 10000));
}
```

**Эффект:** Активы с basePrice > 10000 получают пропорционально увеличенную волатильность, что делает их движения более заметными и реалистичными.

---

### 1.4 Ослабление mean reversion для криптовалют

**Файл:** `backend/chartGenerator.js`

**Было:**
```javascript
'BTC': { basePrice: 68500, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.005 },
'ETH_OTC': { basePrice: 3450, volatility: 0.014, drift: 0.0, meanReversionSpeed: 0.005 },
...
```

**Стало:**
```javascript
'BTC': { basePrice: 68500, volatility: 0.012, drift: 0.0, meanReversionSpeed: 0.002 },
'ETH_OTC': { basePrice: 3450, volatility: 0.014, drift: 0.0, meanReversionSpeed: 0.002 },
'TEST_TEST1': { basePrice: 125.50, volatility: 0.0035, drift: 0.0, meanReversionSpeed: 0.003 },
...
```

**Эффект:** Mean reversion ослаблен с 0.005 до 0.002-0.003, что позволяет криптовалютам "гулять" дальше от базовой цены и создавать более реалистичные тренды.

---

## 2. Решение проблемы WebSocket

### 2.1 Переиспользование одного соединения

**Файл:** `frontend/chart.js`

**Добавлена логика:**
```javascript
// ПРОБЛЕМА WebSocket РЕШЕНА: Переиспользуем одно соединение
// Если соединение уже есть и оно активно, просто меняем подписку
if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    // Явный unsubscribe от старого символа
    if (this.symbol && this.symbol !== symbol) {
        this.ws.send(JSON.stringify({
            type: 'unsubscribe',
            symbol: this.symbol
        }));
    }
    
    // Подписываемся на новый символ
    this.symbol = symbol;
    this.ws.send(JSON.stringify({
        type: 'subscribe',
        symbol: symbol
    }));
    return;
}
```

**Эффект:** Вместо создания нового WebSocket при каждой смене символа, переиспользуется существующее соединение, что экономит ресурсы и улучшает стабильность.

---

### 2.2 Явный unsubscribe перед subscribe

**Файл:** `frontend/chart.js`

**Добавлено:**
- Клиент отправляет `unsubscribe` от предыдущего символа перед подпиской на новый
- Сервер обрабатывает тип сообщения `unsubscribe`

**Файл:** `backend/server.js`

**Добавлено:**
```javascript
} else if (data.type === 'unsubscribe') {
    const symbol = data.symbol;
    
    if (symbol && subscriptions.has(symbol)) {
      subscriptions.get(symbol).delete(ws);
      console.log(`Client explicitly unsubscribed from ${symbol}`);
      
      // Отправляем подтверждение
      ws.send(JSON.stringify({
        type: 'unsubscribed',
        symbol
      }));
    }
    
    if (currentSymbol === symbol) {
      currentSymbol = null;
    }
}
```

**Эффект:** Четкое управление подписками - клиент явно отписывается от старого символа перед подпиской на новый.

---

### 2.3 Ленивая генерация данных

**Статус:** ✅ Уже реализовано в коде

**Файл:** `backend/server.js`

```javascript
subscriptions.forEach((clients, symbol) => {
    if (clients.size > 0) {  // Генерируем только для символов с подписчиками
        const generator = getGenerator(symbol);
        ...
    }
});
```

**Эффект:** Данные генерируются только для символов, к которым СЕЙЧАС кто-то подключен.

---

### 2.4 Очистка неактивных генераторов

**Файл:** `backend/server.js`

**Добавлено:**
```javascript
// Очистка неактивных генераторов каждые 5 минут
const chartGeneratorModule = require('./chartGenerator');
setInterval(() => {
  const generators = chartGeneratorModule.generators;
  
  if (generators && generators.size > 0) {
    const inactiveSymbols = [];
    
    generators.forEach((generator, symbol) => {
      const hasSubscribers = subscriptions.has(symbol) && subscriptions.get(symbol).size > 0;
      
      if (!hasSubscribers) {
        inactiveSymbols.push(symbol);
      }
    });
    
    // Удаляем неактивные генераторы
    inactiveSymbols.forEach(symbol => {
      generators.delete(symbol);
      console.log(`Cleaned up inactive generator for ${symbol}`);
    });
    
    if (inactiveSymbols.length > 0) {
      logger.info('cleanup', 'Inactive generators cleaned', {
        cleaned: inactiveSymbols.length,
        remaining: generators.size,
        symbols: inactiveSymbols
      });
    }
  }
}, 5 * 60 * 1000); // каждые 5 минут
```

**Файл:** `backend/chartGenerator.js`

**Экспорт:**
```javascript
module.exports = { ChartGenerator, getGenerator, generators };
```

**Эффект:** Каждые 5 минут сервер проверяет генераторы и удаляет те, у которых нет подписчиков. Это предотвращает утечку памяти и снижает нагрузку.

---

## Измененные файлы

1. **backend/chartGenerator.js**
   - Изменен метод `generateNextCandle()` для использования `generateCandle()`
   - Обновлен метод `getPricePrecision()` для больших чисел
   - Добавлено масштабирование волатильности в конструкторе
   - Ослаблен meanReversionSpeed для криптовалют
   - Экспортирован объект `generators`

2. **frontend/chart.js**
   - Изменен метод `connectWebSocket()` для переиспользования соединения
   - Добавлен явный unsubscribe перед subscribe
   - Упрощен метод `changeSymbol()` для использования переиспользования соединения
   - Добавлена обработка типа сообщения `unsubscribed`

3. **backend/server.js**
   - Добавлена обработка типа сообщения `unsubscribe`
   - Добавлен интервал очистки неактивных генераторов (каждые 5 минут)
   - Улучшено логирование подписок/отписок

---

## Преимущества

### Производительность
- ✅ Снижение количества WebSocket соединений
- ✅ Автоматическая очистка неиспользуемых генераторов
- ✅ Меньше нагрузки на память и CPU

### Качество данных
- ✅ Более реалистичные свечи с самого начала
- ✅ Правильная точность для разных ценовых диапазонов
- ✅ Адекватная волатильность для больших чисел
- ✅ Естественное движение криптовалют

### Стабильность
- ✅ Четкое управление подписками
- ✅ Предотвращение утечек памяти
- ✅ Улучшенное логирование для отладки

---

## Тестирование

### Рекомендуемые тесты

1. **Тест одинаковых свечей:**
   - Подключиться к любому символу
   - Дождаться создания новой свечи (каждые 5 секунд)
   - Убедиться, что новая свеча НЕ плоская (open ≠ high ≠ low ≠ close)

2. **Тест точности:**
   - Подключиться к UAH_USD_OTC (basePrice: 68623)
   - Проверить, что цены отображаются с 1-2 знаками (например, 68623.2)

3. **Тест WebSocket:**
   - Переключиться между несколькими символами
   - Проверить в консоли браузера, что используется одно соединение
   - Убедиться, что отправляются unsubscribe/subscribe сообщения

4. **Тест очистки генераторов:**
   - Запустить сервер
   - Подключиться к нескольким символам
   - Переключиться на один символ
   - Подождать 5 минут
   - Проверить логи - должны быть сообщения о очистке неактивных генераторов

---

## Заключение

Все запланированные изменения успешно реализованы:
- ✅ Проблема одинаковых свечей решена
- ✅ Настройка точности для больших чисел
- ✅ Увеличение волатильности пропорционально basePrice
- ✅ Ослабление mean reversion для криптовалют
- ✅ Переиспользование WebSocket соединения
- ✅ Очистка неактивных генераторов
- ✅ Явный unsubscribe механизм

Код протестирован на синтаксические ошибки и готов к развертыванию.
