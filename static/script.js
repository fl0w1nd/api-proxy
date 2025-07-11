// 全局状态
let isAuthenticated = false;
let currentConfig = null;
let currentTab = 'config';
let tempRedirects = [];
let tempRedirectUpdateInterval = null;

// DOM元素
const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const authStatusText = document.getElementById('auth-status-text');
const loginMessage = document.getElementById('login-message');
const contentContainer = document.querySelector('.content');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanes = document.querySelectorAll('.tab-pane');
const addMappingButton = document.getElementById('add-mapping');
const saveConfigButton = document.getElementById('save-config');
const mappingsContainer = document.getElementById('mappings-container');
const logLevelSelect = document.getElementById('log-level');
const defaultTimeoutInput = document.getElementById('default-timeout');
const defaultConnectTimeoutInput = document.getElementById('default-connect-timeout');
const prefixSelect = document.getElementById('prefix-select');
const logsBody = document.getElementById('logs-body');
const refreshLogsButton = document.getElementById('refresh-logs');

// 临时转发相关元素
const addTempRedirectButton = document.getElementById('add-temp-redirect');
const tempRedirectsList = document.getElementById('temp-redirects-list');

// 模板
const mappingTemplate = document.getElementById('mapping-template');
const headerTemplate = document.getElementById('header-template');
const tempRedirectTemplate = document.getElementById('temp-redirect-template');
const createTempRedirectModal = document.getElementById('create-temp-redirect-modal');

// 初始化
document.addEventListener('DOMContentLoaded', init);

function init() {
  // 检查认证状态
  checkAuthStatus();
  
  // 事件监听
  loginButton.addEventListener('click', login);
  logoutButton.addEventListener('click', logout);
  addMappingButton.addEventListener('click', addMapping);
  saveConfigButton.addEventListener('click', saveConfig);
  refreshLogsButton.addEventListener('click', loadLogs);
  addTempRedirectButton.addEventListener('click', showCreateTempRedirectModal);
  
  // 标签页切换
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
  
  // 添加页面加载动画
  document.body.classList.add('loaded');
}

// 认证相关
function checkAuthStatus() {
  // 显示加载状态
  showLoading(true);
  
  // 检查是否已保存认证信息
  const credentials = localStorage.getItem('api_proxy_auth');
  
  if (credentials) {
    // 尝试使用保存的认证信息
    fetchWithAuth('/api/config', {
      method: 'GET',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    })
    .then(response => {
      if (response.ok) {
        isAuthenticated = true;
        updateAuthUI(true);
        return response.json();
      } else {
        // 认证失败，清除本地存储
        localStorage.removeItem('api_proxy_auth');
        updateAuthUI(false);
        throw new Error('Authentication failed');
      }
    })
    .then(config => {
      // 加载配置
      currentConfig = config;
      renderConfig();
      loadPrefixOptions();
      showLoading(false);
    })
    .catch(error => {
      console.error('Auth check error:', error);
      showLoading(false);
      showNotification('无法验证登录状态', 'error');
    });
  } else {
    updateAuthUI(false);
    showLoading(false);
  }
}

