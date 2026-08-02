#!/usr/bin/env python3
"""
V4.5: AI Audio Detector — Logistic Regression Training Script

Trains a lightweight Logistic Regression model to classify audio as
human-generated vs AI-generated based on MFCC features and temporal statistics.

Features used (17 total):
  - MFCC[0:4]         → First 4 MFCC coefficients (energy envelope shape)
  - MFCC_std[0:4]     → Temporal stddev of MFCC coefficients
  - highFreqAnomaly   → High-frequency energy ratio
  - zcr               → Zero crossing rate
  - entropy           → Band entropy (4-band)
  - flatness          → Spectral flatness
  - hnr               → Harmonic-to-noise ratio
  - onsetDetected     → Onset detection (0/1)

Training data is synthetically generated to simulate:
  - Human speech/audio: variable MFCC, high temporal variance, moderate ZCR
  - AI-generated audio: smooth MFCC, low temporal variance, constrained ZCR

Usage:
  python scripts/ml/train_ai_detector.py [--epochs 1000] [--output path/to/weights.json]

Outputs:
  - dsp-engine/ai-model-weights.json (bundleable in Chrome extension)
"""

import json
import math
import os
import sys
import argparse
import random

# ============================================================
# Numpy-free implementations (for environments without ML libs)
# ============================================================

def dot(a, b):
    """Dot product of two lists."""
    return sum(x * y for x, y in zip(a, b))

def sigmoid(z):
    """Sigmoid activation with overflow protection."""
    if z > 500: return 1.0
    if z < -500: return 0.0
    return 1.0 / (1.0 + math.exp(-z))

class LogisticRegression:
    """Simple Logistic Regression with SGD."""
    
    def __init__(self, n_features, lr=0.1, reg=0.01):
        self.weights = [0.0] * n_features
        self.bias = 0.0
        self.lr = lr
        self.reg = reg
    
    def predict_proba(self, x):
        z = dot(self.weights, x) + self.bias
        return sigmoid(z)
    
    def predict(self, x, threshold=0.5):
        return 1 if self.predict_proba(x) >= threshold else 0
    
    def fit(self, X, y, epochs=1000, lr=None):
        """Train with stochastic gradient descent."""
        n = len(X)
        if n == 0:
            raise ValueError("Training data is empty")
        
        if lr is None:
            lr = self.lr
        
        for epoch in range(epochs):
            # Shuffle data
            indices = list(range(n))
            random.shuffle(indices)
            
            total_loss = 0.0
            for idx in indices:
                x = X[idx]
                label = y[idx]
                
                pred = self.predict_proba(x)
                error = pred - label
                
                # Update weights
                for i in range(len(self.weights)):
                    grad = error * x[i] + self.reg * self.weights[i]
                    self.weights[i] -= lr * grad
                
                self.bias -= lr * error
                
                # Binary cross-entropy loss
                eps = 1e-15
                pred_clipped = max(min(pred, 1 - eps), eps)
                loss = -(label * math.log(pred_clipped) + (1 - label) * math.log(1 - pred_clipped))
                total_loss += loss
            
            avg_loss = total_loss / n
            
            # Print progress
            if (epoch + 1) % 100 == 0 or epoch == 0:
                print(f"  Epoch {epoch+1}/{epochs}: loss={avg_loss:.4f}, lr={lr:.4f}")
    
    def to_dict(self):
        return {
            "weights": self.weights,
            "bias": self.bias,
            "n_features": len(self.weights),
            "version": "1.0"
        }
    
    @classmethod
    def from_dict(cls, d):
        model = cls(n_features=d["n_features"], lr=0.1, reg=0.01)
        model.weights = d["weights"]
        model.bias = d["bias"]
        return model


# ============================================================
# Synthetic Data Generation
# ============================================================

