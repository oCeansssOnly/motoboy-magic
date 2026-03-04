/**
 * backgroundTracking.ts
 * Utilities to help keep the browser process alive for geolocation tracking
 */

let wakeLock: any = null;
let audioContext: AudioContext | null = null;
let silentBuffer: AudioBuffer | null = null;
let audioSource: AudioBufferSourceNode | null = null;

/**
 * Requests a Wake Lock to keep the screen on, which prevents the browser from 
 * throttling the JS execution and geolocation.
 */
export async function requestWakeLock(): Promise<boolean> {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await (navigator as any).wakeLock.request('screen');
      
      wakeLock?.addEventListener('release', () => {
        // Silent release
      });
      return true;
    } catch (err: any) {
      console.error(`${err.name}, ${err.message}`);
      return false;
    }
  }
  return false;
}

/**
 * Releases the Wake Lock.
 */
export function releaseWakeLock() {
  if (wakeLock !== null) {
    wakeLock.release();
    wakeLock = null;
  }
}

/**
 * Plays a silent audio loop. This is a common hack to prevent iOS Safari 
 * from suspending the browser's background execution.
 */
export function startSilentAudio() {
  try {
    if (!audioContext) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    
    // Create a 1-second silent buffer
    if (!silentBuffer) {
      silentBuffer = audioContext.createBuffer(1, audioContext.sampleRate, audioContext.sampleRate);
    }
    
    if (audioSource) {
      audioSource.stop();
    }
    
    audioSource = audioContext.createBufferSource();
    audioSource.buffer = silentBuffer;
    const playOscillator = () => {
    if (!audioContext) return;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    // Inaudible high frequency
    osc.frequency.value = 20000;
    gain.gain.value = 0.001;
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    // Play for 100ms
    osc.start();
    osc.stop(audioContext.currentTime + 0.1);
  };
    audioSource.loop = true;
    audioSource.connect(audioContext.destination);
    audioSource.start();
    
    // iOS requires audio to be started from a user gesture.
    // This function should be called inside a click/button handler.
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
  } catch (err) {
    console.error('Failed to start silent audio:', err);
  }
}

/**
 * Stops the silent audio loop.
 */
export function stopSilentAudio() {
  if (audioSource) {
    audioSource.stop();
    audioSource = null;
  }
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
}
