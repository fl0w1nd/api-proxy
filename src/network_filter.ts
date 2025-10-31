/**
 * 网络过滤器 - 用于阻止对内网地址的代理请求
 */

// 私有 IP 地址范围
const PRIVATE_IP_RANGES = [
    // IPv4 私有地址
    { start: '10.0.0.0', end: '10.255.255.255', name: 'Class A Private' },
    { start: '172.16.0.0', end: '172.31.255.255', name: 'Class B Private' },
    { start: '192.168.0.0', end: '192.168.255.255', name: 'Class C Private' },
    
    // 回环地址
    { start: '127.0.0.0', end: '127.255.255.255', name: 'Loopback' },
    
    // 链路本地地址
    { start: '169.254.0.0', end: '169.254.255.255', name: 'Link-local' },
    
    // 组播地址
    { start: '224.0.0.0', end: '239.255.255.255', name: 'Multicast' },
    
    // 保留地址
    { start: '240.0.0.0', end: '255.255.255.255', name: 'Reserved' },
    
    // 0.0.0.0/8
    { start: '0.0.0.0', end: '0.255.255.255', name: 'This network' },
];

// 私有域名和特殊域名
const PRIVATE_DOMAINS = [
    'localhost',
    'localhost.localdomain',
    '*.local',
    '*.localhost',
    '*.internal',
    '*.lan',
];

/**
 * 将 IP 地址转换为数字（用于范围比较）
 */
function ipToNumber(ip: string): number {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) {
        throw new Error('Invalid IPv4 address');
    }
    return (parts[0] << 24) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

/**
 * 检查 IP 地址是否在私有范围内
 */
function isPrivateIP(ip: string): { isPrivate: boolean; reason?: string } {
    try {
        const ipNum = ipToNumber(ip);
        
        for (const range of PRIVATE_IP_RANGES) {
            const startNum = ipToNumber(range.start);
            const endNum = ipToNumber(range.end);
            
            if (ipNum >= startNum && ipNum <= endNum) {
                return {
                    isPrivate: true,
                    reason: `IP address ${ip} is in ${range.name} range (${range.start} - ${range.end})`
                };
            }
        }
        
        return { isPrivate: false };
    } catch (error) {
        // 如果不是有效的 IPv4 地址，返回 false
        return { isPrivate: false };
    }
}

/**
 * 检查域名是否为私有域名
 */
function isPrivateDomain(hostname: string): { isPrivate: boolean; reason?: string } {
    const lowerHostname = hostname.toLowerCase();
    
    for (const pattern of PRIVATE_DOMAINS) {
        if (pattern.startsWith('*.')) {
            const suffix = pattern.slice(2);
            if (lowerHostname === suffix || lowerHostname.endsWith('.' + suffix)) {
                return {
                    isPrivate: true,
                    reason: `Domain ${hostname} matches private pattern ${pattern}`
                };
            }
        } else {
            if (lowerHostname === pattern) {
                return {
                    isPrivate: true,
                    reason: `Domain ${hostname} is a private domain`
                };
            }
        }
    }
    
    return { isPrivate: false };
}

/**
 * 检查 IPv6 地址是否为私有地址
 */
function isPrivateIPv6(ip: string): { isPrivate: boolean; reason?: string } {
    const lowerIP = ip.toLowerCase();
    
    // 回环地址
    if (lowerIP === '::1' || lowerIP === '0:0:0:0:0:0:0:1') {
        return { isPrivate: true, reason: 'IPv6 loopback address' };
    }
    
    // 链路本地地址 (fe80::/10)
    if (lowerIP.startsWith('fe80:')) {
        return { isPrivate: true, reason: 'IPv6 link-local address' };
    }
    
    // 唯一本地地址 (fc00::/7)
    if (lowerIP.startsWith('fc') || lowerIP.startsWith('fd')) {
        return { isPrivate: true, reason: 'IPv6 unique local address' };
    }
    
    // 站点本地地址 (fec0::/10) - 已废弃但仍需检查
    if (lowerIP.startsWith('fec0:')) {
        return { isPrivate: true, reason: 'IPv6 site-local address (deprecated)' };
    }
    
    // 未指定地址
    if (lowerIP === '::' || lowerIP === '0:0:0:0:0:0:0:0') {
        return { isPrivate: true, reason: 'IPv6 unspecified address' };
    }
    
    return { isPrivate: false };
}

/**
 * 检查主机名是否为内网地址
 * @param hostname 主机名或 IP 地址
 * @returns 检查结果，包含是否为内网地址及原因
 */
export function isInternalHost(hostname: string): { isInternal: boolean; reason?: string } {
    // 移除方括号（IPv6 格式）
    const cleanHostname = hostname.replace(/^\[|\]$/g, '');
    
    // 检查是否为 IPv4 地址
    if (/^\d+\.\d+\.\d+\.\d+$/.test(cleanHostname)) {
        const result = isPrivateIP(cleanHostname);
        return { isInternal: result.isPrivate, reason: result.reason };
    }
    
    // 检查是否为 IPv6 地址
    if (cleanHostname.includes(':')) {
        const result = isPrivateIPv6(cleanHostname);
        return { isInternal: result.isPrivate, reason: result.reason };
    }
    
    // 检查是否为私有域名
    const result = isPrivateDomain(cleanHostname);
    return { isInternal: result.isPrivate, reason: result.reason };
}

/**
 * 检查目标 URL 是否指向内网
 * @param targetUrl 目标 URL
 * @returns 检查结果，包含是否为内网地址及原因
 */
export function isInternalURL(targetUrl: string): { isInternal: boolean; reason?: string } {
    try {
        const url = new URL(targetUrl);
        return isInternalHost(url.hostname);
    } catch (error) {
        // 无效的 URL
        return {
            isInternal: false,
            reason: `Invalid URL: ${error.message}`
        };
    }
}

