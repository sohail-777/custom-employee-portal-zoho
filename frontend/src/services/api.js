const BASE = '/api';

export const getToken = () => localStorage.getItem('token');
export const getRefreshToken = () => localStorage.getItem('refreshToken');
export const setTokens = (access, refresh) => {
  localStorage.setItem('token', access);
  if (refresh) localStorage.setItem('refreshToken', refresh);
};
export const clearToken = () => { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); };

// One shared refresh call, so parallel 401s do not trigger refresh-token reuse detection
let refreshing = null;
function refresh() {
  if (!refreshing) {
    refreshing = fetch(BASE + '/auth/refresh', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: getRefreshToken() }),
    }).then(async (r) => {
      if (!r.ok) throw new Error('Session expired');
      const d = await r.json();
      setTokens(d.token, d.refreshToken);
    }).finally(() => { refreshing = null; });
  }
  return refreshing;
}

const NO_REFRESH = ['/auth/login', '/auth/mfa/verify', '/auth/refresh'];

async function request(path, method = 'GET', body, retry = true) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !NO_REFRESH.includes(path)) {
    if (retry && getRefreshToken()) {
      try { await refresh(); return request(path, method, body, false); } catch { /* fall through */ }
    }
    clearToken();
    window.location.href = '/login'; // invalid or expired session -> login page
  }
  if (!res.ok) throw Object.assign(new Error(data.message || 'Request failed'), { status: res.status });
  return data;
}

export const get = (p) => request(p);
export const post = (p, b) => request(p, 'POST', b);
export const put = (p, b) => request(p, 'PUT', b);
export const del = (p) => request(p, 'DELETE');
