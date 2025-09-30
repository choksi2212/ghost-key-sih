/**
 * Ghost Key Extension Popup JavaScript
 * Handles profile management, settings, and registration flow
 */

// Popup state management
let popupState = {
  profiles: {},
  activeProfile: null,
  settings: {},
  registrationData: {
    profileName: '',
    password: '',
    keystrokeSamples: [],
    voiceSamples: [],
    currentStep: 1
  }
};

// Keystroke capture state
let currentKeystrokeBuffer = [];

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Ghost Key popup initializing...');
  
  // Debug: Check what's available immediately
  console.log('Initial state check:');
  console.log('- window.GhostKeyML:', !!window.GhostKeyML);
  if (window.GhostKeyML) {
    console.log('- trainKeystrokeBiometricModel:', typeof window.GhostKeyML.trainKeystrokeBiometricModel);
    console.log('- authenticateKeystrokePattern:', typeof window.GhostKeyML.authenticateKeystrokePattern);
    console.log('- BIOMETRIC_AUTH_CONFIG:', !!window.GhostKeyML.BIOMETRIC_AUTH_CONFIG);
  }
  console.log('- window.GhostKeyRecovery:', !!window.GhostKeyRecovery);
  console.log('- window.GhostKeyHealthCheck:', !!window.GhostKeyHealthCheck);
  
  // Perform health check first
  if (window.GhostKeyHealthCheck) {
    console.log('Performing health check...');
    const healthResult = await window.GhostKeyHealthCheck.performHealthCheck();
    console.log('Health check result:', healthResult);
    
    if (!healthResult.healthy) {
      console.warn('Extension health check failed:');
      healthResult.recommendations.forEach(rec => console.warn('- ' + rec));
      
      // Show health status but continue
      window.GhostKeyHealthCheck.showHealthStatus();
    } else {
      console.log('✅ All health checks passed');
    }
  } else {
    console.warn('Health check system not available');
  }
  
  // Wait for ML library to load
  console.log('Waiting for ML library...');
  await waitForMLLibrary();
  
  // Final ML library check
  console.log('Final ML library state:');
  console.log('- window.GhostKeyML:', !!window.GhostKeyML);
  if (window.GhostKeyML) {
    console.log('- trainKeystrokeBiometricModel:', typeof window.GhostKeyML.trainKeystrokeBiometricModel);
    console.log('- Function available:', typeof window.GhostKeyML.trainKeystrokeBiometricModel === 'function');
  }
  
  try {
    console.log('Loading profiles and settings...');
    await loadProfiles();
    await loadSettings();
    
    console.log('Setting up event listeners...');
    setupEventListeners();
    
    console.log('Updating UI...');
    updateUI();
    
    console.log('✅ Ghost Key popup initialized successfully');
  } catch (error) {
    console.error('❌ Popup initialization error:', error);
    if (window.GhostKeyRecovery) {
      window.GhostKeyRecovery.showRecoveryDialog(error);
    } else {
      alert('Initialization error: ' + error.message);
    }
  }
});

/**
 * Wait for ML library to be loaded
 */
function waitForMLLibrary() {
  return new Promise((resolve) => {
    console.log('Waiting for ML library to load...');
    
    // Check if already loaded
    if (window.GhostKeyML && 
        typeof window.GhostKeyML.trainKeystrokeBiometricModel === 'function') {
      console.log('ML library already available');
      resolve();
      return;
    }
    
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds total
    
    const checkML = () => {
      attempts++;
      console.log(`ML library check attempt ${attempts}/${maxAttempts}`);
      
      if (window.GhostKeyML && 
          typeof window.GhostKeyML.trainKeystrokeBiometricModel === 'function') {
        console.log('ML library loaded successfully!');
        resolve();
        return;
      }
      
      if (attempts >= maxAttempts) {
        console.warn('ML library load timeout - continuing with fallback');
        // Create emergency fallback
        if (!window.GhostKeyML) {
          window.GhostKeyML = {};
        }
        if (typeof window.GhostKeyML.trainKeystrokeBiometricModel !== 'function') {
          window.GhostKeyML.trainKeystrokeBiometricModel = () => {
            throw new Error('ML library failed to load. Please reload the extension.');
          };
        }
        resolve();
        return;
      }
      
      setTimeout(checkML, 500);
    };
    
    // Start checking
    setTimeout(checkML, 100);
    
    // Also listen for events
    const handleMLReady = () => {
      console.log('ML library ready event received');
      window.removeEventListener('GhostKeyMLReady', handleMLReady);
      window.removeEventListener('GhostKeyMLError', handleMLError);
      resolve();
    };
    
    const handleMLError = (event) => {
      console.warn('ML library error event received:', event.detail);
      window.removeEventListener('GhostKeyMLReady', handleMLReady);
      window.removeEventListener('GhostKeyMLError', handleMLError);
      resolve(); // Continue even if ML fails to load
    };
    
    window.addEventListener('GhostKeyMLReady', handleMLReady);
    window.addEventListener('GhostKeyMLError', handleMLError);
  });
}

