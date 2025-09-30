/**
 * ML Library Loader for Ghost Key Extension
 * Loads ML functions in a CSP-compliant way
 */

// Initialize ML library when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  try {
    console.log('ML Loader: Starting ML library initialization...');
    
    // Wait a bit for autoencoder.js to load since it's included before this script
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check if ML library is already loaded by autoencoder.js
    if (window.GhostKeyML && 
        typeof window.GhostKeyML.trainKeystrokeBiometricModel === 'function') {
      console.log('ML Loader: Ghost Key ML library already loaded by autoencoder.js');
      console.log('ML Loader: Available functions:', Object.keys(window.GhostKeyML));
      window.dispatchEvent(new CustomEvent('GhostKeyMLReady'));
      return;
    }
    
    console.warn('ML Loader: ML library not immediately available, waiting...');
    
    // Wait up to 3 seconds for the library to become available
    let attempts = 0;
    const maxAttempts = 15; // 3 seconds
    
    const checkLibrary = () => {
      attempts++;
      console.log(`ML Loader: Check attempt ${attempts}/${maxAttempts}`);
      
      if (window.GhostKeyML && 
          typeof window.GhostKeyML.trainKeystrokeBiometricModel === 'function') {
        console.log('ML Loader: ML library became available!');
        console.log('ML Loader: Available functions:', Object.keys(window.GhostKeyML));
        window.dispatchEvent(new CustomEvent('GhostKeyMLReady'));
        return;
      }
      
      if (attempts >= maxAttempts) {
        console.error('ML Loader: Timeout waiting for ML library');
        createFallbackML();
        window.dispatchEvent(new CustomEvent('GhostKeyMLError', { 
          detail: new Error('ML library load timeout - autoencoder.js may not have loaded properly') 
        }));
        return;
      }
      
      setTimeout(checkLibrary, 200);
    };
    
    checkLibrary();
    
  } catch (error) {
    console.error('ML Loader: Failed to initialize ML library:', error);
    createFallbackML();
    window.dispatchEvent(new CustomEvent('GhostKeyMLError', { detail: error }));
  }
});

/**
 * Create fallback ML library with error messages
 */
function createFallbackML() {
  console.warn('ML Loader: Creating fallback ML library');
  
  window.GhostKeyML = {
    trainKeystrokeBiometricModel: () => {
      throw new Error('ML library failed to load. Please reload the extension and try again.');
    },
    authenticateKeystrokePattern: () => {
      throw new Error('ML library failed to load. Please reload the extension and try again.');
    },
    BIOMETRIC_AUTH_CONFIG: { 
      DEFAULT_AUTH_THRESHOLD: 0.03,
      MINIMUM_TRAINING_SAMPLES: 5,
      REQUIRED_PASSWORD_LENGTH: 8
    }
  };
  
  console.log('ML Loader: Fallback ML library created');
}