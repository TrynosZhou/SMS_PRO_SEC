// This file can be replaced during build by using the `fileReplacements` array.
// For production, use the actual backend API URL
const apiUrl = 'https://sms-2-xig2.onrender.com/api';

export const environment = {
  production: true,
  apiUrl,
  serverBaseUrl: apiUrl.replace(/\/api\/?$/, ''),
  sessionTimeoutMinutes: 30
};

