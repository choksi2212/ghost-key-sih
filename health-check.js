/**
 * Extension Health Check and Initialization Validator
 * Ensures all components are loaded properly before allowing operations
 */

window.GhostKeyHealthCheck = {
  
  /**
   * Comprehensive health check
   */
  async performHealthCheck() {
    const checks = {
      extensionContext: this.checkExtensionContext(),
      domReady: this.checkDOMReady(),
      mlLibrary: await this.checkMLLibrary(),
      recoverySystem: this.checkRecoverySystem(),
      storage: await this.checkStorage()
    };
    
    const allPassed = Object.values(checks).every(check => check.passed);
    
    console.log('Ghost Key Health Check:', checks);
    
    return {
      healthy: allPassed,
      checks: checks,
      recommendations: this.getRecommendations(checks)
    };
  },
  
  /**
   * Check extension context
   */
  checkExtensionContext() {
    try {
      const valid = !!(chrome.runtime && chrome.runtime.id);
      return {
        passed: valid,
        message: valid ? 'Extension context is valid' : 'Extension context invalidated'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Extension context check failed: ' + error.message
      };
    }
  },
  
  /**
   * Check DOM readiness
   */
  checkDOMReady() {
    const ready = document.readyState === 'complete' || document.readyState === 'interactive';
    return {
      passed: ready,
      message: ready ? 'DOM is ready' : 'DOM not ready yet'
    };
  },
  
  /**
   * Check ML library availability
   */
  async checkMLLibrary() {
    try {
      if (!window.GhostKeyML) {
        return {
          passed: false,
          message: 'ML library not loaded - window.GhostKeyML not found'
        };
      }
      
      // Test ML functions exist
      const requiredFunctions = [
        'trainKeystrokeBiometricModel',
        'authenticateKeystrokePattern',
        'BIOMETRIC_AUTH_CONFIG'
      ];
      
      const missingFunctions = requiredFunctions.filter(fn => {
        if (fn === 'BIOMETRIC_AUTH_CONFIG') {
          return !window.GhostKeyML[fn] || typeof window.GhostKeyML[fn] !== 'object';
        }
        return typeof window.GhostKeyML[fn] !== 'function';
      });
      
      if (missingFunctions.length > 0) {
        return {
          passed: false,
          message: `ML library incomplete - missing: ${missingFunctions.join(', ')}`
        };
      }
      
      // Test that functions don't throw immediately
      try {
        const config = window.GhostKeyML.BIOMETRIC_AUTH_CONFIG;
        if (!config.DEFAULT_AUTH_THRESHOLD) {
          return {
            passed: false,
            message: 'ML library config invalid - missing DEFAULT_AUTH_THRESHOLD'
          };
        }
      } catch (configError) {
        return {
          passed: false,
          message: 'ML library config test failed: ' + configError.message
        };
      }
      
      return {
        passed: true,
        message: 'ML library fully loaded and functional'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'ML library check failed: ' + error.message
      };
    }
  },
  
  /**
   * Check recovery system
   */
  checkRecoverySystem() {
    const available = !!(window.GhostKeyRecovery && 
      typeof window.GhostKeyRecovery.isContextValid === 'function' &&
      typeof window.GhostKeyRecovery.safeStorageSet === 'function');
    
    return {
      passed: available,
      message: available ? 'Recovery system available' : 'Recovery system not loaded'
    };
  },
  
  /**
   * Check storage access
   */
  async checkStorage() {
    try {
      if (!chrome.storage || !chrome.storage.local) {
        return {
          passed: false,
          message: 'Chrome storage API not available'
        };
      }
      
      // Test storage access
      const testKey = 'healthCheck_' + Date.now();
      await chrome.storage.local.set({ [testKey]: true });
      const result = await chrome.storage.local.get([testKey]);
      await chrome.storage.local.remove([testKey]);
      
      return {
        passed: !!result[testKey],
        message: 'Storage access working'
      };
    } catch (error) {
      return {
        passed: false,
        message: 'Storage check failed: ' + error.message
      };
    }
  },
  
  /**
   * Get recommendations based on failed checks
   */
  getRecommendations(checks) {
    const recommendations = [];
    
    if (!checks.extensionContext.passed) {
      recommendations.push('Reload the extension in chrome://extensions');
    }
    
    if (!checks.domReady.passed) {
      recommendations.push('Wait for page to fully load');
    }
    
    if (!checks.mlLibrary.passed) {
      recommendations.push('Refresh the extension popup');
    }
    
    if (!checks.recoverySystem.passed) {
      recommendations.push('Check if all scripts are loaded properly');
    }
    
    if (!checks.storage.passed) {
      recommendations.push('Check Chrome storage permissions');
    }
    
    return recommendations;
  },
  
  /**
   * Show health status to user
   */
  showHealthStatus() {
    this.performHealthCheck().then(health => {
      if (health.healthy) {
        console.log('✅ Ghost Key Extension: All systems healthy');
      } else {
        console.warn('⚠️ Ghost Key Extension: Health issues detected');
        console.log('Recommendations:', health.recommendations);
        
        // Show user-friendly message
        const message = 'Extension health check failed:\n' + 
          health.recommendations.join('\n') + 
          '\n\nPlease follow these steps to fix the issues.';
        
        if (typeof alert === 'function') {
          alert(message);
        }
      }
    });
  },
  
  /**
   * Wait for system to be healthy
   */
  async waitForHealthy(maxWaitTime = 10000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      const health = await this.performHealthCheck();
      if (health.healthy) {
        return true;
      }
      
      // Wait 500ms before next check
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.warn('Timeout waiting for healthy state');
    return false;
  }
};