function login() {
  const username = '';  // 用户名不重要，只需密码
  const password = prompt('请输入管理密码:');
  
  if (!password) return;
  
  // 显示加载状态
  showLoading(true);
  
  // 使用window.btoa进行base64编码，确保浏览器兼容性
  const credentials = window.btoa(`${username}:${password}`);
  
  fetch('/api/config', {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${credentials}`
    }
  })
  .then(response => {
    if (response.ok) {
      // 登录成功
      isAuthenticated = true;
      localStorage.setItem('api_proxy_auth', credentials);
      updateAuthUI(true);
      showNotification('登录成功', 'success');
      return response.json();
    } else {
      showNotification('密码错误或认证失败', 'error');
      throw new Error('Authentication failed');
    }
  })
  .then(config => {
    currentConfig = config;
    renderConfig();
    loadPrefixOptions();
    showLoading(false);
  })
  .catch(error => {
    console.error('Login error:', error);
    showLoading(false);
  });
}

function logout() {
  localStorage.removeItem('api_proxy_auth');
  isAuthenticated = false;
  updateAuthUI(false);
  showNotification('已退出登录', 'info');
}

function updateAuthUI(authenticated) {
  if (authenticated) {
    authStatusText.textContent = '已登录';
    loginButton.style.display = 'none';
    logoutButton.style.display = 'inline-flex';
    loginMessage.style.display = 'none';
    contentContainer.style.display = 'block';
  } else {
    authStatusText.textContent = '未登录';
    loginButton.style.display = 'inline-flex';
    logoutButton.style.display = 'none';
    loginMessage.style.display = 'block';
    contentContainer.style.display = 'none';
  }
}

// 标签页切换
function switchTab(tabName) {
  currentTab = tabName;
  
  // 更新标签按钮状态
  tabButtons.forEach(button => {
    if (button.getAttribute('data-tab') === tabName) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
  
  // 更新标签内容
  tabPanes.forEach(pane => {
    if (pane.id === `${tabName}-tab`) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
  
  // 如果切换到日志标签，加载日志
  if (tabName === 'logs') {
    loadLogs();
  }
  
  // 如果切换到临时转发标签，加载临时转发
  if (tabName === 'temp-redirects') {
    loadTempRedirects();
  }
}

// 配置管理
function renderConfig() {
  if (!currentConfig) return;
  
  // 设置日志级别
  logLevelSelect.value = currentConfig.log_level;
  
  // 设置全局超时配置
  defaultTimeoutInput.value = currentConfig.default_timeout || '';
  defaultConnectTimeoutInput.value = currentConfig.default_connect_timeout || '';
  
  // 清空现有映射
  mappingsContainer.innerHTML = '';
  
  // 渲染每个映射
  Object.entries(currentConfig.api_mappings).forEach(([prefix, mapping]) => {
    const mappingElement = createMappingElement(prefix, mapping);
    mappingsContainer.appendChild(mappingElement);
  });
  
  // 如果没有映射配置，显示空状态提示
  if (Object.keys(currentConfig.api_mappings).length === 0) {
    showEmptyState(mappingsContainer, '暂无API映射配置', '点击"添加映射"按钮创建第一个API映射');
  }
}

function createMappingElement(prefix, mapping) {
  const template = mappingTemplate.content.cloneNode(true);
  const element = template.querySelector('.mapping-card');
  
  // 设置基本字段
  element.querySelector('.prefix-input').value = prefix;
  element.querySelector('.target-url-input').value = mapping.target_url;
  
  // 更新卡片标题显示映射名称
  const titleElement = element.querySelector('.mapping-title');
  const titleInput = element.querySelector('.title-input');
  const mappingName = mapping.name || 'default';
  
  titleElement.textContent = mappingName;
  titleInput.value = mappingName;
  
  // 设置标题点击编辑功能
  setupTitleEditing(titleElement, titleInput);
  
  // 设置超时配置
  if (mapping.timeout) {
    element.querySelector('.timeout-input').value = mapping.timeout;
  }
  if (mapping.connect_timeout) {
    element.querySelector('.connect-timeout-input').value = mapping.connect_timeout;
  }
  
  // 设置高级配置切换
  const toggleButton = element.querySelector('.toggle-advanced');
  const advancedContent = element.querySelector('.advanced-content');
  
  toggleButton.addEventListener('click', function() {
    const isExpanded = advancedContent.style.display !== 'none';
    
    if (isExpanded) {
      advancedContent.style.display = 'none';
      toggleButton.classList.remove('expanded');
    } else {
      advancedContent.style.display = 'block';
      toggleButton.classList.add('expanded');
    }
  });
  
  // 设置删除按钮事件
  element.querySelector('.remove-mapping').addEventListener('click', function() {
    if (confirm('确定要删除此映射吗?')) {
      // 添加删除动画
      element.classList.add('fade-out');
      setTimeout(() => {
        element.remove();
        
        // 检查是否需要显示空状态
        if (mappingsContainer.children.length === 0) {
          showEmptyState(mappingsContainer, '暂无API映射配置', '点击"添加映射"按钮创建API映射');
        }
      }, 300);
    }
  });
  
  // 设置添加请求头按钮事件
  element.querySelector('.add-header').addEventListener('click', function() {
    const headersContainer = element.querySelector('.headers-container');
    const headerElement = createHeaderElement();
    headersContainer.appendChild(headerElement);
    
    // 添加动画效果
    headerElement.classList.add('fade-in');
    setTimeout(() => {
      headerElement.classList.remove('fade-in');
    }, 300);
  });
  
  // 添加已有的请求头
  const headersContainer = element.querySelector('.headers-container');
  if (mapping.extra_headers) {
    Object.entries(mapping.extra_headers).forEach(([key, value]) => {
      const headerElement = createHeaderElement(key, value);
      headersContainer.appendChild(headerElement);
    });
  }
  
  return element;
}

function setupTitleEditing(titleElement, titleInput) {
  // 点击标题进入编辑模式
  titleElement.addEventListener('click', function() {
    titleElement.style.display = 'none';
    titleInput.style.display = 'inline-block';
    titleInput.focus();
    titleInput.select();
  });
  
  // 处理编辑完成
  function finishEditing() {
    const newName = titleInput.value.trim() || 'default';
    titleElement.textContent = newName;
    titleElement.style.display = 'inline-block';
    titleInput.style.display = 'none';
  }
  
  // 按Enter或失去焦点时完成编辑
  titleInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      // 取消编辑，恢复原值
      titleInput.value = titleElement.textContent;
      titleElement.style.display = 'inline-block';
      titleInput.style.display = 'none';
    }
  });
  
  titleInput.addEventListener('blur', finishEditing);
}

function createHeaderElement(key = '', value = '') {
  const template = headerTemplate.content.cloneNode(true);
  const element = template.querySelector('.header-row');
  
  element.querySelector('.header-key').value = key;
  element.querySelector('.header-value').value = value;
  
  element.querySelector('.remove-header').addEventListener('click', function() {
    // 添加删除动画
    element.classList.add('fade-out');
    setTimeout(() => {
      element.remove();
    }, 300);
  });
  
  return element;
}

function addMapping() {
  const mappingElement = createMappingElement('', { name: 'default', target_url: '' });
  
  // 如果是第一个映射，清除空状态提示
  if (mappingsContainer.querySelector('.empty-state')) {
    mappingsContainer.innerHTML = '';
  }
  
  mappingsContainer.appendChild(mappingElement);
  
  // 添加动画效果
  mappingElement.classList.add('fade-in');
  setTimeout(() => {
    mappingElement.classList.remove('fade-in');
  }, 300);
  
  // 滚动到新添加的映射
  mappingElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
  // 自动聚焦到路径前缀输入框
  const firstInput = mappingElement.querySelector('.prefix-input');
  if (firstInput) {
    firstInput.focus();
  }
}

function saveConfig() {
  // 构建配置对象
  const newConfig = {
    api_mappings: {},
    log_level: logLevelSelect.value
  };
  
  // 添加全局超时配置
  const defaultTimeout = parseInt(defaultTimeoutInput.value);
  const defaultConnectTimeout = parseInt(defaultConnectTimeoutInput.value);
  
  if (defaultTimeout && defaultTimeout > 0) {
    newConfig.default_timeout = defaultTimeout;
  }
  if (defaultConnectTimeout && defaultConnectTimeout > 0) {
    newConfig.default_connect_timeout = defaultConnectTimeout;
  }
  
  // 获取所有映射
  const mappingElements = mappingsContainer.querySelectorAll('.mapping-card');
  
  for (const element of mappingElements) {
    const name = element.querySelector('.mapping-title').textContent.trim() || 'default';
    const prefix = element.querySelector('.prefix-input').value.trim();
    const targetUrl = element.querySelector('.target-url-input').value.trim();
    
    if (!prefix || !targetUrl) {
      showNotification('请为所有映射填写路径前缀和目标URL', 'warning');
      return;
    }
    
    // 构建请求头对象
    const extraHeaders = {};
    const headerElements = element.querySelectorAll('.header-row');
    
    for (const headerElement of headerElements) {
      const key = headerElement.querySelector('.header-key').value.trim();
      const value = headerElement.querySelector('.header-value').value.trim();
      
      if (key && value) {
        extraHeaders[key] = value;
      }
    }
    
    // 获取超时配置
    const timeout = parseInt(element.querySelector('.timeout-input').value);
    const connectTimeout = parseInt(element.querySelector('.connect-timeout-input').value);
    
    // 添加到配置
    newConfig.api_mappings[prefix] = {
      name: name,
      target_url: targetUrl
    };
    
    if (Object.keys(extraHeaders).length > 0) {
      newConfig.api_mappings[prefix].extra_headers = extraHeaders;
    }
    
    // 添加超时配置（如果有设置）
    if (timeout && timeout > 0) {
      newConfig.api_mappings[prefix].timeout = timeout;
    }
    if (connectTimeout && connectTimeout > 0) {
      newConfig.api_mappings[prefix].connect_timeout = connectTimeout;
    }
  }
  
  // 保存配置
  saveConfigToServer(newConfig);
}

function saveConfigToServer(config) {
  showLoading(true);
  
  fetchWithAuth('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      showNotification('配置保存成功', 'success');
      currentConfig = config;
      loadPrefixOptions(); // 更新日志前缀选项
    } else {
      showNotification(`保存失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    console.error('Save config error:', error);
    showNotification(`保存失败: ${error.message}`, 'error');
  });
}

