/**
 * Content Script for Ghost Key Extension
 * Detects login/signup forms, captures keystrokes, and handles authentication flow
 */

let contentState = {
  isActive: false,
  currentPasswordField: null,
  keystrokeBuffer: [],
  actualPassword: '', // Store the actual password being typed
  formType: null,
  isCapturing: false,
  authFailureCount: 0
};

const CAPTURE_CONFIG = {
  PASSWORD_MIN_LENGTH: 8,
  CAPTURE_TIMEOUT: 30000,
  DEBOUNCE_DELAY: 300
};

// Initialize content script
function initializeContentScript() {
  console.log('Ghost Key content script initializing...');
  
  // Validate extension context first
  if (!chrome.runtime || !chrome.runtime.id) {
    console.warn('Extension context not available during initialization');
    // Try to re-initialize after a delay
    setTimeout(() => {
      if (chrome.runtime && chrome.runtime.id) {
        console.log('Extension context recovered, re-initializing...');
        initializeContentScript();
      }
    }, 1000);
    return;
  }
  
  try {
    setupFormDetection();
    setupPasswordFieldMonitoring();
    setupMessageListener();
    scanForExistingForms();
    addGhostKeyStyles();
    
    console.log('Ghost Key content script initialized successfully');
  } catch (error) {
    console.error('Error during content script initialization:', error);
  }
}

// Form detection
function setupFormDetection() {
  const observer = new MutationObserver(debounce(handleDOMChanges, CAPTURE_CONFIG.DEBOUNCE_DELAY));
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['type', 'name', 'id', 'class']
  });
}

function handleDOMChanges() {
  scanForExistingForms();
}

function scanForExistingForms() {
  const forms = document.querySelectorAll('form, [class*="login"], [class*="signin"], [class*="signup"], [class*="register"]');
  let detectedForms = [];
  
  forms.forEach(form => {
    if (hasPasswordField(form)) {
      if (isLoginForm(form)) {
        detectedForms.push({ type: 'login', element: form });
      } else if (isSignupForm(form)) {
        detectedForms.push({ type: 'signup', element: form });
      }
    }
  });
  
  if (detectedForms.length > 0) {
    safeMessageSend({
      type: 'FORM_DETECTED',
      formType: detectedForms[0].type,
      url: window.location.href
    });
    contentState.formType = detectedForms[0].type;
  }
}

/**
 * Safe message sending with context validation and retry
 */
function safeMessageSend(message, callback, maxRetries = 2) {
  let attempts = 0;
  
  const attemptSend = () => {
    attempts++;
    
    // Validate context
    if (!chrome.runtime || !chrome.runtime.id) {
      console.warn(`Message send attempt ${attempts}: Extension context invalidated`);
      if (attempts < maxRetries) {
        setTimeout(attemptSend, 1000 * attempts);
        return;
      }
      if (callback) callback({ error: 'Extension context invalidated' });
      return;
    }
    
    try {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          console.warn(`Message send attempt ${attempts} failed:`, chrome.runtime.lastError.message);
          
          if (attempts < maxRetries && !chrome.runtime.lastError.message.includes('context invalidated')) {
            setTimeout(attemptSend, 1000 * attempts);
            return;
          }
          
          if (callback) callback({ error: chrome.runtime.lastError.message });
          return;
        }
        
        if (callback) callback(response);
      });
    } catch (error) {
      console.error(`Message send attempt ${attempts} exception:`, error);
      if (attempts < maxRetries) {
        setTimeout(attemptSend, 1000 * attempts);
        return;
      }
      if (callback) callback({ error: error.message });
    }
  };
  
  attemptSend();
}

/**
 * Check if extension context is valid and show appropriate message
 */
function validateExtensionContext() {
  if (!chrome.runtime || !chrome.runtime.id) {
    showMessage('Extension needs to be reloaded. Please refresh this page.', 'error');
    return false;
  }
  return true;
}

function isLoginForm(element) {
  const text = element.textContent?.toLowerCase() || '';
  const className = element.className?.toLowerCase() || '';
  const loginKeywords = ['login', 'signin', 'sign in', 'log in', 'auth'];
  const signupKeywords = ['signup', 'sign up', 'register', 'create account'];
  
  const hasLoginKeywords = loginKeywords.some(keyword => 
    text.includes(keyword) || className.includes(keyword));
  const hasSignupKeywords = signupKeywords.some(keyword => 
    text.includes(keyword) || className.includes(keyword));
  
  return hasLoginKeywords && !hasSignupKeywords;
}

function isSignupForm(element) {
  const text = element.textContent?.toLowerCase() || '';
  const className = element.className?.toLowerCase() || '';
  const signupKeywords = ['signup', 'sign up', 'register', 'create account', 'join'];
  
  return signupKeywords.some(keyword => 
    text.includes(keyword) || className.includes(keyword));
}

