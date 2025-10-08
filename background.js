/**
 * Background Script for Ghost Key Extension
 * Manages authentication state, coordinates between content scripts and popup
 * Handles profile switching and fallback authentication logic
 */

// Extension state management
let extensionState = {
  isActive: false,
  currentProfile: null,
  authFailureCount: 0,
  lastActiveTab: null,
  isVoiceAuthRequired: false,
  registrationMode: false
};

// Authentication configuration
const AUTH_CONFIG = {
  MAX_FAILURES_BEFORE_VOICE: 2,
  SESSION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  AUTO_CLEAR_DELAY: 2000, // 2 seconds after password entry
  WEBSITE_CLOSE_DELAY: 5000 // 5 seconds before closing failed website
};

/**
 * Initialize extension background service
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Ghost Key Extension installed/updated');
  
  // Initialize default settings
  await chrome.storage.local.set({
    profiles: {},
    settings: {
      autoActivate: true,
      clearPassword: true,
      closeOnFailure: true,
      voiceFallback: true,
      notifications: true
    },
    activeProfile: null
  });
  
  // Reset extension state
  extensionState = {
    isActive: false,
    currentProfile: null,
    authFailureCount: 0,
    lastActiveTab: null,
    isVoiceAuthRequired: false,
    registrationMode: false
  };
  
  console.log('Ghost Key Extension initialized');
});

/**
 * Handle extension startup - restore state
 */
chrome.runtime.onStartup.addListener(async () => {
  console.log('Ghost Key Extension starting up');
  
  // Restore active profile
  try {
    const { activeProfile } = await chrome.storage.local.get(['activeProfile']);
    if (activeProfile) {
      extensionState.currentProfile = activeProfile;
      console.log('Restored active profile:', activeProfile);
    }
  } catch (error) {
    console.error('Error restoring state:', error);
  }
});

/**
 * Handle extension icon click - show popup
 */
chrome.action.onClicked.addListener((tab) => {
  chrome.action.openPopup();
});

/**
 * Handle messages from content scripts and popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type, message);
  
  // Validate runtime context first
  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn('Extension context invalidated, ignoring message');
    try {
      sendResponse({ error: 'Extension context invalidated' });
    } catch (e) {
      console.warn('Failed to send error response:', e);
    }
    return false;
  }
  
  // Ensure sendResponse is always called to prevent connection errors
  const safeResponse = (response) => {
    try {
      if (chrome.runtime && chrome.runtime.id) {
        sendResponse(response);
      }
    } catch (error) {
      console.warn('Failed to send response:', error);
    }
  };
  
  // Handle connection timeout
  const timeoutId = setTimeout(() => {
    console.warn('Message handling timeout for:', message.type);
    safeResponse({ error: 'Request timeout' });
  }, 5000);
  
  const clearTimeoutAndRespond = (response) => {
    clearTimeout(timeoutId);
    safeResponse(response);
  };
  
  try {
    switch (message.type) {
      case 'GET_EXTENSION_STATE':
        clearTimeoutAndRespond(extensionState);
        break;
        
      case 'SET_ACTIVE_PROFILE':
        handleSetActiveProfile(message.profileId, clearTimeoutAndRespond);
        break;
        
      case 'FORM_DETECTED':
        handleFormDetected(message.formType, sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'PASSWORD_FIELD_FOCUSED':
        handlePasswordFieldFocused(sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'KEYSTROKE_DATA':
        handleKeystrokeData(message.data, sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'AUTHENTICATION_RESULT':
        handleAuthenticationResult(message.result, sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'VOICE_AUTH_REQUIRED':
        handleVoiceAuthRequired(sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'VOICE_AUTH_RESULT':
        handleVoiceAuthResult(message.result, sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'REGISTER_PROFILE':
        handleRegisterProfile(message.profileData, clearTimeoutAndRespond);
        break;
        
      case 'GET_PROFILES':
        handleGetProfiles(clearTimeoutAndRespond);
        break;
        
      case 'DELETE_PROFILE':
        handleDeleteProfile(message.profileId, clearTimeoutAndRespond);
        break;
        
      case 'CLOSE_WEBSITE':
        handleCloseWebsite(sender.tab, clearTimeoutAndRespond);
        break;
        
      case 'GET_SETTINGS':
        handleGetSettings(clearTimeoutAndRespond);
        break;
        
      default:
        console.warn('Unknown message type:', message.type);
        clearTimeoutAndRespond({ error: 'Unknown message type' });
    }
  } catch (error) {
    console.error('Error handling message:', error);
    clearTimeoutAndRespond({ error: error.message });
  }
  
  return true; // Keep message channel open for async responses
});

/**
 * Set the active profile for authentication
 */
