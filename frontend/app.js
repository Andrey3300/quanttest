// API URL
const API_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3001' 
    : window.location.origin;

// Хранение токена и данных пользователя
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let currentAccountType = localStorage.getItem('accountType') || 'demo';

// Assets data structure
const assetsData = {
    currencies: [
        { id: 'EUR_USD_OTC', name: 'EUR/USD OTC', payout: 92, symbol: 'EUR_USD_OTC' },
        { id: 'GBP_USD_OTC', name: 'GBP/USD OTC', payout: 92, symbol: 'GBP_USD_OTC' },
        { id: 'USD_MXN_OTC', name: 'USD/MXN OTC', payout: 92, symbol: 'USD_MXN_OTC' },
        { id: 'AUD_CAD_OTC', name: 'AUD/CAD OTC', payout: 92, symbol: 'AUD_CAD_OTC' },
        { id: 'BHD_CNY_OTC', name: 'BHD/CNY OTC', payout: 92, symbol: 'BHD_CNY_OTC' },
        { id: 'EUR_CHF_OTC', name: 'EUR/CHF OTC', payout: 92, symbol: 'EUR_CHF_OTC' },
        { id: 'KES_USD_OTC', name: 'KES/USD OTC', payout: 92, symbol: 'KES_USD_OTC' },
        { id: 'TND_USD_OTC', name: 'TND/USD OTC', payout: 92, symbol: 'TND_USD_OTC' },
        { id: 'UAH_USD_OTC', name: 'UAH/USD OTC', payout: 92, symbol: 'UAH_USD_OTC' },
        { id: 'USD_BDT_OTC', name: 'USD/BDT OTC', payout: 92, symbol: 'USD_BDT_OTC' },
        { id: 'USD_CNH_OTC', name: 'USD/CNH OTC', payout: 92, symbol: 'USD_CNH_OTC' },
        { id: 'USD_IDR_OTC', name: 'USD/IDR OTC', payout: 92, symbol: 'USD_IDR_OTC' },
        { id: 'USD_MYR_OTC', name: 'USD/MYR OTC', payout: 92, symbol: 'USD_MYR_OTC' },
        { id: 'AUD_NZD_OTC', name: 'AUD/NZD OTC', payout: 92, symbol: 'AUD_NZD_OTC' },
        { id: 'USD_PHP_OTC', name: 'USD/PHP OTC', payout: 92, symbol: 'USD_PHP_OTC' },
        { id: 'ZAR_USD_OTC', name: 'ZAR/USD OTC', payout: 92, symbol: 'ZAR_USD_OTC' },
        { id: 'YER_USD_OTC', name: 'YER/USD OTC', payout: 91, symbol: 'YER_USD_OTC' },
        { id: 'USD_BRL_OTC', name: 'USD/BRL OTC', payout: 90, symbol: 'USD_BRL_OTC' },
        { id: 'USD_EGP_OTC', name: 'USD/EGP OTC', payout: 89, symbol: 'USD_EGP_OTC' },
        { id: 'OMR_CNY_OTC', name: 'OMR/CNY OTC', payout: 88, symbol: 'OMR_CNY_OTC' },
        { id: 'AUD_JPY_OTC', name: 'AUD/JPY OTC', payout: 86, symbol: 'AUD_JPY_OTC' },
        { id: 'EUR_CHF_OTC2', name: 'EUR/CHF OTC', payout: 85, symbol: 'EUR_CHF_OTC2' },
        { id: 'EUR_GBP_OTC', name: 'EUR/GBP OTC', payout: 85, symbol: 'EUR_GBP_OTC' },
        { id: 'EUR_HUF_OTC', name: 'EUR/HUF OTC', payout: 85, symbol: 'EUR_HUF_OTC' },
        { id: 'EUR_TRY_OTC', name: 'EUR/TRY OTC', payout: 84, symbol: 'EUR_TRY_OTC' },
        { id: 'USD_JPY_OTC', name: 'USD/JPY OTC', payout: 84, symbol: 'USD_JPY_OTC' },
        { id: 'USD_CHF_OTC', name: 'USD/CHF OTC', payout: 81, symbol: 'USD_CHF_OTC' },
        { id: 'USD_CAD', name: 'USD/CAD', payout: 55, symbol: 'USD_CAD' },
        { id: 'AUD_CHF', name: 'AUD/CHF', payout: 54, symbol: 'AUD_CHF' },
        { id: 'CHF_JPY', name: 'CHF/JPY', payout: 54, symbol: 'CHF_JPY' },
        { id: 'EUR_AUD', name: 'EUR/AUD', payout: 54, symbol: 'EUR_AUD' },
        { id: 'EUR_CHF', name: 'EUR/CHF', payout: 54, symbol: 'EUR_CHF' },
        { id: 'EUR_GBP', name: 'EUR/GBP', payout: 54, symbol: 'EUR_GBP' },
        { id: 'EUR_JPY', name: 'EUR/JPY', payout: 54, symbol: 'EUR_JPY' },
        { id: 'EUR_USD', name: 'EUR/USD', payout: 54, symbol: 'EUR_USD' },
        { id: 'GBP_CAD', name: 'GBP/CAD', payout: 54, symbol: 'GBP_CAD' },
        { id: 'GBP_CHF', name: 'GBP/CHF', payout: 54, symbol: 'GBP_CHF' },
        { id: 'GBP_USD', name: 'GBP/USD', payout: 54, symbol: 'GBP_USD' }
    ],
    cryptocurrencies: [
        { id: 'BNB_OTC', name: 'BNB OTC', payout: 92, symbol: 'BNB_OTC' },
        { id: 'ETH_OTC', name: 'Ethereum OTC', payout: 92, symbol: 'ETH_OTC' },
        { id: 'TEST_TEST1', name: 'TEST/TEST1', payout: 92, symbol: 'TEST_TEST1' },
        { id: 'MATIC_OTC', name: 'Polygon OTC', payout: 91, symbol: 'MATIC_OTC' },
        { id: 'LTC_OTC', name: 'Litecoin OTC', payout: 82, symbol: 'LTC_OTC' },
        { id: 'BTC_ETF_OTC', name: 'Bitcoin ETF OTC', payout: 74, symbol: 'BTC_ETF_OTC' },
        { id: 'AVAX_OTC', name: 'Avalanche OTC', payout: 71, symbol: 'AVAX_OTC' },
        { id: 'ADA_OTC', name: 'Cardano OTC', payout: 69, symbol: 'ADA_OTC' },
        { id: 'BTC_OTC', name: 'Bitcoin OTC', payout: 69, symbol: 'BTC_OTC' },
        { id: 'TRX_OTC', name: 'TRON OTC', payout: 68, symbol: 'TRX_OTC' },
        { id: 'DOT_OTC', name: 'Polkadot OTC', payout: 66, symbol: 'DOT_OTC' },
        { id: 'LINK_OTC', name: 'Chainlink OTC', payout: 63, symbol: 'LINK_OTC' },
        { id: 'SOL_OTC', name: 'Solana OTC', payout: 55, symbol: 'SOL_OTC' },
        { id: 'DOGE_OTC', name: 'Dogecoin OTC', payout: 47, symbol: 'DOGE_OTC' },
        { id: 'TON_OTC', name: 'Toncoin OTC', payout: 24, symbol: 'TON_OTC' },
        { id: 'BTC', name: 'Bitcoin', payout: 19, symbol: 'BTC' }
    ],
    commodities: [
        { id: 'BRENT_OTC', name: 'Brent Oil OTC', payout: 84, symbol: 'BRENT_OTC' },
        { id: 'WTI_OTC', name: 'WTI Crude Oil OTC', payout: 84, symbol: 'WTI_OTC' },
        { id: 'SILVER_OTC', name: 'Silver OTC', payout: 84, symbol: 'SILVER_OTC' },
        { id: 'GOLD_OTC', name: 'Gold OTC', payout: 84, symbol: 'GOLD_OTC' },
        { id: 'NATGAS_OTC', name: 'Natural Gas OTC', payout: 49, symbol: 'NATGAS_OTC' },
        { id: 'PALLADIUM_OTC', name: 'Palladium spot OTC', payout: 49, symbol: 'PALLADIUM_OTC' },
        { id: 'PLATINUM_OTC', name: 'Platinum spot OTC', payout: 49, symbol: 'PLATINUM_OTC' }
    ]
};