// 日志管理
function loadPrefixOptions() {
  if (!currentConfig) return;
  
  // 获取所有前缀
  fetchWithAuth('/api/logs')
  .then(response => response.json())
  .then(prefixes => {
    // 清空现有选项
    prefixSelect.innerHTML = '';
    
    // 添加所有可用前缀
    prefixes.forEach(prefix => {
      const option = document.createElement('option');
      option.value = prefix;
      option.textContent = prefix;
      prefixSelect.appendChild(option);
    });
    
    // 如果没有日志，添加配置中的前缀
    if (prefixes.length === 0 && currentConfig) {
      Object.keys(currentConfig.api_mappings).forEach(prefix => {
        const option = document.createElement('option');
        option.value = prefix;
        option.textContent = prefix;
        prefixSelect.appendChild(option);
      });
    }
    
    // 如果有选项，加载第一个前缀的日志
    if (prefixSelect.options.length > 0) {
      loadLogs();
    }
  })
  .catch(error => {
    console.error('Load prefixes error:', error);
  });
}

function loadLogs() {
  const prefix = prefixSelect.value;
  
  if (!prefix) return;
  
  showLoading(true);
  
  fetchWithAuth(`/api/logs?prefix=${encodeURIComponent(prefix)}`)
  .then(response => response.json())
  .then(logs => {
    showLoading(false);
    renderLogs(logs);
  })
  .catch(error => {
    showLoading(false);
    console.error('Load logs error:', error);
    showNotification('加载日志失败', 'error');
  });
}