async function handleSetActiveProfile(profileId, sendResponse) {
  try {
    // Validate runtime context
    if (!chrome.runtime || !chrome.runtime.id) {
      sendResponse({ error: 'Extension context invalidated' });
      return;
    }
    
    const { profiles } = await chrome.storage.local.get(['profiles']);
    
    if (profileId && !profiles[profileId]) {
      sendResponse({ error: 'Profile not found' });
      return;
    }
    
    extensionState.currentProfile = profileId;
    await chrome.storage.local.set({ activeProfile: profileId });
    
    // Update badge to show active profile (with error handling)
    try {
      if (profileId && chrome.action) {
        chrome.action.setBadgeText({ text: profiles[profileId].name.charAt(0).toUpperCase() });
        chrome.action.setBadgeBackgroundColor({ color: '#22d3ee' });
      } else if (chrome.action) {
        chrome.action.setBadgeText({ text: '' });
      }
    } catch (badgeError) {
      console.warn('Error updating badge:', badgeError);
    }
    
    sendResponse({ success: true, profileId });
  } catch (error) {
    console.error('Error setting active profile:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle form detection from content script
 */
async function handleFormDetected(formType, tab, sendResponse) {
  try {
    console.log(`${formType} form detected on ${tab.url}`);
    
    extensionState.lastActiveTab = tab.id;
    
    // Show notification if enabled (with error handling)
    try {
      const { settings } = await chrome.storage.local.get(['settings']);
      if (settings.notifications && chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/icon48.png',
          title: 'Ghost Key',
          message: `${formType === 'login' ? 'Login' : 'Registration'} form detected. Extension ready.`
        });
      }
    } catch (notifError) {
      console.warn('Error showing notification:', notifError);
    }
    
    sendResponse({ success: true, extensionReady: true });
  } catch (error) {
    console.error('Error handling form detection:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle password field focus - activate extension
 */
async function handlePasswordFieldFocused(tab, sendResponse) {
  console.log('Password field focused, activating extension');
  
  const { activeProfile, profiles } = await chrome.storage.local.get(['activeProfile', 'profiles']);
  
  if (!activeProfile || !profiles[activeProfile]) {
    // No active profile - show profile selector
    sendResponse({ 
      success: true, 
      action: 'SHOW_PROFILE_SELECTOR',
      profiles: Object.keys(profiles).map(id => ({
        id,
        name: profiles[id].name,
        hasVoiceProfile: profiles[id].hasVoiceProfile
      }))
    });
    return;
  }
  
  extensionState.isActive = true;
  extensionState.currentProfile = activeProfile;
  extensionState.authFailureCount = 0;
  
  sendResponse({ 
    success: true, 
    action: 'ACTIVATE_CAPTURE',
    profile: {
      id: activeProfile,
      name: profiles[activeProfile].name
    }
  });
}

/**
 * Handle keystroke data from content script
 */
async function handleKeystrokeData(keystrokeData, tab, sendResponse) {
  try {
    if (!extensionState.currentProfile) {
      sendResponse({ error: 'No active profile' });
      return;
    }
    
    const { profiles, settings } = await chrome.storage.local.get(['profiles', 'settings']);
    const profile = profiles[extensionState.currentProfile];
    
    if (!profile || !profile.keystrokeModel) {
      sendResponse({ error: 'Profile or model not found' });
      return;
    }
    
    // Perform authentication using stored model data with current UI threshold
    try {
      console.log('Performing keystroke authentication...');
      
      // Use the authentication logic with current UI threshold
      const currentThreshold = settings?.authThreshold || 0.03;
      console.log('Using threshold for keystroke auth:', currentThreshold, 'from settings:', settings);
      const authResult = performKeystrokeAuthentication(keystrokeData.features, profile.keystrokeModel, currentThreshold);
      
      console.log('Authentication result:', authResult);
      
      sendResponse({ 
        success: true, 
        authenticated: authResult.authenticated,
        confidence: authResult.confidence,
        reconstructionError: authResult.reconstructionError
      });
      
    } catch (mlError) {
      console.error('ML authentication error:', mlError);
      sendResponse({ 
        success: false, 
        authenticated: false,
        error: 'Authentication processing failed: ' + mlError.message
      });
    }
    
  } catch (error) {
    console.error('Error processing keystroke data:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle authentication result from content script
 */
async function handleAuthenticationResult(result, tab, sendResponse) {
  console.log('Authentication result:', result);
  
  if (result.success) {
    // Successful authentication
    extensionState.authFailureCount = 0;
    extensionState.isVoiceAuthRequired = false;
    
    // Show success notification
    const { settings } = await chrome.storage.local.get(['settings']);
    if (settings.notifications) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Ghost Key - Authentication Successful',
        message: `Welcome back! Confidence: ${(result.confidence * 100).toFixed(1)}%`
      });
    }
    
    // Auto-clear password if enabled
    if (settings.clearPassword) {
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { 
          type: 'CLEAR_PASSWORD_FIELD' 
        });
      }, AUTH_CONFIG.AUTO_CLEAR_DELAY);
    }
    
  } else {
    // Failed authentication
    extensionState.authFailureCount++;
    
    if (extensionState.authFailureCount >= AUTH_CONFIG.MAX_FAILURES_BEFORE_VOICE) {
      // Trigger voice authentication
      extensionState.isVoiceAuthRequired = true;
      
      chrome.tabs.sendMessage(tab.id, { 
        type: 'SHOW_VOICE_AUTH_MODAL',
        profileId: extensionState.currentProfile,
        failureCount: extensionState.authFailureCount
      });
    }
  }
  
  sendResponse({ success: true });
}

/**
 * Handle voice authentication requirement
 */
async function handleVoiceAuthRequired(tab, sendResponse) {
  console.log('Voice authentication required');
  
  // Check if current profile has voice biometrics
  const { profiles } = await chrome.storage.local.get(['profiles']);
  const profile = profiles[extensionState.currentProfile];
  
  if (!profile || !profile.hasVoiceProfile) {
    // No voice profile available - close website
    chrome.tabs.sendMessage(tab.id, { 
      type: 'SHOW_ERROR_MESSAGE',
      message: 'No voice authentication available. Access denied.'
    });
    
    setTimeout(() => {
      chrome.tabs.remove(tab.id);
    }, AUTH_CONFIG.WEBSITE_CLOSE_DELAY);
    
    sendResponse({ success: false, error: 'No voice profile' });
    return;
  }
  
  sendResponse({ success: true, hasVoiceProfile: true });
}

/**
 * Handle voice authentication result
 */
async function handleVoiceAuthResult(result, tab, sendResponse) {
  console.log('Voice authentication result:', result);
  
  if (result.success) {
    // Voice authentication successful
    extensionState.authFailureCount = 0;
    extensionState.isVoiceAuthRequired = false;
    
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'Ghost Key - Voice Authentication Successful',
      message: 'Access granted via voice biometrics'
    });
    
  } else {
    // Voice authentication failed - close website
    chrome.tabs.sendMessage(tab.id, { 
      type: 'SHOW_ERROR_MESSAGE',
      message: 'Voice authentication failed. Access denied for security.'
    });
    
    setTimeout(() => {
      chrome.tabs.remove(tab.id);
    }, AUTH_CONFIG.WEBSITE_CLOSE_DELAY);
  }
  
  sendResponse({ success: true });
}

