// tests/capture-api.test.js - Tests for capture workflow (getDisplayMedia)
const {
  EFFECTS_DEFAULTS,
  THEME_COLORS,
  HISTORY_SIZE,
  THEME_CYCLE,
  SMOOTHING_FACTOR
} = require('./popup-testable.js');

describe('Capture API', () => {
  let mockMediaStream;
  let mockGetDisplayMedia;
  let mockGetUserMedia;

  beforeEach(() => {
    // Create mock MediaStream
    mockMediaStream = {
      getAudioTracks: jest.fn().mockReturnValue([
        { stop: jest.fn(), readyState: 'live' },
        { stop: jest.fn(), readyState: 'live' }
      ])
    };

    // Mock navigator.mediaDevices.getDisplayMedia
    mockGetDisplayMedia = jest.fn().mockResolvedValue(mockMediaStream);
    global.navigator = {
      mediaDevices: {
        getDisplayMedia: mockGetDisplayMedia
      }
    };

    // Mock navigator.mediaDevices.getUserMedia for microphone
    mockGetUserMedia = jest.fn().mockResolvedValue({
      getAudioTracks: jest.fn().mockReturnValue([
        { stop: jest.fn(), readyState: 'live' }
      ])
    });
    global.navigator.mediaDevices.getUserMedia = mockGetUserMedia;

    // Mock chrome.runtime
    global.chrome = {
      runtime: {
        sendMessage: jest.fn(),
        connect: jest.fn(),
        lastError: null
      },
      offscreen: {
        createDocument: jest.fn().mockResolvedValue(true)
      },
      tabs: {
        query: jest.fn()
      },
      alarms: {
        create: jest.fn(),
        onAlarm: { addListener: jest.fn() }
      },
      storage: {
        local: {
          get: jest.fn(),
          set: jest.fn(),
          remove: jest.fn()
        }
      }
    };
  });

  describe('getDisplayMedia capture', () => {
    test('getDisplayMedia is available as API', () => {
      expect(typeof navigator.mediaDevices.getDisplayMedia).toBe('function');
    });

    test('getDisplayMedia returns MediaStream with audio tracks', async () => {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, displaySurface: 'browser' },
        audio: true
      });
      expect(stream).toBeDefined();
      expect(stream.getAudioTracks).toBeDefined();
      const tracks = stream.getAudioTracks();
      expect(tracks.length).toBeGreaterThan(0);
    });

    test('getDisplayMedia constraints are correct for tab capture', async () => {
      await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1, displaySurface: 'browser' },
        audio: true
      });
      
      expect(mockGetDisplayMedia).toHaveBeenCalledWith({
        video: { width: 1, height: 1, displaySurface: 'browser' },
        audio: true
      });
    });

    test('getDisplayMedia handles user denial', async () => {
      mockGetDisplayMedia.mockRejectedValueOnce(new DOMException('Permission denied', 'NotAllowedError'));

      await expect(
        navigator.mediaDevices.getDisplayMedia({
          video: { width: 1, height: 1, displaySurface: 'browser' },
          audio: true
        })
      ).rejects.toThrow('Permission denied');
    });
  });

  describe('getUserMedia for microphone', () => {
    test('getUserMedia with mic constraints works', async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        },
        video: false
      });

      expect(stream).toBeDefined();
      expect(mockGetUserMedia).toHaveBeenCalled();
    });

    test('getUserMedia constraints disable audio processing', async () => {
      await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 44100
        },
        video: false
      });

      const callArgs = mockGetUserMedia.mock.calls[0][0];
      expect(callArgs.audio.echoCancellation).toBe(false);
      expect(callArgs.audio.noiseSuppression).toBe(false);
      expect(callArgs.audio.autoGainControl).toBe(false);
      expect(callArgs.audio.sampleRate).toBe(44100);
    });
  });

  describe('Stream validation', () => {
    test('stream has no audio tracks returns empty array', () => {
      const emptyStream = {
        getAudioTracks: jest.fn().mockReturnValue([])
      };
      const tracks = emptyStream.getAudioTracks();
      expect(tracks.length).toBe(0);
    });

    test('stream with audio tracks has correct structure', () => {
      const stream = mockMediaStream;
      const tracks = stream.getAudioTracks();
      
      expect(tracks).toHaveLength(2);
      expect(tracks[0].stop).toBeDefined();
      expect(tracks[0].readyState).toBe('live');
    });

    test('audio tracks can be stopped', () => {
      const stream = mockMediaStream;
      const tracks = stream.getAudioTracks();
      
      tracks.forEach(track => track.stop());
      
      tracks.forEach(track => {
        expect(track.stop).toHaveBeenCalled();
      });
    });
  });

  describe('Chrome API mocks', () => {
    test('chrome.runtime.sendMessage is defined', () => {
      expect(typeof chrome.runtime.sendMessage).toBe('function');
    });

    test('chrome.offscreen.createDocument resolves', async () => {
      const result = await chrome.offscreen.createDocument({
        justification: 'media_capture',
        reasons: ['USER_MEDIA'],
        url: 'offscreen.html'
      });
      expect(result).toBe(true);
    });
  });
});