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
const editTempRedirectModal = document.getElementById('edit-temp-redirect-modal');
const editMappingModal = document.getElementById('edit-mapping-modal');

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
  
  // 设置标题
  const mappingName = mapping.name || 'default';
  element.querySelector('.mapping-title').textContent = mappingName;
  
  // 设置基本信息
  element.querySelector('.prefix-display').textContent = prefix;
  element.querySelector('.target-url-display').textContent = mapping.target_url;
  
  // 设置超时信息
  if (mapping.timeout) {
    element.querySelector('.timeout-display').textContent = `${mapping.timeout}ms`;
  }
  if (mapping.connect_timeout) {
    element.querySelector('.connect-timeout-display').textContent = `${mapping.connect_timeout}ms`;
  }
  
  // 设置请求头信息
  const headersRow = element.querySelector('.headers-row');
  const headersDisplay = element.querySelector('.headers-display');
  
  if (mapping.extra_headers && Object.keys(mapping.extra_headers).length > 0) {
    headersRow.style.display = 'flex';
    headersDisplay.innerHTML = '';
    
    for (const [key, value] of Object.entries(mapping.extra_headers)) {
      const headerSpan = document.createElement('span');
      headerSpan.className = 'header-item';
      headerSpan.innerHTML = `<strong>${key}:</strong> ${value}`;
      headersDisplay.appendChild(headerSpan);
    }
  }
  
  // 设置复制按钮
  element.querySelector('.copy-mapping-url').addEventListener('click', function() {
    const url = `${window.location.origin}${prefix}`;
    
    // 使用多种方式尝试复制
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showNotification('映射URL已复制到剪贴板', 'success');
      }).catch(() => {
        fallbackCopyTextToClipboard(url, '映射URL已复制到剪贴板');
      });
    } else {
      fallbackCopyTextToClipboard(url, '映射URL已复制到剪贴板');
    }
  });
  
  // 设置编辑按钮
  element.querySelector('.edit-mapping').addEventListener('click', function() {
    showEditMappingModal(prefix, mapping);
  });
  
  // 设置删除按钮事件
  element.querySelector('.remove-mapping').addEventListener('click', function() {
    if (confirm('确定要删除此映射吗?')) {
      deleteMapping(prefix, element);
    }
  });
  
  // 存储映射数据以便编辑
  element.dataset.prefix = prefix;
  element.dataset.mappingData = JSON.stringify(mapping);
  
  return element;
}

function addMapping() {
  // 直接显示编辑映射弹窗来创建新映射
  showEditMappingModal('', { name: 'default', target_url: '' });
}