/**
 * Handle profile registration
 */
async function handleRegisterProfile(profileData, sendResponse) {
  try {
    const { profiles = {} } = await chrome.storage.local.get(['profiles']);
    
    const profileId = generateProfileId();
    profiles[profileId] = {
      id: profileId,
      name: profileData.name,
      keystrokeModel: profileData.keystrokeModel,
      voiceProfile: profileData.voiceProfile || null,
      hasVoiceProfile: !!profileData.voiceProfile,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    };
    
    await chrome.storage.local.set({ profiles });
    
    sendResponse({ success: true, profileId });
  } catch (error) {
    console.error('Error registering profile:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Get all profiles
 */
async function handleGetProfiles(sendResponse) {
  try {
    const { profiles = {} } = await chrome.storage.local.get(['profiles']);
    sendResponse({ success: true, profiles });
  } catch (error) {
    console.error('Error getting profiles:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Delete a profile
 */
async function handleDeleteProfile(profileId, sendResponse) {
  try {
    const { profiles = {}, activeProfile } = await chrome.storage.local.get(['profiles', 'activeProfile']);
    
    if (profiles[profileId]) {
      delete profiles[profileId];
      await chrome.storage.local.set({ profiles });
      
      // Clear active profile if it was deleted
      if (activeProfile === profileId) {
        await chrome.storage.local.set({ activeProfile: null });
        extensionState.currentProfile = null;
        chrome.action.setBadgeText({ text: '' });
      }
    }
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error deleting profile:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Handle website closure request
 */
async function handleCloseWebsite(tab, sendResponse) {
  try {
    await chrome.tabs.remove(tab.id);
    sendResponse({ success: true });
  } catch (error) {
    console.error('Error closing website:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Get current settings
 */
async function handleGetSettings(sendResponse) {
  try {
    const { settings } = await chrome.storage.local.get(['settings']);
    sendResponse({ success: true, settings: settings || {} });
  } catch (error) {
    console.error('Error getting settings:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * Generate unique profile ID
 */
function generateProfileId() {
  return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Handle tab updates - reset state when navigating but preserve context
 */
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  try {
    if (changeInfo.status === 'loading' && tabId === extensionState.lastActiveTab) {
      console.log('Tab reloading, resetting extension state for tab:', tabId);
      // Reset extension state for new page but keep profile
      extensionState.isActive = false;
      extensionState.authFailureCount = 0;
      extensionState.isVoiceAuthRequired = false;
      // Don't reset currentProfile - keep it active
    }
    
    if (changeInfo.status === 'complete' && tabId === extensionState.lastActiveTab) {
      console.log('Tab loaded, extension ready for tab:', tabId);
    }
  } catch (error) {
    console.error('Error handling tab update:', error);
  }
});

/**
 * Handle tab removal
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  try {
    if (tabId === extensionState.lastActiveTab) {
      console.log('Active tab closed, resetting state');
      extensionState.lastActiveTab = null;
      extensionState.isActive = false;
      extensionState.authFailureCount = 0;
    }
  } catch (error) {
    console.error('Error handling tab removal:', error);
  }
});

console.log('Ghost Key background script loaded');

/**
 * Keystroke authentication function - CSP-compliant version
 * Ported from autoencoder.js to avoid eval() issues
 */
function performKeystrokeAuthentication(inputFeatures, trainedModelData, currentThreshold) {
  try {
    if (!trainedModelData || trainedModelData.modelType !== "autoencoder" || !trainedModelData.autoencoder) {
      throw new Error("Invalid model data - expected autoencoder model for authentication");
    }

    console.log("Performing autoencoder-based keystroke authentication");

    // Normalize the input features using the same parameters from training
    const { min, max } = trainedModelData.normalizationParams;
    const normalizedInputFeatures = inputFeatures.map((value, i) => {
      if (i >= min.length || i >= max.length) {
        return 0; // Pad with zeros if feature array is longer than training data
      }
      const featureRange = max[i] - min[i];
      return featureRange === 0 ? 0 : (value - min[i]) / featureRange;
    });

    // Reconstruct autoencoder from serialized data
    const autoencoder = deserializeAutoencoder(trainedModelData.autoencoder);

    // Get the autoencoder's reconstruction of the input
    const reconstructedFeatures = autoencoderPredict(autoencoder, normalizedInputFeatures);

    // Calculate reconstruction error (mean squared error)
    let reconstructionError = 0;
    for (let i = 0; i < normalizedInputFeatures.length; i++) {
      const featureDifference = normalizedInputFeatures[i] - reconstructedFeatures[i];
      reconstructionError += featureDifference * featureDifference;
    }
    reconstructionError /= normalizedInputFeatures.length;

    // Use the current UI threshold instead of the stored model threshold
    const authenticationThreshold = currentThreshold || trainedModelData.threshold;
    const authenticationSuccessful = reconstructionError <= authenticationThreshold;

    // Calculate confidence score
    const maxExpectedError = trainedModelData.trainingStats?.maximumError || authenticationThreshold * 2;
    const confidenceLevel = Math.max(0, Math.min(1, 1 - reconstructionError / (maxExpectedError * 2)));

    // Create feature deviation visualization data
    const featureDeviations = normalizedInputFeatures.slice(0, 10).map((val) => Math.min(Math.abs(val), 1));

    console.log(`Keystroke authentication result:`, {
      reconstructionError: reconstructionError.toFixed(6),
      threshold: authenticationThreshold.toFixed(6),
      authenticated: authenticationSuccessful,
      confidence: confidenceLevel.toFixed(3),
    });

    return {
      success: authenticationSuccessful,
      authenticated: authenticationSuccessful,
      reconstructionError,
      threshold: authenticationThreshold,
      confidence: confidenceLevel,
      deviations: featureDeviations,
      modelType: "autoencoder"
    };
  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      authenticated: false,
      reconstructionError: 999,
      confidence: 0,
      error: error.message
    };
  }
}

/**
 * Deserialize autoencoder model
 */
function deserializeAutoencoder(serializedData) {
  return {
    inputSize: serializedData.inputSize,
    hiddenSize: serializedData.hiddenSize,
    bottleneckSize: serializedData.bottleneckSize,
    weights1: serializedData.weights1,
    weights2: serializedData.weights2,
    weights3: serializedData.weights3,
    // Initialize biases with zeros if they don't exist in saved data (for backward compatibility)
    biases1: serializedData.biases1 || new Array(serializedData.hiddenSize).fill(0),
    biases2: serializedData.biases2 || new Array(serializedData.bottleneckSize).fill(0),
    biases3: serializedData.biases3 || new Array(serializedData.inputSize).fill(0)
  };
}

/**
 * Autoencoder prediction function
 */
function autoencoderPredict(autoencoder, inputFeatures) {
  // ReLU activation function
  const relu = (x) => Math.max(0, x);
  
  // Validate that biases are properly initialized
  if (!autoencoder.biases1 || !autoencoder.biases2 || !autoencoder.biases3) {
    throw new Error("Autoencoder biases are not properly initialized");
  }
  
  // Layer 1: Input to hidden layer (encoding)
  const hiddenLayerOutput = new Array(autoencoder.hiddenSize);
  for (let j = 0; j < autoencoder.hiddenSize; j++) {
    let weightedSum = autoencoder.biases1[j] || 0;
    for (let i = 0; i < autoencoder.inputSize; i++) {
      weightedSum += inputFeatures[i] * autoencoder.weights1[i][j];
    }
    hiddenLayerOutput[j] = relu(weightedSum);
  }

  // Layer 2: Hidden to bottleneck layer (compression)
  const bottleneckOutput = new Array(autoencoder.bottleneckSize);
  for (let j = 0; j < autoencoder.bottleneckSize; j++) {
    let weightedSum = autoencoder.biases2[j] || 0;
    for (let i = 0; i < autoencoder.hiddenSize; i++) {
      weightedSum += hiddenLayerOutput[i] * autoencoder.weights2[i][j];
    }
    bottleneckOutput[j] = relu(weightedSum);
  }

  // Layer 3: Bottleneck to output layer (reconstruction)
  const reconstructedOutput = new Array(autoencoder.inputSize);
  for (let j = 0; j < autoencoder.inputSize; j++) {
    let weightedSum = autoencoder.biases3[j] || 0;
    for (let i = 0; i < autoencoder.bottleneckSize; i++) {
      weightedSum += bottleneckOutput[i] * autoencoder.weights3[i][j];
    }
    reconstructedOutput[j] = weightedSum; // Linear activation for output layer
  }

  return reconstructedOutput;
}