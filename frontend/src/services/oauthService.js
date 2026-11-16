import api from './api';

export const oauthService = {
  getConsentDetails: async (params) => {
    const response = await api.get('/oauth/consent/', { params });
    return response.data;
  },
  submitConsentDecision: async (payload) => {
    const response = await api.post('/oauth/consent/', payload);
    return response.data;
  },
};