// Favorites storage
let favorites = JSON.parse(localStorage.getItem('favorites')) || [];
let currentCategory = 'currencies';
let currentAsset = { id: 'USD_MXN_OTC', name: 'USD/MXN OTC', payout: 92, symbol: 'USD_MXN_OTC' };

// Проверка авторизации при загрузке
document.addEventListener('DOMContentLoaded', () => {
    if (authToken) {
        verifyToken();
    } else {
        showAuthPage();
    }
});

// Проверка токена
async function verifyToken() {
    try {
        const response = await fetch(`${API_URL}/api/user`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        if (response.ok) {
            currentUser = await response.json();
            currentAccountType = currentUser.activeAccount || 'demo';
            localStorage.setItem('accountType', currentAccountType);
            showTradingPage();
            updateUserDisplay();
        } else {
            localStorage.removeItem('authToken');
            authToken = null;
            showAuthPage();
        }
    } catch (error) {
        console.error('Token verification failed:', error);
        showAuthPage();
    }
}

// Показать страницу авторизации
function showAuthPage() {
    document.getElementById('auth-page').style.display = 'flex';
    document.getElementById('trading-page').style.display = 'none';
}

// Показать торговую страницу
function showTradingPage() {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('trading-page').style.display = 'grid';
    
    // Инициализируем график при первом показе
    if (window.chartManager && !window.chartManager.isInitialized) {
        // Увеличиваем задержку для правильной инициализации размеров
        setTimeout(() => {
            window.chartManager.init();
            
            // Применяем сохраненные настройки графика
            window.chartManager.setChartType(chartType);
            if (chartType !== 'line') {
                window.chartManager.setTimeframe(chartTimeframe);
            }
            
            window.chartManager.loadHistoricalData('USD_MXN_OTC').then(() => {
                // Линия цены создается автоматически после загрузки исторических данных
                // Запускаем таймер экспирации для candles/bars
                if (chartType !== 'line' && window.chartTimeframeManager) {
                    window.chartTimeframeManager.setTimeframe(chartTimeframe, (formatted, timeLeft, tf) => {
                        window.chartManager.updateExpirationOverlay(tf, formatted, timeLeft);
                    });
                }
            });
            window.chartManager.connectWebSocket('USD_MXN_OTC');
        }, 200);
    }
}

// Переключение форм авторизации
function showLogin() {
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.getElementById('login-form').classList.add('active');
    clearMessages();
}

function showRegister() {
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.getElementById('register-form').classList.add('active');
    clearMessages();
}

function showForgotPassword() {
    document.querySelectorAll('.auth-form').forEach(form => form.classList.remove('active'));
    document.getElementById('forgot-form').classList.add('active');
    clearMessages();
}

// Обработка входа
async function handleLogin(event) {
    event.preventDefault();
    
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();

    // Проверка на пустые поля
    if (!email || !password) {
        alert('Почта и пароль обязательны');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            currentAccountType = data.user.activeAccount || 'demo';
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('accountType', currentAccountType);
            showSuccess('Вход выполнен успешно!');
            setTimeout(() => {
                showTradingPage();
                updateUserDisplay();
            }, 1000);
        } else {
            showError(data.error || 'Ошибка входа');
        }
    } catch (error) {
        console.error('Login error:', error);
        showError('Ошибка подключения к серверу');
    }
}

