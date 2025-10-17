// API URL
const API_URL = window.location.origin.includes('localhost') 
    ? 'http://localhost:3001' 
    : window.location.origin;

// Хранение токена и данных пользователя
let authToken = localStorage.getItem('authToken');
let currentUser = null;

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
            showTradingPage();
            updateUserBalance(currentUser.balance);
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
        setTimeout(() => {
            window.chartManager.init();
            window.chartManager.loadHistoricalData('USD_MXN');
            window.chartManager.connectWebSocket('USD_MXN');
        }, 100);
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
            localStorage.setItem('authToken', authToken);
            showSuccess('Вход выполнен успешно!');
            setTimeout(() => {
                showTradingPage();
                updateUserBalance(currentUser.balance);
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
            localStorage.setItem('authToken', authToken);
            showSuccess('Регистрация успешна!');
            setTimeout(() => {
                showTradingPage();
                updateUserBalance(currentUser.balance);
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
    authToken = null;
    currentUser = null;
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
