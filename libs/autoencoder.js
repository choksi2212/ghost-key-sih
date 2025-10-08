/**
 * SimpleAutoencoder for Ghost Key Universal Extension
 * Ported from the main Ghost Key project's API routes for compatibility
 * Implements neural network autoencoder for keystroke biometric authentication
 * 
 * This is essentially the same autoencoder we use on the server-side, but adapted
 * for client-side execution in browser extensions or standalone applications
 */

// Authentication configuration constants - mirrors server-side settings
const BIOMETRIC_AUTH_CONFIG = {
  REQUIRED_PASSWORD_LENGTH: 8,        // Minimum password length for good biometric signal
  MINIMUM_TRAINING_SAMPLES: 5,        // Need at least 5 samples for reliable training
  DATA_AUGMENTATION_NOISE: 0.1,       // 10% noise level for synthetic sample generation
  SAMPLE_AUGMENTATION_MULTIPLIER: 3,  // Create 3x more samples through augmentation
  DEFAULT_AUTH_THRESHOLD: 0.03        // Base threshold for authentication decisions
};

/**
 * Simple autoencoder neural network implementation
 * Ported directly from the main Ghost Key project for consistency
 * 
 * Architecture: Input -> Hidden Layer (ReLU) -> Bottleneck (ReLU) -> Output (Linear)
 * This creates a compressed representation that can detect typing pattern anomalies
 */
class SimpleAutoencoder {
  constructor(inputFeatureCount, hiddenLayerSize = 16, compressionSize = 8) {
    this.inputFeatureCount = inputFeatureCount;
    this.hiddenLayerSize = hiddenLayerSize;
    this.compressionSize = compressionSize;

    // Initialize neural network weights using Xavier initialization for better training
    this.encoderWeights = this.initializeWeightMatrix(inputFeatureCount, hiddenLayerSize);
    this.bottleneckWeights = this.initializeWeightMatrix(hiddenLayerSize, compressionSize);
    this.decoderWeights = this.initializeWeightMatrix(compressionSize, inputFeatureCount);

    // Initialize biases with small random values
    this.encoderBiases = new Array(hiddenLayerSize).fill(0).map(() => Math.random() * 0.1 - 0.05);
    this.bottleneckBiases = new Array(compressionSize).fill(0).map(() => Math.random() * 0.1 - 0.05);
    this.decoderBiases = new Array(inputFeatureCount).fill(0).map(() => Math.random() * 0.1 - 0.05);
  }

  // Xavier/Glorot weight initialization - helps with gradient flow during training
  initializeWeightMatrix(inputSize, outputSize) {
    const weightMatrix = [];
    const initializationScale = Math.sqrt(6 / (inputSize + outputSize)); // Xavier initialization formula
    for (let i = 0; i < inputSize; i++) {
      weightMatrix[i] = [];
      for (let j = 0; j < outputSize; j++) {
        weightMatrix[i][j] = Math.random() * 2 * initializationScale - initializationScale;
      }
    }
    return weightMatrix;
  }

  // ReLU activation function - helps prevent vanishing gradients
  reluActivation(x) {
    return Math.max(0, x);
  }

  // Forward pass through the autoencoder network
  forwardPass(inputFeatures) {
    // Validate that biases are properly initialized
    if (!this.encoderBiases || !this.bottleneckBiases || !this.decoderBiases) {
      throw new Error("Autoencoder biases are not properly initialized");
    }
    
    // Layer 1: Input to hidden layer (encoding)
    const hiddenLayerOutput = new Array(this.hiddenLayerSize);
    for (let j = 0; j < this.hiddenLayerSize; j++) {
      let weightedSum = this.encoderBiases[j] || 0;
      for (let i = 0; i < this.inputFeatureCount; i++) {
        weightedSum += inputFeatures[i] * this.encoderWeights[i][j];
      }
      hiddenLayerOutput[j] = this.reluActivation(weightedSum);
    }

    // Layer 2: Hidden to bottleneck layer (compression)
    const bottleneckOutput = new Array(this.compressionSize);
    for (let j = 0; j < this.compressionSize; j++) {
      let weightedSum = this.bottleneckBiases[j] || 0;
      for (let i = 0; i < this.hiddenLayerSize; i++) {
        weightedSum += hiddenLayerOutput[i] * this.bottleneckWeights[i][j];
      }
      bottleneckOutput[j] = this.reluActivation(weightedSum);
    }

    // Layer 3: Bottleneck to output layer (reconstruction)
    const reconstructedOutput = new Array(this.inputFeatureCount);
    for (let j = 0; j < this.inputFeatureCount; j++) {
      let weightedSum = this.decoderBiases[j] || 0;
      for (let i = 0; i < this.compressionSize; i++) {
        weightedSum += bottleneckOutput[i] * this.decoderWeights[i][j];
      }
      reconstructedOutput[j] = weightedSum; // Linear activation for output layer
    }

    return reconstructedOutput;
  }

