window.Auth = (() => {
  const TOKEN_KEY = "sng_token";
  const USER_KEY = "sng_user";
  const BASE_URL = window.location.origin;

  function saveSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    return !!getToken();
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem("sng_qr");
    localStorage.removeItem("sng_txnid");
    localStorage.removeItem("sng_amount");
    localStorage.removeItem("sng_cartid");
    window.location.href = "/login.html";
  }

  async function login(mobile, name) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ mobile, name }),
    });

    const data = await res.json();

    if (res.ok && data.success && data.data?.token) {
      saveSession(data.data.token, data.data.user);
      return { success: true, data: data.data };
    }

    return {
      success: false,
      message: data.message || "Login failed",
    };
  }

  function getAuthHeaders(extraHeaders = {}) {
    const token = getToken();

    return {
      ...extraHeaders,
      Authorization: `Bearer ${token}`,
    };
  }

  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = "/login.html";
      return false;
    }
    return true;
  }

  return {
    login,
    logout,
    isLoggedIn,
    getToken,
    getUser,
    getAuthHeaders,
    requireAuth,
  };
})();