def generate_human_sample(seed=None):
    """
    Generate synthetic feature vector for human-generated audio.
    Characteristics: high temporal variance, diverse MFCC, moderate ZCR.
    """
    if seed is not None:
        random.seed(seed)
    
    # MFCC coefficients: diverse, varying envelope
    mfcc = [random.gauss(0, 5) for _ in range(4)]
    mfcc[0] = random.gauss(-2, 3)  # DC component: varies widely
    
    # Temporal stddev: HIGH (speech has natural variation)
    mfcc_std = [abs(random.gauss(2.5, 1.0)) for _ in range(4)]
    
    # High-frequency anomaly: moderate (real audio has HF content)
    highFreqAnomaly = random.uniform(0.1, 0.35)
    
    # ZCR: moderate (human speech has natural zero crossings)
    zcr = random.uniform(2000, 8000)
    
    # Entropy: variable (speech entropy varies by phoneme)
    entropy = random.uniform(0.8, 2.0)
    
    # Flatness: low-moderate (speech is tonal, not noise-like)
    flatness = random.uniform(0.1, 0.4)
    
    # HNR: moderate-high (human voice has good harmonic structure)
    hnr = random.gauss(10, 4)
    hnr = max(0, hnr)
    
    # Onset detection: variable
    onsetDetected = 1 if random.random() > 0.6 else 0
    
    features = mfcc + mfcc_std + [highFreqAnomaly, zcr, entropy, flatness, hnr, onsetDetected]
    return features, 1  # label=1 for human


def generate_ai_sample(seed=None):
    """
    Generate synthetic feature vector for AI-generated audio.
    Characteristics: smooth MFCC, low temporal variance, constrained ZCR.
    """
    if seed is not None:
        random.seed(seed)
    
    # MFCC coefficients: smoother, less variation
    mfcc = [random.gauss(0, 2) for _ in range(4)]
    mfcc[0] = random.gauss(-1.5, 1.0)  # DC: more consistent
    
    # Temporal stddev: LOW (AI audio is unnaturally smooth)
    mfcc_std = [abs(random.gauss(0.8, 0.3)) for _ in range(4)]
    
    # High-frequency anomaly: LOW (AI models often lack extreme HF)
    highFreqAnomaly = random.uniform(0.02, 0.15)
    
    # ZCR: constrained (AI audio has smoother waveforms)
    zcr = random.uniform(2500, 5500)
    
    # Entropy: mid-range (AI audio has balanced but artificial spectra)
    entropy = random.uniform(1.0, 1.8)
    
    # Flatness: slightly higher (AI spectra are more uniform)
    flatness = random.uniform(0.25, 0.5)
    
    # HNR: high but inconsistent (AI voice quality varies)
    hnr = random.gauss(14, 3)
    hnr = max(0, hnr)
    
    # Onset detection: less variable
    onsetDetected = 1 if random.random() > 0.75 else 0
    
    features = mfcc + mfcc_std + [highFreqAnomaly, zcr, entropy, flatness, hnr, onsetDetected]
    return features, 0  # label=0 for AI


# ============================================================
# Feature Normalization
# ============================================================

def compute_stats(X):
    """Compute mean and std for each feature dimension."""
    n = len(X)
    n_features = len(X[0]) if X else 0
    
    means = [0.0] * n_features
    for x in X:
        for i in range(n_features):
            means[i] += x[i]
    means = [m / n for m in means]
    
    stds = [0.0] * n_features
    for x in X:
        for i in range(n_features):
            stds[i] += (x[i] - means[i]) ** 2
    stds = [math.sqrt(s / n) + 1e-10 for s in stds]  # +epsilon to avoid div-by-zero
    
    return means, stds


def normalize(X, means, stds):
    """Z-score normalization."""
    n = len(X)
    n_features = len(X[0])
    return [
        [(x[i] - means[i]) / stds[i] for i in range(n_features)]
        for x in X
    ]


# ============================================================
# Evaluation
# ============================================================