  // Prediction method for inference - just calls forward pass
  predict(inputFeatures) {
    return this.forwardPass(inputFeatures);
  }

  // Main training loop - implements gradient descent with data shuffling
  trainNetwork(trainingData, epochs = 200, learningRate = 0.01) {
    const trainingLosses = [];
    console.log(`Training autoencoder with ${trainingData.length} samples for ${epochs} epochs...`);

    for (let currentEpoch = 0; currentEpoch < epochs; currentEpoch++) {
      let epochTotalLoss = 0;

      // Shuffle data each epoch for better training
      const shuffledData = [...trainingData].sort(() => Math.random() - 0.5);

      for (const trainingSample of shuffledData) {
        // Forward pass to get reconstruction
        const reconstructedSample = this.forwardPass(trainingSample);

        // Calculate reconstruction error (mean squared error)
        let sampleLoss = 0;
        for (let i = 0; i < trainingSample.length; i++) {
          const reconstructionError = trainingSample[i] - reconstructedSample[i];
          sampleLoss += reconstructionError * reconstructionError;
        }
        sampleLoss /= trainingSample.length;
        epochTotalLoss += sampleLoss;

        // Backward pass - update weights based on reconstruction error
        this.performBackpropagation(trainingSample, reconstructedSample, learningRate);
      }

      const averageEpochLoss = epochTotalLoss / shuffledData.length;
      trainingLosses.push(averageEpochLoss);

      // Log training progress periodically
      if (currentEpoch % 50 === 0 || currentEpoch === epochs - 1) {
        console.log(`Epoch ${currentEpoch + 1}/${epochs}, Loss: ${averageEpochLoss.toFixed(6)}`);
      }
    }

    return trainingLosses;
  }

  // Simplified backpropagation for weight updates
  // Note: This is a basic implementation - production systems would use more sophisticated methods
  performBackpropagation(targetOutput, actualOutput, learningRate) {
    // Calculate output layer gradients (error derivatives)
    const outputGradients = [];
    for (let i = 0; i < targetOutput.length; i++) {
      outputGradients[i] = 2 * (actualOutput[i] - targetOutput[i]) / targetOutput.length;
    }

    // Update decoder weights and biases (output layer)
    for (let i = 0; i < this.compressionSize; i++) {
      for (let j = 0; j < this.inputFeatureCount; j++) {
        // Note: In a full implementation, we'd need the bottleneck activations here
        // This is simplified for demonstration purposes
        this.decoderWeights[i][j] -= learningRate * outputGradients[j] * 0.1;
      }
    }

    for (let j = 0; j < this.inputFeatureCount; j++) {
      this.decoderBiases[j] -= learningRate * outputGradients[j];
    }

    // Apply weight decay to prevent overfitting
    const weightDecay = 0.0001;
    
    // Update encoder weights with small random adjustments
    for (let i = 0; i < this.inputFeatureCount; i++) {
      for (let j = 0; j < this.hiddenLayerSize; j++) {
        this.encoderWeights[i][j] *= (1 - weightDecay);
        this.encoderWeights[i][j] += (Math.random() - 0.5) * learningRate * 0.01;
      }
    }

    // Update bottleneck weights with small random adjustments
    for (let i = 0; i < this.hiddenLayerSize; i++) {
      for (let j = 0; j < this.compressionSize; j++) {
        this.bottleneckWeights[i][j] *= (1 - weightDecay);
        this.bottleneckWeights[i][j] += (Math.random() - 0.5) * learningRate * 0.01;
      }
    }
  }

  // Serialize the trained model for storage or transmission
  serialize() {
    return {
      inputSize: this.inputFeatureCount,
      hiddenSize: this.hiddenLayerSize,
      bottleneckSize: this.compressionSize,
      weights1: this.encoderWeights,
      weights2: this.bottleneckWeights,
      weights3: this.decoderWeights,
      biases1: this.encoderBiases,
      biases2: this.bottleneckBiases,
      biases3: this.decoderBiases
    };
  }

  // Restore a trained model from serialized data
  static deserialize(serializedData) {
    const autoencoder = new SimpleAutoencoder(serializedData.inputSize, serializedData.hiddenSize, serializedData.bottleneckSize);
    
    autoencoder.encoderWeights = serializedData.weights1;
    autoencoder.bottleneckWeights = serializedData.weights2;
    autoencoder.decoderWeights = serializedData.weights3;
    
    // Initialize biases with zeros if they don't exist in saved data (for backward compatibility)
    autoencoder.encoderBiases = serializedData.biases1 || new Array(serializedData.hiddenSize).fill(0);
    autoencoder.bottleneckBiases = serializedData.biases2 || new Array(serializedData.bottleneckSize).fill(0);
    autoencoder.decoderBiases = serializedData.biases3 || new Array(serializedData.inputSize).fill(0);

    return autoencoder;
  }
}

