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


if __name__ == '__main__':
    fixtures_dir = os.path.join(os.path.dirname(__file__))
    generate_sine_wav(os.path.join(fixtures_dir, '1kHz_sine.wav'), 1000)
    generate_dc_offset_wav(os.path.join(fixtures_dir, 'dc_offset.wav'), 0.004215)
    generate_silence_wav(os.path.join(fixtures_dir, 'silence.wav'))

    # Dual tone: 440Hz + 880Hz for frequency band testing
    generate_sine_wav(os.path.join(fixtures_dir, 'dual_tone.wav'))
    print(f'Generated WAV files in {fixtures_dir}')