function hasPasswordField(element) {
  return element.querySelectorAll('input[type="password"]').length > 0;
}

// Password field monitoring
function setupPasswordFieldMonitoring() {
  document.addEventListener('focusin', handlePasswordFieldFocus);
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup', handleKeyUp);
}

function handlePasswordFieldFocus(event) {
  if (event.target.type === 'password') {
    contentState.currentPasswordField = event.target;
    contentState.keystrokeBuffer = [];
    contentState.actualPassword = ''; // Reset password capture
    
    addPasswordFieldIndicator(event.target);
    
    // Use safe message sending
    if (!validateExtensionContext()) {
      return;
    }
    
    safeMessageSend({
      type: 'PASSWORD_FIELD_FOCUSED',
      url: window.location.href
    }, (response) => {
      if (response?.error) {
        console.warn('Password field focus error:', response.error);
        if (response.error.includes('context invalidated')) {
          showMessage('Extension needs to be reloaded. Please refresh this page.', 'error');
        } else {
          showMessage('Extension communication error', 'warning');
        }
        return;
      }
      
      if (response?.success) {
        if (response.action === 'SHOW_PROFILE_SELECTOR') {
          showProfileSelector(response.profiles);
        } else if (response.action === 'ACTIVATE_CAPTURE') {
          activateKeystrokeCapture(response.profile);
        }
      } else {
        console.warn('Password field focus response error:', response);
      }
    });
  }
}

function activateKeystrokeCapture(profile) {
  contentState.isActive = true;
  contentState.isCapturing = true;
  showAuthenticationIndicator(`🔐 Ghost Key Active - ${profile.name}`);
}

function handleKeyDown(event) {
  if (!contentState.isCapturing || event.target !== contentState.currentPasswordField) return;
  
  if (event.key !== 'Tab' && event.key !== 'Shift') {
    event.preventDefault();
    event.stopPropagation();
  }
  
  // Capture the actual password characters
  if (event.key === 'Backspace') {
    // Handle backspace - remove last character
    contentState.actualPassword = contentState.actualPassword.slice(0, -1);
  } else if (event.key === 'Enter') {
    // Don't add Enter to password, but process authentication
    console.log('🔑 Password captured:', contentState.actualPassword.replace(/./g, '*'));
  } else if (event.key.length === 1) {
    // Only add printable characters to password
    contentState.actualPassword += event.key;
  }
  
  // Store keystroke timing data
  contentState.keystrokeBuffer.push({
    key: event.key,
    type: 'keydown',
    timestamp: performance.now()
  });
  
  if (event.key === 'Enter') {
    processAuthentication();
  }
}

function handleKeyUp(event) {
  if (!contentState.isCapturing || event.target !== contentState.currentPasswordField) return;
  
  contentState.keystrokeBuffer.push({
    key: event.key,
    type: 'keyup',
    timestamp: performance.now()
  });
}

function processAuthentication() {
  if (contentState.keystrokeBuffer.length < CAPTURE_CONFIG.PASSWORD_MIN_LENGTH * 2) {
    showMessage('Please type a longer password', 'warning');
    return;
  }
  
  if (!contentState.actualPassword || contentState.actualPassword.length < 4) {
    showMessage('Password too short for authentication', 'warning');
    return;
  }
  
  console.log('Processing authentication with', contentState.keystrokeBuffer.length, 'keystroke events');
  console.log('🔑 Password length:', contentState.actualPassword.length, 'characters');
  
  const features = extractKeystrokeFeatures(contentState.keystrokeBuffer);
  showMessage('🔍 Analyzing biometric patterns...', 'info');
  
  // Use safe message sending
  if (!validateExtensionContext()) {
    return;
  }
  
  safeMessageSend({
    type: 'KEYSTROKE_DATA',
    data: { 
      features: features,
      password: contentState.actualPassword // Include captured password
    }
  }, (response) => {
    if (response?.error) {
      console.error('Authentication error:', response.error);
      
      if (response.error.includes('context invalidated')) {
        showMessage('Extension was reloaded - please refresh the page', 'error');
      } else {
        showMessage('Authentication error: ' + response.error, 'error');
      }
      
      // Reset for retry
      contentState.keystrokeBuffer = [];
      contentState.actualPassword = ''; // Clear captured password for retry
      contentState.isCapturing = true;
      return;
    }
    
    console.log('Authentication response:', response);
    
    if (response?.success) {
      handleAuthenticationResponse(response);
    } else {
      const errorMsg = response?.error || 'Unknown authentication error';
      console.error('Authentication error:', errorMsg);
      showMessage('Authentication error: ' + errorMsg, 'error');
      
      // Reset for retry
      contentState.keystrokeBuffer = [];
      contentState.isCapturing = true;
    }
  });
}