/**
 * Feature normalization utilities
 * Ported from the main Ghost Key project for consistency
 * Essential for neural network training - features must be in [0,1] range
 */
function normalizeKeystrokeFeatures(featureArrays) {
  if (featureArrays.length === 0) {
    throw new Error('Cannot normalize empty feature dataset');
  }

  const numberOfFeatures = featureArrays[0].length;
  const minValues = new Array(numberOfFeatures).fill(Infinity);
  const maxValues = new Array(numberOfFeatures).fill(-Infinity);

  // Find min and max values for each feature across all samples
  for (const featureSample of featureArrays) {
    for (let i = 0; i < numberOfFeatures; i++) {
      if (featureSample[i] < minValues[i]) minValues[i] = featureSample[i];
      if (featureSample[i] > maxValues[i]) maxValues[i] = featureSample[i];
    }
  }

  // Normalize all features to [0, 1] range
  const normalizedFeatures = featureArrays.map(featureSample =>
    featureSample.map((value, i) => {
      const featureRange = maxValues[i] - minValues[i];
      return featureRange === 0 ? 0 : (value - minValues[i]) / featureRange;
    })
  );

  return { normalized: normalizedFeatures, min: minValues, max: maxValues };
}

/**
 * Add realistic noise to samples for data augmentation
 * Helps create more training data and improves model robustness
 * Ported from the main Ghost Key project
 */
function addRealisticNoise(originalSample, noiseIntensity = BIOMETRIC_AUTH_CONFIG.DATA_AUGMENTATION_NOISE) {
  return originalSample.map(featureValue => {
    // Add proportional noise to simulate natural typing variations
    const randomNoise = (Math.random() - 0.5) * 2 * noiseIntensity * featureValue;
    return Math.max(0, featureValue + randomNoise); // Ensure non-negative values
  });
}

/**
 * Complete training pipeline for keystroke biometric models
 * Handles data augmentation, normalization, training, and threshold calculation
 * Ported from the main Ghost Key project's train-model route
 */
async function trainKeystrokeBiometricModel(trainingSamples, customThreshold = null) {
  if (trainingSamples.length < BIOMETRIC_AUTH_CONFIG.MINIMUM_TRAINING_SAMPLES) {
    throw new Error(`Need at least ${BIOMETRIC_AUTH_CONFIG.MINIMUM_TRAINING_SAMPLES} samples for reliable training`);
  }

  console.log(`Training keystroke biometric model with ${trainingSamples.length} original samples...`);

  // Data augmentation phase - create synthetic samples by adding realistic noise
  const augmentedDataset = [];
  trainingSamples.forEach((originalSample) => {
    augmentedDataset.push(originalSample); // Include the original sample

    // Generate augmented samples with realistic noise variations
    for (let i = 0; i < BIOMETRIC_AUTH_CONFIG.SAMPLE_AUGMENTATION_MULTIPLIER; i++) {
      augmentedDataset.push(addRealisticNoise(originalSample));
    }
  });

  // Feature normalization - essential for neural network training
  const { normalized, min, max } = normalizeKeystrokeFeatures(augmentedDataset);

  // Create and configure the autoencoder neural network
  const inputDimensionality = normalized[0].length;
  const autoencoderModel = new SimpleAutoencoder(inputDimensionality, 16, 8);

  console.log("Training autoencoder neural network...");
  const trainingLossHistory = autoencoderModel.trainNetwork(normalized, 200, 0.01);

  // Evaluate model performance on original (non-augmented) samples
  const originalNormalizedSamples = trainingSamples.map((sample) =>
    sample.map((value, i) => {
      const featureRange = max[i] - min[i];
      return featureRange === 0 ? 0 : (value - min[i]) / featureRange;
    })
  );

  const reconstructionErrors = [];
  for (const normalizedSample of originalNormalizedSamples) {
    const reconstructedSample = autoencoderModel.predict(normalizedSample);
    let meanSquaredError = 0;
    for (let i = 0; i < normalizedSample.length; i++) {
      const difference = normalizedSample[i] - reconstructedSample[i];
      meanSquaredError += difference * difference;
    }
    meanSquaredError /= normalizedSample.length;
    reconstructionErrors.push(meanSquaredError);
  }

  // Use custom threshold if provided, otherwise calculate using 95th percentile of training errors
  let calculatedThreshold;
  if (customThreshold !== null && customThreshold !== undefined) {
    calculatedThreshold = customThreshold;
    console.log(`Using custom threshold: ${calculatedThreshold.toFixed(6)} (provided: ${customThreshold})`);
  } else {
    const sortedErrors = [...reconstructionErrors].sort((a, b) => a - b);
    const percentile95Index = Math.floor(sortedErrors.length * 0.95);
    calculatedThreshold = Math.max(
      sortedErrors[percentile95Index] || BIOMETRIC_AUTH_CONFIG.DEFAULT_AUTH_THRESHOLD,
      BIOMETRIC_AUTH_CONFIG.DEFAULT_AUTH_THRESHOLD
    );
    console.log(`Calculated threshold from training data: ${calculatedThreshold.toFixed(6)}`);
  }

  const averageError = reconstructionErrors.reduce((a, b) => a + b, 0) / reconstructionErrors.length;
  const maximumError = Math.max(...reconstructionErrors);

  console.log(`Training complete. Threshold: ${calculatedThreshold.toFixed(6)}, Average Error: ${averageError.toFixed(6)}`);

  return {
    modelType: "autoencoder",
    autoencoder: autoencoderModel.serialize(),
    normalizationParams: { min, max },
    threshold: calculatedThreshold,
    trainingStats: {
      originalSampleCount: trainingSamples.length,
      augmentedSampleCount: augmentedDataset.length,
      averageError,
      maximumError,
      finalLosses: trainingLossHistory.slice(-10), // Keep last 10 loss values for analysis
    },
    createdAt: new Date().toISOString(),
    version: "1.0"
  };
}