function saveConfig() {
  // 构建配置对象，保留现有的API映射
  const newConfig = {
    api_mappings: currentConfig.api_mappings,
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
  
  // 保存配置到服务器
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
  logs.forEach((log, index) => {
    const row = document.createElement('tr');
    row.style.cursor = 'pointer';
    row.title = '点击查看详情';
    
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
    
    // 路径 - 超过60字符时省略
    const pathCell = document.createElement('td');
    const truncatedPath = log.path.length > 60 ? log.path.substring(0, 60) + '...' : log.path;
    pathCell.textContent = truncatedPath;
    pathCell.style.fontFamily = 'monospace';
    pathCell.style.fontSize = '13px';
    pathCell.title = log.path; // 悬停时显示完整路径
    row.appendChild(pathCell);
    
    // 目标URL - 超过60字符时省略
    const targetCell = document.createElement('td');
    const truncatedTarget = log.targetUrl.length > 60 ? log.targetUrl.substring(0, 60) + '...' : log.targetUrl;
    targetCell.textContent = truncatedTarget;
    targetCell.style.fontFamily = 'monospace';
    targetCell.style.fontSize = '13px';
    targetCell.title = log.targetUrl; // 悬停时显示完整URL
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
    
    // 点击整行查看详情
    row.addEventListener('click', () => {
      showLogDetail(log);
    });
    
    logsBody.appendChild(row);
  });
}

// 显示日志详情
function showLogDetail(log) {
  const modal = document.getElementById('log-detail-modal');
  
  // 填充基本信息
  document.getElementById('detail-timestamp').textContent = new Date(log.timestamp).toLocaleString();
  document.getElementById('detail-method').textContent = log.method;
  document.getElementById('detail-path').textContent = log.path;
  document.getElementById('detail-target-url').textContent = log.targetUrl;
  document.getElementById('detail-status').textContent = log.status;
  document.getElementById('detail-duration').textContent = `${log.duration}ms`;
  
  // 填充元数据
  if (log.metadata) {
    document.getElementById('detail-request-size').textContent = formatBytes(log.metadata.requestSize);
    document.getElementById('detail-response-size').textContent = formatBytes(log.metadata.responseSize);
    document.getElementById('detail-content-type').textContent = log.metadata.contentType || '未知';
    document.getElementById('detail-user-agent').textContent = log.metadata.userAgent || '未知';
  } else {
    // 兼容旧格式
    document.getElementById('detail-request-size').textContent = '未知';
    document.getElementById('detail-response-size').textContent = '未知';
    document.getElementById('detail-content-type').textContent = '未知';
    document.getElementById('detail-user-agent').textContent = '未知';
  }
  
  // 填充请求头信息
  const originalHeadersContainer = document.getElementById('detail-original-headers');
  const proxyHeadersContainer = document.getElementById('detail-proxy-headers');
  const changesHeadersContainer = document.getElementById('detail-changes-headers');
  
  // 清空容器
  originalHeadersContainer.innerHTML = '';
  proxyHeadersContainer.innerHTML = '';
  changesHeadersContainer.innerHTML = '';
  
  if (log.requestHeaders && typeof log.requestHeaders === 'object') {
    // 新格式：包含 original, proxy, added, modified 字段
    if (log.requestHeaders.original) {
      // 用户原始请求头
      if (Object.keys(log.requestHeaders.original).length > 0) {
        Object.entries(log.requestHeaders.original).forEach(([key, value]) => {
          const headerItem = document.createElement('div');
          headerItem.className = 'header-item';
          headerItem.innerHTML = `
            <div class="header-key">${escapeHtml(key)}</div>
            <div class="header-value">${escapeHtml(value)}</div>
          `;
          originalHeadersContainer.appendChild(headerItem);
        });
      } else {
        originalHeadersContainer.innerHTML = '<div class="no-headers">无用户请求头数据</div>';
      }
      
      // 代理发送请求头
      if (log.requestHeaders.proxy && Object.keys(log.requestHeaders.proxy).length > 0) {
        Object.entries(log.requestHeaders.proxy).forEach(([key, value]) => {
          const headerItem = document.createElement('div');
          headerItem.className = 'header-item';
          
          // 标记新增或修改的请求头
          let itemClass = '';
          let badge = '';
          if (log.requestHeaders.added && log.requestHeaders.added[key]) {
            itemClass = ' added';
            badge = '<span class="header-badge added">新增</span>';
          } else if (log.requestHeaders.modified && log.requestHeaders.modified[key]) {
            itemClass = ' modified';
            badge = '<span class="header-badge modified">修改</span>';
          }
          
          headerItem.className = `header-item${itemClass}`;
          headerItem.innerHTML = `
            <div class="header-key">${escapeHtml(key)}${badge}</div>
            <div class="header-value">${escapeHtml(value)}</div>
          `;
          proxyHeadersContainer.appendChild(headerItem);
        });
      } else {
        proxyHeadersContainer.innerHTML = '<div class="no-headers">无代理请求头数据</div>';
      }
      
      // 代理修改汇总
      const hasChanges = (log.requestHeaders.added && Object.keys(log.requestHeaders.added).length > 0) ||
                        (log.requestHeaders.modified && Object.keys(log.requestHeaders.modified).length > 0);
      
      if (hasChanges) {
        if (log.requestHeaders.added && Object.keys(log.requestHeaders.added).length > 0) {
          const addedSection = document.createElement('div');
          addedSection.className = 'changes-section';
          addedSection.innerHTML = '<h5><i class="material-icons">add</i> 新增的请求头</h5>';
          
          Object.entries(log.requestHeaders.added).forEach(([key, value]) => {
            const headerItem = document.createElement('div');
            headerItem.className = 'header-item added';
            headerItem.innerHTML = `
              <div class="header-key">${escapeHtml(key)}</div>
              <div class="header-value">${escapeHtml(value)}</div>
            `;
            addedSection.appendChild(headerItem);
          });
          
          changesHeadersContainer.appendChild(addedSection);
        }
        
        if (log.requestHeaders.modified && Object.keys(log.requestHeaders.modified).length > 0) {
          const modifiedSection = document.createElement('div');
          modifiedSection.className = 'changes-section';
          modifiedSection.innerHTML = '<h5><i class="material-icons">edit</i> 修改的请求头</h5>';
          
          Object.entries(log.requestHeaders.modified).forEach(([key, value]) => {
            const headerItem = document.createElement('div');
            headerItem.className = 'header-item modified';
            const originalValue = log.requestHeaders.original[key] || '未知';
            headerItem.innerHTML = `
              <div class="header-key">${escapeHtml(key)}</div>
              <div class="header-value">
                <div class="value-comparison">
                  <div class="original-value">原始: ${escapeHtml(originalValue)}</div>
                  <div class="modified-value">修改: ${escapeHtml(value)}</div>
                </div>
              </div>
            `;
            modifiedSection.appendChild(headerItem);
          });
          
          changesHeadersContainer.appendChild(modifiedSection);
        }
      } else {
        changesHeadersContainer.innerHTML = '<div class="no-headers">代理服务器未修改请求头</div>';
      }
    } else {
      // 兼容旧格式
      if (Object.keys(log.requestHeaders).length > 0) {
        Object.entries(log.requestHeaders).forEach(([key, value]) => {
          const headerItem = document.createElement('div');
          headerItem.className = 'header-item';
          headerItem.innerHTML = `
            <div class="header-key">${escapeHtml(key)}</div>
            <div class="header-value">${escapeHtml(value)}</div>
          `;
          originalHeadersContainer.appendChild(headerItem);
        });
      } else {
        originalHeadersContainer.innerHTML = '<div class="no-headers">无请求头数据</div>';
      }
      
      proxyHeadersContainer.innerHTML = '<div class="no-headers">旧版本数据，无代理请求头信息</div>';
      changesHeadersContainer.innerHTML = '<div class="no-headers">旧版本数据，无修改信息</div>';
    }
  } else {
    originalHeadersContainer.innerHTML = '<div class="no-headers">无请求头数据</div>';
    proxyHeadersContainer.innerHTML = '<div class="no-headers">无代理请求头数据</div>';
    changesHeadersContainer.innerHTML = '<div class="no-headers">无修改信息</div>';
  }
  
  // 设置请求头标签页切换功能
  setupHeaderTabs();
  
  // 填充响应头
  const responseHeadersContainer = document.getElementById('detail-response-headers');
  responseHeadersContainer.innerHTML = '';
  if (log.responseHeaders && Object.keys(log.responseHeaders).length > 0) {
    Object.entries(log.responseHeaders).forEach(([key, value]) => {
      const headerItem = document.createElement('div');
      headerItem.className = 'header-item';
      headerItem.innerHTML = `
        <div class="header-key">${escapeHtml(key)}</div>
        <div class="header-value">${escapeHtml(value)}</div>
      `;
      responseHeadersContainer.appendChild(headerItem);
    });
  } else {
    responseHeadersContainer.innerHTML = '<div class="no-headers">无响应头数据</div>';
  }
  
  // 显示模态框
  modal.style.display = 'flex';
  
  // 添加关闭事件
  const closeButton = modal.querySelector('.close-modal');
  closeButton.onclick = () => {
    modal.style.display = 'none';
  };
  
  // 点击背景关闭
  modal.onclick = (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  };
  
  // ESC键关闭
  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      modal.style.display = 'none';
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);
}