function renderLogs(logs) {
  // 清空现有日志
  logsBody.innerHTML = '';
  
  if (logs.length === 0) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent = '暂无日志数据';
    cell.style.textAlign = 'center';
    cell.style.padding = '40px';
    cell.style.color = 'var(--text-muted)';
    row.appendChild(cell);
    logsBody.appendChild(row);
    return;
  }
  
  // 渲染日志
  logs.forEach(log => {
    const row = document.createElement('tr');
    
    // 时间
    const timeCell = document.createElement('td');
    const date = new Date(log.timestamp);
    timeCell.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
    row.appendChild(timeCell);
    
    // 方法
    const methodCell = document.createElement('td');
    methodCell.textContent = log.method;
    // 为不同HTTP方法添加颜色
    if (log.method === 'GET') {
      methodCell.style.color = 'var(--success-color)';
    } else if (log.method === 'POST') {
      methodCell.style.color = 'var(--info-color)';
    } else if (log.method === 'PUT') {
      methodCell.style.color = 'var(--warning-color)';
    } else if (log.method === 'DELETE') {
      methodCell.style.color = 'var(--danger-color)';
    }
    row.appendChild(methodCell);
    
    // 路径
    const pathCell = document.createElement('td');
    pathCell.textContent = log.path;
    pathCell.style.fontFamily = 'monospace';
    pathCell.style.fontSize = '13px';
    row.appendChild(pathCell);
    
    // 目标URL
    const targetCell = document.createElement('td');
    targetCell.textContent = log.targetUrl;
    targetCell.style.fontFamily = 'monospace';
    targetCell.style.fontSize = '13px';
    row.appendChild(targetCell);
    
    // 状态
    const statusCell = document.createElement('td');
    statusCell.textContent = log.status;
    statusCell.style.fontWeight = '600';
    if (log.status >= 400) {
      statusCell.style.color = 'var(--danger-color)';
    } else if (log.status >= 300) {
      statusCell.style.color = 'var(--warning-color)';
    } else {
      statusCell.style.color = 'var(--success-color)';
    }
    row.appendChild(statusCell);
    
    // 耗时
    const durationCell = document.createElement('td');
    durationCell.textContent = `${log.duration}ms`;
    durationCell.style.fontFamily = 'monospace';
    durationCell.style.fontSize = '13px';
    // 为不同耗时添加颜色
    if (log.duration > 5000) {
      durationCell.style.color = 'var(--danger-color)';
    } else if (log.duration > 2000) {
      durationCell.style.color = 'var(--warning-color)';
    } else {
      durationCell.style.color = 'var(--success-color)';
    }
    row.appendChild(durationCell);
    
    logsBody.appendChild(row);
  });
}

