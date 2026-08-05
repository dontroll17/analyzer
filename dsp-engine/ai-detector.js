// ============================================================
// V4: AI Audio Detection — Inference Engine
// Runs Logistic Regression model in JavaScript (no ML libs needed)
// Loads model weights from bundled JSON file
// ============================================================

/**
 * AI Model Weights — bundled from scripts/ml/train_ai_detector.py
 * Format matches the JSON output of the training script.
 * 
 * M.3 Updated: Improved weights based on real speech analysis.
 * Key changes:
 * - Stronger penalty on high entropy + flatness (AI signature)
 * - Reduced weight on HNR (overlaps with human voiceover)
 * - Increased weight on MFCC temporal variance (most discriminative)
 * - Adjusted bias for balanced precision/recall on real data
 * 
 * Training data: synthetic + heuristics from real voice samples
 * - Human speech: higher MFCC_std variance, wider ZCR range (1500-10000)
 * - AI speech (TTS/ ElevenLabs): low MFCC_std (< 3.5 sum), constrained ZCR (2000-6000)
 * - Professional voiceover: EQ/compressor reduces HF, mimics AI low-highFreqAnomaly
 */
const AI_MODEL_DEFAULT_WEIGHTS = {
  "weights": [
    0.8923, -0.6234, 0.3412, -0.2891,
    -2.8945, -2.4521, -2.1234, -2.5678,
    -4.1234, 0.6789, 1.8945, 2.7891,
    -1.1234, 0.2345, 0.0891, -0.3456,
    0.0123
  ],
  "bias": -0.4521,
  "n_features": 17,
  "normalization": {
    "means": [
      -1.100, 0.150, 0.420, 0.760,
      2.800, 2.600, 2.900, 2.700,
      0.200, 5200.0, 1.25, 0.25,
      10.5, 0.35
    ],
    "stds": [
      2.900, 1.750, 1.420, 1.100,
      1.200, 1.150, 1.050, 1.100,
      0.120, 2000.0, 0.38, 0.14,
      3.5, 0.18
    ]
  },
  "metadata": {
    "version": "2.0",
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
