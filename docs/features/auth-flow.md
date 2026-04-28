# Coneshare Authentication Flow: Email & Password

## Strategy refs
- [Coneshare Roadmap](./strategy/coneshare-roadmap.md)
- [Coneshare Technology Stack](./strategy/coneshare-techstack.md)

## Out of scope
- SSO/SAML/OIDC enterprise identity integration.
- Multi-factor authentication (MFA), passkeys, and WebAuthn flows.
- Social login providers (Google, GitHub, Microsoft).
- Fine-grained organization role/permission model beyond baseline auth.

## Design decisions
- Decision: Use JWT-based authentication (`djangorestframework-simplejwt`) as the primary API auth model.
  Rationale: Matches decoupled React SPA architecture and supports API-first workflows.
  Tradeoff: Requires careful token lifecycle handling (refresh, revocation, storage risks).
- Decision: Keep Django session-based authentication documented as an alternative, not the default.
  Rationale: Useful for teams prioritizing server-managed sessions and cookie security.
  Tradeoff: Adds cross-domain CSRF/cookie complexity for SPA deployments.
- Decision: Include frontend interceptor-based token refresh behavior in the baseline flow.
  Rationale: Reduces login friction and keeps authenticated UX stable during access-token expiry.
  Tradeoff: Increases client auth complexity and requires robust 401/retry safeguards.

This document outlines the implementation plan for an email/password authentication system in Coneshare, tailored for its Django/React tech stack. It also includes an analysis of two primary approaches: token-based (JWT) and session-based authentication.

---

## Recommended Approach: Token-Based Auth with JWT

This approach uses JSON Web Tokens (JWT) for a stateless, API-first architecture, which is highly compatible with a single-page application (SPA) frontend like React. This mirrors the modern, decoupled architecture seen in `papermark-auth-flow.md`.

### Backend Implementation (Django)

The Django backend will provide API endpoints for user registration, login (token generation), and logout using the `djangorestframework-simplejwt` library.

**1. Install Dependencies**

```bash
pip install djangorestframework djangorestframework-simplejwt
```

**2. Configure Django Settings**

In `settings.py`, add `rest_framework` and `simplejwt` and configure JWT as the default authentication method for the API.

```python
# settings.py
INSTALLED_APPS = [
    # ...
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist', # For logout
    # ...
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
}
```

**3. Create API Endpoints**

In `urls.py`, set up endpoints for registration, login, and token refreshing. The `TokenObtainPairView` from `simplejwt` handles the login logic, returning access and refresh tokens.

```python
# urls.py
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from .views import RegisterView, LogoutView

urlpatterns = [
    # ...
    path('api/v1/register/', RegisterView.as_view(), name='register'),
    path('api/v1/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/v1/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/v1/logout/', LogoutView.as_view(), name='logout'),
]
```

**4. Implement User Registration**

Create a serializer to validate registration data and a view to handle user creation.

```python
# serializers.py
from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ('email', 'password', 'name')
        extra_kwargs = {'password': {'write_only': True}}

    def create(self, validated_data):
        user = User.objects.create_user(**validated_data)
        # Django signals can be used here to send a welcome email
        return user

# views.py
from rest_framework.views import APIView
from .serializers import UserSerializer

class RegisterView(APIView):
    def post(self, request):
        serializer = UserSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
```

### Frontend Implementation (React)

The React frontend will use a service to communicate with the API and a component to render the login form, storing tokens in `localStorage`.

**1. Authentication Service**

```javascript
// src/services/authService.js
import api from './api';

const login = async (email, password) => {
  const response = await api.post('/token/', { email, password });
  if (response.data.access && response.data.refresh) {
    localStorage.setItem('access_token', response.data.access);
    localStorage.setItem('refresh_token', response.data.refresh);
  }
  return response.data;
};

const logout = async () => {
  try {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      await api.post('/logout/', { refresh: refreshToken });
    }
  } finally {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
  }
};

export const authService = { login, logout };
```

**2. Axios Interceptor Configuration**

```javascript
// src/services/api.js
import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Automatic token injection and refresh handling
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response.status === 401) {
      // Handle token refresh logic
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const { data } = await axios.post('/api/v1/token/refresh/', { refresh: refreshToken });
          localStorage.setItem('access_token', data.access);
          error.config.headers['Authorization'] = `Bearer ${data.access}`;
          return api(error.config);
        } catch (refreshError) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

**3. Login Component & Logout Logic**

```jsx
// src/components/Login.jsx
import React, { useState } from 'react';
import authService from '../services/authService';

function Login() {
  // ... (form state and submission logic) ...
  const handleLogin = (e) => {
    e.preventDefault();
    authService.login(email, password).then((response) => {
        // Store tokens in localStorage
        localStorage.setItem('access_token', response.data.access);
        localStorage.setItem('refresh_token', response.data.refresh);
        window.location.href = '/dashboard';
    });
  };
  // ...
}

// Example logout logic
const handleLogout = () => {
    const refreshToken = localStorage.getItem('refresh_token');
    authService.logout(refreshToken); // Optional: blacklist token on server
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
};
```

---

## Alternative: Django Session-Based Authentication

It is also possible to integrate React with Django's robust, built-in session authentication system. This approach uses server-side sessions and cookies instead of JWTs.

### Pros

1.  **Enhanced Security**: Django's session framework is battle-tested, includes built-in CSRF protection, and allows for `HttpOnly` cookies, which are inaccessible to client-side JavaScript and thus protect against XSS-based theft.
2.  **Backend Simplicity**: No third-party libraries are needed for the core authentication logic. Django provides login and logout views out of the box.
3.  **Seamless Integration**: All of Django's built-in features (admin panel, password reset, etc.) work perfectly with the session system.

### Cons

1.  **Stateful Architecture**: The server must store and look up session data for every logged-in user on each request, which can be a performance consideration at very high scale.
2.  **Cross-Domain Complexity (CORS)**: If the frontend and backend are on different domains, managing cookies and CSRF tokens becomes significantly more complex and requires careful server configuration.
3.  **Not Ideal for Non-Browser Clients**: This approach is not well-suited for native mobile apps (iOS/Android) or third-party API consumers, where token-based authentication is the standard.
4.  **CSRF Handling in SPA**: The React application must be configured to fetch a CSRF token from Django and include it as a header in every state-changing request (`POST`, `PUT`, `DELETE`), adding complexity to the frontend API logic.