// 工具函数
function fetchWithAuth(url, options = {}) {
  const credentials = localStorage.getItem('api_proxy_auth');
  
  if (!credentials) {
    return Promise.reject(new Error('Not authenticated'));
  }
  
  const headers = options.headers || {};
  headers['Authorization'] = `Basic ${credentials}`;
  
  return fetch(url, {
    ...options,
    headers
  });
}

// 辅助函数：显示加载状态
function showLoading(isLoading) {
  if (isLoading) {
    // 如果不存在加载元素，创建一个
    if (!document.getElementById('loading-overlay')) {
      const loadingOverlay = document.createElement('div');
      loadingOverlay.id = 'loading-overlay';
      loadingOverlay.innerHTML = `<div class="loading-spinner"></div>`;
      document.body.appendChild(loadingOverlay);
      
      // 添加动画效果
      setTimeout(() => {
        loadingOverlay.classList.add('active');
      }, 10);
    }
  } else {
    const loadingOverlay = document.getElementById('loading-overlay');
    if (loadingOverlay) {
      loadingOverlay.classList.remove('active');
      
      // 移除元素
      setTimeout(() => {
        loadingOverlay.remove();
      }, 300);
    }
  }
}

// 辅助函数：显示通知
function showNotification(message, type = 'info') {
  // 创建通知元素
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="material-icons">${getIconForType(type)}</i>
      <span>${message}</span>
    </div>
  `;
  
  // 添加到页面
  document.body.appendChild(notification);
  
  // 添加动画效果
  setTimeout(() => {
    notification.classList.add('active');
  }, 10);
  
  // 自动移除
  setTimeout(() => {
    notification.classList.remove('active');
    
    // 移除元素
    setTimeout(() => {
      notification.remove();
    }, 300);
  }, 3000);
  
  function getIconForType(type) {
    switch(type) {
      case 'success': return 'check_circle';
      case 'error': return 'error';
      case 'warning': return 'warning';
      default: return 'info';
    }
  }
}

// 辅助函数：显示空状态
function showEmptyState(container, title, message) {
  const emptyStateElement = document.createElement('div');
  emptyStateElement.className = 'empty-state';
  emptyStateElement.innerHTML = `
    <i class="material-icons">inbox</i>
    <h3>${title}</h3>
    <p>${message}</p>
  `;
  
  container.appendChild(emptyStateElement);
}

// 临时转发管理功能
function loadTempRedirects() {
  showLoading(true);
  
  fetchWithAuth('/api/temp-redirects')
  .then(response => response.json())
  .then(redirects => {
    showLoading(false);
    tempRedirects = redirects;
    renderTempRedirects();
    
    // 开始定时更新剩余时间
    startTempRedirectTimer();
  })
  .catch(error => {
    showLoading(false);
    console.error('Load temp redirects error:', error);
    showNotification('加载临时转发失败', 'error');
  });
}

function renderTempRedirects() {
  tempRedirectsList.innerHTML = '';
  
  if (tempRedirects.length === 0) {
    showEmptyState(tempRedirectsList, '暂无临时转发', '点击"生成临时转发"按钮创建临时转发链接');
    return;
  }
  
  tempRedirects.forEach(redirect => {
    const element = createTempRedirectElement(redirect);
    tempRedirectsList.appendChild(element);
  });
}

function createTempRedirectElement(redirect) {
  const template = tempRedirectTemplate.content.cloneNode(true);
  const element = template.querySelector('.temp-redirect-card');
  
  // 设置基本信息
  element.querySelector('.redirect-name').textContent = redirect.name || redirect.id;
  element.querySelector('.name-input').value = redirect.name || redirect.id;
  element.querySelector('.redirect-url').textContent = `${window.location.origin}${redirect.path}`;
  element.querySelector('.target-url').textContent = redirect.target_url;
  
  // 设置过期时间
  if (redirect.expires_at === -1) {
    element.querySelector('.expires-time').textContent = '永久有效';
  } else {
    const expiresTime = new Date(redirect.expires_at);
    element.querySelector('.expires-time').textContent = expiresTime.toLocaleString();
  }
  
  // 设置状态和剩余时间
  updateTempRedirectStatus(element, redirect);
  
  // 设置复制按钮
  element.querySelector('.copy-url').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = `${window.location.origin}${redirect.path}`;
    
    // 使用多种方式尝试复制
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showNotification('链接已复制到剪贴板', 'success');
      }).catch(() => {
        fallbackCopyTextToClipboard(url);
      });
    } else {
      fallbackCopyTextToClipboard(url);
    }
  });
  
  // 设置标题编辑功能
  const nameElement = element.querySelector('.redirect-name');
  const nameInput = element.querySelector('.name-input');
  setupTempRedirectTitleEditing(nameElement, nameInput, redirect.id);

  // 设置删除按钮
  element.querySelector('.remove-temp-redirect').addEventListener('click', () => {
    if (confirm('确定要删除此临时转发吗？')) {
      deleteTempRedirect(redirect.id);
    }
  });
  
  // 存储redirect数据以便更新
  element.dataset.redirectId = redirect.id;
  
  return element;
}

function updateTempRedirectStatus(element, redirect) {
  const statusElement = element.querySelector('.redirect-status');
  const remainingElement = element.querySelector('.remaining-time');
  
  if (redirect.expires_at === -1) {
    // 永久转发
    statusElement.textContent = '永久';
    statusElement.style.backgroundColor = 'var(--info-color)';
    statusElement.style.color = 'white';
    remainingElement.textContent = '永久有效';
    remainingElement.style.color = 'var(--info-color)';
    element.classList.remove('expired');
  } else {
    const now = Date.now();
    const remaining = redirect.expires_at - now;
    
    if (remaining <= 0) {
      statusElement.textContent = '已过期';
      statusElement.style.backgroundColor = 'var(--danger-color)';
      statusElement.style.color = 'white';
      remainingElement.textContent = '已过期';
      remainingElement.style.color = 'var(--danger-color)';
      element.classList.add('expired');
    } else {
      statusElement.textContent = '活跃';
      statusElement.style.backgroundColor = 'var(--success-color)';
      statusElement.style.color = 'white';
      remainingElement.textContent = formatTimeRemaining(remaining);
      remainingElement.style.color = remaining < 300000 ? 'var(--warning-color)' : 'var(--text-primary)'; // 5分钟内显示警告色
      element.classList.remove('expired');
    }
  }
}

function formatTimeRemaining(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}天 ${hours % 24}小时`;
  } else if (hours > 0) {
    return `${hours}小时 ${minutes % 60}分钟`;
  } else if (minutes > 0) {
    return `${minutes}分钟 ${seconds % 60}秒`;
  } else {
    return `${seconds}秒`;
  }
}