// Обработка регистрации
async function handleRegister(event) {
    event.preventDefault();
    
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value.trim();

    // Проверка на пустые поля
    if (!email || !password) {
        alert('Почта и пароль обязательны');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            authToken = data.token;
            currentUser = data.user;
            currentAccountType = data.user.activeAccount || 'demo';
            localStorage.setItem('authToken', authToken);
            localStorage.setItem('accountType', currentAccountType);
            showSuccess('Регистрация успешна!');
            setTimeout(() => {
                showTradingPage();
                updateUserDisplay();
            }, 1000);
        } else {
            showError(data.error || 'Ошибка регистрации');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showError('Ошибка подключения к серверу');
    }
}

// Обработка восстановления пароля
async function handleForgotPassword(event) {
    event.preventDefault();
    
    const email = document.getElementById('forgot-email').value;

    try {
        const response = await fetch(`${API_URL}/api/forgot-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email })
        });

        const data = await response.json();

        if (response.ok) {
            showSuccess(data.message);
            setTimeout(() => showLogin(), 3000);
        } else {
            showError(data.error || 'Ошибка восстановления пароля');
        }
    } catch (error) {
        console.error('Password reset error:', error);
        showError('Ошибка подключения к серверу');
    }
}

// Выход
function handleLogout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('accountType');
    authToken = null;
    currentUser = null;
    currentAccountType = 'demo';
    showAuthPage();
    showLogin();
}

// Показать ошибку
function showError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.add('show');
    setTimeout(() => errorEl.classList.remove('show'), 5000);
}

// Показать успех
function showSuccess(message) {
    const successEl = document.getElementById('auth-success');
    successEl.textContent = message;
    successEl.classList.add('show');
    setTimeout(() => successEl.classList.remove('show'), 5000);
}

// Очистить сообщения
function clearMessages() {
    document.getElementById('auth-error').classList.remove('show');
    document.getElementById('auth-success').classList.remove('show');
}

// Обновить баланс пользователя
function updateUserBalance(balance) {
    const balanceEl = document.getElementById('user-balance');
    if (balanceEl) {
        balanceEl.textContent = balance.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
}

// Обновить отображение пользователя
function updateUserDisplay() {
    if (!currentUser) return;
    
    const accountLabelEl = document.getElementById('account-label');
    const userBalanceEl = document.getElementById('user-balance');
    const demoBalanceEl = document.getElementById('demo-balance');
    const realBalanceEl = document.getElementById('real-balance');
    
    const isDemo = currentAccountType === 'demo';
    const balance = isDemo ? (currentUser.demoBalance || 10000) : (currentUser.realBalance || 0);
    
    if (accountLabelEl) {
        accountLabelEl.textContent = isDemo ? 'Demo account' : 'Real account';
    }
    
    if (userBalanceEl) {
        userBalanceEl.textContent = balance.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    if (demoBalanceEl) {
        demoBalanceEl.textContent = (currentUser.demoBalance || 10000).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    if (realBalanceEl) {
        realBalanceEl.textContent = (currentUser.realBalance || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    // Обновить активный статус в меню
    document.querySelectorAll('.account-option').forEach(option => {
        const accountType = option.getAttribute('data-account');
        option.setAttribute('data-active', accountType === currentAccountType ? 'true' : 'false');
    });
}

// Переключение меню аккаунтов
function toggleAccountMenu() {
    const menu = document.getElementById('account-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}

// Закрыть меню при клике вне его
document.addEventListener('click', (event) => {
    const menu = document.getElementById('account-menu');
    const balanceDisplay = document.querySelector('.balance-display');
    
    if (menu && balanceDisplay && 
        !menu.contains(event.target) && 
        !balanceDisplay.contains(event.target)) {
        menu.style.display = 'none';
    }
});

// Выбрать аккаунт
async function selectAccount(accountType) {
    if (accountType === currentAccountType) {
        toggleAccountMenu();
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/api/switch-account`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({ accountType })
        });
        
        if (response.ok) {
            const data = await response.json();
            // Обновляем данные пользователя
            currentUser = {
                ...currentUser,
                demoBalance: data.demoBalance,
                realBalance: data.realBalance,
                activeAccount: data.activeAccount
            };
            currentAccountType = data.activeAccount;
            localStorage.setItem('accountType', data.activeAccount);
            updateUserDisplay();
            toggleAccountMenu();
            console.log(`Account switched to ${accountType}`, data);
            showAccountSwitchSuccess(accountType);
        } else {
            const errorData = await response.json().catch(() => ({}));
            console.error('Failed to switch account:', response.status, errorData);
            showAccountSwitchError('Не удалось переключить аккаунт');
        }
    } catch (error) {
        console.error('Account switch error:', error);
        showAccountSwitchError('Ошибка при переключении аккаунта');
    }
}