/**
 * Load profiles from storage
 */
async function loadProfiles() {
  try {
    const result = await chrome.storage.local.get(['profiles', 'activeProfile']);
    popupState.profiles = result.profiles || {};
    popupState.activeProfile = result.activeProfile;
    console.log('Loaded profiles:', Object.keys(popupState.profiles).length);
  } catch (error) {
    console.error('Error loading profiles:', error);
  }
}

/**
 * Load settings from storage
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get(['settings']);
    popupState.settings = result.settings || {
      autoActivate: true,
      clearPassword: true,
      closeOnFailure: true,
      voiceFallback: true,
      notifications: true,
      authThreshold: 0.03
    };
    console.log('Loaded settings:', popupState.settings);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Header buttons
  document.getElementById('refresh-profiles').addEventListener('click', refreshProfiles);
  
  // Profile management
  document.getElementById('create-first-profile').addEventListener('click', startRegistration);
  document.getElementById('add-profile').addEventListener('click', startRegistration);
  
  // Settings
  document.getElementById('settings-btn').addEventListener('click', toggleSettings);
  document.getElementById('close-settings').addEventListener('click', hideSettings);
  document.getElementById('help-btn').addEventListener('click', showHelp);
  
  // Settings checkboxes
  setupSettingsListeners();
  
  // Registration modal
  setupRegistrationListeners();
}

/**
 * Set up settings event listeners
 */
function setupSettingsListeners() {
  const settingInputs = [
    'auto-activate', 'clear-password', 'close-on-failure', 
    'voice-fallback', 'notifications'
  ];
  
  settingInputs.forEach(id => {
    const element = document.getElementById(id);
    if (element) {
      element.addEventListener('change', saveSettings);
    }
  });
  
  // Threshold slider
  const thresholdSlider = document.getElementById('auth-threshold');
  if (thresholdSlider) {
    thresholdSlider.addEventListener('input', updateThresholdDisplay);
    thresholdSlider.addEventListener('change', saveSettings);
  }
}

/**
 * Set up registration modal listeners
 */
function setupRegistrationListeners() {
  document.getElementById('close-registration').addEventListener('click', closeRegistration);
  document.getElementById('start-keystroke-training').addEventListener('click', startKeystrokeTraining);
  document.getElementById('reset-training').addEventListener('click', resetKeystrokeTraining);
  document.getElementById('start-voice-training').addEventListener('click', startVoiceTraining);
  document.getElementById('skip-voice-training').addEventListener('click', skipVoiceTraining);
  document.getElementById('voice-record-btn').addEventListener('click', toggleVoiceRecording);
  document.getElementById('complete-registration').addEventListener('click', completeRegistration);
  
  // Keystroke input
  const keystrokeInput = document.getElementById('keystroke-input');
  keystrokeInput.addEventListener('keydown', captureKeystroke);
  keystrokeInput.addEventListener('keyup', captureKeystroke);
}

/**
 * Update the UI based on current state
 */
function updateUI() {
  updateActiveProfileDisplay();
  updateProfileList();
  updateSettingsDisplay();
  updateExtensionStatus();
}

/**
 * Update active profile display
 */
function updateActiveProfileDisplay() {
  try {
    const activeProfileCard = document.getElementById('active-profile-card');
    const noProfileMessage = document.getElementById('no-profile-message');
    
    if (!activeProfileCard || !noProfileMessage) {
      console.warn('Profile display elements not found');
      return;
    }
    
    if (popupState.activeProfile && popupState.profiles[popupState.activeProfile]) {
      const profile = popupState.profiles[popupState.activeProfile];
      
      // Safe style update
      if (noProfileMessage.style) {
        noProfileMessage.style.display = 'none';
      }
      
      activeProfileCard.innerHTML = `
        <div class="active-profile-info">
          <div>
            <div class="profile-name">${profile.name}</div>
            <div class="profile-features">
              <span class="feature-badge">⌨️ Keystroke</span>
              ${profile.hasVoiceProfile ? '<span class="feature-badge">🎤 Voice</span>' : ''}
            </div>
          </div>
          <button class="btn-icon" onclick="deactivateProfile()" title="Deactivate">✕</button>
        </div>
      `;
    } else {
      // Safe style update
      if (noProfileMessage.style) {
        noProfileMessage.style.display = 'block';
      }
      
      // Clear any existing profile info
      const existingInfo = activeProfileCard.querySelector('.active-profile-info');
      if (existingInfo) {
        existingInfo.remove();
      }
    }
  } catch (error) {
    console.error('Error updating active profile display:', error);
  }
}