function startTempRedirectTimer() {
  // 清除现有定时器
  if (tempRedirectUpdateInterval) {
    clearInterval(tempRedirectUpdateInterval);
  }
  
  // 每秒更新一次剩余时间
  tempRedirectUpdateInterval = setInterval(() => {
    if (currentTab === 'temp-redirects') {
      const elements = tempRedirectsList.querySelectorAll('.temp-redirect-card');
      elements.forEach(element => {
        const redirectId = element.dataset.redirectId;
        const redirect = tempRedirects.find(r => r.id === redirectId);
        if (redirect) {
          updateTempRedirectStatus(element, redirect);
        }
      });
    }
  }, 1000);
}

function showCreateTempRedirectModal() {
  const modal = createTempRedirectModal.content.cloneNode(true);
  const modalElement = modal.querySelector('.modal-overlay');
  
  // 设置事件监听
  modalElement.querySelector('.close-modal').addEventListener('click', () => {
    document.body.removeChild(modalElement);
  });
  
  modalElement.querySelector('.cancel-temp-redirect').addEventListener('click', () => {
    document.body.removeChild(modalElement);
  });
  
  // 点击遮罩关闭
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      document.body.removeChild(modalElement);
    }
  });
  
  // 过期时间选项切换
  const expireRadios = modalElement.querySelectorAll('input[name="expire-type"]');
  const timeInputGroup = modalElement.querySelector('#time-input-group');
  
  expireRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      if (radio.value === 'permanent') {
        timeInputGroup.classList.add('hidden');
      } else {
        timeInputGroup.classList.remove('hidden');
      }
    });
  });

  // 高级配置切换
  const toggleButton = modalElement.querySelector('.toggle-temp-advanced');
  const advancedContent = modalElement.querySelector('.advanced-content');
  
  toggleButton.addEventListener('click', () => {
    const isExpanded = advancedContent.style.display !== 'none';
    
    if (isExpanded) {
      advancedContent.style.display = 'none';
      toggleButton.classList.remove('expanded');
    } else {
      advancedContent.style.display = 'block';
      toggleButton.classList.add('expanded');
    }
  });
  
  // 添加请求头功能
  modalElement.querySelector('.add-temp-header').addEventListener('click', () => {
    const headersContainer = modalElement.querySelector('.temp-headers-container');
    const headerElement = createTempHeaderElement();
    headersContainer.appendChild(headerElement);
  });
  
  // 创建转发按钮
  modalElement.querySelector('.create-temp-redirect').addEventListener('click', () => {
    createTempRedirect(modalElement);
  });
  
  document.body.appendChild(modalElement);
}

