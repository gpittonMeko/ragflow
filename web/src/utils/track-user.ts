// Utility per tracciare informazioni utente

export interface UserTrackingInfo {
  ip?: string;
  browser: string;
  os: string;
  userAgent: string;
  screenResolution: string;
  language: string;
  timezone: string;
}

export const getUserTrackingInfo = (): UserTrackingInfo => {
  const ua = navigator.userAgent;

  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Edg')) browser = 'Edge';
  else if (ua.includes('Opera') || ua.includes('OPR')) browser = 'Opera';

  // Detect OS
  let os = 'Unknown';
  if (ua.includes('Windows NT 10.0')) os = 'Windows 10';
  else if (ua.includes('Windows NT 6.3')) os = 'Windows 8.1';
  else if (ua.includes('Windows NT 6.2')) os = 'Windows 8';
  else if (ua.includes('Windows NT 6.1')) os = 'Windows 7';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    os = match ? `macOS ${match[1].replace(/_/g, '.')}` : 'macOS';
  } else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return {
    browser,
    os,
    userAgent: ua,
    screenResolution: `${screen.width}x${screen.height}`,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
};

// Get or create client fingerprint
export const getClientFingerprint = (): string => {
  let fingerprint = localStorage.getItem('sgai-client-fingerprint');

  if (!fingerprint) {
    const info = getUserTrackingInfo();
    const fpData = `${info.userAgent}-${info.screenResolution}-${info.language}-${info.timezone}`;

    // Simple hash
    let hash = 0;
    for (let i = 0; i < fpData.length; i++) {
      const char = fpData.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    fingerprint = `fp_${Math.abs(hash).toString(36)}_${Date.now().toString(36)}`;
    localStorage.setItem('sgai-client-fingerprint', fingerprint);
  }

  return fingerprint;
};

// Fetch real IP (requires external service or backend)
export const fetchUserIP = async (): Promise<string | null> => {
  try {
    const response = await fetch('https://api.ipify.org?format=json');
    const data = await response.json();
    return data.ip;
  } catch {
    return null;
  }
};
