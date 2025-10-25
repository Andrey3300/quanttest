// Backend Error Logger
// Система логирования для сервера с записью в файл

const fs = require('fs');
const path = require('path');

class ErrorLogger {
    constructor(logDir = 'logs') {
        this.logDir = logDir;
        this.logFile = path.join(logDir, 'chart-debug.log');
        this.errorFile = path.join(logDir, 'chart-errors.log');
        this.maxFileSize = 1 * 1024 * 1024; // 🚀 ОПТИМИЗАЦИЯ: 1 MB (вместо 10 MB) для частой ротации
        this.maxLogFiles = 5; // 🚀 НОВОЕ: Храним максимум 5 ротированных файлов
        
        // 🎯 УРОВНИ ЛОГИРОВАНИЯ (от меньшего к большему)
        // debug = 0, info = 1, warn = 2, error = 3
        this.LOG_LEVELS = {
            debug: 0,
            info: 1,
            warn: 2,
            error: 3
        };
        
        // Устанавливаем минимальный уровень для вывода в консоль
        // По умолчанию 'warn' - выводить только предупреждения и ошибки
        const consoleLevel = process.env.LOG_LEVEL || 'warn';
        this.consoleLogLevel = this.LOG_LEVELS[consoleLevel] || this.LOG_LEVELS.warn;
        
        // В файл пишем всё (debug и выше)
        this.fileLogLevel = this.LOG_LEVELS.debug;
        
        // Создаем директорию для логов если её нет
        this.ensureLogDirectory();
        
        console.log('[Logger] Backend logging initialized');
        console.log(`[Logger] Console level: ${consoleLevel} (${this.consoleLogLevel})`);
        console.log(`[Logger] Log file: ${this.logFile}`);
        console.log(`[Logger] Error file: ${this.errorFile}`);
    }

    // Создание директории для логов
    ensureLogDirectory() {
        try {
            if (!fs.existsSync(this.logDir)) {
                fs.mkdirSync(this.logDir, { recursive: true });
                console.log(`[Logger] Created log directory: ${this.logDir}`);
            }
        } catch (error) {
            console.error('[Logger] Failed to create log directory:', error);
        }
    }

    // 🚀 УЛУЧШЕННАЯ ротация с автоудалением старых файлов
    checkRotation(filepath) {
        try {
            if (fs.existsSync(filepath)) {
                const stats = fs.statSync(filepath);
                if (stats.size > this.maxFileSize) {
                    // Ротация: переименовываем старый файл
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupPath = filepath.replace(/\.log$/, `-${timestamp}.log`);
                    fs.renameSync(filepath, backupPath);
                    
                    // Удаляем старые ротированные файлы (оставляем только последние N)
                    this.cleanupRotatedFiles(filepath);
                }
            }
        } catch (error) {
            console.error('[Logger] Error during log rotation:', error);
        }
    }
    
