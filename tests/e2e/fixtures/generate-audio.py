"""Generate test WAV files for Playwright E2E audio testing."""
import struct
import math
import wave
import os


def generate_sine_wav(filename, frequency=1000, duration=1.0, sample_rate=44100):
    """Generate a sine wave WAV file at known frequency."""
    num_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            amplitude = math.sin(2 * math.pi * frequency * i / sample_rate)
            value = int(amplitude * 32767)
            wav_file.writeframes(struct.pack('<h', value))


def generate_dc_offset_wav(filename, value=0.004215, duration=1.0, sample_rate=44100):
    """Generate a constant DC offset WAV file."""
    num_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            value_int = int(value * 32767)
            wav_file.writeframes(struct.pack('<h', value_int))


def generate_silence_wav(filename, duration=1.0, sample_rate=44100):
    """Generate a silent WAV file."""
    num_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(b'\x00' * num_samples * 2)


def generate_glitch_wav(filename, duration=2.0, sample_rate=44100):
    """Generate a WAV file with sudden amplitude spikes (glitch artifacts).
    
    Creates a 440Hz sine wave with random sudden amplitude jumps of 50% probability.
    Each jump can be + or - 90% of max amplitude, simulating audio glitches.
    """
    num_samples = int(sample_rate * duration)
    base_freq = 440.0
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            # Base sine wave
            base = math.sin(2 * math.pi * base_freq * i / sample_rate)
            # Add glitch artifacts (20% probability per sample)
            glitch = 0.0
            if i % int(sample_rate * 0.01) < int(sample_rate * 0.002):  # Every ~20ms
                glitch = (1.0 if i % (int(sample_rate) * 2) < int(sample_rate) else -1.0) * 0.9
            amplitude = base + glitch
            value = int(amplitude * 32767)
            value = max(-32768, min(32767, value))  # Clamp
            wav_file.writeframes(struct.pack('<h', value))


def generate_frequency_sweep(filename, duration=2.0, sample_rate=44100, freq_start=20, freq_end=20000):
    """Generate a logarithmic frequency sweep (sine wave from freq_start to freq_end).
    
    Used for testing frequency band detection accuracy.
    """
    num_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            # Logarithmic frequency sweep
            t = i / sample_rate
            progress = t / duration
            # log sweep: f(t) = freq_start * (freq_end / freq_start) ^ progress
            current_freq = freq_start * (freq_end / freq_start) ** progress
            amplitude = math.sin(2 * math.pi * current_freq * t)
            value = int(amplitude * 32767)
            value = max(-32768, min(32767, value))
            wav_file.writeframes(struct.pack('<h', value))


def generate_high_freq_noise(filename, duration=1.0, sample_rate=44100):
    """Generate high-frequency noise (12kHz - 18kHz) for glitch detection testing.
    
    High frequency content should trigger the highFreqAnomaly detector.
    """
    num_samples = int(sample_rate * duration)
    with wave.open(filename, 'w') as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for i in range(num_samples):
            # Mix of 12kHz, 15kHz, 18kHz sine waves
            t = i / sample_rate
            noise = (
                0.4 * math.sin(2 * math.pi * 12000 * t) +
                0.3 * math.sin(2 * math.pi * 15000 * t) +
                0.3 * math.sin(2 * math.pi * 18000 * t)
            )
            value = int(noise * 32767)
            value = max(-32768, min(32767, value))
            wav_file.writeframes(struct.pack('<h', value))


if __name__ == '__main__':
    fixtures_dir = os.path.join(os.path.dirname(__file__))
    generate_sine_wav(os.path.join(fixtures_dir, '1kHz_sine.wav'), 1000)
    generate_dc_offset_wav(os.path.join(fixtures_dir, 'dc_offset.wav'), 0.004215)
    generate_silence_wav(os.path.join(fixtures_dir, 'silence.wav'))
    generate_glitch_wav(os.path.join(fixtures_dir, 'glitch.wav'), 2.0)
    generate_frequency_sweep(os.path.join(fixtures_dir, 'freq_sweep.wav'), 2.0)
    generate_high_freq_noise(os.path.join(fixtures_dir, 'high_freq_noise.wav'), 1.0)

    # Dual tone: 440Hz + 880Hz for frequency band testing
    generate_sine_wav(os.path.join(fixtures_dir, 'dual_tone.wav'))
    print(f'Generated WAV files in {fixtures_dir}')
