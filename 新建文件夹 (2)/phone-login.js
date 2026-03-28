// 全局变量
let selectedRole = 'admin';
let countdown = 0;
let countdownInterval = null;
let currentVerifyCode = null;
let verifyCodeExpireTime = null;

// 频率限制配置
const RATE_LIMIT = {
    maxAttempts: 5,
    timeWindow: 3600000, // 1小时
    cooldown: 60000 // 1分钟
};

// 用户数据存储（模拟数据库）
const userDatabase = {
    users: [],
    rateLimits: {}
};

// 初始化
function init() {
    loadUserDatabase();
    setupFormValidation();
}

// 加载用户数据库
function loadUserDatabase() {
    const stored = localStorage.getItem('userDatabase');
    if (stored) {
        const decrypted = decryptData(stored);
        userDatabase.users = JSON.parse(decrypted);
    }
}

// 保存用户数据库
function saveUserDatabase() {
    const encrypted = encryptData(JSON.stringify(userDatabase.users));
    localStorage.setItem('userDatabase', encrypted);
}

// 选择角色
function selectRole(role) {
    selectedRole = role;
    document.querySelectorAll('.role-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`[data-role="${role}"]`).classList.add('selected');
}

// 手机号格式校验
function validatePhone(phone) {
    const regex = /^1[3-9]\d{9}$/;
    return regex.test(phone);
}

// 验证码格式校验
function validateVerifyCode(code) {
    const regex = /^\d{6}$/;
    return regex.test(code);
}

// 检查频率限制
function checkRateLimit(phone) {
    const now = Date.now();
    const userLimit = userDatabase.rateLimits[phone] || { attempts: [], lastSent: 0 };
    
    // 检查冷却时间
    if (now - userLimit.lastSent < RATE_LIMIT.cooldown) {
        const remainingSeconds = Math.ceil((RATE_LIMIT.cooldown - (now - userLimit.lastSent)) / 1000);
        return {
            allowed: false,
            message: `请等待${remainingSeconds}秒后再试`
        };
    }
    
    // 检查时间窗口内的尝试次数
    const recentAttempts = userLimit.attempts.filter(time => now - time < RATE_LIMIT.timeWindow);
    if (recentAttempts.length >= RATE_LIMIT.maxAttempts) {
        return {
            allowed: false,
            message: '发送次数过多，请1小时后再试'
        };
    }
    
    return { allowed: true };
}

// 更新频率限制记录
function updateRateLimit(phone) {
    const now = Date.now();
    if (!userDatabase.rateLimits[phone]) {
        userDatabase.rateLimits[phone] = { attempts: [], lastSent: 0 };
    }
    
    const userLimit = userDatabase.rateLimits[phone];
    userLimit.attempts.push(now);
    userLimit.lastSent = now;
    
    // 清理过期的尝试记录
    userLimit.attempts = userLimit.attempts.filter(time => now - time < RATE_LIMIT.timeWindow);
}

// 生成6位数字验证码
function generateVerifyCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// 发送验证码
async function sendVerifyCode() {
    const phone = document.getElementById('phone').value.trim();
    const phoneError = document.getElementById('phoneError');
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    
    // 验证手机号
    if (!phone) {
        showError('phoneError', '请输入手机号');
        return;
    }
    
    if (!validatePhone(phone)) {
        showError('phoneError', '手机号格式不正确，请输入正确的11位手机号');
        return;
    }
    
    hideError('phoneError');
    
    // 检查频率限制
    const rateLimitCheck = checkRateLimit(phone);
    if (!rateLimitCheck.allowed) {
        alert(rateLimitCheck.message);
        return;
    }
    
    // 禁用按钮
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = '发送中...';
    
    try {
        // 生成验证码
        currentVerifyCode = generateVerifyCode();
        verifyCodeExpireTime = Date.now() + 300000; // 5分钟有效期
        
        // 调用短信API发送验证码
        const result = await sendSMS(phone, currentVerifyCode);
        
        if (result.success) {
            // 更新频率限制
            updateRateLimit(phone);
            
            // 开始倒计时
            startCountdown();
            
            // 显示成功提示
            alert(`验证码已发送至${phone}，有效期5分钟`);
            hideError('verifyCodeError');
        } else {
            throw new Error(result.message);
        }
    } catch (error) {
        showError('verifyCodeError', error.message || '验证码发送失败，请重试');
        sendCodeBtn.disabled = false;
        sendCodeBtn.textContent = '获取验证码';
    }
}

// 开始倒计时
function startCountdown() {
    const sendCodeBtn = document.getElementById('sendCodeBtn');
    countdown = 60;
    
    sendCodeBtn.disabled = true;
    sendCodeBtn.textContent = `${countdown}秒后重发`;
    
    countdownInterval = setInterval(() => {
        countdown--;
        
        if (countdown <= 0) {
            clearInterval(countdownInterval);
            sendCodeBtn.disabled = false;
            sendCodeBtn.textContent = '获取验证码';
        } else {
            sendCodeBtn.textContent = `${countdown}秒后重发`;
        }
    }, 1000);
}

// 设置表单验证
function setupFormValidation() {
    const form = document.getElementById('phoneLoginForm');
    
    form.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const phone = document.getElementById('phone').value.trim();
        const verifyCode = document.getElementById('verifyCode').value.trim();
        
        let isValid = true;
        
        // 验证手机号
        if (!phone) {
            showError('phoneError', '请输入手机号');
            isValid = false;
        } else if (!validatePhone(phone)) {
            showError('phoneError', '手机号格式不正确');
            isValid = false;
        } else {
            hideError('phoneError');
        }
        
        // 验证验证码
        if (!verifyCode) {
            showError('verifyCodeError', '请输入验证码');
            isValid = false;
        } else if (!validateVerifyCode(verifyCode)) {
            showError('verifyCodeError', '验证码格式不正确');
            isValid = false;
        } else {
            hideError('verifyCodeError');
        }
        
        // 验证通过
        if (isValid) {
            // 检查验证码是否过期
            if (!currentVerifyCode || Date.now() > verifyCodeExpireTime) {
                showError('verifyCodeError', '验证码已过期，请重新获取');
                return;
            }
            
            // 验证验证码是否正确
            if (verifyCode !== currentVerifyCode) {
                showError('verifyCodeError', '验证码错误');
                return;
            }
            
            // 查找或创建用户
            let user = userDatabase.users.find(u => u.phone === encryptPhone(phone));
            
            if (!user) {
                // 创建新用户
                user = {
                    id: Date.now().toString(),
                    phone: encryptPhone(phone),
                    role: selectedRole,
                    createdAt: new Date().toISOString()
                };
                userDatabase.users.push(user);
                saveUserDatabase();
            } else {
                // 更新用户角色
                user.role = selectedRole;
                saveUserDatabase();
            }
            
            // 保存登录状态
            localStorage.setItem('userRole', selectedRole);
            localStorage.setItem('username', phone);
            localStorage.setItem('userId', user.id);
            
            // 登录成功
            showSuccessAnimation();
        }
    });
}

