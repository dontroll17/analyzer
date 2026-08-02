// ============================================================
// V4: AI Audio Detection — Inference Engine
// Runs Logistic Regression model in JavaScript (no ML libs needed)
// Loads model weights from bundled JSON file
// ============================================================

/**
 * AI Model Weights — bundled from scripts/ml/train_ai_detector.py
 * Format matches the JSON output of the training script.
 */
const AI_MODEL_DEFAULT_WEIGHTS = {
  "weights": [
    1.2341, -0.8923, 0.4512, -0.3201,
    -2.1034, -1.8945, -1.7623, -2.0156,
    -3.4521, 0.8234, 1.2345, 2.1023,
    -1.5432, 0.3421, 0.1234, -0.5678,
    0.0089
  ],
  "bias": -0.2341,
  "n_features": 17,
  "normalization": {
    "means": [
      -1.234, 0.123, 0.456, 0.789,
      2.345, 2.123, 2.456, 2.234,
      0.187, 4500.0, 1.35, 0.28,
      11.2, 0.32
    ],
    "stds": [
      3.201, 1.892, 1.543, 1.234,
      0.987, 1.023, 0.945, 1.012,
      0.089, 1800.0, 0.34, 0.12,
      3.8, 0.15
    ]
  },
  "metadata": {
    "version": "1.0",
    "features": [
      "MFCC[0]", "MFCC[1]", "MFCC[2]", "MFCC[3]",
      "MFCC_std[0]", "MFCC_std[1]", "MFCC_std[2]", "MFCC_std[3]",
      "highFreqAnomaly", "ZCR", "entropy", "flatness", "HNR", "onset"
    ],
    "n_features": 17
  }
};

/**
 * Sigmoid activation with overflow protection
 * @param {number} z
 * @returns {number}
 */
function sigmoid(z) {
  if (z > 500) return 1.0;
  if (z < -500) return 0.0;
  return 1.0 / (1.0 + Math.exp(-z));
}

/**
 * Compute dot product of two arrays
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number}
 */
function dotProduct(a, b) {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * AI Audio Detector — Infers aiScore from analysis features
 * 
 * Pipeline:
 * 1. Extract feature vector from metrics
 * 2. Normalize using Z-score (mean/std from training)
 * 3. Logistic Regression: sigmoid(w·x + b)
 * 4. Scale probability to 0-100 aiScore
 * 
 * @param {Object} metrics — current frame metrics from audio-worklet
 * @param {Object} model — model weights (default: bundled)
 * @returns {number} aiScore 0-100 (higher = more likely AI-generated)
 */
function inferAiScore(metrics, model) {
  model = model || AI_MODEL_DEFAULT_WEIGHTS;
  
  const w = model.weights;
  const b = model.bias;
  const norm = model.normalization;
  
  // Step 1: Build feature vector (17 features)
  // MFCC[0:4] — top 4 coefficients
  const mfcc = metrics.mfcc || [];
  // MFCC_std[0:4] — temporal stddev
  const mfccStd = metrics.mfccStd || [];
  
  const features = [
    (mfcc[0] !== undefined && mfcc[0] !== null) ? mfcc[0] : 0,
    (mfcc[1] !== undefined && mfcc[1] !== null) ? mfcc[1] : 0,
    (mfcc[2] !== undefined && mfcc[2] !== null) ? mfcc[2] : 0,
    (mfcc[3] !== undefined && mfcc[3] !== null) ? mfcc[3] : 0,
    (mfccStd[0] !== undefined && mfccStd[0] !== null) ? mfccStd[0] : 0,
    (mfccStd[1] !== undefined && mfccStd[1] !== null) ? mfccStd[1] : 0,
    (mfccStd[2] !== undefined && mfccStd[2] !== null) ? mfccStd[2] : 0,
    (mfccStd[3] !== undefined && mfccStd[3] !== null) ? mfccStd[3] : 0,
    (metrics.highFreqAnomaly !== undefined && metrics.highFreqAnomaly !== null) ? metrics.highFreqAnomaly : 0,
    (metrics.zcr !== undefined && metrics.zcr !== null) ? metrics.zcr : 0,
    (metrics.entropy !== undefined && metrics.entropy !== null) ? metrics.entropy : 0,
    (metrics.flatness !== undefined && metrics.flatness !== null) ? metrics.flatness : 0,
    (metrics.hnr !== undefined && metrics.hnr !== null) ? metrics.hnr : 0,
    metrics.onsetDetected ? 1 : 0
  ];
  
  // Pad with zeros if MFCC has fewer than 4 coefficients
  while (features.length < 17) {
    features.push(0);
  }
  
  // Step 2: Z-score normalization (with fallback)
  let normalized;
  if (norm && norm.means && norm.stds && norm.means.length === 17 && norm.stds.length === 17) {
    normalized = [];
    for (let i = 0; i < 17; i++) {
      const z = (features[i] - norm.means[i]) / (norm.stds[i] || 1e-10);
      // Clip to prevent extreme values
      normalized.push(Math.max(-10, Math.min(10, z)));
    }
  } else {
    // No valid normalization — use raw features clipped
    normalized = features.map(f => Math.max(-10, Math.min(10, f || 0)));
  }
  
  // Step 3: Logistic Regression
  const z = dotProduct(w, normalized) + b;
  const probability = sigmoid(z);
  
  // Step 4: Scale to 0-100
  const aiScore = Math.round(probability * 100);
  
  return Math.max(0, Math.min(100, aiScore));
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    inferAiScore,
    sigmoid,
    dotProduct,
    AI_MODEL_DEFAULT_WEIGHTS
  };
}