// Показать успешное переключение аккаунта
function showAccountSwitchSuccess(accountType) {
    const message = accountType === 'demo' ? 'Переключено на демо аккаунт' : 'Переключено на реальный аккаунт';
    const notification = document.createElement('div');
    notification.className = 'notification success-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// Показать ошибку переключения аккаунта
function showAccountSwitchError(message) {
    const notification = document.createElement('div');
    notification.className = 'notification error-notification';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// ===== CHART SETTINGS =====
let chartType = localStorage.getItem('chartType') || 'candles';
let chartTimeframe = localStorage.getItem('chartTimeframe') || 'S5';

// Настройки свечей
function toggleCandleSettings() {
    const modal = document.getElementById('chart-settings-modal');
    if (modal) {
        modal.style.display = 'flex';
        // Восстанавливаем активные кнопки
        updateChartSettingsUI();
    }
}

// Закрыть модальное окно настроек
function closeChartSettings() {
    const modal = document.getElementById('chart-settings-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Закрыть модальное окно при клике вне его
document.addEventListener('click', (event) => {
    const modal = document.getElementById('chart-settings-modal');
    if (modal && event.target === modal) {
        closeChartSettings();
    }
});

// Выбрать тип графика
function selectChartType(type) {
    chartType = type;
    localStorage.setItem('chartType', type);
    
    // Обновляем UI
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-chart-type') === type) {
            btn.classList.add('active');
        }
    });
    
    // Показать/скрыть секцию таймфреймов
    const timeframeSection = document.getElementById('timeframe-section');
    if (timeframeSection) {
        if (type === 'line') {
            timeframeSection.style.display = 'none';
        } else {
            timeframeSection.style.display = 'block';
        }
    }
    
    // Применяем изменения к графику
    applyChartSettings();
}

// Выбрать таймфрейм
function selectTimeframe(timeframe) {
    chartTimeframe = timeframe;
    localStorage.setItem('chartTimeframe', timeframe);
    
    // Обновляем UI
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-timeframe') === timeframe) {
            btn.classList.add('active');
        }
    });
    
    // Применяем изменения к графику
    applyChartSettings();
}