// 显示错误信息
function showError(elementId, message) {
    const errorElement = document.getElementById(elementId);
    errorElement.textContent = message;
    errorElement.classList.add('show');
}

// 隐藏错误信息
function hideError(elementId) {
    const errorElement = document.getElementById(elementId);
    errorElement.classList.remove('show');
}

// 显示登录成功动画
function showSuccessAnimation() {
    const successElement = document.getElementById('loginSuccess');
    successElement.classList.add('show');
    
    // 1.5秒后跳转到监测页面
    setTimeout(() => {
        window.location.href = 'dashboard.html';
    }, 1500);
}

// 返回账号密码登录
function goToAccountLogin() {
    window.location.href = 'index.html';
}

// 短信API集成（模拟）
async function sendSMS(phone, code) {
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟短信发送
    console.log(`[SMS] 发送验证码到 ${phone}: ${code}`);
    
    // 模拟成功响应
    return {
        success: true,
        message: '发送成功'
    };
    
    // 实际项目中，这里应该调用真实的短信API，例如：
    // const response = await fetch('https://api.sms-provider.com/send', {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': 'Bearer YOUR_API_KEY'
    //     },
    //     body: JSON.stringify({
    //         phone: phone,
    //         code: code,
    //         template: '您的验证码是{code}，5分钟内有效。'
    //     })
    // });
    // return await response.json();
}

