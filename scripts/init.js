/**
 * Ghost Key Extension Integration Script
 * Initializes and coordinates all extension components
 */

// Import all necessary libraries
async function initializeGhostKeyExtension() {
  console.log('🔐 Ghost Key Extension starting initialization...');
  
  try {
    // Load ML libraries
    if (typeof window !== 'undefined') {
      // Browser environment - load from global
      if (!window.GhostKeyML) {
        console.log('Loading autoencoder ML library...');
        await loadScript('libs/autoencoder.js');
      }
      
      if (!window.VoiceAuthentication) {
        console.log('Loading voice authentication library...');
        await loadScript('libs/voice-auth.js');
      }
    }
    
    console.log('✅ Ghost Key Extension initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Ghost Key Extension initialization failed:', error);
    return false;
  }
}

// Utility function to load scripts dynamically
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL(src);
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Extension configuration
const GHOST_KEY_CONFIG = {
  version: '1.0.0',
  name: 'Ghost Key - Biometric Authentication',
  
  // Authentication settings
  auth: {
    keystrokeThreshold: 0.03,
    voiceThreshold: 0.65,
    maxFailuresBeforeVoice: 2,
    sessionTimeout: 30 * 60 * 1000, // 30 minutes
    autoClearDelay: 2000 // 2 seconds
  },
  
  // Feature extraction settings
  features: {
    passwordMinLength: 8,
    samplesRequired: 5,
    augmentationMultiplier: 3,
    noiseLevel: 0.1
  },
  
  // Voice settings
  voice: {
    recordingDuration: 3000, // 3 seconds
    mfccFeatures: 13,
    sampleRate: 44100,
    passphrase: "I'll Always Choose You"
  },
  
  // UI settings
  ui: {
    animationDuration: 300,
    notificationTimeout: 5000,
    modalZIndex: 999999
  }
};

// Export configuration for use across extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { initializeGhostKeyExtension, GHOST_KEY_CONFIG };
} else {
  window.GHOST_KEY_CONFIG = GHOST_KEY_CONFIG;
  window.initializeGhostKeyExtension = initializeGhostKeyExtension;
}

// Auto-initialize if in browser environment
if (typeof window !== 'undefined' && document.readyState !== 'loading') {
  initializeGhostKeyExtension();
} else if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', initializeGhostKeyExtension);
}