// Обновить UI настроек графика
function updateChartSettingsUI() {
    // Активируем кнопку типа графика
    document.querySelectorAll('.chart-type-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-chart-type') === chartType) {
            btn.classList.add('active');
        }
    });
    
    // Активируем кнопку таймфрейма
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-timeframe') === chartTimeframe) {
            btn.classList.add('active');
        }
    });
    
    // Показать/скрыть секцию таймфреймов
    const timeframeSection = document.getElementById('timeframe-section');
    if (timeframeSection) {
        if (chartType === 'line') {
            timeframeSection.style.display = 'none';
        } else {
            timeframeSection.style.display = 'block';
        }
    }
}

// Применить настройки графика
function applyChartSettings() {
    if (window.chartManager) {
        // Обновляем тип графика и таймфрейм в chart manager
        window.chartManager.setChartType(chartType);
        
        if (chartType !== 'line') {
            window.chartManager.setTimeframe(chartTimeframe);
        }
    }
    
    console.log(`Chart settings applied: Type=${chartType}, Timeframe=${chartTimeframe}`);
}

// Пополнение счета
function handleTopUp() {
    alert('Функция пополнения счета будет добавлена позже');
}

// Навигация
function setActiveNav(element) {
    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));
    element.classList.add('active');
}

// Торговые функции (пока заглушки)
let expirationSeconds = 5;

function adjustTime(seconds) {
    expirationSeconds = Math.max(5, expirationSeconds + seconds);
    updateTimeDisplay();
}