/**
 * Update profile list
 */
function updateProfileList() {
  const profileList = document.getElementById('profile-list');
  const profiles = Object.values(popupState.profiles);
  
  if (profiles.length === 0) {
    profileList.innerHTML = `
      <div class="no-profiles" style="text-align: center; padding: 20px; color: #94a3b8;">
        <p>No profiles created yet</p>
        <button class="btn btn-primary mt-2" onclick="startRegistration()">Create First Profile</button>
      </div>
    `;
    return;
  }
  
  profileList.innerHTML = profiles.map(profile => `
    <div class="profile-item ${profile.id === popupState.activeProfile ? 'active' : ''}" 
         onclick="selectProfile('${profile.id}')">
      <div class="profile-item-header">
        <span class="profile-item-name">${profile.name}</span>
        <div class="profile-item-actions">
          <button class="btn-icon" onclick="event.stopPropagation(); deleteProfile('${profile.id}')" title="Delete">🗑️</button>
        </div>
      </div>
      <div class="profile-item-info">
        <span>Created: ${new Date(profile.createdAt).toLocaleDateString()}</span>
        <span>${profile.hasVoiceProfile ? '🎤🔑' : '🔑'}</span>
      </div>
    </div>
  `).join('');
}

/**
 * Update settings display
 */
function updateSettingsDisplay() {
  // Update checkboxes
  document.getElementById('auto-activate').checked = popupState.settings.autoActivate;
  document.getElementById('clear-password').checked = popupState.settings.clearPassword;
  document.getElementById('close-on-failure').checked = popupState.settings.closeOnFailure;
  document.getElementById('voice-fallback').checked = popupState.settings.voiceFallback;
  document.getElementById('notifications').checked = popupState.settings.notifications;
  
  // Update threshold slider
  const thresholdSlider = document.getElementById('auth-threshold');
  thresholdSlider.value = popupState.settings.authThreshold || 0.03;
  updateThresholdDisplay();
}

/**
 * Update extension status indicator
 */
function updateExtensionStatus() {
  const statusIndicator = document.getElementById('status-indicator');
  const statusText = document.getElementById('status-text');
  
  // Check if extension is active on current tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      chrome.tabs.sendMessage(tabs[0].id, { type: 'PING' }, (response) => {
        if (response && response.active) {
          statusIndicator.className = 'status-indicator';
          statusText.textContent = 'Active';
        } else {
          statusIndicator.className = 'status-indicator inactive';
          statusText.textContent = 'Inactive';
        }
      });
    }
  });
}

/**
 * Profile Management Functions
 */
async function selectProfile(profileId) {
  const wrappedFunction = window.GhostKeyRecovery ? 
    window.GhostKeyRecovery.withErrorHandling(async (profileId) => {
      // Validate extension context first
      if (!window.GhostKeyRecovery.isContextValid()) {
        throw new Error('Extension context invalidated. Please reload the extension.');
      }
      
      await window.GhostKeyRecovery.safeStorageSet({ activeProfile: profileId });
      
      // Notify background script with comprehensive error handling
      try {
        await window.GhostKeyRecovery.safeMessageSend({
          type: 'SET_ACTIVE_PROFILE',
          profileId: profileId
        });
      } catch (commError) {
        console.warn('Communication error (non-critical):', commError);
      }
      
      popupState.activeProfile = profileId;
      updateUI();
    }, 'Profile Selection') : 
    // Fallback function
    async (profileId) => {
      try {
        if (!chrome.runtime || !chrome.runtime.id) {
          throw new Error('Extension context invalidated. Please reload the extension.');
        }
        
        await chrome.storage.local.set({ activeProfile: profileId });
        
        try {
          await new Promise((resolve) => {
            chrome.runtime.sendMessage({
              type: 'SET_ACTIVE_PROFILE',
              profileId: profileId
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.warn('Background script communication failed:', chrome.runtime.lastError.message);
              }
              resolve(true);
            });
            setTimeout(() => resolve(true), 1000);
          });
        } catch (commError) {
          console.warn('Communication error (non-critical):', commError);
        }
        
        popupState.activeProfile = profileId;
        updateUI();
      } catch (error) {
        console.error('Error selecting profile:', error);
        if (error.message.includes('Extension context invalidated')) {
          alert('Extension was reloaded. Please try again.');
        } else {
          alert('Error selecting profile: ' + error.message);
        }
      }
    };
  
  await wrappedFunction(profileId);
}