function createTempHeaderElement(key = '', value = '') {
  const headerElement = document.createElement('div');
  headerElement.className = 'header-row';
  headerElement.innerHTML = `
    <input type="text" class="header-key" placeholder="Header名称" value="${key}">
    <input type="text" class="header-value" placeholder="Header值" value="${value}">
    <button class="remove-header btn-danger-small">
      <i class="material-icons">close</i>
    </button>
  `;
  
  headerElement.querySelector('.remove-header').addEventListener('click', () => {
    headerElement.remove();
  });
  
  return headerElement;
}

function createTempRedirect(modalElement) {
  const targetUrl = modalElement.querySelector('#temp-target-url').value.trim();
  const expireType = modalElement.querySelector('input[name="expire-type"]:checked').value;
  const expiresIn = parseInt(modalElement.querySelector('#temp-expires-in').value);
  const timeout = parseInt(modalElement.querySelector('#temp-timeout').value);
  const connectTimeout = parseInt(modalElement.querySelector('#temp-connect-timeout').value);
  
  if (!targetUrl) {
    showNotification('请输入目标URL', 'warning');
    return;
  }
  
  if (expireType === 'time' && (!expiresIn || expiresIn < 60 || expiresIn > 2592000)) {
    showNotification('过期时间必须在60秒到2592000秒之间', 'warning');
    return;
  }
  
  // 收集请求头
  const extraHeaders = {};
  const headerElements = modalElement.querySelectorAll('.header-row');
  headerElements.forEach(element => {
    const key = element.querySelector('.header-key').value.trim();
    const value = element.querySelector('.header-value').value.trim();
    if (key && value) {
      extraHeaders[key] = value;
    }
  });
  
  const requestData = {
    target_url: targetUrl,
    expires_in: expireType === 'permanent' ? -1 : expiresIn
  };
  
  if (Object.keys(extraHeaders).length > 0) {
    requestData.extra_headers = extraHeaders;
  }
  
  if (timeout && timeout > 0) {
    requestData.timeout = timeout;
  }
  
  if (connectTimeout && connectTimeout > 0) {
    requestData.connect_timeout = connectTimeout;
  }
  
  showLoading(true);
  
  fetchWithAuth('/api/temp-redirects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      showNotification('临时转发创建成功', 'success');
      document.body.removeChild(modalElement);
      loadTempRedirects(); // 重新加载列表
    } else {
      showNotification(`创建失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    console.error('Create temp redirect error:', error);
    showNotification(`创建失败: ${error.message}`, 'error');
  });
}

function deleteTempRedirect(redirectId) {
  showLoading(true);
  
  fetchWithAuth(`/api/temp-redirects/${redirectId}`, {
    method: 'DELETE'
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      showNotification('临时转发删除成功', 'success');
      loadTempRedirects(); // 重新加载列表
    } else {
      showNotification(`删除失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    console.error('Delete temp redirect error:', error);
    showNotification(`删除失败: ${error.message}`, 'error');
  });
}

