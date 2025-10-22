// Frontend Error Logger
// Система логирования ошибок для фронтенда с сохранением в localStorage и экспортом

class ErrorLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 1000; // максимальное количество логов
        this.storageKey = 'chart_debug_logs';
        this.enabled = true; // можно отключить через консоль
        
        // Загружаем существующие логи
        this.loadLogs();
        
        // Перехватываем консольные ошибки
        this.setupErrorInterceptors();
        
        console.log('%c[Logger] Error logging system initialized', 'color: #26d07c; font-weight: bold');
    }

    // Загрузка логов из localStorage
    loadLogs() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                this.logs = JSON.parse(stored);
                console.log(`[Logger] Loaded ${this.logs.length} existing logs`);
            }
        } catch (error) {
            console.error('[Logger] Failed to load logs:', error);
            this.logs = [];
        }
    }

    // Сохранение логов в localStorage
    saveLogs() {
        try {
            // Ограничиваем количество логов
            if (this.logs.length > this.maxLogs) {
                this.logs = this.logs.slice(-this.maxLogs);
            }
            localStorage.setItem(this.storageKey, JSON.stringify(this.logs));
        } catch (error) {
            console.error('[Logger] Failed to save logs:', error);
        }
    }

    // Основной метод логирования
    log(level, category, message, data = null) {
        if (!this.enabled) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            time: Date.now(),
            level, // 'info', 'warn', 'error', 'debug'
            category, // 'chart', 'websocket', 'candle', 'range', etc.
            message,
            data: data ? this.sanitizeData(data) : null,
            url: window.location.href,
            userAgent: navigator.userAgent
        };

        this.logs.push(logEntry);
        this.saveLogs();

        // Выводим в консоль с цветом
        const colors = {
            error: '#ff4757',
            warn: '#ffa502',
            info: '#26d07c',
            debug: '#a0aec0'
        };
        
        const color = colors[level] || '#a0aec0';
        console.log(
            `%c[${level.toUpperCase()}][${category}] ${message}`,
            `color: ${color}; font-weight: bold`,
            data || ''
        );
    }

    // Очистка чувствительных данных
    sanitizeData(data) {
        try {
            // Создаем копию для избежания изменения оригинала
            const sanitized = JSON.parse(JSON.stringify(data));
            
            // Удаляем функции и циклические ссылки
            return this.removeCircular(sanitized);
        } catch (error) {
            return String(data);
        }
    }

    // Удаление циклических ссылок
    removeCircular(obj, seen = new WeakSet()) {
        if (obj && typeof obj === 'object') {
            if (seen.has(obj)) {
                return '[Circular]';
            }
            seen.add(obj);

            if (Array.isArray(obj)) {
                return obj.map(item => this.removeCircular(item, seen));
            }

            const result = {};
            for (const key in obj) {
                if (obj.hasOwnProperty(key)) {
                    result[key] = this.removeCircular(obj[key], seen);
                }
            }
            return result;
        }
        return obj;
    }

    // Перехват ошибок консоли
    setupErrorInterceptors() {
        const self = this;

        // Перехватываем window.onerror
        window.addEventListener('error', (event) => {
            self.log('error', 'global', 'Uncaught error', {
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error ? event.error.stack : null
            });
        });

        // Перехватываем unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            self.log('error', 'promise', 'Unhandled promise rejection', {
                reason: event.reason,
                promise: String(event.promise)
            });
        });

        // Оборачиваем console.error
        const originalError = console.error;
        console.error = function(...args) {
            self.log('error', 'console', 'Console error', { args: args.map(String) });
            originalError.apply(console, args);
        };

        // Оборачиваем console.warn
        const originalWarn = console.warn;
        console.warn = function(...args) {
            self.log('warn', 'console', 'Console warning', { args: args.map(String) });
            originalWarn.apply(console, args);
        };
    }

    // Специализированные методы
    error(category, message, data) {
        this.log('error', category, message, data);
    }

    warn(category, message, data) {
        this.log('warn', category, message, data);
    }

    info(category, message, data) {
        this.log('info', category, message, data);
    }

    debug(category, message, data) {
        this.log('debug', category, message, data);
    }

    // Экспорт логов в файл
    exportLogs(filename = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultFilename = `chart-debug-logs-${timestamp}.json`;
        
        const blob = new Blob([JSON.stringify(this.logs, null, 2)], { 
            type: 'application/json' 
        });
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`[Logger] Exported ${this.logs.length} logs to ${a.download}`);
        return a.download;
    }

    // Экспорт логов в текстовый формат (более читаемый)
    exportLogsText(filename = null) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const defaultFilename = `chart-debug-logs-${timestamp}.txt`;
        
        const text = this.logs.map(log => {
            let line = `[${log.timestamp}] [${log.level.toUpperCase()}] [${log.category}] ${log.message}`;
            if (log.data) {
                line += '\n  Data: ' + JSON.stringify(log.data, null, 2).split('\n').join('\n  ');
            }
            return line;
        }).join('\n\n');
        
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || defaultFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`[Logger] Exported ${this.logs.length} logs to ${a.download}`);
        return a.download;
    }

    // Очистка логов
    clear() {
        this.logs = [];
        localStorage.removeItem(this.storageKey);
        console.log('[Logger] All logs cleared');
    }

    // Получение статистики
    getStats() {
        const stats = {
            total: this.logs.length,
            byLevel: {},
            byCategory: {},
            timeRange: {
                first: this.logs.length > 0 ? this.logs[0].timestamp : null,
                last: this.logs.length > 0 ? this.logs[this.logs.length - 1].timestamp : null
            }
        };

        this.logs.forEach(log => {
            stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
            stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
        });

        return stats;
    }

    // Фильтрация логов
    filter(options = {}) {
        return this.logs.filter(log => {
            if (options.level && log.level !== options.level) return false;
            if (options.category && log.category !== options.category) return false;
            if (options.fromTime && log.time < options.fromTime) return false;
            if (options.toTime && log.time > options.toTime) return false;
            if (options.search && !log.message.toLowerCase().includes(options.search.toLowerCase())) return false;
            return true;
        });
    }

    // Включить/выключить логирование
    enable() {
        this.enabled = true;
        console.log('[Logger] Logging enabled');
    }

    disable() {
        this.enabled = false;
        console.log('[Logger] Logging disabled');
    }
}

// Создаем глобальный экземпляр
window.errorLogger = new ErrorLogger();

// Экспортируем удобные функции для использования
window.exportLogs = () => window.errorLogger.exportLogs();
window.exportLogsText = () => window.errorLogger.exportLogsText();
window.clearLogs = () => window.errorLogger.clear();
window.logStats = () => {
    const stats = window.errorLogger.getStats();
    console.table(stats.byLevel);
    console.table(stats.byCategory);
    console.log('Total logs:', stats.total);
    console.log('Time range:', stats.timeRange);
    return stats;
};

// Инструкции для пользователя
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #26d07c');
console.log('%c📊 Chart Debug Logger Commands:', 'color: #26d07c; font-size: 14px; font-weight: bold');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #26d07c');
console.log('%cexportLogs()%c      - Export logs as JSON file', 'color: #ffa502; font-weight: bold', 'color: #a0aec0');
console.log('%cexportLogsText()%c  - Export logs as readable text file', 'color: #ffa502; font-weight: bold', 'color: #a0aec0');
console.log('%clogStats()%c        - Show logging statistics', 'color: #ffa502; font-weight: bold', 'color: #a0aec0');
console.log('%cclearLogs()%c       - Clear all logs', 'color: #ffa502; font-weight: bold', 'color: #a0aec0');
console.log('%c━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'color: #26d07c');