async function deactivateProfile() {
  try {
    await chrome.storage.local.set({ activeProfile: null });
    
    chrome.runtime.sendMessage({
      type: 'SET_ACTIVE_PROFILE',
      profileId: null
    });
    
    popupState.activeProfile = null;
    updateUI();
  } catch (error) {
    console.error('Error deactivating profile:', error);
  }
}

async function deleteProfile(profileId) {
  if (!confirm('Are you sure you want to delete this profile? This action cannot be undone.')) {
    return;
  }
  
  try {
    delete popupState.profiles[profileId];
    await chrome.storage.local.set({ profiles: popupState.profiles });
    
    // If this was the active profile, deactivate it
    if (popupState.activeProfile === profileId) {
      await deactivateProfile();
    }
    
    chrome.runtime.sendMessage({
      type: 'DELETE_PROFILE',
      profileId: profileId
    });
    
    updateUI();
  } catch (error) {
    console.error('Error deleting profile:', error);
  }
}

async function refreshProfiles() {
  await loadProfiles();
  updateUI();
}

/**
 * Settings Functions
 */
function toggleSettings() {
  const settingsPanel = document.getElementById('settings-panel');
  settingsPanel.classList.toggle('hidden');
}

function hideSettings() {
  document.getElementById('settings-panel').classList.add('hidden');
}

function updateThresholdDisplay() {
  const slider = document.getElementById('auth-threshold');
  const display = document.querySelector('.threshold-value');
  display.textContent = parseFloat(slider.value).toFixed(3);
}