// 设置请求头标签页切换功能
function setupHeaderTabs() {
  const tabButtons = document.querySelectorAll('.header-tab-btn');
  const tabContents = document.querySelectorAll('.headers-tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // 更新按钮状态
      tabButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // 更新内容显示
      tabContents.forEach(content => {
        content.classList.remove('active');
        if (content.id === `detail-${targetTab}-headers`) {
          content.classList.add('active');
        }
      });
    });
  });
}

// 格式化字节大小
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  if (!bytes || bytes < 0) return '未知';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// HTML转义
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, function(m) { return map[m]; });
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
  element.querySelector('.redirect-url').textContent = redirect.path;
  element.querySelector('.target-url').textContent = redirect.target_url;
  
  // 设置转发模式
  const redirectMode = element.querySelector('.redirect-mode');
  if (redirect.redirect_only) {
    redirectMode.textContent = '302 重定向';
    redirectMode.style.color = 'var(--warning-color)';
  } else {
    redirectMode.textContent = '代理请求';
    redirectMode.style.color = 'var(--success-color)';
  }
  
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
  element.querySelector('.copy-temp-url').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const url = `${window.location.origin}${redirect.path}`;
    
    // 使用多种方式尝试复制
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        showNotification('临时转发链接已复制到剪贴板', 'success');
      }).catch(() => {
        fallbackCopyTextToClipboard(url, '临时转发链接已复制到剪贴板');
      });
    } else {
      fallbackCopyTextToClipboard(url, '临时转发链接已复制到剪贴板');
    }
  });
  
  // 设置标题编辑功能
  const nameElement = element.querySelector('.redirect-name');
  const nameInput = element.querySelector('.name-input');
  setupTempRedirectTitleEditing(nameElement, nameInput, redirect.id);

  // 设置编辑按钮
  element.querySelector('.edit-temp-redirect').addEventListener('click', () => {
    showEditTempRedirectModal(redirect);
  });

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
  
  // "仅跳转"选项切换时禁用/启用相关字段
  const redirectOnlyCheckbox = modalElement.querySelector('#temp-redirect-only');
  const timeoutInputs = modalElement.querySelectorAll('#temp-timeout, #temp-connect-timeout');
  const headersSection = modalElement.querySelector('.headers-section');
  
  redirectOnlyCheckbox.addEventListener('change', () => {
    const isRedirectOnly = redirectOnlyCheckbox.checked;
    
    // 禁用/启用超时设置
    timeoutInputs.forEach(input => {
      input.disabled = isRedirectOnly;
      if (isRedirectOnly) {
        input.style.opacity = '0.5';
        input.style.pointerEvents = 'none';
      } else {
        input.style.opacity = '1';
        input.style.pointerEvents = 'auto';
      }
    });
    
    // 禁用/启用请求头设置
    if (isRedirectOnly) {
      headersSection.style.opacity = '0.5';
      headersSection.style.pointerEvents = 'none';
    } else {
      headersSection.style.opacity = '1';
      headersSection.style.pointerEvents = 'auto';
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
  const redirectOnly = modalElement.querySelector('#temp-redirect-only').checked;
  
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
    expires_in: expireType === 'permanent' ? -1 : expiresIn,
    redirect_only: redirectOnly
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
function fallbackCopyTextToClipboard(text, successMessage = '链接已复制到剪贴板') {
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
      showNotification(successMessage, 'success');
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

// 显示编辑临时转发模态框
function showEditTempRedirectModal(redirect) {
  const modal = editTempRedirectModal.content.cloneNode(true);
  const modalElement = modal.querySelector('.modal-overlay');
  
  // 填充现有数据
  modalElement.querySelector('#edit-temp-name').value = redirect.name || redirect.id;
  modalElement.querySelector('#edit-temp-target-url').value = redirect.target_url || '';
  modalElement.querySelector('#edit-temp-redirect-only').checked = redirect.redirect_only || false;
  
  if (redirect.timeout) {
    modalElement.querySelector('#edit-temp-timeout').value = redirect.timeout;
  }
  if (redirect.connect_timeout) {
    modalElement.querySelector('#edit-temp-connect-timeout').value = redirect.connect_timeout;
  }
  
  // 填充请求头
  const headersContainer = modalElement.querySelector('.edit-headers-container');
  if (redirect.extra_headers) {
    for (const [key, value] of Object.entries(redirect.extra_headers)) {
      const headerElement = createEditHeaderElement(key, value);
      headersContainer.appendChild(headerElement);
    }
  }
  
  // 设置事件监听
  modalElement.querySelector('.close-modal').addEventListener('click', () => {
    document.body.removeChild(modalElement);
  });
  
  modalElement.querySelector('.cancel-edit-redirect').addEventListener('click', () => {
    document.body.removeChild(modalElement);
  });
  
  // 点击遮罩关闭
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      document.body.removeChild(modalElement);
    }
  });

  // 高级配置切换
  const toggleButton = modalElement.querySelector('.toggle-edit-advanced');
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
  
  // "仅跳转"选项切换时禁用/启用相关字段
  const redirectOnlyCheckbox = modalElement.querySelector('#edit-temp-redirect-only');
  const timeoutInputs = modalElement.querySelectorAll('#edit-temp-timeout, #edit-temp-connect-timeout');
  const headersSection = modalElement.querySelector('.headers-section');
  
  function toggleRedirectOnlyFields() {
    const isRedirectOnly = redirectOnlyCheckbox.checked;
    
    // 禁用/启用超时设置
    timeoutInputs.forEach(input => {
      input.disabled = isRedirectOnly;
      if (isRedirectOnly) {
        input.style.opacity = '0.5';
        input.style.pointerEvents = 'none';
      } else {
        input.style.opacity = '1';
        input.style.pointerEvents = 'auto';
      }
    });
    
    // 禁用/启用请求头设置
    if (isRedirectOnly) {
      headersSection.style.opacity = '0.5';
      headersSection.style.pointerEvents = 'none';
    } else {
      headersSection.style.opacity = '1';
      headersSection.style.pointerEvents = 'auto';
    }
  }
  
  redirectOnlyCheckbox.addEventListener('change', toggleRedirectOnlyFields);
  // 初始化状态
  toggleRedirectOnlyFields();
  
  // 添加请求头功能
  modalElement.querySelector('.add-edit-header').addEventListener('click', () => {
    const headerElement = createEditHeaderElement();
    headersContainer.appendChild(headerElement);
  });
  
  // 保存按钮
  modalElement.querySelector('.save-edit-redirect').addEventListener('click', () => {
    updateTempRedirect(redirect.id, modalElement);
  });
  
  document.body.appendChild(modalElement);
}

// 创建编辑模式的请求头元素
function createEditHeaderElement(key = '', value = '') {
  const headerElement = document.createElement('div');
  headerElement.className = 'header-row';
  headerElement.innerHTML = `
    <input type="text" class="header-key" placeholder="Header名称" value="${key}">
    <input type="text" class="header-value" placeholder="Header值" value="${value}">
    <button class="remove-header btn-danger-small">
      <i class="material-icons">close</i>
    </button>
  `;
  
  // 删除按钮事件
  headerElement.querySelector('.remove-header').addEventListener('click', () => {
    headerElement.remove();
  });
  
  return headerElement;
}

// 更新临时转发
function updateTempRedirect(redirectId, modalElement) {
  const name = modalElement.querySelector('#edit-temp-name').value.trim();
  const targetUrl = modalElement.querySelector('#edit-temp-target-url').value.trim();
  const timeout = parseInt(modalElement.querySelector('#edit-temp-timeout').value);
  const connectTimeout = parseInt(modalElement.querySelector('#edit-temp-connect-timeout').value);
  const redirectOnly = modalElement.querySelector('#edit-temp-redirect-only').checked;
  
  if (!name) {
    showNotification('请输入名称', 'warning');
    return;
  }
  
  if (!targetUrl) {
    showNotification('请输入目标URL', 'warning');
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
    name: name,
    target_url: targetUrl,
    redirect_only: redirectOnly
  };
  
  if (Object.keys(extraHeaders).length > 0) {
    requestData.extra_headers = extraHeaders;
  } else {
    // 如果没有请求头，发送空对象来清除现有的请求头
    requestData.extra_headers = {};
  }
  
  if (timeout && timeout > 0) {
    requestData.timeout = timeout;
  } else {
    // 清除超时设置
    requestData.timeout = undefined;
  }
  
  if (connectTimeout && connectTimeout > 0) {
    requestData.connect_timeout = connectTimeout;
  } else {
    // 清除连接超时设置
    requestData.connect_timeout = undefined;
  }
  
  showLoading(true);
  
  fetchWithAuth(`/api/temp-redirects/${redirectId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(requestData)
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      showNotification('临时转发更新成功', 'success');
      document.body.removeChild(modalElement);
      loadTempRedirects(); // 重新加载列表
    } else {
      showNotification(`更新失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    console.error('Update temp redirect error:', error);
    showNotification(`更新失败: ${error.message}`, 'error');
  });
}