// 备用复制方法
function fallbackCopyTextToClipboard(text) {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();
  
  try {
    const successful = document.execCommand('copy');
    if (successful) {
      showNotification('链接已复制到剪贴板', 'success');
    } else {
      showNotification('复制失败，请手动复制', 'error');
    }
  } catch (err) {
    console.error('Fallback copy failed:', err);
    showNotification('复制失败，请手动复制', 'error');
  }
  
  document.body.removeChild(textArea);
}

// 临时转发标题编辑功能
function setupTempRedirectTitleEditing(nameElement, nameInput, redirectId) {
  // 点击标题进入编辑模式
  nameElement.addEventListener('click', function() {
    nameElement.style.display = 'none';
    nameInput.style.display = 'inline-block';
    nameInput.focus();
    nameInput.select();
  });
  
  // 处理编辑完成
  function finishEditing() {
    const newName = nameInput.value.trim() || redirectId;
    
    // 如果名称没有改变，直接返回
    if (newName === nameElement.textContent) {
      nameElement.style.display = 'inline-block';
      nameInput.style.display = 'none';
      return;
    }
    
    // 更新名称
    updateTempRedirectName(redirectId, newName, nameElement, nameInput);
  }
  
  // 按Enter或失去焦点时完成编辑
  nameInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      finishEditing();
    } else if (e.key === 'Escape') {
      // 取消编辑，恢复原值
      nameInput.value = nameElement.textContent;
      nameElement.style.display = 'inline-block';
      nameInput.style.display = 'none';
    }
  });
  
  nameInput.addEventListener('blur', finishEditing);
}

// 更新临时转发名称
function updateTempRedirectName(redirectId, newName, nameElement, nameInput) {
  fetchWithAuth(`/api/temp-redirects/${redirectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ name: newName })
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
      nameElement.textContent = newName;
      nameElement.style.display = 'inline-block';
      nameInput.style.display = 'none';
      showNotification('名称更新成功', 'success');
      
      // 更新本地数据
      const redirect = tempRedirects.find(r => r.id === redirectId);
      if (redirect) {
        redirect.name = newName;
      }
    } else {
      showNotification(`更新失败: ${result.error || '未知错误'}`, 'error');
      // 恢复原值
      nameInput.value = nameElement.textContent;
      nameElement.style.display = 'inline-block';
      nameInput.style.display = 'none';
    }
  })
  .catch(error => {
    console.error('Update name error:', error);
    showNotification(`更新失败: ${error.message}`, 'error');
    // 恢复原值
    nameInput.value = nameElement.textContent;
    nameElement.style.display = 'inline-block';
    nameInput.style.display = 'none';
  });
}