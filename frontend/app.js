// API URL
const API_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3001' 
    : window.location.origin;

// Хранение токена и данных пользователя
let authToken = localStorage.getItem('authToken');
let currentUser = null;
let currentAccountType = localStorage.getItem('accountType') || 'demo';

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
            window.chartManager.loadHistoricalData('USD_MXN');
            window.chartManager.connectWebSocket('USD_MXN');
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

// Настройки свечей
function toggleCandleSettings() {
    alert('Настройки свечей будут добавлены позже');
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
    const payoutPercent = 48; // 48%
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
