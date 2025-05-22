// 全局状态
let isAuthenticated = false;
let currentConfig = null;
let currentTab = 'config';

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
const prefixSelect = document.getElementById('prefix-select');
const logsBody = document.getElementById('logs-body');
const refreshLogsButton = document.getElementById('refresh-logs');

// 模板
const mappingTemplate = document.getElementById('mapping-template');
const headerTemplate = document.getElementById('header-template');

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
  
  // 标签页切换
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabName = button.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
  
  // 添加页面加载动画
  document.body.classList.add('loaded');
  
  // 添加主题切换功能
  setupTheme();
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
    logoutButton.style.display = 'inline-block';
    loginMessage.style.display = 'none';
    contentContainer.style.display = 'block';
  } else {
    authStatusText.textContent = '未登录';
    loginButton.style.display = 'inline-block';
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
}

// 配置管理
function renderConfig() {
  if (!currentConfig) return;
  
  // 设置日志级别
  logLevelSelect.value = currentConfig.log_level;
  
  // 清空现有映射
  mappingsContainer.innerHTML = '';
  
  // 渲染每个映射
  Object.entries(currentConfig.api_mappings).forEach(([prefix, mapping]) => {
    const mappingElement = createMappingElement(prefix, mapping);
    mappingsContainer.appendChild(mappingElement);
  });
  
  // 如果没有映射配置，显示空状态提示
  if (Object.keys(currentConfig.api_mappings).length === 0) {
    showEmptyState(mappingsContainer, '暂无API映射配置', '点击"添加新映射"按钮创建第一个API映射');
  }
}

function createMappingElement(prefix, mapping) {
  const template = mappingTemplate.content.cloneNode(true);
  const element = template.querySelector('.mapping-item');
  
  // 设置基本字段
  element.querySelector('.prefix-input').value = prefix;
  element.querySelector('.target-url-input').value = mapping.target_url;
  
  // 设置删除按钮事件
  element.querySelector('.remove-mapping').addEventListener('click', function() {
    if (confirm('确定要删除此映射吗?')) {
      // 添加删除动画
      element.classList.add('fade-out');
      setTimeout(() => {
        element.remove();
        
        // 检查是否需要显示空状态
        if (mappingsContainer.children.length === 0) {
          showEmptyState(mappingsContainer, '暂无API映射配置', '点击"添加新映射"按钮创建API映射');
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

function createHeaderElement(key = '', value = '') {
  const template = headerTemplate.content.cloneNode(true);
  const element = template.querySelector('.header-item');
  
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
  const mappingElement = createMappingElement('', { target_url: '' });
  
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
}

function saveConfig() {
  // 构建配置对象
  const newConfig = {
    api_mappings: {},
    log_level: logLevelSelect.value
  };
  
  // 获取所有映射
  const mappingElements = mappingsContainer.querySelectorAll('.mapping-item');
  
  for (const element of mappingElements) {
    const prefix = element.querySelector('.prefix-input').value.trim();
    const targetUrl = element.querySelector('.target-url-input').value.trim();
    
    if (!prefix || !targetUrl) {
      alert('请为所有映射填写路径前缀和目标URL');
      return;
    }
    
    // 构建请求头对象
    const extraHeaders = {};
    const headerElements = element.querySelectorAll('.header-item');
    
    for (const headerElement of headerElements) {
      const key = headerElement.querySelector('.header-key').value.trim();
      const value = headerElement.querySelector('.header-value').value.trim();
      
      if (key && value) {
        extraHeaders[key] = value;
      }
    }
    
    // 添加到配置
    newConfig.api_mappings[prefix] = {
      target_url: targetUrl
    };
    
    if (Object.keys(extraHeaders).length > 0) {
      newConfig.api_mappings[prefix].extra_headers = extraHeaders;
    }
  }
  
  // 保存配置
  saveConfigToServer(newConfig);
}

function saveConfigToServer(config) {
  fetchWithAuth('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(config)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
      alert('配置保存成功');
      currentConfig = config;
      loadPrefixOptions(); // 更新日志前缀选项
    } else {
      alert(`保存失败: ${result.error || '未知错误'}`);
    }
  })
  .catch(error => {
    console.error('Save config error:', error);
    alert(`保存失败: ${error.message}`);
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
  
  fetchWithAuth(`/api/logs?prefix=${encodeURIComponent(prefix)}`)
  .then(response => response.json())
  .then(logs => {
    renderLogs(logs);
  })
  .catch(error => {
    console.error('Load logs error:', error);
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
    row.appendChild(methodCell);
    
    // 路径
    const pathCell = document.createElement('td');
    pathCell.textContent = log.path;
    row.appendChild(pathCell);
    
    // 目标URL
    const targetCell = document.createElement('td');
    targetCell.textContent = log.targetUrl;
    row.appendChild(targetCell);
    
    // 状态
    const statusCell = document.createElement('td');
    statusCell.textContent = log.status;
    if (log.status >= 400) {
      statusCell.style.color = '#e74c3c';
    } else if (log.status >= 300) {
      statusCell.style.color = '#f39c12';
    } else {
      statusCell.style.color = '#27ae60';
    }
    row.appendChild(statusCell);
    
    // 耗时
    const durationCell = document.createElement('td');
    durationCell.textContent = `${log.duration} ms`;
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

// 主题设置
function setupTheme() {
  // 实现主题切换功能
  // 这里可以根据需要进一步实现暗色模式等功能
} 