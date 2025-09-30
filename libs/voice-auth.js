/**
 * Voice Authentication Library for Ghost Key Extension
 * Simplified version of the voice biometric system from the main project
 * Adapted for browser extension environment
 */

class VoiceAuthentication {
  constructor() {
    this.isRecording = false;
    this.mediaRecorder = null;
    this.audioBlob = null;
    this.recordingTimer = null;
    this.recordingTime = 0;
  }

  /**
   * Start voice recording for authentication
   */
  async startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100
        }
      });

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      const audioChunks = [];
      
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      this.mediaRecorder.onstop = () => {
        this.audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
        stream.getTracks().forEach(track => track.stop());
      };

      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordingTime = 0;
      
      // Start recording timer
      this.recordingTimer = setInterval(() => {
        this.recordingTime++;
      }, 1000);

      return true;
    } catch (error) {
      console.error('Error starting voice recording:', error);
      throw new Error('Microphone access denied');
    }
  }

  /**
   * Stop voice recording
   */
  stopRecording() {
    if (this.mediaRecorder && this.isRecording) {
      this.mediaRecorder.stop();
      this.isRecording = false;
      
      if (this.recordingTimer) {
        clearInterval(this.recordingTimer);
        this.recordingTimer = null;
      }
    }
  }

  /**
   * Get recording time in formatted string
   */
  getRecordingTime() {
    const minutes = Math.floor(this.recordingTime / 60);
    const seconds = this.recordingTime % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Extract basic voice features for comparison
   * Simplified version - in production would use advanced audio processing
   */
  async extractVoiceFeatures(audioBlob) {
    try {
      // Convert blob to ArrayBuffer
      const arrayBuffer = await audioBlob.arrayBuffer();
      
      // Create AudioContext for analysis
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      
      // Get audio data
      const audioData = audioBuffer.getChannelData(0);
      
      // Extract basic features
      const features = {
        duration: audioBuffer.duration,
        sampleRate: audioBuffer.sampleRate,
        rmsEnergy: this.calculateRMS(audioData),
        zeroCrossingRate: this.calculateZCR(audioData),
        spectralCentroid: this.calculateSpectralCentroid(audioData),
        audioFingerprint: this.createSimpleFingerprint(audioData)
      };
      
      audioContext.close();
      return features;
    } catch (error) {
      console.error('Error extracting voice features:', error);
      throw new Error('Voice feature extraction failed');
    }
  }

  /**
   * Calculate RMS energy
   */
  calculateRMS(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    return Math.sqrt(sum / audioData.length);
  }

  /**
   * Calculate Zero Crossing Rate
   */
  calculateZCR(audioData) {
    let crossings = 0;
    for (let i = 1; i < audioData.length; i++) {
      if ((audioData[i] > 0) !== (audioData[i - 1] > 0)) {
        crossings++;
      }
    }
    return crossings / audioData.length;
  }

  /**
   * Calculate basic spectral centroid
   */
  calculateSpectralCentroid(audioData) {
    // Simplified calculation - real implementation would use FFT
    let sum = 0;
    let weightedSum = 0;
    
    for (let i = 0; i < audioData.length; i++) {
      const magnitude = Math.abs(audioData[i]);
      sum += magnitude;
      weightedSum += magnitude * i;
    }
    
    return sum > 0 ? weightedSum / sum : 0;
  }

  /**
   * Create simple audio fingerprint
   */
  createSimpleFingerprint(audioData) {
    const chunkSize = Math.floor(audioData.length / 32);
    const fingerprint = [];
    
    for (let i = 0; i < 32; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, audioData.length);
      
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += Math.abs(audioData[j]);
      }
      
      fingerprint.push(sum / (end - start));
    }
    
    return fingerprint;
  }

  /**
   * Compare voice features for authentication
   */
  compareVoiceFeatures(storedFeatures, currentFeatures) {
    try {
      // Basic similarity calculation
      let similarities = [];
      
      // RMS Energy similarity
      const rmsDiff = Math.abs(storedFeatures.rmsEnergy - currentFeatures.rmsEnergy);
      const rmsSimilarity = Math.max(0, 1 - rmsDiff / Math.max(storedFeatures.rmsEnergy, currentFeatures.rmsEnergy));
      similarities.push(rmsSimilarity);
      
      // ZCR similarity
      const zcrDiff = Math.abs(storedFeatures.zeroCrossingRate - currentFeatures.zeroCrossingRate);
      const zcrSimilarity = Math.max(0, 1 - zcrDiff / Math.max(storedFeatures.zeroCrossingRate, currentFeatures.zeroCrossingRate));
      similarities.push(zcrSimilarity);
      
      // Spectral Centroid similarity
      const centroidDiff = Math.abs(storedFeatures.spectralCentroid - currentFeatures.spectralCentroid);
      const centroidSimilarity = Math.max(0, 1 - centroidDiff / Math.max(storedFeatures.spectralCentroid, currentFeatures.spectralCentroid));
      similarities.push(centroidSimilarity);
      
      // Fingerprint similarity (simplified cosine similarity)
      const fingerprintSimilarity = this.calculateFingerprintSimilarity(
        storedFeatures.audioFingerprint, 
        currentFeatures.audioFingerprint
      );
      similarities.push(fingerprintSimilarity);
      
      // Weighted average
      const weights = [0.2, 0.2, 0.2, 0.4]; // Give more weight to fingerprint
      let totalSimilarity = 0;
      
      for (let i = 0; i < similarities.length; i++) {
        totalSimilarity += similarities[i] * weights[i];
      }
      
      return {
        overallSimilarity: totalSimilarity,
        confidence: this.calculateConfidence(similarities),
        details: {
          rms: rmsSimilarity,
          zcr: zcrSimilarity,
          centroid: centroidSimilarity,
          fingerprint: fingerprintSimilarity
        }
      };
    } catch (error) {
      console.error('Error comparing voice features:', error);
      return { overallSimilarity: 0, confidence: 0, details: {} };
    }
  }

  /**
   * Calculate fingerprint similarity using cosine similarity
   */
  calculateFingerprintSimilarity(fp1, fp2) {
    if (fp1.length !== fp2.length) return 0;
    
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;
    
    for (let i = 0; i < fp1.length; i++) {
      dotProduct += fp1[i] * fp2[i];
      magnitude1 += fp1[i] * fp1[i];
      magnitude2 += fp2[i] * fp2[i];
    }
    
    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);
    
    if (magnitude1 === 0 || magnitude2 === 0) return 0;
    
    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * Calculate confidence based on feature similarity consistency
   */
  calculateConfidence(similarities) {
    const mean = similarities.reduce((a, b) => a + b, 0) / similarities.length;
    const variance = similarities.reduce((sum, sim) => sum + Math.pow(sim - mean, 2), 0) / similarities.length;
    
    // Higher confidence when similarities are consistent (low variance)
    const consistency = Math.max(0, 1 - variance);
    
    // Combine mean similarity with consistency
    return (mean * 0.7) + (consistency * 0.3);
  }

  /**
   * Register voice profile with multiple samples
   */
  async registerVoiceProfile(voiceSamples) {
    try {
      const allFeatures = [];
      
      for (const sample of voiceSamples) {
        const features = await this.extractVoiceFeatures(sample);
        allFeatures.push(features);
      }
      
      // Create averaged profile
      const profile = this.createAveragedProfile(allFeatures);
      
      return {
        success: true,
        profile: profile,
        sampleCount: voiceSamples.length
      };
    } catch (error) {
      console.error('Error registering voice profile:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create averaged voice profile from multiple samples
   */
  createAveragedProfile(featuresArray) {
    const profile = {
      rmsEnergy: 0,
      zeroCrossingRate: 0,
      spectralCentroid: 0,
      audioFingerprint: new Array(32).fill(0),
      sampleCount: featuresArray.length,
      createdAt: new Date().toISOString()
    };
    
    // Average all features
    for (const features of featuresArray) {
      profile.rmsEnergy += features.rmsEnergy;
      profile.zeroCrossingRate += features.zeroCrossingRate;
      profile.spectralCentroid += features.spectralCentroid;
      
      for (let i = 0; i < 32; i++) {
        profile.audioFingerprint[i] += features.audioFingerprint[i];
      }
    }
    
    // Divide by sample count to get averages
    const count = featuresArray.length;
    profile.rmsEnergy /= count;
    profile.zeroCrossingRate /= count;
    profile.spectralCentroid /= count;
    
    for (let i = 0; i < 32; i++) {
      profile.audioFingerprint[i] /= count;
    }
    
    return profile;
  }

  /**
   * Verify voice against stored profile
   */
  async verifyVoice(audioBlob, storedProfile, threshold = 0.65) {
    try {
      const currentFeatures = await this.extractVoiceFeatures(audioBlob);
      const comparison = this.compareVoiceFeatures(storedProfile, currentFeatures);
      
      const isAuthenticated = comparison.overallSimilarity >= threshold;
      
      return {
        success: true,
        authenticated: isAuthenticated,
        similarity: comparison.overallSimilarity,
        confidence: comparison.confidence,
        threshold: threshold,
        details: comparison.details
      };
    } catch (error) {
      console.error('Error verifying voice:', error);
      return {
        success: false,
        authenticated: false,
        error: error.message
      };
    }
  }

  /**
   * Clean up resources
   */
  cleanup() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer);
      this.recordingTimer = null;
    }
    
    if (this.mediaRecorder && this.isRecording) {
      this.stopRecording();
    }
    
    this.audioBlob = null;
  }
}

// Export for use in extension
if (typeof module !== 'undefined' && module.exports) {
  module.exports = VoiceAuthentication;
} else {
  window.VoiceAuthentication = VoiceAuthentication;
}