async function saveSettings() {
  popupState.settings = {
    autoActivate: document.getElementById('auto-activate').checked,
    clearPassword: document.getElementById('clear-password').checked,
    closeOnFailure: document.getElementById('close-on-failure').checked,
    voiceFallback: document.getElementById('voice-fallback').checked,
    notifications: document.getElementById('notifications').checked,
    authThreshold: parseFloat(document.getElementById('auth-threshold').value)
  };
  
  try {
    await chrome.storage.local.set({ settings: popupState.settings });
    console.log('Settings saved');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Registration Functions
 */
function startRegistration() {
  // Reset registration data
  popupState.registrationData = {
    profileName: '',
    password: '',
    keystrokeSamples: [],
    voiceSamples: [],
    currentStep: 1
  };
  
  // Show modal and first step
  document.getElementById('registration-modal').classList.remove('hidden');
  showRegistrationStep(1);
}

function closeRegistration() {
  try {
    const modal = document.getElementById('registration-modal');
    if (modal && modal.classList) {
      modal.classList.add('hidden');
    }
    
    // Reset all steps with null checks
    for (let i = 1; i <= 3; i++) {
      try {
        const step = document.getElementById(`step-${i}`);
        if (step && step.classList) {
          step.classList.add('hidden');
        }
      } catch (stepError) {
        console.warn(`Error hiding step ${i}:`, stepError);
      }
    }
    
    // Reset registration data
    try {
      popupState.registrationData = {
        profileName: '',
        password: '',
        keystrokeSamples: [],
        voiceSamples: [],
        currentStep: 1
      };
    } catch (dataError) {
      console.warn('Error resetting registration data:', dataError);
    }
    
    // Reset keystroke buffer
    try {
      if (typeof currentKeystrokeBuffer !== 'undefined') {
        currentKeystrokeBuffer = [];
      }
    } catch (bufferError) {
      console.warn('Error resetting keystroke buffer:', bufferError);
    }
    
  } catch (error) {
    console.error('Error closing registration:', error);
  }
}

function showRegistrationStep(stepNumber) {
  try {
    // Hide all steps with safe checks
    for (let i = 1; i <= 3; i++) {
      try {
        const step = document.getElementById(`step-${i}`);
        if (step && step.classList && step.style !== null) {
          step.classList.add('hidden');
        }
      } catch (stepError) {
        console.warn(`Error hiding step ${i}:`, stepError);
      }
    }
    
    // Show target step with safe checks
    try {
      const targetStep = document.getElementById(`step-${stepNumber}`);
      if (targetStep && targetStep.classList && targetStep.style !== null) {
        targetStep.classList.remove('hidden');
      } else {
        console.error(`Registration step ${stepNumber} not found or invalid`);
      }
    } catch (targetError) {
      console.error(`Error showing step ${stepNumber}:`, targetError);
    }
    
    // Update step number safely
    try {
      if (popupState && popupState.registrationData) {
        popupState.registrationData.currentStep = stepNumber;
      }
    } catch (stateError) {
      console.warn('Error updating current step:', stateError);
    }
    
  } catch (error) {
    console.error('Error showing registration step:', error);
  }
}

async function startKeystrokeTraining() {
  const profileName = document.getElementById('profile-name').value.trim();
  const password = document.getElementById('training-password').value;
  
  if (!profileName) {
    alert('Please enter a profile name');
    return;
  }
  
  if (!password || password.length < 8) {
    alert('Please enter a password with at least 8 characters');
    return;
  }
  
  popupState.registrationData.profileName = profileName;
  popupState.registrationData.password = password;
  popupState.registrationData.keystrokeSamples = [];
  
  showRegistrationStep(2);
  
  // Enable keystroke input
  const input = document.getElementById('keystroke-input');
  input.disabled = false;
  input.focus();
  
  updateTrainingProgress();
}

function captureKeystroke(event) {
  const input = document.getElementById('keystroke-input');
  
  if (!input.disabled && popupState.registrationData.currentStep === 2) {
    // Store keystroke event with high precision timing
    const keystrokeEvent = {
      key: event.key,
      type: event.type,
      timestamp: performance.now(),
      code: event.code
    };
    
    // Add to current sample buffer
    currentKeystrokeBuffer.push(keystrokeEvent);
    
    if (event.key === 'Enter' && event.type === 'keydown') {
      processSample();
    }
  }
}

function processSample() {
  const input = document.getElementById('keystroke-input');
  
  if (input.value === popupState.registrationData.password) {
    // Extract keystroke features from the captured buffer
    const features = extractKeystrokeFeatures(currentKeystrokeBuffer);
    
    // Valid sample - store with extracted features
    popupState.registrationData.keystrokeSamples.push({
      password: input.value,
      timestamp: Date.now(),
      features: features,
      rawKeystrokes: [...currentKeystrokeBuffer] // Store raw data for ML training
    });
    
    // Reset for next sample
    input.value = '';
    currentKeystrokeBuffer = [];
    updateTrainingProgress();
    
    if (popupState.registrationData.keystrokeSamples.length >= 5) {
      completeKeystrokeTraining();
    }
  } else {
    showTrainingStatus('Password mismatch. Please type the exact password.', 'error');
    input.value = '';
    currentKeystrokeBuffer = [];
  }
}

function updateTrainingProgress() {
  try {
    const count = popupState.registrationData.keystrokeSamples.length;
    const progress = (count / 5) * 100;
    
    if (window.GhostKeyRecovery) {
      window.GhostKeyRecovery.safeStyleUpdate('keystroke-progress', 'width', `${progress}%`);
      window.GhostKeyRecovery.safeTextUpdate('samples-captured', count.toString());
    } else {
      // Fallback method
      const progressBar = document.getElementById('keystroke-progress');
      const samplesText = document.getElementById('samples-captured');
      
      if (progressBar && progressBar.style !== undefined && progressBar.style !== null) {
        progressBar.style.width = `${progress}%`;
      }
      
      if (samplesText && samplesText.textContent !== undefined) {
        samplesText.textContent = count;
      }
    }
    
    if (count > 0) {
      showTrainingStatus(`Sample ${count}/5 captured successfully!`, 'success');
    }
  } catch (error) {
    console.warn('Error updating training progress:', error);
  }
}

function completeKeystrokeTraining() {
  showTrainingStatus('Keystroke training complete! 🎉', 'success');
  
  const input = document.getElementById('keystroke-input');
  const startVoiceBtn = document.getElementById('start-voice-training');
  const skipVoiceBtn = document.getElementById('skip-voice-training');
  
  if (input) input.disabled = true;
  if (startVoiceBtn) startVoiceBtn.classList.remove('hidden');
  if (skipVoiceBtn) skipVoiceBtn.classList.remove('hidden');
}

function resetKeystrokeTraining() {
  popupState.registrationData.keystrokeSamples = [];
  currentKeystrokeBuffer = [];
  
  const input = document.getElementById('keystroke-input');
  const startVoiceBtn = document.getElementById('start-voice-training');
  const skipVoiceBtn = document.getElementById('skip-voice-training');
  
  if (input) {
    input.value = '';
    input.disabled = false;
  }
  
  if (startVoiceBtn) startVoiceBtn.classList.add('hidden');
  if (skipVoiceBtn) skipVoiceBtn.classList.add('hidden');
  
  updateTrainingProgress();
}

function startVoiceTraining() {
  showRegistrationStep(3);
  popupState.registrationData.voiceSamples = [];
  updateVoiceProgress();
}

function skipVoiceTraining() {
  completeRegistration();
}

function toggleVoiceRecording() {
  const btn = document.getElementById('voice-record-btn');
  
  if (!btn) {
    console.error('Voice record button not found');
    return;
  }
  
  if (btn.textContent.includes('Start')) {
    btn.textContent = '⏹️ Stop Recording';
    startVoiceTimer();
  } else {
    btn.textContent = '🎤 Start Recording';
    stopVoiceTimer();
    addVoiceSample();
  }
}

function startVoiceTimer() {
  let seconds = 0;
  const timer = document.querySelector('.voice-timer');
  
  if (!timer) {
    console.warn('Voice timer element not found');
    return;
  }
  
  const interval = setInterval(() => {
    seconds++;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    timer.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  }, 1000);
  
  window.voiceTimerInterval = interval;
}

function stopVoiceTimer() {
  if (window.voiceTimerInterval) {
    clearInterval(window.voiceTimerInterval);
    window.voiceTimerInterval = null;
  }
}

function addVoiceSample() {
  try {
    popupState.registrationData.voiceSamples.push({
      timestamp: Date.now(),
      // In real implementation, would include audio blob
    });
    
    updateVoiceProgress();
    
    const completeBtn = document.getElementById('complete-registration');
    if (popupState.registrationData.voiceSamples.length >= 3 && completeBtn) {
      completeBtn.classList.remove('hidden');
    }
  } catch (error) {
    console.error('Error adding voice sample:', error);
  }
}

function updateVoiceProgress() {
  try {
    const count = popupState.registrationData.voiceSamples.length;
    const progress = (count / 3) * 100;
    
    if (window.GhostKeyRecovery) {
      window.GhostKeyRecovery.safeStyleUpdate('voice-progress', 'width', `${progress}%`);
      window.GhostKeyRecovery.safeTextUpdate('voice-samples-count', count.toString());
    } else {
      // Fallback method
      const progressBar = document.getElementById('voice-progress');
      const countText = document.getElementById('voice-samples-count');
      
      if (progressBar && progressBar.style !== undefined && progressBar.style !== null) {
        progressBar.style.width = `${progress}%`;
      }
      
      if (countText && countText.textContent !== undefined) {
        countText.textContent = count;
      }
    }
  } catch (error) {
    console.warn('Error updating voice progress:', error);
  }
}

async function completeRegistration() {
  const wrappedFunction = window.GhostKeyRecovery ? 
    window.GhostKeyRecovery.withErrorHandling(async () => {
      // Validate extension context first
      if (!window.GhostKeyRecovery.isContextValid()) {
        throw new Error('Extension context invalidated. Please reload the extension and try again.');
      }
      
      // Validate that we have enough samples
      if (!popupState.registrationData || popupState.registrationData.keystrokeSamples.length < 5) {
        throw new Error('Need at least 5 keystroke samples for training');
      }
      
      showTrainingStatus('Training machine learning model...', 'info');
      
      // Train ML model with captured keystroke samples
      const featureVectors = popupState.registrationData.keystrokeSamples.map(sample => sample.features);
      
      // Check if ML library is loaded with detailed debugging
      console.log('Checking ML library before training:');
      console.log('- window.GhostKeyML exists:', !!window.GhostKeyML);
      
      if (!window.GhostKeyML) {
        console.error('ML library not loaded - window.GhostKeyML is undefined');
        throw new Error('Machine learning library not available. Please reload the extension.');
      }
      
      console.log('- trainKeystrokeBiometricModel type:', typeof window.GhostKeyML.trainKeystrokeBiometricModel);
      console.log('- trainKeystrokeBiometricModel exists:', !!window.GhostKeyML.trainKeystrokeBiometricModel);
      
      if (typeof window.GhostKeyML.trainKeystrokeBiometricModel !== 'function') {
        console.error('trainKeystrokeBiometricModel is not a function:', window.GhostKeyML.trainKeystrokeBiometricModel);
        console.error('Available ML functions:', Object.keys(window.GhostKeyML));
        throw new Error('ML training function not available. Library may not have loaded correctly.');
      }
      
      console.log('Training model with', featureVectors.length, 'feature vectors');
      
      // Train the autoencoder model
      const trainedModel = await window.GhostKeyML.trainKeystrokeBiometricModel(featureVectors);
      
      console.log('Model training completed:', trainedModel);
      
      showTrainingStatus('Creating profile...', 'info');
      
      // Create voice profile if samples exist
      let voiceProfile = null;
      if (popupState.registrationData.voiceSamples && popupState.registrationData.voiceSamples.length > 0) {
        voiceProfile = {
          samples: popupState.registrationData.voiceSamples.length,
          features: popupState.registrationData.voiceSamples.map(s => s.features || {}),
          createdAt: new Date().toISOString()
        };
      }
      
      // Create new profile with trained model
      const profileId = generateProfileId();
      const newProfile = {
        id: profileId,
        name: popupState.registrationData.profileName,
        keystrokeModel: trainedModel,
        hasVoiceProfile: voiceProfile !== null,
        voiceProfile: voiceProfile,
        createdAt: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      };
      
      // Save profile with error handling
      popupState.profiles[profileId] = newProfile;
      await window.GhostKeyRecovery.safeStorageSet({ profiles: popupState.profiles });
      console.log('Profile saved successfully:', profileId);
      
      showTrainingStatus('Profile created successfully!', 'success');
      
      // Set as active profile
      try {
        await selectProfile(profileId);
      } catch (selectError) {
        console.warn('Error setting active profile (non-critical):', selectError);
      }
      
      // Close registration modal
      try {
        closeRegistration();
        updateUI();
      } catch (uiError) {
        console.warn('UI update error:', uiError);
      }
      
      // Show success message
      setTimeout(() => {
        try {
          alert('Profile created successfully! 🎉\nKeystroke model trained with ' + featureVectors.length + ' samples.');
        } catch (alertError) {
          console.log('Profile creation completed successfully!');
        }
      }, 500);
      
    }, 'Registration Completion') : 
    // Fallback function
    async () => {
      try {
        // Validate extension context first
        if (!chrome.runtime || !chrome.runtime.id) {
          throw new Error('Extension context invalidated. Please reload the extension and try again.');
        }
        
        // Validate that we have enough samples
        if (!popupState.registrationData || popupState.registrationData.keystrokeSamples.length < 5) {
          throw new Error('Need at least 5 keystroke samples for training');
        }
        
        showTrainingStatus('Training machine learning model...', 'info');
        
        // Train ML model with captured keystroke samples
        const featureVectors = popupState.registrationData.keystrokeSamples.map(sample => sample.features);
        
        // Check if ML library is loaded
        if (!window.GhostKeyML) {
          console.error('ML library not loaded');
          throw new Error('Machine learning library not available. Please reload the extension.');
        }
        
        console.log('Training model with', featureVectors.length, 'feature vectors');
        
        // Train the autoencoder model
        const trainedModel = await window.GhostKeyML.trainKeystrokeBiometricModel(featureVectors);
        
        console.log('Model training completed:', trainedModel);
        
        showTrainingStatus('Creating profile...', 'info');
        
        // Create voice profile if samples exist
        let voiceProfile = null;
        if (popupState.registrationData.voiceSamples && popupState.registrationData.voiceSamples.length > 0) {
          voiceProfile = {
            samples: popupState.registrationData.voiceSamples.length,
            features: popupState.registrationData.voiceSamples.map(s => s.features || {}),
            createdAt: new Date().toISOString()
          };
        }
        
        // Create new profile with trained model
        const profileId = generateProfileId();
        const newProfile = {
          id: profileId,
          name: popupState.registrationData.profileName,
          keystrokeModel: trainedModel,
          hasVoiceProfile: voiceProfile !== null,
          voiceProfile: voiceProfile,
          createdAt: new Date().toISOString(),
          lastUsed: new Date().toISOString()
        };
        
        // Save profile with error handling
        try {
          popupState.profiles[profileId] = newProfile;
          await chrome.storage.local.set({ profiles: popupState.profiles });
          console.log('Profile saved successfully:', profileId);
        } catch (storageError) {
          console.error('Storage error:', storageError);
          throw new Error('Failed to save profile. Please try again.');
        }
        
        showTrainingStatus('Profile created successfully!', 'success');
        
        // Set as active profile
        try {
          await selectProfile(profileId);
        } catch (selectError) {
          console.warn('Error setting active profile (non-critical):', selectError);
        }
        
        // Close registration modal
        try {
          closeRegistration();
          updateUI();
        } catch (uiError) {
          console.warn('UI update error:', uiError);
        }
        
        // Show success message
        setTimeout(() => {
          try {
            alert('Profile created successfully! 🎉\nKeystroke model trained with ' + featureVectors.length + ' samples.');
          } catch (alertError) {
            console.log('Profile creation completed successfully!');
          }
        }, 500);
        
      } catch (error) {
        console.error('Error completing registration:', error);
        
        // Safe error display
        try {
          showTrainingStatus('Registration failed: ' + error.message, 'error');
        } catch (statusError) {
          console.error('Failed to show training status:', statusError);
        }
        
        setTimeout(() => {
          try {
            alert('Error creating profile: ' + error.message + '\nPlease try again.');
          } catch (alertError) {
            console.error('Registration failed:', error.message);
          }
        }, 500);
      }
    };
  
  await wrappedFunction();
}

function showTrainingStatus(message, type) {
  if (window.GhostKeyRecovery) {
    window.GhostKeyRecovery.safeTextUpdate('training-status', message);
    window.GhostKeyRecovery.safeElementAccess('training-status', (element) => {
      element.className = `training-status ${type}`;
      element.style.display = 'block';
      return true;
    });
  } else {
    // Fallback method
    try {
      const status = document.getElementById('training-status');
      if (status && status.style !== undefined && status.style !== null) {
        status.textContent = message;
        status.className = `training-status ${type}`;
        status.style.display = 'block';
      } else {
        console.log('Training status (fallback):', message, type);
      }
    } catch (error) {
      console.warn('Error showing training status:', error);
      console.log('Training status (error fallback):', message, type);
    }
  }
}

function generateProfileId() {
  return 'profile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showHelp() {
  alert('Ghost Key Extension Help:\n\n' +
        '1. Create a profile by clicking "Create Profile"\n' +
        '2. Train your keystroke pattern by typing your password 5 times\n' +
        '3. Optionally add voice authentication\n' +
        '4. Select your profile as active\n' +
        '5. Visit any website with login forms\n' +
        '6. Focus on password field to activate authentication\n\n' +
        'For support, visit our documentation.');
}

// Global functions for onclick handlers
window.selectProfile = selectProfile;
window.deactivateProfile = deactivateProfile;
window.deleteProfile = deleteProfile;
window.startRegistration = startRegistration;

// Feature extraction function for keystroke analysis
function extractKeystrokeFeatures(keystrokeBuffer) {
  const keyDownEvents = keystrokeBuffer.filter(k => k.type === 'keydown');
  const keyUpEvents = keystrokeBuffer.filter(k => k.type === 'keyup');
  
  const holdTimes = [];
  const ddTimes = [];
  const udTimes = [];
  
  // Calculate hold times (dwell times)
  keyDownEvents.forEach(downEvent => {
    const upEvent = keyUpEvents.find(up => 
      up.key === downEvent.key && up.timestamp > downEvent.timestamp
    );
    if (upEvent) {
      holdTimes.push(upEvent.timestamp - downEvent.timestamp);
    }
  });
  
  // Calculate down-to-down times
  for (let i = 0; i < keyDownEvents.length - 1; i++) {
    ddTimes.push(keyDownEvents[i + 1].timestamp - keyDownEvents[i].timestamp);
  }
  
  // Calculate up-to-down times (flight times)
  for (let i = 0; i < keyDownEvents.length - 1; i++) {
    const currentUp = keyUpEvents.find(up => 
      up.key === keyDownEvents[i].key && up.timestamp > keyDownEvents[i].timestamp
    );
    if (currentUp) {
      udTimes.push(keyDownEvents[i + 1].timestamp - currentUp.timestamp);
    }
  }
  
  // Calculate additional metrics
  const totalTime = keyDownEvents.length > 0 ? 
    keyDownEvents[keyDownEvents.length - 1].timestamp - keyDownEvents[0].timestamp : 0;
  const typingSpeed = totalTime > 0 ? keyDownEvents.length / (totalTime / 1000) : 0;
  const avgFlightTime = udTimes.length > 0 ? udTimes.reduce((a, b) => a + b, 0) / udTimes.length : 0;
  
  // Calculate pressure variance (consistency indicator)
  const meanHoldTime = holdTimes.length > 0 ? holdTimes.reduce((a, b) => a + b, 0) / holdTimes.length : 0;
  const pressureVariance = holdTimes.length > 0 ? 
    Math.sqrt(holdTimes.reduce((sum, t) => sum + Math.pow(t - meanHoldTime, 2), 0) / holdTimes.length) : 0;
  
  // Create feature vector (matching the original project format)
  const PASSWORD_LENGTH = 11;
  const features = [
    ...holdTimes.slice(0, PASSWORD_LENGTH),
    ...ddTimes.slice(0, PASSWORD_LENGTH - 1),
    ...udTimes.slice(0, PASSWORD_LENGTH - 1),
    typingSpeed,
    avgFlightTime,
    0, // error rate (backspace count)
    pressureVariance
  ];
  
  // Pad with zeros if needed
  while (features.length < PASSWORD_LENGTH * 3 + 1) {
    features.push(0);
  }
  
  return features;
}