function extractKeystrokeFeatures(keystrokeBuffer) {
  const keyDownEvents = keystrokeBuffer.filter(k => k.type === 'keydown');
  const keyUpEvents = keystrokeBuffer.filter(k => k.type === 'keyup');
  
  const holdTimes = [];
  const ddTimes = [];
  const udTimes = [];
  
  // Calculate timing features
  keyDownEvents.forEach(downEvent => {
    const upEvent = keyUpEvents.find(up => 
      up.key === downEvent.key && up.timestamp > downEvent.timestamp);
    if (upEvent) {
      holdTimes.push(upEvent.timestamp - downEvent.timestamp);
    }
  });
  
  for (let i = 0; i < keyDownEvents.length - 1; i++) {
    ddTimes.push(keyDownEvents[i + 1].timestamp - keyDownEvents[i].timestamp);
  }
  
  const typingSpeed = keyDownEvents.length > 0 ? 
    keyDownEvents.length / ((keyDownEvents[keyDownEvents.length - 1]?.timestamp - keyDownEvents[0]?.timestamp) / 1000) : 0;
  
  const features = [
    ...holdTimes.slice(0, 11),
    ...ddTimes.slice(0, 10),
    ...udTimes.slice(0, 10),
    typingSpeed,
    0, 0, 0 // Additional features
  ];
  
  while (features.length < 34) features.push(0);
  return features;
}

function handleAuthenticationResponse(response) {
  contentState.isCapturing = false;
  hideAuthenticationIndicator();
  
  console.log('Handling auth response:', response);
  
  if (response.authenticated) {
    console.log('🎉 Keystroke authentication successful - auto-completing login');
    
    // Reset authentication state
    contentState.authFailureCount = 0;
    contentState.isCapturing = false;
    contentState.isActive = false;
    
    // Show brief success indicator
    showAuthenticationIndicator(`✅ Keystroke Auth Success (${(response.confidence * 100).toFixed(1)}%) - Auto-logging in...`);
    
    // Auto-complete login process
    setTimeout(() => {
      console.log('🚀 Initiating automatic login after keystroke auth...');
      autoCompleteLogin();
      
      // Clear password from memory for security
      setTimeout(() => {
        contentState.actualPassword = '';
        console.log('🔒 Password cleared from memory for security');
      }, 2000);
      
      // Show success message
      setTimeout(() => {
        showMessage('✅ Keystroke Authentication Successful!\nLogin completed automatically.', 'success');
      }, 500);
    }, 600);
    
  } else {
    contentState.authFailureCount++;
    
    const errorDetails = response.reconstructionError ? 
      `\nError: ${response.reconstructionError.toFixed(5)}` : '';
    
    if (contentState.authFailureCount >= 2) {
      showMessage(
        `❌ Authentication Failed (${contentState.authFailureCount}/2)\n🎤 Voice authentication required${errorDetails}`, 
        'error'
      );
      triggerVoiceAuthentication();
    } else {
      showMessage(
        `❌ Authentication Failed (${contentState.authFailureCount}/2)\nTry again${errorDetails}`, 
        'error'
      );
      
      // Reset for retry
      contentState.keystrokeBuffer = [];
      contentState.actualPassword = ''; // Clear captured password for retry
      contentState.isCapturing = true;
      if (contentState.currentPasswordField) {
        contentState.currentPasswordField.value = '';
        contentState.currentPasswordField.focus();
      }
    }
  }
  
  // Notify background script with safe messaging
  if (validateExtensionContext()) {
    safeMessageSend({
      type: 'AUTHENTICATION_RESULT',
      result: {
        success: response.authenticated,
        confidence: response.confidence,
        failureCount: contentState.authFailureCount
      }
    }, (bgResponse) => {
      if (bgResponse?.error) {
        console.warn('Background notification failed:', bgResponse.error);
      }
    });
  }
}

function triggerVoiceAuthentication() {
  showVoiceAuthModal();
}

