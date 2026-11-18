import api from './api';

export const oauthService = {
  getConsentDetails: async (params) => {
    const search = new URLSearchParams();
    Object.entries(params || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item !== undefined && item !== null && item !== '') {
            search.append(key, String(item));
          }
        });
      } else if (value !== undefined && value !== null && value !== '') {
        search.append(key, String(value));
      }
    });
    const response = await api.get('/oauth/consent/', { params: search });
    return response.data;
  },
  submitConsentDecision: async (payload) => {
    const response = await api.post('/oauth/consent/', payload);
    return response.data;
  },
};