    // 🚀 НОВОЕ: Удаление старых ротированных файлов
    cleanupRotatedFiles(baseFilepath) {
        try {
            const dir = path.dirname(baseFilepath);
            const baseName = path.basename(baseFilepath, '.log');
            const files = fs.readdirSync(dir);
            
            // Находим все ротированные файлы для этого базового файла
            const rotatedFiles = files
                .filter(f => f.startsWith(baseName) && f.endsWith('.log') && f !== path.basename(baseFilepath))
                .map(f => ({
                    name: f,
                    path: path.join(dir, f),
                    mtime: fs.statSync(path.join(dir, f)).mtimeMs
                }))
                .sort((a, b) => b.mtime - a.mtime); // Сортируем по времени (новые первыми)
            
            // Удаляем файлы старше N штук
            if (rotatedFiles.length > this.maxLogFiles) {
                const filesToDelete = rotatedFiles.slice(this.maxLogFiles);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`[Logger] Deleted old rotated log: ${file.name}`);
                });
            }
        } catch (error) {
            console.error('[Logger] Error cleaning rotated files:', error);
        }
    }

    // Форматирование сообщения лога
    formatMessage(level, category, message, data) {
        const timestamp = new Date().toISOString();
        let formatted = `[${timestamp}] [${level.toUpperCase()}] [${category}] ${message}`;
        
        if (data) {
            try {
                const dataStr = typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data);
                formatted += '\n  Data: ' + dataStr.split('\n').join('\n  ');
            } catch (error) {
                formatted += `\n  Data: [Error stringifying: ${error.message}]`;
            }
        }
        
        return formatted + '\n';
    }

    // Запись в файл
    writeToFile(filepath, message) {
        try {
            this.checkRotation(filepath);
            fs.appendFileSync(filepath, message, 'utf8');
        } catch (error) {
            console.error('[Logger] Failed to write to log file:', error);
        }
    }

    // Основной метод логирования
    log(level, category, message, data = null) {
        const levelValue = this.LOG_LEVELS[level] || 0;
        
        const formatted = this.formatMessage(level, category, message, data);
        
        // Записываем в основной файл (если уровень достаточный)
        if (levelValue >= this.fileLogLevel) {
            this.writeToFile(this.logFile, formatted);
        }
        
        // Если это ошибка, записываем и в файл ошибок
        if (level === 'error') {
            this.writeToFile(this.errorFile, formatted);
        }
        
        // Выводим в консоль ТОЛЬКО если уровень достаточный
        if (levelValue >= this.consoleLogLevel) {
            const consoleMethod = level === 'error' ? console.error : 
                                level === 'warn' ? console.warn : console.log;
            
            // Для консоли используем краткий формат без data (если не ошибка)
            if (level === 'error' || level === 'warn') {
                consoleMethod(`[${category}] ${message}`, data || '');
            } else {
                consoleMethod(`[${category}] ${message}`);
            }
        }
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

    // Логирование данных свечей
    logCandle(type, symbol, candle) {
        this.debug('candle', `${type} for ${symbol}`, {
            time: candle.time,
            timeISO: new Date(candle.time * 1000).toISOString(),
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: candle.volume,
            valid: this.validateCandle(candle)
        });
    }

    // Валидация свечи
    validateCandle(candle) {
        const checks = {
            hasTime: typeof candle.time === 'number' && !isNaN(candle.time),
            hasOHLC: typeof candle.open === 'number' && 
                    typeof candle.high === 'number' && 
                    typeof candle.low === 'number' && 
                    typeof candle.close === 'number',
            validOHLC: candle.high >= candle.low &&
                      candle.high >= candle.open &&
                      candle.high >= candle.close &&
                      candle.low <= candle.open &&
                      candle.low <= candle.close,
            positiveValues: candle.open > 0 && candle.high > 0 && 
                          candle.low > 0 && candle.close > 0
        };

        const isValid = Object.values(checks).every(v => v);
        
        if (!isValid) {
            this.error('validation', 'Invalid candle detected', { candle, checks });
        }

        return { isValid, checks };
    }

    // 🚀 АГРЕССИВНАЯ очистка старых логов (по умолчанию 1 час!)
    cleanOldLogs(hours = 1) {
        try {
            if (!fs.existsSync(this.logDir)) {
                return;
            }
            
            const files = fs.readdirSync(this.logDir);
            const now = Date.now();
            const maxAge = hours * 60 * 60 * 1000; // В миллисекундах
            
            let deletedCount = 0;
            let deletedSize = 0;

            files.forEach(file => {
                const filepath = path.join(this.logDir, file);
                try {
                    const stats = fs.statSync(filepath);
                    
                    if (now - stats.mtimeMs > maxAge) {
                        deletedSize += stats.size;
                        fs.unlinkSync(filepath);
                        deletedCount++;
                    }
                } catch (err) {
                    // Файл мог быть удален другим процессом
                }
            });
            
            if (deletedCount > 0) {
                const sizeMB = (deletedSize / (1024 * 1024)).toFixed(2);
                console.log(`[Logger] Cleaned ${deletedCount} old log files (${sizeMB} MB freed)`);
            }
        } catch (error) {
            console.error('[Logger] Error cleaning old logs:', error);
        }
    }
}

// Экспортируем singleton
const logger = new ErrorLogger();

// 🚀 АГРЕССИВНАЯ очистка: удаляем логи старше 1 часа при запуске
logger.cleanOldLogs(1);

// 🚀 НОВОЕ: Периодическая очистка каждые 10 минут
setInterval(() => {
    logger.cleanOldLogs(1);
}, 10 * 60 * 1000);

module.exports = logger;
