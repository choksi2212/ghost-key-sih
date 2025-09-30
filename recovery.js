/**
 * Recovery and Error Handling for Ghost Key Extension
 * This module provides error recovery and context validation functions
 */

// Extension context validation utility
window.GhostKeyRecovery = {
  
  /**
   * Check if extension context is valid
   */
  isContextValid() {
    try {
      return !!(chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  },
  
  /**
   * Safe storage operation with retry
   */
  async safeStorageSet(data, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isContextValid()) {
          throw new Error('Extension context invalidated');
        }
        
        await chrome.storage.local.set(data);
        return true;
      } catch (error) {
        console.warn(`Storage set attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
  },
  
  /**
   * Safe storage operation with retry
   */
  async safeStorageGet(keys, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isContextValid()) {
          throw new Error('Extension context invalidated');
        }
        
        return await chrome.storage.local.get(keys);
      } catch (error) {
        console.warn(`Storage get attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
    }
  },
  
  /**
   * Safe message sending with timeout and retry
   */
  async safeMessageSend(message, timeout = 5000, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.isContextValid()) {
          throw new Error('Extension context invalidated');
        }
        
        return await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('Message timeout'));
          }, timeout);
          
          chrome.runtime.sendMessage(message, (response) => {
            clearTimeout(timeoutId);
            
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve(response);
            }
          });
        });
      } catch (error) {
        console.warn(`Message send attempt ${attempt} failed:`, error);
        if (attempt === maxRetries) {
          throw error;
        }
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  },
  
  /**
   * Safe DOM element access with null checks
   */
  safeElementAccess(elementId, operation) {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        console.warn(`Element ${elementId} not found`);
        return null;
      }
      
      if (element.style === null || element.style === undefined) {
        console.warn(`Element ${elementId} has invalid style property`);
        return null;
      }
      
      return operation(element);
    } catch (error) {
      console.warn(`Error accessing element ${elementId}:`, error);
      return null;
    }
  },
  
  /**
   * Safe text content update
   */
  safeTextUpdate(elementId, text) {
    return this.safeElementAccess(elementId, (element) => {
      if (element.textContent !== undefined) {
        element.textContent = text;
        return true;
      }
      return false;
    });
  },
  
  /**
   * Safe style update
   */
  safeStyleUpdate(elementId, styleProperty, value) {
    return this.safeElementAccess(elementId, (element) => {
      try {
        element.style[styleProperty] = value;
        return true;
      } catch (styleError) {
        console.warn(`Style update failed for ${elementId}:`, styleError);
        return false;
      }
    });
  },
  
  /**
   * Show error recovery dialog
   */
  showRecoveryDialog(error) {
    try {
      const message = error.message.includes('context invalidated') 
        ? 'Extension was reloaded. Please:\n1. Refresh this page\n2. Try the operation again'
        : `Error: ${error.message}\n\nPlease try again or reload the extension.`;
        
      if (typeof alert === 'function') {
        alert(message);
      } else {
        console.error('Recovery needed:', message);
      }
    } catch (dialogError) {
      console.error('Recovery dialog failed:', dialogError);
    }
  },
  
  /**
   * Initialize error handling for a function
   */
  withErrorHandling(fn, context = 'Operation') {
    return async (...args) => {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        console.error(`${context} failed:`, error);
        this.showRecoveryDialog(error);
        throw error;
      }
    };
  }
};

// Make globally available
window.GhostKeyRecovery = window.GhostKeyRecovery;