// 显示编辑映射弹窗
function showEditMappingModal(prefix, mapping) {
  const modal = editMappingModal.content.cloneNode(true);
  const modalElement = modal.querySelector('.modal-overlay');
  
  // 判断是否为新建映射
  const isNewMapping = prefix === '' && mapping.target_url === '';
  
  // 设置标题
  modalElement.querySelector('h3').innerHTML = isNewMapping ? 
    '<i class="material-icons">add</i> 添加API映射' : 
    '<i class="material-icons">edit</i> 编辑API映射';
  
  // 设置保存按钮文本
  modalElement.querySelector('.save-edit-mapping').innerHTML = isNewMapping ?
    '<i class="material-icons">add</i> 添加映射' :
    '<i class="material-icons">save</i> 保存修改';
  
  // 填充现有数据
  modalElement.querySelector('#edit-mapping-name').value = mapping.name || 'default';
  modalElement.querySelector('#edit-mapping-prefix').value = prefix || '';
  modalElement.querySelector('#edit-mapping-target-url').value = mapping.target_url || '';
  
  if (mapping.timeout) {
    modalElement.querySelector('#edit-mapping-timeout').value = mapping.timeout;
  }
  if (mapping.connect_timeout) {
    modalElement.querySelector('#edit-mapping-connect-timeout').value = mapping.connect_timeout;
  }
  
  // 填充请求头
  const headersContainer = modalElement.querySelector('.edit-mapping-headers-container');
  if (mapping.extra_headers) {
    for (const [key, value] of Object.entries(mapping.extra_headers)) {
      const headerElement = createEditMappingHeaderElement(key, value);
      headersContainer.appendChild(headerElement);
    }
  }
  
  // 设置事件监听
  modalElement.querySelector('.close-modal').addEventListener('click', () => {
    document.body.removeChild(modalElement);
  });
  
  modalElement.querySelector('.cancel-edit-mapping').addEventListener('click', () => {
    document.body.removeChild(modalElement);
  });
  
  // 点击遮罩关闭
  modalElement.addEventListener('click', (e) => {
    if (e.target === modalElement) {
      document.body.removeChild(modalElement);
    }
  });

  // 高级配置切换
  const toggleButton = modalElement.querySelector('.toggle-edit-mapping-advanced');
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
  modalElement.querySelector('.add-edit-mapping-header').addEventListener('click', () => {
    const headerElement = createEditMappingHeaderElement();
    headersContainer.appendChild(headerElement);
  });
  
  // 保存按钮
  modalElement.querySelector('.save-edit-mapping').addEventListener('click', () => {
    if (isNewMapping) {
      addNewMapping(modalElement);
    } else {
      updateMapping(prefix, modalElement);
    }
  });
  
  document.body.appendChild(modalElement);
}