/**
 * Authentication function that validates new features against a trained model
 * Compares reconstruction error against the learned threshold
 * Ported from the main Ghost Key project's authenticate route
 */
function authenticateKeystrokePattern(inputFeatures, trainedModelData) {
  if (trainedModelData.modelType !== "autoencoder" || !trainedModelData.autoencoder) {
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

  // Load and use the trained autoencoder
  const trainedAutoencoder = SimpleAutoencoder.deserialize(trainedModelData.autoencoder);

  // Get the autoencoder's reconstruction of the input
  const reconstructedFeatures = trainedAutoencoder.predict(normalizedInputFeatures);

  // Calculate reconstruction error (mean squared error)
  let reconstructionError = 0;
  for (let i = 0; i < normalizedInputFeatures.length; i++) {
    const featureDifference = normalizedInputFeatures[i] - reconstructedFeatures[i];
    reconstructionError += featureDifference * featureDifference;
  }
  reconstructionError /= normalizedInputFeatures.length;

  // Check against the learned authentication threshold
  const authenticationThreshold = trainedModelData.threshold;
  const authenticationSuccessful = reconstructionError <= authenticationThreshold;

  // Calculate confidence score based on how close we are to the threshold
  const maxExpectedError = trainedModelData.trainingStats?.maximumError || authenticationThreshold * 2;
  const confidenceLevel = Math.max(0, Math.min(1, 1 - reconstructionError / (maxExpectedError * 2)));

  // Create feature deviation visualization data (use first 10 features for heatmap)
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
}

// Export all classes and functions for use in browser environments
if (typeof module !== 'undefined' && module.exports) {
  // Node.js environment
  module.exports = {
    SimpleAutoencoder,
    normalizeKeystrokeFeatures,
    addRealisticNoise,
    trainKeystrokeBiometricModel,
    authenticateKeystrokePattern,
    BIOMETRIC_AUTH_CONFIG
  };
} else {
  // Browser environment - always expose to window
  console.log('Autoencoder.js: Exposing functions to window.GhostKeyML');
  
  window.GhostKeyML = {
    SimpleAutoencoder,
    normalizeKeystrokeFeatures,
    addRealisticNoise,
    trainKeystrokeBiometricModel,
    authenticateKeystrokePattern,
    BIOMETRIC_AUTH_CONFIG
  };
  
  // Debug: Log what was exposed
  console.log('Autoencoder.js: Functions exposed:');
  console.log('- SimpleAutoencoder:', typeof SimpleAutoencoder);
  console.log('- trainKeystrokeBiometricModel:', typeof trainKeystrokeBiometricModel);
  console.log('- authenticateKeystrokePattern:', typeof authenticateKeystrokePattern);
  console.log('- BIOMETRIC_AUTH_CONFIG:', !!BIOMETRIC_AUTH_CONFIG);
  
  // Dispatch ready event
  if (typeof document !== 'undefined') {
    console.log('Autoencoder.js: Dispatching GhostKeyMLReady event');
    document.dispatchEvent(new CustomEvent('GhostKeyMLReady'));
  }
}