def evaluate(model, X, y):
    """Compute accuracy on test set."""
    correct = 0
    for i in range(len(X)):
        pred = model.predict(X[i])
        if pred == y[i]:
            correct += 1
    return correct / len(X) if X else 0


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="Train AI audio detection model")
    parser.add_argument("--samples", type=int, default=2000,
                       help="Number of synthetic samples per class")
    parser.add_argument("--epochs", type=int, default=1000,
                       help="Number of training epochs")
    parser.add_argument("--lr", type=float, default=0.5,
                       help="Learning rate")
    parser.add_argument("--output", type=str, default=None,
                       help="Output path for model weights JSON")
    args = parser.parse_args()
    
    print("=" * 60)
    print("V4 AI Audio Detector — Training Pipeline")
    print("=" * 60)
    
    # Generate synthetic training data
    print(f"\n[1/4] Generating {args.samples} samples per class...")
    random.seed(42)
    
    X_human = []
    y_human = []
    for i in range(args.samples):
        features, label = generate_human_sample(seed=i)
        X_human.append(features)
        y_human.append(label)
    
    X_ai = []
    y_ai = []
    for i in range(args.samples):
        features, label = generate_ai_sample(seed=args.samples + i)
        X_ai.append(features)
        y_ai.append(label)
    
    X = X_human + X_ai
    y = y_human + y_ai
    random.shuffle(list(zip(X, y)))  # Shuffle together
    
    # Re-sort after shuffle
    X = [item[0] for item in zip(X, y)]
    y = [item[1] for item in zip(X, y)]
    
    print(f"  Total samples: {len(X)}")
    print(f"  Features: {len(X[0])}")
    print(f"  Class 0 (AI): {sum(1 for yi in y if yi == 0)}")
    print(f"  Class 1 (Human): {sum(1 for yi in y if yi == 1)}")
    
    # Split train/test (80/20)
    split = int(len(X) * 0.8)
    X_train, X_test = X[:split], X[split:]
    y_train, y_test = y[:split], y[split:]
    print(f"\n[2/4] Train: {len(X_train)}, Test: {len(X_test)}")
    
    # Normalize features
    print("\n[3/4] Normalizing features (Z-score)...")
    means, stds = compute_stats(X_train)
    X_train_norm = normalize(X_train, means, stds)
    X_test_norm = normalize(X_test, means, stds)
    
    # Train model
    print(f"\n[4/4] Training Logistic Regression ({args.epochs} epochs, lr={args.lr})...")
    model = LogisticRegression(n_features=17, lr=args.lr, reg=0.001)
    model.fit(X_train_norm, y_train, epochs=args.epochs, lr=args.lr)
    
    # Evaluate
    train_acc = evaluate(model, X_train_norm, y_train)
    test_acc = evaluate(model, X_test_norm, y_test)
    
    print(f"\n{'=' * 60}")
    print(f"RESULTS")
    print(f"{'=' * 60}")
    print(f"  Train accuracy: {train_acc:.2%}")
    print(f"  Test accuracy:  {test_acc:.2%}")
    
    # Feature importance (absolute weights)
    print(f"\n  Feature importance (|weight|):")
    feature_names = [
        "MFCC[0]", "MFCC[1]", "MFCC[2]", "MFCC[3]",
        "MFCC_std[0]", "MFCC_std[1]", "MFCC_std[2]", "MFCC_std[3]",
        "highFreqAnomaly", "ZCR", "entropy", "flatness", "HNR", "onset"
    ]
    for i, name in enumerate(feature_names):
        print(f"    {name:20s}: {model.weights[i]:+.4f}")
    
    # Save model weights
    output_path = args.output
    if output_path is None:
        # Default: bundle in extension
        output_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "dsp-engine", "ai-model-weights.json"
        )
    
    model_dict = model.to_dict()
    
    # Add normalization stats
    model_dict["normalization"] = {
        "means": means,
        "stds": stds
    }
    
    # Add metadata
    model_dict["metadata"] = {
        "version": "1.0",
        "features": feature_names,
        "n_features": 17,
        "training_samples": len(X_train),
        "test_samples": len(X_test),
        "train_accuracy": round(train_acc, 4),
        "test_accuracy": round(test_acc, 4),
        "epochs": args.epochs,
        "learning_rate": args.lr
    }
    
    with open(output_path, "w") as f:
        json.dump(model_dict, f, indent=2)
    
    print(f"\n  Model saved to: {output_path}")
    print(f"{'=' * 60}")
    
    return 0 if test_acc >= 0.75 else 1


if __name__ == "__main__":
    sys.exit(main())