// UI Functions
function showProfileSelector(profiles) {
  const overlay = document.createElement('div');
  overlay.className = 'ghost-key-overlay';
  overlay.innerHTML = `
    <div class="ghost-key-modal">
      <h3>🔐 Select Profile</h3>
      <div class="ghost-key-profiles">
        ${profiles.map(profile => `
          <div class="ghost-key-profile" data-profile-id="${profile.id}">
            <span>${profile.name}</span>
            ${profile.hasVoiceProfile ? '<span>🎤</span>' : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  overlay.querySelectorAll('.ghost-key-profile').forEach(option => {
    option.addEventListener('click', () => {
      const profileId = option.dataset.profileId;
      chrome.runtime.sendMessage({ type: 'SET_ACTIVE_PROFILE', profileId });
      overlay.remove();
      setTimeout(() => handlePasswordFieldFocus({ target: contentState.currentPasswordField }), 100);
    });
  });
}

function showVoiceAuthModal() {
  const modal = document.createElement('div');
  modal.className = 'ghost-key-overlay';
  modal.innerHTML = `
    <div class="ghost-key-modal">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h3 style="margin: 0;">🎤 Voice Authentication</h3>
        <button id="voice-close" style="background: none; border: none; color: white; font-size: 20px; cursor: pointer;">✕</button>
      </div>
      <p>Speak: "I'll Always Choose You"</p>
      <div id="voice-status" style="margin: 8px 0; min-height: 20px; font-size: 14px; color: #fbbf24;"></div>
      <div style="margin: 16px 0;">
        <button id="voice-record" style="margin-right: 8px;">🎤 Record</button>
        <button id="voice-verify" disabled>Verify</button>
      </div>
      <div style="font-size: 12px; color: #94a3b8; margin-top: 8px;">
        Failed attempts: <span id="failure-count">${contentState.authFailureCount}</span>/5
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  setupVoiceRecording(modal);
}

function setupVoiceRecording(modal) {
  const recordBtn = modal.querySelector('#voice-record');
  const verifyBtn = modal.querySelector('#voice-verify');
  const closeBtn = modal.querySelector('#voice-close');
  const statusDiv = modal.querySelector('#voice-status');
  const failureCountSpan = modal.querySelector('#failure-count');
  let audioBlob = null;
  
  // Helper function to update status
  const updateStatus = (message, color = '#fbbf24') => {
    if (statusDiv) {
      statusDiv.textContent = message;
      statusDiv.style.color = color;
    }
  };
  
  // Helper function to update failure count
  const updateFailureCount = () => {
    if (failureCountSpan) {
      failureCountSpan.textContent = contentState.authFailureCount;
    }
  };
  
  // Close button handler
  closeBtn.addEventListener('click', () => {
    console.log('Voice authentication modal closed by user');
    modal.remove();
    showMessage('Voice authentication cancelled', 'warning');
    
    // Reset capturing state to allow retry
    contentState.isCapturing = false;
    contentState.isActive = false;
    hideAuthenticationIndicator();
  });
  
  recordBtn.addEventListener('click', async () => {
    try {
      if (recordBtn.textContent.includes('Record')) {
        // Start recording
        updateStatus('Requesting microphone access...', '#3b82f6');
        
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream);
        const chunks = [];
        
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
          audioBlob = new Blob(chunks, { type: 'audio/webm' });
          verifyBtn.disabled = false;
          updateStatus('Recording complete. Click Verify to authenticate.', '#10b981');
        };
        
        recorder.start();
        recordBtn.textContent = '⏹️ Stop';
        updateStatus('🔴 Recording... Speak the passphrase now', '#ef4444');
        
        recordBtn.onclick = () => {
          recorder.stop();
          stream.getTracks().forEach(track => track.stop());
          recordBtn.textContent = '🎤 Record';
          updateStatus('Processing recording...', '#f59e0b');
        };
      }
    } catch (error) {
      console.error('Microphone access error:', error);
      updateStatus('Microphone access denied', '#ef4444');
      showMessage('Microphone access denied. Please allow microphone access and try again.', 'error');
    }
  });
  
  verifyBtn.addEventListener('click', async () => {
    if (audioBlob) {
      try {
        verifyBtn.disabled = true;
        verifyBtn.textContent = '🔄 Verifying...';
        updateStatus('Analyzing voice patterns...', '#3b82f6');
        
        // Simulate voice verification with realistic success/failure
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Simulate 70% success rate for demonstration
        const isVoiceAuthSuccessful = Math.random() > 0.3;
        
        console.log('Voice authentication result:', isVoiceAuthSuccessful ? 'SUCCESS' : 'FAILED');
        
        if (isVoiceAuthSuccessful) {
          // SUCCESS CASE
          console.log('🎉 Voice authentication successful - auto-completing login process');
          
          updateStatus('✅ Voice authentication successful! Auto-signing in...', '#10b981');
          
          // Brief delay to show success message
          setTimeout(() => {
            console.log('📴 Removing modal and auto-completing login...');
            
            // Perform complete cleanup
            cleanupGhostKeyUI();
            
            // Reset authentication state completely
            contentState.authFailureCount = 0;
            contentState.isCapturing = false;
            contentState.isActive = false;
            
            // Show auto-login message
            showAuthenticationIndicator('✅ Auto-completing Login...');
            
            // Auto-complete the login process
            setTimeout(() => {
              console.log('🚀 Initiating automatic login completion...');
              autoCompleteLogin();
              
              // Clear password from memory for security after voice auth
              setTimeout(() => {
                contentState.actualPassword = '';
                console.log('🔒 Password cleared from memory for security after voice auth');
              }, 2000);
              
              // Success message
              setTimeout(() => {
                showMessage('✅ Voice Authentication Successful!\nLogin completed automatically.', 'success');
              }, 500);
            }, 400);
            
            // Notify background script about successful voice authentication
            if (validateExtensionContext()) {
              safeMessageSend({
                type: 'VOICE_AUTH_RESULT',
                result: { success: true }
              }, (response) => {
                if (response?.error) {
                  console.warn('Voice auth result notification failed:', response.error);
                }
              });
            }
          }, 1200);
          
        } else {
          // FAILURE CASE
          console.log('Voice authentication failed');
          
          updateStatus('❌ Voice pattern did not match. Try again.', '#ef4444');
          
          // Re-enable verify button for retry
          verifyBtn.disabled = false;
          verifyBtn.textContent = 'Verify';
          
          // Increment failure count
          contentState.authFailureCount++;
          updateFailureCount();
          
          // Show failure message
          showMessage(`❌ Voice authentication failed (${contentState.authFailureCount}/5). Please try again.`, 'error');
          
          // If too many failures, close website
          if (contentState.authFailureCount >= 5) {
            updateStatus('❌ Too many failed attempts. Access denied.', '#dc2626');
            
            setTimeout(() => {
              modal.remove();
              showMessage('❌ Too many authentication failures. Access denied.', 'error');
              
              // Close the website tab after delay
              setTimeout(() => {
                if (validateExtensionContext()) {
                  safeMessageSend({
                    type: 'CLOSE_WEBSITE'
                  }, (response) => {
                    console.log('Website close request sent');
                  });
                }
              }, 3000);
            }, 2000);
          }
        }
        
      } catch (error) {
        console.error('Voice verification error:', error);
        
        updateStatus('⚠️ Verification error occurred', '#ef4444');
        
        // Reset button state
        verifyBtn.disabled = false;
        verifyBtn.textContent = 'Verify';
        
        // Show error message but keep modal open
        showMessage('⚠️ Voice verification error. Please try again.', 'error');
      }
    } else {
      // No audio recorded
      updateStatus('⚠️ Please record your voice first', '#f59e0b');
      showMessage('⚠️ Please record your voice first.', 'warning');
    }
  });
}

/**
 * Automatically complete the login process after successful voice authentication
 */
function autoCompleteLogin() {
  try {
    console.log('🚀 Starting automatic login completion...');
    
    if (contentState.currentPasswordField) {
      const field = contentState.currentPasswordField;
      
      // First, ensure the password field is properly set up
      field.style.border = '';
      field.style.boxShadow = '';
      field.style.pointerEvents = '';
      field.disabled = false;
      field.readOnly = false;
      
      // Use the captured actual password or fallback to placeholder
      const passwordToUse = contentState.actualPassword || '••••••••';
      field.value = passwordToUse;
      
      console.log('🔑 Using password for auto-login:', passwordToUse.replace(/./g, '*'));
      
      // Trigger input events to notify the website
      const inputEvent = new Event('input', { bubbles: true, cancelable: true });
      field.dispatchEvent(inputEvent);
      
      // Also trigger change event
      const changeEvent = new Event('change', { bubbles: true, cancelable: true });
      field.dispatchEvent(changeEvent);
      
      // Find the form containing the password field
      const form = field.closest('form');
      if (form) {
        console.log('🎯 Form found, attempting to submit...');
        
        // Try multiple methods to find and trigger the submit button
        const submitSuccess = attemptFormSubmission(form, field);
        
        if (submitSuccess) {
          console.log('✅ Login form submitted successfully');
          showAuthenticationIndicator('✅ Login Completed!');
        } else {
          console.warn('⚠️ Could not auto-submit, falling back to manual entry');
          restorePasswordFieldForManualEntry();
        }
      } else {
        console.warn('⚠️ No form found, falling back to manual entry');
        restorePasswordFieldForManualEntry();
      }
    } else {
      console.warn('⚠️ No password field reference available for auto-login');
      // Try to find password fields
      const passwordFields = document.querySelectorAll('input[type="password"]');
      if (passwordFields.length > 0) {
        contentState.currentPasswordField = passwordFields[0];
        autoCompleteLogin(); // Retry with found field
      } else {
        showMessage('✅ Authentication successful. Please complete login manually.', 'success');
      }
    }
  } catch (error) {
    console.error('❌ Error in auto-login completion:', error);
    restorePasswordFieldForManualEntry(); // Fallback to manual entry
  }
}

/**
 * Attempt form submission using multiple strategies
 */
function attemptFormSubmission(form, passwordField) {
  try {
    console.log('🔍 Attempting form submission with multiple strategies...');
    
    // Strategy 1: Look for explicit submit buttons
    const submitSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:not([type])', // Default button type is submit
      '[role="button"][type="submit"]'
    ];
    
    for (const selector of submitSelectors) {
      const submitBtn = form.querySelector(selector);
      if (submitBtn && !submitBtn.disabled && submitBtn.offsetParent !== null) {
        console.log(`✅ Found submit button with selector: ${selector}`);
        submitBtn.click();
        return true;
      }
    }
    
    // Strategy 2: Look for buttons with login-related text/classes
    const loginButtonSelectors = [
      '[class*="login"]',
      '[class*="signin"]', 
      '[class*="sign-in"]',
      '[class*="submit"]',
      '[id*="login"]',
      '[id*="signin"]',
      '[id*="submit"]'
    ];
    
    for (const selector of loginButtonSelectors) {
      const buttons = form.querySelectorAll(`button${selector}, input${selector}`);
      for (const btn of buttons) {
        if (!btn.disabled && btn.offsetParent !== null) {
          console.log(`✅ Found login button with selector: button${selector}`);
          btn.click();
          return true;
        }
      }
    }
    
    // Strategy 3: Look for buttons with login-related text content
    const buttons = form.querySelectorAll('button, input[type="button"], input[type="submit"]');
    const loginTexts = [
      /log\s*in/i, /sign\s*in/i, /login/i, /signin/i, /submit/i, 
      /enter/i, /continue/i, /next/i, /登录/i, /登陆/i
    ];
    
    for (const button of buttons) {
      if (button.disabled || button.offsetParent === null) continue;
      
      const buttonText = (button.textContent || button.value || '').trim();
      const hasLoginText = loginTexts.some(regex => regex.test(buttonText));
      
      if (hasLoginText) {
        console.log(`✅ Found login button with text: "${buttonText}"`);
        button.click();
        return true;
      }
    }
    
    // Strategy 4: Try form.submit() if no buttons found
    if (form.submit && typeof form.submit === 'function') {
      console.log('🔄 Using form.submit() method');
      form.submit();
      return true;
    }
    
    // Strategy 5: Simulate Enter key on password field
    console.log('⏵ Trying Enter key simulation on password field');
    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      which: 13,
      keyCode: 13,
      bubbles: true,
      cancelable: true
    });
    passwordField.dispatchEvent(enterEvent);
    
    // Also try keyup
    const enterUpEvent = new KeyboardEvent('keyup', {
      key: 'Enter',
      code: 'Enter', 
      which: 13,
      keyCode: 13,
      bubbles: true,
      cancelable: true
    });
    passwordField.dispatchEvent(enterUpEvent);
    
    // Dispatch submit event on form
    const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
    form.dispatchEvent(submitEvent);
    
    return true;
    
  } catch (error) {
    console.error('❌ Error in form submission attempt:', error);
    return false;
  }
}

/**
 * Completely clean up all Ghost Key UI elements and restore page state
 */
function cleanupGhostKeyUI() {
  try {
    console.log('🧹 Performing complete Ghost Key UI cleanup...');
    
    // Remove all possible overlay elements
    const overlaySelectors = [
      '.ghost-key-overlay',
      '.ghost-key-modal', 
      '#ghost-key-indicator',
      '.ghost-key-message'
    ];
    
    overlaySelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      elements.forEach(element => {
        try {
          element.remove();
        } catch (e) {
          console.warn(`Error removing ${selector}:`, e);
        }
      });
    });
    
    // Reset any body styles that might have been affected
    if (document.body) {
      document.body.style.overflow = '';
      document.body.style.pointerEvents = '';
    }
    
    // Re-enable scrolling if disabled
    document.documentElement.style.overflow = '';
    
    console.log('✅ Ghost Key UI cleanup completed');
  } catch (error) {
    console.error('Error during UI cleanup:', error);
  }
}

function restorePasswordFieldForManualEntry() {
  try {
    console.log('🔄 Restoring password field for manual entry after successful authentication');
    
    // First, perform complete UI cleanup
    cleanupGhostKeyUI();
    
    if (contentState.currentPasswordField) {
      const field = contentState.currentPasswordField;
      
      // Remove ALL Ghost Key styling and restrictions
      field.style.border = '';
      field.style.boxShadow = '';
      field.style.pointerEvents = '';
      field.style.outline = '';
      field.style.backgroundColor = '';
      field.style.opacity = '';
      field.style.zIndex = '';
      
      // Remove any disabled state
      field.disabled = false;
      field.readOnly = false;
      
      // Clear any existing value
      field.value = '';
      field.defaultValue = '';
      
      // Re-enable all event listeners
      field.style.cssText = field.style.cssText.replace(/pointer-events\s*:\s*none/gi, '');
      
      // Ensure field is visible and interactable
      field.style.visibility = 'visible';
      field.style.display = field.style.display === 'none' ? 'block' : field.style.display;
      
      // Remove any classes that might interfere
      if (field.classList.contains('ghost-key-disabled')) {
        field.classList.remove('ghost-key-disabled');
      }
      
      // Scroll field into view if needed
      field.scrollIntoView({ behavior: 'smooth', block: 'center' });
      
      // Focus the field with enhanced activation
      setTimeout(() => {
        try {
          // Multiple focus attempts for reliability
          field.focus();
          
          // Trigger comprehensive events to activate website handlers
          const events = [
            new FocusEvent('focus', { bubbles: true, cancelable: true }),
            new MouseEvent('click', { bubbles: true, cancelable: true }),
            new MouseEvent('mousedown', { bubbles: true, cancelable: true }),
            new MouseEvent('mouseup', { bubbles: true, cancelable: true }),
            new Event('input', { bubbles: true, cancelable: true })
          ];
          
          events.forEach(event => {
            try {
              field.dispatchEvent(event);
            } catch (eventError) {
              console.warn('Event dispatch error:', eventError);
            }
          });
          
          console.log('✅ Password field fully restored and focused - ready for manual entry');
          
          // Show visual confirmation with green border
          field.style.border = '2px solid #10b981';
          field.style.boxShadow = '0 0 8px rgba(16, 185, 129, 0.4)';
          field.style.transition = 'all 0.3s ease';
          
          // Test that the field is actually interactive
          setTimeout(() => {
            if (document.activeElement === field) {
              console.log('✅ Field successfully focused and active');
            } else {
              console.warn('⚠️ Field focus verification failed, attempting secondary focus');
              field.click();
              field.focus();
            }
          }, 100);
          
          // Remove confirmation styling after 3 seconds
          setTimeout(() => {
            field.style.border = '';
            field.style.boxShadow = '';
            field.style.transition = '';
          }, 3000);
          
        } catch (focusError) {
          console.warn('Error focusing field:', focusError);
        }
      }, 300);
      
    } else {
      console.warn('❌ No password field reference available for restoration');
      
      // Try to find the password field again
      const passwordFields = document.querySelectorAll('input[type="password"]');
      if (passwordFields.length > 0) {
        console.log('🔍 Found password field, attempting to restore...');
        contentState.currentPasswordField = passwordFields[0];
        // Wait a bit then try again
        setTimeout(() => {
          restorePasswordFieldForManualEntry();
        }, 200);
      } else {
        showMessage('✅ Authentication successful. Please manually find and use the password field.', 'success');
      }
    }
  } catch (error) {
    console.error('❌ Error restoring password field:', error);
    showMessage('✅ Authentication successful. Please find and use the password field manually.', 'success');
  }
}

function completeLoginProcess() {
  try {
    console.log('Completing login process after successful authentication');
    
    if (contentState.currentPasswordField) {
      const field = contentState.currentPasswordField;
      
      // Remove Ghost Key styling
      field.style.border = '';
      field.style.boxShadow = '';
      field.style.pointerEvents = '';
      
      // Try to find and trigger form submission
      const form = field.closest('form');
      if (form) {
        console.log('Attempting to submit form');
        
        // Try different submission methods
        try {
          // Method 1: Look for submit button and click it
          const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]') || 
                           form.querySelector('button:not([type]), .submit, #submit, [class*="submit"]');
          
          if (submitBtn && submitBtn.click) {
            console.log('Clicking submit button');
            submitBtn.click();
            return;
          }
          
          // Method 2: Try form.submit()
          if (form.submit && typeof form.submit === 'function') {
            console.log('Using form.submit()');
            form.submit();
            return;
          }
          
          // Method 3: Dispatch submit event
          console.log('Dispatching submit event');
          const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
          form.dispatchEvent(submitEvent);
          
        } catch (submitError) {
          console.warn('Form submission methods failed:', submitError);
          
          // Method 4: Try Enter key simulation on password field
          console.log('Trying Enter key simulation');
          const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            which: 13,
            keyCode: 13,
            bubbles: true
          });
          field.dispatchEvent(enterEvent);
        }
      } else {
        console.warn('No form found, cannot submit');
        showMessage('Please submit the form manually', 'info');
      }
    } else {
      console.warn('No password field reference available');
    }
  } catch (error) {
    console.error('Error completing login process:', error);
    showMessage('Authentication successful. Please submit manually if needed.', 'info');
  }
}

function addPasswordFieldIndicator(field) {
  field.style.border = '2px solid #22d3ee';
  field.style.boxShadow = '0 0 10px rgba(34, 211, 238, 0.3)';
}

function showAuthenticationIndicator(message) {
  // Remove any existing indicator first
  hideAuthenticationIndicator();
  
  const indicator = document.createElement('div');
  indicator.id = 'ghost-key-indicator';
  indicator.className = 'ghost-key-indicator';
  indicator.textContent = message;
  document.body.appendChild(indicator);
  
  // Auto-hide after 2 seconds
  setTimeout(() => {
    hideAuthenticationIndicator();
  }, 2000);
}

function hideAuthenticationIndicator() {
  const indicator = document.getElementById('ghost-key-indicator');
  if (indicator) indicator.remove();
}

function showMessage(message, type) {
  try {
    const msg = document.createElement('div');
    msg.className = `ghost-key-message ghost-key-${type}`;
    msg.textContent = message;
    
    if (document.body) {
      document.body.appendChild(msg);
      setTimeout(() => {
        try {
          if (msg.parentNode) {
            msg.remove();
          }
        } catch (removeError) {
          console.warn('Error removing message:', removeError);
        }
      }, 5000);
    } else {
      console.log(`Ghost Key Message (${type}):`, message);
    }
  } catch (error) {
    console.error('Error showing message:', error);
    console.log(`Ghost Key Message (${type}):`, message);
  }
}

function clearPasswordField() {
  if (contentState.currentPasswordField) {
    contentState.currentPasswordField.value = '';
    contentState.currentPasswordField.style.border = '';
    contentState.currentPasswordField.style.boxShadow = '';
  }
}

function setupMessageListener() {
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        console.log('Content script received message:', message.type);
        
        // Validate runtime context
        if (!chrome.runtime || !chrome.runtime.id) {
          console.warn('Extension context invalidated in content script');
          sendResponse({ error: 'Extension context invalidated' });
          return false;
        }
        
        switch (message.type) {
          case 'PING':
            sendResponse({ active: contentState.isActive });
            break;
            
          case 'CLEAR_PASSWORD_FIELD':
            clearPasswordField();
            sendResponse({ success: true });
            break;
            
          case 'SHOW_VOICE_AUTH_MODAL':
            showVoiceAuthModal();
            sendResponse({ success: true });
            break;
            
          case 'SHOW_ERROR_MESSAGE':
            showMessage(message.message, 'error');
            sendResponse({ success: true });
            break;
            
          default:
            console.warn('Unknown message type:', message.type);
            sendResponse({ error: 'Unknown message type' });
        }
      } catch (error) {
        console.error('Error handling message:', error);
        try {
          sendResponse({ error: error.message });
        } catch (responseError) {
          console.error('Error sending error response:', responseError);
        }
      }
      
      return true; // Keep message channel open
    });
  } catch (error) {
    console.error('Error setting up message listener:', error);
  }
}

function addGhostKeyStyles() {
  if (document.getElementById('ghost-key-styles')) return;
  
  const styles = document.createElement('style');
  styles.id = 'ghost-key-styles';
  styles.textContent = `
    .ghost-key-overlay {
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.8); z-index: 999999; display: flex;
      align-items: center; justify-content: center; font-family: system-ui;
    }
    .ghost-key-modal {
      background: #1e293b; border-radius: 12px; padding: 24px;
      color: white; text-align: center; min-width: 320px; max-width: 400px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
    }
    .ghost-key-modal button {
      background: #3b82f6; color: white; border: none; padding: 8px 16px;
      border-radius: 6px; cursor: pointer; font-size: 14px;
      transition: background-color 0.2s;
    }
    .ghost-key-modal button:hover:not(:disabled) {
      background: #2563eb;
    }
    .ghost-key-modal button:disabled {
      background: #6b7280; cursor: not-allowed;
    }
    .ghost-key-profile {
      padding: 12px; margin: 8px 0; background: #334155;
      border-radius: 8px; cursor: pointer; display: flex;
      justify-content: space-between; align-items: center;
    }
    .ghost-key-profile:hover { background: #475569; }
    .ghost-key-indicator {
      position: fixed; top: 20px; right: 20px; background: #22d3ee;
      color: white; padding: 12px 20px; border-radius: 8px; z-index: 999998;
      font-family: system-ui; font-size: 14px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .ghost-key-message {
      position: fixed; bottom: 20px; right: 20px; padding: 12px 20px;
      border-radius: 8px; z-index: 999998; font-family: system-ui;
      white-space: pre-line; max-width: 350px;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    }
    .ghost-key-success { background: #10b981; color: white; }
    .ghost-key-error { background: #ef4444; color: white; }
    .ghost-key-warning { background: #f59e0b; color: white; }
    .ghost-key-info { background: #3b82f6; color: white; }
  `;
  document.head.appendChild(styles);
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Initialize when DOM is ready with retry mechanism
function initializeWithRetry(maxRetries = 3) {
  let attempts = 0;
  
  const tryInitialize = () => {
    attempts++;
    console.log(`Ghost Key initialization attempt ${attempts}/${maxRetries}`);
    
    if (!chrome.runtime || !chrome.runtime.id) {
      console.warn(`Attempt ${attempts}: Extension context not available`);
      
      if (attempts < maxRetries) {
        setTimeout(tryInitialize, 1000 * attempts);
        return;
      }
      
      console.error('Failed to initialize - extension context unavailable');
      return;
    }
    
    // Context is valid, proceed with initialization
    initializeContentScript();
  };
  
  tryInitialize();
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => initializeWithRetry());
} else {
  initializeWithRetry();
}

// Re-initialize on page visibility change (handles context recovery)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && (!chrome.runtime || !chrome.runtime.id)) {
    console.log('Page visible and extension context invalid, attempting recovery...');
    setTimeout(() => initializeWithRetry(1), 500);
  }
});