// 语音外呼API集成（模拟）
async function sendVoiceCall(phone, message) {
    // 模拟API调用延迟
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 模拟语音外呼
    console.log(`[VOICE] 语音外呼到 ${phone}: ${message}`);
    
    // 模拟成功响应
    return {
        success: true,
        message: '呼叫成功'
    };
    
    // 实际项目中，这里应该调用真实的语音API，例如：
    // const response = await fetch('https://api.voice-provider.com/call', {
    //     method: 'POST',
    //     headers: {
    //         'Content-Type': 'application/json',
    //         'Authorization': 'Bearer YOUR_API_KEY'
    //     },
    //     body: JSON.stringify({
    //         phone: phone,
    //         message: message,
    //         voiceType: 'tts' // 文本转语音
    //     })
    // });
    // return await response.json();
}

// 手机号加密（简单AES加密模拟）
function encryptPhone(phone) {
    // 实际项目中应该使用更安全的加密算法，如AES
    // 这里使用简单的Base64编码作为示例
    const encrypted = btoa(phone);
    return encrypted;
}

// 数据解密
function decryptData(encrypted) {
    // 实际项目中应该使用对应的解密算法
    // 这里使用Base64解码作为示例
    try {
        return atob(encrypted);
    } catch (e) {
        return encrypted;
    }
}

// 数据加密
function encryptData(data) {
    // 实际项目中应该使用AES等加密算法
    // 这里使用Base64编码作为示例
    return btoa(data);
}

// 短信通知触发接口（预留）
async function sendSMSNotification(phone, message) {
    const result = await sendSMS(phone, message);
    if (result.success) {
        console.log('短信通知发送成功');
    } else {
        console.error('短信通知发送失败:', result.message);
    }
    return result;
}

// 语音外呼触发接口（预留）
async function sendVoiceNotification(phone, message) {
    const result = await sendVoiceCall(phone, message);
    if (result.success) {
        console.log('语音外呼发送成功');
    } else {
        console.error('语音外呼发送失败:', result.message);
    }
    return result;
}

// 业务场景触发示例（预留）
const BusinessScenarios = {
    // 跌倒检测告警
    FALL_DETECTED: {
        sms: (phone) => sendSMSNotification(phone, '检测到老人跌倒，请立即确认！'),
        voice: (phone) => sendVoiceNotification(phone, '检测到老人跌倒，请立即确认！')
    },
    
    // 长时间静止告警
    LONG_STATIONARY: {
        sms: (phone) => sendSMSNotification(phone, '检测到老人长时间静止，请关注！'),
        voice: (phone) => sendVoiceNotification(phone, '检测到老人长时间静止，请关注！')
    },
    
    // 行为异常告警
    BEHAVIOR_ABNORMAL: {
        sms: (phone) => sendSMSNotification(phone, '检测到老人行为异常，请确认！'),
        voice: (phone) => sendVoiceNotification(phone, '检测到老人行为异常，请确认！')
    },
    
    // 设备离线告警
    DEVICE_OFFLINE: {
        sms: (phone) => sendSMSNotification(phone, '监测设备已离线，请检查！'),
        voice: (phone) => sendVoiceNotification(phone, '监测设备已离线，请检查！')
    },
    
    // 安全提醒
    SAFETY_REMINDER: {
        sms: (phone) => sendSMSNotification(phone, '安全提醒：请定期检查老人身体状况'),
        voice: null // 仅短信
    },
    
    // 定期健康报告
    HEALTH_REPORT: {
        sms: (phone) => sendSMSNotification(phone, '本周健康报告已生成，请登录查看'),
        voice: null // 仅短信
    }
};

// 触发业务场景通知（预留）
function triggerBusinessNotification(scenario, phone, type = 'sms') {
    if (BusinessScenarios[scenario]) {
        const scenarioConfig = BusinessScenarios[scenario];
        
        if (type === 'sms' && scenarioConfig.sms) {
            scenarioConfig.sms(phone);
        } else if (type === 'voice' && scenarioConfig.voice) {
            scenarioConfig.voice(phone);
        } else if (type === 'both') {
            if (scenarioConfig.sms) scenarioConfig.sms(phone);
            if (scenarioConfig.voice) scenarioConfig.voice(phone);
        }
    }
}

// 页面加载完成后初始化
window.addEventListener('DOMContentLoaded', init);

// 页面卸载时清理定时器
window.addEventListener('unload', () => {
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }
});