// 创建编辑映射模式的请求头元素
function createEditMappingHeaderElement(key = '', value = '') {
  const headerElement = document.createElement('div');
  headerElement.className = 'header-row';
  headerElement.innerHTML = `
    <input type="text" class="header-key" placeholder="Header名称" value="${key}">
    <input type="text" class="header-value" placeholder="Header值" value="${value}">
    <button class="remove-header btn-danger-small">
      <i class="material-icons">close</i>
    </button>
  `;
  
  // 删除按钮事件
  headerElement.querySelector('.remove-header').addEventListener('click', () => {
    headerElement.remove();
  });
  
  return headerElement;
}

// 添加新映射
function addNewMapping(modalElement) {
  const name = modalElement.querySelector('#edit-mapping-name').value.trim();
  const prefix = modalElement.querySelector('#edit-mapping-prefix').value.trim();
  const targetUrl = modalElement.querySelector('#edit-mapping-target-url').value.trim();
  const timeout = parseInt(modalElement.querySelector('#edit-mapping-timeout').value);
  const connectTimeout = parseInt(modalElement.querySelector('#edit-mapping-connect-timeout').value);
  
  if (!name) {
    showNotification('请输入映射名称', 'warning');
    return;
  }
  
  if (!prefix) {
    showNotification('请输入路径前缀', 'warning');
    return;
  }
  
  if (!targetUrl) {
    showNotification('请输入目标URL', 'warning');
    return;
  }
  
  // 检查前缀是否已存在
  if (currentConfig.api_mappings[prefix]) {
    showNotification('路径前缀已存在，请使用其他前缀', 'warning');
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
  
  // 构建新映射
  const newMapping = {
    name: name,
    target_url: targetUrl
  };
  
  if (Object.keys(extraHeaders).length > 0) {
    newMapping.extra_headers = extraHeaders;
  }
  
  if (timeout && timeout > 0) {
    newMapping.timeout = timeout;
  }
  
  if (connectTimeout && connectTimeout > 0) {
    newMapping.connect_timeout = connectTimeout;
  }
  
  // 添加到配置
  currentConfig.api_mappings[prefix] = newMapping;
  
  // 构建完整配置并保存到后端
  const newConfig = {
    api_mappings: currentConfig.api_mappings,
    log_level: currentConfig.log_level
  };
  
  // 保留全局超时配置
  if (currentConfig.default_timeout) {
    newConfig.default_timeout = currentConfig.default_timeout;
  }
  if (currentConfig.default_connect_timeout) {
    newConfig.default_connect_timeout = currentConfig.default_connect_timeout;
  }
  
  showLoading(true);
  
  // 保存到后端
  fetchWithAuth('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newConfig)
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      // 更新本地配置
      currentConfig = newConfig;
      
      // 重新渲染配置
      renderConfig();
      
      // 关闭弹窗
      document.body.removeChild(modalElement);
      
      showNotification('映射添加成功', 'success');
      
      // 更新日志前缀选项
      loadPrefixOptions();
    } else {
      // 如果保存失败，恢复原状态
      delete currentConfig.api_mappings[prefix];
      showNotification(`添加失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    // 如果保存失败，恢复原状态
    delete currentConfig.api_mappings[prefix];
    console.error('Add mapping error:', error);
    showNotification(`添加失败: ${error.message}`, 'error');
  });
}

// 更新映射
function updateMapping(oldPrefix, modalElement) {
  const name = modalElement.querySelector('#edit-mapping-name').value.trim();
  const prefix = modalElement.querySelector('#edit-mapping-prefix').value.trim();
  const targetUrl = modalElement.querySelector('#edit-mapping-target-url').value.trim();
  const timeout = parseInt(modalElement.querySelector('#edit-mapping-timeout').value);
  const connectTimeout = parseInt(modalElement.querySelector('#edit-mapping-connect-timeout').value);
  
  if (!name) {
    showNotification('请输入映射名称', 'warning');
    return;
  }
  
  if (!prefix) {
    showNotification('请输入路径前缀', 'warning');
    return;
  }
  
  if (!targetUrl) {
    showNotification('请输入目标URL', 'warning');
    return;
  }
  
  // 检查前缀是否已存在（如果前缀改变了）
  if (prefix !== oldPrefix && currentConfig.api_mappings[prefix]) {
    showNotification('路径前缀已存在，请使用其他前缀', 'warning');
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
  
  // 构建更新后的映射
  const updatedMapping = {
    name: name,
    target_url: targetUrl
  };
  
  if (Object.keys(extraHeaders).length > 0) {
    updatedMapping.extra_headers = extraHeaders;
  }
  
  if (timeout && timeout > 0) {
    updatedMapping.timeout = timeout;
  }
  
  if (connectTimeout && connectTimeout > 0) {
    updatedMapping.connect_timeout = connectTimeout;
  }
  
  // 备份原始配置以便回滚
  const originalMapping = currentConfig.api_mappings[oldPrefix];
  const prefixChanged = prefix !== oldPrefix;
  
  // 如果前缀改变了，删除旧的映射
  if (prefixChanged) {
    delete currentConfig.api_mappings[oldPrefix];
  }
  
  // 更新映射
  currentConfig.api_mappings[prefix] = updatedMapping;
  
  // 构建完整配置并保存到后端
  const newConfig = {
    api_mappings: currentConfig.api_mappings,
    log_level: currentConfig.log_level
  };
  
  // 保留全局超时配置
  if (currentConfig.default_timeout) {
    newConfig.default_timeout = currentConfig.default_timeout;
  }
  if (currentConfig.default_connect_timeout) {
    newConfig.default_connect_timeout = currentConfig.default_connect_timeout;
  }
  
  showLoading(true);
  
  // 保存到后端
  fetchWithAuth('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newConfig)
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      // 更新本地配置
      currentConfig = newConfig;
      
      // 重新渲染配置
      renderConfig();
      
      // 关闭弹窗
      document.body.removeChild(modalElement);
      
      showNotification('映射更新成功', 'success');
      
      // 更新日志前缀选项
      loadPrefixOptions();
    } else {
      // 如果保存失败，恢复原状态
      if (prefixChanged) {
        delete currentConfig.api_mappings[prefix];
        currentConfig.api_mappings[oldPrefix] = originalMapping;
      } else {
        currentConfig.api_mappings[oldPrefix] = originalMapping;
      }
      showNotification(`更新失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    // 如果保存失败，恢复原状态
    if (prefixChanged) {
      delete currentConfig.api_mappings[prefix];
      currentConfig.api_mappings[oldPrefix] = originalMapping;
    } else {
      currentConfig.api_mappings[oldPrefix] = originalMapping;
    }
    console.error('Update mapping error:', error);
    showNotification(`更新失败: ${error.message}`, 'error');
  });
}

function deleteMapping(prefix, element) {
  // 保存原始映射以便回滚
  const originalMapping = currentConfig.api_mappings[prefix];
  
  // 从本地配置中删除
  delete currentConfig.api_mappings[prefix];
  
  // 添加删除动画
  element.classList.add('fade-out');
  
  // 构建完整配置并保存到后端
  const newConfig = {
    api_mappings: currentConfig.api_mappings,
    log_level: currentConfig.log_level
  };
  
  // 保留全局超时配置
  if (currentConfig.default_timeout) {
    newConfig.default_timeout = currentConfig.default_timeout;
  }
  if (currentConfig.default_connect_timeout) {
    newConfig.default_connect_timeout = currentConfig.default_connect_timeout;
  }
  
  showLoading(true);
  
  // 保存到后端
  fetchWithAuth('/api/config', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newConfig)
  })
  .then(response => response.json())
  .then(result => {
    showLoading(false);
    if (result.success) {
      // 更新本地配置
      currentConfig = newConfig;
      
      showNotification('映射删除成功', 'success');
      
      // 执行删除动画
      setTimeout(() => {
        element.remove();
        
        // 检查是否需要显示空状态
        const mappingsContainer = document.getElementById('mappings-container');
        if (mappingsContainer.children.length === 0) {
          showEmptyState(mappingsContainer, '暂无API映射配置', '点击"添加映射"按钮创建API映射');
        }
      }, 300);
      
      // 更新日志前缀选项
      loadPrefixOptions();
    } else {
      // 回滚本地更改
      currentConfig.api_mappings[prefix] = originalMapping;
      element.classList.remove('fade-out');
      showNotification(`删除失败: ${result.error || '未知错误'}`, 'error');
    }
  })
  .catch(error => {
    showLoading(false);
    console.error('Delete mapping error:', error);
    // 回滚本地更改
    currentConfig.api_mappings[prefix] = originalMapping;
    element.classList.remove('fade-out');
    showNotification(`删除失败: ${error.message}`, 'error');
  });
}