function updateTimeDisplay() {
    const minutes = Math.floor(expirationSeconds / 60);
    const seconds = expirationSeconds % 60;
    const timeDisplay = document.getElementById('expiration-time');
    if (timeDisplay) {
        timeDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(Math.floor(minutes % 60)).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
}

function adjustAmount(value) {
    const amountInput = document.getElementById('trade-amount');
    if (amountInput) {
        const currentAmount = parseInt(amountInput.value) || 0;
        amountInput.value = Math.max(1, currentAmount + value);
        updatePayout();
    }
}

function updatePayout() {
    const amount = parseInt(document.getElementById('trade-amount').value) || 0;
    const payoutPercent = currentAsset.payout;
    const payoutAmount = Math.floor(amount * (payoutPercent / 100));
    
    const payoutPercentEl = document.querySelector('.payout-percent');
    const payoutAmountEl = document.querySelector('.payout-amount');
    
    if (payoutPercentEl) payoutPercentEl.textContent = `+${payoutPercent}%`;
    if (payoutAmountEl) payoutAmountEl.textContent = `+$${payoutAmount}`;
}

function placeTrade(type) {
    const amount = document.getElementById('trade-amount').value;
    console.log(`${type.toUpperCase()} trade placed for $${amount}`);
    alert(`Торговая функция будет добавлена позже.\nТип: ${type.toUpperCase()}\nСумма: $${amount}\nВремя: ${expirationSeconds}s`);
}

function toggleUserMenu() {
    alert('Меню пользователя будет добавлено позже');
}

// Инициализация дисплея времени
updateTimeDisplay();

// Add event listener for trade amount input
document.addEventListener('DOMContentLoaded', () => {
    const tradeAmountInput = document.getElementById('trade-amount');
    if (tradeAmountInput) {
        tradeAmountInput.addEventListener('input', () => {
            updatePayoutForAsset(currentAsset);
        });
    }
});

// ===== ASSET DROPDOWN FUNCTIONALITY =====

// Toggle asset dropdown
function toggleAssetDropdown() {
    const dropdown = document.getElementById('asset-dropdown');
    if (dropdown) {
        const isVisible = dropdown.style.display !== 'none';
        dropdown.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible) {
            // Populate assets when opening
            renderAssets(currentCategory);
        }
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', (event) => {
    const dropdown = document.getElementById('asset-dropdown');
    const assetSelector = document.querySelector('.asset-selector');
    
    if (dropdown && assetSelector && 
        !dropdown.contains(event.target) && 
        !event.target.closest('.asset-dropdown-btn')) {
        dropdown.style.display = 'none';
    }
});

// Show asset category
function showAssetCategory(category) {
    currentCategory = category;
    
    // Update active category button
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.closest('.category-btn').classList.add('active');
    
    // Clear search
    const searchInput = document.getElementById('asset-search-input');
    if (searchInput) {
        searchInput.value = '';
    }
    
    // Render assets
    renderAssets(category);
}

// Render assets list
function renderAssets(category) {
    const assetList = document.getElementById('asset-list');
    if (!assetList) return;
    
    let assets = [];
    
    if (category === 'favorites') {
        // Get favorite assets from all categories
        Object.keys(assetsData).forEach(cat => {
            assets.push(...assetsData[cat].filter(asset => favorites.includes(asset.id)));
        });
    } else {
        assets = assetsData[category] || [];
    }
    
    // Sort by payout (highest first)
    assets.sort((a, b) => b.payout - a.payout);
    
    assetList.innerHTML = assets.map(asset => `
        <div class="asset-item ${currentAsset.id === asset.id ? 'active' : ''}" data-asset-id="${asset.id}">
            <div class="asset-info">
                <button class="star-btn ${favorites.includes(asset.id) ? 'favorited' : ''}" 
                        onclick="toggleFavorite(event, '${asset.id}')">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="${favorites.includes(asset.id) ? 'currentColor' : 'none'}" 
                         stroke="currentColor" stroke-width="2">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                </button>
                <div class="asset-icon">${getAssetIcon(asset)}</div>
                <span class="asset-label">${asset.name}</span>
            </div>
            <div class="asset-payout ${getPayoutClass(asset.payout)}">
                +${asset.payout}%
                ${getPayoutTrend()}
            </div>
        </div>
    `).join('');
    
    // Add click handlers to asset items
    assetList.querySelectorAll('.asset-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.star-btn')) {
                const assetId = item.getAttribute('data-asset-id');
                selectAsset(assetId);
            }
        });
    });
}

// Get asset icon (flag emoji or crypto symbol)
function getAssetIcon(asset) {
    const icons = {
        // Crypto icons
        'BTC': '₿',
        'BTC_OTC': '₿',
        'BTC_ETF_OTC': '₿',
        'ETH': 'Ξ',
        'ETH_OTC': 'Ξ',
        'TEST_TEST1': '🧪',
        'BNB_OTC': '◆',
        'SOL_OTC': '◎',
        'DOGE_OTC': 'Ð',
        'ADA_OTC': '₳',
        'DOT_OTC': '●',
        'MATIC_OTC': '⬟',
        'LTC_OTC': 'Ł',
        'LINK_OTC': '⬡',
        'AVAX_OTC': '▲',
        'TRX_OTC': '◈',
        'TON_OTC': '💎',
        // Commodity icons
        'GOLD_OTC': '🥇',
        'SILVER_OTC': '⚪',
        'BRENT_OTC': '🛢',
        'WTI_OTC': '🛢',
        'NATGAS_OTC': '🔥',
        'PALLADIUM_OTC': '⚫',
        'PLATINUM_OTC': '⚪'
    };
    
    return icons[asset.id] || '💱';
}

// Get payout class for color coding
function getPayoutClass(payout) {
    if (payout >= 85) return 'payout-high';
    if (payout >= 70) return 'payout-medium';
    if (payout >= 50) return 'payout-low';
    return 'payout-very-low';
}

// Get payout trend arrow
function getPayoutTrend() {
    return `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M7 14l5-5 5 5z"/>
    </svg>`;
}

// Toggle favorite
function toggleFavorite(event, assetId) {
    event.stopPropagation();
    
    const index = favorites.indexOf(assetId);
    if (index > -1) {
        favorites.splice(index, 1);
    } else {
        favorites.push(assetId);
    }
    
    // Save to localStorage
    localStorage.setItem('favorites', JSON.stringify(favorites));
    
    // Re-render current category
    renderAssets(currentCategory);
}

// Select asset
function selectAsset(assetId) {
    // Find asset in all categories
    let selectedAsset = null;
    for (const category in assetsData) {
        const found = assetsData[category].find(a => a.id === assetId);
        if (found) {
            selectedAsset = found;
            break;
        }
    }
    
    if (!selectedAsset) return;
    
    currentAsset = selectedAsset;
    
    // Update display
    const assetNameEl = document.getElementById('selected-asset');
    if (assetNameEl) {
        assetNameEl.textContent = selectedAsset.name;
    }
    
    // Update payout display
    updatePayoutForAsset(selectedAsset);
    
    // Switch chart
    if (window.chartManager) {
        window.chartManager.changeSymbol(selectedAsset.symbol);
    }
    
    // Close dropdown
    const dropdown = document.getElementById('asset-dropdown');
    if (dropdown) {
        dropdown.style.display = 'none';
    }
    
    // Update active state in list
    document.querySelectorAll('.asset-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-asset-id') === assetId) {
            item.classList.add('active');
        }
    });
}

// Update payout display for selected asset
function updatePayoutForAsset(asset) {
    const amount = parseInt(document.getElementById('trade-amount')?.value) || 200;
    const payoutAmount = Math.floor(amount * (asset.payout / 100));
    
    const payoutPercentEl = document.querySelector('.payout-percent');
    const payoutAmountEl = document.querySelector('.payout-amount');
    
    if (payoutPercentEl) payoutPercentEl.textContent = `+${asset.payout}%`;
    if (payoutAmountEl) payoutAmountEl.textContent = `+$${payoutAmount}`;
}

// Filter assets by search
function filterAssets() {
    const searchInput = document.getElementById('asset-search-input');
    if (!searchInput) return;
    
    const searchTerm = searchInput.value.toLowerCase();
    const assetItems = document.querySelectorAll('.asset-item');
    
    assetItems.forEach(item => {
        const assetLabel = item.querySelector('.asset-label').textContent.toLowerCase();
        if (assetLabel.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

// Update payout calculation when amount changes
const originalAdjustAmount = adjustAmount;
adjustAmount = function(value) {
    originalAdjustAmount(value);
    updatePayoutForAsset(currentAsset);
};
